/**
 * AI 유틸리티 — OpenRouter / Groq
 * 모든 API 키는 서버 전용 (NEXT_PUBLIC_ 절대 사용 금지)
 */

// ── OpenRouter 호출 ────────────────────────────────────────
// 기본 모델: Mistral (Google 모델은 504 타임아웃 빈번 → 제외)
export async function callOpenRouter(
  prompt: string,
  model = "openrouter/free",
  maxTokens = 2048
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY 환경변수 없음");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000); // 60초 타임아웃

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://news-analyzer.local",
        "X-Title": "News Article Analyzer",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: maxTokens,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenRouter 오류: ${res.status} — ${errText}`);
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? "";
  } finally {
    clearTimeout(timer);
  }
}

// openrouter/free: OpenRouter가 현재 사용 가능한 무료 모델을 자동 선택
export async function callOpenRouterWithFallback(prompt: string, maxTokens = 2048): Promise<string> {
  return callOpenRouter(prompt, "openrouter/free", maxTokens);
}

// ── Groq 호출 (빠른 번역/요약용) ──────────────────────────
export async function callGroq(
  prompt: string,
  model = "llama-3.3-70b-versatile",
  maxTokens = 2048
): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY 환경변수 없음");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000); // 45초 타임아웃

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
        max_tokens: maxTokens,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Groq 오류: ${res.status} — ${errText}`);
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? "";
  } finally {
    clearTimeout(timer);
  }
}

// ── 서브카테고리 생성 결과 타입 ────────────────────────────
type SubcategoryAI = {
  name: string;
  description: string;
  rss_sources: string[];
  tags: string[];
};

/**
 * AI 응답 JSON이 서브카테고리 배열 형식인지 검증 후 반환.
 * 잘린 JSON도 완성된 객체만 추출해 복구 시도.
 */
function parseSubcategoriesJson(raw: string): SubcategoryAI[] | null {
  const startIdx = raw.indexOf("[");
  if (startIdx === -1) return null;

  const jsonStr = raw.slice(startIdx);

  // 후보 문자열 목록: 원본, 마지막 } 뒤에 ] 추가한 복구본
  const candidates: string[] = [];

  const lastBracket = jsonStr.lastIndexOf("]");
  if (lastBracket !== -1) candidates.push(jsonStr.slice(0, lastBracket + 1));

  // 잘린 경우: 마지막으로 완성된 },{...} 이후를 버리고 배열 닫기
  const lastCompleteObj = jsonStr.lastIndexOf("},");
  if (lastCompleteObj !== -1) candidates.push(jsonStr.slice(0, lastCompleteObj + 1) + "]");

  const lastCurly = jsonStr.lastIndexOf("}");
  if (lastCurly !== -1 && lastCurly > (lastBracket ?? -1)) {
    candidates.push(jsonStr.slice(0, lastCurly + 1) + "]");
  }

  // rss_sources / tags가 문자열로 오면 배열로 정규화
  const normalizeItem = (item: Record<string, unknown>): SubcategoryAI => {
    let rss = item.rss_sources;
    if (typeof rss === "string") {
      rss = rss.split(",").map((s) => s.trim()).filter(Boolean);
    }
    if (!Array.isArray(rss)) rss = [];

    let tags = item.tags;
    if (typeof tags === "string") {
      tags = tags.split(",").map((s) => s.trim()).filter(Boolean);
    }
    if (!Array.isArray(tags)) tags = [];

    return {
      name: String(item.name ?? ""),
      description: String(item.description ?? ""),
      rss_sources: rss as string[],
      tags: (tags as unknown[]).map(String).filter(Boolean),
    };
  };

  const isRoughlyValid = (item: unknown): item is Record<string, unknown> =>
    item !== null &&
    typeof item === "object" &&
    typeof (item as Record<string, unknown>).name === "string" &&
    typeof (item as Record<string, unknown>).description === "string";

  for (const candidate of candidates) {
    try {
      const parsed: unknown = JSON.parse(candidate);
      if (Array.isArray(parsed) && parsed.length > 0 && parsed.every(isRoughlyValid)) {
        return parsed.map(normalizeItem);
      }
    } catch {
      // 다음 후보 시도
    }
  }

  return null;
}

// ── 서브카테고리 AI 생성 ───────────────────────────────────
export async function generateSubcategories(
  categoryName: string
): Promise<SubcategoryAI[]> {
  const prompt = `You are a media and news expert.
Generate 4 to 6 subcategories for the "${categoryName}" field.
For each subcategory provide:
- name: short label in Korean (max 10 chars)
- description: 1-2 sentences in Korean about what this subcategory covers
- rss_sources: JSON array of 1-2 real RSS feed URLs from authoritative sources
- tags: JSON array of 6-10 search keywords derived from the subcategory name and description. Include both Korean and English terms. These keywords are used to filter RSS articles, so they must be specific, high-relevance terms (technical terms, key concepts, major entity names). Avoid generic words like "최신" or "기사".

IMPORTANT:
- rss_sources and tags MUST be JSON arrays. Never use plain strings.
- tags should reflect the actual content described in the description field.

Respond with ONLY a valid JSON array, no other text:
[
  {
    "name": "설계",
    "description": "설명 텍스트.",
    "rss_sources": ["https://example.com/feed"],
    "tags": ["키워드1", "keyword2", "키워드3"]
  }
]`;

  // Groq 우선, 실패 시 OpenRouter 폴백
  let raw = "";
  let lastError: unknown;

  try {
    raw = await callGroq(prompt, "llama-3.3-70b-versatile", 2048);
    const result = parseSubcategoriesJson(raw);
    if (result) return result;
    console.warn("[generateSubcategories] Groq 응답 파싱 실패, OpenRouter 폴백");
  } catch (e) {
    lastError = e;
    console.warn("[generateSubcategories] Groq 호출 실패:", e);
  }

  try {
    raw = await callOpenRouterWithFallback(prompt, 2048);
    const result = parseSubcategoriesJson(raw);
    if (result) return result;
    throw new Error(`AI 응답을 JSON으로 파싱할 수 없습니다. 응답: ${raw.slice(0, 400)}`);
  } catch (e) {
    lastError = e;
    throw new Error(
      `서브카테고리 생성 실패: ${lastError instanceof Error ? lastError.message : String(lastError)}`
    );
  }
}

// ── 출처 AI 생성 ──────────────────────────────────────────
type SourceAI = {
  classification: string;
  name: string;
  description: string;
  url: string;
  weight: number;
};

export type { SourceAI };

function parseSourcesJson(raw: string): SourceAI[] | null {
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) return null;
  try {
    const parsed: unknown = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return null;
    const valid = parsed.every(
      (item) =>
        item !== null &&
        typeof item === "object" &&
        typeof (item as Record<string, unknown>).name === "string" &&
        typeof (item as Record<string, unknown>).classification === "string"
    );
    if (!valid) return null;
    return parsed as SourceAI[];
  } catch { return null; }
}

export async function generateSources(categoryName: string): Promise<SourceAI[]> {
  const prompt = `You are an expert in media and news sources.
Generate 5 to 8 major news/information sources for the "${categoryName}" field.
For each source provide:
1. classification: one of "공식기관", "전문미디어", "학술", "커뮤니티"
2. name: institution or media name
3. description: 1-2 sentences about this source (in Korean)
4. url: main homepage or RSS URL
5. weight: 0-100 based on credibility and authority

Respond ONLY with a valid JSON array, no other text:
[
  {
    "classification": "전문미디어",
    "name": "Example Media",
    "description": "설명 텍스트.",
    "url": "https://example.com",
    "weight": 85
  }
]`;

  let raw = "";
  try {
    raw = await callGroq(prompt, "llama-3.3-70b-versatile", 2048);
    const result = parseSourcesJson(raw);
    if (result && result.length > 0) return result;
    console.warn("[generateSources] Groq 파싱 실패 또는 빈 결과, raw:", raw.slice(0, 300));
  } catch (e) {
    console.warn("[generateSources] Groq 호출 실패:", e);
  }

  try {
    raw = await callOpenRouterWithFallback(prompt, 2048);
    const result = parseSourcesJson(raw);
    if (result && result.length > 0) return result;
    console.warn("[generateSources] OpenRouter 파싱 실패, raw:", raw.slice(0, 300));
    return [];
  } catch (e) {
    console.warn("[generateSources] OpenRouter 호출 실패:", e);
    return [];
  }
}

// ── 한국어 번역 (실패 시 원문 반환) ──────────────────────
export async function translateToKorean(text: string): Promise<string> {
  if (!text || text.trim().length === 0) return "";

  // 이미 한국어가 충분히 포함된 경우 번역 생략
  const koreanRatio = (text.match(/[가-힣]/g) ?? []).length / text.length;
  if (koreanRatio > 0.3) return text;

  const prompt = `다음 텍스트를 자연스러운 한국어로 번역하세요. 번역문만 출력하고 다른 설명은 하지 마세요.\n\n${text.slice(0, 1500)}`;

  try {
    return await callGroq(prompt);
  } catch {
    // Groq 실패 → OpenRouter 폴백
    try {
      return await callOpenRouter(prompt);
    } catch {
      // 모든 AI 실패 시 원문 그대로 반환 (프로세스 중단 방지)
      console.warn("[translateToKorean] 번역 실패, 원문 반환");
      return text;
    }
  }
}

// ── RSS 기사 요약 ─────────────────────────────────────────
export async function summarizeArticle(
  title: string,
  content: string,
  subcategoryName: string
): Promise<{ summary: string; summary_ko: string }> {
  const prompt = `다음 기사를 "${subcategoryName}" 관점에서 2~3문장으로 요약하세요.
제목: ${title}
내용: ${content.slice(0, 1500)}

JSON 형식으로만 응답:
{"summary": "원문 요약", "summary_ko": "한국어 요약"}`;

  try {
    const raw = await callGroq(prompt);
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]) as Record<string, unknown>;
        // 두 필드 모두 문자열인지 검증
        if (
          typeof parsed.summary === "string" &&
          typeof parsed.summary_ko === "string" &&
          parsed.summary_ko
        ) {
          return {
            summary: parsed.summary,
            summary_ko: parsed.summary_ko,
          };
        }
      } catch {
        // JSON.parse 실패 → 폴백
      }
    }
  } catch {
    // Groq 실패 → 폴백
  }

  // 폴백: 제목만 번역
  const summary_ko = await translateToKorean(title);
  return {
    summary: content.slice(0, 200) || title,
    summary_ko: summary_ko || title,
  };
}
