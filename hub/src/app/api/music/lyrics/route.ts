import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { morfacFetch, morfacKey } from '@/lib/morfac';

/**
 * music(악기 믹서) 제목·가사 탭의 가사 생성 프록시(Morfac, 스트리밍).
 * 클라이언트가 곡 길이·BPM으로 정한 "겹치지 않는 섹션과 줄 수"(+ 목표 길이·전체 구성·엔딩)를 보내면, 그 구조로 만든
 * 빈칸 JSON 템플릿을 모델이 채워 영어 가사와 줄별 한글 뜻, 제목 후보 3개를 만든다. 후렴·프리코러스처럼 반복되는 섹션은 한 번만 쓰게 해서(반복 배치는 클라이언트가 함)
 * 출력량을 줄였다. 실측 12~15초지만 모델 상태에 따라 길어질 수 있어, 글자가 나오는 대로 흘려보내
 * nginx proxy_read_timeout(기본 60초 — 읽기 사이 간격 기준)에 걸리지 않게 한다.
 */
const TIMEOUT_MS = 120_000;

/*
 * 2026-10-31 같은 입력으로 비교 시험한 결과(Morfac motif-3, thinking off):
 * - 지시문만으로는 줄 수를 자주 어겼다(후렴 8줄 요청에 4~6줄) → 빈칸 JSON 템플릿을 주고 채우게 하니 4/4 정확.
 * - 줄 번호 옆 운 글자(1A 2A 3B 4B)로 짝 각운을 지정하니 운이 확실히 맞았다.
 * - 주제가 한글이면 가사까지 한글·일본어로 쓰는 일이 있어 LANGUAGE 규칙을 맨 앞에 둔다(남는 경우는 클라이언트가 재시도).
 * - "10음절 이하·짧을수록 좋음"으로 10음절 초과 줄이 0이 됐다.
 */
const SYSTEM_PROMPT = `You are a professional pop songwriter writing ORIGINAL, natural, singable English lyrics for Suno AI.

TASK
LANGUAGE: "en" lines and titles are ALWAYS in English only (no Korean, Japanese or other scripts), even when the theme is written in Korean. Only "ko" is Korean.
Write lyrics for the given style, theme and song plan. The plan lists every section in play order with bar counts;
you write only the sections in the template, with exactly the given number of lines each.
Repeated sections (e.g. later choruses) reuse what you write, so write each section once.

LINES (most important)
- Every line has 5-8 words and at most 10 syllables. Short lines are better than long ones.
- Use contractions as in natural speech (I'm, don't, we're, you're, it's).
- Conversational, idiomatic English with natural word stress, smooth vowels and easy breathing.
- Keep lines within the same section similar in length and rhythm.

RHYME & HOOK
- In every Verse, Pre-Chorus and Chorus, lines rhyme in pairs (AABB). Use natural rhymes, not forced ones,
  and do not reuse the same rhyme word within a section.
- The Chorus opens and closes with a short, catchy hook (3-6 words). Use the hook 2-3 times per Chorus, not more.

STORY
- One clear central message and point of view, told with vivid, specific images (avoid clichés).
- Verse: concrete scenes and details. Pre-Chorus: build anticipation. Chorus: the main message.
- Bridge: a new angle or turning point. Outro: close the story in a way that fits the planned ending.
- Match the genre, BPM, mood, energy and vocal style of the given style prompt.

ORIGINALITY
- Write completely original lyrics. Do not copy, quote or closely imitate existing songs.

KOREAN
- Give a natural Korean translation for every line, keeping meaning, imagery and tone (no forced rhymes).

OUTPUT
Fill in the JSON template given by the user and return ONLY that JSON, no Markdown or extra text.
- Replace every "" with your text. Keep every slot: do not add, remove or merge lines or sections.
- The letter after each line number (A, B, C...) marks which lines must rhyme with each other.
- Exactly 3 English titles (2-5 words each; the chorus hook is a good candidate).`;

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// 빈칸 템플릿: 줄마다 번호+운 글자(AABB…)를 달아 줄 수와 각운을 형식으로 고정한다
function template(sections: { name: string; lines: number }[]) {
  return JSON.stringify({
    titles: ['', '', ''],
    sections: sections.map((s) => ({
      name: s.name,
      lines: Array.from({ length: s.lines }, (_, i) => ({ n: `${i + 1}${String.fromCharCode(65 + Math.floor(i / 2))}`, en: '', ko: '' })),
    })),
  });
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const style = str(body?.style, 1200);
  const theme = str(body?.theme, 300);
  const length = str(body?.length, 120); // 예: "about 2:55 at 121 BPM (2 bars per lyric line)"
  const plan = str(body?.plan, 600); // 예: "Intro 4 bars (instrumental) > Verse 1 8 > … > Final Chorus 16 (same lyrics as Chorus)"
  const ending = str(body?.ending, 120);
  const sections: { name: string; lines: number }[] = Array.isArray(body?.sections)
    ? body.sections
      .filter((s: { name?: unknown; lines?: unknown }) => typeof s?.name === 'string' && Number.isInteger(s?.lines) && (s.lines as number) > 0 && (s.lines as number) <= 16)
      .slice(0, 12)
      .map((s: { name: string; lines: number }) => ({ name: s.name.slice(0, 40), lines: s.lines }))
    : [];
  if (!style) return NextResponse.json({ error: '스타일이 없습니다. Suno Style Builder에서 먼저 [생성]을 눌러 주세요.' }, { status: 400 });
  if (!sections.length) return NextResponse.json({ error: '곡 구조가 없습니다.' }, { status: 400 });

  const apiKey = await morfacKey();
  if (!apiKey) return NextResponse.json({ error: 'Key 관리에 MORFAC_API_KEY 값이 등록되어 있지 않습니다.' }, { status: 500 });

  const userPrompt = [
    `Style: ${style}`,
    theme ? `Theme: ${theme}` : '',
    length ? `Target length: ${length}.` : '',
    plan ? `Song plan: ${plan}.` : '',
    ending ? `Planned ending: ${ending}.` : '',
    `Template:\n${template(sections)}`,
  ].filter(Boolean).join('\n');

  let upstream: Response;
  try {
    upstream = await morfacFetch(apiKey, [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ], { maxTokens: 3500, temperature: 0.85, stream: true, timeoutMs: TIMEOUT_MS });
  } catch {
    return NextResponse.json({ error: '가사 생성 서버(Morfac)에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.' }, { status: 502 });
  }
  if (!upstream.ok || !upstream.body) {
    const data = await upstream.json().catch(() => null);
    return NextResponse.json(
      { error: `가사 생성 서버 오류(${upstream.status})${data?.detail ? `: ${data.detail}` : ''}` },
      { status: 502 },
    );
  }

  // SSE(data: {...}) → 글자만 이어 붙인 일반 텍스트로 바꿔 흘려보낸다
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let buf = '';
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (!line.startsWith('data:')) continue;
            const data = line.slice(5).trim();
            if (data === '[DONE]') continue;
            try {
              const delta = JSON.parse(data)?.choices?.[0]?.delta?.content;
              if (delta) controller.enqueue(encoder.encode(delta));
            } catch { /* 깨진 조각은 건너뛴다 */ }
          }
        }
      } catch {
        controller.enqueue(encoder.encode('\n[[STREAM_ERROR]]'));
      }
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' },
  });
}
