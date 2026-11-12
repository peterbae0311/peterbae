import 'server-only';
import { getTokenKeyValue } from './tokenStore';
import { MORFAC_MODEL, MORFAC_URL, type ChatMessage } from './morfac';

/**
 * music 가사 생성·번역용 LLM 호출 — Morfac이 안 되면(키 없음·연결 실패·오류 응답) 다음 공급자로 넘어간다.
 * 키는 모두 Key 관리(tokens.key_values)에 있는 값을 쓴다. Groq·OpenRouter 키는 다른 앱이 이미 쓰는 범용 키.
 *
 * 순서 — 2026-11-05 같은 가사 프롬프트로 무료 모델을 비교 시험해서 정함(줄 수·각운·자연스러움·속도·안정성)
 *  1. Morfac motif-3 — 기본(유료 CBT). 서버 점검 중이면 실패하므로 아래로 넘어간다.
 *  2. Groq qwen/qwen3.8-27b — 3초로 가장 빠르고 자연스럽다. 2026-11-11 새 작사 가이드 시험에서도 줄 길이·금지어를 가장 잘 지켰다.
 *     무료 티어가 분당 출력 1,000토큰이라 가사 한 곡(약 1,200토큰) 뒤 1분 동안은 429 → 그때는 다음으로.
 *  3. Groq openai/gpt-oss-120b — 형식은 잘 지키지만 금지한 소재(neon·playlist)를 가끔 쓰는 등 지시를 덜 따른다.
 *  4. OpenRouter nvidia/nemotron-3-ultra-550b-a55b:free — 2026-11-05에는 무료 중 품질이 가장 좋았지만, 2026-11-11 긴 가사 요청에
 *     200 응답으로 깨진 글자만 돌려줘(오류가 아니라 다음으로 넘어가지도 못함) 맨 뒤로 뺐다(2026-11-12 사용자 요청).
 *     추론 모델이라 reasoning.enabled=false로 끈다(켜 두면 max_tokens 대부분을 생각에 써서 JSON이 잘렸다).
 *  (google/gemma-4-31b-it:free는 시험 내내 upstream 429, dots-3-note는 JSON을 내지 않아 제외)
 *
 * 스트리밍이면 응답 헤더가 올 때까지만 공급자별 연결 제한(connectMs)을 두고, 본문은 전체 제한(timeoutMs)까지 기다린다 —
 * 점검 중인 서버가 응답 없이 붙잡고 있어도 오래 기다리지 않고 다음 공급자로 넘어가게.
 */
type Provider = { name: string; url: string; keyName: string; model: string; extra?: Record<string, unknown> };

export const MUSIC_PROVIDERS: Provider[] = [
  { name: 'Morfac', url: MORFAC_URL, keyName: 'MORFAC_API_KEY', model: MORFAC_MODEL, extra: { chat_template_kwargs: { enable_thinking: false } } },
  { name: 'Qwen', url: 'https://api.groq.com/openai/v1/chat/completions', keyName: 'GROQ_API_KEY', model: 'qwen/qwen3.8-27b', extra: { reasoning_effort: 'none' } },
  { name: 'GPT-OSS', url: 'https://api.groq.com/openai/v1/chat/completions', keyName: 'GROQ_API_KEY', model: 'openai/gpt-oss-120b', extra: { reasoning_effort: 'low' } },
  { name: 'Nemotron', url: 'https://openrouter.ai/api/v1/chat/completions', keyName: 'OPENROUTER_API_KEY', model: 'nvidia/nemotron-3-ultra-550b-a55b:free', extra: { reasoning: { enabled: false } } },
];

type Opts = { maxTokens: number; temperature: number; stream?: boolean; timeoutMs: number; connectMs?: number };
export type LlmResult = { ok: true; res: Response; provider: string; model: string } | { ok: false; error: string };

export async function musicChat(messages: ChatMessage[], { maxTokens, temperature, stream = false, timeoutMs, connectMs = 20_000 }: Opts): Promise<LlmResult> {
  const fails: string[] = [];
  for (const p of MUSIC_PROVIDERS) {
    const apiKey = await getTokenKeyValue(p.keyName);
    if (!apiKey) { fails.push(`${p.name}: 키 없음`); continue; }
    const connect = new AbortController();
    const timer = setTimeout(() => connect.abort(), connectMs);
    try {
      const res = await fetch(p.url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: p.model, temperature, max_tokens: maxTokens, stream, messages, ...p.extra }),
        signal: AbortSignal.any([connect.signal, AbortSignal.timeout(timeoutMs)]),
      });
      clearTimeout(timer);
      if (res.ok && (!stream || res.body)) return { ok: true, res, provider: p.name, model: p.model };
      const detail = await res.text().catch(() => '');
      fails.push(`${p.name}: ${res.status}${detail ? ` ${detail.slice(0, 120)}` : ''}`);
    } catch (e) {
      clearTimeout(timer);
      fails.push(`${p.name}: ${connect.signal.aborted ? '응답 없음' : (e as Error).name === 'TimeoutError' ? '시간 초과' : '연결 실패'}`);
    }
  }
  console.warn('[musicChat] all providers failed:', fails.join(' | '));
  return { ok: false, error: fails.join(' / ') };
}
