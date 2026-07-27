import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`환경변수 ${name}가 설정되지 않았습니다. .env를 확인하세요.`);
  }
  return value;
}

export const env = {
  supabaseUrl: required('SUPABASE_URL'),
  supabaseServiceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
};

/** 소스 코드별 외부 API 서비스키를 <SOURCE_CODE>_SERVICE_KEY 환경변수에서 읽는다. */
export function getSourceServiceKey(sourceCode: string): string | undefined {
  const envName = `${sourceCode.toUpperCase()}_SERVICE_KEY`;
  return process.env[envName];
}
