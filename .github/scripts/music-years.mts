/**
 * 매일 밤 music 인기곡 '최근 곡'용 발매 연도를 미리 채운다(.github/workflows/music-years.yml).
 *  1. music/ref.js의 REF_TAGS(세부 장르 → Last.fm 태그)를 읽는다 — 화면과 같은 목록을 쓰려고 파일에서 직접 꺼낸다
 *  2. 세부 장르마다 Last.fm 태그 순위 상위 250곡(허브 /api/music/toptracks의 pool 모드와 같은 방식으로 합침)
 *  3. DB(music_track_years)에 없는 곡만 MusicBrainz에서 연도를 찾아 저장(hub/src/lib/mbYears.ts — 허브와 같은 방법)
 * GitHub 실행 서버에서 돌기 때문에 허브 서버의 MusicBrainz 한도(초당 1회)를 나눠 쓰지 않는다.
 * 첫 실행은 수천 곡이라 1~2시간, 이후에는 새로 순위에 든 곡만 확인해 몇 분이면 끝난다.
 *
 * 실행: node --experimental-strip-types .github/scripts/music-years.mts <hub .env 경로>
 * 필요한 값(.env): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY. Last.fm 키는 Key 관리(tokens)에서 읽는다
 */
import { readFileSync } from 'node:fs';
import { createMbClient, dbKey } from '../../hub/src/lib/mbYears.ts';

const POOL = 250;
const MAX_MINUTES = Number(process.env.MAX_MINUTES || 320); // GitHub Actions 작업 제한(6시간)보다 짧게

// .env 읽기(KEY=VALUE, 따옴표 허용)
const env: Record<string, string> = {};
for (const line of readFileSync(process.argv[2] ?? 'hub/.env', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}
const SUPA = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPA || !SERVICE) throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY가 없습니다');
const sb = (path: string, init: RequestInit = {}) => fetch(`${SUPA}/rest/v1/${path}`, {
  ...init, headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
});

// Last.fm 키: Key 관리(tokens.key_values)
async function lastfmKey(): Promise<string> {
  const rows = await (await sb('tokens?select=key_values')).json() as { key_values: { name?: string; value?: string }[] | null }[];
  for (const r of rows) { const hit = (r.key_values ?? []).find((kv) => kv.name === 'LASTFM_API_KEY'); if (hit?.value) return hit.value; }
  throw new Error('Key 관리에 LASTFM_API_KEY가 없습니다');
}

// ref.js에서 REF_TAGS 객체만 꺼내 평가한다(문자열 배열로만 된 리터럴)
function refTags(): Record<string, string[]> {
  const src = readFileSync('music/ref.js', 'utf8');
  const m = src.match(/const REF_TAGS = (\{[\s\S]*?\n\});/);
  if (!m) throw new Error('music/ref.js에서 REF_TAGS를 찾지 못했습니다');
  return Function(`return (${m[1]});`)();
}

type Track = { name: string; artist: string; mbid?: string };
async function tagTracks(key: string, tag: string, page: number): Promise<Track[]> {
  const u = `https://ws.audioscrobbler.com/2.0/?method=tag.gettoptracks&format=json&limit=100&page=${page}&tag=${encodeURIComponent(tag)}&api_key=${key}`;
  for (let i = 0; i < 3; i++) {
    try {
      const d = await (await fetch(u, { signal: AbortSignal.timeout(15_000) })).json();
      const list = d?.tracks?.track ?? [];
      return (Array.isArray(list) ? list : [list]).map((t: { name?: string; mbid?: string; artist?: { name?: string } }) => ({
        name: String(t?.name ?? '').trim(), artist: String(t?.artist?.name ?? '').trim(), ...(t?.mbid ? { mbid: t.mbid } : {}),
      })).filter((t: Track) => t.name && t.artist);
    } catch { await new Promise((r) => setTimeout(r, 2000)); }
  }
  return [];
}
// 세부 장르 후보: 태그마다 3페이지(300곡)를 받아 순위를 번갈아 합치고 같은 곡은 한 번만, 앞에서 POOL곡
async function pool(key: string, tags: string[]): Promise<Track[]> {
  const lists = await Promise.all(tags.map(async (t) => (await Promise.all([1, 2, 3].map((p) => tagTracks(key, t, p)))).flat()));
  const seen = new Set<string>();
  const out: Track[] = [];
  const longest = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < longest && out.length < POOL; i++) for (const l of lists) {
    const t = l[i];
    if (t && !seen.has(dbKey(t)) && out.length < POOL) { seen.add(dbKey(t)); out.push(t); }
  }
  return out;
}

// DB에 이미 있는 키 전부(페이지로 나눠 읽기)
async function knownKeys(): Promise<Set<string>> {
  const keys = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const r = await sb('music_track_years?select=key', { headers: { Range: `${from}-${from + 999}` } });
    if (!r.ok) throw new Error(`music_track_years 읽기 실패(${r.status}): 마이그레이션(20261108_music_track_years.sql)을 실행했는지 확인하세요`);
    const rows = await r.json() as { key: string }[];
    rows.forEach((x) => keys.add(x.key));
    if (rows.length < 1000) return keys;
  }
}
async function save(rows: { key: string; artist: string; title: string; year: number | null }[]) {
  if (!rows.length) return;
  const r = await sb('music_track_years?on_conflict=key', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify(rows) });
  if (!r.ok) console.error('저장 실패', r.status, await r.text());
}

const started = Date.now();
const key = await lastfmKey();
const tags = refTags();
const known = await knownKeys();
const mb = createMbClient('peterbae-music-nightly/1.0 ( https://peterbae.duckdns.org/music/ )');
console.log(`세부 장르 ${Object.keys(tags).length}개 · DB에 있는 곡 ${known.size}곡`);

let found = 0, checked = 0;
outer: for (const [name, t] of Object.entries(tags)) {
  const list = (await pool(key, t)).filter((x) => !known.has(dbKey(x)));
  console.log(`${name} (${t.join(', ')}): 새로 확인할 곡 ${list.length}곡`);
  let batch: { key: string; artist: string; title: string; year: number | null }[] = [];
  for (const x of list) {
    if ((Date.now() - started) / 60000 > MAX_MINUTES) { await save(batch); console.log('시간 제한에 닿아 멈춥니다(다음 실행에서 이어서)'); break outer; }
    const y = await mb.findYear(x);
    known.add(dbKey(x));
    batch.push({ key: dbKey(x), artist: x.artist, title: x.name, year: y });
    checked++; if (y) found++;
    if (batch.length >= 25) { await save(batch); batch = []; }
  }
  await save(batch);
}
console.log(`끝: ${checked}곡 확인(연도 찾음 ${found}곡) · ${Math.round((Date.now() - started) / 60000)}분`);
