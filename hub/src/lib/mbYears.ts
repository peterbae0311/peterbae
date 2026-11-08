/**
 * MusicBrainz로 곡의 첫 발매 연도를 찾는다(키 불필요, 무료). 허브 라우트(/api/music/trackyears)와
 * 야간 작업(.github/scripts/music-years.mts — Node --experimental-strip-types로 실행)이 함께 쓴다.
 * 그래서 import 없이 순수 TS로 두고, 타입 문법도 실행 시 지울 수 있는 것만 쓴다.
 *
 * 찾는 방법
 *  1. 가수를 MusicBrainz 아티스트 ID로 찾는다(별칭 포함 — 'Miki Matsubara' → 松原みき). 가수별로 기억한다
 *  2. 그 가수의 녹음 중 제목이 들어간 것들의 가장 이른 첫 발매 연도(리마스터·재발매·리믹스가 새 녹음이어도 원곡 연도)
 *     실측: 'Stay With Me'(1979)가 이름 검색으로는 2023 재발매로 나왔고, 이 방법으로 1979를 찾았다
 *  3. 없으면 제목·가수 이름 검색(점수 90 이상), 그래도 없으면 Last.fm이 준 recording MBID
 * 이용 규칙: 초당 1회, 연락처가 있는 User-Agent. 클라이언트마다 한 줄로 기다리게 큐를 둔다.
 */
export type MbTrack = { name: string; artist: string; mbid?: string };
type Rec = { score?: number; title?: string; 'first-release-date'?: string };

// 저장용 키: Postgres text에는 NUL을 넣을 수 없어 탭으로 구분한다(브라우저 쪽 키는 \u0000 — 라우트가 바꿔 준다)
export const dbKey = (t: { name: string; artist: string }) => `${t.artist}\t${t.name}`.toLowerCase();

const yearOf = (d?: string) => (d && /^\d{4}/.test(d) ? Number(d.slice(0, 4)) : null);
const lucene = (s: string) => `"${s.replace(/[\\"]/g, '\\$&')}"`;
// 제목 비교용: 소문자, 기호·괄호 제거('真夜中のドア 〜stay with me〜' 안에 'stay with me'가 들어 있는지 본다)
const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const earliest = (recs: Rec[] | undefined, minScore: number, title?: string) => {
  const want = title ? norm(title) : '';
  const ys = (recs ?? []).filter((r) => (r.score ?? 0) >= minScore && (!want || norm(r.title ?? '').includes(want)))
    .map((r) => yearOf(r['first-release-date'])).filter((y): y is number => !!y);
  return ys.length ? Math.min(...ys) : null;
};

export function createMbClient(userAgent: string, gapMs = 1100) {
  let queue: Promise<unknown> = Promise.resolve();
  let lastAt = 0;
  const artistIds = new Map<string, string | null>();

  // 호출을 순서대로, gapMs 간격으로. 503(잠시 바쁨)이면 2초 쉬고 한 번 더
  function mb<T>(url: string): Promise<T | null> {
    const run = queue.then(async () => {
      for (let attempt = 0; attempt < 2; attempt++) {
        const wait = lastAt + gapMs - Date.now();
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        lastAt = Date.now();
        try {
          const r = await fetch(url, { headers: { 'User-Agent': userAgent, Accept: 'application/json' }, signal: AbortSignal.timeout(10_000) });
          if (r.ok) return (await r.json()) as T;
          if (r.status !== 503) return null;
        } catch {
          return null;
        }
        await new Promise((res) => setTimeout(res, 2000));
      }
      return null;
    });
    queue = run.catch(() => null);
    return run;
  }

  async function artistId(name: string): Promise<string | null> {
    const k = name.toLowerCase();
    if (artistIds.has(k)) return artistIds.get(k) ?? null;
    const d = await mb<{ artists?: { id: string; score?: number }[] }>(`https://musicbrainz.org/ws/2/artist/?fmt=json&limit=3&query=${encodeURIComponent(name)}`);
    const hit = (d?.artists ?? []).find((a) => (a.score ?? 0) >= 95);
    artistIds.set(k, hit?.id ?? null);
    return hit?.id ?? null;
  }

  async function findYear(t: MbTrack): Promise<number | null> {
    const arid = await artistId(t.artist);
    if (arid) {
      // 검색어 안의 and·or·not은 MusicBrainz 검색에서 연산자로 읽히므로 뺀다
      const words = norm(t.name).replace(/\b(and|or|not)\b/g, ' ').replace(/\s+/g, ' ').trim();
      const d = await mb<{ recordings?: Rec[] }>(`https://musicbrainz.org/ws/2/recording/?fmt=json&limit=50&query=${encodeURIComponent(`recording:(${words}) AND arid:${arid}`)}`);
      const y = earliest(d?.recordings, 50, t.name);
      if (y) return y;
    }
    const d = await mb<{ recordings?: Rec[] }>(`https://musicbrainz.org/ws/2/recording/?fmt=json&limit=10&query=${encodeURIComponent(`recording:${lucene(t.name)} AND artist:${lucene(t.artist)}`)}`);
    const y = earliest(d?.recordings, 90);
    if (y) return y;
    if (t.mbid) {
      const r = await mb<Rec>(`https://musicbrainz.org/ws/2/recording/${encodeURIComponent(t.mbid)}?fmt=json`);
      return yearOf(r?.['first-release-date']);
    }
    return null;
  }

  return { findYear };
}
