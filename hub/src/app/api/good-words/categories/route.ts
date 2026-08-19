import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { SUPER_ADMIN_EMAIL } from '@/lib/apps';
import { listCategories, createCategory, categoryLabelExists, parseCategoryInput } from '@/lib/goodWords/categoriesDb';
import { handleApiError } from '@/lib/goodWords/apiError';

/** 카테고리 목록 — 로그인한 모든 사용자가 조회 가능(탭 렌더링에 필요). */
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  try {
    const categories = await listCategories();
    return NextResponse.json({ categories });
  } catch (err) {
    return handleApiError(err);
  }
}

/** 카테고리 생성 — 공유 보관함 전체에 영향을 주므로 SUPER_ADMIN만 가능. */
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== SUPER_ADMIN_EMAIL) {
    return NextResponse.json({ error: '카테고리 관리 권한이 없습니다.' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const { input, error } = parseCategoryInput(body);
  if (!input) return NextResponse.json({ error }, { status: 400 });

  try {
    if (await categoryLabelExists(input.label)) {
      return NextResponse.json({ error: '이미 같은 이름의 카테고리가 있습니다.' }, { status: 409 });
    }
    const category = await createCategory(input);
    return NextResponse.json({ category }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
