import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabaseAdmin';

/**
 * GitHub Actions의 각 배포 job이 성공적으로 끝난 직후 호출하는 웹훅 — 로그인 세션이 아니라
 * 공유 시크릿(DASHBOARD_DEPLOY_SECRET)으로 인가한다. CI 러너에서 공개 URL로 호출하므로
 * (서버 SSH 세션이 아니라) Authorization 헤더 검증이 반드시 필요하다.
 * env.server.ts의 required()로 안 넣은 이유: 이 값이 아직 .env에 없어도 hub 전체가
 * 부팅 실패하면 안 되므로(good-words의 LLM env를 required()로 안 넣은 것과 동일한 이유) —
 * 이 라우트 호출 시점에만 없으면 502로 실패하고 나머지 hub는 정상 동작해야 한다.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.DASHBOARD_DEPLOY_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'DASHBOARD_DEPLOY_SECRET이 서버에 설정되어 있지 않습니다.' }, { status: 500 });
  }

  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: '인증 실패' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const appKey = typeof body?.app_key === 'string' ? body.app_key.trim() : '';
  if (!appKey) {
    return NextResponse.json({ error: 'app_key가 필요합니다.' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('app_deployments')
    .upsert({ app_key: appKey, deployed_at: new Date().toISOString() }, { onConflict: 'app_key' });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
