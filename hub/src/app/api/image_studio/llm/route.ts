import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { getTokenKeyValue } from '@/lib/tokenStore';

/**
 * image_studio의 텍스트/비전 LLM 호출(OpenRouter/Groq)을 대행하는 프록시.
 * 자동입력(키워드→메타데이터), 생성(프롬프트 작성), 보정(이미지 분석) 세 기능이 모두
 * 이 라우트를 공유한다 — 비전 분석은 messages 안에 base64 이미지를 담아 보낼 뿐 요청
 * 형식 자체는 순수 텍스트 chat completions와 동일하므로 별도 처리가 필요 없다.
 * 이미지 "생성"(바이너리 응답)은 /api/image_studio/image가 별도로 처리한다.
 */
const PROVIDERS = {
  openrouter: {
    url: 'https://openrouter.ai/api/v1/chat/completions',
    keyName: 'OPENROUTER_API_KEY',
    extraHeaders: {
      'HTTP-Referer': 'https://peterbae.duckdns.org/image_studio',
      'X-Title': 'Image Studio',
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
        max_tokens: typeof body?.max_tokens === 'number' ? body.max_tokens : 800,
      }),
    });
  } catch {
    return NextResponse.json({ error: `${provider} 호출 중 네트워크 오류가 발생했습니다.` }, { status: 502 });
  }

  const data = await upstream.json().catch(() => null);
  return NextResponse.json(data ?? { error: '응답을 파싱하지 못했습니다.' }, { status: upstream.status });
}
