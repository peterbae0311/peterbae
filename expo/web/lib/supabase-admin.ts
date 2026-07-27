import "server-only";
import { createClient } from "@supabase/supabase-js";

// service role key는 NEXT_PUBLIC_ 접두어가 없어 브라우저 번들에 절대 포함되지 않는다.
// exh_sources/exh_sync_logs/exh_category_mappings는 RLS상 anon으로 읽을 수 없는 운영 테이블이라
// 관리자 화면(Server Component)에서만 이 클라이언트를 사용한다.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const supabaseAdmin = createClient(url, serviceRoleKey, {
  auth: { persistSession: false },
});
