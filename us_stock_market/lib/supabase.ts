import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL ?? '';
  const key = process.env.SUPABASE_ANON_KEY ?? '';
  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables');
  }
  _client = createClient(url, key);
  return _client;
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return (getSupabaseClient() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

// ── DB row types ──────────────────────────────────────────────────────────────

export interface AlertSession {
  id: string;
  session_type: 'daymarket' | 'premarket' | 'regular' | 'aftermarket';
  trade_date: string; // 'YYYY-MM-DD'
  sent_at: string | null;
  status: 'success' | 'failed' | 'skipped';
  telegram_msg_id: number | null;
  created_at: string;
}

export interface SectorSnapshot {
  id: string;
  session_id: string;
  sector_name: string;
  change_pct: number;
  rank: number;
  raw_data: Record<string, unknown>;
  created_at: string;
}

export interface StockSummary {
  id: string;
  session_id: string;
  ticker: string;
  company_name: string;
  sector_name: string;
  change_pct: number;
  price_change: number;
  close_price: number;
  llm_summary: string | null;
  created_at: string;
}
