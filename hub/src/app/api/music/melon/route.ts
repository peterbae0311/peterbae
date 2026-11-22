import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabaseServer';

/**
 * music 곡 분석 › [가사] 팝업: 멜론에서 원곡 가사를 찾아 온다.
 * 요청: { q: '제목 가수' } → { songs: [{ id, title, artist }], pick: { id, title, artist, lyrics } | null }
 *       { songId: '602290711' } → { pick: { id, title, artist, lyrics } }
 * 멜론 가사는 문단(빈 줄)만 있고 [Verse] 같은 구간 표시는 없다. 성인 인증 곡 등 가사가 없으면 lyrics는 ''.
 */
const TIMEOUT = 10_000;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

const decode = (t: string) => t
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');

async function get(url: string) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'ko-KR,ko;q=0.9' }, signal: AbortSignal.timeout(TIMEOUT) });
  if (!r.ok) throw new Error(`멜론 ${r.status}`);
  return r.text();
}

async function search(q: string) {
  const html = await get(`https://www.melon.com/search/song/index.htm?q=${encodeURIComponent(q)}&section=song`);
  const body = html.slice(html.indexOf('<tbody'));
  const songs: { id: string; title: string; artist: string }[] = [];
  for (const row of body.split(/<tr[\s>]/).slice(1)) {
    const id = row.match(/goSongDetail\('(\d+)'\)/)?.[1];
    const title = row.match(/class="fc_gray"[^>]*title="([^"]*)"/)?.[1];
    const artist = row.match(/goArtistDetail\('\d+'\)[^>]*>([^<]+)</)?.[1];
    if (id && title && !songs.some((s) => s.id === id)) songs.push({ id, title: decode(title).trim(), artist: decode(artist ?? '').trim() });
    if (songs.length >= 8) break;
  }
  return songs;
}

async function lyrics(id: string) {
  const html = await get(`https://www.melon.com/song/detail.htm?songId=${id}`);
  const raw = html.match(/<div class="lyric[^"]*" id="d_video_summary">([\s\S]*?)<\/div>/)?.[1] ?? '';
  const text = decode(raw.replace(/<!--[\s\S]*?-->/g, '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ''))
    .split('\n').map((l) => l.trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  const title = decode(html.match(/<div class="song_name">[\s\S]*?<\/strong>([\s\S]*?)<\/div>/)?.[1].replace(/<[^>]+>/g, '') ?? '').trim();
  const artist = decode(html.match(/class="artist_name"[^>]*>\s*<span>([^<]+)<\/span>/)?.[1] ?? '').trim();
  return { id, title, artist, lyrics: text };
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const songId = str(body?.songId, 20);
  const q = str(body?.q, 120);
  try {
    if (/^\d+$/.test(songId)) return NextResponse.json({ pick: await lyrics(songId) });
    if (!q) return NextResponse.json({ error: '검색어가 없습니다.' }, { status: 400 });
    // 멜론 곡 검색은 '제목 가수'처럼 섞으면 못 찾는 일이 많다 → 결과가 없으면 뒤 단어부터 빼며 다시 찾고, 뺀 단어(가수)가 맞는 곡을 앞으로
    const words = q.split(/\s+/);
    let songs: Awaited<ReturnType<typeof search>> = [];
    let cut = words.length;
    for (; cut >= Math.max(1, words.length - 4) && !songs.length; cut--) songs = await search(words.slice(0, cut).join(' '));
    // 뺀 단어 중 하나라도 가수 이름에 들어 있으면 앞으로(예: '머무르 MEOMURU' → 멜론 가수 '머무르')
    const rest = words.slice(cut + 1).map((w) => w.toLowerCase());
    const hit = (s: { artist: string }) => +rest.some((w) => s.artist.toLowerCase().includes(w));
    if (rest.length) songs.sort((x, y) => hit(y) - hit(x));
    return NextResponse.json({ songs, pick: songs.length ? await lyrics(songs[0].id) : null });
  } catch (e) {
    return NextResponse.json({ error: `멜론에서 가사를 가져오지 못했습니다: ${(e as Error).message}` }, { status: 502 });
  }
}
