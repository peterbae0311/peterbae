import 'server-only';
import { serverEnv } from './env.server';

const OR_URL   = 'https://openrouter.ai/api/v1/chat/completions';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

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
  url: string,
  headers: Record<string, string>,
  body: Record<string, unknown>,
): Promise<{ text: string | null; error?: string }> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errBody = await res.text();
      const message = extractErrorMessage(errBody);
      console.error(`[${logTag}] ${body.model} 호출 실패: ${res.status} ${errBody.slice(0, 300)}`);
      return { text: null, error: message };
    }
    const data = await res.json();
    return { text: (data.choices?.[0]?.message?.content ?? '').trim() || null };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[${logTag}] ${body.model} 호출 예외:`, e);
    return { text: null, error: message };
  }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function hasAiKey(): boolean {
  return !!(serverEnv.openrouterApiKey || serverEnv.groqApiKey);
}

export async function generateWithFallback(
  logTag: string,
  messages: { role: string; content: string }[],
  opts: { maxTokens: number; groqTemperature?: number },
): Promise<{ text: string | null; model: string | null; error?: string }> {
  let text: string | null = null;
  let usedModel: string | null = null;
  let lastError: string | undefined;

  if (serverEnv.openrouterApiKey) {
    for (const model of OR_MODELS) {
      const result = await fetchText(logTag, OR_URL, { Authorization: `Bearer ${serverEnv.openrouterApiKey}` }, {
        model, max_tokens: opts.maxTokens, messages,
      });
      text = result.text;
      if (result.error) lastError = result.error;
      if (text) { usedModel = model; break; }
    }
  }

  if (!text && serverEnv.groqApiKey) {
    // Groq가 마지막 보루이므로, 일시적 rate-limit 대비 1회 재시도
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0) await sleep(1500);
      const result = await fetchText(logTag, GROQ_URL, { Authorization: `Bearer ${serverEnv.groqApiKey}` }, {
        model: GROQ_MODEL, max_tokens: opts.maxTokens, temperature: opts.groqTemperature ?? 0.7, messages,
      });
      text = result.text;
      if (result.error) lastError = result.error;
      if (text) { usedModel = GROQ_MODEL; break; }
    }
  }

  return { text, model: usedModel, error: text ? undefined : lastError };
}
