/* 제목·가사: Suno Style Builder의 스타일에 맞춰 영어 제목·가사(줄별 한글 뜻 포함)를 만든다.
 * 곡 길이·BPM으로 섹션과 마디 수를 정하고(planSong), 겹치지 않는 섹션만 hub /api/music/lyrics(Morfac)에 요청한다.
 * 후렴·프리코러스처럼 반복되는 섹션은 한 번만 쓰고 배치할 때 되풀이한다 — 그래서 후렴을 고치면 모든 후렴이 같이 바뀐다.
 * 생성한 버전은 이 브라우저에 저장하고 ◀ ▶로 비교한다. 확정하면 Suno 작곡(보관함) 추가 창을 채워 연다.
 * [직접 입력] 모드: 이미 써 둔 제목·영어 가사·한글 가사를 그대로 붙여 넣는다. 아래 세 버튼(복사·저장)은 두 모드가 함께 쓴다. */

const LY_KEY = 'music.lyrics.v1';
const LY_MAX_VERSIONS = 10;
const ly = {
  style: $('#ly-style'), stylePull: $('#ly-style-pull'), styleSrc: $('#ly-style-src'),
  len: $('#ly-len'), bpm: $('#ly-bpm'), plan: $('#ly-plan'), theme: $('#ly-theme'),
  gen: $('#ly-gen'), status: $('#ly-status'), verBox: $('#ly-ver-box'), ver: $('#ly-ver'),
  result: $('#ly-result'), titleChips: $('#ly-title-chips'), title: $('#ly-title'),
  structure: $('#ly-structure'), aiEn: $('#ly-ai-en'), aiKo: $('#ly-ai-ko'), length: $('#ly-length'),
  panel: $('#panel-lyrics'), mode: $('#ly-mode'), manual: $('#ly-manual'), foot: $('#ly-foot'),
  mTitle: $('#ly-m-title'), mEn: $('#ly-m-en'), mKo: $('#ly-m-ko'),
};

// 저장 상태: 입력값 + 버전 목록 + 보고 있는 버전 + 모드(ai | manual)와 직접 입력한 내용
let lyState = { style: '', len: 175, bpm: 0, theme: '', versions: [], cur: -1, mode: 'ai', manual: { title: '', en: '', ko: '' } };
try { Object.assign(lyState, JSON.parse(localStorage.getItem(LY_KEY) || '{}')); } catch {}
lyState.manual = { title: '', en: '', ko: '', ...lyState.manual };
const isManual = () => lyState.mode === 'manual';
const saveLy = () => { try { localStorage.setItem(LY_KEY, JSON.stringify(lyState)); } catch {} };
const curVer = () => lyState.versions[lyState.cur] ?? null;

/* ---------------- 금지 표현 ----------------
 * 트렌디하지 않은 단어·올드 팝 클리셰·가사에 들어가면 안 되는 악기 이름. 생성 요청에 함께 보내 AI가 피하게 하고,
 * 만든(또는 직접 입력한) 영어 가사에 들어가 있으면 결과 아래에 줄과 함께 표시한다. 목록은 화면에서 더하고 뺀다 */
const BANNED_KEY = 'music.lyrics.banned';
const BANNED_DEFAULT = [
  'dearest', 'forever and ever', 'my lonely heart', 'destiny', 'shine like a star', 'bright and true', 'turn the page',
  'haters', 'perfectly imperfect', 'dancing in the rain', 'heart of gold', 'touch the sky', 'set my soul on fire',
  'till the end of time', 'dance the night away', 'evermore', 'thee', 'thou', 'yonder', 'sorrow', 'heavenly',
  'bass drop', 'synth', 'playlist', 'remix',
];
let banned = BANNED_DEFAULT.slice();
try { const v = JSON.parse(localStorage.getItem(BANNED_KEY) || 'null'); if (Array.isArray(v)) banned = v.filter((x) => typeof x === 'string' && x.trim()); } catch {}
const saveBanned = () => { try { localStorage.setItem(BANNED_KEY, JSON.stringify(banned)); } catch {} };
const escRe = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// 단어 경계로 찾는다(예: 'thou'가 'thought'에 걸리지 않게). 대소문자·곧은/굽은 따옴표는 구분하지 않는다
const bannedRe = () => (banned.length
  ? new RegExp(`(?<![\\w'’])(${banned.map((b) => escRe(b.toLowerCase()).replace(/'/g, "['’]")).join('|')})(?![\\w'’])`, 'gi')
  : null);

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
  // 느린 곡(예: 70 BPM은 1마디 3.4초)은 위 단계로는 60마디에서 멈춰 목표보다 30초쯤 길어진다 → 더 줄이는 단계
  (p) => { const i = idxOf(p, 'Chorus', 1); if (i >= 0 && p[i].bars > 8) p[i].bars = 8; },
  (p) => { const i = idxOf(p, 'Verse 2'); if (i >= 0 && p[i].bars > 4) p[i].bars = 4; },
  (p) => { const i = idxOf(p, 'Intro'); if (i >= 0 && p[i].bars > 2) p[i].bars = 2; },
  (p) => { const i = idxOf(p, 'Bridge'); if (i >= 0) p.splice(i, 1); },
  (p) => { const i = idxOf(p, 'Verse 2'); if (i >= 0) p.splice(i, 1); },
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
// 곡 길이를 고르지 않으면(초기화 후) 기본 2:55로 계산한다
const LEN_DEFAULT = 175;
const lenSec = () => +ly.len.value || LEN_DEFAULT;
function fillLengths() {
  ly.len.append(new Option('선택 안 함', '', false, !lyState.len));
  for (let s = 120; s <= 240; s += 5) ly.len.append(new Option(fmtLen(s), String(s), false, s === lyState.len));
}
// 스타일 문장에 적힌 곡 길이(초). "about 2:55" → 175, "2:50–3:00" → 가운데 175, "3 minutes" → 180.
// 목록(2:00~4:00, 5초 단위)에 맞춰 반올림한다. 길이가 없으면 null
function lengthFromStyle(text) {
  const t = (m, s) => +m * 60 + +s;
  const range = text.match(/(\d):([0-5]\d)\s*(?:[-–~]|to)\s*(\d):([0-5]\d)/);
  const one = text.match(/(\d):([0-5]\d)/);
  const mins = text.match(/(\d(?:\.\d)?)[\s-]*(?:minutes?|mins?)\b/i);
  const sec = range ? (t(range[1], range[2]) + t(range[3], range[4])) / 2 : one ? t(one[1], one[2]) : mins ? +mins[1] * 60 : null;
  return sec ? Math.min(240, Math.max(120, Math.round(sec / 5) * 5)) : null;
}

// 스타일: Style Builder 출력(문장형이 가사 쓰기에 더 자연스러워 우선). BPM은 Style Builder 값을, 곡 길이는 스타일에
// 적힌 길이(예: "Short song about 2:55")를 함께 가져온다 — 길이가 안 적혀 있으면 지금 고른 길이를 그대로 둔다
function pullStyle(quiet = false) {
  const text = (styleOut.prose || styleOut.list || '').trim();
  if (!text) return quiet || flash('Suno Style Builder에서 먼저 [생성]을 눌러 스타일을 만들어 주세요.', 'warn');
  lyState.cleared = false;
  ly.style.value = text;
  lyState.style = text;
  ly.bpm.value = lyState.bpm = sb.bpm;
  const sec = lengthFromStyle(text);
  if (sec) { lyState.len = sec; ly.len.value = String(sec); }
  ly.styleSrc.textContent = `Style Builder ${styleFmt === 'prose' ? '문장형' : '목록형'} · ${text.length}자 · ${sb.bpm} BPM${sec ? ` · ${fmtLen(sec)}` : ''}`;
  saveLy();
  renderPlan();
  if (!quiet) flash(`스타일과 BPM ${sb.bpm}${sec ? `, 곡 길이 ${fmtLen(sec)}` : ''}을 가져왔습니다.${sec ? '' : ' 스타일에 곡 길이가 없어 곡 길이는 그대로 두었습니다.'}`, 'ok');
}
function renderPlan() {
  const bpm = +ly.bpm.value || 120;
  const sync = $('#ly-bpm-sync');
  sync.hidden = !sb.bpm || +sb.bpm === bpm;
  sync.textContent = `Style Builder BPM(${sb.bpm})과 달라요 · 맞추기`;
  const plan = planSong(lenSec(), bpm);
  const bars = totalBars(plan);
  ly.plan.textContent = `${bars}마디 · 예상 ${fmtLen(bars * 240 / bpm)} (${ly.len.value ? '' : `곡 길이 기본 ${fmtLen(LEN_DEFAULT)} 기준 · `}Suno는 ±15초 정도 달라질 수 있어요)`;
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
  const plan = planSong(lenSec(), bpm);
  const sections = uniqueSections(plan);
  const theme = ly.theme.value.trim();
  const payload = {
    style, theme, sections,
    length: `about ${fmtLen(totalBars(plan) * 240 / bpm)} at ${bpm} BPM (2 bars per lyric line)`,
    plan: planText(plan),
    ending: plannedEnding(),
    banned: banned.slice(0, 80),
  };
  ly.gen.disabled = true;
  const t0 = performance.now();
  try {
    // 가사에 영어가 아닌 글자가 섞이면 한 번 더 만든다(제목은 걸러 내기만 한다)
    let v;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const got = await requestLyrics(payload, t0, attempt);
      // 형식이 깨진 응답(무료 모델에서 가끔)도 한 번은 자동으로 다시 만든다
      try { v = parseLyrics(got.text, sections); } catch (e) { if (attempt === 2) throw e; continue; }
      v.provider = got.provider;
      if (!Object.values(v.lyrics).flat().some((l) => NON_EN.test(l.en))) break;
      if (attempt === 2) flash('영어가 아닌 글자가 섞인 줄이 있습니다. 해당 줄을 고치거나 다시 생성해 주세요.', 'warn');
    }
    Object.assign(v, { plan, bpm, style, theme, createdAt: Date.now() });
    lyState.versions.push(v);
    if (lyState.versions.length > LY_MAX_VERSIONS) lyState.versions.shift();
    lyState.cur = lyState.versions.length - 1;
    saveLy();
    renderLyrics();
    ly.status.textContent = `완료 · ${Math.round((performance.now() - t0) / 1000)}초${v.provider ? ` · ${v.provider}` : ''}`;
    if (v.provider && v.provider !== 'Morfac') flash(`Morfac을 쓸 수 없어 ${v.provider} 무료 모델로 가사를 만들었습니다.`, 'warn');
  } catch (e) {
    ly.status.textContent = '';
    flash(e.message === 'NO_SERVER'
      ? '가사 생성 서버를 찾지 못했습니다. 가사 생성은 허브가 있는 배포 사이트에서만 됩니다.'
      : `가사를 만들지 못했습니다: ${e.message}`, 'error');
  } finally {
    ly.gen.disabled = false;
  }
}

// 허브 호출 1회: 스트리밍으로 받은 모델 출력 전체(텍스트)와 실제로 쓴 공급자(Morfac·Groq·OpenRouter)를 돌려준다
async function requestLyrics(payload, t0, attempt) {
  const label = attempt > 1 ? '결과가 올바르지 않아 다시 쓰는 중…' : '가사를 쓰는 중…';
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
  return { text, provider: r.headers.get('X-Music-LLM') || '' };
}

// 모델 출력(JSON) → { titles, title, lyrics: { 섹션: [{ en, ko, koSrc }] } }. 요청한 섹션이 빠지면 실패로 본다.
// 같은 섹션을 두 번 쓰는 경우가 있어 처음 나온 것을 쓰고, 영어가 아닌 제목은 버린다
// 첫 번째로 완결된 JSON 객체만 잘라 낸다(문자열 안의 괄호·따옴표는 건너뜀). 모델이 JSON 뒤에 설명이나
// 두 번째 JSON을 덧붙여도 앞의 답만 쓴다
function firstJson(text) {
  const a = text.indexOf('{');
  if (a < 0) return '';
  let depth = 0, inStr = false, esc = false;
  for (let i = a; i < text.length; i++) {
    const c = text[i];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return text.slice(a, i + 1);
  }
  return text.slice(a);
}

function parseLyrics(text, sections) {
  let j;
  try { j = JSON.parse(firstJson(text)); } catch { throw new Error('응답 형식이 올바르지 않습니다. [가사 생성]을 다시 눌러 주세요.'); }
  const norm = (n) => String(n).toLowerCase().replace(/[^a-z0-9]/g, '');
  const got = new Map();
  for (const s of j.sections ?? []) if (!got.has(norm(s.name))) got.set(norm(s.name), s.lines ?? []);
  const lyrics = {};
  for (const { name, lines } of sections) {
    const arr = got.get(norm(name));
    if (!arr?.length) throw new Error(`'${name}' 섹션이 빠졌습니다. 다시 생성해 주세요.`);
    lyrics[name] = arr.slice(0, lines).map((l) => ({ en: String(l.en ?? '').trim(), ko: String(l.ko ?? '').trim(), koSrc: String(l.ko ?? '').trim() }));
  }
  // 제목은 템플릿에서 { words, title } 꼴로 온다(예전 응답은 문자열)
  const titles = (j.titles ?? []).map((t) => String(typeof t === 'object' && t ? t.title ?? '' : t).trim()).filter((t) => t && !NON_EN.test(t)).slice(0, 5);
  return { titles, title: titles[0] ?? '', lyrics };
}

/* ---------------- 결과 화면 ---------------- */
// 모드 전환: AI 생성 결과와 직접 입력 칸 중 하나만 보이고, 아래 버튼 줄은 함께 쓴다
function renderMode() {
  const manual = isManual();
  ly.panel.classList.toggle('manual', manual);
  ly.mode.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mode === lyState.mode)));
  ly.manual.hidden = !manual;
  renderLyrics();
  if (manual) renderManualFoot();
  checkBanned();
}
function renderManualFoot() {
  const count = (t) => t.split('\n').filter((l) => l.trim() && !/^\s*\[.*\]\s*$/.test(l)).length; // 태그 줄([Verse 1] 등)은 빼고 센다
  ly.foot.hidden = false;
  ly.length.textContent = `영어 ${count(lyState.manual.en)}줄 · 한글 ${count(lyState.manual.ko)}줄`;
}

function renderLyrics() {
  const v = curVer();
  ly.result.hidden = !v || isManual();
  ly.verBox.hidden = lyState.versions.length < 2;
  if (isManual()) return;
  ly.foot.hidden = !v;
  if (!v) return;
  ly.ver.textContent = `${lyState.cur + 1}/${lyState.versions.length}`;
  $('#ly-prev').disabled = lyState.cur <= 0;
  $('#ly-next').disabled = lyState.cur >= lyState.versions.length - 1;

  ly.titleChips.replaceChildren(...v.titles.map((t) => {
    const c = Object.assign(document.createElement('button'), { className: 'sb-chip', type: 'button' });
    c.append(Object.assign(document.createElement('span'), { className: 'lbl', textContent: t }));
    c.setAttribute('aria-pressed', String(v.title === t));
    c.onclick = () => { v.title = t; ly.title.value = t; saveLy(); renderLyrics(); };
    return c;
  }));
  ly.title.value = v.title;

  ly.structure.textContent = `구성: ${v.plan.map((s) => `${s.name} ${s.bars}`).join(' · ')} (마디)`;
  // 생성한 가사를 [섹션 – N Bars] 형식의 글로 펼쳐 '직접 입력'과 같은 두 칸에 보여 준다. 고치면 이 버전에 저장된다
  ly.aiEn.value = verText(v, 'en');
  ly.aiKo.value = verText(v, 'ko');
  const bars = totalBars(v.plan);
  ly.length.textContent = `${bars}마디 · ${v.bpm} BPM · 예상 ${fmtLen(bars * 240 / v.bpm)}`;
  checkBanned();
}

// 지금 보이는 영어 가사(AI 결과 또는 직접 입력)에서 금지 표현이 들어간 줄을 찾아 보여 준다
function checkBanned() {
  const box = $('#ly-banned-hits');
  const text = isManual() ? ly.mEn.value : (curVer() ? ly.aiEn.value : '');
  const re = bannedRe();
  const hits = [];
  if (re && text) {
    let sec = '';
    text.split('\n').forEach((line) => {
      const tag = line.match(/^\s*\[([^\]]+)\]\s*$/);
      if (tag) { sec = tag[1].replace(/\s*[–-]\s*\d+\s*Bars?$/i, ''); return; }
      re.lastIndex = 0;
      if (!re.test(line)) return;
      re.lastIndex = 0;
      const key = `${sec}|${line.trim()}`;
      if (!hits.some((h) => h.key === key)) hits.push({ key, sec, html: esc(line.trim()).replace(re, (m) => `<mark>${m}</mark>`) });
    });
  }
  box.hidden = !hits.length;
  box.innerHTML = hits.length
    ? `<b>금지 표현이 들어간 줄 ${hits.length}개</b> — 고치거나 다시 생성해 보세요.<ul>${hits.map((h) => `<li>${h.sec ? `[${esc(h.sec)}] ` : ''}${h.html}</li>`).join('')}</ul>`
    : '';
}

function renderBanned() {
  $('#ly-banned-n').textContent = `(${banned.length})`;
  $('#ly-banned-chips').replaceChildren(...banned.map((b, i) => {
    const c = Object.assign(document.createElement('span'), { className: 'sb-chip-wrap' });
    const t = Object.assign(document.createElement('span'), { className: 'sb-chip', textContent: b });
    t.setAttribute('aria-pressed', 'false');
    const del = Object.assign(document.createElement('button'), { type: 'button', className: 'sb-chip-del', textContent: '×', title: `'${b}' 빼기` });
    del.onclick = () => { banned.splice(i, 1); saveBanned(); renderBanned(); checkBanned(); };
    c.append(t, del);
    return c;
  }));
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

// 버전의 가사 글: 직접 고쳤으면 고친 글, 아니면 생성한 줄로 만든 글
const verText = (v, lang) => v.text?.[lang] ?? lyricsText(v, lang);

async function copyLyrics(lang) {
  let text;
  if (isManual()) {
    text = lyState.manual[lang].trim();
    if (!text) return flash(lang === 'ko' ? '한글 가사를 입력해 주세요.' : '영어 가사를 입력해 주세요.', 'warn');
  } else {
    const v = curVer();
    if (!v) return;
    text = verText(v, lang);
  }
  if (await copyText(text)) flash(lang === 'ko' ? '한글 뜻을 복사했습니다.' : 'Suno용 가사를 복사했습니다.', 'ok');
}

function saveToSongs() {
  if (isManual()) {
    const { title, en, ko } = lyState.manual;
    if (!title.trim()) return flash('제목을 입력해 주세요.', 'warn');
    if (!en.trim()) return flash('영어 가사를 입력해 주세요.', 'warn');
    // 직접 쓴 가사는 길이를 알 수 없어 재생시간은 비워 둔다(Suno에서 만든 뒤 채우면 됨)
    openSong(null, {
      titleEn: title.trim(), titleKo: title.trim(), lyricsEn: en.trim(), lyricsKo: ko.trim(),
      style: ly.style.value.trim(), bpm: ly.bpm.value ? String(ly.bpm.value) : '',
      genre: sbSongGenre(), vocalGender: sbVocalGender(), // Style Builder 4번 장르·10번 보컬
    });
    return flash('보관함 추가 창을 열었습니다. 제목(KO)·활용 유형을 확인하고 저장하세요.', 'ok');
  }
  const v = curVer();
  if (!v) return;
  const title = ly.title.value.trim();
  if (!title) return flash('제목을 정해 주세요.', 'warn');
  const bars = totalBars(v.plan);
  const sec = Math.round(bars * 240 / v.bpm);
  openSong(null, {
    titleEn: title, titleKo: title, lyricsEn: verText(v, 'en'), lyricsKo: verText(v, 'ko'),
    style: v.style, bpm: String(v.bpm), duration: `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`,
    genre: sbSongGenre(), vocalGender: sbVocalGender(), // Style Builder 4번 장르·10번 보컬
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
// Style Builder [곡 분석 불러오기]가 웹에서 찾은 원곡의 리듬·분위기 설명을 주제·메모에 넣을 때 쓴다
function setLyricsTheme(desc) {
  // 직접 적어 둔 메모는 지우지 않는다. 이전 곡에서 자동으로 넣은 '주제/리듬/분위기: …' 줄만 새 설명으로 바꾼다
  const mine = ly.theme.value.split('\n').filter((l) => !/^(주제|리듬|분위기): /.test(l)).join('\n').trim();
  ly.theme.value = (mine ? `${mine}\n${desc}` : desc).slice(0, 600);
  lyState.theme = ly.theme.value;
  saveLy();
}
// [Style Builder에서 가져오기]: 스타일·BPM·곡 길이와 함께 Theme의 영어 문장(':' 줄)을 주제·메모에 넣는다
ly.stylePull.onclick = () => {
  pullStyle();
  const en = conceptParts();
  if (!en.length || !(styleOut.prose || styleOut.list || '').trim()) return; // 스타일이 없으면 pullStyle의 안내를 그대로 보인다
  ly.theme.value = lyState.theme = en.map((p) => `${p}.`).join('\n').slice(0, 600);
  saveLy();
  flash('스타일·BPM과 함께 Theme의 영어 문장을 주제·메모에 넣었습니다.', 'ok');
};
$('#ly-bpm-sync').onclick = () => { ly.bpm.value = lyState.bpm = sb.bpm; saveLy(); renderPlan(); };
ly.gen.onclick = generateLyrics;
$('#ly-prev').onclick = () => { lyState.cur--; saveLy(); renderLyrics(); };
$('#ly-next').onclick = () => { lyState.cur++; saveLy(); renderLyrics(); };
ly.title.oninput = () => { const v = curVer(); if (v) { v.title = ly.title.value; saveLy(); } };
[['aiEn', 'en'], ['aiKo', 'ko']].forEach(([el, lang]) => {
  ly[el].oninput = () => {
    const v = curVer();
    if (!v) return;
    v.text = { en: verText(v, 'en'), ko: verText(v, 'ko'), [lang]: ly[el].value };
    saveLy();
    if (lang === 'en') checkBanned();
  };
});
$('#ly-copy-en').onclick = () => copyLyrics('en');
$('#ly-copy-ko').onclick = () => copyLyrics('ko');
$('#ly-save').onclick = saveToSongs;
ly.mode.onclick = (e) => {
  const b = e.target.closest('[data-mode]');
  if (!b || b.dataset.mode === lyState.mode) return;
  lyState.mode = b.dataset.mode;
  saveLy();
  renderMode();
};
ly.mTitle.value = lyState.manual.title;
ly.mEn.value = lyState.manual.en;
ly.mKo.value = lyState.manual.ko;
[['mTitle', 'title'], ['mEn', 'en'], ['mKo', 'ko']].forEach(([el, key]) => {
  ly[el].oninput = () => { lyState.manual[key] = ly[el].value; saveLy(); if (key !== 'title') renderManualFoot(); if (key === 'en') checkBanned(); };
});
// 금지 표현 추가(Enter)·기본 목록으로
$('#ly-banned-input').onkeydown = (e) => {
  if (e.key !== 'Enter' || e.isComposing) return;
  e.preventDefault();
  const t = e.target.value.trim().replace(/\s+/g, ' ').toLowerCase();
  if (!t) return;
  if (/[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(t)) return flash('금지 표현은 영어로 적어 주세요(가사는 영어로 만들어집니다).', 'warn');
  if (banned.includes(t)) return flash('이미 있는 표현입니다.', 'warn');
  banned.push(t);
  e.target.value = '';
  saveBanned();
  renderBanned();
  checkBanned();
};
$('#ly-banned-reset').onclick = () => {
  if (!confirm('금지 표현을 처음 목록으로 되돌릴까요? 직접 더한 표현은 사라집니다.')) return;
  banned = BANNED_DEFAULT.slice();
  saveBanned();
  renderBanned();
  checkBanned();
};
renderBanned();
// 탭을 처음 열 때 스타일이 비어 있으면 Style Builder 결과를 가져온다
// 스타일 칸이 비어 있으면 탭을 열 때 Style Builder 스타일을 자동으로 가져온다. [초기화]로 비운 뒤에는 버튼을 누를 때까지 가져오지 않는다
const autoPull = () => { if (!ly.style.value.trim() && !lyState.cleared) pullStyle(true); };
$('#tab-lyrics').addEventListener('click', () => { autoPull(); renderPlan(); });
autoPull();
// [초기화]: 스타일·곡 길이·BPM·주제·메모를 처음 상태로(만든 가사 버전·직접 입력 내용은 그대로)
// [초기화]: 스타일·곡 길이·BPM·주제·메모와 제목·영어 가사·한글 가사(AI로 만든 버전 모두 + 직접 입력)를 처음 상태로
$('#ly-reset').onclick = () => {
  const m = lyState.manual;
  const n = lyState.versions.length;
  const has = ly.style.value.trim() || ly.theme.value.trim() || n || m.title.trim() || m.en.trim() || m.ko.trim();
  if (has && !confirm(`스타일·곡 길이·BPM·주제·메모와 제목·영어 가사·한글 가사${n ? `(AI로 만든 ${n}개 버전 포함)` : ''}를 모두 지울까요?`)) return;
  Object.assign(lyState, { style: '', len: 0, bpm: 0, theme: '', cleared: true, versions: [], cur: -1, manual: { title: '', en: '', ko: '' } });
  ly.style.value = ly.theme.value = ly.bpm.value = ly.len.value = '';
  ly.mTitle.value = ly.mEn.value = ly.mKo.value = '';
  ly.styleSrc.textContent = '';
  saveLy();
  renderPlan();
  renderMode(); // 결과 칸·버전 표시·하단 버튼을 비운 상태로
  flash('스타일·곡 길이·BPM·주제·메모와 제목·영어 가사·한글 가사를 초기화했습니다.', 'ok');
};
// 스타일·제목·영어 가사·한글 가사 옆 복사 아이콘: 그 칸의 내용을 그대로 복사한다
document.querySelectorAll('[data-ly-copy]').forEach((b) => {
  b.onclick = async (e) => {
    e.preventDefault(); // 라벨 안에 있어 눌렀을 때 입력칸으로 초점이 옮겨 가지 않게
    const field = document.getElementById(b.dataset.lyCopy);
    const text = field.value.trim();
    const name = b.getAttribute('aria-label').replace(/ 복사$/, '');
    if (!text) return flash(`${name}이(가) 비어 있습니다.`, 'warn');
    if (await copyText(text)) flash(`${name}을(를) 복사했습니다.`, 'ok');
  };
});
renderPlan();
renderMode();
