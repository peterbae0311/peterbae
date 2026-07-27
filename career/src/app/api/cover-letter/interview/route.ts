import { NextRequest, NextResponse } from 'next/server';
import { serverEnv } from '@/lib/env.server';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { DIFF_LABEL, DEFAULT_INTERVIEW_PROMPT, type Difficulty } from '@/lib/interviewPrompts';

const OR_URL   = 'https://openrouter.ai/api/v1/chat/completions';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

const OR_MODELS = [
  'qwen/qwen3-next-80b-a3b-instruct:free',
  'openai/gpt-oss-120b:free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'nousresearch/hermes-3-llama-3.1-405b:free',
];
const GROQ_MODEL = 'llama-3.3-70b-versatile';

// 난이도별 sort_order 오프셋 (high→0, medium→10, low→20)
const DIFF_OFFSET: Record<Difficulty, number> = { high: 0, medium: 10, low: 20 };

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
      console.error(`[interview] ${body.model} 호출 실패: ${res.status} ${errBody.slice(0, 300)}`);
      return { text: null, error: message };
    }
    const data = await res.json();
    return { text: (data.choices?.[0]?.message?.content ?? '').trim() || null };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[interview] ${body.model} 호출 예외:`, e);
    return { text: null, error: message };
  }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function toStrArr(v: unknown): string[] {
  return Array.isArray(v) ? v.map(String) : [];
}

function mapRaw(q: Record<string, unknown>, diff: Difficulty, i: number) {
  return {
    difficulty:    diff,
    sort_order:    DIFF_OFFSET[diff] + i,
    question:      String(q.question ?? ''),
    follow_ups:    toStrArr(q.follow_ups),
    purpose:       String(q.purpose ?? ''),
    competency:    String(q.competency ?? ''),
    intent:        String(q.intent ?? ''),
    good_points:   toStrArr(q.good_points),
    avoid:         toStrArr(q.avoid),
    mistakes:      toStrArr(q.mistakes),
    sample_answer: String(q.sample_answer ?? ''),
  };
}

async function generateForDifficulty(
  diff: Difficulty,
  messages: { role: string; content: string }[],
): Promise<{ questions: ReturnType<typeof mapRaw>[]; model: string | null; error?: string }> {
  let text: string | null = null;
  let usedModel: string | null = null;
  let lastError: string | undefined;

  if (serverEnv.openrouterApiKey) {
    for (const model of OR_MODELS) {
      const result = await fetchText(OR_URL, { Authorization: `Bearer ${serverEnv.openrouterApiKey}` }, {
        model, max_tokens: 4000, messages,
      });
      text = result.text;
      if (result.error) lastError = result.error;
      if (text) { usedModel = model; break; }
    }
  }

  if (!text && serverEnv.groqApiKey) {
    let result = await fetchText(GROQ_URL, { Authorization: `Bearer ${serverEnv.groqApiKey}` }, {
      model: GROQ_MODEL, max_tokens: 4000, temperature: 0.7, messages,
    });
    text = result.text;
    if (result.error) lastError = result.error;
    if (text) usedModel = GROQ_MODEL;

    // Groq가 마지막 보루이므로, 일시적 rate-limit 대비 1회 재시도
    if (!text) {
      await sleep(1500);
      result = await fetchText(GROQ_URL, { Authorization: `Bearer ${serverEnv.groqApiKey}` }, {
        model: GROQ_MODEL, max_tokens: 4000, temperature: 0.7, messages,
      });
      text = result.text;
      if (result.error) lastError = result.error;
      if (text) usedModel = GROQ_MODEL;
    }
  }

  if (!text) return { questions: [], model: null, error: lastError };
  const raw = extractJson(text);
  if (!raw) {
    console.error(`[interview] JSON 파싱 실패 (diff=${diff}), 원본 응답 끝부분:`, text.slice(-300));
    return { questions: [], model: usedModel, error: '응답을 해석하지 못했습니다 (형식 오류)' };
  }

  return {
    questions: (raw as Record<string, unknown>[]).slice(0, 10).map((q, i) => mapRaw(q, diff, i)),
    model: usedModel,
  };
}

export async function POST(request: NextRequest) {
  if (!serverEnv.openrouterApiKey && !serverEnv.groqApiKey) {
    return NextResponse.json({ error: 'AI 기능을 사용하려면 .env에 API 키를 설정해주세요.' }, { status: 501 });
  }

  const {
    ref_id,
    company_name,
    recruitment_notice,
    notes,
    urls,
    cover_letter_questions,
    difficulty,
    prompts,
  } = await request.json();

  const customPrompts = (prompts ?? {}) as Partial<Record<Difficulty, string>>;

  const contextParts: string[] = [];
  if (company_name)       contextParts.push(`회사/기관명: ${company_name}`);
  if (recruitment_notice) contextParts.push(`모집 요강:\n${recruitment_notice}`);
  if (notes)              contextParts.push(`기타 사항:\n${notes}`);
  if (urls?.length)       contextParts.push(`참고 URL:\n${(urls as { title: string; url: string }[]).map(u => `- ${u.title}: ${u.url}`).join('\n')}`);
  if (cover_letter_questions?.length) {
    contextParts.push(`자기소개서 문항:\n${(cover_letter_questions as string[]).map((q, i) => `${i + 1}. ${q}`).join('\n')}`);
  }

  const systemPrompt = `당신은 수천 건의 실제 면접 사례와 채용 프로세스를 분석한 전문 면접관입니다.
사용자가 제공하는 정보를 기반으로 실제 기업 면접에서 나올 가능성이 높은 질문을 생성합니다.
반드시 순수 JSON 배열만 출력합니다. 마크다운·설명·코드블록 없이 JSON 배열만 반환하세요.
오직 한국어로만 작성합니다.`;

  const makeMessages = (diff: Difficulty) => {
    const template = customPrompts[diff]?.trim() || DEFAULT_INTERVIEW_PROMPT;
    const content = template
      .split('{{context}}').join(contextParts.join('\n\n') || '(정보 없음)')
      .split('{{difficulty}}').join(DIFF_LABEL[diff]);
    return [
      { role: 'system', content: systemPrompt },
      { role: 'user', content },
    ];
  };

  const difficulties: Difficulty[] = difficulty === 'all' ? ['high', 'medium', 'low'] : [difficulty as Difficulty];

  // AI 생성 — 순차 실행 (병렬 시 Groq TPM 한도 초과로 중간 난이도 누락 방지)
  const generated: ReturnType<typeof mapRaw>[] = [];
  const models: Partial<Record<Difficulty, string>> = {};
  let lastError: string | undefined;
  for (const diff of difficulties) {
    const result = await generateForDifficulty(diff, makeMessages(diff));
    generated.push(...result.questions);
    if (result.model) models[diff] = result.model;
    if (result.error) lastError = result.error;
  }

  if (!ref_id || generated.length === 0) {
    return NextResponse.json({
      questions: generated.map((q, i) => ({ ...q, id: `tmp-${i}` })),
      models,
      error: lastError,
    });
  }

  // DB 저장: 해당 난이도 기존 데이터 삭제 후 신규 삽입
  // Supabase 쿼리 빌더는 immutable — 분기별로 별도 체인 사용
  const supabase = await createServerSupabaseClient();
  if (difficulty === 'all') {
    await supabase.from('interview_questions').delete().eq('ref_id', ref_id);
  } else {
    await supabase.from('interview_questions').delete().eq('ref_id', ref_id).eq('difficulty', difficulty);
  }

  const toInsert = generated.map(q => ({ ref_id, ...q }));
  const { data: saved, error } = await supabase
    .from('interview_questions')
    .insert(toInsert)
    .select();

  if (error || !saved) {
    console.error('[interview] DB 저장 오류:', error);
    return NextResponse.json({ questions: generated.map((q, i) => ({ ...q, id: `tmp-${i}` })), models });
  }

  return NextResponse.json({ questions: saved, models });
}
