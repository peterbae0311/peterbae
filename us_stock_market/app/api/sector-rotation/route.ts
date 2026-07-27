/**
 * Sector Rotation API
 * GET /api/sector-rotation
 *
 * Fetches US ETF momentum data from Yahoo Finance and KR sector data from
 * Supabase, then calls OpenRouter GPT-4o-mini for rotation analysis.
 *
 * Momentum score = 1W return − (1M return / 4)
 *   Positive  → accelerating momentum
 *   Negative  → decelerating momentum
 */

import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// ── ETF definitions ───────────────────────────────────────────────────────────

interface EtfDef {
  etf: string;
  name: string;
}

const US_ETFS: EtfDef[] = [
  // Standard sectors (SPDR)
  { etf: 'XLK',  name: 'Technology' },
  { etf: 'XLC',  name: 'Communication Services' },
  { etf: 'XLV',  name: 'Healthcare' },
  { etf: 'XLF',  name: 'Financials' },
  { etf: 'XLY',  name: 'Consumer Cyclical' },
  { etf: 'XLP',  name: 'Consumer Defensive' },
  { etf: 'XLE',  name: 'Energy' },
  { etf: 'XLI',  name: 'Industrials' },
  { etf: 'XLU',  name: 'Utilities' },
  { etf: 'XLRE', name: 'Real Estate' },
  { etf: 'XLB',  name: 'Materials' },
  // Thematic
  { etf: 'SOXX', name: '반도체 (SOXX)' },
  { etf: 'SMH',  name: '반도체 (SMH)' },
  { etf: 'ROBO', name: '로보틱스' },
  { etf: 'BOTZ', name: '로보틱스/AI' },
  { etf: 'ARKQ', name: '자율기술 (ARKQ)' },
  { etf: 'XBI',  name: '바이오텍' },
  { etf: 'ARKK', name: '혁신기술 (ARKK)' },
  { etf: 'KWEB', name: '중국인터넷' },
];

// ── Types ─────────────────────────────────────────────────────────────────────

interface EtfMomentum {
  etf: string;
  name: string;
  momentum1W: number;
  momentum1M: number;
  score: number;
}

interface SectorMomentum {
  sector: string;
  momentum1W: number;
  momentum1M: number;
  score: number;
}

interface LlmAnalysis {
  usRotationSignal: string;
  krRotationSignal: string;
  usAnalysis: string;
  krAnalysis: string;
  usActionableInsight: string;
  krActionableInsight: string;
  confidence: 'high' | 'medium' | 'low';
}

interface YahooChartResponse {
  chart?: {
    result?: Array<{
      timestamp?: number[];
      indicators?: {
        adjclose?: Array<{ adjclose?: (number | null)[] }>;
      };
    }>;
  };
}

interface KrSectorRow {
  sector_name: string;
  change_rate: number;
  trade_date: string;
}

// ── Yahoo Finance fetch ───────────────────────────────────────────────────────

async function fetchEtfPrices(etf: string): Promise<number[]> {
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${etf}` +
    `?interval=1d&range=1mo`;

  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    cache: 'no-store',
  });

  if (!res.ok) return [];

  const data = (await res.json()) as YahooChartResponse;
  const closes =
    data?.chart?.result?.[0]?.indicators?.adjclose?.[0]?.adjclose ?? [];

  // Filter out nulls; keep only valid price points
  return closes.filter((v): v is number => v !== null && v !== undefined);
}

function calcReturn(prices: number[], periodDays: number): number {
  if (prices.length < 2) return 0;
  const end = prices[prices.length - 1];
  const startIdx = Math.max(0, prices.length - 1 - periodDays);
  const start = prices[startIdx];
  if (start === 0) return 0;
  return ((end - start) / start) * 100;
}

async function fetchEtfMomentum(def: EtfDef): Promise<EtfMomentum | null> {
  try {
    const prices = await fetchEtfPrices(def.etf);
    if (prices.length < 5) return null;

    const ret1W = calcReturn(prices, 5);   // 5 trading days
    const ret1M = calcReturn(prices, 20);  // 20 trading days
    const score = ret1W - ret1M / 4;

    return {
      etf: def.etf,
      name: def.name,
      momentum1W: parseFloat(ret1W.toFixed(2)),
      momentum1M: parseFloat(ret1M.toFixed(2)),
      score: parseFloat(score.toFixed(2)),
    };
  } catch {
    return null;
  }
}

// ── Supabase KR sector fetch ──────────────────────────────────────────────────

async function fetchKrSectorMomentum(): Promise<SectorMomentum[]> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('kr_sector_snapshots')
    .select('sector_name, change_rate, trade_date')
    .gte('trade_date', new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10))
    .order('trade_date', { ascending: false });

  if (error || !data) return [];

  // Group by sector
  const byName: Record<string, KrSectorRow[]> = {};
  for (const row of data as KrSectorRow[]) {
    if (!byName[row.sector_name]) byName[row.sector_name] = [];
    byName[row.sector_name].push(row);
  }

  const result: SectorMomentum[] = [];

  for (const [sector, rows] of Object.entries(byName)) {
    // rows are already sorted descending by trade_date
    const latest5  = rows.slice(0, 5);   // 1W  (5 most recent trading days)
    const latest20 = rows.slice(0, 20);  // 1M

    const sum = (arr: KrSectorRow[]): number =>
      arr.reduce((acc, r) => acc + (r.change_rate ?? 0), 0);

    const ret1W = sum(latest5);
    const ret1M = sum(latest20);
    const score = ret1W - ret1M / 4;

    result.push({
      sector,
      momentum1W: parseFloat(ret1W.toFixed(2)),
      momentum1M: parseFloat(ret1M.toFixed(2)),
      score: parseFloat(score.toFixed(2)),
    });
  }

  return result;
}

// ── LLM model fallback list (free reasoning models, best-rated first) ─────────

// 추론(Thinking) 모델 우선 → 대형 일반 모델 순차 폴백
// OpenRouter 실제 가용 모델 기준 (2025-05 확인)
const REASONING_MODELS: { id: string; label: string; cutoff: string }[] = [
  // ── Thinking / Reasoning 모델 ──────────────────────────────────────────
  { id: 'arcee-ai/trinity-large-thinking:free',               label: 'Arcee Trinity Large Thinking (free)', cutoff: '2025년 초' },
  { id: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free', label: 'NVIDIA Nemotron Reasoning 30B (free)', cutoff: '2024년 하반기' },
  { id: 'liquid/lfm-2.5-1.2b-thinking:free',                 label: 'LiquidAI LFM2.5 Thinking (free)',      cutoff: '2024년' },
  // ── 대형 일반 모델 (폴백) ──────────────────────────────────────────────
  { id: 'deepseek/deepseek-v4-flash:free',                    label: 'DeepSeek V4 Flash (free)',             cutoff: '2025년 초' },
  { id: 'qwen/qwen3-coder:free',                              label: 'Qwen3 Coder 480B (free)',              cutoff: '2025년 1월' },
  { id: 'nvidia/nemotron-3-super-120b-a12b:free',             label: 'NVIDIA Nemotron Super 120B (free)',    cutoff: '2024년 하반기' },
  { id: 'qwen/qwen3-next-80b-a3b-instruct:free',              label: 'Qwen3 Next 80B (free)',                cutoff: '2025년 1월' },
  { id: 'openai/gpt-oss-120b:free',                           label: 'OpenAI OSS 120B (free)',               cutoff: '2024년' },
  { id: 'meta-llama/llama-3.3-70b-instruct:free',             label: 'Llama 3.3 70B (free)',                 cutoff: '2023년 12월' },
];

function isRetryableError(msg: string): boolean {
  const lower = msg.toLowerCase();
  return (
    lower.includes('rate limit') ||
    lower.includes('ratelimit') ||
    lower.includes('too many requests') ||
    lower.includes('credits') ||
    lower.includes('quota') ||
    lower.includes('capacity') ||
    lower.includes('no endpoints found') ||
    lower.includes('service unavailable') ||
    lower.includes('overloaded')
  );
}

function extractJson(raw: string): string {
  // 1) Strip DeepSeek/reasoning <think>...</think> blocks
  const withoutThink = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  // 2) Strip markdown code fences
  return withoutThink.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
}

// ── LLM analysis ──────────────────────────────────────────────────────────────

async function analyzeRotation(
  usTop5: EtfMomentum[],
  krTop5: SectorMomentum[],
): Promise<{ analysis: LlmAnalysis; modelLabel: string; modelCutoff: string }> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set');

  const usLines = usTop5
    .map(
      (e, i) =>
        `${i + 1}. ${e.name} (${e.etf})  1W: ${e.momentum1W >= 0 ? '+' : ''}${e.momentum1W}%  1M: ${e.momentum1M >= 0 ? '+' : ''}${e.momentum1M}%  Score: ${e.score >= 0 ? '+' : ''}${e.score}`,
    )
    .join('\n');

  const krLines = krTop5
    .map(
      (s, i) =>
        `${i + 1}. ${s.sector}  1W: ${s.momentum1W >= 0 ? '+' : ''}${s.momentum1W}%  1M: ${s.momentum1M >= 0 ? '+' : ''}${s.momentum1M}%  Score: ${s.score >= 0 ? '+' : ''}${s.score}`,
    )
    .join('\n');

  const prompt = `당신은 글로벌 주식 시장의 섹터 로테이션(자금 이동)을 분석하는 전문 퀀트 애널리스트입니다.
아래 데이터를 기반으로 미국과 한국 시장 각각의 섹터 로테이션 신호를 독립적으로 분석하세요.

## 미국 섹터/테마 ETF — 모멘텀 상위 5 (Score = 1W수익률 - 1M수익률/4, 양수=가속)
${usLines}

## 한국 업종 — 모멘텀 상위 5
${krLines}

## 출력 형식 (JSON만 반환, 설명 없이)
{
  "usRotationSignal": "미국 시장 한 문장 요약. 예: 'XLE 에너지 섹터로 자금 가속 유입 중' 또는 '반도체에서 방어주로 로테이션 진행'",
  "krRotationSignal": "한국 시장 한 문장 요약. 예: '전자제품·소프트웨어 중심 성장주로 자금 집중' 또는 '수출주에서 내수주로 전환 신호'",
  "usAnalysis": "미국 섹터 로테이션 2-3문장. 구체적 ETF 티커와 수익률 수치 반드시 포함",
  "krAnalysis": "한국 업종 로테이션 2-3문장. 구체적 업종명과 수치 반드시 포함",
  "usActionableInsight": "미국 시장 투자자 관점에서 주목할 ETF·섹터와 이유 1-2문장",
  "krActionableInsight": "한국 시장 투자자 관점에서 주목할 업종과 이유 1-2문장",
  "confidence": "high 또는 medium 또는 low (데이터 신뢰도 기반)"
}

추가 규칙:
- JSON 외 다른 텍스트 절대 출력 금지.
- 미국과 한국 분석은 반드시 서로 다른 내용으로 작성.
- confidence는 데이터 일관성(미국/한국 신호가 같은 방향이면 high, 혼재면 medium, 데이터 부족이면 low)으로 판단.`;

  let lastError = '';

  for (const model of REASONING_MODELS) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: model.id,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 3000,
        }),
        cache: 'no-store',
      });

      const llmData = (await res.json()) as {
        choices?: Array<{ message: { content: string } }>;
        error?: { message: string };
      };

      // API 레벨 오류(모델 없음, 크레딧 부족, 레이트리밋 등) → 다음 모델 시도
      if (!llmData.choices?.[0]) {
        lastError = `[${model.label}] ${llmData.error?.message ?? 'no choices'}`;
        continue;
      }

      const raw = llmData.choices[0].message.content;
      const jsonStr = extractJson(raw);
      const analysis = JSON.parse(jsonStr) as LlmAnalysis;

      return { analysis, modelLabel: model.label, modelCutoff: model.cutoff };
    } catch (err) {
      lastError = `[${model.label}] ${err instanceof Error ? err.message : String(err)}`;
      continue;
    }
  }

  throw new Error(`모든 무료 추론 모델에서 실패: ${lastError}`);
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(): Promise<NextResponse> {
  try {
    // 1. Fetch all US ETF momentum data in parallel
    const etfResults = await Promise.all(US_ETFS.map(fetchEtfMomentum));
    const validEtfs = etfResults.filter((e): e is EtfMomentum => e !== null);

    const sortedEtfs = [...validEtfs].sort((a, b) => b.score - a.score);
    const usTopGainers = sortedEtfs.slice(0, 5);
    const usTopLosers  = sortedEtfs.slice(-5).reverse();

    // 2. Fetch KR sector momentum from Supabase (graceful degradation on failure)
    let krTopGainers: SectorMomentum[] = [];
    let krTopLosers: SectorMomentum[]  = [];

    try {
      const krData = await fetchKrSectorMomentum();
      const sortedKr = [...krData].sort((a, b) => b.score - a.score);
      krTopGainers = sortedKr.slice(0, 5);
      krTopLosers  = sortedKr.slice(-5).reverse();
    } catch {
      // KR data unavailable — US-only analysis continues
    }

    // 3. LLM analysis using top gainers from both markets
    const { analysis, modelLabel, modelCutoff } = await analyzeRotation(usTopGainers, krTopGainers);

    return NextResponse.json({
      success: true,
      data: {
        us: { topGainers: usTopGainers, topLosers: usTopLosers },
        kr: { topGainers: krTopGainers, topLosers: krTopLosers },
        analysis,
        model: modelLabel,
        modelCutoff,
        fetchedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
