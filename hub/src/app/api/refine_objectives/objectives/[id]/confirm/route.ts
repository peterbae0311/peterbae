import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { confirmObjective } from '@/lib/refineObjectives/db';
import { handleApiError } from '@/lib/refineObjectives/apiError';

const MAX_TEXT_LENGTH = 1000;

/** 절차3 '반영' — 운영자가 검토/수정한 문장으로 confirmed_text를 덮어쓰고 초안을 비운다. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const text = typeof body?.text === 'string' ? body.text.trim() : '';
  if (!text) return NextResponse.json({ error: '반영할 내용을 입력해주세요.' }, { status: 400 });
  if (text.length > MAX_TEXT_LENGTH) {
    return NextResponse.json({ error: `학습목표는 ${MAX_TEXT_LENGTH}자 이내로 입력해주세요.` }, { status: 400 });
  }

  try {
    await confirmObjective(supabase, id, text);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
