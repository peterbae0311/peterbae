import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { clientEnv } from './env.client';

/**
 * Route Handler / Server Component 전용 Supabase 클라이언트.
 * 요청의 쿠키에서 세션을 읽어오므로, RLS의 auth.uid()가 올바르게 해석됨.
 * (브라우저 싱글턴 `supabase`는 document.cookie에 의존하므로 서버에서 사용 불가)
 */
export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient(clientEnv.supabaseUrl, clientEnv.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Component에서 호출된 경우 쓰기 불가 — 미들웨어가 세션 갱신을 담당하므로 무시 가능.
        }
      },
    },
  });
}
