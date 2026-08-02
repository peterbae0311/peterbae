/**
 * image_slideshow API 라우트 전용 서버 환경변수.
 * 다른 hub 기능과 무관하므로 별도 파일로 분리 — 이 값들이 없어도 hub의 나머지
 * 페이지/라우트는 영향받지 않음(이 파일을 import하는 image_slideshow 라우트만 실패).
 */
import 'server-only';

function required(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(
      `[env] 필수 환경변수 "${key}"가 설정되지 않았습니다.\n` +
      `→ hub/.env(.local)에 image_slideshow용 Oracle/OCI 값을 채우고 서버를 재시작하세요.`
    );
  }
  return value;
}

export const imageSlideshowEnv = {
  // image_slideshow 전용 Supabase 프로젝트(pnudzuajpuvhcyhxjwva) URL.
  // 이 프로젝트는 이미 비대칭 JWT 서명 키(ECC P-256)로 전환되어 있어(레거시 HS256 공유비밀키는
  // "이전 키"로만 남아있음), 고정 비밀키가 아니라 /auth/v1/.well-known/jwks.json의 공개키로
  // access_token 서명을 검증한다 (auth.ts 참고).
  supabaseUrl: required('IMAGE_SLIDESHOW_SUPABASE_URL'),

  // Oracle Autonomous DB (node-oracledb thin mode) — Always Free 등급은 mTLS(지갑) 접속이 강제라
  // 지갑 디렉터리 경로가 반드시 필요함. 지갑 파일 자체는 git에 올리지 않으므로(oracle/wallet/은
  // .gitignore 처리) 배포 서버의 고정 경로(예: ~/apps/oracle-wallet)에 별도로 올려두고 그 경로를 가리킬 것.
  oracleUser:            required('IMAGE_SLIDESHOW_ORACLE_USER'),
  oraclePassword:        required('IMAGE_SLIDESHOW_ORACLE_PASSWORD'),
  oracleConnectString:   required('IMAGE_SLIDESHOW_ORACLE_CONNECT_STRING'),
  oracleWalletLocation:  required('IMAGE_SLIDESHOW_ORACLE_WALLET_LOCATION'),
  oracleWalletPassword:  required('IMAGE_SLIDESHOW_ORACLE_WALLET_PASSWORD'),

  // OCI Object Storage (Pre-Authenticated Request 발급용)
  ociTenancy:     required('IMAGE_SLIDESHOW_OCI_TENANCY_OCID'),
  ociUser:        required('IMAGE_SLIDESHOW_OCI_USER_OCID'),
  ociFingerprint: required('IMAGE_SLIDESHOW_OCI_FINGERPRINT'),
  ociPrivateKey:  required('IMAGE_SLIDESHOW_OCI_PRIVATE_KEY').replace(/\\n/g, '\n'),
  ociRegion:      required('IMAGE_SLIDESHOW_OCI_REGION'),
  ociNamespace:   required('IMAGE_SLIDESHOW_OCI_NAMESPACE'),
  ociBucket:      required('IMAGE_SLIDESHOW_OCI_BUCKET'),
} as const;
