import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { getTokenKeyValue } from '@/lib/tokenStore';

/**
 * course_planning이 OpenRouter/Groq를 직접 호출하던 것을 대행하는 프록시.
 * API 키는 브라우저로 절대 내려주지 않고, hub의 Key 관리(manage_token, tokens.key_values)에서
 * 서버 측에서만 조회해 사용한다 — course_planning은 provider/model/messages만 넘긴다.
 */
const PROVIDERS = {
  openrouter: {
    url: 'https://openrouter.ai/api/v1/chat/completions',
    keyName: 'OPENROUTER_API_KEY',
    extraHeaders: {
      'HTTP-Referer': 'https://peterbae.duckdns.org/course_planning',
      'X-Title': '과정 기획 자동화',
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
  } catch (err) {
    console.error(`[course_planning/llm] ${provider} fetch failed:`, err);
    return NextResponse.json({ error: `${provider} 호출 중 네트워크 오류가 발생했습니다.` }, { status: 502 });
  }

  const data = await upstream.json().catch(() => null);
  return NextResponse.json(data ?? { error: '응답을 파싱하지 못했습니다.' }, { status: upstream.status });
}
