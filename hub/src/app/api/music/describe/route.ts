import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { getTokenKeyValue } from '@/lib/tokenStore';
import { musicChat } from '@/lib/musicLlm';

/**
 * music '곡으로 조합 만들기'의 [웹에서 원곡 정보 찾기]. 두 가지 쓰임:
 *  - { resolve: url }        유튜브 등 링크의 영상 제목만 가져온다(oEmbed — 영상·음원은 받지 않음, 약관상 금지)
 *  - { title, artist? }      Last.fm 태그 + Tavily 웹 검색 결과를 LLM(musicChat)이 정리해 원곡의 주제·리듬·분위기를
 *                            Style Builder 선택지 값으로 돌려준다. 근거가 없으면 지어내지 말고 found=false.
 * 키: Key 관리의 TAVILY_API_KEY(무료 월 1,000회), LASTFM_API_KEY. 둘 중 하나만 있어도 동작한다.
 * 경로가 /api/music/... 이라 nginx auth_request가 music 앱 권한으로 판별한다.
 */
const TIMEOUT = 12_000; // 단계마다. 전체가 nginx proxy_read_timeout 60초 안에 끝나게

// suno.js 3번(리듬)·6번(분위기·에너지) 선택지의 en 값과 같아야 한다
const RHYTHMS = ['straight beat', 'swing feel', 'shuffle groove', 'half-time', 'four-on-the-floor', 'syncopated groove', 'laid-back groove', 'driving beat'];
const MOODS = ['emotional', 'melancholic', 'uplifting', 'dreamy', 'romantic', 'nostalgic', 'retro', 'dark', 'chill', 'epic', 'playful', 'yearning', 'warm', 'lonely', 'elegant',
  'wistful', 'lyrical', 'tender', 'poignant', 'bittersweet', 'solitary', 'understated', 'reflective', 'calm', 'gentle', 'mysterious', 'ethereal', 'refreshing', 'bright', 'lively', 'upbeat', 'funky', 'free-spirited', 'sophisticated', 'sensual', 'intense', 'dramatic', 'tense'];
const ENERGIES = ['low energy', 'medium energy', 'high energy', 'building energy'];

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

const SYSTEM_PROMPT = `You describe the theme, rhythm and mood of ONE specific released song, using ONLY the evidence given
(Last.fm listener tags and web search snippets). Never use outside knowledge and never guess.

First decide if the evidence is really about this exact song (same title and, if given, same artist).
If it is not, or it says nothing useful about its theme, rhythm/groove or mood, set "found": false and leave the lists empty.

Map what the evidence says to these exact values (use only values supported by the evidence; empty list if none):
- rhythm (max 2): ${RHYTHMS.join(', ')}
- mood (max 3): ${MOODS.join(', ')}
- energy (one or ""): ${ENERGIES.join(', ')}

Return ONLY compact JSON:
{"found":bool,"song":"title as found","artist":"artist as found","rhythm":[...],"mood":[...],"energy":"",
 "rhythmKo":"1-2 natural Korean sentences describing the song's groove, beat and tempo feel",
 "moodKo":"1-2 natural Korean sentences describing the song's mood and emotion",
 "themeKo":"1-2 natural Korean sentences on what the song is about (its story, message, speaker's attitude)",
 "themeEn":"one concise English sentence of the same theme","rhythmEn":"one concise English sentence of the groove and beat",
 "moodEn":"one concise English sentence of the mood","sources":[indexes of the web results you relied on]}
Use "" for any field the evidence does not support. The Korean fields are a brief for writing new lyrics and the English
fields go into a music-generation style prompt, so describe the song itself directly
(e.g. "느긋한 셔플 그루브 위로 베이스가 통통 튄다", "Laid-back shuffle groove with a bouncy bassline").
Never quote lyrics. Never mention the song title, the artist, sources, reviews, websites, critics, tags,
Last.fm, the artist's career or chart history — only the story, sound and feeling of this song.`;

type WebResult = { title: string; url: string; content: string };

async function lastfmTags(apiKey: string, title: string, artist: string) {
  const base = 'https://ws.audioscrobbler.com/2.0/?format=json';
  const get = async (q: string) => {
    const r = await fetch(`${base}&api_key=${encodeURIComponent(apiKey)}&${q}`, { signal: AbortSignal.timeout(TIMEOUT) });
    return r.ok ? r.json() : null;
  };
  let a = artist, t = title;
  if (!a) {
    // 가수를 모르면 제목으로 가장 많이 들은 곡을 찾는다
    const s = await get(`method=track.search&limit=1&track=${encodeURIComponent(title)}`);
    const hit = s?.results?.trackmatches?.track?.[0];
    if (!hit) return { tags: [] as string[], artist: '', title };
    a = hit.artist; t = hit.name;
  }
  const d = await get(`method=track.getTopTags&autocorrect=1&artist=${encodeURIComponent(a)}&track=${encodeURIComponent(t)}`);
  const tags: string[] = (d?.toptags?.tag ?? [])
    .filter((x: { count?: number }) => (x.count ?? 0) >= 5) // 한두 명만 붙인 태그는 뺀다
    .slice(0, 12).map((x: { name: string }) => x.name.toLowerCase());
  return { tags, artist: a, title: t };
}

async function tavily(apiKey: string, title: string, artist: string): Promise<WebResult[]> {
  const r = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `"${title}"${artist ? ` ${artist}` : ''} song meaning theme review groove rhythm mood`,
      search_depth: 'basic', max_results: 6, include_answer: false,
    }),
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!r.ok) throw new Error(`Tavily ${r.status}`);
  const d = await r.json();
  return (d?.results ?? []).map((x: { title?: string; url?: string; content?: string }) => ({
    title: String(x.title ?? '').slice(0, 160), url: String(x.url ?? ''), content: String(x.content ?? '').slice(0, 900),
  })).filter((x: WebResult) => /^https?:\/\//.test(x.url));
}

// YouTube·Vimeo 등은 oEmbed로 제목만 받는다(키 불필요)
async function resolveTitle(url: string) {
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  const oembed = /(^|\.)(youtube\.com|youtu\.be)$/i.test(u.hostname) ? `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(u.href)}`
    : /(^|\.)soundcloud\.com$/i.test(u.hostname) ? `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(u.href)}`
    : /(^|\.)vimeo\.com$/i.test(u.hostname) ? `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(u.href)}`
    : null;
  if (!oembed) return null;
  const r = await fetch(oembed, { signal: AbortSignal.timeout(TIMEOUT) });
  if (!r.ok) return null;
  const d = await r.json();
  return { title: String(d?.title ?? ''), author: String(d?.author_name ?? '') };
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const body = await request.json().catch(() => null);

  const resolve = str(body?.resolve, 500);
  if (resolve) {
    const t = await resolveTitle(resolve).catch(() => null);
    if (!t?.title) return NextResponse.json({ error: '이 링크에서 제목을 가져오지 못했습니다.' }, { status: 404 });
    return NextResponse.json(t);
  }

  const title = str(body?.title, 120);
  const artist = str(body?.artist, 80);
  if (!title) return NextResponse.json({ error: '곡 제목을 입력해 주세요.' }, { status: 400 });

  const [tavilyKey, lastfmKey] = await Promise.all([getTokenKeyValue('TAVILY_API_KEY'), getTokenKeyValue('LASTFM_API_KEY')]);
  if (!tavilyKey && !lastfmKey) {
    return NextResponse.json({ error: 'Key 관리에 TAVILY_API_KEY 또는 LASTFM_API_KEY가 등록되어 있지 않습니다.' }, { status: 500 });
  }

  const [lf, web] = await Promise.all([
    lastfmKey ? lastfmTags(lastfmKey, title, artist).catch(() => null) : null,
    tavilyKey ? tavily(tavilyKey, title, artist).catch(() => [] as WebResult[]) : [] as WebResult[],
  ]);
  const tags = lf?.tags ?? [];
  if (!tags.length && !web.length) {
    return NextResponse.json({ found: false, song: title, artist, rhythm: [], mood: [], energy: '', rhythmKo: '', moodKo: '', themeKo: '', themeEn: '', rhythmEn: '', moodEn: '', tags, sources: [] });
  }

  const evidence = [
    `Song: "${title}"${artist ? ` by ${artist}` : ''}${lf?.artist && lf.artist !== artist ? ` (Last.fm match: "${lf.title}" by ${lf.artist})` : ''}`,
    `Last.fm tags: ${tags.length ? tags.join(', ') : '(none)'}`,
    'Web results:',
    ...web.map((w, i) => `[${i}] ${w.title} — ${w.url}\n${w.content}`),
  ].join('\n');

  const llm = await musicChat([
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: evidence },
  ], { maxTokens: 1300, temperature: 0.2, timeoutMs: 25_000, connectMs: 15_000 });
  if (!llm.ok) return NextResponse.json({ error: `정리할 AI 서버에 연결하지 못했습니다(${llm.error}).` }, { status: 502 });

  const data = await llm.res.json().catch(() => null);
  const text: string = data?.choices?.[0]?.message?.content ?? '';
  let j: Record<string, unknown> = {};
  try { j = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)); } catch { /* found=false로 처리 */ }

  const pick = (v: unknown, allowed: string[], max: number) => (Array.isArray(v) ? v.filter((x) => allowed.includes(x)).slice(0, max) : []);
  const idx = Array.isArray(j.sources) ? j.sources.filter((n) => Number.isInteger(n) && n >= 0 && n < web.length) as number[] : [];
  const rhythm = pick(j.rhythm, RHYTHMS, 2);
  const mood = pick(j.mood, MOODS, 3);
  const energy = ENERGIES.includes(j.energy as string) ? j.energy as string : '';
  const found = j.found === true && (rhythm.length + mood.length > 0 || !!energy || !!str(j.themeKo, 1));

  return NextResponse.json({
    found,
    song: str(j.song, 120) || title,
    artist: str(j.artist, 80) || lf?.artist || artist,
    rhythm: found ? rhythm : [], mood: found ? mood : [], energy: found ? energy : '',
    rhythmKo: found ? str(j.rhythmKo, 400) : '', moodKo: found ? str(j.moodKo, 400) : '',
    themeKo: found ? str(j.themeKo, 400) : '',
    themeEn: found ? str(j.themeEn, 240) : '', rhythmEn: found ? str(j.rhythmEn, 240) : '', moodEn: found ? str(j.moodEn, 240) : '',
    tags,
    sources: found ? [...new Set(idx)].map((i) => ({ title: web[i].title, url: web[i].url })) : [],
    provider: llm.provider,
  });
}
