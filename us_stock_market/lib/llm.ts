/**
 * OpenRouter LLM 공통 유틸리티
 * - 학습종료 최근 순으로 모델 순차 시도
 * - 크레딧 부족 / 레이트리밋 / 엔드포인트 없음 시 다음 모델로 폴백
 */

export interface LlmModel {
  id: string;
  label: string;
  cutoff: string;
}

// 학습종료 최근 순 정렬
export const FREE_MODELS: LlmModel[] = [
  { id: 'arcee-ai/trinity-large-thinking:free',               label: 'Arcee Trinity Large Thinking',  cutoff: '2025년 초' },
  { id: 'deepseek/deepseek-v4-flash:free',                    label: 'DeepSeek V4 Flash',              cutoff: '2025년 초' },
  { id: 'qwen/qwen3-coder:free',                              label: 'Qwen3 Coder 480B',               cutoff: '2025년 1월' },
  { id: 'qwen/qwen3-next-80b-a3b-instruct:free',              label: 'Qwen3 Next 80B',                 cutoff: '2025년 1월' },
  { id: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free', label: 'NVIDIA Nemotron Reasoning 30B',  cutoff: '2024년 하반기' },
  { id: 'nvidia/nemotron-3-super-120b-a12b:free',             label: 'NVIDIA Nemotron Super 120B',     cutoff: '2024년 하반기' },
  { id: 'liquid/lfm-2.5-1.2b-thinking:free',                 label: 'LiquidAI LFM2.5 Thinking',       cutoff: '2024년' },
  { id: 'openai/gpt-oss-120b:free',                           label: 'OpenAI OSS 120B',                cutoff: '2024년' },
  { id: 'meta-llama/llama-3.3-70b-instruct:free',             label: 'Llama 3.3 70B',                  cutoff: '2023년 12월' },
];

function isRetryable(msg: string): boolean {
  const lower = msg.toLowerCase();
  return (
    lower.includes('rate limit') ||
    lower.includes('ratelimit') ||
    lower.includes('too many requests') ||
    lower.includes('credits') ||
    lower.includes('quota') ||
    lower.includes('capacity') ||
    lower.includes('no endpoints found') ||
    lower.includes('service unavailable') ||
    lower.includes('overloaded') ||
    lower.includes('not a valid model')
  );
}

function extractJson(raw: string): string {
  // DeepSeek / reasoning 모델의 <think>...</think> 제거
  const withoutThink = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  return withoutThink.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
}

export interface LlmResult {
  content: string;
  model: LlmModel;
}

export async function callLlm(apiKey: string, prompt: string): Promise<LlmResult> {
  let lastError = '';

  for (const model of FREE_MODELS) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: model.id,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 4000,
        }),
        cache: 'no-store',
      });

      const data = (await res.json()) as {
        choices?: Array<{ message: { content: string } }>;
        error?: { message: string };
      };

      if (!data.choices?.[0]) {
        lastError = `[${model.label}] ${data.error?.message ?? 'no choices'}`;
        continue;
      }

      const raw = data.choices[0].message.content;
      if (!raw) {
        lastError = `[${model.label}] empty content`;
        continue;
      }

      const jsonStr = extractJson(raw);

      // JSON이 잘렸으면 다음 모델로 시도
      try {
        JSON.parse(jsonStr);
      } catch {
        lastError = `[${model.label}] incomplete JSON output`;
        continue;
      }

      // 한국어가 아닌 언어(중국어·일본어 등)로 응답하면 다음 모델로 시도
      const cjkNonKorean = (jsonStr.match(/[一-鿿぀-ゟ゠-ヿ]/g) ?? []).length;
      const korean      = (jsonStr.match(/[가-힣]/g) ?? []).length;
      if (cjkNonKorean > korean) {
        lastError = `[${model.label}] non-Korean response`;
        continue;
      }

      return { content: jsonStr, model };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (isRetryable(msg)) {
        lastError = `[${model.label}] ${msg}`;
        continue;
      }
      throw err;
    }
  }

  throw new Error(`모든 모델에서 실패: ${lastError}`);
}

export function modelDisplayLabel(model: LlmModel): string {
  return `${model.label} · 학습종료 ${model.cutoff}`;
}
