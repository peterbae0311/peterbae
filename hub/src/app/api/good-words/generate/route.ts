import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { isValidCategoryKey, categoryLabel } from '@/lib/goodWords/categories';
import { callChatWithFallback } from '@/lib/goodWords/aiProviders';
import { filterGoodWordsBatch } from '@/lib/goodWords/guardrail';
import { handleApiError } from '@/lib/goodWords/apiError';

const GENERATE_COUNT = 30;

// LLM은 "150~200자"라는 숫자 지시만으로는 실제 글자 수를 잘 맞추지 못하고 한두 문장짜리
// 짧은 명언체를 쓰는 경향이 있다(Groq llama-3.3-70b 실측 확인) — 문장 수 지시 + 목표 분량과
// 정확히 일치하는 예시를 함께 주면 훨씬 안정적으로 분량을 맞춘다.
const LENGTH_EXAMPLE =
  '오늘 하루도 마음이 많이 지쳤죠. 애써 괜찮은 척하지 않아도 돼요. 누구에게나 흔들리는 날이 있고, ' +
  '그 흔들림조차 당신이 열심히 살아왔다는 증거니까요. 지금은 잠시 멈춰 숨을 골라도 괜찮습니다. ' +
  '서두르지 않아도 되니, 당신의 속도대로 걸어가면 됩니다. 내일은 오늘보다 조금 더 가벼운 마음으로 눈을 뜰 수 있을 거예요.';

function buildPrompt(label: string, count: number, isRetry: boolean) {
  const system =
    '당신은 따뜻한 위로와 공감의 글을 쓰는 작가입니다. 다음 조건을 모두 지켜 한국어로 글을 씁니다.\n' +
    '- 분량: 반드시 5~7개의 문장으로 구성해 공백 포함 170자~190자 사이로 쓸 것. ' +
    '150자 미만은 절대 금지 — 다 쓴 뒤 글자 수를 세어보고 150자가 안 되면 문장을 더 추가해서 늘릴 것. ' +
    '한두 문장짜리 짧은 명언은 금지, 아래 예시와 비슷하거나 더 긴 호흡과 분량으로 쓸 것\n' +
    '- 톤: 따뜻함, 공감, 희망, 여운, 위로\n' +
    '- 금지: 정치적 발언, 혐오·차별 표현, 타인과의 우열/등수 비교, 욕설이나 공격적 표현\n' +
    '- 출력 형식: 다른 설명이나 코드블록 없이 JSON 문자열 배열만 출력\n\n' +
    `분량 기준 예시(총 ${LENGTH_EXAMPLE.length}자, 내용은 참고만 하고 그대로 베끼지 말 것):\n"${LENGTH_EXAMPLE}"` +
    (isRetry
      ? '\n\n경고: 이전 시도에서 생성한 글들이 전부 150자 미만이라 반려되었다. ' +
        '이번에는 반드시 예시(총 ' + LENGTH_EXAMPLE.length + '자)와 비슷하거나 더 긴 분량으로 작성할 것.'
      : '');
  const user = `카테고리 "${label}"를 주제로, 서로 다른 내용의 좋은 글 ${count}개를 JSON 배열로 생성해줘. 각 글은 예시와 비슷한 문장 수와 분량을 반드시 지켜줘.`;
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
  if (!isValidCategoryKey(category)) {
    return NextResponse.json({ error: '유효하지 않은 카테고리입니다.' }, { status: 400 });
  }

  const label = categoryLabel(category);
  const MAX_ATTEMPTS = 3;

  try {
    const passed: string[] = [];
    const seen = new Set<string>();
    let rejectedCount = 0;
    let lastProvider = '';
    const allFailures: string[] = [];

    // 무료 모델은 "150~200자" 지시만으로는 분량을 잘 못 맞추고 대부분 짧게 쓴다(실측 확인).
    // 한 번에 목표 개수를 못 채우면, 부족한 만큼만 더 강한 경고와 함께 재시도한다.
    for (let attempt = 0; attempt < MAX_ATTEMPTS && passed.length < GENERATE_COUNT; attempt++) {
      const remaining = GENERATE_COUNT - passed.length;
      const { system, user: userPrompt } = buildPrompt(label, remaining, attempt > 0);

      const { content, provider, failures } = await callChatWithFallback(
        [
          { role: 'system', content: system },
          { role: 'user', content: userPrompt },
        ],
        { maxTokens: 6000, temperature: 0.75 }
      );
      lastProvider = provider;
      allFailures.push(...failures);

      const rawTexts = extractJsonArray(content);
      const { passed: batchPassed, rejected } = filterGoodWordsBatch(rawTexts);
      // 무료 모델은 같은 문장을 순서만 바꿔 여러 번 반복하는 경향이 있어(실측 확인),
      // 정확히 같은 텍스트는 보관함에 중복 저장되지 않도록 여기서 걸러낸다.
      for (const text of batchPassed) {
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
