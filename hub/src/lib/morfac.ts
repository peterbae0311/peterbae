import 'server-only';
import { getTokenKeyValue } from './tokenStore';

/**
 * Morfac(OpenAI 호환, CBT) chat completions 호출 공용 함수 — music의 번역·가사 생성 라우트가 쓴다.
 * 키는 Key 관리의 MORFAC_API_KEY. 호출하는 라우트가 hub 로그인 여부를 먼저 확인할 것.
 *
 * motif/motif-3은 기본으로 답하기 전에 보이지 않는 추론(thinking) 토큰을 길게 쓴다(실측: 가사 한 곡에
 * 첫 글자까지 30초, 추론만 2,000토큰 넘게 써서 max_tokens에 걸려 잘림). 짧은 번역·가사 작성에는 필요 없어
 * chat_template_kwargs.enable_thinking=false로 끈다(실측: 같은 가사 12.8초, 첫 글자 0.7초).
 */
export const MORFAC_URL = 'https://api-cbt.morphfactory.io/v1/chat/completions';
export const MORFAC_MODEL = 'motif/motif-3';

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export async function morfacKey(): Promise<string | null> {
  return getTokenKeyValue('MORFAC_API_KEY');
}

export function morfacFetch(
  apiKey: string,
  messages: ChatMessage[],
  { maxTokens, temperature, stream = false, timeoutMs }: { maxTokens: number; temperature: number; stream?: boolean; timeoutMs: number },
): Promise<Response> {
  return fetch(MORFAC_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MORFAC_MODEL,
      temperature,
      max_tokens: maxTokens,
      stream,
      chat_template_kwargs: { enable_thinking: false },
      messages,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
}
