import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { getTokenKeyValue } from '@/lib/tokenStore';

/**
 * music(악기 믹서) Suno Style Builder의 컨셉 도우미 "직접 추가" 칸 번역 프록시.
 * 한글로 적은 곡 지시를 Suno 스타일에 넣을 짧은 영어 문장으로 바꾼다(줄 단위로 1:1).
 * music은 정적 사이트라 API 키를 둘 수 없어 hub가 대신 호출한다 — 키는 Key 관리의 MORFAC_API_KEY.
 * 경로가 /api/music/... 이라 nginx auth_request가 music 앱 권한으로 판별한다(verify 라우트의 extractAppKey).
 */
const MORFAC_URL = 'https://api-cbt.morphfactory.io/v1/chat/completions';
const MODEL = 'motif/motif-3';
const MAX_CHARS = 500;
const TIMEOUT_MS = 30_000; // nginx proxy_read_timeout 기본 60초보다 짧게

const SYSTEM_PROMPT =
  'You translate Korean notes about how a song should sound into short English directions for a Suno AI music style prompt. '
  + 'Translate each input line into one concise English line (under 20 words) using natural music-production wording. '
  + 'Output only the English lines in the same order, one per line. No numbering, quotes, Korean, or explanations.';

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const text = typeof body?.text === 'string' ? body.text.trim() : '';
  if (!text) return NextResponse.json({ error: '번역할 내용이 없습니다.' }, { status: 400 });
  if (text.length > MAX_CHARS) {
    return NextResponse.json({ error: `${MAX_CHARS}자 이내로 적어 주세요.` }, { status: 400 });
  }

  const apiKey = await getTokenKeyValue('MORFAC_API_KEY');
  if (!apiKey) {
    return NextResponse.json({ error: 'Key 관리에 MORFAC_API_KEY 값이 등록되어 있지 않습니다.' }, { status: 500 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(MORFAC_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.2,
        max_tokens: 300,
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: text }],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
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

  // 모델이 가끔 붙이는 번호·따옴표를 정리하고, 줄 단위로 돌려준다
  const lines = translated.split('\n').map((l) => l.replace(/^\s*(\d+[.)]|[-*•])\s*/, '').replace(/^["']|["']$/g, '').trim()).filter(Boolean);
  return NextResponse.json({ lines });
}
