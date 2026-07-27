import { NextResponse } from 'next/server';
import { getTopKrSectorsWithStocks } from '@/lib/naverFinance';
import { getSupabaseClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// GET /api/kr/sectors[?date=YYYY-MM-DD]
//
// - date specified : fetch that day's snapshot from Supabase
// - date omitted   : fetch the most recent date from Supabase
//                    (falls back to live NAVER scraping if DB is empty)
//
// Response: {
//   sectors   : KrSectorWithStocks[],
//   fetchedAt : string,  // ISO timestamp
//   date      : string,  // YYYY-MM-DD
//   source    : 'db' | 'live'
// }
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date'); // 'YYYY-MM-DD' or null

    const supabase = getSupabaseClient();

    // ── Resolve target date ───────────────────────────────────────────────
    let targetDate: string | null = dateParam;

    if (!targetDate) {
      // Find the most recent stored date
      const { data: latest, error: latestErr } = await supabase
        .from('kr_sector_snapshots')
        .select('trade_date')
        .order('trade_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestErr) {
        throw new Error(`Supabase date lookup failed: ${latestErr.message}`);
      }
      targetDate = latest?.trade_date ?? null;
    }

    // ── DB lookup ─────────────────────────────────────────────────────────
    if (targetDate) {
      const { data: rows, error: rowsErr } = await supabase
        .from('kr_sector_snapshots')
        .select('sector_no, sector_name, change_rate, stocks')
        .eq('trade_date', targetDate)
        .order('change_rate', { ascending: false });

      if (rowsErr) {
        throw new Error(`Supabase sector fetch failed: ${rowsErr.message}`);
      }

      if (rows && rows.length > 0) {
        const sectors = rows.map((r) => ({
          no: r.sector_no as string,
          name: r.sector_name as string,
          changeRate: r.change_rate as number,
          stocks: r.stocks as unknown[],
        }));

        return NextResponse.json({
          sectors,
          fetchedAt: new Date().toISOString(),
          date: targetDate,
          source: 'db' as const,
        });
      }
    }

    // ── Live fallback (no DB data available) ──────────────────────────────
    const sectors = await getTopKrSectorsWithStocks(32);

    // Compute KST date for the live response
    const kstDate = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const liveDate = kstDate.toISOString().slice(0, 10);

    return NextResponse.json({
      sectors,
      fetchedAt: new Date().toISOString(),
      date: liveDate,
      source: 'live' as const,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { sectors: [], error: message },
      { status: 500 },
    );
  }
}
