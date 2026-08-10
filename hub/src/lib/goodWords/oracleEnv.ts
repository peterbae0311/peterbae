/**
 * good-words Oracle Autonomous DB 전용 서버 환경변수 — oracleDb.ts만 이 파일을 import한다.
 * LLM 키(env.ts)와 분리한 이유는 env.ts의 주석 참고.
 *
 * image_slideshow가 쓰는 eungmomoa-db 인스턴스를 그대로 공유하기로 결정했다(별도 Always
 * Free 슬롯을 새로 쓰지 않고, 지갑 파일도 하나만 관리하기 위함 — hub/CLAUDE.md 참고).
 * 그래서 connectString/지갑 값은 IMAGE_SLIDESHOW_ORACLE_* 키를 그대로 재사용하고,
 * good-words가 실제로 새로 발급받는 값은 이 DB 안의 전용 스키마 계정(GOOD_WORDS_ORACLE_USER/
 * PASSWORD) 뿐이다. imageSlideshowEnv를 통째로 import하지 않는 이유는, 그러면 good-words와
 * 무관한 OCI Object Storage 키까지 필수값으로 끌려들어와 두 기능의 장애가 서로 옮는다 —
 * 이 파일 안에서 필요한 3개 키만 직접 읽는다.
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
  // good-words 전용으로 새로 발급하는 값 — eungmomoa-db 안의 별도 스키마 계정.
  get oracleUser()     { return required('GOOD_WORDS_ORACLE_USER'); },
  get oraclePassword() { return required('GOOD_WORDS_ORACLE_PASSWORD'); },

  // image_slideshow와 같은 인스턴스/지갑을 공유하므로 그 쪽 키를 그대로 재사용.
  get oracleConnectString()  { return required('IMAGE_SLIDESHOW_ORACLE_CONNECT_STRING'); },
  get oracleWalletLocation() { return required('IMAGE_SLIDESHOW_ORACLE_WALLET_LOCATION'); },
  get oracleWalletPassword() { return required('IMAGE_SLIDESHOW_ORACLE_WALLET_PASSWORD'); },
};
