import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { hasAiKey, generateWithFallback } from '@/lib/aiGenerate';
import { DEFAULT_SELF_INTRO_PROMPT, buildResumeContext } from '@/lib/resumePrompts';

export async function POST(request: NextRequest) {
  if (!hasAiKey()) {
    return NextResponse.json({ error: 'AI 기능을 사용하려면 .env에 API 키를 설정해주세요.' }, { status: 501 });
  }

  const { profile_id, profile, educations, careers, projects, skills, prompt } = await request.json();

  const context = buildResumeContext({ profile, educations, careers, projects, skills });

  const template = (prompt as string | undefined)?.trim() || DEFAULT_SELF_INTRO_PROMPT;
  const userContent = template.split('{{context}}').join(context || '(입력된 정보 없음)');

  const messages = [
    {
      role: 'system',
      content: `당신은 수천 건의 합격 자기소개서를 분석한 전문 커리어 컨설턴트입니다.
지원자의 입장에서 채용 담당자에게 어필할 수 있는 자기소개서를 작성합니다.
오직 한국어로만 작성하고, 자기소개서 본문 텍스트만 출력합니다 (제목·설명·머리말 없이).`,
    },
    { role: 'user', content: userContent },
  ];

  const result = await generateWithFallback('resume/self-introduction', messages, { maxTokens: 3000 });

  if (!result.text) {
    const reason = result.error ? ` (${result.error})` : '';
    return NextResponse.json({ error: `자기소개서 생성에 실패했습니다.${reason}` }, { status: 500 });
  }

  if (profile_id) {
    const supabase = await createServerSupabaseClient();
    await supabase.from('resume_profile').update({ self_introduction: result.text }).eq('id', profile_id);
  }

  return NextResponse.json({ self_introduction: result.text });
}
