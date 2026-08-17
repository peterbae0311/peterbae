import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { SUPER_ADMIN_EMAIL } from '@/lib/apps';
import { callChatWithFallback } from '@/lib/goodWords/aiProviders';
import { handleApiError } from '@/lib/goodWords/apiError';

const GENERATE_COUNT = 20;
const MAX_CONTENT_LENGTH = 400;
const MAX_ATTEMPTS = 3;
const MAX_PROMPT_LENGTH = 4000;

const OUTPUT_FORMAT_HINT =
  `\n\n요청한 개수만큼 서로 다른 항목을 JSON 배열로만 응답하세요(다른 설명이나 코드블록 없이). ` +
  `각 항목은 반드시 {"content": "...", "source": "저자명 · 자료명"} 형태여야 합니다 ` +
  `(content는 ${MAX_CONTENT_LENGTH}자 이내, source는 "저자명 · 자료명" 형식 — 가운데점은 U+00B7 MIDDLE DOT — 예: "이효석 · 낙엽을 태우면서").`;

interface QuoteItem {
  content: string;
  source: string;
}

function normalizeItems(parsed: unknown[]): QuoteItem[] {
  return parsed
    .filter((v): v is Record<string, unknown> => v !== null && typeof v === 'object')
    .map((v) => ({
      content: typeof v.content === 'string' ? v.content.trim() : '',
      source: typeof v.source === 'string' ? v.source.trim() : '',
    }))
    // 400자 한도는 프롬프트로만 지시하면 모델이 자주 넘기므로(실측 확인) 코드에서 하드 컷.
    .filter((v) => v.content && v.source && v.content.length <= MAX_CONTENT_LENGTH);
}

// Groq처럼 completion 토큰을 provider별로 낮게 잘라야 하는 경우(aiProviders.ts의
// maxTokensCap 참고) 20개를 한 번에 다 못 채우고 배열 중간에서 응답이 잘리는 경우가 흔하다
// (실측 확인) — 마지막으로 완성된 "},{" 경계까지만 잘라 배열을 닫는 방식으로 부분 응답이라도
// 최대한 살린다. 아예 완성된 항목이 하나도 없으면 그때만 예외를 던진다.
function extractJsonArray(raw: string): QuoteItem[] {
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
        const items = normalizeItems(parsed);
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

  try {
    const passed: QuoteItem[] = [];
    const seen = new Set<string>();
    let lastProvider = '';
    const allFailures: string[] = [];

    // 무료 모델이 요청 개수를 다 못 채우거나 완전 동일한 항목을 중복 반환하는 경우가 있어
    // (실측 확인), 부족분의 2배를 요청하며 최대 3회까지 재시도한다. 원문 정확성 자체는
    // 검증하지 않는다 — LLM이 실제 출판물 원문을 글자 단위로 정확히 재현한다는 보장은 없음.
    for (let attempt = 0; attempt < MAX_ATTEMPTS && passed.length < GENERATE_COUNT; attempt++) {
      const remaining = GENERATE_COUNT - passed.length;
      const requestCount = Math.min(remaining * 2, 30);
      const userPrompt = `위 조건에 맞는 항목을 ${requestCount}개 찾아주세요.${OUTPUT_FORMAT_HINT}`;

      const { content, provider, failures } = await callChatWithFallback(
        [
          { role: 'system', content: prompt },
          { role: 'user', content: userPrompt },
        ],
        { maxTokens: 8000, temperature: 0.8 }
      );
      lastProvider = provider;
      allFailures.push(...failures);

      // 파싱 실패(예: provider별 토큰 상한 때문에 배열 중간에서 응답이 잘림)는 이번 시도만
      // 버리고 다음 시도로 넘어간다 — 전체 요청을 실패시키지 않는다.
      try {
        const items = extractJsonArray(content);
        for (const item of items) {
          if (passed.length >= GENERATE_COUNT) break;
          if (!seen.has(item.content)) {
            seen.add(item.content);
            passed.push(item);
          }
        }
      } catch (err) {
        allFailures.push(err instanceof Error ? err.message : String(err));
      }
    }

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
