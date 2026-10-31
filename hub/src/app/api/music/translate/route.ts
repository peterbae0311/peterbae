import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { morfacFetch, morfacKey } from '@/lib/morfac';

/**
 * music(악기 믹서) 한글 → 영어 번역 프록시(Morfac). 두 가지 쓰임:
 *  - mode 'style'(기본): 컨셉 도우미 "직접 추가" 칸 — 한글 곡 지시를 Suno 스타일용 짧은 영어 문장으로(줄 단위 1:1)
 *  - mode 'lyric': 제목·가사 탭에서 고친 한글 뜻 한 줄을 부를 수 있는 영어 가사 한 줄로(원래 영어 줄의 길이·운 유지)
 * music은 정적 사이트라 API 키를 둘 수 없어 hub가 대신 호출한다 — 키는 Key 관리의 MORFAC_API_KEY.
 * 경로가 /api/music/... 이라 nginx auth_request가 music 앱 권한으로 판별한다(verify 라우트의 extractAppKey).
 */
const MAX_CHARS = 500;
const TIMEOUT_MS = 30_000; // nginx proxy_read_timeout 기본 60초보다 짧게

const STYLE_PROMPT =
  'You translate Korean notes about how a song should sound into short English directions for a Suno AI music style prompt. '
  + 'Translate each input line into one concise English line (under 20 words) using natural music-production wording. '
  + 'Output only the English lines in the same order, one per line. No numbering, quotes, Korean, or explanations.';

const LYRIC_PROMPT =
  'You are a pop lyricist. Rewrite the given Korean meaning as ONE singable English song lyric line. '
  + 'Match the syllable count of the original English line as closely as possible and keep its end rhyme when you can, '
  + 'so it still fits the melody and the neighboring lines. Output only the single English line, without quotes or explanations.';

const str = (v: unknown, max = MAX_CHARS) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const raw = typeof body?.text === 'string' ? body.text.trim() : '';
  if (!raw) return NextResponse.json({ error: '번역할 내용이 없습니다.' }, { status: 400 });
  if (raw.length > MAX_CHARS) return NextResponse.json({ error: `${MAX_CHARS}자 이내로 적어 주세요.` }, { status: 400 });

  const lyric = body?.mode === 'lyric';
  const user_ = lyric
    ? [
      `Korean meaning: ${raw}`,
      `Original English line: ${str(body?.original, 200) || '(none)'}`,
      `Previous line: ${str(body?.prev, 200) || '(none)'}`,
      `Next line: ${str(body?.next, 200) || '(none)'}`,
    ].join('\n')
    : raw;

  const apiKey = await morfacKey();
  if (!apiKey) return NextResponse.json({ error: 'Key 관리에 MORFAC_API_KEY 값이 등록되어 있지 않습니다.' }, { status: 500 });

  let upstream: Response;
  try {
    upstream = await morfacFetch(apiKey, [
      { role: 'system', content: lyric ? LYRIC_PROMPT : STYLE_PROMPT },
      { role: 'user', content: user_ },
    ], { maxTokens: 300, temperature: lyric ? 0.5 : 0.2, timeoutMs: TIMEOUT_MS });
  } catch {
    return NextResponse.json({ error: '번역 서버(Morfac)에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.' }, { status: 502 });
  }

  const data = await upstream.json().catch(() => null);
  if (!upstream.ok) {
    return NextResponse.json(
      { error: `번역 서버 오류(${upstream.status})${data?.detail ? `: ${data.detail}` : ''}` },
      { status: 502 },
    );
  }
  const translated: string = data?.choices?.[0]?.message?.content?.trim() ?? '';
  if (!translated) return NextResponse.json({ error: '번역 결과가 비어 있습니다.' }, { status: 502 });

  // 모델이 가끔 붙이는 번호·따옴표를 정리하고, 줄 단위로 돌려준다(가사 모드는 첫 줄만)
  const lines = translated.split('\n').map((l) => l.replace(/^\s*(\d+[.)]|[-*•])\s*/, '').replace(/^["']|["']$/g, '').trim()).filter(Boolean);
  return NextResponse.json({ lines: lyric ? lines.slice(0, 1) : lines });
}
