/**
 * 클라이언트 + 서버 양쪽에서 사용 가능한 공개 환경변수.
 * career 앱과 반드시 동일한 Supabase 프로젝트를 가리켜야 세션 쿠키가 공유됨.
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

export const clientEnv = {
  supabaseUrl:     required('NEXT_PUBLIC_SUPABASE_URL',     process.env.NEXT_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: required('NEXT_PUBLIC_SUPABASE_ANON_KEY', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
} as const;
