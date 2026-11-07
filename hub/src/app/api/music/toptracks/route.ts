import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { getTokenKeyValue } from '@/lib/tokenStore';

/**
 * music '참고곡' 탭: 세부 장르의 인기곡 Top N(Last.fm tag.getTopTracks — 그 태그를 붙인 청취자가 많은 순).
 * 요청: { tags: ['city pop'], fallback?: 'pop', limit?: 20 }
 *  - tags가 여러 개면(예: 하우스·EDM → house, edm) 순위를 번갈아 합치고 같은 곡(가수+제목)은 한 번만
 *  - N곡이 안 되면 fallback(넓은 장르) 태그로 채우고 그 곡에는 from: fallback을 붙인다
 * 키: Key 관리의 LASTFM_API_KEY. 경로가 /api/music/... 이라 nginx auth_request가 music 앱 권한으로 판별한다.
 */
const TIMEOUT = 12_000;
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().toLowerCase().slice(0, max) : '');

type Track = { name: string; artist: string; url: string; tag: string; from?: string };

async function topTracks(apiKey: string, tag: string, limit: number): Promise<Track[]> {
  const u = `https://ws.audioscrobbler.com/2.0/?method=tag.gettoptracks&format=json&limit=${limit}`
    + `&tag=${encodeURIComponent(tag)}&api_key=${encodeURIComponent(apiKey)}`;
  const r = await fetch(u, { signal: AbortSignal.timeout(TIMEOUT) });
  if (!r.ok) throw new Error(`Last.fm ${r.status}`);
  const d = await r.json();
  if (d?.error) throw new Error(`Last.fm ${d.error}: ${d.message ?? ''}`);
  const list = d?.tracks?.track ?? [];
  return (Array.isArray(list) ? list : [list]).map((t: { name?: string; url?: string; artist?: { name?: string } }) => ({
    name: String(t?.name ?? '').trim(), artist: String(t?.artist?.name ?? '').trim(), url: String(t?.url ?? ''), tag,
  })).filter((t: Track) => t.name && t.artist);
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const tags = (Array.isArray(body?.tags) ? body.tags : []).map((t: unknown) => str(t, 60)).filter(Boolean).slice(0, 3) as string[];
  const fallback = str(body?.fallback, 60);
  const limit = Math.min(30, Math.max(5, Number(body?.limit) || 20));
  if (!tags.length) return NextResponse.json({ error: '장르 태그가 없습니다.' }, { status: 400 });

  const apiKey = await getTokenKeyValue('LASTFM_API_KEY');
  if (!apiKey) return NextResponse.json({ error: 'Key 관리에 LASTFM_API_KEY가 등록되어 있지 않습니다.' }, { status: 500 });

  const key = (t: Track) => `${t.artist}\u0000${t.name}`.toLowerCase();
  const seen = new Set<string>();
  const out: Track[] = [];
  const add = (t: Track) => { if (out.length < limit && !seen.has(key(t))) { seen.add(key(t)); out.push(t); } };

  try {
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
