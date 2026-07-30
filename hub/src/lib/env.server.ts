/**
 * 서버 전용 비밀 환경변수.
 * `import 'server-only'` — 클라이언트 컴포넌트에서 import하면 빌드 타임에 에러.
 */
import 'server-only';

function required(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(
      `[env] 필수 환경변수 "${key}"가 설정되지 않았습니다.\n` +
      `→ .env 파일을 확인하고 서버를 재시작하세요.`
    );
  }
  return value;
}

export const serverEnv = {
  // Admin API(사용자 목록 조회 등)에만 사용 — 절대 클라이언트로 노출 금지.
  supabaseServiceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
} as const;
