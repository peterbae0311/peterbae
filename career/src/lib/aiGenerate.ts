import 'server-only';
import { callHubLlm } from './hubProxy';

const OR_MODELS = [
  'qwen/qwen3-next-80b-a3b-instruct:free',
  'openai/gpt-oss-120b:free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'nousresearch/hermes-3-llama-3.1-405b:free',
];
const GROQ_MODEL = 'llama-3.3-70b-versatile';

function extractErrorMessage(errBody: string): string {
  try {
    const parsed = JSON.parse(errBody);
    return parsed?.error?.metadata?.raw ?? parsed?.error?.message ?? errBody.slice(0, 200);
  } catch {
    return errBody.slice(0, 200);
  }
}

async function fetchText(
  logTag: string,
  provider: 'openrouter' | 'groq',
  model: string,
  messages: { role: string; content: string }[],
  opts: { maxTokens?: number; temperature?: number } = {},
): Promise<{ text: string | null; error?: string }> {
  try {
    const res = await callHubLlm(provider, model, messages, opts);
    if (!res.ok) {
      const errBody = await res.text();
      const message = extractErrorMessage(errBody);
      console.error(`[${logTag}] ${model} 호출 실패: ${res.status} ${errBody.slice(0, 300)}`);
      return { text: null, error: message };
    }
    const data = await res.json();
    return { text: (data.choices?.[0]?.message?.content ?? '').trim() || null };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[${logTag}] ${model} 호출 예외:`, e);
    return { text: null, error: message };
  }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 키는 이제 hub의 Key 관리에서 중앙 관리되므로 항상 사용 가능한 것으로 취급한다.
export function hasAiKey(): boolean {
  return true;
}

export async function generateWithFallback(
  logTag: string,
  messages: { role: string; content: string }[],
  opts: { maxTokens: number; groqTemperature?: number },
): Promise<{ text: string | null; model: string | null; error?: string }> {
  let text: string | null = null;
  let usedModel: string | null = null;
  let lastError: string | undefined;

  for (const model of OR_MODELS) {
    const result = await fetchText(logTag, 'openrouter', model, messages, { maxTokens: opts.maxTokens });
    text = result.text;
    if (result.error) lastError = result.error;
    if (text) { usedModel = model; break; }
  }

  if (!text) {
    // Groq가 마지막 보루이므로, 일시적 rate-limit 대비 1회 재시도
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0) await sleep(1500);
      const result = await fetchText(logTag, 'groq', GROQ_MODEL, messages, {
        maxTokens: opts.maxTokens, temperature: opts.groqTemperature ?? 0.7,
      });
      text = result.text;
      if (result.error) lastError = result.error;
      if (text) { usedModel = GROQ_MODEL; break; }
    }
  }

  return { text, model: usedModel, error: text ? undefined : lastError };
}
