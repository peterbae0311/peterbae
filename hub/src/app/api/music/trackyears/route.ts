import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabaseServer';

/**
 * music 인기곡 탭 '최근 곡' 보기: 곡마다 처음 발매된 연도를 MusicBrainz에서 찾는다(키 불필요, 무료).
 * 요청: { tracks: [{ name, artist, mbid? }] } (최대 40곡) → { years: { "가수\u0000제목"(소문자): 2024 | null }, checked }
 *  - 가수를 MusicBrainz 아티스트 ID로 먼저 찾고(별칭 포함 — 'Miki Matsubara' → 松原みき), 그 가수의 녹음 중 제목이 들어간 것의
 *    가장 이른 첫 발매 연도를 쓴다(리마스터·재발매·리믹스가 새 녹음으로 잡혀도 원곡 연도를 고르게).
 *    실측: 'Stay With Me'(1979)가 이름 검색으로는 2023 재발매로 나왔고, 아티스트 ID 검색으로 1979를 찾았다
 *  - 가수를 못 찾으면 제목·가수 이름 검색, 그래도 없으면 Last.fm이 준 recording MBID
 *  - MusicBrainz 이용 규칙: 초당 1회, 연락처가 있는 User-Agent. 서버 전체에서 한 줄로 기다리게 큐를 둔다
 *  - 한 번 찾은 연도는 바뀌지 않아 서버 메모리에 기억한다(재시작하면 비워짐 — 브라우저도 따로 기억함)
 *  - nginx proxy_read_timeout 60초 안에 끝나도록 요청마다 45초까지만 찾고, 못 찾은 곡은 다음 요청에서 이어서 한다
 */
const UA = 'peterbae-music/1.0 ( https://peterbae.duckdns.org/music/ )';
const GAP_MS = 1100;
const BUDGET_MS = 45_000;
const MAX_TRACKS = 40;

const cache = new Map<string, number | null>();
const artistIds = new Map<string, string | null>();
let queue: Promise<unknown> = Promise.resolve();
let lastAt = 0;

// MusicBrainz 호출을 서버 전체에서 순서대로, 1.1초 간격으로
function mb<T>(url: string): Promise<T | null> {
  const run = queue.then(async () => {
    const wait = lastAt + GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastAt = Date.now();
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(10_000) });
        if (r.ok) return (await r.json()) as T;
        if (r.status !== 503) return null; // 503: 잠시 바쁨 → 2초 쉬고 한 번 더
      } catch {
        return null;
      }
      await new Promise((res) => setTimeout(res, 2000));
      lastAt = Date.now();
    }
    return null;
  });
  queue = run.catch(() => null);
  return run;
}

const yearOf = (d?: string) => (d && /^\d{4}/.test(d) ? Number(d.slice(0, 4)) : null);
const lucene = (s: string) => `"${s.replace(/[\\"]/g, '\\$&')}"`;

type Rec = { score?: number; title?: string; 'first-release-date'?: string };

// 제목 비교용: 소문자, 기호·괄호 제거('真夜中のドア 〜stay with me〜' 안에 'stay with me'가 들어 있는지 본다)
const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const earliest = (recs: Rec[] | undefined, minScore: number, title?: string) => {
  const want = title ? norm(title) : '';
  const ys = (recs ?? []).filter((r) => (r.score ?? 0) >= minScore && (!want || norm(r.title ?? '').includes(want)))
    .map((r) => yearOf(r['first-release-date'])).filter((y): y is number => !!y);
  return ys.length ? Math.min(...ys) : null;
};

async function artistId(name: string): Promise<string | null> {
  const k = name.toLowerCase();
  if (artistIds.has(k)) return artistIds.get(k)!;
  const d = await mb<{ artists?: { id: string; score?: number }[] }>(`https://musicbrainz.org/ws/2/artist/?fmt=json&limit=3&query=${encodeURIComponent(name)}`);
  const hit = (d?.artists ?? []).find((a) => (a.score ?? 0) >= 95);
  artistIds.set(k, hit?.id ?? null);
  return hit?.id ?? null;
}

async function findYear(t: { name: string; artist: string; mbid?: string }): Promise<number | null> {
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

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const tracks = (Array.isArray(body?.tracks) ? body.tracks : []).slice(0, MAX_TRACKS)
    .map((t: { name?: unknown; artist?: unknown; mbid?: unknown }) => ({
      name: typeof t?.name === 'string' ? t.name.slice(0, 200) : '',
      artist: typeof t?.artist === 'string' ? t.artist.slice(0, 200) : '',
      mbid: typeof t?.mbid === 'string' && /^[0-9a-f-]{36}$/i.test(t.mbid) ? t.mbid : undefined,
    }))
    .filter((t: { name: string; artist: string }) => t.name && t.artist);
  if (!tracks.length) return NextResponse.json({ error: '곡 목록이 없습니다.' }, { status: 400 });

  const started = Date.now();
  const years: Record<string, number | null> = {};
  let checked = 0;
  for (const t of tracks) {
    const k = `${t.artist}\u0000${t.name}`.toLowerCase();
    if (cache.has(k)) { years[k] = cache.get(k)!; checked++; continue; }
    if (Date.now() - started > BUDGET_MS) break; // 남은 곡은 다음 요청에서
    const y = await findYear(t);
    cache.set(k, y);
    years[k] = y;
    checked++;
  }
  return NextResponse.json({ years, checked });
}
