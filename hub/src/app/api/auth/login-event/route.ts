import { NextRequest, NextResponse } from 'next/server';
import { UAParser } from 'ua-parser-js';
import { createAdminClient } from '@/lib/supabaseAdmin';
import { lookupRegionCountry } from '@/lib/geoip';

/**
 * 로그인 성공/실패를 기록하는 전용 엔드포인트 — 로그인 페이지가 Supabase Auth 호출
 * 직후(성공이든 실패든) 이걸 호출한다. 실패 시엔 세션이 없으므로 이 경로 자체는
 * nginx에서 auth_request off로 게이트 예외 처리되어 있어야 한다(로그인 실패 기록이
 * 안 막히려면).
 *
 * IP는 nginx가 얹어주는 X-Real-IP/X-Forwarded-For에서 읽는다 — 클라이언트가 보낸
 * 값은 위조 가능하므로 절대 body로 받지 않는다.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    email?: string;
    result?: 'success' | 'fail';
    failReason?: string;
    sessionId?: string;
  };

  const email = (body.email ?? '').trim().toLowerCase();
  const result = body.result === 'success' ? 'success' : 'fail';
  if (!email) {
    return NextResponse.json({ error: 'email is required' }, { status: 400 });
  }

  const ip =
    request.headers.get('x-real-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    null;
  const userAgent = request.headers.get('user-agent') ?? '';
  const ua = new UAParser(userAgent).getResult();
  const regionCountry = await lookupRegionCountry(ip);

  const admin = createAdminClient();
  const { error } = await admin.from('login_history').insert({
    session_id: result === 'success' ? body.sessionId ?? null : null,
    login_id: email,
    result,
    fail_reason: result === 'fail' ? body.failReason ?? '인증코드 불일치 또는 만료' : null,
    ip_address: ip,
    region_country: regionCountry,
    os: ua.os.name ? `${ua.os.name} ${ua.os.version ?? ''}`.trim() : null,
    browser: ua.browser.name ? `${ua.browser.name} ${ua.browser.version ?? ''}`.trim() : null,
    device: ua.device.type ?? 'desktop',
  });

  if (error) {
    // 이력 기록 실패가 로그인 자체를 막으면 안 되므로 에러를 삼키되 서버 로그에는 남긴다.
    console.error('[login-event] insert failed:', error.message);
  }

  return NextResponse.json({ ok: true });
}
