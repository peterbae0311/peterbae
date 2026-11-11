/* 멜로디: 믹서 위쪽 막대(마스터 음량 오른쪽)에서 켜고 끄는 자동 멜로디.
 * 지금 코드 진행(PROG) 위에 8마디 멜로디를 규칙으로 만든다(AI 작곡이 아니라 스케치용).
 *  - 리듬: 마디마다 리듬 조각을 고르고, 5~6마디는 1~2마디를 그대로 반복해 '동기(모티프)'가 들리게 한다
 *  - 음: 강박(1·3박)은 그 마디 코드의 구성음, 나머지는 음계를 따라 한 칸씩 움직인다. 마지막은 길게 코드음에 내려앉는다
 *  - 빠른 곡은 음을 덜, 느린 곡은 더 촘촘하게. Style Builder 3번에서 스윙·셔플을 고르면 뒷박을 늦춘다
 * Style Builder와 연결:
 *  - 7번 멜로디·화성에서 고른 값으로 멜로디 모양을 바꾼다(MEL_STYLE 참고) — Suno에 보내기 전에 그 느낌을 미리 들어 본다
 *  - 소리 '자동'이면 2번 주 악기 분류에 맞춰 신스 리드·벨·부드러운 소리 중에서 고른다
 * 같은 '씨앗(seed)'이면 같은 모양이라 코드 진행·키가 바뀌어도 모양은 유지한 채 음만 새 코드에 맞춘다. [🎲]로 새 씨앗.
 * 소리는 가벼운 합성음만 쓴다(샘플을 받지 않아 메모리·로딩 부담이 적다). app.js·instruments.js 다음에 불러온다. */

const MEL_KEY = 'music.melody';
const MEL_SOUNDS = { auto: '자동 (2번 주 악기 소리)', lead: '신스 리드', bell: '벨', soft: '부드러운 소리' };
let melCfg = { on: false, sound: 'auto', seed: 1 };
try { Object.assign(melCfg, JSON.parse(localStorage.getItem(MEL_KEY) || '{}')); } catch {}
melCfg.on = false; // 페이지를 열 때는 꺼진 채로(소리는 사용자가 누를 때만)
if (!MEL_SOUNDS[melCfg.sound]) melCfg.sound = 'auto';
const saveMel = () => { try { localStorage.setItem(MEL_KEY, JSON.stringify(melCfg)); } catch {} };

let mel = null; // { channel, nodes, part, sig }
const melIsOn = () => melCfg.on;
const melSb = () => (typeof sb !== 'undefined' ? sb : null); // suno.js가 나중에 불러와진다

// 자동: 2번 주 악기가 멜로디를 낼 수 있는 악기(건반·기타·관악기·현악기·신스)면 믹서의 그 악기 소리(샘플)를 그대로 쓴다.
// 베이스·드럼·타악기·DJ 계열이거나 주 악기가 없으면 신스 리드. 결과는 'inst:piano'처럼 악기 id를 붙여 돌려준다
const MEL_INST_CATS = ['keys', 'guitar', 'wind', 'strings', 'synth'];
function melSoundNow() {
  if (melCfg.sound !== 'auto') return melCfg.sound;
  const main = melSb()?.main;
  return main && MEL_INST_CATS.includes(byId[main]?.cat) ? `inst:${main}` : 'lead';
}
// 악기마다 샘플 음량이 달라(측정: 색소폰 -22dB · 첼로 -36dB) 멜로디 채널 음량을 보정한다(dB)
const MEL_INST_GAIN = { cello: 10, guitar: 7, 'nylon-guitar': 7, 'ambient-guitar': 6, strings: 6, rhodes: 4, piano: 3, 'electric-piano': 3, synth: 2, 'synth-pad': 2 };
const melSoundName = (k) => (k.startsWith('inst:') ? byId[k.slice(5)]?.ko ?? k : MEL_SOUNDS[k]);

// 믹서 악기를 멜로디용으로 하나 더 만들어 그 안의 음원(샘플러·신스)만 꺼내 쓴다(이펙트 체인은 악기 그대로)
async function melInstVoice(id, out) {
  const nodes = [];
  const obj = withNodeTracking(nodes, () => byId[id].create(out));
  await obj.ready;
  const voice = nodes.find((n) => n instanceof Tone.Sampler) || nodes.find((n) => n instanceof Tone.PolySynth)
    || nodes.find((n) => typeof n.triggerAttackRelease === 'function' && !(n instanceof Tone.NoiseSynth || n instanceof Tone.MembraneSynth || n instanceof Tone.MetalSynth));
  if (!voice) throw new Error(`${id}: 멜로디로 쓸 음원이 없음`);
  return { voice, nodes, stop: obj.stop };
}

// 7번 멜로디·화성 → 멜로디 모양. 화면에 보이는 짧은 이름(ko)도 함께
const MEL_STYLE = {
  'catchy hook': '중독성 훅',
  'lyrical melody': '서정적',
  'jazzy seventh chords': '재즈 7th',
  'simple pop chord progression': '단순한 팝',
  'lush harmonies': '풍성한 화성',
  'modal harmony': '모달',
};
const melPicks = () => (melSb()?.harmony ?? []).filter((h) => MEL_STYLE[h]);

// 씨앗으로 매번 같은 난수열(mulberry32)
function melRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 한 마디(16칸) 리듬 조각: [시작 칸, 길이 칸]. dense는 음이 많은 조각(느린 곡에서만), long은 긴 음 위주(서정적)
const MEL_CELLS = [
  { n: [[0, 4], [4, 2], [6, 2], [8, 6]] },
  { n: [[2, 2], [4, 2], [6, 4], [12, 4]] },
  { n: [[0, 6], [6, 2], [8, 8]], long: true },
  { n: [[4, 2], [6, 2], [8, 4], [12, 4]] },
  { n: [[0, 8], [8, 4], [12, 4]], long: true },
  { n: [[0, 4], [4, 4], [8, 8]], long: true },
  { n: [[0, 2], [2, 2], [4, 4], [10, 2], [12, 4]], dense: true },
  { n: [[0, 2], [2, 2], [4, 2], [6, 2], [8, 4], [12, 2], [14, 2]], dense: true },
];
const MEL_ENDS = [[[0, 4], [4, 4], [8, 8]], [[0, 6], [6, 2], [8, 8]], [[2, 2], [4, 4], [8, 8]]]; // 4·8마디째: 길게 끝남

// 지금 코드 진행의 음계(4개 코드의 구성음을 합친 것) 안에서 lo~hi. 모달이면 선법 색깔음을 넣는다
function melScale(lo, hi, modal) {
  const pcs = new Set(PROG.flatMap((p) => p.pcs));
  if (modal) {
    // 첫 코드를 으뜸음으로 보고 단조면 도리안(6음을 반음 올림), 장조면 리디안(4음을 반음 올림)
    const t = PROG[0].rootPc;
    const minor = PROG[0].iv[1] === 3;
    pcs.add((t + (minor ? 9 : 6)) % 12); // 원래 음(단조 b6 / 장조 4음)은 지우지 않고 마디마다 골라 쓴다(makeMelody)
  }
  const out = [];
  for (let m = lo; m <= hi; m++) if (pcs.has(m % 12)) out.push(m);
  return out;
}

/* 7번 선택마다 확실히 다르게 들리도록 리듬·음 길이·연주법(art: 음 길이 배율)을 따로 둔다.
 * 리듬 성격은 하나만(우선순위: 중독성 훅 > 서정적 > 단순한 팝 > 재즈 > 기본), 재즈·풍성한 화성·모달은 겹쳐서 더한다 */
const MEL_RHYTHMS = {
  // 중독성 훅: 엇박이 들어간 짧고 톡톡 튀는 한 마디 동기를 매 마디 반복(스타카토)
  catchy: [[[0, 2], [3, 1], [4, 2], [6, 2], [10, 2], [12, 4]], [[0, 1], [2, 2], [4, 1], [6, 2], [8, 2], [11, 1], [12, 4]], [[0, 2], [2, 1], [3, 1], [6, 2], [8, 4], [14, 2]]],
  // 서정적: 2분·온음표 위주로 길게 이어 부르기(레가토)
  lyrical: [[[0, 8], [8, 8]], [[0, 12], [12, 4]], [[0, 6], [6, 2], [8, 8]], [[0, 16]], [[0, 4], [4, 12]]],
  // 단순한 팝: 4분음표 위주
  simple: [[[0, 4], [4, 4], [8, 4], [12, 4]], [[0, 4], [4, 4], [8, 8]], [[0, 8], [8, 4], [12, 4]]],
  // 재즈: 8분음표로 쉬지 않고 흐르는 비밥풍(스윙으로 늦춘다)
  jazzy: [[[0, 2], [2, 2], [4, 2], [6, 2], [8, 2], [10, 2], [12, 4]], [[2, 2], [4, 2], [6, 2], [8, 2], [10, 2], [12, 2], [14, 2]], [[0, 4], [4, 2], [6, 2], [8, 2], [10, 2], [12, 2], [14, 2]]],
};

function makeMelody(seed) {
  const rnd = melRng(seed);
  const pick = (xs) => xs[Math.floor(rnd() * xs.length)];
  const has = new Set(melPicks());
  const catchy = has.has('catchy hook');
  const lyrical = !catchy && has.has('lyrical melody');
  const simple = !catchy && !lyrical && has.has('simple pop chord progression');
  const jazzy = has.has('jazzy seventh chords');
  const lush = has.has('lush harmonies');
  const modal = has.has('modal harmony');
  const bpm = +el.bpm.value || 120;
  const kind = catchy ? 'catchy' : lyrical ? 'lyrical' : simple ? 'simple' : jazzy ? 'jazzy' : '';
  // 연주법: 스타카토(짧게 끊기) / 레가토(다음 음까지 이어서) / 보통
  const art = catchy ? 0.45 : lyrical ? 1.08 : 0.92;

  let rhythm;
  if (kind === 'catchy') {
    const motif = pick(MEL_RHYTHMS.catchy);
    rhythm = [motif, motif, motif, pick(MEL_ENDS), motif, motif, motif, pick(MEL_ENDS)];
  } else if (kind) {
    const cells = MEL_RHYTHMS[kind];
    rhythm = [pick(cells), pick(cells), pick(cells), kind === 'jazzy' ? pick(cells) : pick(MEL_ENDS)];
    rhythm.push(rhythm[0], rhythm[1], pick(cells), kind === 'jazzy' ? pick(cells) : pick(MEL_ENDS));
  } else {
    const cells = MEL_CELLS.filter((c) => (bpm <= 100 ? true : !c.dense));
    rhythm = [pick(cells).n, pick(cells).n, pick(cells).n, pick(MEL_ENDS)];
    rhythm.push(rhythm[0], rhythm[1], pick(cells).n, pick(MEL_ENDS)); // 5~6마디는 동기 반복
  }

  // 서정적은 높고 넓게, 그 밖은 D4~A5
  const [LO, HI] = lyrical ? [64, 86] : [62, 81];
  const scale = melScale(LO, HI, modal);
  const near = (list, m) => list.reduce((a, b) => (Math.abs(b - m) < Math.abs(a - m) ? b : a), list[0]);
  const t = PROG[0].rootPc;
  const colorPc = modal ? (t + (PROG[0].iv[1] === 3 ? 9 : 6)) % 12 : -1; // 도리안 6음 / 리디안 4음
  const plainPc = modal ? (t + (PROG[0].iv[1] === 3 ? 8 : 5)) % 12 : -1; // 그 자리의 원래 음
  // 마디 음계: 코드에 원래 음이 있으면(예: A 단조의 F 코드) 색깔음을 빼고, 없으면 원래 음을 빼서 선법 색이 나게
  const barScale = (p) => (modal ? scale.filter((m) => m % 12 !== (p.pcs.includes(plainPc) ? colorPc : plainPc)) : scale);
  let cur = near(scale, (lyrical ? 72 : 69) + Math.floor(rnd() * 5));
  const notes = [];
  let motifShape = null; // 중독성 훅: 1마디 동기의 음 모양(음계 칸 차이)
  rhythm.forEach((cell, bar) => {
    const p = PROG[bar % 4];
    const chordTones = scale.filter((m) => p.pcs.includes(m % 12));
    const bs = barScale(p);
    const isEnd = bar === 3 || bar === 7;
    // 중독성 훅: 첫 마디의 음 모양을 기억했다가, 다른 마디에서는 그 마디 코드음에서 시작해 같은 모양으로 반복
    if (catchy && motifShape && !isEnd) {
      const start = near(chordTones, notes.find((x) => x.bar === 0).midi);
      const si = scale.indexOf(start);
      cell.forEach(([step, len], i) => {
        notes.push({ bar, step, len, midi: scale[Math.max(0, Math.min(scale.length - 1, si + motifShape[i]))], vel: step % 4 === 0 ? 0.9 : 0.7 });
      });
      cur = notes[notes.length - 1].midi;
      return;
    }
    // 기본: 5~6마디는 1~2마디의 음을 그대로(코드가 달라 강박이 안 맞으면 코드음으로 고친다)
    const copyFrom = !kind && (bar === 4 || bar === 5) ? bar - 4 : -1;
    if (copyFrom >= 0 && notes.some((x) => x.bar === copyFrom)) {
      notes.push(...notes.filter((x) => x.bar === copyFrom).map((x) => ({
        ...x, bar, midi: x.step % 8 === 0 && !p.pcs.includes(x.midi % 12) ? near(chordTones, x.midi) : x.midi,
      })));
      cur = notes[notes.length - 1].midi;
      return;
    }
    // 재즈: 7음·9음(텐션)을 강박 후보에 더한다
    const tension = jazzy ? scale.filter((m) => [10, 11, 14].some((iv) => (p.rootPc + iv) % 12 === m % 12)) : [];
    // 단순한 팝: 모든 음이 근음·3음·5음
    const triad = chordTones.filter((m) => [0, p.iv[1], p.iv[2]].some((iv) => (p.rootPc + iv) % 12 === m % 12));
    const up = bar < 2 || bar === 6 ? 0.62 : 0.38;
    const startLen = notes.length;
    cell.forEach(([step, len], i) => {
      const last = i === cell.length - 1 && isEnd;
      let m;
      if (simple) {
        // 근음·3음·5음을 오가며(같은 음만 되풀이하지 않게 가까운 다른 코드음 위주)
        const others = triad.filter((x) => x !== cur).sort((a, b) => Math.abs(a - cur) - Math.abs(b - cur));
        m = rnd() < 0.25 && triad.includes(cur) ? cur : pick(others.slice(0, 2));
      } else if (step === 0 || step === 8 || last) {
        const pool = !last && tension.length && rnd() < 0.6 ? tension : chordTones;
        m = pick([...pool].sort((a, b) => Math.abs(a - cur) - Math.abs(b - cur)).slice(0, last ? 1 : 2));
      } else {
        const idx = bs.indexOf(near(bs, cur));
        const r = rnd();
        // 서정적: 한두 칸씩 부드럽게 크게 그리기 / 그 밖: 같은 음 15% · 한 칸 70% · 두 칸 15%
        const move = lyrical ? (r < 0.6 ? 1 : 2) : r < 0.15 ? 0 : r < 0.85 ? 1 : 2;
        const dir = rnd() < up ? 1 : -1;
        m = bs[Math.max(0, Math.min(bs.length - 1, idx + dir * move))];
      }
      // 모달: 1·5마디 3박(강박)에 선법 색깔음을 들려준다
      if (modal && (bar === 0 || bar === 4) && step === 8) {
        const colors = scale.filter((x) => x % 12 === colorPc);
        if (colors.length) m = near(colors, cur);
      }
      cur = m;
      notes.push({ bar, step, len, midi: m, vel: lyrical ? (step === 0 ? 0.75 : 0.6) : step % 8 === 0 ? 0.85 : 0.65 });
    });
    // 재즈: 강박 바로 앞 음은 반음 위/아래에서 다가가는 '접근음'으로
    if (jazzy) {
      const mine = notes.slice(startLen);
      mine.forEach((x, i) => {
        const nxt = mine[i + 1];
        if (nxt && (nxt.step === 8) && nxt.step - x.step <= 2) x.midi = nxt.midi + (rnd() < 0.5 ? -1 : 1);
      });
    }
    if (catchy && bar === 0) {
      const si = scale.indexOf(notes[startLen].midi);
      motifShape = notes.slice(startLen).map((x) => scale.indexOf(near(scale, x.midi)) - si);
    }
  });
  // 스윙·셔플(3번) 또는 재즈 7th(7번): 8분 뒷박(16칸 중 2·6·10·14번째)을 셋잇단 느낌으로 늦춘다
  const swing = jazzy || !!melSb()?.feel.some((f) => f === 'swing feel' || f === 'shuffle groove');
  const out = notes.map((x) => {
    const beat = Math.floor(x.step / 4);
    const six = (x.step % 4) + (swing && x.step % 4 === 2 ? 0.66 : 0);
    // 풍성한 화성: 음계로 두 칸 아래(대개 3도) 음을 겹쳐 두 성부로
    const idx = scale.indexOf(x.midi);
    const n = lush && idx >= 2 ? [midiNote(scale[idx - 2]), midiNote(x.midi)] : midiNote(x.midi);
    return { time: `${x.bar}:${beat}:${six}`, n, len: x.len, vel: x.vel, art };
  });
  // 풍성한 화성: 마디마다 코드를 길게 깔아 화음이 꽉 차게
  if (lush) {
    for (let bar = 0; bar < 8; bar++) out.push({ time: `${bar}:0:0`, n: PROG[bar % 4].chord, len: 16, vel: 0.3, art: 1 });
  }
  return out;
}

// 화음(풍성한 화성)도 낼 수 있게 PolySynth로 만든다
function melSynth(kind, out) {
  if (kind === 'bell') {
    const s = new Tone.PolySynth(Tone.FMSynth, { harmonicity: 3.01, modulationIndex: 10, envelope: { attack: 0.001, decay: 0.7, sustain: 0.05, release: 0.9 },
      modulationEnvelope: { attack: 0.002, decay: 0.3, sustain: 0, release: 0.3 } }).connect(out);
    s.maxPolyphony = 12;
    s.volume.value = -6;
    return [s];
  }
  if (kind === 'soft') {
    const s = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'triangle' }, envelope: { attack: 0.03, decay: 0.3, sustain: 0.55, release: 0.7 } }).connect(out);
    s.maxPolyphony = 12;
    s.volume.value = -2;
    return [s];
  }
  // 신스 리드: 톱니파를 저역 통과 필터로 둥글게 + 짧은 딜레이
  const delay = new Tone.FeedbackDelay({ delayTime: '8n.', feedback: 0.22, wet: 0.16 }).connect(out);
  const filter = new Tone.Filter({ frequency: 2400, type: 'lowpass', rolloff: -24 }).connect(delay);
  const s = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'sawtooth' }, envelope: { attack: 0.01, decay: 0.2, sustain: 0.45, release: 0.35 } }).connect(filter);
  s.maxPolyphony = 12;
  s.volume.value = -8;
  return [s, filter, delay];
}

function melDispose() {
  if (!mel) return;
  const m = mel;
  mel = null;
  m.channel.volume.rampTo(-Infinity, 0.1);
  setTimeout(() => [m.part, ...m.nodes, m.channel].forEach((n) => { try { n.dispose(); } catch {} }), 300);
}

// 멜로디를 다시 만들어야 하는지 판단하는 값: 씨앗·소리·코드 진행·BPM·7번·2번·3번 리듬
const melSig = () => JSON.stringify([melCfg.seed, melSoundNow(), HARMONY.prog, HARMONY.shift, +el.bpm.value, melPicks(), melSb()?.feel ?? []]);

// 멜로디 파트를 (다시) 만든다
let melBuildSeq = 0; // 샘플을 받는 동안 다시 불리면 늦게 끝난 이전 것은 버린다
async function melBuild() {
  const seq = ++melBuildSeq;
  melDispose();
  const kind = melSoundNow();
  const channel = new Tone.Channel({ volume: -6 + (kind.startsWith('inst:') ? MEL_INST_GAIN[kind.slice(5)] ?? 0 : 0) }).connect(master);
  let synth, nodes;
  if (kind.startsWith('inst:')) {
    try {
      ({ voice: synth, nodes } = await melInstVoice(kind.slice(5), channel));
    } catch (e) {
      console.warn('melody', e.message);
      flash(`${melSoundName(kind)} 소리를 불러오지 못해 신스 리드로 연주합니다.`, 'warn');
      nodes = melSynth('lead', channel);
      synth = nodes[0];
    }
    if (seq !== melBuildSeq || !melCfg.on) { [...nodes, channel].forEach((n) => { try { n.dispose(); } catch {} }); return; }
  } else {
    nodes = melSynth(kind, channel);
    synth = nodes[0];
  }
  const part = new Tone.Part((time, ev) => {
    try { synth.triggerAttackRelease(ev.n, Tone.Time('16n').toSeconds() * ev.len * (ev.art ?? 0.92), time, ev.vel); } catch (e) { console.warn('melody', e.message); }
  }, makeMelody(melCfg.seed));
  part.loop = true;
  part.loopEnd = '8m';
  part.start(0);
  mel = { channel, nodes, part, sig: melSig(), baseVol: channel.volume.value };
  if (typeof flowApplyNow === 'function') flowApplyNow(); // 곡 흐름 중이면 지금 구간에 맞춰 켜고 끈다
  renderMelody();
}

const anyInstrumentOn = () => Object.values(state).some((s) => s.active);

async function melodyOn() {
  await initAudio();
  melCfg.on = true;
  saveMel();
  melBuild();
  if (!isRunning()) startTransport();
  renderMelody();
}
function melodyOff() {
  melCfg.on = false;
  saveMel();
  melDispose();
  if (!anyInstrumentOn()) stopTransport();
  renderMelody();
}
// 코드 진행·키(applyHarmony)·BPM·Style Builder(commit)가 바뀌면 부른다. 멜로디에 영향이 있을 때만 다시 만든다
function refreshMelody() {
  renderMelody();
  if (melCfg.on && started && (!mel || mel.sig !== melSig())) melBuild();
}

const melEl = { on: $('#mel-on'), sound: $('#mel-sound'), seed: $('#mel-new'), from: $('#mel-from') };
function renderMelody() {
  melEl.on.setAttribute('aria-pressed', String(melCfg.on));
  melEl.on.textContent = melCfg.on ? '♪ 켜짐' : '♪ 켜기';
  melEl.sound.value = melCfg.sound;
  // 라벨 옆에 Style Builder에서 반영 중인 것을 짧게: '7번: 서정적·모달 · 자동: 벨'
  const picks = melPicks().map((h) => MEL_STYLE[h]);
  const parts = [picks.length ? `7번: ${picks.join('·')}` : '', melCfg.sound === 'auto' ? `소리: ${melSoundName(melSoundNow())}` : ''].filter(Boolean);
  melEl.from.textContent = parts.join(' · ');
  melEl.from.title = 'Suno Style Builder 7번(멜로디·화성)과 2번(주 악기)에서 고른 값을 반영합니다';
}
Object.entries(MEL_SOUNDS).forEach(([v, ko]) => melEl.sound.append(new Option(ko, v)));
melEl.on.onclick = () => (melCfg.on ? melodyOff() : melodyOn());
melEl.sound.onchange = () => { melCfg.sound = melEl.sound.value; saveMel(); refreshMelody(); };
melEl.seed.onclick = () => {
  melCfg.seed = (Math.random() * 2 ** 31) >>> 0;
  saveMel();
  if (melCfg.on) melBuild(); else melodyOn();
  flash('새 멜로디를 만들었습니다.', 'ok');
};
// BPM을 바꾸면 음 밀도(빠른 곡은 덜 촘촘하게)가 달라지므로 놓은 뒤 다시 만든다
el.bpm.addEventListener('change', refreshMelody);
renderMelody();
