import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { SUPER_ADMIN_EMAIL } from '@/lib/apps';
import { reorderCategories } from '@/lib/goodWords/categoriesDb';
import { handleApiError } from '@/lib/goodWords/apiError';

/** 카테고리 순서 변경(드래그 앤 드롭) — 전체 공유 순서이므로 SUPER_ADMIN만 가능. */
export async function PATCH(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== SUPER_ADMIN_EMAIL) {
    return NextResponse.json({ error: '카테고리 관리 권한이 없습니다.' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const order = Array.isArray(body?.order) ? body.order.filter((v: unknown) => typeof v === 'string') : [];
  if (order.length === 0) {
    return NextResponse.json({ error: '순서 정보가 올바르지 않습니다.' }, { status: 400 });
  }

  try {
    await reorderCategories(order);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
