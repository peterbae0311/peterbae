import { NextResponse } from 'next/server';
import { getAllSectorsWithStocks } from '@/lib/fmp';
import {
  insertAlertSession,
  insertSectorSnapshots,
  insertStockSummaries,
  getEasternTradeDate,
} from '@/lib/marketUtils';
import type { SessionType } from '@/lib/types';

export const dynamic = 'force-dynamic';

const SESSIONS: SessionType[] = ['daymarket', 'premarket', 'regular', 'aftermarket'];

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('authorization') ?? '';
    const cronSecret = process.env.CRON_SECRET ?? '';
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date') ?? getEasternTradeDate();

    // DELETE is skipped — anon key lacks permission.
    // Dashboard queries status='success', so new success rows take precedence
    // over any pre-existing skipped rows for the same date.
    //
    // NOTE: This seed endpoint intentionally uses a single FMP snapshot for all
    // 4 sessions. In production each cron job (daymarket/premarket/regular/aftermarket)
    // fires independently at its scheduled time, so each session gets real-time data
    // from that moment. The seed is only for manual testing/backfill — the identical
    // data across sessions is expected when seeding outside of live market hours.

    const sectors = await getAllSectorsWithStocks(10);

    for (const sessionType of SESSIONS) {
      const { sessionId } = await insertAlertSession({
        sessionType,
        tradeDate: date,
        status: 'success',
        telegramMsgId: null,
      });

      const allStocks = sectors.flatMap((s) =>
        s.stocks.map((stock) => ({
          ticker: stock.ticker,
          companyName: stock.companyName,
          sectorName: stock.sectorName,
          changePct: stock.changePct,
          priceChange: stock.priceChange,
          closePrice: stock.closePrice,
        })),
      );

      await Promise.all([
        insertSectorSnapshots(
          sessionId,
          sectors.map((s, idx) => ({
            sectorName: s.sectorName,
            changePct: s.changePct,
            rank: idx + 1,
            rawData: { stocks: s.stocks },
          })),
        ),
        insertStockSummaries(sessionId, allStocks),
      ]);
    }

    return NextResponse.json({
      success: true,
      date,
      sessions: SESSIONS,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
