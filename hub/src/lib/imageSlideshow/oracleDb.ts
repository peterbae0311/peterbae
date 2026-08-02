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

let poolPromise: Promise<oracledb.Pool> | null = null;

function getPool(): Promise<oracledb.Pool> {
  if (!poolPromise) {
    poolPromise = oracledb.createPool({
      user: imageSlideshowEnv.oracleUser,
      password: imageSlideshowEnv.oraclePassword,
      connectString: imageSlideshowEnv.oracleConnectString,
      configDir: imageSlideshowEnv.oracleWalletLocation,
      walletLocation: imageSlideshowEnv.oracleWalletLocation,
      walletPassword: imageSlideshowEnv.oracleWalletPassword,
      poolMin: 0,
      poolMax: 4,
      poolIncrement: 1,
    });
  }
  return poolPromise;
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
