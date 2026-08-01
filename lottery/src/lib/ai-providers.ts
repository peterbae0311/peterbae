// OpenAI 호환 chat/completions 형식을 쓰는 무료 모델을 순서대로 시도 —
// 하나가 느리거나 실패하면 자동으로 다음 제공자로 넘어간다.

export interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

interface Provider {
  name: string;
  url: string;
  apiKey: string | undefined;
  model: string;
  headers?: Record<string, string>;
}

const PROVIDERS: Provider[] = [
  {
    name: 'openrouter',
    url: 'https://openrouter.ai/api/v1/chat/completions',
    apiKey: process.env.OPENROUTER_API_KEY,
    model: 'nvidia/nemotron-3-super-120b-a12b:free',
    headers: { 'HTTP-Referer': 'https://lotto-app.vercel.app', 'X-Title': 'Lotto App' },
  },
  {
    name: 'groq',
    url: 'https://api.groq.com/openai/v1/chat/completions',
    apiKey: process.env.GROQ_API_KEY,
    model: 'llama-3.3-70b-versatile',
  },
  {
    name: 'huggingface',
    url: 'https://router.huggingface.co/v1/chat/completions',
    apiKey: process.env.HF_TOKEN,
    model: 'meta-llama/Llama-3.1-8B-Instruct',
  },
];

const PROVIDER_TIMEOUT_MS = 15000;

async function callProvider(
  p: Provider,
  messages: ChatMessage[],
  maxTokens: number,
  temperature: number,
): Promise<string> {
  if (!p.apiKey) throw new Error(`${p.name}: API 키 미설정`);
  const res = await fetch(p.url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${p.apiKey}`,
      'Content-Type': 'application/json',
      ...(p.headers ?? {}),
    },
    body: JSON.stringify({ model: p.model, messages, max_tokens: maxTokens, temperature }),
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`${p.name} 오류(${res.status}): ${errText.slice(0, 150)}`);
  }
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error(`${p.name}: 응답이 비어 있음`);
  return content;
}

export interface ChatFallbackResult {
  content: string;
  provider: string;
  failures: string[]; // 성공한 provider 이전에 실패했던 provider들의 에러 메시지
}

// PROVIDERS를 순서대로 시도해 첫 성공 응답을 반환한다. 전부 실패하면 각 실패 원인을 모아 던진다.
export async function callChatWithFallback(
  messages: ChatMessage[],
  opts: { maxTokens?: number; temperature?: number } = {},
): Promise<ChatFallbackResult> {
  const { maxTokens = 2000, temperature = 0.4 } = opts;
  const failures: string[] = [];
  for (const p of PROVIDERS) {
    try {
      const content = await callProvider(p, messages, maxTokens, temperature);
      return { content, provider: p.name, failures };
    } catch (err) {
      failures.push(err instanceof Error ? err.message : String(err));
    }
  }
  throw new Error(`모든 AI 제공자 호출 실패 — ${failures.join(' / ')}`);
}
