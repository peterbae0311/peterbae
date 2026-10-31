/* 제목·가사: Suno Style Builder의 스타일에 맞춰 영어 제목·가사(줄별 한글 뜻 포함)를 만든다.
 * 곡 길이·BPM으로 섹션과 마디 수를 정하고(planSong), 겹치지 않는 섹션만 hub /api/music/lyrics(Morfac)에 요청한다.
 * 후렴·프리코러스처럼 반복되는 섹션은 한 번만 쓰고 배치할 때 되풀이한다 — 그래서 후렴을 고치면 모든 후렴이 같이 바뀐다.
 * 생성한 버전은 이 브라우저에 저장하고 ◀ ▶로 비교한다. 확정하면 Suno 작곡(보관함) 추가 창을 채워 연다. */

const LY_KEY = 'music.lyrics.v1';
const LY_MAX_VERSIONS = 10;
const ly = {
  style: $('#ly-style'), stylePull: $('#ly-style-pull'), styleSrc: $('#ly-style-src'),
  len: $('#ly-len'), bpm: $('#ly-bpm'), plan: $('#ly-plan'), theme: $('#ly-theme'),
  gen: $('#ly-gen'), status: $('#ly-status'), verBox: $('#ly-ver-box'), ver: $('#ly-ver'),
  result: $('#ly-result'), titleChips: $('#ly-title-chips'), title: $('#ly-title'),
  structure: $('#ly-structure'), body: $('#ly-body'), length: $('#ly-length'),
};

// 저장 상태: 입력값 + 버전 목록 + 보고 있는 버전
let lyState = { style: '', len: 175, bpm: 0, theme: '', versions: [], cur: -1 };
try { Object.assign(lyState, JSON.parse(localStorage.getItem(LY_KEY) || '{}')); } catch {}
const saveLy = () => { try { localStorage.setItem(LY_KEY, JSON.stringify(lyState)); } catch {} };
const curVer = () => lyState.versions[lyState.cur] ?? null;

/* ---------------- 곡 길이 → 섹션 구성 ----------------
 * 기본 88마디 팝 구성(2마디에 가사 한 줄)에서 목표 마디 수에 가까워질 때까지 줄이거나 늘린다.
 * key: 가사를 공유하는 섹션 이름(null이면 악기만) */
const BASE_PLAN = () => [
  { name: 'Intro', bars: 4, key: null }, { name: 'Verse 1', bars: 8, key: 'Verse 1' }, { name: 'Pre-Chorus', bars: 4, key: 'Pre-Chorus' },
  { name: 'Chorus', bars: 16, key: 'Chorus' }, { name: 'Verse 2', bars: 8, key: 'Verse 2' }, { name: 'Pre-Chorus', bars: 4, key: 'Pre-Chorus' },
  { name: 'Chorus', bars: 16, key: 'Chorus' }, { name: 'Bridge', bars: 8, key: 'Bridge' }, { name: 'Final Chorus', bars: 16, key: 'Chorus' },
  { name: 'Outro', bars: 4, key: 'Outro' },
];
const idxOf = (p, name, nth = 0) => p.map((s, i) => (s.name === name ? i : -1)).filter((i) => i >= 0)[nth] ?? -1;
// 줄이기·늘리기 단계(앞에서부터 적용). 적용할 수 없으면 건너뛴다
const SHRINK = [
  (p) => { const i = idxOf(p, 'Outro'); if (i >= 0) p.splice(i, 1); },
  (p) => { const i = idxOf(p, 'Chorus'); if (i >= 0 && p[i].bars > 8) p[i].bars = 8; },
  (p) => { const i = idxOf(p, 'Bridge'); if (i >= 0 && p[i].bars > 4) p[i].bars = 4; },
  (p) => { const i = idxOf(p, 'Pre-Chorus', 1); if (i >= 0) p.splice(i, 1); },
  (p) => { const i = idxOf(p, 'Final Chorus'); if (i >= 0 && p[i].bars > 8) p[i].bars = 8; },
];
const GROW = [
  (p) => { const i = idxOf(p, 'Verse 2'); if (i >= 0 && p[i].bars < 16) p[i].bars = 16; },
  (p) => { const i = idxOf(p, 'Chorus'); if (i >= 0 && !p.some((s) => s.name === 'Instrumental')) p.splice(i + 1, 0, { name: 'Instrumental', bars: 8, key: null }); },
  (p) => { const i = idxOf(p, 'Outro'); if (i >= 0 && p[i].bars < 8) p[i].bars = 8; },
  (p) => { const i = idxOf(p, 'Intro'); if (i >= 0 && p[i].bars < 8) p[i].bars = 8; },
  (p) => { const i = idxOf(p, 'Bridge'); if (i >= 0 && p[i].bars < 16) p[i].bars = 16; },
];
const totalBars = (p) => p.reduce((s, x) => s + x.bars, 0);

function planSong(sec, bpm) {
  const target = Math.round(sec / (240 / bpm));
  const plan = BASE_PLAN();
  for (const step of totalBars(plan) > target ? SHRINK : GROW) {
    const before = Math.abs(totalBars(plan) - target);
    if (before <= 2) break;
    const trial = plan.map((s) => ({ ...s }));
    step(trial);
    if (Math.abs(totalBars(trial) - target) < before) plan.splice(0, plan.length, ...trial);
  }
  return plan;
}
// 가사를 공유하는 섹션별 줄 수(가장 긴 자리 기준, 2마디에 한 줄)
function uniqueSections(plan) {
  const map = new Map();
  plan.forEach((s) => { if (s.key) map.set(s.key, Math.max(map.get(s.key) ?? 0, s.bars / 2)); });
  return [...map].map(([name, lines]) => ({ name, lines }));
}
const fmtLen = (sec) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;

/* ---------------- 입력 ---------------- */
function fillLengths() {
  for (let s = 120; s <= 240; s += 5) ly.len.append(new Option(fmtLen(s), String(s), false, s === lyState.len));
}
// 스타일: Style Builder 출력(문장형이 가사 쓰기에 더 자연스러워 우선)
function pullStyle(quiet = false) {
  const text = (styleOut.prose || styleOut.list || '').trim();
  if (!text) return quiet || flash('Suno Style Builder에서 먼저 [생성]을 눌러 스타일을 만들어 주세요.', 'warn');
  ly.style.value = text;
  lyState.style = text;
  if (!lyState.bpm) ly.bpm.value = lyState.bpm = sb.bpm;
  ly.styleSrc.textContent = `Style Builder ${styleFmt === 'prose' ? '문장형' : '목록형'} · ${text.length}자`;
  saveLy();
  renderPlan();
}
function renderPlan() {
  const bpm = +ly.bpm.value || 120;
  const plan = planSong(+ly.len.value, bpm);
  const bars = totalBars(plan);
  ly.plan.textContent = `${bars}마디 · 예상 ${fmtLen(bars * 240 / bpm)} (Suno는 ±15초 정도 달라질 수 있어요)`;
}

/* ---------------- 생성 ---------------- */
// 한글·한자·가나: 영어 가사·제목에 섞이면 안 되는 글자(주제가 한글이면 모델이 가끔 그대로 쓴다)
const NON_EN = /[\u1100-\u11FF\u3040-\u30FF\u3130-\u318F\u3400-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF]/;
// 모델에 넘기는 전체 구성: "Intro 4 bars (instrumental) > Verse 1 8 bars > … > Final Chorus 16 bars (same lyrics as Chorus)"
const planText = (plan) => plan.map((s) => `${s.name} ${s.bars} bars${!s.key ? ' (instrumental)' : s.key !== s.name ? ` (same lyrics as ${s.key})` : ''}`).join(' > ');
// Style Builder에서 고른 끝맺음(영어 문장). '선택 안 함'이면 비워 둔다
const plannedEnding = () => (typeof OUTRO_EN !== 'undefined' && sb.outro ? OUTRO_EN[sb.outro] ?? '' : '');

async function generateLyrics() {
  const style = ly.style.value.trim();
  if (!style) return flash('스타일이 비어 있습니다. [Style Builder에서 가져오기]를 누르거나 직접 붙여 넣어 주세요.', 'warn');
  const bpm = Math.max(60, Math.min(180, Math.round(+ly.bpm.value) || 120));
  const plan = planSong(+ly.len.value, bpm);
  const sections = uniqueSections(plan);
  const theme = ly.theme.value.trim();
  const payload = {
    style, theme, sections,
    length: `about ${fmtLen(totalBars(plan) * 240 / bpm)} at ${bpm} BPM (2 bars per lyric line)`,
    plan: planText(plan),
    ending: plannedEnding(),
  };
  ly.gen.disabled = true;
  const t0 = performance.now();
  try {
    // 가사에 영어가 아닌 글자가 섞이면 한 번 더 만든다(제목은 걸러 내기만 한다)
    let v;
    for (let attempt = 1; attempt <= 2; attempt++) {
      v = parseLyrics(await requestLyrics(payload, t0, attempt), sections);
      if (!Object.values(v.lyrics).flat().some((l) => NON_EN.test(l.en))) break;
      if (attempt === 2) flash('영어가 아닌 글자가 섞인 줄이 있습니다. 해당 줄을 고치거나 다시 생성해 주세요.', 'warn');
    }
    Object.assign(v, { plan, bpm, style, theme, createdAt: Date.now() });
    lyState.versions.push(v);
    if (lyState.versions.length > LY_MAX_VERSIONS) lyState.versions.shift();
    lyState.cur = lyState.versions.length - 1;
    saveLy();
    renderResult();
    ly.status.textContent = `완료 · ${Math.round((performance.now() - t0) / 1000)}초`;
  } catch (e) {
    ly.status.textContent = '';
    flash(e.message === 'NO_SERVER'
      ? '가사 생성 서버를 찾지 못했습니다. 가사 생성은 허브가 있는 배포 사이트에서만 됩니다.'
      : `가사를 만들지 못했습니다: ${e.message}`, 'error');
  } finally {
    ly.gen.disabled = false;
  }
}

// 허브 호출 1회: 스트리밍으로 받은 모델 출력 전체(텍스트)를 돌려준다
async function requestLyrics(payload, t0, attempt) {
  const label = attempt > 1 ? '영어가 아닌 줄이 있어 다시 쓰는 중…' : '가사를 쓰는 중…';
  ly.status.textContent = label;
  const r = await fetch('/api/music/lyrics', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const d = await r.json().catch(() => null);
    throw new Error(d?.error || ([404, 405, 501].includes(r.status) ? 'NO_SERVER' : `HTTP ${r.status}`));
  }
  // 로그인이 풀리면 nginx가 로그인 페이지(HTML)로 보낸다
  if (!/text\/plain/.test(r.headers.get('content-type') || '')) throw new Error('로그인이 풀렸을 수 있습니다. 새로고침해서 다시 로그인해 주세요.');
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += dec.decode(value, { stream: true });
    ly.status.textContent = `${label} ${text.length}자 · ${Math.round((performance.now() - t0) / 1000)}초`;
  }
  if (text.includes('[[STREAM_ERROR]]')) throw new Error('생성 도중 연결이 끊겼습니다. 다시 시도해 주세요.');
  return text;
}

// 모델 출력(JSON) → { titles, title, lyrics: { 섹션: [{ en, ko, koSrc }] } }. 요청한 섹션이 빠지면 실패로 본다.
// 같은 섹션을 두 번 쓰는 경우가 있어 처음 나온 것을 쓰고, 영어가 아닌 제목은 버린다
function parseLyrics(text, sections) {
  const a = text.indexOf('{');
  const b = text.lastIndexOf('}');
  let j;
  try { j = JSON.parse(text.slice(a, b + 1)); } catch { throw new Error('응답 형식이 올바르지 않습니다. [가사 생성]을 다시 눌러 주세요.'); }
  const norm = (n) => String(n).toLowerCase().replace(/[^a-z0-9]/g, '');
  const got = new Map();
  for (const s of j.sections ?? []) if (!got.has(norm(s.name))) got.set(norm(s.name), s.lines ?? []);
  const lyrics = {};
  for (const { name, lines } of sections) {
    const arr = got.get(norm(name));
    if (!arr?.length) throw new Error(`'${name}' 섹션이 빠졌습니다. 다시 생성해 주세요.`);
    lyrics[name] = arr.slice(0, lines).map((l) => ({ en: String(l.en ?? '').trim(), ko: String(l.ko ?? '').trim(), koSrc: String(l.ko ?? '').trim() }));
  }
  const titles = (j.titles ?? []).map((t) => String(t).trim()).filter((t) => t && !NON_EN.test(t)).slice(0, 5);
  return { titles, title: titles[0] ?? '', lyrics };
}

/* ---------------- 결과 화면 ---------------- */
function renderResult() {
  const v = curVer();
  ly.result.hidden = !v;
  ly.verBox.hidden = lyState.versions.length < 2;
  if (!v) return;
  ly.ver.textContent = `${lyState.cur + 1}/${lyState.versions.length}`;
  $('#ly-prev').disabled = lyState.cur <= 0;
  $('#ly-next').disabled = lyState.cur >= lyState.versions.length - 1;

  ly.titleChips.replaceChildren(...v.titles.map((t) => {
    const c = Object.assign(document.createElement('button'), { className: 'sb-chip', type: 'button' });
    c.append(Object.assign(document.createElement('span'), { className: 'lbl', textContent: t }));
    c.setAttribute('aria-pressed', String(v.title === t));
    c.onclick = () => { v.title = t; ly.title.value = t; saveLy(); renderResult(); };
    return c;
  }));
  ly.title.value = v.title;

  ly.structure.textContent = `구성: ${v.plan.map((s) => `${s.name} ${s.bars}`).join(' · ')} (마디)`;
  const repeats = (key) => v.plan.filter((s) => s.key === key).length;
  ly.body.replaceChildren(...Object.entries(v.lyrics).map(([name, lines]) => {
    const sec = document.createElement('section');
    sec.className = 'ly-sec';
    const n = repeats(name);
    sec.append(Object.assign(document.createElement('h4'), { textContent: `[${name}]${n > 1 ? ` · ${n}번 나옴 — 고치면 모두 바뀜` : ''}` }));
    lines.forEach((line, i) => sec.append(lineRow(v, name, lines, line, i)));
    return sec;
  }));
  const bars = totalBars(v.plan);
  ly.length.textContent = `${bars}마디 · ${v.bpm} BPM · 예상 ${fmtLen(bars * 240 / v.bpm)}`;
}

function lineRow(v, name, lines, line, i) {
  const row = document.createElement('div');
  row.className = 'ly-line';
  const en = Object.assign(document.createElement('input'), { value: line.en, className: 'ly-en', spellcheck: false });
  en.setAttribute('aria-label', `${name} ${i + 1}번째 줄 영어`);
  const ko = Object.assign(document.createElement('input'), { value: line.ko, className: 'ly-ko' });
  ko.setAttribute('aria-label', `${name} ${i + 1}번째 줄 한글 뜻`);
  const re = Object.assign(document.createElement('button'), { type: 'button', className: 'ghost ly-re', textContent: '↻', title: '고친 한글 뜻으로 이 줄을 다시 영어로' });
  const mark = () => { const dirty = line.ko !== line.koSrc; row.classList.toggle('dirty', dirty); re.disabled = !dirty; };
  en.oninput = () => { line.en = en.value; saveLy(); };
  ko.oninput = () => { line.ko = ko.value; saveLy(); mark(); };
  re.onclick = async () => {
    re.disabled = true;
    re.textContent = '…';
    try {
      const r = await fetch('/api/music/translate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'lyric', text: line.ko, original: line.en, prev: lines[i - 1]?.en ?? '', next: lines[i + 1]?.en ?? '' }),
      });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d?.lines?.[0]) throw new Error(d?.error || ([404, 405, 501].includes(r.status) ? 'NO_SERVER' : `HTTP ${r.status}`));
      Object.assign(line, { en: d.lines[0], koSrc: line.ko });
      en.value = line.en;
      saveLy();
    } catch (e) {
      flash(e.message === 'NO_SERVER' ? '번역 서버를 찾지 못했습니다. 번역은 배포 사이트에서만 됩니다(로컬에서는 영어 칸을 직접 고쳐 주세요).' : `번역하지 못했습니다: ${e.message}`, 'error');
    } finally {
      re.textContent = '↻';
      mark();
    }
  };
  mark();
  row.append(en, ko, re);
  return row;
}

/* ---------------- 내보내기 ---------------- */
// Suno 가사 칸에 넣을 형식: [섹션 – N Bars] + 줄들. 반복 섹션은 같은 가사(짧은 자리는 앞쪽 줄만)
function lyricsText(v, lang) {
  const out = [];
  v.plan.forEach((s) => {
    out.push(`[${s.name} – ${s.bars} Bars]`);
    if (!s.key) out.push('[Instrumental]');
    else (v.lyrics[s.key] ?? []).slice(0, s.bars / 2).forEach((l) => out.push(lang === 'ko' ? l.ko : l.en));
    out.push('');
  });
  out.push('[End]');
  return out.join('\n');
}

async function copyLyrics(lang) {
  const v = curVer();
  if (v && await copyText(lyricsText(v, lang))) flash(lang === 'ko' ? '한글 뜻을 복사했습니다.' : 'Suno용 가사를 복사했습니다.', 'ok');
}

function saveToSongs() {
  const v = curVer();
  if (!v) return;
  const title = ly.title.value.trim();
  if (!title) return flash('제목을 정해 주세요.', 'warn');
  const bars = totalBars(v.plan);
  const sec = Math.round(bars * 240 / v.bpm);
  openSong(null, {
    titleEn: title, titleKo: title, lyricsEn: lyricsText(v, 'en'), lyricsKo: lyricsText(v, 'ko'),
    style: v.style, bpm: String(v.bpm), duration: `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`,
  });
  flash('보관함 추가 창을 열었습니다. 제목(KO)·활용 유형을 확인하고 저장하세요.', 'ok');
}

/* ---------------- 연결 ---------------- */
fillLengths();
ly.style.value = lyState.style;
ly.bpm.value = lyState.bpm || sb.bpm;
ly.theme.value = lyState.theme;
ly.style.oninput = () => { lyState.style = ly.style.value; ly.styleSrc.textContent = '직접 수정함'; saveLy(); };
ly.len.onchange = () => { lyState.len = +ly.len.value; saveLy(); renderPlan(); };
ly.bpm.onchange = () => { lyState.bpm = Math.max(60, Math.min(180, Math.round(+ly.bpm.value) || 120)); ly.bpm.value = lyState.bpm; saveLy(); renderPlan(); };
ly.theme.oninput = () => { lyState.theme = ly.theme.value; saveLy(); };
ly.stylePull.onclick = () => pullStyle();
ly.gen.onclick = generateLyrics;
$('#ly-prev').onclick = () => { lyState.cur--; saveLy(); renderResult(); };
$('#ly-next').onclick = () => { lyState.cur++; saveLy(); renderResult(); };
ly.title.oninput = () => { const v = curVer(); if (v) { v.title = ly.title.value; saveLy(); } };
$('#ly-copy-en').onclick = () => copyLyrics('en');
$('#ly-copy-ko').onclick = () => copyLyrics('ko');
$('#ly-save').onclick = saveToSongs;
// 탭을 처음 열 때 스타일이 비어 있으면 Style Builder 결과를 가져온다
$('#tab-lyrics').addEventListener('click', () => { if (!ly.style.value.trim()) pullStyle(true); });
if (!ly.style.value.trim()) pullStyle(true);
renderPlan();
renderResult();
