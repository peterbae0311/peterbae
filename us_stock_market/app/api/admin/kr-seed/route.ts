import { NextResponse } from 'next/server';
import { getTopKrSectorsWithStocks } from '@/lib/naverFinance';
import { getSupabaseClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// GET /api/admin/kr-seed
// Scrapes top 32 Korean sectors + top 5 stocks each from NAVER Finance
// and upserts them into kr_sector_snapshots for today's KST trade date.
//
// Authorization: Bearer <CRON_SECRET>
export async function GET(request: Request) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const authHeader = request.headers.get('authorization') ?? '';
  const cronSecret = process.env.CRON_SECRET ?? '';
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // ── KST trade date (UTC+9) ────────────────────────────────────────────
    const nowUtcMs = Date.now();
    const kstOffsetMs = 9 * 60 * 60 * 1000;
    const kstDate = new Date(nowUtcMs + kstOffsetMs);
    const tradeDate = kstDate.toISOString().slice(0, 10); // 'YYYY-MM-DD'

    // ── Scrape NAVER Finance ──────────────────────────────────────────────
    const sectors = await getTopKrSectorsWithStocks(32);

    // ── Upsert into Supabase ──────────────────────────────────────────────
    const rows = sectors.map((sector) => ({
      trade_date: tradeDate,
      sector_no: sector.no,
      sector_name: sector.name,
      change_rate: sector.changeRate,
      stocks: sector.stocks,
    }));

    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from('kr_sector_snapshots')
      .upsert(rows, { onConflict: 'trade_date,sector_no' });

    if (error) {
      throw new Error(`Supabase upsert failed: ${error.message}`);
    }

    const { data: dateRows } = await supabase
      .from('kr_sector_snapshots')
      .select('trade_date')
      .order('trade_date', { ascending: false });

    if (dateRows) {
      const uniqueDates = [...new Set(dateRows.map(r => r.trade_date as string))];
      if (uniqueDates.length > 5) {
        const { error: deleteError } = await supabase
          .from('kr_sector_snapshots')
          .delete()
          .lt('trade_date', uniqueDates[4]);

        if (deleteError) {
          console.error('[kr-seed] deleteOldKrData error:', deleteError.message);
        }
      }
    }

    return NextResponse.json({
      success: true,
      date: tradeDate,
      count: rows.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
