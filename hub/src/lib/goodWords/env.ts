/**
 * good-words LLM 생성 전용 서버 환경변수.
 * Oracle 환경변수는 별도 파일(oracleEnv.ts)로 분리했다 — 두 값 그룹을 한 파일에 두면
 * generate 라우트가 aiProviders.ts만 필요해도 모듈 평가 시점에 파일 전체가 실행되어,
 * 아직 발급 전인 Oracle 값의 required()까지 함께 던져버린다(good-words 전용 DB 계정
 * 미발급 상태에서도 생성 기능만은 먼저 테스트할 수 있어야 하므로 분리가 필수).
 */
import 'server-only';

// 없으면 그 provider만 실패로 다루므로(lottery의 ai-providers.ts와 동일 패턴) required()로 막지 않는다 —
// aiProviders.ts가 undefined 키를 만나면 폴백 체인의 다음 provider로 넘어간다.
export const goodWordsLlmEnv = {
  openrouterApiKey: process.env.GOOD_WORDS_OPENROUTER_API_KEY,
  groqApiKey: process.env.GOOD_WORDS_GROQ_API_KEY,
  hfToken: process.env.GOOD_WORDS_HF_TOKEN,
} as const;
