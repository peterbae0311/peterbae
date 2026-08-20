/**
 * 학습목표 다듬기 LLM 생성 전용 서버 환경변수.
 * 없으면 그 provider만 실패로 다루므로(good-words의 env.ts와 동일 패턴) required()로 막지
 * 않는다 — aiProviders.ts가 undefined 키를 만나면 폴백 체인의 다음 provider로 넘어간다.
 */
import 'server-only';

export const refineObjectivesLlmEnv = {
  openrouterApiKey: process.env.REFINE_OBJECTIVES_OPENROUTER_API_KEY,
  groqApiKey: process.env.REFINE_OBJECTIVES_GROQ_API_KEY,
  hfToken: process.env.REFINE_OBJECTIVES_HF_TOKEN,
} as const;
