/**
 * 클라이언트 + 서버 양쪽에서 사용 가능한 공개 환경변수.
 * NEXT_PUBLIC_ 접두사 변수만 포함 — 브라우저에 노출돼도 안전한 값.
 *
 * ─ 서버(SSR/Node):  변수 누락 시 즉시 에러 throw → 배포 전에 반드시 발견
 * ─ 클라이언트(브라우저): 변수 누락 시 console.error 출력 후 빈 문자열 반환
 *   (모듈 초기화 중 throw 하면 앱 전체가 크래시되므로 브라우저에서는 경고만)
 */

function required(key: string, value: string | undefined): string {
  if (!value) {
    const msg =
      `[env] 필수 환경변수 "${key}"가 설정되지 않았습니다.\n` +
      `→ .env.local 파일을 확인하고 dev 서버를 재시작하세요.`;

    if (typeof window === 'undefined') {
      throw new Error(msg);
    } else {
      console.error(msg);
      return '';
    }
  }
  return value;
}

// Next.js는 NEXT_PUBLIC_ 변수를 빌드 시 정적으로 치환함.
// process.env[key] 동적 접근은 클라이언트 번들에서 undefined를 반환하므로
// 반드시 리터럴 문자열로 접근해야 함.
export const clientEnv = {
  supabaseUrl:     required('NEXT_PUBLIC_SUPABASE_URL',     process.env.NEXT_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: required('NEXT_PUBLIC_SUPABASE_ANON_KEY', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
} as const;
