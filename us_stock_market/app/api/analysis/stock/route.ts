import { NextResponse } from 'next/server';
import { getTickerData } from '@/lib/fmp';
import { getEasternTradeDate } from '@/lib/marketUtils';
import { callLlm, modelDisplayLabel } from '@/lib/llm';

export const dynamic = 'force-dynamic';

interface QuoteSummaryResult {
  financialData?: {
    targetMeanPrice?: { raw?: number };
    recommendationKey?: string;
  };
  defaultKeyStatistics?: {
    forwardEps?: { raw?: number };
    trailingPE?: { raw?: number };
  };
  earningsTrend?: {
    trend?: Array<{
      earningsEstimate?: { avg?: { raw?: number } };
    }>;
  };
}

interface QuoteSummaryResponse {
  quoteSummary?: {
    result?: QuoteSummaryResult[];
  };
}

interface StockAnalysis {
  companyOverview: string;
  companyGuidance: string;
  shortTerm: string;
  longTerm: string;
  targetPriceRange: {
    low: number;
    consensus: number;
    high: number;
  };
  opportunities: string[];
  risks: string[];
  outlook: string;
  sources: string[];
}

async function fetchQuoteSummary(ticker: string): Promise<QuoteSummaryResult | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=financialData,defaultKeyStatistics,earningsTrend`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      next: { revalidate: 0 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as QuoteSummaryResponse;
    return data?.quoteSummary?.result?.[0] ?? null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const ticker = searchParams.get('ticker');
    const date = searchParams.get('date') ?? getEasternTradeDate();

    if (!ticker) {
      return NextResponse.json({ error: 'ticker 파라미터가 필요합니다' }, { status: 400 });
    }

    const [meta, quoteSummary] = await Promise.all([
      getTickerData(ticker),
      fetchQuoteSummary(ticker),
    ]);

    const closePrice = meta?.regularMarketPrice ?? 0;
    const prevClose  = meta?.chartPreviousClose ?? meta?.previousClose ?? 0;
    const changePct  =
      meta?.regularMarketChangePercent ??
      (prevClose > 0 && closePrice > 0 ? ((closePrice - prevClose) / prevClose) * 100 : 0);
    const companyName = meta?.shortName ?? ticker;

    const targetPrice = quoteSummary?.financialData?.targetMeanPrice?.raw ?? null;
    const recommendation = quoteSummary?.financialData?.recommendationKey ?? null;
    const forwardEps = quoteSummary?.defaultKeyStatistics?.forwardEps?.raw ?? null;
    const pe = quoteSummary?.defaultKeyStatistics?.trailingPE?.raw ?? null;

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'OPENROUTER_API_KEY가 설정되지 않았습니다' }, { status: 500 });
    }

    const marketDataLines: string[] = [
      `현재가: $${closePrice.toFixed(2)} (${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%)`,
    ];
    if (targetPrice != null) marketDataLines.push(`애널리스트 목표가 평균: $${targetPrice.toFixed(2)}`);
    if (recommendation) marketDataLines.push(`투자의견: ${recommendation}`);
    if (pe != null) marketDataLines.push(`P/E 비율: ${pe.toFixed(1)}`);
    if (forwardEps != null) marketDataLines.push(`Forward EPS: $${forwardEps.toFixed(2)}`);
    const marketDataStr = marketDataLines.join('\n');

    const prompt = `당신은 전문 기업 분석 애널리스트입니다.
분석 대상: ${ticker} (${companyName})
${marketDataStr}

## 작성 원칙 (반드시 준수)
1. 모든 내용은 반드시 **${ticker}에만 해당하는 사실**이어야 합니다.
2. 다른 회사의 수치·사례를 ${ticker}에 혼용하지 마세요.
3. 구체적 수치는 실제 공시·IR·애널리스트 보고서 기반으로 작성하고, 불확실한 수치에는 "약", "추정" 단서를 붙이세요.
4. "글로벌 경기 불확실성", "금리 리스크", "시장 변동성" 같은 일반론 표현은 절대 사용 금지.
5. risks와 opportunities는 ${ticker}의 사업 구조, 경쟁사, 고객사, 제품 라인업에 특정된 내용으로 작성.

## 출력 형식 (JSON만 반환, 설명 없이)
{
  "companyOverview": "${ticker}의 주요 사업 영역, 시장 내 위치, 핵심 제품·서비스를 2-3문장으로 설명",
  "companyGuidance": "${ticker} 경영진이 최근 실적발표에서 제시한 매출·마진·성장 목표 등 구체적 수치 포함 2-3문장",
  "shortTerm": "${ticker}의 향후 3개월 실적 및 주가 전망. 예정된 실적발표·제품출시·수주 이벤트 언급. 2-3문장",
  "longTerm": "${ticker}의 향후 6개월 실적 및 주가 전망. 구조적 성장 동력과 목표주가 근거 포함. 2-3문장",
  "targetPriceRange": {
    "low": 달러 정수,
    "consensus": 달러 정수,
    "high": 달러 정수
  },
  "opportunities": [
    "${ticker}의 기회요인 1: 핵심 성장 동력. ${ticker} 고유의 시장 규모·수주·점유율 등 구체적 수치 포함",
    "${ticker}의 기회요인 2: 동종업계 대비 ${ticker}만의 경쟁 우위 또는 기술·제품 차별화 요소",
    "${ticker}의 기회요인 3: ${ticker}이 수혜를 받는 정책·규제·산업 트렌드, 구체적 수치 포함"
  ],
  "risks": [
    "${ticker}의 리스크 1: 현재 가장 큰 실적 하방 압력. ${ticker}의 주요 고객사·매출 비중·금액 명시",
    "${ticker}의 리스크 2: ${ticker}의 원가·경쟁·환율 관련 수익성 리스크. 현재 수준과 영향도 명시",
    "${ticker}의 리스크 3: ${ticker}과 관련된 규제·소송·기술 전환 리스크"
  ],
  "outlook": "bullish 또는 neutral 또는 bearish",
  "sources": ["Goldman Sachs", "JP Morgan", "Morgan Stanley", "Citi" 중 실제 커버하는 기관]
}

추가 규칙:
- 모든 텍스트 필드는 반드시 한국어로 작성. 영어·중국어·일본어 사용 금지.
- targetPriceRange의 low/consensus/high는 반드시 달러 정수.
- opportunities와 risks는 각각 정확히 3개.
- JSON 외 다른 텍스트 절대 출력 금지.`;

    const { content: jsonStr, model: usedModel } = await callLlm(apiKey, prompt);
    const analysis = JSON.parse(jsonStr) as StockAnalysis;

    const tpr = analysis.targetPriceRange;
    const targetPriceRange = (
      tpr &&
      typeof tpr.low === 'number' &&
      typeof tpr.consensus === 'number' &&
      typeof tpr.high === 'number'
    ) ? tpr : null;

    return NextResponse.json({
      ticker,
      companyName,
      date,
      closePrice,
      changePct,
      model: modelDisplayLabel(usedModel),
      modelCutoff: usedModel.cutoff,
      marketData: {
        targetPrice: targetPrice ?? null,
        pe: pe ?? null,
        forwardEps: forwardEps ?? null,
        recommendation: recommendation ?? null,
      },
      analysis: {
        companyOverview: analysis.companyOverview ?? '',
        companyGuidance: analysis.companyGuidance,
        shortTerm: analysis.shortTerm,
        longTerm: analysis.longTerm,
        targetPriceRange,
        opportunities: analysis.opportunities ?? [],
        risks: analysis.risks ?? [],
        outlook: analysis.outlook ?? 'neutral',
        sources: analysis.sources ?? [],
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: '분석 생성 실패', details: message }, { status: 500 });
  }
}
