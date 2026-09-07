import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { SUPER_ADMIN_EMAIL } from '@/lib/apps';
import { callChatWithClaudeFirst, callClaude, ChatFallbackResult, ChatMessage } from '@/lib/goodWords/aiProviders';
import { handleApiError } from '@/lib/goodWords/apiError';

const DEFAULT_GENERATE_COUNT = 20;
const DEFAULT_MIN_CONTENT_LENGTH = 10;
const DEFAULT_MAX_CONTENT_LENGTH = 400;
const MIN_GENERATE_COUNT = 1;
const MAX_GENERATE_COUNT = 50;
const MIN_MAX_CONTENT_LENGTH = 10;
const MAX_MAX_CONTENT_LENGTH = 4000;
const MAX_ATTEMPTS = 4;
const MAX_PROMPT_LENGTH = 4000;
// 요청한 개수 중 일부를 원문 검색이 아니라 Claude가 새로 짓는 창작 파트로 채우는 기능
// (source에 "직접 창작"이라고 명시해 투명하게 섞는 방식) — GOOD_WORDS_ANTHROPIC_API_KEY
// 발급 전까지는 0으로 꺼두고 전량 원문 인용으로 생성한다(2026-09-07, 사용자 요청).
const CREATIVE_RATIO = 0;

function outputFormatHint(kind: 'quote' | 'created', minContentLength: number, maxContentLength: number) {
  const sourceInstruction = kind === 'quote'
    ? `source는 "저자명 · 자료명" 형식(가운데점은 U+00B7 MIDDLE DOT, 예: "이효석 · 낙엽을 태우면서")으로 실제 원문의 출처를 적어주세요.`
    : `이 요청의 항목들은 실제 원문 인용이 아니라 당신이 새로 지어낸 창작 글입니다 — 실존 원문을 흉내내거나 특정 저자의 글인 것처럼 출처를 지어내지 마세요. source는 항상 정확히 "직접 창작"이라고만 적어주세요.`;
  return (
    `\n\n요청한 개수만큼 서로 다른 항목을 JSON 배열로만 응답하세요(다른 설명이나 코드블록 없이). ` +
    `각 항목은 반드시 {"content": "...", "source": "...", "translation": "..."} 형태여야 합니다. ` +
    // 짧게 쓰고 끝내는 경향이 있어(실측 확인) 하한선을 구체적으로 재차 강조 — 단순히
    // "N~M자 사이"라고만 하면 모델이 하한을 자주 무시하고 훨씬 짧게 쓴다.
    `content는 반드시 최소 ${minContentLength}자, 최대 ${maxContentLength}자여야 합니다 — ${minContentLength}자보다 짧으면 안 됩니다. ` +
    `짧게 쓰고 싶은 유혹이 들어도 문장을 더 이어서 반드시 ${minContentLength}자를 넘기세요. ` +
    `${sourceInstruction} ` +
    `content가 한국어가 아니면 translation에 자연스러운 한국어 번역을 넣고, content가 이미 한국어면 translation은 빈 문자열 ""로 두세요.`
  );
}

interface QuoteItem {
  content: string;
  source: string;
  translation: string;
}

function normalizeItems(parsed: unknown[], minContentLength: number, maxContentLength: number): QuoteItem[] {
  return parsed
    .filter((v): v is Record<string, unknown> => v !== null && typeof v === 'object')
    .map((v) => ({
      content: typeof v.content === 'string' ? v.content.trim() : '',
      source: typeof v.source === 'string' ? v.source.trim() : '',
      translation: typeof v.translation === 'string' ? v.translation.trim() : '',
    }))
    // 글자수 범위를 프롬프트로만 지시하면 모델이 자주 벗어나므로(실측 확인) 코드에서 하드 컷.
    .filter((v) => v.content && v.source && v.content.length >= minContentLength && v.content.length <= maxContentLength);
}

// Groq처럼 completion 토큰을 provider별로 낮게 잘라야 하는 경우(aiProviders.ts의
// maxTokensCap 참고) 20개를 한 번에 다 못 채우고 배열 중간에서 응답이 잘리는 경우가 흔하다
// (실측 확인) — 마지막으로 완성된 "},{" 경계까지만 잘라 배열을 닫는 방식으로 부분 응답이라도
// 최대한 살린다. 아예 완성된 항목이 하나도 없으면 그때만 예외를 던진다.
function extractJsonArray(raw: string, minContentLength: number, maxContentLength: number): QuoteItem[] {
  const stripped = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = stripped.indexOf('[');
  if (start === -1) {
    throw new Error('LLM 응답에서 JSON 배열을 찾지 못했습니다.');
  }
  const body = stripped.slice(start);

  const candidates: string[] = [];
  const lastBracket = body.lastIndexOf(']');
  if (lastBracket !== -1) candidates.push(body.slice(0, lastBracket + 1));
  const lastCompleteObj = body.lastIndexOf('},');
  if (lastCompleteObj !== -1) candidates.push(body.slice(0, lastCompleteObj + 1) + ']');
  const lastCurly = body.lastIndexOf('}');
  if (lastCurly !== -1 && lastCurly > lastBracket) candidates.push(body.slice(0, lastCurly + 1) + ']');

  for (const candidate of candidates) {
    try {
      const parsed: unknown = JSON.parse(candidate);
      if (Array.isArray(parsed)) {
        const items = normalizeItems(parsed, minContentLength, maxContentLength);
        if (items.length > 0) return items;
      }
    } catch {
      // 다음 후보 시도
    }
  }

  throw new Error('LLM 응답에서 완성된 JSON 항목을 하나도 찾지 못했습니다.');
}

/**
 * 카테고리 편집 모달에서 (아직 저장하지 않았을 수도 있는) 프롬프트 텍스트를 그대로 받아
 * 생성만 수행한다 — 카테고리 DB 조회 없이 prompt 문자열 자체가 입력이라, "저장 전 프롬프트
 * 테스트"가 자연스럽게 된다. 저장은 별도로 POST /api/good-words가 담당한다.
 */
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  // 생성 버튼은 카테고리 관리 모달 안에만 있어 UI상 SUPER_ADMIN만 도달하지만, 공유 LLM
  // 쿼터를 쓰는 라우트라 다른 쓰기 라우트와 동일하게 서버에서도 명시적으로 막는다.
  if (!user || user.email !== SUPER_ADMIN_EMAIL) {
    return NextResponse.json({ error: '생성 권한이 없습니다.' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt) {
    return NextResponse.json({ error: 'AI 프롬프트를 입력해주세요.' }, { status: 400 });
  }
  if (prompt.length > MAX_PROMPT_LENGTH) {
    return NextResponse.json({ error: `AI 프롬프트는 ${MAX_PROMPT_LENGTH}자 이내로 입력해주세요.` }, { status: 400 });
  }

  // 카테고리 관리 모달의 "글자수"(최소~최대)/"문장 개수" 입력값을 그대로 받는다 — 지정하지
  // 않으면(구버전 호출 등) 기존 기본값으로 동작한다.
  const minContentLength = Number.isInteger(body?.minLength) ? body.minLength : DEFAULT_MIN_CONTENT_LENGTH;
  const maxContentLength = Number.isInteger(body?.maxLength) ? body.maxLength : DEFAULT_MAX_CONTENT_LENGTH;
  if (minContentLength < MIN_MAX_CONTENT_LENGTH || minContentLength > MAX_MAX_CONTENT_LENGTH) {
    return NextResponse.json({ error: `글자수(최소)는 ${MIN_MAX_CONTENT_LENGTH}~${MAX_MAX_CONTENT_LENGTH} 사이여야 합니다.` }, { status: 400 });
  }
  if (maxContentLength < MIN_MAX_CONTENT_LENGTH || maxContentLength > MAX_MAX_CONTENT_LENGTH) {
    return NextResponse.json({ error: `글자수(최대)는 ${MIN_MAX_CONTENT_LENGTH}~${MAX_MAX_CONTENT_LENGTH} 사이여야 합니다.` }, { status: 400 });
  }
  if (minContentLength > maxContentLength) {
    return NextResponse.json({ error: '글자수 최소값은 최대값보다 클 수 없습니다.' }, { status: 400 });
  }
  const generateCount = Number.isInteger(body?.generateCount) ? body.generateCount : DEFAULT_GENERATE_COUNT;
  if (generateCount < MIN_GENERATE_COUNT || generateCount > MAX_GENERATE_COUNT) {
    return NextResponse.json({ error: `문장 개수는 ${MIN_GENERATE_COUNT}~${MAX_GENERATE_COUNT} 사이여야 합니다.` }, { status: 400 });
  }

  // 무료 모델이 요청 개수를 다 못 채우거나 완전 동일한 항목을 중복 반환하는 경우가 있어
  // (실측 확인), 부족분의 2배를 요청하며 최대 4회까지 재시도한다. 원문 정확성 자체는
  // 검증하지 않는다 — LLM이 실제 출판물 원문을 글자 단위로 정확히 재현한다는 보장은 없음.
  async function runBatch(
    targetCount: number,
    kind: 'quote' | 'created',
    systemPrompt: string,
    chatFn: (messages: ChatMessage[], opts: { maxTokens: number; temperature: number }) => Promise<ChatFallbackResult>,
  ): Promise<{ items: QuoteItem[]; provider: string; failures: string[] }> {
    const passed: QuoteItem[] = [];
    const seen = new Set<string>();
    let lastProvider = '';
    const failures: string[] = [];
    if (targetCount <= 0) return { items: passed, provider: lastProvider, failures };

    for (let attempt = 0; attempt < MAX_ATTEMPTS && passed.length < targetCount; attempt++) {
      const remaining = targetCount - passed.length;
      // 한 번에 많이 요청할수록(30개 이상) 뒤로 갈수록 문단이 급격히 짧아지며 길이 조건을
      // 못 지키는 경향이 실측 확인됨(예: 30개 요청 시 33개 중 2개만 200~300자 통과) — 배치를
      // 작게 유지해야 품질이 안정적이라 15개로 상한을 두고, 대신 재시도 횟수(MAX_ATTEMPTS)로
      // 부족분을 채운다.
      const requestCount = Math.min(remaining * 2, 15);
      const userPrompt = `위 조건에 맞는 항목을 ${requestCount}개 찾아주세요.${outputFormatHint(kind, minContentLength, maxContentLength)}`;

      try {
        const { content, provider, failures: chatFailures } = await chatFn(
          [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          { maxTokens: 8000, temperature: 0.8 }
        );
        lastProvider = provider;
        failures.push(...chatFailures);

        // 파싱 실패(예: provider별 토큰 상한 때문에 배열 중간에서 응답이 잘림)는 이번 시도만
        // 버리고 다음 시도로 넘어간다 — 전체 요청을 실패시키지 않는다.
        try {
          const items = extractJsonArray(content, minContentLength, maxContentLength);
          for (const item of items) {
            if (passed.length >= targetCount) break;
            if (!seen.has(item.content)) {
              seen.add(item.content);
              passed.push(item);
            }
          }
        } catch (err) {
          failures.push(err instanceof Error ? err.message : String(err));
        }
      } catch (err) {
        failures.push(err instanceof Error ? err.message : String(err));
      }
    }

    return { items: passed, provider: lastProvider, failures };
  }

  try {
    // 요청 개수의 1/3은 창작(Claude), 나머지는 기존 원문 검색용 폴백 체인(openrouter/groq/hf) —
    // 두 트랙을 병렬로 돌려 지연시간을 늘리지 않는다.
    const creativeCount = Math.round(generateCount * CREATIVE_RATIO);
    const quoteCount = generateCount - creativeCount;
    const creativeSystemPrompt =
      `${prompt}\n\n단, 이번 요청은 원문을 찾지 말고 위 기준과 분위기에 맞는 완전히 새로운 글을 직접 창작하세요. ` +
      `실제 원문을 인용하거나 특정 저자의 글인 것처럼 재현하려 하지 마세요.`;

    const [quoteResult, creativeResult] = await Promise.all([
      runBatch(quoteCount, 'quote', prompt, callChatWithClaudeFirst),
      runBatch(creativeCount, 'created', creativeSystemPrompt, callClaude),
    ]);

    const passed = [...quoteResult.items, ...creativeResult.items];
    const allFailures = [...quoteResult.failures, ...creativeResult.failures];
    const lastProvider = [quoteResult.provider, creativeResult.provider].filter(Boolean).join(' + ');

    if (passed.length === 0) {
      throw new Error(allFailures.join(' / ') || '생성된 항목이 없습니다.');
    }

    return NextResponse.json({
      items: passed,
      provider: lastProvider,
      providerFailures: allFailures,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
