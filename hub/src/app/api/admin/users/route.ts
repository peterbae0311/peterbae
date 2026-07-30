import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { createAdminClient } from '@/lib/supabaseAdmin';
import { SUPER_ADMIN_EMAIL } from '@/lib/apps';

/**
 * 최고관리자 전용 — 등록된 Supabase Auth 계정 이메일 목록 조회 (본인 제외).
 * Admin 화면의 "이메일 선택" 드롭다운 데이터 소스.
 */
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || user.email !== SUPER_ADMIN_EMAIL) {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 200 });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const emails = data.users
    .map(u => u.email)
    .filter((email): email is string => !!email && email !== SUPER_ADMIN_EMAIL)
    .sort();

  return NextResponse.json({ emails });
}
