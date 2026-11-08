import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { createAdminClient } from '@/lib/supabaseAdmin';
import { createMbClient, dbKey } from '@/lib/mbYears';

/**
 * music 인기곡 탭 발매 연도: 곡마다 처음 발매된 연도(MusicBrainz, lib/mbYears.ts).
 * 요청: { tracks: [{ name, artist, mbid? }] } (최대 40곡) → { years: { "가수\u0000제목"(소문자): 2024 | null }, checked }
 *  - 먼저 DB(music_track_years)에서 찾는다. 매일 밤 GitHub Actions(music-years.yml)가 세부 장르 후보곡을 미리 채워 두므로
 *    보통은 여기서 바로 끝난다. 없는 곡만 MusicBrainz에서 찾고 DB에 저장해 모든 PC가 함께 쓴다
 *  - MusicBrainz는 초당 1회라 서버 전체에서 한 줄로 기다린다(lib의 큐). nginx 60초 제한 안에 끝나도록 요청마다 45초까지만
 *    찾고, 못 찾은 곡은 다음 요청에서 이어서 한다
 *  - DB 테이블이 아직 없으면(마이그레이션 전) 메모리 기억만으로 동작한다
 */
const BUDGET_MS = 45_000;
const MAX_TRACKS = 40;
const mb = createMbClient('peterbae-music/1.0 ( https://peterbae.duckdns.org/music/ )');
const memory = new Map<string, number | null>();

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

  const admin = createAdminClient();
  const keys = tracks.map(dbKey);
  const known = new Map<string, number | null>();
  // 큰따옴표가 든 키는 PostgREST in() 목록을 깨뜨릴 수 있어 조회에서 빼고(그 곡은 MusicBrainz에서 다시 찾음)
  const { data: rows } = await admin.from('music_track_years').select('key, year').in('key', keys.filter((k: string) => !k.includes('"')));
  for (const r of rows ?? []) known.set(r.key, r.year);

  const started = Date.now();
  const years: Record<string, number | null> = {};
  const fresh: { key: string; artist: string; title: string; year: number | null }[] = [];
  let checked = 0;
  for (const t of tracks) {
    const k = dbKey(t);
    const clientKey = `${t.artist}\u0000${t.name}`.toLowerCase();
    const hit = known.has(k) ? known.get(k)! : memory.has(k) ? memory.get(k)! : undefined;
    if (hit !== undefined) { years[clientKey] = hit; checked++; continue; }
    if (Date.now() - started > BUDGET_MS) break; // 남은 곡은 다음 요청에서
    const y = await mb.findYear(t);
    memory.set(k, y);
    fresh.push({ key: k, artist: t.artist, title: t.name, year: y });
    years[clientKey] = y;
    checked++;
  }
  if (fresh.length) await admin.from('music_track_years').upsert(fresh, { onConflict: 'key' }); // 테이블이 없으면 실패해도 무시
  return NextResponse.json({ years, checked });
}
