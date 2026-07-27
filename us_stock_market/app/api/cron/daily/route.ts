/**
 * Daily data collection — 매일 07:00 KST (주식 개장일)
 * Cron (UTC): 0 22 * * 0-4  →  KST 월~금 07:00
 *
 * 4개 세션(데이마켓·프리마켓·정규장·애프터마켓) 데이터를 수집해 DB 저장.
 * Telegram 전송은 정규장(regular) 세션만 수행.
 */

import { NextResponse } from 'next/server';
import { handleCronSession, getEasternTradeDate } from '@/lib/marketUtils';
import { getAllSectorsWithStocks, getExchangeRate } from '@/lib/fmp';
import type { SessionType } from '@/lib/types';

export const dynamic = 'force-dynamic';

const SESSIONS: SessionType[] = ['daymarket', 'premarket', 'regular', 'aftermarket'];

export async function GET(request: Request) {
  const results = [];

  let preloadedSectors;
  let exchangeRate = 1380;
  try {
    [preloadedSectors, exchangeRate] = await Promise.all([
      getAllSectorsWithStocks(10),
      getExchangeRate(),
    ]);
  } catch (err) {
    console.error('[cron/daily] preload failed:', err);
  }

  for (const session of SESSIONS) {
    const result = await handleCronSession(request, session, preloadedSectors, exchangeRate);
    results.push({ session, ...result });

    // 인증 실패 시 즉시 중단
    if (!result.success && result.error === 'Invalid CRON_SECRET') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
  }

  const allSuccess = results.every(r => r.success);
  const tradeDate = results[0]?.data.tradeDate ?? getEasternTradeDate();
  const summary = results.map(r => ({
    session: r.session,
    status: r.data.status,
    reason: r.data.reason,
  }));

  return NextResponse.json(
    { success: allSuccess, tradeDate, sessions: summary },
    { status: allSuccess ? 200 : 207 },
  );
}
