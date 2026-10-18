/* 악기 믹서: 악기 카드를 켜고 끄면 같은 트랜스포트 위에서 동기화된 루프가 섞여 재생된다. */

// 오디오 버퍼를 '재생 안정성' 우선으로. 기본값(interactive, 약 10ms)은 무거운 악기(로즈 FM·신스 패드 리버브)가
// 겹치면 처리가 순간적으로 밀려 '지직' 끊김(잡음)이 난다. 반복 재생 음악이라 수십 ms 늦게 반응해도 문제없다.
// 어떤 오디오 노드보다 먼저 바꿔야 해서 파일 맨 앞에 둔다. Tone.Transport·Tone.Draw·Tone.context는 불러올 때의
// 원래 컨텍스트에 묶여 있으므로, 이 파일에서는 항상 Tone.getTransport()·getDraw()·getContext()를 쓴다.
Tone.setContext(new Tone.Context({ latencyHint: 'playback', lookAhead: 0.15 }));

// 추천 조합: 장르 탭 → 세부 장르. 세부 장르마다 코드 진행·악기 구성·BPM이 다르다(패턴은 공용).
const GENRES = [
  { name: '재즈', items: [
    { name: '재즈 발라드', prog: ['Cmaj7', 'Am7', 'Dm7', 'G7'], bpm: 70, ids: ['brushes', 'upright-bass', 'piano', 'sax'] },
    { name: '스윙 재즈', prog: ['Dm7', 'G7', 'Cmaj7', 'A7'], bpm: 140, ids: ['brushes', 'upright-bass', 'piano', 'brass'] },
    { name: '보사노바 재즈', prog: ['Fmaj7', 'G7', 'Gm7', 'C7'], bpm: 100, ids: ['nylon-guitar', 'soft-drums', 'percussion', 'upright-bass', 'sax'] },
    { name: '컨템포러리 재즈', prog: ['Dm9', 'Gm9', 'Ebmaj7', 'Am7'], bpm: 96, ids: ['soft-drums', 'bass', 'rhodes', 'sax', 'synth-pad'] },
    { name: '재즈 팝', prog: ['Fmaj7', 'E7', 'Am7', 'Dm7'], bpm: 110, ids: ['drums', 'bass', 'electric-piano', 'brass', 'guitar'] },
  ] },
  { name: '발라드', items: [
    { name: '팝 발라드', prog: ['C', 'G', 'Am', 'F'], bpm: 72, ids: ['soft-drums', 'bass', 'piano', 'strings'] },
    { name: '어쿠스틱 발라드', prog: ['G', 'Em', 'C', 'D'], bpm: 70, ids: ['guitar', 'piano', 'cello'] },
    { name: 'R&B 발라드', prog: ['Ebmaj7', 'Dm7', 'Gm7', 'Cm9'], bpm: 68, ids: ['drum-machine', 'rhodes', 'bass', 'synth-pad'] },
    { name: '록 발라드', prog: ['D', 'A', 'Bm', 'G'], bpm: 76, ids: ['drums', 'electric-guitar', 'bass', 'piano', 'strings'] },
    { name: '시네마틱 발라드', prog: ['Am', 'F', 'C', 'E'], bpm: 66, ids: ['orchestra', 'piano', 'cello', 'synth-pad'] },
  ] },
  { name: '팝', items: [
    { name: '어쿠스틱 팝', prog: ['C', 'Am', 'F', 'G'], bpm: 110, ids: ['guitar', 'percussion', 'bass', 'piano'] },
    { name: '신스 팝', prog: ['Dm', 'Bb', 'F', 'C'], bpm: 118, ids: ['drum-machine', 'synth-bass', 'synth', 'synth-pad'] },
    { name: '인디 팝', prog: ['Fmaj7', 'Am', 'C', 'G'], bpm: 116, ids: ['drums', 'electric-guitar', 'bass', 'synth'] },
    { name: '드림 팝', prog: ['Cmaj7', 'Fmaj7', 'Am7', 'Fm'], bpm: 92, ids: ['drum-machine', 'ambient-guitar', 'synth-pad', 'bass'] },
    { name: '시티 팝', prog: ['Fmaj7', 'G7', 'Em7', 'Am7'], bpm: 112, ids: ['drums', 'bass', 'funk-guitar', 'electric-piano', 'brass'] },
  ] },
  { name: '힙합', items: [
    { name: '로파이 힙합', prog: ['Fmaj7', 'Em7', 'Dm7', 'Cmaj7'], bpm: 78, ids: ['boombap', 'rhodes', 'bass', 'vinyl', 'sample'] },
    { name: '재즈 힙합', prog: ['Dm7', 'G7', 'Cmaj7', 'Am7'], bpm: 88, ids: ['boombap', 'upright-bass', 'piano', 'sax', 'vinyl'] },
    { name: '붐뱁 힙합', prog: ['Am7', 'Dm7', 'Am7', 'Em7'], bpm: 92, ids: ['boombap', 'bass', 'sample', 'turntable'] },
    { name: '멜로딕 힙합', prog: ['Am', 'Em', 'F', 'G'], bpm: 140, ids: ['trap', 'piano', 'synth-pad', 'synth'] },
    { name: '칠 힙합', prog: ['Cmaj9', 'Am9', 'Dm9', 'G9'], bpm: 84, ids: ['boombap', 'electric-piano', 'ambient-guitar', 'bass'] },
  ] },
  // 위 네 장르에 들지 않는 기존 조합(트랩·EDM·펑크·록)을 잃지 않도록 따로 모은 탭
  { name: '일렉트로닉·밴드', items: [
    { name: '트랩', prog: ['Am', 'F', 'Am', 'F'], bpm: 70, ids: ['trap', 'synth-pad', 'synth', 'turntable'] },
    { name: '하우스·EDM', prog: ['Am', 'F', 'C', 'G'], bpm: 124, ids: ['electronic-drums', 'synth-bass', 'synth', 'synth-pad'] },
    { name: '펑크', prog: ['Em7', 'A7', 'Em7', 'A7'], bpm: 104, ids: ['drums', 'funk-guitar', 'bass', 'brass', 'electric-piano'] },
    { name: '록', prog: ['A', 'G', 'D', 'A'], bpm: 120, ids: ['drums', 'electric-guitar', 'bass', 'piano'] },
  ] },
];

const byId = Object.fromEntries(INSTRUMENTS.map((d) => [d.id, d]));
const catById = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));
const state = {}; // id -> { obj, channel, meter, part, active, loading, solo }

let master, started = false, initP = null;

// 첫 동작이 추천 조합(악기 여러 개 동시 activate)이면 여러 번 동시에 불린다 → 진행 중인 초기화를 공유
const initAudio = () => (initP ??= initAudioOnce().catch((e) => { initP = null; throw e; }));

async function initAudioOnce() {
  await Tone.start();
  const limiter = new Tone.Limiter(-1).toDestination();
  master = new Tone.Volume(-4).connect(limiter);
  Tone.getTransport().bpm.value = +el.bpm.value;
  Tone.getTransport().on('start', (time) => {
    forActive((s) => s.obj.start?.(time));
    Tone.getDraw().schedule(renderTransport, time);
  });
  Tone.getTransport().on('stop', (time) => {
    forActive((s) => s.obj.stop?.(time));
    Tone.getDraw().schedule(renderTransport, time);
  });
  Tone.getTransport().scheduleRepeat((time) => Tone.getDraw().schedule(drawPosition, time), '4n', 0);
  started = true;
}

// start('+0.05')로 예약된 직후엔 Transport.state가 아직 'stopped'라 직접 플래그로 관리
let running = false;
const isRunning = () => running;
function startTransport() {
  running = true;
  document.querySelectorAll('audio').forEach((a) => a.pause()); // 업로드한 원곡과 겹치지 않게
  Tone.getTransport().start('+0.05');
  renderTransport();
}

const forActive = (fn) => Object.values(state).forEach((s) => s.active && fn(s));

// 악기 인스턴스를 만들고(샘플 로딩) s.ready에 완료 Promise를 둔다. 로딩 중에 또 불리면 같은 s를 돌려준다.
// s.wanted: 로딩이 끝났을 때 켜야 하는지. 로딩 중 끄기·다른 조합 적용 시 false가 되어 켜지지 않고 정리된다.
function ensure(id) {
  if (state[id]) return state[id];
  const def = byId[id];
  const vol = +document.querySelector(`.card[data-id="${id}"] input`).value;
  const channel = new Tone.Channel({ volume: vol }).connect(master);
  const meter = new Tone.Meter({ normalRange: true, smoothing: 0.75 });
  channel.connect(meter);
  const s = (state[id] = { channel, meter, active: false, loading: true, wanted: false, nodes: [] });
  s.bar = document.querySelector(`.card[data-id="${id}"] .meter i`);
  s.ready = (async () => {
    try {
      s.obj = withNodeTracking(s.nodes, () => def.create(channel));
      await s.obj.ready;
    } catch (err) {
      console.error(id, err);
      if (state[id] === s) delete state[id];
      disposeAll([...s.nodes, channel, meter]);
      throw err;
    }
    // 메인 스레드가 오래 막혔다 풀리면 같은 시각에 이벤트가 몰려 Tone이 예외를 던진다. 그 음 하나만 건너뛴다.
    s.part = new Tone.Part((time, ev) => {
      try { s.obj.play(time, ev); } catch (err) { console.warn(id, err.message); }
    }, def.events());
    s.part.loop = true;
    s.part.loopEnd = '4m';
    s.part.mute = true;
    s.part.start(0);
    s.loading = false;
  })();
  render(id);
  return s;
}

// 상태에서 빼고 페이드아웃 후 노드를 모두 해제
function teardown(id, s) {
  if (state[id] === s) delete state[id];
  s.channel.volume.rampTo(-Infinity, 0.15);
  setTimeout(() => disposeAll([s.part, ...s.nodes, s.channel, s.meter].filter(Boolean)), 400);
}

// create() 안에서 new Tone.X(...)로 만들어진 노드를 모두 기록해 나중에 dispose할 수 있게 한다.
function withNodeTracking(list, fn) {
  const real = window.Tone;
  window.Tone = new Proxy(real, {
    get(t, k) {
      const v = t[k];
      if (typeof v !== 'function' || !v.prototype?.dispose) return v;
      return new Proxy(v, { construct: (C, args) => { const o = new C(...args); list.push(o); return o; } });
    },
  });
  try { return fn(); } finally { window.Tone = real; }
}

function disposeAll(nodes) {
  nodes.forEach((n) => { try { n.dispose(); } catch {} });
}

// 이보다 많이 동시에 켜면 일반 PC에서도 오디오 처리가 실시간을 못 따라가 박자가 늘어진다(측정: 12개 0.91배속, 18개 0.59배속)
const MAX_ACTIVE = 10;

const isOn = (s) => s.active || (s.loading && s.wanted); // 켜져 있거나 켜지는 중
// initAudio()를 기다리는 동안엔 아직 state에 없으므로 따로 센다(여러 개를 동시에 켤 때 한도가 뚫리지 않게)
const pending = new Set();
const onCount = () => Object.values(state).filter(isOn).length + [...pending].filter((id) => !state[id]).length;

async function activate(id) {
  if (!(state[id] && isOn(state[id])) && !pending.has(id) && onCount() >= MAX_ACTIVE) {
    flash(`동시에 최대 ${MAX_ACTIVE}개까지 섞을 수 있습니다. 다른 악기를 끄고 선택해 주세요.`, 'warn');
    return;
  }
  pending.add(id);
  await initAudio();
  if (!pending.delete(id)) return; // 기다리는 사이 '모두 해제' 등으로 취소됨
  const s = ensure(id);
  s.wanted = true;
  render(id);
  try {
    await s.ready;
  } catch {
    flash(`${byId[id].ko} 소리를 불러오지 못했습니다. 네트워크를 확인하고 다시 눌러 주세요.`, 'error');
    render(id);
    return;
  }
  if (state[id] !== s) return; // 로딩 중 다른 인스턴스로 바뀜
  if (!s.wanted) { teardown(id, s); render(id); return; } // 로딩 중 꺼짐
  if (s.active) return; // 같은 악기를 연달아 켠 경우 첫 요청이 이미 켬
  s.active = true;
  s.part.mute = false;
  if (isRunning()) s.obj.start?.(Tone.now());
  else startTransport();
  render(id);
  renderTransport();
}

function deactivate(id) {
  pending.delete(id);
  const s = state[id];
  if (!s) return;
  if (s.loading) {
    // 아직 로딩 중: 끝나면 켜지 말고 정리하라고 표시만 해 둔다(activate가 정리함)
    s.wanted = false;
    render(id);
    renderTransport();
    return;
  }
  if (!s.active) return;
  s.active = false;
  s.wanted = false;
  s.obj.stop?.(Tone.now());
  if (s.solo) setSolo(id, false);
  // 꺼진 악기도 LFO·리버브 등이 계속 오디오 스레드를 점유하므로 페이드아웃 후 통째로 해제한다.
  // 다시 켜면 새로 만든다(샘플은 브라우저 캐시에서 다시 읽음).
  teardown(id, s);
  render(id);
  if (!Object.values(state).some((x) => x.active)) stopTransport();
  renderTransport();
}

function setSolo(id, on) {
  const s = state[id];
  if (!s) return;
  s.solo = on;
  s.channel.solo = on;
  document.body.classList.toggle('has-solo', Object.values(state).some((x) => x.solo));
  render(id);
}

function stopTransport() {
  if (!started) return;
  running = false;
  Tone.getTransport().stop();
  Tone.getTransport().position = 0;
  renderTransport();
  drawPosition();
}

async function togglePlay() {
  await initAudio();
  if (isRunning()) return stopTransport();
  if (!Object.values(state).some((s) => s.active)) {
    flash('먼저 아래에서 악기를 하나 이상 선택해 주세요.');
    return;
  }
  startTransport();
}

// 추천 조합과 곡 분석 결과가 함께 쓰는 진입점. prog: 코드 진행, semis: 그 진행을 옮길 반음 수
async function applyCombo(ids, bpm, semis = 0, prog = DEFAULT_PROG) {
  Object.keys(state).forEach((id) => !ids.includes(id) && deactivate(id));
  [...pending].forEach((id) => !ids.includes(id) && pending.delete(id));
  setBpm(bpm);
  applyHarmony(prog, semis);
  await Promise.all(ids.map(activate));
  // 악기가 이미 켜져 있으면 activate()가 재생을 시작하지 않으므로(원곡 재생으로 멈춘 경우 등) 여기서 다시 시작
  if (!isRunning() && Object.values(state).some((s) => s.active)) startTransport();
}

const applyPreset = (p) => {
  markPreset(p.name);
  return applyCombo(p.ids, p.bpm, 0, p.prog);
};

/* ---------------- 상단 탭: 곡으로 조합 만들기 / 추천 조합 ---------------- */
function buildPanelTabs() {
  const tabs = [...document.querySelectorAll('.ptab')];
  const show = (id) => {
    tabs.forEach((t) => {
      const on = t.id === id;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
    });
    // Suno Style Builder·Suno 작곡 탭에서는 하단 악기 목록을 숨김
    document.body.classList.toggle('no-board', id === 'tab-suno' || id === 'tab-songs');
    try { localStorage.setItem('music.panelTab.v2', id); } catch {}
  };
  tabs.forEach((t, i) => {
    t.onclick = () => show(t.id);
    // 선택 안 된 탭은 tabIndex -1이라 방향키로 이동한다(WAI-ARIA 탭 패턴)
    t.onkeydown = (e) => {
      const to = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
      if (to === undefined) return;
      e.preventDefault();
      const next = tabs[(to + tabs.length) % tabs.length];
      show(next.id);
      next.focus();
    };
  });
  let saved = null;
  try { saved = localStorage.getItem('music.panelTab.v2'); } catch {}
  show(tabs.some((t) => t.id === saved) ? saved : tabs[0].id);
}

// 탭 설명 줄 오른쪽 아이콘으로 패널 내용을 접고 펼친다(세로 공간 확보). 처음엔 접힌 상태.
function setPanelOpen(btn, open) {
  btn.setAttribute('aria-expanded', String(open));
  document.getElementById(btn.getAttribute('aria-controls')).hidden = !open;
  try { localStorage.setItem(`music.open.${btn.getAttribute('aria-controls')}`, open ? '1' : ''); } catch {}
}

function buildPanelToggles() {
  document.querySelectorAll('.pdesc').forEach((btn) => {
    let open = false;
    try { open = !!localStorage.getItem(`music.open.${btn.getAttribute('aria-controls')}`); } catch {}
    setPanelOpen(btn, open);
    btn.onclick = () => setPanelOpen(btn, btn.getAttribute('aria-expanded') !== 'true');
  });
}

/* ---------------- 추천 조합(장르 탭) ---------------- */
let currentPreset = null;

function buildGenres() {
  let tab = 0;
  try { tab = Math.min(GENRES.length - 1, +localStorage.getItem('music.genreTab') || 0); } catch {}
  GENRES.forEach((g, i) => {
    const t = document.createElement('button');
    t.className = 'gtab';
    t.setAttribute('role', 'tab');
    t.textContent = g.name;
    t.onclick = () => showGenre(i);
    el.genreTabs.append(t);
  });
  showGenre(tab);
}

function showGenre(i) {
  [...el.genreTabs.children].forEach((t, k) => t.setAttribute('aria-selected', String(k === i)));
  el.presets.replaceChildren(...GENRES[i].items.map((p) => {
    const b = document.createElement('button');
    b.className = 'preset';
    b.dataset.name = p.name;
    b.classList.toggle('on', p.name === currentPreset);
    const inst = p.ids.map((id) => byId[id].ko).join(' · ');
    // small: 터치 화면용(카드에 그대로 표시), desc: 마우스 화면용 말풍선 — 악기 카드와 같은 규칙
    const chords = p.prog.join(' – ');
    b.innerHTML = `<b>${p.name}</b><small>${p.bpm} BPM · ${chords}<br>${inst}</small><span class="desc"><b>${p.bpm} BPM · ${chords}</b>${inst}</span>`;
    b.onclick = () => applyPreset(p);
    return b;
  }));
  try { localStorage.setItem('music.genreTab', String(i)); } catch {}
}

// 지금 켜진 조합이 어떤 추천 조합인지 표시. 사용자가 악기를 직접 바꾸면 해제한다.
function markPreset(name) {
  currentPreset = name;
  el.presetCurrent.textContent = name ? `· ${name}` : '';
  [...el.presets.children].forEach((b) => b.classList.toggle('on', b.dataset.name === name));
}

// 코드 진행이나 키가 바뀌면 이미 만들어 둔 파트의 음표도 다시 채운다(play()에서 PROG를 읽는 악기는 바로 반영됨)
function applyHarmony(prog, semis) {
  if (prog.join() === HARMONY.prog.join() && semis === HARMONY.shift) return;
  setHarmony(prog, semis);
  for (const [id, s] of Object.entries(state)) {
    if (!s.part) continue;
    s.part.clear();
    byId[id].events().forEach((e) => s.part.add(e));
  }
  [...el.chords.children].forEach((c, i) => (c.textContent = PROG[i].name));
}

function clearAll() {
  markPreset(null);
  pending.clear();
  Object.keys(state).forEach((id) => {
    if (state[id].solo) setSolo(id, false);
    deactivate(id);
  });
}

function setBpm(v) {
  el.bpm.value = v;
  el.bpmVal.textContent = v;
  if (started) Tone.getTransport().bpm.rampTo(+v, 0.1);
}

/* ---------------- 화면 ---------------- */
const $ = (sel, root = document) => root.querySelector(sel);
const el = {
  play: $('#play'), bpm: $('#bpm'), bpmVal: $('#bpm-val'), vol: $('#master'),
  count: $('#count'), clear: $('#clear'), chords: $('#chords'), beats: $('#beats'),
  presets: $('#presets'), genreTabs: $('#genre-tabs'), presetCurrent: $('#preset-current'), board: $('#board'), toast: $('#toast'),
};

// 스킨(어두운/밝은 화면). 처음 값은 index.html 머리의 스크립트가 정해 둔다.
function buildThemeSwitch() {
  const btns = [...document.querySelectorAll('[data-theme-set]')];
  const sync = () => btns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.themeSet === document.documentElement.dataset.theme)));
  btns.forEach((b) => (b.onclick = () => {
    document.documentElement.dataset.theme = b.dataset.themeSet;
    try { localStorage.setItem('music.theme', b.dataset.themeSet); } catch {}
    sync();
  }));
  sync();
}

function buildUI() {
  buildThemeSwitch();
  buildGenres();
  buildPanelTabs();
  buildPanelToggles();

  PROG.forEach((p) => {
    const c = document.createElement('span');
    c.className = 'chord';
    c.textContent = p.name;
    el.chords.append(c);
  });
  for (let i = 0; i < 4; i++) el.beats.append(document.createElement('i'));

  CATEGORIES.forEach((cat) => {
    const list = INSTRUMENTS.filter((d) => d.cat === cat.id);
    const sec = document.createElement('section');
    sec.className = 'cat';
    sec.style.setProperty('--c', cat.color);
    sec.innerHTML = `<h2><span class="dot"></span>${cat.name}<small>${list.length}</small></h2><div class="grid"></div>`;
    list.forEach((d) => $('.grid', sec).append(card(d)));
    el.board.append(sec);
  });

  el.play.onclick = togglePlay;
  el.clear.onclick = clearAll;
  el.count.onclick = copySelected;
  el.bpm.oninput = () => setBpm(el.bpm.value);
  el.vol.oninput = () => master && (master.volume.value = +el.vol.value);
  document.addEventListener('keydown', (e) => {
    if (e.code !== 'Space' || e.repeat) return;
    if (/^(INPUT|BUTTON|SELECT|TEXTAREA|A)$/.test(document.activeElement.tagName)) return;
    if (document.activeElement.closest?.('dialog, .song-table')) return; // 곡 목록·팝업에서는 믹서를 건드리지 않음
    e.preventDefault();
    togglePlay();
  });
  // 패널 밖에 파일을 놓으면 브라우저가 그 파일을 열어 앱을 벗어나므로 막는다(업로드는 업로드 패널에서만)
  ['dragover', 'drop'].forEach((t) => window.addEventListener(t, (e) => e.preventDefault()));
}

function card(d) {
  const node = document.createElement('div');
  node.className = 'card';
  node.dataset.id = d.id;
  node.innerHTML = `
    <button class="card-main" aria-pressed="false">
      <span class="card-top"><span class="en">${d.en}</span><span class="badge"></span></span>
      <span class="ko">${d.ko}</span>
      <span class="desc"><b>${d.ko}</b>${d.desc}</span>
    </button>
    <div class="card-ctrl">
      <div class="meter"><i></i></div>
      <label class="vol" title="음량"><span>음량</span><input type="range" min="-30" max="6" step="1" value="0" aria-label="${d.ko} 음량"></label>
      <button class="solo" title="이 악기만 듣기">단독</button>
    </div>`;
  $('.card-main', node).onclick = () => {
    markPreset(null);
    const s = state[d.id];
    s && isOn(s) ? deactivate(d.id) : activate(d.id); // 로딩 중에 누르면 취소
  };
  $('input', node).oninput = (e) => state[d.id] && (state[d.id].channel.volume.value = +e.target.value);
  $('.solo', node).onclick = () => setSolo(d.id, !state[d.id]?.solo);
  return node;
}

function render(id) {
  const node = document.querySelector(`.card[data-id="${id}"]`);
  const s = state[id];
  const loading = !!(s?.loading && s.wanted);
  node.classList.toggle('active', !!s?.active);
  node.classList.toggle('loading', loading);
  node.classList.toggle('soloed', !!s?.solo);
  $('.card-main', node).setAttribute('aria-pressed', String(!!s?.active || loading));
  // 칸이 좁아 '재생 중' 글자 대신 색 점으로 표시(style.css .card.active .badge)
  $('.badge', node).textContent = loading ? '로딩' : '';
  if (!s?.active) $('.meter i', node).style.transform = 'scaleX(0)'; // 다시 켤 때 이전 값이 비치지 않게
}

function renderTransport() {
  const playing = isRunning();
  el.play.classList.toggle('playing', playing);
  el.play.setAttribute('aria-label', playing ? '정지' : '재생');
  const n = Object.values(state).filter((s) => s.active).length;
  el.count.textContent = n ? `${n}개 선택됨 · 복사` : '선택된 악기 없음';
  el.count.disabled = !n;
  el.clear.disabled = !n;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // http 등 보안 컨텍스트가 아니면 clipboard API가 막혀 있어 예전 방식으로 복사
    const ta = Object.assign(document.createElement('textarea'), { value: text });
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    if (!ok) flash('복사하지 못했습니다. 브라우저의 클립보드 권한을 확인해 주세요.', 'error');
    return ok;
  }
}

// 선택된 악기를 화면 순서(분류 순)대로 '한글명(English)' 목록으로 복사
async function copySelected() {
  const picked = INSTRUMENTS.filter((d) => state[d.id]?.active);
  if (!picked.length) return;
  const text = picked.map((d) => `${d.ko}(${d.en})`).join(', ');
  if (await copyText(text)) flash(`${picked.length}개 악기 목록을 복사했습니다.`, 'ok');
}

function drawPosition() {
  const playing = Tone.getTransport().state === 'started';
  const [bar, beat] = Tone.getTransport().position.split(':').map((x) => parseInt(x, 10));
  [...el.chords.children].forEach((c, i) => c.classList.toggle('on', playing && i === bar % 4));
  [...el.beats.children].forEach((b, i) => b.classList.toggle('on', playing && i === beat));
}

function meterLoop() {
  for (const s of Object.values(state)) {
    if (!s.active) continue;
    const v = Math.min(1, Math.sqrt(s.meter.getValue()) * 1.6);
    s.bar.style.transform = `scaleX(${v.toFixed(3)})`;
  }
  requestAnimationFrame(meterLoop);
}

let toastTimer;
// type: 'info'(기본) · 'ok'(성공) · 'warn'(한도 등 안내) · 'error'(실패). 오류·경고는 읽을 시간을 더 준다
function flash(msg, type = 'info') {
  el.toast.textContent = msg;
  el.toast.dataset.type = type;
  el.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove('show'), type === 'error' || type === 'warn' ? 6000 : 3500);
}

buildUI();
renderTransport();
meterLoop();
