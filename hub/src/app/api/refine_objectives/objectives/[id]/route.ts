import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { updateObjectiveText, deleteObjective } from '@/lib/refineObjectives/db';
import { handleApiError } from '@/lib/refineObjectives/apiError';

const MAX_TEXT_LENGTH = 1000;

/** AI를 거치지 않은 운영자의 원문 직접 수정 — 진행 중인 AI 초안(refined_text)이 있었다면 폐기한다. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const text = typeof body?.text === 'string' ? body.text.trim() : '';
  if (!text) return NextResponse.json({ error: '학습목표 내용을 입력해주세요.' }, { status: 400 });
  if (text.length > MAX_TEXT_LENGTH) {
    return NextResponse.json({ error: `학습목표는 ${MAX_TEXT_LENGTH}자 이내로 입력해주세요.` }, { status: 400 });
  }

  try {
    await updateObjectiveText(supabase, id, text);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const { id } = await params;

  try {
    await deleteObjective(supabase, id);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return handleApiError(err);
  }
}
