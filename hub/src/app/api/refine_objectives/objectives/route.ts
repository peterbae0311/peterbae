import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { createObjective } from '@/lib/refineObjectives/db';
import { handleApiError } from '@/lib/refineObjectives/apiError';

const MAX_TEXT_LENGTH = 1000;

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const subjectId = typeof body?.subject_id === 'string' ? body.subject_id : '';
  const text = typeof body?.text === 'string' ? body.text.trim() : '';
  if (!subjectId) return NextResponse.json({ error: 'subject_id가 필요합니다.' }, { status: 400 });
  if (!text) return NextResponse.json({ error: '학습목표 내용을 입력해주세요.' }, { status: 400 });
  if (text.length > MAX_TEXT_LENGTH) {
    return NextResponse.json({ error: `학습목표는 ${MAX_TEXT_LENGTH}자 이내로 입력해주세요.` }, { status: 400 });
  }

  try {
    const objective = await createObjective(supabase, subjectId, text);
    return NextResponse.json({ objective }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
