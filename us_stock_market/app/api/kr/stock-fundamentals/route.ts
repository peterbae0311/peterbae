import { NextResponse } from 'next/server';
import { fetchKrStockFundamentals } from '@/lib/naverFinance';

export const dynamic = 'force-dynamic';

/**
 * GET /api/kr/stock-fundamentals?code=005930
 *
 * NAVER Finance에서 실시간 스크래핑:
 *   - 투자자별 매매동향 (외국인 / 기관 / 개인)
 *   - PER
 *   - 최근 실적 (매출액, 영업이익) + 전년 비교
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');

  if (!code || !/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: '유효한 6자리 종목코드가 필요합니다' }, { status: 400 });
  }

  try {
    const data = await fetchKrStockFundamentals(code);
    return NextResponse.json({ ...data, fetchedAt: new Date().toISOString() });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: message, per: null, investorTrend: null, latestEarnings: null, prevEarnings: null },
      { status: 500 },
    );
  }
}
