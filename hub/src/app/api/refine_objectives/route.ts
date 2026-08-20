import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { fetchTree } from '@/lib/refineObjectives/db';
import { handleApiError } from '@/lib/refineObjectives/apiError';

/** 절차1 "학습목표 조회" 버튼 — 현재 시점 기준 과정>과목>학습목표 전체 트리를 다시 조회한다. */
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  try {
    const courses = await fetchTree(supabase);
    return NextResponse.json({ courses });
  } catch (err) {
    return handleApiError(err);
  }
}
