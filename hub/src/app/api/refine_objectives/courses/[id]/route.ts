import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { updateCourse, deleteCourse } from '@/lib/refineObjectives/db';
import { handleApiError } from '@/lib/refineObjectives/apiError';

const MAX_NAME_LENGTH = 100;
const MAX_PROMPT_LENGTH = 4000;

/**
 * name/prompt 중 요청에 포함된 필드만 갱신한다 — 과정명 수정 팝업은 name만,
 * "학습목표 프롬프트" 팝업은 prompt만 보낸다.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const fields: { name?: string; prompt?: string | null } = {};

  if (body?.name !== undefined) {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) return NextResponse.json({ error: '과정명을 입력해주세요.' }, { status: 400 });
    if (name.length > MAX_NAME_LENGTH) {
      return NextResponse.json({ error: `과정명은 ${MAX_NAME_LENGTH}자 이내로 입력해주세요.` }, { status: 400 });
    }
    fields.name = name;
  }

  if (body?.prompt !== undefined) {
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    if (prompt.length > MAX_PROMPT_LENGTH) {
      return NextResponse.json({ error: `프롬프트는 ${MAX_PROMPT_LENGTH}자 이내로 입력해주세요.` }, { status: 400 });
    }
    fields.prompt = prompt || null;
  }

  if (Object.keys(fields).length === 0) {
    return NextResponse.json({ error: '수정할 내용이 없습니다.' }, { status: 400 });
  }

  try {
    await updateCourse(supabase, id, fields);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}

/** 과정을 삭제하면 그 안의 과목/학습목표도 함께 삭제된다(FK ON DELETE CASCADE) — 프론트에서 미리 경고. */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const { id } = await params;

  try {
    await deleteCourse(supabase, id);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return handleApiError(err);
  }
}
