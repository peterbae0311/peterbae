/**
 * good-words Oracle Autonomous DB 전용 서버 환경변수 — oracleDb.ts만 이 파일을 import한다.
 * LLM 키(env.ts)와 분리한 이유는 env.ts의 주석 참고. 아직 계정/지갑 미발급 상태라
 * (hub/CLAUDE.md 참고) 이 파일을 import하는 라우트(보관함 조회/저장/삭제)는 지갑이
 * 준비되기 전까지 required()가 던지는 500 에러를 그대로 낸다 — 의도된 동작.
 *
 * 값을 일반 속성이 아니라 getter로 노출하는 이유: `next build`의 "Collecting page data"
 * 단계는 정적 분석을 위해 모든 라우트 모듈을 실제로 import/평가한다 — 값이 일반 속성이면
 * import되는 순간 required()가 즉시 던져서 (요청이 한 번도 없었는데도) 프로덕션 빌드
 * 자체가 실패한다(실측 확인: GOOD_WORDS_ORACLE_* 미설정 상태로 배포해 hub 전체 배포가
 * 깨졌음). getter로 두면 실제로 DB에 접근하는 요청이 들어와 이 값을 읽을 때만 던진다.
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
  get oracleUser()           { return required('GOOD_WORDS_ORACLE_USER'); },
  get oraclePassword()       { return required('GOOD_WORDS_ORACLE_PASSWORD'); },
  get oracleConnectString()  { return required('GOOD_WORDS_ORACLE_CONNECT_STRING'); },
  get oracleWalletLocation() { return required('GOOD_WORDS_ORACLE_WALLET_LOCATION'); },
  get oracleWalletPassword() { return required('GOOD_WORDS_ORACLE_WALLET_PASSWORD'); },
};
