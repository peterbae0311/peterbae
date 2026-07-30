import { createBrowserClient } from '@supabase/ssr';
import { clientEnv } from './env.client';

// path: '/' 명시 — 도메인 전체(다른 모노레포 경로 포함)에서 세션 쿠키가 읽히도록.
export const supabase = createBrowserClient(clientEnv.supabaseUrl, clientEnv.supabaseAnonKey, {
  cookieOptions: { path: '/' },
});
