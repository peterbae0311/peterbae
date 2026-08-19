import 'server-only';
import { cookies } from 'next/headers';

const HUB_LLM_URL = 'https://peterbae.duckdns.org/api/career/llm';

/**
 * career는 자체 Next.js 서버라 브라우저에 API 키가 노출될 위험은 없었지만,
 * career 자신의 .env에는 OPENROUTER_API_KEY/GROQ_API_KEY가 없었다(실측 확인) —
 * 대신 hub의 Key 관리(manage_token)를 유일한 키 소스로 유지하기 위해 이 프록시를 거친다.
 *
 * career 서버가 hub를 호출하는 건 서버 대 서버 요청이라 hub SSO 세션 쿠키를 자동으로
 * 갖고 있지 않다 — 그래서 원래 브라우저 요청에 실려온 쿠키를 그대로 forward한다.
 * 반환값은 fetch()의 Response 그대로라, 기존 각 라우트의 res.ok/res.json() 처리 로직은
 * 손대지 않고 호출 대상만 바꿀 수 있다.
 */
export async function callHubLlm(
  provider: 'openrouter' | 'groq',
  model: string,
  messages: { role: string; content: string }[],
  opts: { maxTokens?: number; temperature?: number } = {},
): Promise<Response> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.getAll().map((c) => `${c.name}=${c.value}`).join('; ');

  return fetch(HUB_LLM_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': cookieHeader,
    },
    body: JSON.stringify({
      provider,
      model,
      messages,
      max_tokens: opts.maxTokens,
      temperature: opts.temperature,
    }),
  });
}
