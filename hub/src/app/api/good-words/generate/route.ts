import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { getCategoryLabel } from '@/lib/goodWords/categoriesDb';
import { callChatWithFallback } from '@/lib/goodWords/aiProviders';
import { filterGoodWordsBatch, MIN_LENGTH as GUARDRAIL_MIN, MAX_LENGTH as GUARDRAIL_MAX } from '@/lib/goodWords/guardrail';
import { handleApiError } from '@/lib/goodWords/apiError';

const GENERATE_COUNT = 15;

// LLM은 숫자 글자수 지시만으로는 분량을 잘 못 맞추고 한두 문장짜리 짧은 명언체로 회귀하는
// 경향이 강하다(Groq llama-3.3-70b 실측 확인 — 80~150자 지시에도 13~76자짜리를 반복 생성).
// 범위의 하한·상한에 각각 걸치는 예시 2개를 동시에 주고 "이 두 예시 사이 분량"이라고
// 프레이밍하면 훨씬 안정적으로 맞춘다(단일 예시 + 문구 경고만으로는 부족했음).
const SHORT_EXAMPLE =
  '오늘 하루도 마음이 많이 지쳤죠. 애써 괜찮은 척하지 않아도 돼요. ' +
  '지금은 잠시 멈춰 숨을 골라도 괜찮습니다. 당신의 속도대로 천천히 걸어가면 충분합니다.';
const LONG_EXAMPLE =
  '오늘 하루도 마음이 많이 지쳤죠. 애써 괜찮은 척하지 않아도 돼요. ' +
  '흔들리는 날이 있다는 건 그만큼 열심히 살아왔다는 증거니까요. 지금은 잠시 멈춰 숨을 골라도 괜찮습니다. ' +
  '당신의 속도대로 천천히 걸어가면 그것으로 충분합니다.';

function buildPrompt(label: string, count: number, isRetry: boolean) {
  const system =
    '당신은 따뜻한 위로와 공감의 글을 쓰는 작가입니다. 다음 조건을 모두 지켜 한국어로 글을 씁니다.\n' +
    `- 분량: 반드시 3~4개의 문장으로 구성해 공백 포함 ${GUARDRAIL_MIN}자~${GUARDRAIL_MAX}자 사이로 쓸 것. ` +
    `아래 두 예시(각각 ${SHORT_EXAMPLE.length}자, ${LONG_EXAMPLE.length}자)가 허용 분량의 하한·상한이니, ` +
    '반드시 그 사이 분량으로 쓸 것. 이보다 짧은 한두 문장짜리 명언체는 절대 금지 — ' +
    '다 쓴 뒤 글자 수를 세어보고 짧으면 문장이나 구절을 추가해 반드시 범위 안으로 늘릴 것\n' +
    '- 톤: 따뜻함, 공감, 희망, 여운, 위로\n' +
    '- 금지: 정치적 발언, 혐오·차별 표현, 타인과의 우열/등수 비교, 욕설이나 공격적 표현\n' +
    '- 출력 형식: 다른 설명이나 코드블록 없이 JSON 문자열 배열만 출력\n\n' +
    `분량 하한 예시(${SHORT_EXAMPLE.length}자, 내용은 참고만 하고 그대로 베끼지 말 것):\n"${SHORT_EXAMPLE}"\n\n` +
    `분량 상한 예시(${LONG_EXAMPLE.length}자, 내용은 참고만 하고 그대로 베끼지 말 것):\n"${LONG_EXAMPLE}"` +
    (isRetry
      ? `\n\n경고: 이전 시도에서 생성한 글들이 전부 너무 짧아서(${GUARDRAIL_MIN}자 미만) 반려되었다. ` +
        `이번에는 반드시 위 두 예시 사이 분량(최소 ${GUARDRAIL_MIN}자 이상)으로 작성할 것.`
      : '');
  const user = `카테고리 "${label}"를 주제로, 서로 다른 내용의 좋은 글 ${count}개를 JSON 배열로 생성해줘. 각 글은 두 예시 사이의 문장 수와 분량을 반드시 지켜줘.`;
  return { system, user };
}

function extractJsonArray(content: string): string[] {
  const stripped = content.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = stripped.indexOf('[');
  const end = stripped.lastIndexOf(']');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('LLM 응답에서 JSON 배열을 찾지 못했습니다.');
  }
  const parsed = JSON.parse(stripped.slice(start, end + 1));
  if (!Array.isArray(parsed) || !parsed.every((v) => typeof v === 'string')) {
    throw new Error('LLM 응답이 문자열 배열 형식이 아닙니다.');
  }
  return parsed;
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const category = body?.category;
  if (typeof category !== 'string' || !category) {
    return NextResponse.json({ error: '유효하지 않은 카테고리입니다.' }, { status: 400 });
  }

  const MAX_ATTEMPTS = 5;

  try {
    const label = await getCategoryLabel(category);
    if (!label) {
      return NextResponse.json({ error: '존재하지 않는 카테고리입니다.' }, { status: 400 });
    }

    const passed: string[] = [];
    const seen = new Set<string>();
    let rejectedCount = 0;
    let lastProvider = '';
    const allFailures: string[] = [];

    // 무료 모델은 분량 지시를 잘 못 맞추고 대부분 짧게 써서 가드레일 통과율이 ~40% 수준이다
    // (실측 확인) — 매번 부족분의 2배를 요청해 통과율 손실을 보정하고, 그래도 못 채우면
    // 더 강한 경고와 함께 재시도한다.
    for (let attempt = 0; attempt < MAX_ATTEMPTS && passed.length < GENERATE_COUNT; attempt++) {
      const remaining = GENERATE_COUNT - passed.length;
      const requestCount = Math.min(remaining * 2, 30);
      const { system, user: userPrompt } = buildPrompt(label, requestCount, attempt > 0);

      const { content, provider, failures } = await callChatWithFallback(
        [
          { role: 'system', content: system },
          { role: 'user', content: userPrompt },
        ],
        { maxTokens: 3000, temperature: 0.75 }
      );
      lastProvider = provider;
      allFailures.push(...failures);

      const rawTexts = extractJsonArray(content);
      const { passed: batchPassed, rejected } = filterGoodWordsBatch(rawTexts);
      if (batchPassed.length === 0 && rawTexts.length > 0) {
        console.warn(
          `[good-words/generate] attempt ${attempt}: ${provider} 응답 ${rawTexts.length}개 전부 반려 — `,
          rejected.map((r) => `${r.text.length}자(${r.reason})`).join(', ')
        );
      }
      // 무료 모델은 같은 문장을 순서만 바꿔 여러 번 반복하는 경향이 있어(실측 확인),
      // 정확히 같은 텍스트는 보관함에 중복 저장되지 않도록 여기서 걸러낸다.
      for (const text of batchPassed) {
        if (passed.length >= GENERATE_COUNT) break;
        if (!seen.has(text)) {
          seen.add(text);
          passed.push(text);
        }
      }
      rejectedCount += rejected.length;
    }

    return NextResponse.json({
      texts: passed,
      provider: lastProvider,
      providerFailures: allFailures,
      rejectedCount,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
