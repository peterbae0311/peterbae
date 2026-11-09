import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { getTokenKeyValue } from '@/lib/tokenStore';

/**
 * music '인기곡' 탭: 세부 장르의 인기곡 Top N(Last.fm tag.getTopTracks — 그 태그를 붙인 청취자가 많은 순).
 * 요청: { tags: ['city pop'], fallback?: 'pop', limit?: 20, pool?: 250 }
 *  - pool: '최근 곡' 보기용 후보 수. 주면 fallback 없이 태그 순위를 pool곡까지 돌려준다(발매 연도는 trackyears 라우트가 확인)
 *  - tags가 여러 개면(예: 하우스·EDM → house, edm) 순위를 번갈아 합치고 같은 곡(가수+제목)은 한 번만
 *  - N곡이 안 되면 fallback(넓은 장르) 태그로 채우고 그 곡에는 from: fallback을 붙인다
 * 요청: { plays: [{ name, artist, mbid? }] } (최대 30곡) → { plays: { '가수\0제목'(소문자): { p: 누적 재생 수, l: 청취자 수 } } }
 *  - 화면에 보이는 곡의 Last.fm 누적 재생 수(track.getInfo). 태그 순위 응답에는 재생 수가 없어서 따로 받는다
 * 키: Key 관리의 LASTFM_API_KEY. 경로가 /api/music/... 이라 nginx auth_request가 music 앱 권한으로 판별한다.
 */
const TIMEOUT = 12_000;
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().toLowerCase().slice(0, max) : '');

type Track = { name: string; artist: string; url: string; tag: string; mbid?: string; from?: string };

async function topTracks(apiKey: string, tag: string, limit: number, page = 1): Promise<Track[]> {
  const u = `https://ws.audioscrobbler.com/2.0/?method=tag.gettoptracks&format=json&limit=${limit}&page=${page}`
    + `&tag=${encodeURIComponent(tag)}&api_key=${encodeURIComponent(apiKey)}`;
  const r = await fetch(u, { signal: AbortSignal.timeout(TIMEOUT) });
  if (!r.ok) throw new Error(`Last.fm ${r.status}`);
  const d = await r.json();
  if (d?.error) throw new Error(`Last.fm ${d.error}: ${d.message ?? ''}`);
  const list = d?.tracks?.track ?? [];
  return (Array.isArray(list) ? list : [list]).map((t: { name?: string; url?: string; mbid?: string; artist?: { name?: string } }) => ({
    name: String(t?.name ?? '').trim(), artist: String(t?.artist?.name ?? '').trim(), url: String(t?.url ?? ''), tag,
    ...(t?.mbid ? { mbid: String(t.mbid) } : {}),
  })).filter((t: Track) => t.name && t.artist);
}

// 곡 하나의 누적 재생 수·청취자 수. 못 찾으면 null
async function trackPlays(apiKey: string, t: { name: string; artist: string; mbid?: string }) {
  const q = t.mbid ? `mbid=${encodeURIComponent(t.mbid)}` : `artist=${encodeURIComponent(t.artist)}&track=${encodeURIComponent(t.name)}`;
  const get = async (query: string) => {
    const r = await fetch(`https://ws.audioscrobbler.com/2.0/?method=track.getInfo&format=json&autocorrect=1&${query}&api_key=${encodeURIComponent(apiKey)}`,
      { signal: AbortSignal.timeout(TIMEOUT) });
    if (!r.ok) return null;
    const d = await r.json();
    return d?.track ?? null;
  };
  // mbid로 못 찾으면(가끔 지워진 mbid) 가수·제목으로 다시
  let tr = await get(q);
  if (!tr && t.mbid) tr = await get(`artist=${encodeURIComponent(t.artist)}&track=${encodeURIComponent(t.name)}`);
  if (!tr) return null;
  return { p: Number(tr.playcount) || 0, l: Number(tr.listeners) || 0 };
}

async function playsMode(raw: unknown[]) {
  const apiKey = await getTokenKeyValue('LASTFM_API_KEY');
  if (!apiKey) return NextResponse.json({ error: 'Key 관리에 LASTFM_API_KEY가 등록되어 있지 않습니다.' }, { status: 500 });
  const raw2 = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const list = raw.slice(0, 30).map((x) => {
    const o = (x ?? {}) as Record<string, unknown>;
    return { name: raw2(o.name, 200), artist: raw2(o.artist, 200), mbid: raw2(o.mbid, 64) || undefined };
  }).filter((t) => t.name && t.artist);
  const plays: Record<string, { p: number; l: number } | null> = {};
  // Last.fm 한도(초당 5회 안팎)를 넘지 않게 5곡씩 나눠 받는다
  for (let i = 0; i < list.length; i += 5) {
    await Promise.all(list.slice(i, i + 5).map(async (t) => {
      plays[`${t.artist}\u0000${t.name}`.toLowerCase()] = await trackPlays(apiKey, t).catch(() => null);
    }));
  }
  return NextResponse.json({ plays });
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (Array.isArray(body?.plays)) return playsMode(body.plays);
  const tags = (Array.isArray(body?.tags) ? body.tags : []).map((t: unknown) => str(t, 60)).filter(Boolean).slice(0, 3) as string[];
  const fallback = str(body?.fallback, 60);
  const limit = Math.min(30, Math.max(5, Number(body?.limit) || 20));
  const pool = Math.min(300, Math.max(0, Number(body?.pool) || 0));
  if (!tags.length) return NextResponse.json({ error: '장르 태그가 없습니다.' }, { status: 400 });

  const apiKey = await getTokenKeyValue('LASTFM_API_KEY');
  if (!apiKey) return NextResponse.json({ error: 'Key 관리에 LASTFM_API_KEY가 등록되어 있지 않습니다.' }, { status: 500 });

  const key = (t: Track) => `${t.artist}\u0000${t.name}`.toLowerCase();
  const seen = new Set<string>();
  const out: Track[] = [];
  const add = (t: Track) => { if (out.length < limit && !seen.has(key(t))) { seen.add(key(t)); out.push(t); } };

  try {
    if (pool) {
      // '최근 곡' 후보: 태그마다 100곡씩 페이지로 받아 순위를 번갈아 합친다(넓은 장르로 채우지 않음)
      const pages = Math.ceil(pool / 100);
      const lists = await Promise.all(tags.map((t) => Promise.all(Array.from({ length: pages }, (_, p) => topTracks(apiKey, t, 100, p + 1).catch(() => [] as Track[])))
        .then((ps) => ps.flat())));
      const all: Track[] = [];
      const seenAll = new Set<string>();
      const longest = Math.max(...lists.map((l) => l.length));
      for (let i = 0; i < longest && all.length < pool; i++) lists.forEach((l) => { const t = l[i]; if (t && !seenAll.has(key(t))) { seenAll.add(key(t)); all.push(t); } });
      return NextResponse.json({ tracks: all.slice(0, pool), tags, fallback: '' });
    }
    // 태그별 순위를 번갈아 합친다(1위끼리, 2위끼리 …)
    const lists = await Promise.all(tags.map((t) => topTracks(apiKey, t, limit).catch(() => [] as Track[])));
    for (let i = 0; i < limit; i++) lists.forEach((l) => l[i] && add(l[i]));
    let usedFallback = false;
    if (out.length < limit && fallback && !tags.includes(fallback)) {
      const more = await topTracks(apiKey, fallback, limit * 2).catch(() => [] as Track[]);
      more.forEach((t) => { if (out.length < limit) { const before = out.length; add({ ...t, from: fallback }); if (out.length > before) usedFallback = true; } });
    }
    return NextResponse.json({ tracks: out, tags, fallback: usedFallback ? fallback : '' });
  } catch (e) {
    return NextResponse.json({ error: `인기곡을 가져오지 못했습니다(${(e as Error).message}).` }, { status: 502 });
  }
}
