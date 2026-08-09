import { NextResponse } from 'next/server';

/** Oracle/LLM 에러가 그대로 opaque 500(본문 없음)으로 새지 않도록 라우트 핸들러에서 감싸 쓴다. */
export function handleApiError(err: unknown) {
  console.error('[good-words]', err);
  const message = err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.';
  return NextResponse.json({ error: message }, { status: 500 });
}
