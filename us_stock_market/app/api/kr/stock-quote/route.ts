import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
  Accept: 'application/json',
  Referer: 'https://finance.naver.com/',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
};

interface NaverPollingResult {
  closePrice?: string;
  fluctuationAmount?: string;
  fluctuationsRatio?: string;
  stockName?: string;
}

interface NaverBasicResult {
  closePrice?: string;
  fluctuationsRatio?: string;
  stockName?: string;
}

function toNum(s: unknown): number {
  if (typeof s !== 'string' && typeof s !== 'number') return 0;
  const n = parseFloat(String(s).replace(/,/g, '').replace(/\+/g, ''));
  return isNaN(n) ? 0 : n;
}

async function fetchPollingPrice(code: string): Promise<{ price: number; changeRate: number; changeAmount: number } | null> {
  try {
    const res = await fetch(
      `https://polling.finance.naver.com/api/realtime/domestic/stock/${code}`,
      { cache: 'no-store', headers: HEADERS },
    );
    if (!res.ok) return null;

    const data = (await res.json()) as { result?: NaverPollingResult; datas?: NaverPollingResult[] };

    // 응답 구조가 { result: {...} } 또는 { datas: [{...}] } 형태
    const item: NaverPollingResult | undefined = data?.result ?? data?.datas?.[0];
    if (!item) return null;

    const price = toNum(item.closePrice);
    if (price === 0) return null;

    return {
      price,
      changeRate: toNum(item.fluctuationsRatio),
      changeAmount: toNum(item.fluctuationAmount),
    };
  } catch {
    return null;
  }
}

async function fetchBasicPrice(code: string): Promise<{ price: number; changeRate: number; changeAmount: number } | null> {
  try {
    const res = await fetch(
      `https://m.stock.naver.com/api/stock/${code}/basic`,
      { cache: 'no-store', headers: HEADERS },
    );
    if (!res.ok) return null;

    const data = (await res.json()) as NaverBasicResult;
    const price = toNum(data.closePrice);
    if (price === 0) return null;

    return {
      price,
      changeRate: toNum(data.fluctuationsRatio),
      changeAmount: 0,
    };
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code')?.trim();

  if (!code || !/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: '유효한 6자리 종목코드가 필요합니다' }, { status: 400 });
  }

  // 폴링 API(실시간) → 기본 API 순으로 시도
  const result = (await fetchPollingPrice(code)) ?? (await fetchBasicPrice(code));

  if (!result) {
    return NextResponse.json({ error: '가격 정보를 불러올 수 없습니다' }, { status: 502 });
  }

  return NextResponse.json({ code, ...result });
}
