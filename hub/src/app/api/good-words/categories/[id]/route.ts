import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { SUPER_ADMIN_EMAIL } from '@/lib/apps';
import { renameCategory, deleteCategory, categoryLabelExists } from '@/lib/goodWords/categoriesDb';
import { handleApiError } from '@/lib/goodWords/apiError';

const MAX_LABEL_LENGTH = 20;

/** 카테고리 이름 변경 — SUPER_ADMIN만 가능. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== SUPER_ADMIN_EMAIL) {
    return NextResponse.json({ error: '카테고리 관리 권한이 없습니다.' }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const label = typeof body?.label === 'string' ? body.label.trim() : '';
  if (!label) {
    return NextResponse.json({ error: '카테고리 이름을 입력해주세요.' }, { status: 400 });
  }
  if (label.length > MAX_LABEL_LENGTH) {
    return NextResponse.json({ error: `카테고리 이름은 ${MAX_LABEL_LENGTH}자 이내로 입력해주세요.` }, { status: 400 });
  }

  try {
    if (await categoryLabelExists(label, id)) {
      return NextResponse.json({ error: '이미 같은 이름의 카테고리가 있습니다.' }, { status: 409 });
    }
    const updated = await renameCategory(id, label);
    if (!updated) return NextResponse.json({ error: '존재하지 않는 카테고리입니다.' }, { status: 404 });
    return NextResponse.json({ id, label });
  } catch (err) {
    return handleApiError(err);
  }
}

/**
 * 카테고리 삭제 — SUPER_ADMIN만 가능. DB의 ON DELETE CASCADE가 관련 good_words 행을
 * 함께 제거하므로(oracle/good-words-schema.sql 참고), 애플리케이션에서 별도로 지울 필요 없음.
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== SUPER_ADMIN_EMAIL) {
    return NextResponse.json({ error: '카테고리 관리 권한이 없습니다.' }, { status: 403 });
  }

  const { id } = await params;

  try {
    const deleted = await deleteCategory(id);
    if (!deleted) return NextResponse.json({ error: '존재하지 않는 카테고리입니다.' }, { status: 404 });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return handleApiError(err);
  }
}
