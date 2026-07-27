/**
 * Market utility functions:
 * - Trading date helpers (EDT/EST → date string)
 * - NYSE holiday / market-open check via FMP
 * - Duplicate alert guard via Supabase
 * - Common cron session handler
 */

import { supabase } from './supabase';
import { isMarketOpen, getAllSectorsWithStocks, type SectorWithStocks } from './fmp';
import { sendTelegramMessage, buildMarketMessage } from './telegram';
import type { SessionType } from './types';

// ── Date helpers ──────────────────────────────────────────────────────────────

/**
 * Returns the US Eastern trade date as 'YYYY-MM-DD'.
 * NYSE trades are attributed to Eastern time.
 * We subtract an offset from UTC so that:
 *   - EDT (UTC-4): subtract 4h
 *   - EST (UTC-5): subtract 5h
 * For simplicity we use America/New_York via Intl.DateTimeFormat.
 */
export function getEasternTradeDate(now = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(now); // returns 'YYYY-MM-DD'
}

/**
 * Returns a KST timestamp label, e.g. '06:05 KST'.
 */
export function getKstTimeLabel(now = new Date()): string {
  const formatter = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return `${formatter.format(now)} KST`;
}

/**
 * Returns a Korean date label, e.g. '5월 8일 (목)'.
 */
export function getKoreanDateLabel(now = new Date()): string {
  const formatter = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'America/New_York',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });
  // formatter produces e.g. '2026년 5월 8일 (목)' — trim year
  const full = formatter.format(now);
  // Remove year portion: '2026년 ' prefix
  return full.replace(/^\d{4}년\s*/, '');
}

// ── Duplicate-send guard ──────────────────────────────────────────────────────

/**
 * Returns true if an alert_session row already exists for this date+session.
 */
export async function isDuplicateSession(
  sessionType: SessionType,
  tradeDate: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('alert_sessions')
    .select('id')
    .eq('session_type', sessionType)
    .eq('trade_date', tradeDate)
    .in('status', ['success', 'skipped'])
    .maybeSingle();

  if (error) {
    console.error('[marketUtils] isDuplicateSession error:', error.message);
    // On DB error, be conservative: do not skip
    return false;
  }

  return data !== null;
}

// ── Persist session result ────────────────────────────────────────────────────

export interface SessionInsertResult {
  sessionId: string;
}

export async function insertAlertSession(params: {
  sessionType: SessionType;
  tradeDate: string;
  status: 'success' | 'failed' | 'skipped';
  telegramMsgId?: number | null;
  upsert?: boolean;
}): Promise<SessionInsertResult> {
  const row = {
    session_type: params.sessionType,
    trade_date: params.tradeDate,
    sent_at: new Date().toISOString(),
    status: params.status,
    telegram_msg_id: params.telegramMsgId ?? null,
  };

  const baseQuery = params.upsert
    ? supabase.from('alert_sessions').upsert(row, { onConflict: 'session_type,trade_date' })
    : supabase.from('alert_sessions').insert(row);

  const { data, error } = await baseQuery.select('id').single();

  if (error || !data) {
    throw new Error(`Failed to insert alert_session: ${error?.message ?? 'no data'}`);
  }

  return { sessionId: data.id as string };
}

export async function insertSectorSnapshots(
  sessionId: string,
  sectors: Array<{ sectorName: string; changePct: number; rank: number; rawData?: unknown }>,
): Promise<void> {
  const rows = sectors.map((s) => ({
    session_id: sessionId,
    sector_name: s.sectorName,
    change_pct: s.changePct,
    rank: s.rank,
    raw_data: s.rawData ?? {},
  }));

  const { error } = await supabase.from('sector_snapshots').insert(rows);
  if (error) {
    console.error('[marketUtils] insertSectorSnapshots error:', error.message);
  }
}

export async function deleteOldUsData(): Promise<void> {
  const { data } = await supabase
    .from('alert_sessions')
    .select('trade_date')
    .order('trade_date', { ascending: false });

  if (!data) return;

  const uniqueDates = [...new Set(data.map(r => r.trade_date as string))];
  if (uniqueDates.length <= 5) return;

  const { error } = await supabase
    .from('alert_sessions')
    .delete()
    .lt('trade_date', uniqueDates[4]);

  if (error) {
    console.error('[marketUtils] deleteOldUsData error:', error.message);
  }
}

export async function insertStockSummaries(
  sessionId: string,
  stocks: Array<{
    ticker: string;
    companyName: string;
    sectorName: string;
    changePct: number;
    priceChange: number;
    closePrice: number;
  }>,
): Promise<void> {
  const rows = stocks.map((s) => ({
    session_id: sessionId,
    ticker: s.ticker,
    company_name: s.companyName,
    sector_name: s.sectorName,
    change_pct: s.changePct,
    price_change: s.priceChange,
    close_price: s.closePrice,
    llm_summary: null,
  }));

  const { error } = await supabase.from('stock_summaries').insert(rows);
  if (error) {
    console.error('[marketUtils] insertStockSummaries error:', error.message);
  }
}

// ── Standard JSON response shapes ─────────────────────────────────────────────

export interface CronResult {
  success: boolean;
  data: {
    sessionType: SessionType;
    tradeDate: string;
    status: 'success' | 'failed' | 'skipped';
    reason?: string;
    sessionId?: string;
    telegramMsgId?: number | null;
  };
  error?: string;
}

// ── Main session handler ──────────────────────────────────────────────────────

/**
 * Handles the full lifecycle of a cron alert session:
 * 1. Verify CRON_SECRET
 * 2. Check market-open (skip if closed)
 * 3. Duplicate guard
 * 4. Collect FMP data
 * 5. Send Telegram
 * 6. Persist to Supabase
 */
export async function handleCronSession(
  request: Request,
  sessionType: SessionType,
  preloadedSectors?: SectorWithStocks[],
  exchangeRate?: number,
): Promise<CronResult> {
  const now = new Date();
  const tradeDate = getEasternTradeDate(now);
  const kstLabel = getKstTimeLabel(now);
  const dateLabel = getKoreanDateLabel(now);

  // 1. CRON_SECRET verification
  const cronSecret = process.env.CRON_SECRET ?? '';
  if (cronSecret) {
    const authHeader = request.headers.get('authorization') ?? '';
    const expected = `Bearer ${cronSecret}`;
    if (authHeader !== expected) {
      return {
        success: false,
        data: { sessionType, tradeDate, status: 'failed', reason: 'Unauthorized' },
        error: 'Invalid CRON_SECRET',
      };
    }
  }

  // 2. Market-open check
  let marketOpen = true;
  try {
    marketOpen = await isMarketOpen();
  } catch (err) {
    console.warn('[cron] isMarketOpen check failed, continuing anyway:', err);
  }

  // For aftermarket, NYSE may already show closed — always run unless weekend/holiday
  // We only hard-skip on weekends (Saturday/Sunday in New York)
  const nyDay = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
  }).format(now);

  if (['Sat', 'Sun'].includes(nyDay)) {
    const { sessionId } = await insertAlertSession({
      sessionType,
      tradeDate,
      status: 'skipped',
    }).catch(() => ({ sessionId: '' }));

    return {
      success: true,
      data: {
        sessionType,
        tradeDate,
        status: 'skipped',
        reason: 'Weekend — market closed',
        sessionId,
      },
    };
  }

  // 3. Duplicate guard
  const duplicate = await isDuplicateSession(sessionType, tradeDate);
  if (duplicate) {
    return {
      success: true,
      data: {
        sessionType,
        tradeDate,
        status: 'skipped',
        reason: 'Already sent for this session today',
      },
    };
  }

  // 4. Collect market data (use preloaded if available)
  let sectors;
  try {
    sectors = preloadedSectors ?? await getAllSectorsWithStocks(5);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const { sessionId } = await insertAlertSession({
      sessionType,
      tradeDate,
      status: 'failed',
    }).catch(() => ({ sessionId: '' }));

    return {
      success: false,
      data: { sessionType, tradeDate, status: 'failed', reason: errorMsg, sessionId },
      error: `FMP data collection failed: ${errorMsg}`,
    };
  }

  // 5. 정규장만 Telegram 전송 (다른 세션은 DB 저장만)
  let telegramMsgId: number | null = null;
  if (sessionType === 'regular') {
    const message = buildMarketMessage(dateLabel, sectors, kstLabel, exchangeRate);
    try {
      const tgResult = await sendTelegramMessage(message);
      if (!tgResult.ok) {
        throw new Error(tgResult.error ?? 'Telegram send failed');
      }
      telegramMsgId = tgResult.message_id;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const { sessionId } = await insertAlertSession({
        sessionType,
        tradeDate,
        status: 'failed',
      }).catch(() => ({ sessionId: '' }));

      return {
        success: false,
        data: { sessionType, tradeDate, status: 'failed', reason: errorMsg, sessionId },
        error: `Telegram send failed: ${errorMsg}`,
      };
    }
  }

  // 6. Persist to Supabase
  const { sessionId } = await insertAlertSession({
    sessionType,
    tradeDate,
    status: 'success',
    telegramMsgId,
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

  await deleteOldUsData();

  return {
    success: true,
    data: {
      sessionType,
      tradeDate,
      status: 'success',
      sessionId,
      telegramMsgId,
    },
  };
}
