import { NextRequest, NextResponse } from 'next/server';
import { callHubLlm } from '@/lib/hubProxy';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import type { WrittenTestQuestionType } from '@/lib/supabase';

const OR_MODELS = [
  'z-ai/glm-5.2:free',
  'minimax/minimax-m3:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
  'google/gemma-4-31b-it:free',
];
const GROQ_MODEL = 'openai/gpt-oss-120b';

const MIN_QUESTIONS = 4;
const MAX_QUESTIONS = 60;
const DEFAULT_QUESTIONS = 20;

// 4지선다 60% : 5지선다 25% : 단답형 15% 비율로 배분 (기본 20문제 기준 12/5/3과 동일)
function splitCounts(total: number): { choice4: number; choice5: number; short: number } {
  const choice4 = Math.round(total * 0.6);
  const choice5 = Math.round(total * 0.25);
  const short = Math.max(0, total - choice4 - choice5);
  return { choice4, choice5, short };
}

function typeForIndex(i: number, choice4: number, choice5: number): WrittenTestQuestionType {
  if (i < choice4) return 'choice4';
  if (i < choice4 + choice5) return 'choice5';
  return 'short';
}

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

function toStrArr(v: unknown): string[] {
  return Array.isArray(v) ? v.map(String) : [];
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchText(
  provider: 'openrouter' | 'groq',
  model: string,
  messages: { role: string; content: string }[],
  opts: { maxTokens?: number; temperature?: number } = {},
): Promise<{ text: string | null; error?: string }> {
  try {
    const res = await callHubLlm(provider, model, messages, opts);
    if (!res.ok) {
      const errBody = await res.text();
      const message = extractErrorMessage(errBody);
      console.error(`[written-test] ${model} 호출 실패: ${res.status} ${errBody.slice(0, 300)}`);
      return { text: null, error: message };
    }
    const data = await res.json();
    return { text: (data.choices?.[0]?.message?.content ?? '').trim() || null };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[written-test] ${model} 호출 예외:`, e);
    return { text: null, error: message };
  }
}

// 일부 모델이 한글 응답 중간에 한자를 섞어 내보내는 경우가 있어 제거한다.
function sanitizeKorean(text: string): string {
  return text
    .replace(/[一-鿿㐀-䶿]/g, '')
    .replace(/ {2,}/g, ' ')
    .trim();
}

function mapItem(
  raw: Record<string, unknown>, i: number, categoryId: string, choice4: number, choice5: number,
) {
  const type = typeForIndex(i, choice4, choice5);
  const question = sanitizeKorean(String(raw.question ?? '').trim());
  const explanation = sanitizeKorean(String(raw.explanation ?? '').trim());

  if (type === 'short') {
    return {
      category_id: categoryId,
      type,
      question,
      choices: null,
      answer: sanitizeKorean(String(raw.answer ?? '').trim()),
      explanation,
      sort_order: i,
    };
  }

  const expected = type === 'choice4' ? 4 : 5;
  const choices = toStrArr(raw.choices).map(c => sanitizeKorean(c.trim())).filter(Boolean).slice(0, expected);
  while (choices.length < expected) choices.push(`선택지 ${choices.length + 1}`);

  const rawIdx = Number(raw.answer_index);
  const answerIdx = Number.isInteger(rawIdx) && rawIdx >= 0 && rawIdx < choices.length ? rawIdx : 0;

  return {
    category_id: categoryId,
    type,
    question,
    choices,
    answer: choices[answerIdx],
    explanation,
    sort_order: i,
  };
}

export async function POST(request: NextRequest) {
  const {
    category_id,
    category_name,
    category_description,
    company_name,
    recruitment_notice,
    notes,
    question_count,
  } = await request.json();

  if (!category_id || !category_name?.trim()) {
    return NextResponse.json({ error: '카테고리 정보가 없습니다.' }, { status: 400 });
  }

  const rawCount = Number(question_count);
  const TOTAL_COUNT = Number.isInteger(rawCount)
    ? Math.min(Math.max(rawCount, MIN_QUESTIONS), MAX_QUESTIONS)
    : DEFAULT_QUESTIONS;
  const { choice4: CHOICE4_COUNT, choice5: CHOICE5_COUNT } = splitCounts(TOTAL_COUNT);
  const maxTokens = Math.min(Math.max(TOTAL_COUNT * 300, 3000), 16000);

  const contextParts: string[] = [];
  if (company_name)       contextParts.push(`회사/기관명: ${company_name}`);
  if (recruitment_notice) contextParts.push(`모집 요강:\n${recruitment_notice}`);
  if (notes)              contextParts.push(`기타 사항:\n${notes}`);

  const systemPrompt = `당신은 채용 필기시험 출제 전문가입니다.
사용자가 제공하는 카테고리와 설명을 바탕으로 실제 필기시험에 나올 법한 문제를 출제합니다.
반드시 순수 JSON 배열만 출력합니다. 마크다운·설명·코드블록 없이 JSON 배열만 반환하세요.
오직 한국어로만 작성합니다.`;

  const userPrompt = `## 회사/기관 정보
${contextParts.join('\n\n') || '(정보 없음)'}

## 출제 카테고리
${category_name}

## 카테고리 설명
${category_description?.trim() || '(설명 없음)'}

## 출제 조건
- 반드시 정확히 ${TOTAL_COUNT}문제를 아래 순서·개수로 출제합니다.
  1~${CHOICE4_COUNT}번: 4지선다 (choice4)
  ${CHOICE4_COUNT + 1}~${CHOICE4_COUNT + CHOICE5_COUNT}번: 5지선다 (choice5)
  ${CHOICE4_COUNT + CHOICE5_COUNT + 1}~${TOTAL_COUNT}번: 단답형 (short)
- 카테고리와 설명 내용에 근거한 실무·이론 지식을 평가하는 문제로 구성합니다.
- 선택지는 명확히 구분되며 오답도 그럴듯하게 작성합니다.
- 단답형은 한두 단어~한 문장으로 답할 수 있는 명확한 정답이 있는 문제로 작성합니다.
- explanation에는 왜 그 답이 정답인지 간결하게 설명합니다.

## 출력 형식 (JSON 배열만, 정확히 ${TOTAL_COUNT}개)
[
  {
    "type": "choice4",
    "question": "문제 내용",
    "choices": ["선택지1", "선택지2", "선택지3", "선택지4"],
    "answer_index": 0,
    "explanation": "정답 해설"
  },
  ...
  {
    "type": "short",
    "question": "문제 내용",
    "answer": "모범 정답",
    "explanation": "정답 해설"
  }
]`;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user',   content: userPrompt },
  ];

  let text: string | null = null;
  let lastError: string | undefined;

  for (const model of OR_MODELS) {
    const result = await fetchText('openrouter', model, messages, { maxTokens });
    text = result.text;
    if (result.error) lastError = result.error;
    if (text) break;
  }

  if (!text) {
    let result = await fetchText('groq', GROQ_MODEL, messages, { maxTokens, temperature: 0.7 });
    text = result.text;
    if (result.error) lastError = result.error;

    if (!text) {
      await sleep(1500);
      result = await fetchText('groq', GROQ_MODEL, messages, { maxTokens, temperature: 0.7 });
      text = result.text;
      if (result.error) lastError = result.error;
    }
  }

  if (!text) {
    return NextResponse.json({ questions: [], error: lastError ?? 'AI 응답을 받지 못했습니다.' });
  }

  const raw = extractJson(text);
  if (!raw) {
    console.error('[written-test] JSON 파싱 실패, 원본 응답 끝부분:', text.slice(-300));
    return NextResponse.json({ questions: [], error: '응답을 해석하지 못했습니다 (형식 오류)' });
  }

  const mapped = raw.slice(0, TOTAL_COUNT).map((q, i) =>
    mapItem(q as Record<string, unknown>, i, category_id, CHOICE4_COUNT, CHOICE5_COUNT));
  // AI가 개수를 못 채운 경우를 대비해 부족분은 생성하지 않고 있는 만큼만 저장한다.

  const supabase = await createServerSupabaseClient();
  await supabase.from('written_test_questions').delete().eq('category_id', category_id);

  const { data: saved, error } = await supabase
    .from('written_test_questions')
    .insert(mapped)
    .select();

  if (error || !saved) {
    console.error('[written-test] DB 저장 오류:', error);
    return NextResponse.json({ questions: mapped.map((q, i) => ({ ...q, id: `tmp-${i}` })) });
  }

  return NextResponse.json({ questions: saved });
}
