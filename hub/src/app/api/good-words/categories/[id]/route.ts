import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { SUPER_ADMIN_EMAIL } from '@/lib/apps';
import { updateCategory, deleteCategory, categoryLabelExists, parseCategoryInput } from '@/lib/goodWords/categoriesDb';
import { handleApiError } from '@/lib/goodWords/apiError';

/** 카테고리 수정(제목/분류/프롬프트) — SUPER_ADMIN만 가능. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== SUPER_ADMIN_EMAIL) {
    return NextResponse.json({ error: '카테고리 관리 권한이 없습니다.' }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const { input, error } = parseCategoryInput(body);
  if (!input) return NextResponse.json({ error }, { status: 400 });

  try {
    if (await categoryLabelExists(input.label, id)) {
      return NextResponse.json({ error: '이미 같은 이름의 카테고리가 있습니다.' }, { status: 409 });
    }
    const updated = await updateCategory(id, input);
    if (!updated) return NextResponse.json({ error: '존재하지 않는 카테고리입니다.' }, { status: 404 });
    return NextResponse.json({ id, ...input });
  } catch (err) {
    return handleApiError(err);
  }
}

/**
 * 카테고리 소프트 삭제 — SUPER_ADMIN만 가능. 카테고리와 그 안의 좋은글을 같은 트랜잭션으로
 * 함께 소프트 삭제한다(개별 좋은글 삭제와 동일한 복구 가능 정책 — categoriesDb.ts 참고).
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== SUPER_ADMIN_EMAIL) {
    return NextResponse.json({ error: '카테고리 관리 권한이 없습니다.' }, { status: 403 });
  }

  const { id } = await params;

  try {
    const deleted = await deleteCategory(id, user.email);
    if (!deleted) return NextResponse.json({ error: '존재하지 않는 카테고리입니다.' }, { status: 404 });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return handleApiError(err);
  }
}
