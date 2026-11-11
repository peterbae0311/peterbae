import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { musicChat } from '@/lib/musicLlm';

/**
 * music(악기 믹서) 제목·가사 탭의 가사 생성 프록시(스트리밍). Morfac이 안 되면 Groq·OpenRouter 무료 모델로 넘어간다.
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
 * 2026-11-11 사용자 작사 가이드 반영(역할·규칙 1~7·최근 사용한 소재·자가 점검). 앱은 화면이 정한 섹션·줄 수의 JSON을 받아야 해서
 * 가이드의 출력 형식(스타일 프롬프트·길이 계산·코드 블록)과 구조 바꾸기(Post-Chorus 추가 등)는 빼고, 줄 수는 템플릿으로 고정한다.
 * 운 글자(1A 2A…)는 운을 강제해서 없앴다. 자가 점검은 출력하지 않고 고친 결과만 내게 한다.
 */
// 최근 곡에서 쓴 소재·훅. 새 가사가 겹치지 않게 한다(새 곡을 만들면 여기에 더한다)
const RECENT_IMAGES = ['coffee', 'morning sunlight', 'city lights', 'neon', 'fallen leaves', 'sweater', 'keys', 'vinyl records', 'phone photos'];
const RECENT_HOOKS = ['Golden', 'Unfiltered', 'Killer Groove', 'Neon Heartbeat', 'Good vibes only', 'Sunrise on the boulevard', "Let's say goodbye"];

const SYSTEM_PROMPT = `ROLE
You are a professional lyricist writing English pop lyrics for Suno AI. Write like a native speaker with a 2020s pop
sensibility: natural, modern and singable.

TASK
LANGUAGE: "en" lines and titles are ALWAYS in English only (no Korean, Japanese or other scripts), even when the theme
is written in Korean. Only "ko" is Korean.
Write lyrics for the given style, theme and song plan, following every RULE below. The plan lists every section in play
order with bar counts; you write only the sections in the template, with exactly the given number of lines each.
Repeated sections (e.g. later choruses) reuse what you write, so write each section once.
Before answering, run the SELF-CHECK silently, fix anything that fails, and output only the fixed result.

RULES
1. Modern vocabulary
- Use everyday spoken English that people really use now. Use contractions naturally (I'm, don't, gonna, wanna).
- Write every section the way a real person would actually say it to someone — verses, chorus and bridge alike.
- Prefer plain, modern words whose meaning is instantly clear. Avoid fleeting internet slang that dates quickly
  (e.g. lowkey, no cap, slay, rizz, vibe check) unless the theme asks for it.
- Avoid old-pop clichés and overly literary words. Banned examples (and anything like them): dearest, forever and ever,
  my lonely heart, destiny, shine like a star, bright and true, turn the page, haters, perfectly imperfect,
  dancing in the rain.

2. Concrete scenes
- Show feelings through actions, objects, places and dialogue instead of declaring them
  (e.g. not "I miss you" but "Your old sweater smells like rain").
- Not every feeling needs a metaphor. Short, direct lines are fine.

3. Rhyme and flow
- Verses: write as if speaking, not bound by rhyme or syllable counts. Mix short and longer lines.
- Chorus: it MUST contain at least one memorable hook line, repeated at least twice within the chorus.
  This rule overrides any rule about reducing repetition.
- Rhyme loosely with similar sounds (slant rhyme). If a rhyme would break grammar or meaning, drop the rhyme.
- LINE LENGTH (hard limit): each line is sung in about two bars, so no line may exceed 10 words.
  Most lines should be 4-8 words; a 2-3 word line is welcome for contrast. Split long thoughts across two lines.

4. Lyrics, not arrangement
- Never put instruments or sound words (bass, bass drop, beat drop, synth, drums, remix, playlist…), genre names
  (disco, house, G-funk…) or arrangement directions (break it down, build it up…) in the lyric lines.
- Text in parentheses is sung as backing vocals, so use parentheses only for ad-libs and call-and-response.

5. Clarity and consistency
- Prefer expressions that are understood at once over novelty. If originality makes the meaning vague, choose the
  simpler words.
- Time, place, objects and actions must not contradict each other.
- Keep the speaker (I, we, you) and any gender references consistent through the whole song.
- Use a tone that fits the genre and mood.
- Avoid anything that could read as sexual unless the theme asks for it.

6. Variety
- In the final lines of the Chorus or the Bridge, let the feeling move forward instead of only restating the verse.
- BANNED recent images — do not mention these words or close variants anywhere in the lyrics or titles:
  ${RECENT_IMAGES.join(', ')}.
- BANNED recent hooks and titles — do not use them or near-copies: ${RECENT_HOOKS.join(', ')}.

7. Form
- Never put the song title inside the lyrics as a label, and never write bar counts or section names inside lines.
- Write completely original lyrics. Do not copy, quote or closely imitate existing songs.

KOREAN
- Give a natural Korean translation for every line, keeping meaning, imagery and tone (no forced rhymes).

SELF-CHECK (do not output)
- Is every line 10 words or fewer?
- Does the Chorus have a hook line that repeats at least twice?
- Is any line's grammar or meaning broken for the sake of a rhyme?
- Are there instruments, genre names or arrangement directions in the lyrics?
- Do the scenes and the speaker contradict each other anywhere?
- Are any banned examples, clichés or fleeting slang left? Does every line sound like natural speech?
- Does any banned recent image (e.g. coffee, neon) or hook appear anywhere?
- Does every section have exactly the number of lines in the template?

OUTPUT
Fill in the JSON template given by the user and return ONLY that JSON, no Markdown or extra text.
- Replace every "" with your text. Keep every slot: do not add, remove or merge lines or sections.
- titles: fill each "title" with an English song title of EXACTLY the given number of "words" (count words strictly;
  a one-word title is a single word). Make the three titles different, modern and not cliché;
  the chorus hook or a key image is a good source.`;

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

const titleWords = () => { const r = Math.random(); return r < 0.7 ? 1 : r < 0.9 ? 2 : 3; };

// 빈칸 템플릿: 줄마다 번호를 달아 줄 수를 형식으로 고정한다(운은 강제하지 않아 운 글자는 달지 않는다)
function template(sections: { name: string; lines: number }[]) {
  return JSON.stringify({
    // 제목 단어 수: 1단어 70% · 2단어 20% · 3단어 10%(후보마다 따로 뽑음)
    titles: [titleWords(), titleWords(), titleWords()].map((words) => ({ words, title: '' })),
    sections: sections.map((s) => ({
      name: s.name,
      lines: Array.from({ length: s.lines }, (_, i) => ({ n: i + 1, en: '', ko: '' })),
    })),
  });
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const style = str(body?.style, 1200);
  const theme = str(body?.theme, 600); // 웹에서 찾은 원곡 리듬·분위기 설명(2줄)까지 들어올 수 있다
  const length = str(body?.length, 120); // 예: "about 2:55 at 121 BPM (2 bars per lyric line)"
  const plan = str(body?.plan, 600); // 예: "Intro 4 bars (instrumental) > Verse 1 8 > … > Final Chorus 16 (same lyrics as Chorus)"
  const ending = str(body?.ending, 120);
  // 화면의 금지 표현 목록(트렌디하지 않은 단어·클리셰 등). 사용자가 더하고 뺀다
  const banned = (Array.isArray(body?.banned) ? body.banned : [])
    .map((b: unknown) => str(b, 40)).filter(Boolean).slice(0, 80) as string[];
  const sections: { name: string; lines: number }[] = Array.isArray(body?.sections)
    ? body.sections
      .filter((s: { name?: unknown; lines?: unknown }) => typeof s?.name === 'string' && Number.isInteger(s?.lines) && (s.lines as number) > 0 && (s.lines as number) <= 16)
      .slice(0, 12)
      .map((s: { name: string; lines: number }) => ({ name: s.name.slice(0, 40), lines: s.lines }))
    : [];
  if (!style) return NextResponse.json({ error: '스타일이 없습니다. Suno Style Builder에서 먼저 [생성]을 눌러 주세요.' }, { status: 400 });
  if (!sections.length) return NextResponse.json({ error: '곡 구조가 없습니다.' }, { status: 400 });

  const userPrompt = [
    `Style: ${style}`,
    theme ? `Theme: ${theme}` : '',
    length ? `Target length: ${length}.` : '',
    plan ? `Song plan: ${plan}.` : '',
    ending ? `Planned ending: ${ending}.` : '',
    banned.length ? `Banned words and phrases (never use them or close variants anywhere in the lyrics or titles): ${banned.join(', ')}.` : '',
    `Template:\n${template(sections)}`,
  ].filter(Boolean).join('\n');

  // Morfac → Groq → OpenRouter 순서로, 처음 응답하는 공급자를 쓴다(musicLlm.ts)
  const llm = await musicChat([
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userPrompt },
  ], { maxTokens: 3500, temperature: 0.85, stream: true, timeoutMs: TIMEOUT_MS });
  if (!llm.ok) {
    return NextResponse.json({ error: `가사 생성 서버에 모두 연결하지 못했습니다(${llm.error}). 잠시 후 다시 시도해 주세요.` }, { status: 502 });
  }

  // SSE(data: {...}) → 글자만 이어 붙인 일반 텍스트로 바꿔 흘려보낸다
  const reader = llm.res.body!.getReader();
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
    headers: {
      'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no',
      'X-Music-LLM': llm.provider, // 화면에 어느 공급자가 썼는지 보여 준다
    },
  });
}
