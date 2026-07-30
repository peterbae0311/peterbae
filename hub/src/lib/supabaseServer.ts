import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { clientEnv } from './env.client';

/**
 * Route Handler 전용 Supabase 클라이언트.
 * career 앱과 동일한 프로젝트를 사용하므로, career에서 로그인해도 세션을 그대로 읽음.
 */
export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient(clientEnv.supabaseUrl, clientEnv.supabaseAnonKey, {
    cookieOptions: { path: '/' },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Component에서 호출된 경우 쓰기 불가 — 무시 가능.
        }
      },
    },
  });
}
