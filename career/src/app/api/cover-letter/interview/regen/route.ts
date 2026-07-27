import { NextRequest, NextResponse } from 'next/server';
import { serverEnv } from '@/lib/env.server';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { DEFAULT_REGEN_PROMPT } from '@/lib/interviewPrompts';

const OR_URL   = 'https://openrouter.ai/api/v1/chat/completions';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

const OR_MODELS = [
  'qwen/qwen3-next-80b-a3b-instruct:free',
  'openai/gpt-oss-120b:free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'nousresearch/hermes-3-llama-3.1-405b:free',
];
const GROQ_MODEL = 'llama-3.3-70b-versatile';

function extractErrorMessage(errBody: string): string {
  try {
    const parsed = JSON.parse(errBody);
    return parsed?.error?.metadata?.raw ?? parsed?.error?.message ?? errBody.slice(0, 200);
  } catch {
    return errBody.slice(0, 200);
  }
}

async function fetchText(url: string, headers: Record<string, string>, body: Record<string, unknown>): Promise<{ text: string | null; error?: string }> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errBody = await res.text();
      const message = extractErrorMessage(errBody);
      console.error(`[interview/regen] ${body.model} 호출 실패: ${res.status} ${errBody.slice(0, 300)}`);
      return { text: null, error: message };
    }
    const data = await res.json();
    return { text: (data.choices?.[0]?.message?.content ?? '').trim() || null };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[interview/regen] ${body.model} 호출 예외:`, e);
    return { text: null, error: message };
  }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function POST(request: NextRequest) {
  if (!serverEnv.openrouterApiKey && !serverEnv.groqApiKey) {
    return NextResponse.json({ error: 'AI 기능을 사용하려면 .env에 API 키를 설정해주세요.' }, { status: 501 });
  }

  const { question_id, question, company_name, recruitment_notice, notes, urls, prompt } = await request.json();

  if (!question?.trim()) {
    return NextResponse.json({ error: '질문 내용이 없습니다.' }, { status: 400 });
  }

  const contextParts: string[] = [];
  if (company_name)       contextParts.push(`회사/기관명: ${company_name}`);
  if (recruitment_notice) contextParts.push(`모집 요강:\n${recruitment_notice}`);
  if (notes)              contextParts.push(`기타 사항:\n${notes}`);
  if (urls?.length)       contextParts.push(`참고 URL:\n${(urls as { title: string; url: string }[]).map(u => `- ${u.title}: ${u.url}`).join('\n')}`);

  const template = (prompt as string | undefined)?.trim() || DEFAULT_REGEN_PROMPT;
  const userContent = template
    .split('{{context}}').join(contextParts.join('\n\n') || '(정보 없음)')
    .split('{{question}}').join(question);

  const messages = [
    {
      role: 'system',
      content: `당신은 수천 건의 실제 면접 사례를 분석한 전문 면접 코치입니다.
지원자의 입장에서 면접 질문에 대한 모범 답변을 작성합니다.
오직 한국어로만 작성하고, 답변 내용만 출력합니다 (설명·머리말 없이).`,
    },
    {
      role: 'user',
      content: userContent,
    },
  ];

  let sample_answer: string | null = null;
  let lastError: string | undefined;

  if (serverEnv.openrouterApiKey) {
    for (const model of OR_MODELS) {
      const result = await fetchText(OR_URL, { Authorization: `Bearer ${serverEnv.openrouterApiKey}` }, {
        model, max_tokens: 1000, messages,
      });
      sample_answer = result.text;
      if (result.error) lastError = result.error;
      if (sample_answer) break;
    }
  }

  if (!sample_answer && serverEnv.groqApiKey) {
    let result = await fetchText(GROQ_URL, { Authorization: `Bearer ${serverEnv.groqApiKey}` }, {
      model: GROQ_MODEL, max_tokens: 1000, temperature: 0.85, messages,
    });
    sample_answer = result.text;
    if (result.error) lastError = result.error;

    // Groq가 마지막 보루이므로, 일시적 rate-limit 대비 1회 재시도
    if (!sample_answer) {
      await sleep(1500);
      result = await fetchText(GROQ_URL, { Authorization: `Bearer ${serverEnv.groqApiKey}` }, {
        model: GROQ_MODEL, max_tokens: 1000, temperature: 0.85, messages,
      });
      sample_answer = result.text;
      if (result.error) lastError = result.error;
    }
  }

  if (!sample_answer) {
    const reason = lastError ? ` (${lastError})` : '';
    return NextResponse.json({ error: `AI 답변 생성에 실패했습니다.${reason}` }, { status: 500 });
  }

  // DB 업데이트
  if (question_id && !question_id.startsWith('tmp-')) {
    const supabase = await createServerSupabaseClient();
    await supabase
      .from('interview_questions')
      .update({ sample_answer })
      .eq('id', question_id);
  }

  return NextResponse.json({ sample_answer });
}
