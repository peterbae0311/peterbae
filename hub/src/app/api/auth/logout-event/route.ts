import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabaseAdmin';

/**
 * 로그아웃 직전에 호출 — session_id로 짝지어지는 login_history 행에 logout_at을 채운다.
 * 여러 기기에서 동시 로그인했을 수 있으니 반드시 session_id로 특정 행만 골라 갱신하고,
 * 이미 logout_at이 채워진 행(중복 호출)은 건드리지 않는다.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { sessionId?: string };
  const sessionId = body.sessionId;

  if (!sessionId) {
    return NextResponse.json({ ok: true });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('login_history')
    .update({ logout_at: new Date().toISOString() })
    .eq('session_id', sessionId)
    .is('logout_at', null);

  if (error) {
    console.error('[logout-event] update failed:', error.message);
  }

  return NextResponse.json({ ok: true });
}
