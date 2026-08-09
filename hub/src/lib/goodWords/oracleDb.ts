/**
 * good-words용 Oracle Autonomous DB 커넥션 풀.
 * image_slideshow(src/lib/imageSlideshow/oracleDb.ts)와 같은 프로세스 안에서 oracledb
 * 모듈 인스턴스를 공유하므로(next.config.js의 serverExternalPackages), poolAlias를 명시하지
 * 않으면 두 풀이 똑같이 "default" alias를 놓고 충돌한다(NJS-046) — good-words는 반드시
 * 별도 poolAlias('good-words')를 써서 image_slideshow의 지갑/자격증명과 섞이지 않게 한다.
 */
import 'server-only';
import oracledb from 'oracledb';
import { goodWordsOracleEnv } from './oracleEnv';

const POOL_ALIAS = 'good-words';

oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
oracledb.autoCommit = true;

// Next.js dev 모드 재컴파일 시 모듈 스코프 변수가 초기화되는 문제 회피 — image_slideshow와
// 동일한 이유로 globalThis에 캐싱(oracleDb.ts 주석 참고).
declare global {
  // eslint-disable-next-line no-var
  var __goodWordsOraclePool: Promise<oracledb.Pool> | undefined;
}

function getPool(): Promise<oracledb.Pool> {
  if (!globalThis.__goodWordsOraclePool) {
    globalThis.__goodWordsOraclePool = oracledb
      .createPool({
        poolAlias: POOL_ALIAS,
        user: goodWordsOracleEnv.oracleUser,
        password: goodWordsOracleEnv.oraclePassword,
        connectString: goodWordsOracleEnv.oracleConnectString,
        configDir: goodWordsOracleEnv.oracleWalletLocation,
        walletLocation: goodWordsOracleEnv.oracleWalletLocation,
        walletPassword: goodWordsOracleEnv.oracleWalletPassword,
        poolMin: 0,
        poolMax: 4,
        poolIncrement: 1,
      })
      .catch((err) => {
        if (err.message?.includes('NJS-046')) return oracledb.getPool(POOL_ALIAS);
        globalThis.__goodWordsOraclePool = undefined;
        throw err;
      });
  }
  return globalThis.__goodWordsOraclePool;
}

export async function withConnection<T>(
  fn: (conn: oracledb.Connection) => Promise<T>
): Promise<T> {
  const pool = await getPool();
  const conn = await pool.getConnection();
  try {
    return await fn(conn);
  } finally {
    await conn.close();
  }
}

/** Oracle TIMESTAMP WITH TIME ZONE(created_at 등) → ISO 문자열. */
export function formatOracleTimestamp(value: unknown): string | null {
  if (!value) return null;
  return (value as Date).toISOString();
}
