import { createClient } from '@supabase/supabase-js';
import { env } from './env.js';

/** RLS를 우회해야 하는 수집 배치 전용 클라이언트. service role key 사용, 클라이언트/브라우저에서 절대 재사용 금지. */
export const supabase = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
  auth: { persistSession: false },
});
