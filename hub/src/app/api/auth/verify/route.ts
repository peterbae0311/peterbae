import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { SUPER_ADMIN_EMAIL } from '@/lib/apps';

/**
 * nginx auth_request가 subrequest로 호출하는 전용 엔드포인트.
 * nginx가 X-Original-URI 헤더로 실제 요청 경로를 전달함 (proxy_set_header).
 *
 * 응답 코드:
 *  200 — 통과
 *  401 — 로그인 필요 (nginx가 /login으로 리다이렉트)
 *  403 — 로그인은 됐지만 해당 앱 접근 권한 없음 (nginx가 /forbidden으로 리다이렉트)
 *
 * /login, /_next/ 는 nginx 설정에서 auth_request 게이트 대상에서 이미 제외되어 있음
 * (무한 루프 방지 — 이 경로들은 이 엔드포인트 자체를 거치지 않음).
 */

// 로그인만 되어 있으면 되고, 개별 app_access 부여가 필요 없는 hub 자체 경로.
function isSystemPath(path: string): boolean {
  return path === '/' || path === '/dashboard' || path === '/forbidden' || path === '/admin'
    || path.startsWith('/api/admin/');
}

// /career, /image_slideshow 같은 브라우저 경로는 첫 세그먼트가 app_key다.
// 그런데 /api/career/llm처럼 hub가 다른 앱을 대신 호출해주는 내부 API 경로는
// 첫 세그먼트가 "api"라서, 그대로 쓰면 존재하지 않는 app_key "api"로 조회돼
// 슈퍼관리자를 제외한 모든 계정이 항상 403을 받는다. 이 경우 두 번째 세그먼트를
// app_key로 취급한다.
function extractAppKey(path: string): string | null {
  const segs = path.split('/').filter(Boolean);
  if (segs[0] === 'api' && segs[1]) return segs[1];
  return segs[0] || null;
}

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return new NextResponse(null, { status: 401 });
  }

  const email = user.email ?? '';
  if (email === SUPER_ADMIN_EMAIL) {
    return new NextResponse(null, { status: 200 });
  }

  const originalUri = request.headers.get('x-original-uri') ?? '/';
  const path = originalUri.split('?')[0];

  if (isSystemPath(path)) {
    return new NextResponse(null, { status: 200 });
  }

  const appKey = extractAppKey(path);
  if (!appKey) {
    return new NextResponse(null, { status: 200 });
  }

  const { data } = await supabase
    .from('app_access')
    .select('app_key')
    .eq('email', email)
    .eq('app_key', appKey)
    .maybeSingle();

  return data
    ? new NextResponse(null, { status: 200 })
    : new NextResponse(null, { status: 403 });
}
