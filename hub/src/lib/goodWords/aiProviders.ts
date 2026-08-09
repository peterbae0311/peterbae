/**
 * OpenAI 호환 chat/completions 형식을 쓰는 무료 모델을 순서대로 시도한다
 * (lottery 앱의 ai-providers.ts와 동일한 패턴 — 별도 배포 단위라 코드는 각자 보관).
 * 하나가 느리거나 실패하면 자동으로 다음 provider로 넘어간다.
 */
import 'server-only';
import { goodWordsLlmEnv } from './env';

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
    apiKey: goodWordsLlmEnv.openrouterApiKey,
    model: 'nvidia/nemotron-3-super-120b-a12b:free',
    headers: { 'HTTP-Referer': 'https://peterbae.duckdns.org/good-words', 'X-Title': 'Good Words' },
  },
  {
    name: 'groq',
    url: 'https://api.groq.com/openai/v1/chat/completions',
    apiKey: goodWordsLlmEnv.groqApiKey,
    model: 'llama-3.3-70b-versatile',
  },
  {
    name: 'huggingface',
    url: 'https://router.huggingface.co/v1/chat/completions',
    apiKey: goodWordsLlmEnv.hfToken,
    model: 'meta-llama/Llama-3.1-8B-Instruct',
  },
];

// 실측 결과 OpenRouter 무료 티어의 채팅 모델은 대부분 reasoning 모델로 바뀌어 있어(2026-08
// 기준 nvidia/nemotron-3-super-120b-a12b:free 등), 이 라우트의 장문 배치 생성 요청에서
// 추론 토큰만 소모하다 타임아웃되는 경우가 잦다 — 다음 provider로 더 빨리 넘어가도록 단축.
const PROVIDER_TIMEOUT_MS = 20000;

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
  failures: string[];
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
