import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { hasAiKey, generateWithFallback } from '@/lib/aiGenerate';
import { DEFAULT_COMPETENCY_PROMPT, buildResumeContext } from '@/lib/resumePrompts';

function extractJson(text: string): unknown[] | null {
  const cleaned = text.replace(/```(?:json)?\n?/g, '').replace(/```/g, '').trim();
  try {
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (match) {
      try { return JSON.parse(match[0]); } catch { return null; }
    }
    return null;
  }
}

export async function POST(request: NextRequest) {
  if (!hasAiKey()) {
    return NextResponse.json({ error: 'AI 기능을 사용하려면 .env에 API 키를 설정해주세요.' }, { status: 501 });
  }

  const { profile, educations, careers, projects, skills, prompt } = await request.json();

  const context = buildResumeContext({ profile, educations, careers, projects, skills });

  const template = (prompt as string | undefined)?.trim() || DEFAULT_COMPETENCY_PROMPT;
  const userContent = template.split('{{context}}').join(context || '(입력된 정보 없음)');

  const messages = [
    {
      role: 'system',
      content: `당신은 수천 건의 이력서를 분석한 전문 커리어 컨설턴트입니다.
지원자의 경력·프로젝트·학력·스킬 정보에 근거하여 핵심역량을 도출합니다.
반드시 순수 JSON 배열만 출력합니다. 마크다운·설명·코드블록 없이 JSON 배열만 반환하세요.
오직 한국어로만 작성합니다.`,
    },
    { role: 'user', content: userContent },
  ];

  const result = await generateWithFallback('resume/competencies', messages, { maxTokens: 2000 });

  if (!result.text) {
    const reason = result.error ? ` (${result.error})` : '';
    return NextResponse.json({ error: `핵심역량 생성에 실패했습니다.${reason}` }, { status: 500 });
  }

  const raw = extractJson(result.text);
  if (!raw) {
    console.error('[resume/competencies] JSON 파싱 실패, 원본 응답 끝부분:', result.text.slice(-300));
    return NextResponse.json({ error: '응답을 해석하지 못했습니다 (형식 오류)' }, { status: 500 });
  }

  const items = (raw as Record<string, unknown>[]).slice(0, 8).map((c, i) => ({
    title:       String(c.title ?? ''),
    description: String(c.description ?? ''),
    sort_order:  i,
  }));

  const supabase = await createServerSupabaseClient();
  await supabase.from('resume_competencies').delete().not('id', 'is', null);
  const { data: saved, error } = await supabase.from('resume_competencies').insert(items).select();

  if (error || !saved) {
    console.error('[resume/competencies] DB 저장 오류:', error);
    return NextResponse.json({ competencies: items.map((c, i) => ({ ...c, id: `tmp-${i}` })) });
  }

  return NextResponse.json({ competencies: saved });
}
