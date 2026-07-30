import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { clientEnv } from './env.client';
import { serverEnv } from './env.server';

/**
 * service_role 키를 쓰는 관리자 전용 클라이언트 — RLS를 전부 우회함.
 * Admin API(등록된 이메일 목록 조회 등)에서만 사용하고, 호출하는 라우트에서
 * 반드시 요청자가 SUPER_ADMIN_EMAIL인지 먼저 확인할 것.
 */
export function createAdminClient() {
  return createClient(clientEnv.supabaseUrl, serverEnv.supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
