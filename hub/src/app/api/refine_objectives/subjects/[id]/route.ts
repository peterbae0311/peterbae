import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { updateSubject, deleteSubject } from '@/lib/refineObjectives/db';
import { handleApiError } from '@/lib/refineObjectives/apiError';

const MAX_NAME_LENGTH = 100;

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name) return NextResponse.json({ error: '과목명을 입력해주세요.' }, { status: 400 });
  if (name.length > MAX_NAME_LENGTH) {
    return NextResponse.json({ error: `과목명은 ${MAX_NAME_LENGTH}자 이내로 입력해주세요.` }, { status: 400 });
  }

  try {
    await updateSubject(supabase, id, name);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}

/** 과목을 삭제하면 그 안의 학습목표도 함께 삭제된다(FK ON DELETE CASCADE) — 프론트에서 미리 경고. */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const { id } = await params;

  try {
    await deleteSubject(supabase, id);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return handleApiError(err);
  }
}
