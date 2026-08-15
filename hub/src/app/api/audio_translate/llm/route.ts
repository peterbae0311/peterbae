import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { getTokenKeyValue } from '@/lib/tokenStore';

/**
 * audio_translate의 텍스트 요약 호출(OpenRouter/Groq/Hugging Face)을 대행하는 프록시.
 * 음성 인식(STT: Groq Whisper/HF Whisper/Gladia)은 오디오 바이너리를 그대로 전달해야 해서
 * 범위 밖 — hub 서버(물리 RAM 500MB, 다른 모든 앱과 공유)에서 대용량 파일을 버퍼링하는
 * 위험을 피하기 위해 당분간 사용자별 로컬 키를 그대로 쓴다. 텍스트 요약은 JSON만 오가므로
 * course_planning과 동일한 패턴으로 안전하게 프록시 가능.
 */
const PROVIDERS = {
  openrouter: {
    url: 'https://openrouter.ai/api/v1/chat/completions',
    keyName: 'OPENROUTER_API_KEY',
    extraHeaders: {
      'HTTP-Referer': 'https://peterbae.duckdns.org/audio_translate',
      'X-Title': 'AudioAI',
    },
  },
  groq: {
    url: 'https://api.groq.com/openai/v1/chat/completions',
    keyName: 'GROQ_API_KEY',
  },
  huggingface: {
    url: 'https://router.huggingface.co/v1/chat/completions',
    keyName: 'HF_TOKEN',
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
        max_tokens: typeof body?.max_tokens === 'number' ? body.max_tokens : 700,
      }),
    });
  } catch {
    return NextResponse.json({ error: `${provider} 호출 중 네트워크 오류가 발생했습니다.` }, { status: 502 });
  }

  const data = await upstream.json().catch(() => null);
  return NextResponse.json(data ?? { error: '응답을 파싱하지 못했습니다.' }, { status: upstream.status });
}
