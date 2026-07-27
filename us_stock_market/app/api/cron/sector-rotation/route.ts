/**
 * Sector Rotation daily cron alert
 * Schedule (UTC): 30 7 * * 2-6  →  KST 16:30 화~토
 *   (US previous day close + KR current day close 이후)
 *
 * 1. Reuses sector-rotation logic directly (no internal HTTP round-trip)
 * 2. Assembles a Telegram message with US + KR momentum tables
 * 3. Sends via sendTelegramMessage
 */

import { NextResponse } from 'next/server';
import { sendTelegramMessage } from '@/lib/telegram';
import { getSupabaseClient } from '@/lib/supabase';
import { callLlm } from '@/lib/llm';

export const dynamic = 'force-dynamic';

// ── ETF definitions (same as sector-rotation route) ──────────────────────────

interface EtfDef {
  etf: string;
  name: string;
}

const US_ETFS: EtfDef[] = [
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
  rotationSignal: string;
  usAnalysis: string;
  krAnalysis: string;
  actionableInsight: string;
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

// ── Data helpers (duplicated from sector-rotation route for cron isolation) ───

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

    const ret1W = calcReturn(prices, 5);
    const ret1M = calcReturn(prices, 20);
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

async function fetchKrSectorMomentum(): Promise<SectorMomentum[]> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('kr_sector_snapshots')
    .select('sector_name, change_rate, trade_date')
    .gte('trade_date', new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10))
    .order('trade_date', { ascending: false });

  if (error || !data) return [];

  const byName: Record<string, KrSectorRow[]> = {};
  for (const row of data as KrSectorRow[]) {
    if (!byName[row.sector_name]) byName[row.sector_name] = [];
    byName[row.sector_name].push(row);
  }

  const result: SectorMomentum[] = [];

  for (const [sector, rows] of Object.entries(byName)) {
    const sum = (arr: KrSectorRow[]): number =>
      arr.reduce((acc, r) => acc + (r.change_rate ?? 0), 0);

    const ret1W = sum(rows.slice(0, 5));
    const ret1M = sum(rows.slice(0, 20));
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

async function analyzeRotation(
  usTop5: EtfMomentum[],
  krTop5: SectorMomentum[],
): Promise<LlmAnalysis> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set');

  const usLines = usTop5
    .map(
      (e, i) =>
        `${i + 1}. ${e.name} (${e.etf})  1W: ${e.momentum1W >= 0 ? '+' : ''}${e.momentum1W}%  1M: ${e.momentum1M >= 0 ? '+' : ''}${e.momentum1M}%  Score: ${e.score >= 0 ? '+' : ''}${e.score}`,
    )
    .join('\n');

  const krLines = krTop5.length > 0
    ? krTop5
        .map(
          (s, i) =>
            `${i + 1}. ${s.sector}  1W: ${s.momentum1W >= 0 ? '+' : ''}${s.momentum1W}%  1M: ${s.momentum1M >= 0 ? '+' : ''}${s.momentum1M}%  Score: ${s.score >= 0 ? '+' : ''}${s.score}`,
        )
        .join('\n')
    : '(데이터 없음)';

  const prompt = `당신은 글로벌 주식 시장의 섹터 로테이션(자금 이동)을 분석하는 전문 퀀트 애널리스트입니다.
아래 데이터를 기반으로 현재 시장의 섹터 로테이션 신호를 분석하세요.

## 미국 섹터/테마 ETF — 모멘텀 상위 5 (Score = 1W수익률 - 1M수익률/4, 양수=가속)
${usLines}

## 한국 업종 — 모멘텀 상위 5
${krLines}

## 출력 형식 (JSON만 반환, 설명 없이)
{
  "rotationSignal": "한 문장 요약. 예: '반도체에서 로보틱스/AI로 자금 이동 포착'",
  "usAnalysis": "미국 섹터 로테이션 2-3문장. 구체적 ETF 티커와 수익률 수치 반드시 포함",
  "krAnalysis": "한국 업종 로테이션 2-3문장. 구체적 업종명과 수치 반드시 포함",
  "actionableInsight": "투자자 관점에서 주목할 섹터/업종과 이유 1-2문장",
  "confidence": "high 또는 medium 또는 low"
}

JSON 외 다른 텍스트 절대 출력 금지.`;

  const { content: jsonStr } = await callLlm(apiKey, prompt);
  return JSON.parse(jsonStr) as LlmAnalysis;
}

// ── Message formatters ────────────────────────────────────────────────────────

function fmtPct(value: number): string {
  return value >= 0 ? `+${value.toFixed(2)}%` : `${value.toFixed(2)}%`;
}

function fmtScore(value: number): string {
  return value >= 0 ? `▲` : `▼`;
}

function buildUsSection(
  gainers: EtfMomentum[],
  losers: EtfMomentum[],
): string {
  let s = `🇺🇸 *미국 섹터*\n\n`;

  s += `📈 *모멘텀 가속 (상위 5)*\n`;
  gainers.forEach((e, i) => {
    s += `${i + 1}. ${e.name} (${e.etf})  1W: ${fmtPct(e.momentum1W)}  1M: ${fmtPct(e.momentum1M)}  ${fmtScore(e.score)}\n`;
  });

  s += `\n📉 *모멘텀 감속 (하위 5)*\n`;
  losers.forEach((e, i) => {
    s += `${i + 1}. ${e.name} (${e.etf})  1W: ${fmtPct(e.momentum1W)}  1M: ${fmtPct(e.momentum1M)}  ${fmtScore(e.score)}\n`;
  });

  return s;
}

function buildKrSection(
  gainers: SectorMomentum[],
  losers: SectorMomentum[],
): string {
  if (gainers.length === 0 && losers.length === 0) {
    return `🇰🇷 *한국 업종*\n\n(데이터 없음)\n`;
  }

  let s = `🇰🇷 *한국 업종*\n\n`;

  s += `📈 *모멘텀 가속 상위 5*\n`;
  gainers.forEach((sec, i) => {
    s += `${i + 1}. ${sec.sector}  1W: ${fmtPct(sec.momentum1W)}  1M: ${fmtPct(sec.momentum1M)}  ${fmtScore(sec.score)}\n`;
  });

  s += `\n📉 *모멘텀 감속 하위 5*\n`;
  losers.forEach((sec, i) => {
    s += `${i + 1}. ${sec.sector}  1W: ${fmtPct(sec.momentum1W)}  1M: ${fmtPct(sec.momentum1M)}  ${fmtScore(sec.score)}\n`;
  });

  return s;
}

function getKstDateLabel(): string {
  const fmt = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });
  return fmt.format(new Date()).replace(/^\d{4}년\s*/, '');
}

function confidenceLabel(c: string): string {
  if (c === 'high')   return '높음';
  if (c === 'medium') return '보통';
  return '낮음';
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(request: Request): Promise<NextResponse> {
  // CRON_SECRET auth check
  const cronSecret = process.env.CRON_SECRET ?? '';
  if (cronSecret) {
    const auth = request.headers.get('authorization') ?? '';
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    // 1. US ETF momentum
    const etfResults = await Promise.all(US_ETFS.map(fetchEtfMomentum));
    const validEtfs = etfResults.filter((e): e is EtfMomentum => e !== null);
    const sortedEtfs = [...validEtfs].sort((a, b) => b.score - a.score);
    const usTopGainers = sortedEtfs.slice(0, 5);
    const usTopLosers  = sortedEtfs.slice(-5).reverse();

    // 2. KR sector momentum (graceful degradation)
    let krTopGainers: SectorMomentum[] = [];
    let krTopLosers: SectorMomentum[]  = [];

    try {
      const krData = await fetchKrSectorMomentum();
      const sortedKr = [...krData].sort((a, b) => b.score - a.score);
      krTopGainers = sortedKr.slice(0, 5);
      krTopLosers  = sortedKr.slice(-5).reverse();
    } catch {
      // KR data unavailable — continue with US only
    }

    // 3. LLM analysis
    const analysis = await analyzeRotation(usTopGainers, krTopGainers);

    // 4. Assemble Telegram message
    const dateLabel = getKstDateLabel();

    let msg = `📊 *섹터 로테이션 신호* | ${dateLabel}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `🔄 ${analysis.rotationSignal}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    msg += buildUsSection(usTopGainers, usTopLosers);
    msg += `\n━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    msg += buildKrSection(krTopGainers, krTopLosers);
    msg += `\n━━━━━━━━━━━━━━━━━━━━━━\n`;

    msg += `💡 ${analysis.actionableInsight}\n`;
    msg += `🎯 *신뢰도:* ${confidenceLabel(analysis.confidence)}`;

    const result = await sendTelegramMessage(msg);

    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message_id: result.message_id,
      rotationSignal: analysis.rotationSignal,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
