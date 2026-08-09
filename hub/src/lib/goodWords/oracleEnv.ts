/**
 * good-words Oracle Autonomous DB 전용 서버 환경변수 — oracleDb.ts만 이 파일을 import한다.
 * LLM 키(env.ts)와 분리한 이유는 env.ts의 주석 참고. 아직 계정/지갑 미발급 상태라
 * (hub/CLAUDE.md 참고) 이 파일을 import하는 라우트(보관함 조회/저장/삭제)는 지갑이
 * 준비되기 전까지 required()가 던지는 500 에러를 그대로 낸다 — 의도된 동작.
 */
import 'server-only';

function required(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(
      `[env] 필수 환경변수 "${key}"가 설정되지 않았습니다.\n` +
      `→ hub/.env(.local)에 good-words Oracle 값을 채우고 서버를 재시작하세요.`
    );
  }
  return value;
}

export const goodWordsOracleEnv = {
  oracleUser:           required('GOOD_WORDS_ORACLE_USER'),
  oraclePassword:       required('GOOD_WORDS_ORACLE_PASSWORD'),
  oracleConnectString:  required('GOOD_WORDS_ORACLE_CONNECT_STRING'),
  oracleWalletLocation: required('GOOD_WORDS_ORACLE_WALLET_LOCATION'),
  oracleWalletPassword: required('GOOD_WORDS_ORACLE_WALLET_PASSWORD'),
} as const;
