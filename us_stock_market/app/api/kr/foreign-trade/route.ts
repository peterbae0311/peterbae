import { NextResponse } from 'next/server';
import { getForeignTradeRanking } from '@/lib/naverFinance';

export const dynamic = 'force-dynamic';

/**
 * GET /api/kr/foreign-trade
 *
 * Returns NAVER Finance 외국인 순매수/순매도 KOSPI top-30 rankings,
 * scraped live with no caching.
 *
 * Response (success):
 *   {
 *     buyTop   : TradeStock[],   // 외국인 순매수 상위 30
 *     sellTop  : TradeStock[],   // 외국인 순매도 상위 30
 *     fetchedAt: string          // ISO 8601 timestamp
 *   }
 *
 * Response (error):
 *   { buyTop: [], sellTop: [], error: string }
 */
export async function GET() {
  try {
    const data = await getForeignTradeRanking();

    return NextResponse.json({
      buyTop: data.buyTop,
      sellTop: data.sellTop,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { buyTop: [], sellTop: [], error: message },
      { status: 500 },
    );
  }
}
