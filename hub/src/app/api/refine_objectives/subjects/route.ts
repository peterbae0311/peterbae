import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { createSubject } from '@/lib/refineObjectives/db';
import { handleApiError } from '@/lib/refineObjectives/apiError';

const MAX_NAME_LENGTH = 100;

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const courseId = typeof body?.course_id === 'string' ? body.course_id : '';
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!courseId) return NextResponse.json({ error: 'course_id가 필요합니다.' }, { status: 400 });
  if (!name) return NextResponse.json({ error: '과목명을 입력해주세요.' }, { status: 400 });
  if (name.length > MAX_NAME_LENGTH) {
    return NextResponse.json({ error: `과목명은 ${MAX_NAME_LENGTH}자 이내로 입력해주세요.` }, { status: 400 });
  }

  try {
    const subject = await createSubject(supabase, courseId, name);
    return NextResponse.json({ subject }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
