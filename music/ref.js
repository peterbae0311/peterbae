/* 인기곡: 세부 장르별 인기곡 Top 20.
 *  - 전체 기간: hub /api/music/toptracks → Last.fm tag.getTopTracks(그 태그를 붙인 청취자가 많은 순). 명곡·오래된 곡이 많다
 *  - 최근 곡: 같은 태그 순위에서 후보를 최대 250곡 받아, hub /api/music/trackyears(MusicBrainz, 초당 1회)로 첫 발매 연도를
 *    30곡씩 확인하며 최근 N년 곡만 순위대로 골라 20곡이 모이면 멈춘다. 확인한 연도는 바뀌지 않아 이 브라우저에 계속 기억한다
 * 장르·세부 장르는 추천 조합과 같은 목록(GENRES + 곡 분석으로 자동 추가한 장르 ✦)을 쓴다.
 * 곡마다 유튜브·스포티파이 검색 링크와 [원곡 정보 찾기](곡으로 조합 만들기 ②로 제목·가수를 넘겨 웹 정보 검색)를 둔다. */

// 세부 장르 → Last.fm 태그. 앱의 영어 장르명이 Last.fm에서 잘 안 쓰이는 이름이면 실제로 많이 쓰는 태그로 바꾼다
const REF_TAGS = {
  '재즈 발라드': ['jazz ballad', 'vocal jazz'], '스윙 재즈': ['swing'], '보사노바 재즈': ['bossa nova'],
  '컨템포러리 재즈': ['smooth jazz', 'contemporary jazz'], '재즈 팝': ['jazz pop'],
  '팝 발라드': ['ballad'], '어쿠스틱 발라드': ['acoustic'], 'R&B 발라드': ['slow jams', 'rnb'],
  '록 발라드': ['power ballad', 'rock ballad'], '시네마틱 발라드': ['cinematic'],
  '어쿠스틱 팝': ['acoustic pop'], '신스 팝': ['synthpop'], '인디 팝': ['indie pop'], '드림 팝': ['dream pop'], '시티 팝': ['city pop'],
  '로파이 힙합': ['lo-fi', 'lofi hip hop'], '재즈 힙합': ['jazz hop', 'jazz rap'], '붐뱁 힙합': ['boom bap'],
  '멜로딕 힙합': ['melodic rap'], '칠 힙합': ['chillhop'],
  '트랩': ['trap'], '하우스·EDM': ['house', 'edm'], '펑크': ['funk'], '록': ['rock'],
};
// 20곡이 안 될 때 채울 넓은 장르 태그(전체 기간 보기만). 세부 장르별 → 없으면 장르 탭별
const REF_FALLBACK_SUB = { '트랩': 'hip-hop', '펑크': 'soul', 'R&B 발라드': 'rnb', '시네마틱 발라드': 'soundtrack' };
const REF_FALLBACK_TAB = { 재즈: 'jazz', 발라드: 'ballad', 팝: 'pop', 힙합: 'hip-hop', '일렉트로닉·밴드': 'electronic' };
const REF_CACHE_KEY = 'music.ref.cache.v2';
const REF_YEARS_KEY = 'music.ref.years.v1';
const REF_SEL_KEY = 'music.ref.sel';
const REF_TTL = 24 * 60 * 60 * 1000;
const REF_POOL = 250;     // 최근 곡 후보 수(태그 순위 상위)
const REF_BATCH = 30;     // 한 번에 연도를 확인할 곡 수(서버가 45초 안에 끝낼 만큼)
const REF_THIS_YEAR = new Date().getFullYear();

const ref = { tabs: $('#ref-tabs'), subs: $('#ref-subs'), out: $('#ref-out'), modeTabs: $('#ref-period-tabs'), years: $('#ref-years'), note: $('#ref-mode-note') };
let refSel = { tab: 0, sub: '', mode: 'recent', years: 3 };
try { Object.assign(refSel, JSON.parse(localStorage.getItem(REF_SEL_KEY) || '{}')); } catch {}
let refCache = {};
try { refCache = JSON.parse(localStorage.getItem(REF_CACHE_KEY) || '{}'); } catch {}
let refYears = {};
try { refYears = JSON.parse(localStorage.getItem(REF_YEARS_KEY) || '{}'); } catch {}
const saveRef = () => {
  try {
    localStorage.setItem(REF_SEL_KEY, JSON.stringify(refSel));
    localStorage.setItem(REF_CACHE_KEY, JSON.stringify(refCache));
    localStorage.setItem(REF_YEARS_KEY, JSON.stringify(refYears));
  } catch {}
};
const refKey = (t) => `${t.artist}\u0000${t.name}`.toLowerCase();
const refMinYear = () => REF_THIS_YEAR - refSel.years + 1;
let refRun = 0; // 진행 중인 '최근 곡' 확인을 멈추거나 다른 장르로 바꿀 때 이전 작업을 버리는 번호

// 고른 세부 장르의 태그·넓은 장르. 자동 추가 장르(✦)는 영어 장르명을 태그로 쓴다
function refTagsFor(name) {
  const cg = customGenre(name);
  const tab = cg?.cat ?? GENRES.find((g) => g.items.some((it) => it.name === name))?.name;
  const tags = REF_TAGS[name] ?? (cg ? [cg.en] : (GENRE_EN[name] ?? name).split(', '));
  return { tags, fallback: REF_FALLBACK_SUB[name] ?? REF_FALLBACK_TAB[tab] ?? 'pop' };
}

async function refApi(path, body) {
  const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => null);
  if (!r.ok || !d) throw new Error(d?.error || ([404, 405, 501].includes(r.status) ? 'NO_SERVER' : `HTTP ${r.status}`));
  return d;
}
const refError = (e) => `<p class="ref-empty">${e.message === 'NO_SERVER' ? '인기곡은 허브가 있는 배포 사이트에서만 볼 수 있습니다.' : `인기곡을 가져오지 못했습니다: ${esc(e.message)}`}</p>`;

function renderRefControls() {
  ref.modeTabs.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mode === refSel.mode)));
  ref.years.hidden = refSel.mode !== 'recent';
  ref.years.value = String(refSel.years);
  ref.note.textContent = refSel.mode === 'recent'
    ? '태그 순위 상위 곡의 발매 연도를 확인해 최근 곡만 골라요. 처음엔 1~3분 걸리고, 확인한 연도는 기억해 다음부터 빨라요.'
    : '전체 기간 순위라 오래 사랑받은 명곡이 많아요.';
}

function renderRefTabs() {
  refSel.tab = Math.min(Math.max(0, refSel.tab), GENRES.length - 1);
  ref.tabs.replaceChildren(...GENRES.map((g, i) => {
    const t = Object.assign(document.createElement('button'), { type: 'button', className: 'gtab', textContent: g.name });
    t.setAttribute('role', 'tab');
    t.setAttribute('aria-selected', String(i === refSel.tab));
    t.onclick = () => { refSel.tab = i; saveRef(); renderRefTabs(); };
    return t;
  }));
  const g = GENRES[refSel.tab];
  const names = [...g.items.map((it) => it.name), ...customGenres.filter((c) => c.cat === g.name).map((c) => c.name)];
  ref.subs.replaceChildren(...names.map((name) => {
    const c = Object.assign(document.createElement('button'), { type: 'button', className: 'sb-chip', textContent: customGenre(name) ? `${name} ✦` : name });
    c.setAttribute('aria-pressed', String(refSel.sub === name));
    c.onclick = () => { refSel.sub = name; saveRef(); renderRefTabs(); loadRef(name); };
    return c;
  }));
  renderRefControls();
}

function loadRef(name, force = false) {
  refRun++;
  return refSel.mode === 'recent' ? loadRecent(name, force) : loadAll(name, force);
}

/* ---------- 전체 기간 ---------- */
async function loadAll(name, force) {
  const run = refRun;
  const k = `all|${name}`;
  let hit = refCache[k];
  if (force || !hit || Date.now() - hit.at >= REF_TTL) {
    ref.out.innerHTML = `<p class="ref-empty">${esc(name)} 인기곡을 가져오는 중…</p>`;
    try {
      const d = await refApi('/api/music/toptracks', { ...refTagsFor(name), limit: 20 });
      hit = refCache[k] = { at: Date.now(), data: d };
      saveRef();
    } catch (e) {
      if (run === refRun) ref.out.innerHTML = refError(e);
      return;
    }
  }
  // 목록을 먼저 보여 주고, 아직 모르는 발매 연도를 확인해 채운다(20곡이라 한 번 요청으로 끝남. 확인한 연도는 계속 기억)
  const { tracks } = hit.data;
  for (;;) {
    if (run !== refRun) return;
    const left = tracks.filter((t) => !(refKey(t) in refYears));
    if (!left.length) return renderRefList(name, tracks, allHead(name, hit.data));
    renderRefList(name, tracks, allHead(name, hit.data, `발매 연도 확인 중… ${tracks.length - left.length}/${tracks.length}곡`));
    try {
      const d = await refApi('/api/music/trackyears', { tracks: left.slice(0, REF_BATCH).map(({ name: n, artist, mbid }) => ({ name: n, artist, mbid })) });
      Object.assign(refYears, d.years);
      saveRef();
      if (!d.checked) throw new Error('발매 연도 확인 서버가 응답하지 않습니다');
    } catch (e) {
      if (run === refRun) renderRefList(name, tracks, allHead(name, hit.data, `연도 확인을 멈췄습니다(${e.message === 'NO_SERVER' ? '배포 사이트에서만 됨' : e.message})`));
      return;
    }
  }
}
const allHead = (name, d, status = '') => ({
  title: `${name} 인기곡 Top ${d.tracks.length} · 전체 기간`,
  sub: `Last.fm '${d.tags.join("', '")}' 태그 · 청취자 순${d.fallback ? ` · 모자란 곡은 '${d.fallback}'에서 채움` : ''}${status ? ` · ${status}` : ''}`,
  stop: status.startsWith('발매 연도 확인 중'),
});

/* ---------- 최근 곡 ---------- */
async function loadRecent(name, force) {
  const run = refRun;
  const k = `pool|${name}`;
  let pool = refCache[k];
  if (force || !pool || Date.now() - pool.at >= REF_TTL) {
    ref.out.innerHTML = `<p class="ref-empty">${esc(name)} 후보곡을 가져오는 중…</p>`;
    try {
      const d = await refApi('/api/music/toptracks', { ...refTagsFor(name), pool: REF_POOL });
      pool = refCache[k] = { at: Date.now(), data: d };
      saveRef();
    } catch (e) {
      if (run === refRun) ref.out.innerHTML = refError(e);
      return;
    }
  }
  const { tracks, tags } = pool.data;
  const minYear = refMinYear();
  const picked = () => tracks.filter((t) => (refYears[refKey(t)] ?? 0) >= minYear).slice(0, 20);
  const unchecked = () => tracks.filter((t) => !(refKey(t) in refYears));
  const head = (status) => ({
    title: `${name} 최근 인기곡 Top ${picked().length} · ${minYear}년~`,
    sub: `Last.fm '${tags.join("', '")}' 태그 순위 상위 ${tracks.length}곡 중 발매 연도(MusicBrainz) 기준${status ? ` · ${status}` : ''}`,
    stop: !!status && status.startsWith('발매 연도 확인 중'),
  });

  for (;;) {
    if (run !== refRun) return;
    const left = unchecked();
    const done = picked().length >= 20 || !left.length;
    const checkedN = tracks.length - left.length;
    if (done) {
      const note = picked().length < 20 ? `후보 ${tracks.length}곡 중 ${minYear}년 이후 곡이 ${picked().length}곡뿐이에요. 기간을 넓혀 보세요` : '';
      return renderRefList(name, picked(), head(note), true);
    }
    renderRefList(name, picked(), head(`발매 연도 확인 중… ${checkedN}/${tracks.length}곡`), true);
    try {
      const d = await refApi('/api/music/trackyears', { tracks: left.slice(0, REF_BATCH).map(({ name: n, artist, mbid }) => ({ name: n, artist, mbid })) });
      Object.assign(refYears, d.years);
      saveRef();
      if (!d.checked) throw new Error('발매 연도 확인 서버가 응답하지 않습니다');
    } catch (e) {
      if (run !== refRun) return;
      return renderRefList(name, picked(), head(`연도 확인을 멈췄습니다(${e.message === 'NO_SERVER' ? '배포 사이트에서만 됨' : e.message})`), true);
    }
  }
}

/* ---------- 목록 ---------- */
function renderRefList(name, tracks, head, showYear = false) {
  const q = (t) => encodeURIComponent(`${t.artist} ${t.name}`);
  // 발매 연도 배지: 확인한 연도 / 확인했지만 못 찾음 / 아직 확인 전
  const yearBadge = (t) => {
    const k = refKey(t);
    if (!(k in refYears)) return '<span class="ref-year pending" title="발매 연도 확인 전">…</span>';
    return refYears[k] ? `<span class="ref-year" title="첫 발매 연도(MusicBrainz)">${refYears[k]}</span>` : '<span class="ref-year none" title="MusicBrainz에서 발매 연도를 찾지 못했습니다">연도 ?</span>';
  };
  ref.out.innerHTML = `<div class="ref-head"><h3>${esc(head.title)}</h3><small>${esc(head.sub)}</small>
    ${head.stop ? '<button type="button" class="ghost" id="ref-stop">멈추기</button>' : '<button type="button" class="ghost" id="ref-reload" title="하루 동안 기억한 목록 대신 지금 다시 가져옵니다">새로고침</button>'}</div>
    ${tracks.length ? `<ol class="ref-list">${tracks.map((t, i) => `<li>
      <span class="ref-rank">${i + 1}</span>
      <span class="ref-song"><b title="${esc(t.name)}">${esc(t.name)}${yearBadge(t)}</b><small>${esc(t.artist)}${t.from ? ` <span class="ref-from">· '${esc(t.from)}'에서</span>` : ''}</small></span>
      <span class="ref-acts">
        <a class="ghost" href="https://www.youtube.com/results?search_query=${q(t)}" target="_blank" rel="noopener noreferrer">▶ 유튜브</a>
        <a class="ghost" href="https://open.spotify.com/search/${q(t)}" target="_blank" rel="noopener noreferrer">스포티파이</a>
        <button type="button" class="ghost" data-ref="${i}">원곡 정보 찾기</button>
      </span></li>`).join('')}</ol>` : '<p class="ref-empty">아직 찾은 곡이 없습니다.</p>'}
    <p class="ref-foot muted">발매 연도는 MusicBrainz의 첫 발매일 기준입니다. 원곡이 다른 언어 제목으로만 등록된 곡은 재발매 연도로 잡힐 수 있어요.</p>`;
  ref.out.querySelectorAll('[data-ref]').forEach((b) => { b.onclick = () => refFindInfo(tracks[+b.dataset.ref]); });
  const stop = $('#ref-stop');
  if (stop) stop.onclick = () => { refRun++; renderRefList(name, tracks, { ...head, sub: `${head.sub.replace(/ · 발매 연도 확인 중.*$/, '')} · 확인을 멈췄습니다`, stop: false }, showYear); };
  const reload = $('#ref-reload');
  if (reload) reload.onclick = () => loadRef(name, true);
}

// 곡으로 조합 만들기의 ② 원곡 정보 확인으로 제목·가수를 넘기고 웹 정보를 찾는다(소리 분석 없이도 확인할 수 있게 ②를 연다)
function refFindInfo(t) {
  $('#tab-upload').click();
  const btn = $('#panel-upload .pdesc');
  if (btn && btn.getAttribute('aria-expanded') !== 'true') setPanelOpen(btn, true);
  songInfoSeq++; // 진행 중이던 링크 제목 조회가 덮어쓰지 않게
  setSongInfo(t.name, t.artist, '인기곡 탭에서 가져왔습니다. 소리까지 분석하려면 위 ①에서 곡을 가져오세요.');
  $('#song-step').scrollIntoView({ behavior: 'smooth', block: 'start' });
  si.find.click();
}

/* ---------- 연결 ---------- */
[1, 3, 5].forEach((n) => ref.years.append(new Option(`최근 ${n}년 (${REF_THIS_YEAR - n + 1}~)`, String(n))));
ref.modeTabs.onclick = (e) => {
  const b = e.target.closest('[data-mode]');
  if (!b || b.dataset.mode === refSel.mode) return;
  refSel.mode = b.dataset.mode;
  saveRef();
  renderRefControls();
  if (refSel.sub) loadRef(refSel.sub);
};
ref.years.onchange = () => { refSel.years = +ref.years.value; saveRef(); if (refSel.sub) loadRef(refSel.sub); };
$('#tab-ref').addEventListener('click', () => {
  renderRefTabs(); // 그사이 자동 추가된 장르(✦)도 보이게
  if (refSel.sub && !ref.out.children.length) loadRef(refSel.sub);
});
renderRefTabs();
