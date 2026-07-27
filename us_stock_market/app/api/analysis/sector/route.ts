import { NextResponse } from 'next/server';
import { getTickerData } from '@/lib/fmp';
import { getEasternTradeDate } from '@/lib/marketUtils';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const SECTOR_ETF: Record<string, string> = {
  Technology: 'XLK',
  Healthcare: 'XLV',
  'Financial Services': 'XLF',
  'Consumer Cyclical': 'XLY',
  'Consumer Defensive': 'XLP',
  'Communication Services': 'XLC',
  Energy: 'XLE',
  Utilities: 'XLU',
  'Real Estate': 'XLRE',
  'Basic Materials': 'XLB',
  Industrials: 'XLI',
};

interface SectorAnalysis {
  today: string;
  shortTerm: string;
  longTerm: string;
  opportunities: string[];
  risks: string[];
  outlook: string;
  sources: string[];
}

interface StockSummaryRow {
  ticker: string;
  company_name: string;
  change_pct: number;
}

interface AlertSessionRow {
  id: string;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sectorName = searchParams.get('name');
    const date = searchParams.get('date') ?? getEasternTradeDate();

    if (!sectorName) {
      return NextResponse.json({ error: 'name 파라미터가 필요합니다' }, { status: 400 });
    }

    const etfTicker = SECTOR_ETF[sectorName];
    if (!etfTicker) {
      return NextResponse.json({ error: `알 수 없는 섹터: ${sectorName}` }, { status: 400 });
    }

    const [etfMeta, sessionResult] = await Promise.all([
      getTickerData(etfTicker),
      supabase
        .from('alert_sessions')
        .select('id')
        .eq('trade_date', date)
        .eq('status', 'success')
        .limit(1),
    ]);

    const changePct = etfMeta?.regularMarketChangePercent
      ?? (etfMeta?.chartPreviousClose && etfMeta?.regularMarketPrice
        ? ((etfMeta.regularMarketPrice - etfMeta.chartPreviousClose) / etfMeta.chartPreviousClose) * 100
        : 0);

    const sessionRows = sessionResult.data as AlertSessionRow[] | null;

    let stocksStr = '데이터 없음';
    if (sessionRows && sessionRows.length > 0) {
      const sessionId = sessionRows[0].id;
      const { data: stockRows } = await supabase
        .from('stock_summaries')
        .select('ticker, company_name, change_pct')
        .eq('session_id', sessionId)
        .eq('sector_name', sectorName)
        .limit(5) as { data: StockSummaryRow[] | null };

      if (stockRows && stockRows.length > 0) {
        stocksStr = stockRows
          .map((s) => `${s.ticker} (${s.company_name}) ${s.change_pct >= 0 ? '+' : ''}${s.change_pct.toFixed(2)}%`)
          .join(', ');
      }
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'OPENROUTER_API_KEY가 설정되지 않았습니다' }, { status: 500 });
    }

    const prompt = `당신은 전문 금융 애널리스트입니다. 아래 데이터를 바탕으로 ${sectorName} 섹터를 분석해주세요.

## 시장 데이터
- 날짜: ${date}
- 섹터 ETF (${etfTicker}): ${changePct > 0 ? '+' : ''}${changePct.toFixed(2)}%
- 주요 종목: ${stocksStr}

## 분석 요청 (JSON 형식으로 반환)
{
  "today": "당일 섹터 주요 흐름 요약 (2-3문장)",
  "shortTerm": "향후 3개월 전망 (2-3문장, 주요 촉매제 포함)",
  "longTerm": "향후 6개월 전망 (2-3문장, 구조적 트렌드 포함)",
  "opportunities": ["기회요인 1", "기회요인 2", "기회요인 3"],
  "risks": ["리스크 1", "리스크 2", "리스크 3"],
  "outlook": "bullish 또는 neutral 또는 bearish",
  "sources": ["참고 기관/보고서 1", "참고 기관/보고서 2"]
}

Goldman Sachs, JP Morgan, Morgan Stanley, Fed 등 신뢰할 수 있는 기관의 관점을 참고하여 분석하세요.
반드시 JSON만 반환하세요.`;

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      }),
      next: { revalidate: 0 },
    });

    const llmData = (await response.json()) as {
      choices?: Array<{ message: { content: string } }>;
      error?: { message: string };
    };

    if (!llmData.choices?.[0]) {
      throw new Error(llmData.error?.message ?? 'OpenRouter: no choices in response');
    }

    const raw = llmData.choices[0].message.content;
    const jsonStr = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const analysis = JSON.parse(jsonStr) as SectorAnalysis;

    return NextResponse.json({
      sectorName,
      etfTicker,
      changePct,
      date,
      analysis: {
        today: analysis.today,
        shortTerm: analysis.shortTerm,
        longTerm: analysis.longTerm,
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
