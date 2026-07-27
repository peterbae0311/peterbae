import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// GET /api/kr/sectors/dates
// Returns the list of trade dates for which sector snapshots are stored,
// most recent first, up to 30 dates.
//
// Response: { dates: string[] }  // ['2026-05-09', '2026-05-08', ...]
export async function GET() {
  try {
    const supabase = getSupabaseClient();

    // Supabase anon client does not support .distinct(), so we use a
    // select with order + manual deduplication in JS (30 dates max, trivial cost).
    const { data, error } = await supabase
      .from('kr_sector_snapshots')
      .select('trade_date')
      .order('trade_date', { ascending: false })
      .limit(1000); // generous upper bound; deduplication below

    if (error) {
      throw new Error(`Supabase dates fetch failed: ${error.message}`);
    }

    // Deduplicate while preserving descending order, cap at 30
    const seen = new Set<string>();
    const dates: string[] = [];
    for (const row of data ?? []) {
      const d = row.trade_date as string;
      if (!seen.has(d)) {
        seen.add(d);
        dates.push(d);
        if (dates.length === 30) break;
      }
    }

    return NextResponse.json({ dates });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ dates: [], error: message }, { status: 500 });
  }
}
