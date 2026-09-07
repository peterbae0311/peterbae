/**
 * OpenAI 호환 chat/completions 형식을 쓰는 무료 모델을 순서대로 시도한다
 * (lottery 앱의 ai-providers.ts와 동일한 패턴 — 별도 배포 단위라 코드는 각자 보관).
 * 하나가 느리거나 실패하면 자동으로 다음 provider로 넘어간다.
 */
import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
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
  // 요청한 maxTokens가 이 값을 넘으면 잘라서 보낸다 — provider별 TPM(분당 토큰) 한도가
  // 다르기 때문(아래 groq 주석 참고). 없으면 요청받은 maxTokens를 그대로 쓴다.
  maxTokensCap?: number;
  // provider별 요청 바디에 추가로 얹을 필드(아래 groq의 reasoning_effort 참고).
  extraBody?: Record<string, unknown>;
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
    // llama-3.3-70b-versatile은 2026-08-16부로 Groq 무료/개발자 티어에서 폐기됨(공식 문서 확인) —
    // Groq 권장 대체 모델로 교체.
    // maxTokensCap: 이 모델의 on_demand 티어는 분당 8000토큰(TPM, prompt+completion 합산)
    // 제한이라(실측: 413 응답으로 "Limit 8000, Requested 8072" 확인) 완전히 8000까지는 못
    // 쓰지만, extraBody.reasoning_effort를 'low'로 낮춰 reasoning 토큰을 거의 안 쓰게 만든
    // 뒤로는(아래 참고) 7000까지 올려도 프롬프트 토큰을 더해도 여유가 있다(실측: 30개 요청
    // 시 total_tokens 2000~6000대). 4000으로 좁게 잡았을 때는 content가 200~300자 지침을
    // 못 지키고 100~190자 수준으로 짧게 나오는 경우가 잦았다(2026-09-07 실측 확인) — 여유
    // 토큰을 늘리니 정상적으로 200~300자를 채웠다.
    // extraBody.reasoning_effort: gpt-oss-120b는 reasoning 모델이라 기본 설정으로는 보이지
    // 않는 reasoning 필드에 completion 토큰을 다 쓰고 실제 답변(content)이 빈 문자열로 나오는
    // 경우가 실측 확인됨(reasoning_tokens가 4000 cap을 다 채움) — 'low'로 낮추면 reasoning이
    // 수십 토큰 수준으로 줄고 content에 정상적으로 채워진다(2026-09-07 실측 확인).
    name: 'groq',
    url: 'https://api.groq.com/openai/v1/chat/completions',
    apiKey: goodWordsLlmEnv.groqApiKey,
    model: 'openai/gpt-oss-120b',
    maxTokensCap: 7000,
    extraBody: { reasoning_effort: 'low' },
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
// 추론 토큰만 소모하다 타임아웃되는 경우가 잦다. good-words가 카테고리당 20개·400자까지
// 요청하면서 maxTokens을 8000까지 올린 뒤로는(generate/route.ts) 20초가 너무 짧아 정상
// 응답도 잘려나가 45초로 상향.
const PROVIDER_TIMEOUT_MS = 45000;

async function callProvider(
  p: Provider,
  messages: ChatMessage[],
  maxTokens: number,
  temperature: number,
): Promise<string> {
  if (!p.apiKey) throw new Error(`${p.name}: API 키 미설정`);
  const cappedMaxTokens = p.maxTokensCap ? Math.min(maxTokens, p.maxTokensCap) : maxTokens;
  const res = await fetch(p.url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${p.apiKey}`,
      'Content-Type': 'application/json',
      ...(p.headers ?? {}),
    },
    body: JSON.stringify({ model: p.model, messages, max_tokens: cappedMaxTokens, temperature, ...(p.extraBody ?? {}) }),
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

// "좋은글 생성"은 원문 인용 트랙·창작 트랙 모두 Claude Sonnet을 우선 사용한다(2026-09-07,
// 사용자 요청) — 무료 모델(openrouter/groq/hf)은 reasoning 모델 특성상 응답이 비거나 형식을
// 못 지키는 경우가 잦아 품질이 불안정하기 때문. 키가 없으면(GOOD_WORDS_ANTHROPIC_API_KEY
// 미설정) 이 provider만 실패로 처리되고 나머지 흐름은 그대로 동작한다 — 다른 provider들과
// 동일한 패턴.
const CLAUDE_MODEL = 'claude-sonnet-5';
let anthropicClient: Anthropic | null = null;

export async function callClaude(
  messages: ChatMessage[],
  opts: { maxTokens?: number; temperature?: number } = {},
): Promise<ChatFallbackResult> {
  if (!goodWordsLlmEnv.anthropicApiKey) throw new Error('claude: API 키 미설정');
  if (!anthropicClient) anthropicClient = new Anthropic({ apiKey: goodWordsLlmEnv.anthropicApiKey });

  const { maxTokens = 2000, temperature = 0.8 } = opts;
  const systemPrompt = messages.find((m) => m.role === 'system')?.content ?? '';
  const userMessages = messages
    .filter((m) => m.role === 'user')
    .map((m) => ({ role: 'user' as const, content: m.content }));

  try {
    const response = await anthropicClient.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: maxTokens,
      temperature,
      system: systemPrompt,
      messages: userMessages,
    });
    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
    if (!textBlock?.text) throw new Error('claude: 응답이 비어 있음');
    return { content: textBlock.text, provider: 'claude-sonnet-5', failures: [] };
  } catch (err) {
    throw new Error(`claude 오류: ${err instanceof Error ? err.message : String(err)}`);
  }
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

// Claude를 먼저 시도하고, 실패(키 미설정/오류/장애)하면 기존 무료 폴백 체인으로 넘어간다.
// 원문 인용 트랙(generate/route.ts)이 이 함수를 쓴다 — GOOD_WORDS_ANTHROPIC_API_KEY 발급
// 전까지는 자동으로 무료 체인만 동작해 기존 동작을 그대로 유지한다.
export async function callChatWithClaudeFirst(
  messages: ChatMessage[],
  opts: { maxTokens?: number; temperature?: number } = {},
): Promise<ChatFallbackResult> {
  try {
    return await callClaude(messages, opts);
  } catch (err) {
    const claudeFailure = err instanceof Error ? err.message : String(err);
    const fallback = await callChatWithFallback(messages, opts);
    return { ...fallback, failures: [claudeFailure, ...fallback.failures] };
  }
}
