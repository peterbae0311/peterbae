/**
 * 서버 전용 비밀 환경변수.
 *
 * `import 'server-only'` — 이 모듈을 클라이언트 컴포넌트에서 import하면
 * Next.js 빌드 타임에 즉시 에러가 발생합니다 (브라우저 번들에 포함 불가).
 *
 * 선택적(optional) 값은 null 반환 → 각 사용처에서 null 체크 후 mock/fallback 처리.
 */
import 'server-only';

function optional(key: string): string | null {
  return process.env[key] || null;
}

export const serverEnv = {
  // AI 자기소개서 작성 (없으면 AI 기능 비활성)
  openrouterApiKey: optional('OPENROUTER_API_KEY'),
  groqApiKey:       optional('GROQ_API_KEY'),

  // 채용공고 API (없으면 mock 데이터 반환)
  worknetApiKey:   optional('WORKNET_API_KEY'),
  saraminApiKey:   optional('SARAMIN_API_KEY'),
} as const;
