import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { SUPER_ADMIN_EMAIL } from '@/lib/apps';
import { callChatWithFallback } from '@/lib/goodWords/aiProviders';
import { handleApiError } from '@/lib/goodWords/apiError';

const MAX_CONTENT_LENGTH = 4000;

const SYSTEM_PROMPT =
  '당신은 전문 번역가입니다. 주어진 글을 자연스러운 한국어로 번역하세요. ' +
  '번역 결과만 출력하고, 다른 설명이나 따옴표, 코드블록은 붙이지 마세요. 이미 한국어인 글이 주어지면 그대로 돌려주세요.';

/**
 * 저장된 글(또는 저장 전 초안)의 한국어 번역을 즉석에서 생성한다 — 생성 시점에 LLM이
 * 함께 만든 translation이 없는 경우(수동 추가, 예전 데이터 등)를 관리자가 수정 화면의
 * "번역 생성" 버튼으로 채울 수 있게 하는 별도 라우트.
 */
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== SUPER_ADMIN_EMAIL) {
    return NextResponse.json({ error: '번역 권한이 없습니다.' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const content = typeof body?.content === 'string' ? body.content.trim() : '';
  if (!content) {
    return NextResponse.json({ error: '번역할 내용이 없습니다.' }, { status: 400 });
  }
  if (content.length > MAX_CONTENT_LENGTH) {
    return NextResponse.json({ error: `내용이 ${MAX_CONTENT_LENGTH}자를 초과합니다.` }, { status: 400 });
  }

  try {
    const { content: translation, provider } = await callChatWithFallback(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content },
      ],
      { maxTokens: 2000, temperature: 0.3 }
    );
    return NextResponse.json({ translation: translation.trim(), provider });
  } catch (err) {
    return handleApiError(err);
  }
}
