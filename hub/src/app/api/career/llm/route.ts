import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { getTokenKeyValue } from '@/lib/tokenStore';

/**
 * career의 OpenRouter/Groq 호출을 대행하는 프록시.
 *
 * career는 다른 5개 앱(course_planning 등)과 달리 정적 사이트가 아니라 이미 자체
 * Next.js 서버라 브라우저에 키가 노출되는 문제는 없었다 — 문제는 career 자신의
 * `.env`에 OPENROUTER_API_KEY/GROQ_API_KEY가 아예 없었다는 것(별도 확인됨). 이 키를
 * career의 `.env`에 복사해 넣는 대신, career의 서버 라우트가 이 프록시를 호출하도록
 * 바꿔서 Key 관리를 6개 앱 전체의 유일한 소스로 유지한다.
 *
 * career 서버는 사용자의 브라우저가 아니므로 hub SSO 세션 쿠키를 직접 갖고 있지
 * 않다 — 대신 career의 라우트 핸들러가 원래 요청에 실려온 쿠키를 그대로 이 프록시
 * 호출에 forward한다(src/lib/hubProxy.ts). 아래 인증 체크는 그 forward된 쿠키를 읽는다.
 */
const PROVIDERS = {
  openrouter: {
    url: 'https://openrouter.ai/api/v1/chat/completions',
    keyName: 'OPENROUTER_API_KEY',
    extraHeaders: {
      'HTTP-Referer': 'https://peterbae.duckdns.org/career',
      'X-Title': 'Career',
    },
  },
  groq: {
    url: 'https://api.groq.com/openai/v1/chat/completions',
    keyName: 'GROQ_API_KEY',
  },
} as const;

type ProviderKey = keyof typeof PROVIDERS;

function isProviderKey(v: unknown): v is ProviderKey {
  return typeof v === 'string' && v in PROVIDERS;
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const provider = body?.provider;
  const model = body?.model;
  const messages = body?.messages;

  if (!isProviderKey(provider)) {
    return NextResponse.json({ error: '지원하지 않는 provider입니다.' }, { status: 400 });
  }
  if (typeof model !== 'string' || !model || !Array.isArray(messages)) {
    return NextResponse.json({ error: 'model/messages가 필요합니다.' }, { status: 400 });
  }

  const cfg = PROVIDERS[provider];
  const apiKey = await getTokenKeyValue(cfg.keyName);
  if (!apiKey) {
    return NextResponse.json(
      { error: `Key 관리에 ${cfg.keyName} 값이 등록되어 있지 않습니다.` },
      { status: 500 },
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(cfg.url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...('extraHeaders' in cfg ? cfg.extraHeaders : {}),
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: typeof body?.temperature === 'number' ? body.temperature : 0.7,
        max_tokens: typeof body?.max_tokens === 'number' ? body.max_tokens : 2000,
      }),
    });
  } catch {
    return NextResponse.json({ error: `${provider} 호출 중 네트워크 오류가 발생했습니다.` }, { status: 502 });
  }

  const data = await upstream.json().catch(() => null);
  return NextResponse.json(data ?? { error: '응답을 파싱하지 못했습니다.' }, { status: upstream.status });
}
