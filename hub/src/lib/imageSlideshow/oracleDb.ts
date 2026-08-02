/**
 * image_slideshow용 Oracle Autonomous DB 커넥션 풀.
 * node-oracledb는 별도 Oracle Client 설치 없이 동작하는 Thin 모드가 기본값 —
 * initOracleClient()를 호출하지 않으면 자동으로 Thin 모드로 접속한다.
 * eungmomoa-db는 Always Free 등급이라 mTLS(지갑) 접속이 강제되므로, connectString은
 * 지갑의 tnsnames.ora에 정의된 별칭(eungmomoadb_tp)을 쓰고 configDir/walletLocation으로
 * 지갑 디렉터리를 알려준다.
 */
import 'server-only';
import oracledb from 'oracledb';
import { imageSlideshowEnv } from './env';

oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
oracledb.autoCommit = true;
// ai_analysis(CLOB)를 스트림이 아닌 일반 문자열로 바로 받는다 — AI 분석 텍스트는
// 짧은 편이라 스트리밍 처리할 이유가 없음.
oracledb.fetchAsString = [oracledb.CLOB];

// Next.js dev 모드는 라우트 파일을 요청마다 재컴파일/재평가할 수 있어, 모듈 스코프 변수에
// 풀을 담으면 파일이 재평가될 때마다 poolPromise가 null로 초기화되어 createPool()이 다시
// 호출된다. 그런데 oracledb 자체는 풀을 alias(기본 "default") 기준으로 프로세스 전역에서
// 추적하므로, 이전에 만든 풀이 여전히 살아있는 채로 createPool()을 또 부르면
// "NJS-046: pool already exists" 등으로 API가 500을 내게 된다. globalThis에 캐싱해서
// 모듈이 재평가돼도 같은 프로세스 안에서는 풀을 재사용하도록 한다(운영 환경에도 무해함).
declare global {
  // eslint-disable-next-line no-var
  var __imageSlideshowOraclePool: Promise<oracledb.Pool> | undefined;
}

function getPool(): Promise<oracledb.Pool> {
  if (!globalThis.__imageSlideshowOraclePool) {
    globalThis.__imageSlideshowOraclePool = oracledb
      .createPool({
        user: imageSlideshowEnv.oracleUser,
        password: imageSlideshowEnv.oraclePassword,
        connectString: imageSlideshowEnv.oracleConnectString,
        configDir: imageSlideshowEnv.oracleWalletLocation,
        walletLocation: imageSlideshowEnv.oracleWalletLocation,
        walletPassword: imageSlideshowEnv.oracleWalletPassword,
        poolMin: 0,
        poolMax: 4,
        poolIncrement: 1,
      })
      .catch((err) => {
        // 이전 재컴파일에서 만든 풀이 이미 떠 있다면(alias 충돌) 그걸 그대로 재사용한다.
        if (err.message?.includes('NJS-046')) return oracledb.getPool();
        globalThis.__imageSlideshowOraclePool = undefined;
        throw err;
      });
  }
  return globalThis.__imageSlideshowOraclePool;
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

/** Oracle DATE(album_date) → 'YYYY-MM-DD' 문자열. 프론트의 <input type="date">와 호환. */
export function formatOracleDate(value: unknown): string | null {
  if (!value) return null;
  const d = value as Date;
  return d.toISOString().slice(0, 10);
}

/** Oracle TIMESTAMP WITH TIME ZONE(created_at) → ISO 문자열. */
export function formatOracleTimestamp(value: unknown): string | null {
  if (!value) return null;
  return (value as Date).toISOString();
}
