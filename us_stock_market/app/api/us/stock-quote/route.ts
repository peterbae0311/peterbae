import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface YfChartMeta {
  symbol: string;
  shortName?: string;
  regularMarketPrice?: number;
  chartPreviousClose?: number;
  previousClose?: number;
  regularMarketChangePercent?: number;
}

async function fetchYfChart(ticker: string): Promise<YfChartMeta | null> {
  // interval=1m 으로 당일 인트라데이 데이터를 요청 → regularMarketPrice = 실시간 현재가
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1m&range=1d&includePrePost=false`;
  try {
    const res = await fetch(url, {
      cache: 'no-store',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        Accept: 'application/json',
      },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { chart?: { result?: [{ meta: YfChartMeta }] } };
    return data?.chart?.result?.[0]?.meta ?? null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get('ticker')?.trim().toUpperCase();

  if (!ticker) {
    return NextResponse.json({ error: 'ticker 파라미터가 필요합니다' }, { status: 400 });
  }

  try {
    const meta = await fetchYfChart(ticker);

    if (!meta || !meta.regularMarketPrice) {
      return NextResponse.json({ error: '종목 데이터를 찾을 수 없습니다' }, { status: 404 });
    }

    const price    = meta.regularMarketPrice;
    const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? 0;
    const changePct =
      meta.regularMarketChangePercent ??
      (prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0);

    return NextResponse.json({ ticker, price, changePct, prevClose });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
