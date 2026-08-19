import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { createAdminClient } from '@/lib/supabaseAdmin';
import { APPS, SUPER_ADMIN_EMAIL } from '@/lib/apps';

/**
 * 최고관리자 전용 — 특정 이메일에 특정 앱 접근 권한을 부여한다.
 * outside_instructor처럼 로그인이 없는 정적 페이지에서, 자기 승인 플로우가 끝난 뒤
 * 이 라우트를 호출해 hub SSO만으로 접근 가능하게 만드는 용도(같은 도메인이라 쿠키가
 * 자동으로 실려서 별도 인증 구현 없이 SUPER_ADMIN_EMAIL 체크가 그대로 통과함).
 *
 * hub 로그인은 이메일 OTP이고 signInWithOtp가 shouldCreateUser:false로 미등록 이메일을
 * 막기 때문에, app_access만 부여해도 auth.users에 그 이메일 계정이 없으면 정작 인증코드를
 * 못 받는다 — 그래서 계정이 없으면 비밀번호 없이(email_confirm만) 먼저 만들어준다.
 */
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || user.email !== SUPER_ADMIN_EMAIL) {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const appKey = typeof body?.app_key === 'string' ? body.app_key : '';

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: '유효한 이메일이 필요합니다.' }, { status: 400 });
  }
  if (!APPS.some(app => app.key === appKey)) {
    return NextResponse.json({ error: '유효하지 않은 app_key입니다.' }, { status: 400 });
  }

  const admin = createAdminClient();

  const { error: createUserError } = await admin.auth.admin.createUser({ email, email_confirm: true });
  // 이미 계정이 있으면 그대로 진행 — 새로 만들 필요가 없을 뿐 실패가 아니다.
  if (createUserError && createUserError.code !== 'email_exists') {
    return NextResponse.json({ error: createUserError.message }, { status: 500 });
  }

  const { error } = await admin
    .from('app_access')
    .upsert({ email, app_key: appKey }, { onConflict: 'email,app_key' });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
