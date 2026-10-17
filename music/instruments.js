/* 악기 정의.
 * 모든 악기는 같은 4마디 코드 진행(Am7 - Fmaj7 - Cmaj7 - G7)과 같은 템포 위에서 반복 연주되므로
 * 어떤 조합으로 섞어도 박자·화성이 맞는다.
 * 실제 악기(피아노·색소폰·기타·첼로 등)는 tonejs-instruments 샘플을, 드럼·신스·DJ 계열은 Tone.js 합성음을 쓴다.
 *
 * 각 악기 정의:
 *   create(out) -> { ready: Promise, play(time, ev), start?(time), stop?(time) }
 *   events()    -> Tone.Part 이벤트 배열 ({ time: 'bar:beat:sixteenth', ... })
 */

// jsdelivr 주소는 '@'가 들어가는데 Tone.js가 이를 %40으로 인코딩해 400이 나므로 GitHub Pages 원본을 쓴다.
const SAMPLE_BASE = 'https://nbrosowsky.github.io/tonejs-instruments/samples/';

// 4마디(한 마디에 코드 하나) 진행. 내용은 setHarmony()가 코드 이름으로부터 만들어 채운다.
// 다른 코드가 배열 참조를 들고 있으므로 배열은 새로 만들지 않고 각 칸의 내용만 바꾼다.
const PROG = [{}, {}, {}, {}];

const tr = (note, semis) => Tone.Frequency(note).transpose(semis).toNote();
const trAll = (notes, semis) => notes.map((n) => tr(n, semis));
const T = (bar, step) => `${bar}:${Math.floor(step / 4)}:${step % 4}`;

// 'As3' 같은 파일명 표기를 Tone.Sampler 키('A#3')로 변환
function sampler(dir, notes, opts = {}) {
  const urls = {};
  notes.forEach((n) => (urls[n.replace('s', '#')] = `${n}.mp3`));
  let s;
  const ready = new Promise((resolve, reject) => {
    s = new Tone.Sampler({ urls, baseUrl: SAMPLE_BASE + dir + '/', onload: resolve, onerror: reject, ...opts });
  });
  return { s, ready };
}

// 16스텝 문자열 패턴 → 이벤트. '|'와 공백은 가독성용. 4마디 길이로 반복.
// fn(char, bar, step) 이 이벤트(또는 이벤트 배열)를 돌려준다.
function seq(pattern, fn, bars = 4) {
  const s = pattern.replace(/[\s|]/g, '');
  const out = [];
  for (let b = 0; b < bars; b++) {
    for (let i = 0; i < 16; i++) {
      const c = s[(b * 16 + i) % s.length];
      if (!c || c === '.') continue;
      const ev = fn(c, b, i);
      if (ev) out.push(...[].concat(ev));
    }
  }
  return out;
}

// 드럼 패턴: X=강, x=보통, o=약(고스트), r=롤(16분음표 3연타)
// swing16: 홀수 16분음표를 밀어냄, swing8: 8분 뒷박을 밀어냄(재즈 스윙)
function drumSteps(map, { swing16 = 0, swing8 = 0 } = {}) {
  const out = [];
  for (const [voice, pat] of Object.entries(map)) {
    out.push(
      ...seq(pat, (c, b, i) => {
        let six = i % 4;
        if (i % 2 === 1) six += swing16;
        if (i % 4 === 2) six += swing8;
        const beat = Math.floor(i / 4);
        if (c === 'r') return [0, 1, 2].map((k) => ({ time: `${b}:${beat}:${six + k / 3}`, v: voice, vel: 0.5 + k * 0.1, bar: b }));
        return { time: `${b}:${beat}:${six}`, v: voice, vel: { X: 1, x: 0.75, o: 0.35 }[c] ?? 0.75, bar: b };
      })
    );
  }
  return out;
}

/* ---------------- 드럼 키트 (합성) ---------------- */
function makeKit(out, o = {}) {
  const bus = new Tone.Gain(o.gain ?? 1);
  if (o.fx) bus.chain(...o.fx, out);
  else bus.connect(out);

  const kick = new Tone.MembraneSynth({
    pitchDecay: o.kickPD ?? 0.05, octaves: o.kickOct ?? 6,
    envelope: { attack: 0.001, decay: o.kickDecay ?? 0.4, sustain: 0, release: 0.1 }, volume: o.kickVol ?? 0,
  }).connect(bus);

  const snareF = new Tone.Filter(o.snareTone ?? 1800, 'highpass').connect(bus);
  const snare = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: o.snareDecay ?? 0.18, sustain: 0 }, volume: o.snareVol ?? -8 }).connect(snareF);
  const snareBody = new Tone.MembraneSynth({ pitchDecay: 0.01, octaves: 2, envelope: { attack: 0.001, decay: 0.12, sustain: 0 }, volume: (o.snareVol ?? -8) - 2 }).connect(bus);

  const hatF = new Tone.Filter(o.hatTone ?? 8000, 'highpass').connect(bus);
  const hat = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: o.hatDecay ?? 0.04, sustain: 0 }, volume: o.hatVol ?? -16 }).connect(hatF);
  const ohat = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.3, sustain: 0 }, volume: (o.hatVol ?? -16) - 2 }).connect(hatF);

  const clapF = new Tone.Filter({ frequency: 1400, type: 'bandpass', Q: 1.2 }).connect(bus);
  const clap = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.14, sustain: 0 }, volume: o.clapVol ?? -2 }).connect(clapF);

  const rim = new Tone.MembraneSynth({ pitchDecay: 0.004, octaves: 1, envelope: { attack: 0.001, decay: 0.05, sustain: 0 }, volume: o.rimVol ?? -10 }).connect(bus);

  const ride = new Tone.MetalSynth({
    envelope: { attack: 0.001, decay: 0.9, release: 0.3 }, harmonicity: 5.1, modulationIndex: 20, resonance: 6000, octaves: 1, volume: o.rideVol ?? -30,
  }).connect(bus);

  const swishF = new Tone.Filter({ frequency: 3500, type: 'bandpass', Q: 0.6 }).connect(bus);
  const swish = new Tone.NoiseSynth({ noise: { type: 'pink' }, envelope: { attack: 0.04, decay: 0.25, sustain: 0 }, volume: -12 }).connect(swishF);

  return {
    hit(v, time, vel, bar) {
      switch (v) {
        case 'k': kick.triggerAttackRelease(o.kickNote ?? 'C1', '8n', time, vel); break;
        case 'k8': kick.triggerAttackRelease(PROG[bar].root, '2n', time, vel); break; // 808: 코드 루트를 따라감
        case 's': snare.triggerAttackRelease('16n', time, vel); snareBody.triggerAttackRelease('G2', '16n', time, vel * 0.8); break;
        case 'h': hat.triggerAttackRelease('32n', time, vel); break;
        case 'oh': ohat.triggerAttackRelease('8n', time, vel); break;
        case 'c': [0, 0.012, 0.024].forEach((d, i) => clap.triggerAttackRelease('32n', time + d, vel * (i === 2 ? 1 : 0.6))); break;
        case 'rim': rim.triggerAttackRelease('A4', '32n', time, vel); break;
        case 'ride': ride.triggerAttackRelease(280, '8n', time, vel); break;
        case 'sw': swish.triggerAttackRelease('8n', time, vel); break;
      }
    },
  };
}

function drumInstrument(kitOpts, pattern, swing) {
  return {
    create(out) {
      const kit = makeKit(out, typeof kitOpts === 'function' ? kitOpts() : kitOpts);
      return { ready: Promise.resolve(), play: (time, ev) => kit.hit(ev.v, time, ev.vel, ev.bar) };
    },
    events: () => drumSteps(pattern, swing),
  };
}

/* ---------------- 공용 이펙트 헬퍼 ---------------- */
const rev = (decay, wet) => new Tone.Reverb({ decay, wet });
const crusher = (bits, wet) => {
  const c = new Tone.BitCrusher(bits);
  c.wet.value = wet;
  return c;
};

// 샘플러 기반 악기의 공통 골격: 노드 체인 연결 + 정지 시 releaseAll
function samplerInstrument({ build, events }) {
  return {
    create(out) {
      const parts = build(out);
      return {
        ready: Promise.all(parts.ready),
        play: (time, ev) => parts.play(time, ev),
        stop: (time) => parts.voices.forEach((v) => v.releaseAll(time)),
      };
    },
    events,
  };
}

/* ---------------- 코드 진행(화성) ----------------
 * 코드 이름 4개(예: ['Dm7','G7','Cmaj7','A7'])만 주면 보이싱·베이스·기타 코드·멜로디·대선율·워킹 베이스를 만든다.
 * shift는 곡 분석 결과에 맞춰 반음 단위로 옮길 때 쓴다(기본 진행은 A minor 기준). */
const DEFAULT_PROG = ['Am7', 'Fmaj7', 'Cmaj7', 'G7'];

const PITCH = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
const QUALITY = {
  '': [0, 4, 7], m: [0, 3, 7], sus4: [0, 5, 7],
  7: [0, 4, 7, 10], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10],
  9: [0, 4, 7, 10, 14], maj9: [0, 4, 7, 11, 14], m9: [0, 3, 7, 10, 14],
};
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const midiNote = (m) => `${NOTE_NAMES[m % 12]}${Math.floor(m / 12) - 1}`;
const above = (pc, lo) => lo + ((((pc - lo) % 12) + 12) % 12); // lo 이상에서 그 음이름이 처음 나오는 음

function parseChord(sym) {
  const m = /^([A-G][b#]?)(.*)$/.exec(sym);
  if (!m || !(m[1] in PITCH) || !(m[2] in QUALITY)) throw new Error(`지원하지 않는 코드: ${sym}`);
  return { root: PITCH[m[1]], quality: m[2], iv: QUALITY[m[2]] };
}

function buildChord(sym, shift, sharpKey) {
  const c = parseChord(sym);
  const root = (c.root + shift + 120) % 12;
  const pcs = c.iv.map((i) => (root + i) % 12);
  // 4성 보이싱(F3~E4): 3화음은 맨 아래 음을 옥타브 위에 한 번 더.
  // 9th 코드는 5음을 빼고 9음을 맨 위에 둔다(한 옥타브 안에 몰면 음이 뭉쳐 탁해짐)
  const ninth = c.iv.length > 4;
  const tones = pcs.filter((_, i) => !ninth || (c.iv[i] !== 7 && c.iv[i] !== 14));
  const chord = tones.map((pc) => above(pc, 53)).sort((x, y) => x - y);
  if (ninth) chord.push(above((root + 14) % 12, chord[chord.length - 1] + 1));
  else if (chord.length < 4) chord.push(chord[0] + 12);
  const g = above(root, 40); // 기타 저음현 근음 E2~D#3
  const guitar = [...new Set([g, g + 7, ...chord.filter((n) => n > g + 7)])].sort((x, y) => x - y);
  const spelled = NOTE_NAMES[root];
  const FLAT = { 'A#': 'Bb', 'C#': 'Db', 'D#': 'Eb', 'F#': 'Gb', 'G#': 'Ab' };
  return {
    // 원래 키 그대로면 적힌 표기를 쓰고, 옮겼으면 키에 맞춰 #/b 표기를 통일
    name: shift === 0 ? sym : (sharpKey ? spelled : FLAT[spelled] ?? spelled) + c.quality,
    root: midiNote(above(root, 28)), // 베이스 근음 E1~D#2
    chord: chord.map(midiNote),
    guitar: guitar.map(midiNote),
    power: [g, g + 7, g + 12].map(midiNote),
    funk: chord.slice(-3).map(midiNote),
    pcs, rootPc: root, iv: c.iv,
  };
}

// 그 마디 코드톤만으로 이루어진 음 사다리(lo~hi). 멜로디는 사다리의 '몇 번째 칸'으로 적어 두어 어떤 진행에도 맞는다.
const ladder = (p, lo, hi) => {
  const out = [];
  for (let m = lo; m <= hi; m++) if (p.pcs.includes(m % 12)) out.push(m);
  return out;
};
const MELODY_T = [ // [마디, 박:16분, 사다리 칸, 길이] — 사다리는 E4부터
  [0, '0:2', 1, '8n'], [0, '1:0', 2, '8n'], [0, '1:2', 3, '4n'], [0, '2:2', 4, '4n.'],
  [1, '0:0', 3, '4n'], [1, '1:0', 2, '8n'], [1, '1:2', 1, '8n'], [1, '2:0', 2, '2n'],
  [2, '0:2', 1, '8n'], [2, '1:0', 0, '8n'], [2, '1:2', 1, '8n'], [2, '2:0', 3, '4n'], [2, '3:0', 2, '8n'], [2, '3:2', 1, '8n'],
  [3, '0:0', 3, '4n.'], [3, '1:2', 2, '8n'], [3, '2:0', 1, '2n'],
];
const COUNTER_T = [ // 첼로 대선율, 사다리는 D3부터
  [0, '0:0', 3, '2n'], [0, '2:0', 2, '2n'],
  [1, '0:0', 2, '2n.'], [1, '3:0', 3, '4n'],
  [2, '0:0', 2, '2n'], [2, '2:0', 1, '2n'],
  [3, '0:0', 1, '2n'], [3, '2:0', 3, '2n'],
];
const MELODY = [];
const COUNTER = [];
const WALK = [[], [], [], []];

let HARMONY = { prog: null, shift: 0 };
function setHarmony(prog, shift = 0) {
  HARMONY = { prog, shift };
  const sharpKey = [4, 11, 6, 1].includes((((9 + shift) % 12) + 12) % 12); // E·B·F#·C# 단조 계열
  prog.forEach((sym, i) => Object.assign(PROG[i], buildChord(sym, shift, sharpKey)));

  const fromT = (tpl, lo, hi) => tpl.map(([bar, pos, idx, d]) => {
    const l = ladder(PROG[bar], lo, hi);
    return { time: `${bar}:${pos}`, n: midiNote(l[Math.min(idx, l.length - 1)]), d };
  });
  MELODY.splice(0, MELODY.length, ...fromT(MELODY_T, 64, 84));
  COUNTER.splice(0, COUNTER.length, ...fromT(COUNTER_T, 50, 70));

  // 워킹 베이스: 근음 → 3음 → 5음 → 다음 코드 근음의 반음 아래(접근음)
  PROG.forEach((p, i) => {
    const r = above(p.rootPc, 33); // A1~G#2
    const next = above(PROG[(i + 1) % 4].rootPc, 33);
    const fifth = r + p.iv[2];
    const approach = Math.abs(next - 1 - fifth) <= Math.abs(next + 1 - fifth) ? next - 1 : next + 1;
    WALK[i] = [r, r + p.iv[1], fifth, approach].map(midiNote);
  });
}
setHarmony(DEFAULT_PROG, 0);

/* ================================================================ */

const CATEGORIES = [
  { id: 'dj', name: 'DJ·샘플', color: '#f472b6' },
  { id: 'wind', name: '관악기', color: '#fbbf24' },
  { id: 'guitar', name: '기타', color: '#fb923c' },
  { id: 'drums', name: '드럼', color: '#f87171' },
  { id: 'bass', name: '베이스', color: '#a78bfa' },
  { id: 'synth', name: '전자악기', color: '#22d3ee' },
  { id: 'perc', name: '타악기', color: '#facc15' },
  { id: 'keys', name: '피아노', color: '#60a5fa' },
  { id: 'strings', name: '현악기', color: '#34d399' },
];

const INSTRUMENTS = [
  /* ---------- DJ·샘플 ---------- */
  {
    id: 'sample', cat: 'dj', en: 'Sample', ko: '샘플',
    desc: '녹음된 소리를 재가공하여 리듬·멜로디·효과음 등의 음악 요소로 활용',
    ...samplerInstrument({
      build(out) {
        const p = sampler('piano', ['A2', 'Ds3', 'A3', 'Ds4', 'A4', 'Ds5', 'A5'], { release: 0.08, volume: -6 });
        const wow = new Tone.Vibrato({ frequency: 0.7, depth: 0.08 });
        p.s.chain(new Tone.Filter(2200, 'lowpass'), crusher(6, 0.35), wow, out);
        return {
          ready: [p.ready], voices: [p.s],
          play: (time, ev) => p.s.triggerAttackRelease(ev.n, ev.d, time, ev.vel),
        };
      },
      // 소울 샘플을 잘게 잘라 붙인 듯한 촙 패턴
      events: () => seq('X..x..x...x...o.', (c, b, i) => ({
        time: T(b, i), n: trAll(PROG[b].chord, 12), d: c === 'X' ? '8n.' : '16n', vel: c === 'o' ? 0.45 : c === 'X' ? 0.9 : 0.7,
      })),
    }),
  },
  {
    id: 'turntable', cat: 'dj', en: 'Turntable', ko: '턴테이블',
    desc: '레코드 스크래칭과 샘플 조작으로 힙합 특유의 리듬과 효과음 표현',
    create(out) {
      const osc = new Tone.Oscillator(300, 'sawtooth').start();
      const noise = new Tone.Noise('pink').start();
      const nGain = new Tone.Gain(0.35);
      const filt = new Tone.Filter({ frequency: 1200, type: 'bandpass', Q: 1.5 });
      const amp = new Tone.Gain(0);
      osc.connect(filt); noise.connect(nGain); nGain.connect(filt);
      filt.chain(amp, new Tone.Gain(0.8), out);
      // 앞으로/뒤로 긁는 한 번의 스트로크: 피치가 올라갔다(전진) 내려감(후진)
      const stroke = (t, len, forward, cut) => {
        const [a, b] = forward ? [140, 900] : [900, 140];
        osc.frequency.setValueAtTime(a, t);
        osc.frequency.exponentialRampToValueAtTime(b, t + len * 0.95);
        filt.frequency.setValueAtTime(a * 3, t);
        filt.frequency.exponentialRampToValueAtTime(b * 3, t + len * 0.95);
        amp.gain.setValueAtTime(0, t);
        amp.gain.linearRampToValueAtTime(0.9, t + 0.008);
        amp.gain.setValueAtTime(0.9, t + len * (cut ? 0.5 : 0.85));
        amp.gain.linearRampToValueAtTime(0, t + len * (cut ? 0.55 : 1));
      };
      return {
        ready: Promise.resolve(),
        play(time, ev) {
          const len = Tone.Time(ev.len).toSeconds();
          for (let k = 0; k < ev.strokes; k++) stroke(time + k * len, len, k % 2 === 0, ev.kind === 'chirp');
        },
        stop(time) {
          amp.gain.cancelScheduledValues(time);
          amp.gain.setValueAtTime(0, time);
        },
      };
    },
    events: () => [
      { time: '0:3:0', kind: 'baby', strokes: 4, len: '16n' },
      { time: '1:2:2', kind: 'chirp', strokes: 2, len: '16n' },
      { time: '1:3:2', kind: 'chirp', strokes: 2, len: '16n' },
      { time: '2:3:0', kind: 'baby', strokes: 4, len: '16n' },
      { time: '3:1:0', kind: 'baby', strokes: 2, len: '8n' },
      { time: '3:2:2', kind: 'chirp', strokes: 2, len: '16n' },
      { time: '3:3:0', kind: 'baby', strokes: 6, len: '32n' },
      { time: '3:3:3', kind: 'baby', strokes: 2, len: '32n' },
    ],
  },
  {
    id: 'vinyl', cat: 'dj', en: 'Vinyl', ko: '바이닐',
    desc: '레코드 특유의 잡음과 따뜻한 질감으로 복고풍·Lo-fi 분위기 연출',
    create(out) {
      // 무작위 크래클(딱딱 튀는 소리) 4초 버퍼를 만들어 반복 재생
      const sr = Tone.getContext().sampleRate;
      const data = new Float32Array(sr * 4);
      for (let i = 0; i < data.length; i++) {
        if (Math.random() < 0.0005) {
          const a = (0.2 + Math.random() * 0.8) * (Math.random() < 0.12 ? 1 : 0.35);
          const dec = 15 + Math.random() * 90;
          for (let j = 0; j < dec * 4 && i + j < data.length; j++) data[i + j] += a * (Math.random() * 2 - 1) * Math.exp(-j / dec);
        }
      }
      const crackle = new Tone.Player(Tone.ToneAudioBuffer.fromArray(data));
      crackle.loop = true;
      crackle.chain(new Tone.Filter(1200, 'highpass'), new Tone.Gain(0.9), out);
      const hiss = new Tone.Noise('pink');
      hiss.chain(new Tone.Filter(2500, 'bandpass'), new Tone.Gain(0.025), out);
      const rumble = new Tone.Noise('brown');
      rumble.chain(new Tone.Filter(90, 'lowpass'), new Tone.Gain(0.12), out);
      const srcs = [crackle, hiss, rumble];
      return {
        ready: Promise.resolve(),
        play() {},
        start: (time) => srcs.forEach((s) => s.state !== 'started' && s.start(time)),
        stop: (time) => srcs.forEach((s) => s.state === 'started' && s.stop(time)),
      };
    },
    events: () => [],
  },

  /* ---------- 관악기 ---------- */
  {
    id: 'brass', cat: 'wind', en: 'Brass', ko: '브라스',
    desc: '트럼펫·트롬본 등 금관악기의 밝고 힘찬 음색으로 경쾌함과 웅장함 연출',
    ...samplerInstrument({
      build(out) {
        const tp = sampler('trumpet', ['F3', 'A3', 'C4', 'Ds4', 'G4', 'As4', 'D5', 'F5'], { release: 0.2, volume: -4 });
        const tb = sampler('trombone', ['As1', 'Cs2', 'F2', 'Gs2', 'C3', 'Ds3', 'F3', 'Gs3', 'C4'], { release: 0.2, volume: -4 });
        const fx = rev(1.6, 0.2);
        tp.s.connect(fx); tb.s.connect(fx); fx.connect(out);
        return {
          ready: [tp.ready, tb.ready], voices: [tp.s, tb.s],
          play(time, ev) {
            const c = PROG[ev.bar].chord;
            tp.s.triggerAttackRelease([c[2], c[3]], ev.d, time, ev.vel);
            tb.s.triggerAttackRelease([tr(PROG[ev.bar].root, 12), c[0]], ev.d, time, ev.vel);
          },
        };
      },
      events: () => seq('X.....x...X.....', (c, bar, i) => ({ time: T(bar, i), bar, d: i === 10 ? '4n' : '8n', vel: c === 'X' ? 0.95 : 0.75 })),
    }),
  },
  {
    id: 'sax', cat: 'wind', en: 'Sax', ko: '색소폰',
    desc: '풍부하고 표현력 있는 음색으로 재즈·소울·팝의 멜로디 연주',
    ...samplerInstrument({
      build(out) {
        const sx = sampler('saxophone', ['As3', 'Cs4', 'E4', 'G4', 'As4', 'Cs5', 'E5', 'G5'], { release: 0.35, volume: -3 });
        sx.s.chain(rev(2, 0.22), out);
        return { ready: [sx.ready], voices: [sx.s], play: (time, ev) => sx.s.triggerAttackRelease(ev.n, ev.d, time, 0.8) };
      },
      events: () => MELODY,
    }),
  },
  {
    id: 'orchestra', cat: 'wind', en: 'Orchestra', ko: '오케스트라',
    desc: '현악기·관악기·타악기를 결합하여 웅장하고 극적인 음악 표현',
    ...samplerInstrument({
      build(out) {
        const vn = sampler('violin', ['G3', 'A3', 'C4', 'E4', 'G4', 'A4', 'C5', 'E5', 'G5', 'A5'], { attack: 0.25, release: 1.2, volume: -8 });
        const vc = sampler('cello', ['C2', 'E2', 'G2', 'As2', 'Cs3', 'E3', 'G3'], { attack: 0.2, release: 1.2, volume: -6 });
        const hn = sampler('french-horn', ['A1', 'C2', 'Ds2', 'G2', 'D3', 'F3', 'A3', 'C4'], { release: 0.8, volume: -6 });
        const timp = new Tone.MembraneSynth({ pitchDecay: 0.08, octaves: 1.5, envelope: { attack: 0.002, decay: 1.4, sustain: 0, release: 0.5 }, volume: -6 });
        const hall = rev(4.5, 0.35); hall.connect(out);
        [vn.s, vc.s, hn.s, timp].forEach((v) => v.connect(hall));
        return {
          ready: [vn.ready, vc.ready, hn.ready], voices: [vn.s, vc.s, hn.s],
          play(time, ev) {
            const p = PROG[ev.bar];
            if (ev.k === 'chord') {
              vn.s.triggerAttackRelease(trAll(p.chord.slice(1), 12), '1m', time, 0.7);
              vc.s.triggerAttackRelease([tr(p.root, 12), tr(p.root, 19)], '1m', time, 0.8);
              hn.s.triggerAttackRelease([p.chord[0], p.chord[2]], '2n', time, 0.75);
            } else if (ev.k === 'horn') {
              hn.s.triggerAttackRelease([p.chord[1], p.chord[3]], '2n', time, 0.6);
            } else {
              timp.triggerAttackRelease(tr(p.root, 12), '4n', time, ev.vel);
            }
          },
        };
      },
      events: () => [
        ...[0, 1, 2, 3].map((bar) => ({ time: `${bar}:0:0`, bar, k: 'chord' })),
        ...[0, 1, 2, 3].map((bar) => ({ time: `${bar}:2:0`, bar, k: 'horn' })),
        ...[0, 1, 2].map((bar) => ({ time: `${bar}:0:0`, bar, k: 'timp', vel: 0.9 })),
        // 마지막 마디는 팀파니 롤로 다음 순환을 끌어올림
        ...[8, 9, 10, 11, 12, 13, 14, 15].map((s, i) => ({ time: T(3, s), bar: 3, k: 'timp', vel: 0.35 + i * 0.07 })),
        { time: '3:0:0', bar: 3, k: 'timp', vel: 0.9 },
      ],
    }),
  },

  /* ---------- 기타 ---------- */
  {
    id: 'ambient-guitar', cat: 'guitar', en: 'Ambient Guitar', ko: '앰비언트 기타',
    desc: '리버브와 딜레이를 활용하여 공간감 있고 몽환적인 기타 사운드 표현',
    ...samplerInstrument({
      build(out) {
        const g = sampler('guitar-electric', ['E2', 'A2', 'C3', 'Ds3', 'Fs3', 'A3', 'C4', 'Ds4', 'Fs4', 'A4', 'C5', 'Ds5', 'Fs5', 'A5'], { release: 1.5, volume: 6 });
        g.s.chain(new Tone.Chorus(0.6, 3, 0.4).start(), new Tone.PingPongDelay('8n.', 0.45), rev(7, 0.55), out);
        return { ready: [g.ready], voices: [g.s], play: (time, ev) => g.s.triggerAttackRelease(ev.n, '2n', time, 0.6) };
      },
      events: () => seq('x.....x.....x.x.', (c, bar, i) => {
        const c4 = PROG[bar].chord;
        const n = { 0: tr(c4[3], 12), 6: tr(c4[1], 12), 12: tr(c4[2], 12), 14: c4[3] }[i];
        return { time: T(bar, i), n };
      }),
    }),
  },
  {
    id: 'electric-guitar', cat: 'guitar', en: 'Electric Guitar', ko: '일렉트릭 기타',
    desc: '앰프와 이펙터를 활용해 강렬하거나 선명한 기타 사운드 표현',
    ...samplerInstrument({
      build(out) {
        const g = sampler('guitar-electric', ['E2', 'A2', 'C3', 'Ds3', 'Fs3', 'A3', 'C4', 'Ds4'], { release: 0.12, volume: -10 });
        g.s.chain(new Tone.Distortion(0.6), new Tone.Filter(3800, 'lowpass'), rev(1.2, 0.15), out);
        return { ready: [g.ready], voices: [g.s], play: (time, ev) => g.s.triggerAttackRelease(PROG[ev.bar].power, ev.d, time, ev.vel) };
      },
      events: () => seq('X.x.x.x.X.x.x.xx', (c, bar, i) => ({ time: T(bar, i), bar, d: '16n', vel: c === 'X' ? 0.95 : 0.65 })),
    }),
  },
  {
    id: 'funk-guitar', cat: 'guitar', en: 'Funk Guitar', ko: '펑크 기타',
    desc: '짧고 끊어 치는 코드와 싱코페이션으로 통통 튀는 그루브 형성',
    ...samplerInstrument({
      build(out) {
        const g = sampler('guitar-electric', ['Fs3', 'A3', 'C4', 'Ds4', 'Fs4', 'A4'], { release: 0.04, volume: -4 });
        g.s.chain(new Tone.AutoWah({ baseFrequency: 300, octaves: 4, sensitivity: -30, Q: 3 }), new Tone.Filter(5000, 'lowpass'), out);
        return { ready: [g.ready], voices: [g.s], play: (time, ev) => g.s.triggerAttackRelease(PROG[ev.bar].funk, 0.07, time, ev.vel) };
      },
      events: () => seq('x.ox.xo.x.ox.xox', (c, bar, i) => ({ time: T(bar, i), bar, vel: c === 'o' ? 0.3 : 0.85 })),
    }),
  },
  {
    id: 'guitar', cat: 'guitar', en: 'Guitar', ko: '기타',
    desc: '코드 반주와 멜로디 연주에 활용되며 다양한 음악 장르에 사용',
    ...samplerInstrument({
      build(out) {
        const g = sampler('guitar-acoustic', ['E2', 'G2', 'As2', 'Cs3', 'E3', 'G3', 'As3', 'Cs4', 'E4', 'G4'], { release: 0.6, volume: -4 });
        g.s.chain(rev(1.5, 0.15), out);
        return {
          ready: [g.ready], voices: [g.s],
          // 다운 스트럼은 저음→고음, 업 스트럼은 고음 쪽 몇 줄만 역순으로
          play(time, ev) {
            const notes = PROG[ev.bar].guitar;
            const seqNotes = ev.up ? notes.slice(-3).reverse() : notes;
            seqNotes.forEach((n, k) => g.s.triggerAttackRelease(n, '4n', time + k * (ev.up ? 0.01 : 0.014), ev.up ? 0.45 : 0.75));
          },
        };
      },
      events: () => seq('D...D.u...u.D.u.', (c, bar, i) => ({ time: T(bar, i), bar, up: c === 'u' })),
    }),
  },
  {
    id: 'nylon-guitar', cat: 'guitar', en: 'Nylon Guitar', ko: '나일론 기타',
    desc: '나일론 줄의 부드럽고 따뜻한 음색으로 클래식·보사노바 음악에 활용',
    ...samplerInstrument({
      build(out) {
        const g = sampler('guitar-nylon', ['E2', 'Fs2', 'A2', 'D3', 'Fs3', 'A3', 'Cs4', 'E4', 'A4', 'Cs5'], { release: 0.5, volume: -2 });
        g.s.chain(rev(1.8, 0.2), out);
        return {
          ready: [g.ready], voices: [g.s],
          play(time, ev) {
            const p = PROG[ev.bar];
            if (ev.thumb) g.s.triggerAttackRelease(tr(p.root, 12), '4n', time, 0.75);
            else p.chord.slice(1).forEach((n, k) => g.s.triggerAttackRelease(n, '8n', time + k * 0.006, 0.55));
          },
        };
      },
      // 보사노바: 엄지는 1·3박 베이스, 손가락은 엇박 코드
      events: () => seq('T..c..c.T.c..c..', (c, bar, i) => ({ time: T(bar, i), bar, thumb: c === 'T' })),
    }),
  },

  /* ---------- 드럼 ---------- */
  {
    id: 'boombap', cat: 'drums', en: 'Boom Bap Drums', ko: '붐뱁 드럼',
    desc: '묵직한 킥과 강한 스네어를 중심으로 붐뱁 힙합 특유의 리듬 표현',
    ...drumInstrument(
      () => ({ kickDecay: 0.5, kickPD: 0.03, kickVol: -2, snareTone: 1200, snareDecay: 0.22, snareVol: -4, hatVol: -18, fx: [crusher(8, 0.3), new Tone.Filter(9000, 'lowpass')] }),
      { k: 'X.....x...X..x..', s: '....X.......X...', h: 'x.x.x.x.x.x.x.xo' },
      { swing16: 0.3 }
    ),
  },
  {
    id: 'brushes', cat: 'drums', en: 'Brushes', ko: '브러시',
    desc: '드럼을 부드럽게 쓸거나 두드려 섬세하고 자연스러운 재즈 리듬 표현',
    ...drumInstrument(
      { gain: 2.5, kickVol: -10, kickDecay: 0.3, snareVol: -18, snareDecay: 0.1, rideVol: -26 },
      { sw: 'x...x...x...x...', ride: 'x...x.x.x...x.x.', s: '....o.......o...', k: 'o.......o.......' },
      { swing8: 0.67 }
    ),
  },
  {
    id: 'drum-machine', cat: 'drums', en: 'Drum Machine', ko: '드럼 머신',
    desc: '프로그래밍된 드럼 사운드로 일정하고 정교한 전자 리듬 생성',
    ...drumInstrument(
      { kickDecay: 0.7, kickPD: 0.08, kickOct: 4, hatVol: -18, clapVol: -4 },
      { k: 'X.....x.x.......', c: '....X.......X...', h: 'x.x.x.x.x.x.x.x.', rim: '......x.......x.' }
    ),
  },
  {
    id: 'drums', cat: 'drums', en: 'Drums', ko: '드럼',
    desc: '킥·스네어·하이햇·심벌 등을 활용하여 곡의 기본 비트와 에너지 형성',
    ...drumInstrument(
      () => ({ fx: [rev(1.0, 0.12)] }),
      {
        k: 'X.......X.x.....|X.......X.x.....|X.......X.x.....|X.......X.x.....',
        s: '....X.......X...|....X.......X...|....X.......X...|....X.......X.xx',
        h: 'x.x.x.x.x.x.x.x.|x.x.x.x.x.x.x.x.|x.x.x.x.x.x.x.x.|x.x.x.x.x.x.....',
      }
    ),
  },
  {
    id: 'electronic-drums', cat: 'drums', en: 'Electronic Drums', ko: '일렉트로닉 드럼',
    desc: '전자적으로 생성하거나 트리거한 드럼 음색으로 강하고 선명한 비트 구현',
    ...drumInstrument(
      { kickDecay: 0.35, kickPD: 0.04, kickOct: 7, kickVol: 2, hatVol: -20, clapVol: -2 },
      { k: 'X...X...X...X...', c: '....X.......X...', oh: '..x...x...x...x.', h: 'oxo.oxo.oxo.oxo.' }
    ),
  },
  {
    id: 'soft-drums', cat: 'drums', en: 'Soft Drums', ko: '소프트 드럼',
    desc: '부드러운 타격감과 절제된 리듬으로 편안하고 차분한 분위기 연출',
    ...drumInstrument(
      () => ({ gain: 0.6, kickDecay: 0.3, kickVol: -2, hatVol: -24, rimVol: -12, fx: [new Tone.Filter(2500, 'lowpass')] }),
      { k: 'x.......x..o....', rim: '....x.......x...', h: 'o.o.o.o.o.o.o.o.' }
    ),
  },
  {
    id: 'trap', cat: 'drums', en: 'Trap Drums', ko: '트랩 드럼',
    desc: '빠른 하이햇 롤과 강한 808 킥을 활용하여 트랩 힙합 리듬 구현',
    ...drumInstrument(
      { kickPD: 0.06, kickOct: 2.5, kickDecay: 1.3, kickVol: 0, hatVol: -18, clapVol: -2 },
      {
        k8: 'X......x..X.....|X......x..X...x.',
        c: '........X.......',
        h: 'x.x.x.x.xrx.x.x.|x.x.x.x.x.x.rrrr',
      }
    ),
  },

  /* ---------- 베이스 ---------- */
  {
    id: 'bass', cat: 'bass', en: 'Bass', ko: '베이스',
    desc: '곡의 저음과 리듬을 담당하며 음악의 안정감과 그루브를 형성',
    ...samplerInstrument({
      build(out) {
        const b = sampler('bass-electric', ['E1', 'G1', 'As1', 'Cs2', 'E2', 'G2', 'As2', 'Cs3'], { release: 0.15, volume: 0 });
        b.s.chain(new Tone.Filter(2500, 'lowpass'), out);
        return { ready: [b.ready], voices: [b.s], play: (time, ev) => b.s.triggerAttackRelease(ev.n, ev.d, time, ev.vel) };
      },
      events: () => seq('R..R..O.R..F..O.', (c, bar, i) => {
        const r = PROG[bar].root;
        const n = { R: r, F: tr(r, 7), O: tr(r, 12) }[c];
        return { time: T(bar, i), n, d: i % 4 === 0 ? '8n.' : '16n', vel: i % 4 === 0 ? 0.95 : 0.7 };
      }),
    }),
  },
  {
    id: 'synth-bass', cat: 'bass', en: 'Synth Bass', ko: '신스 베이스',
    desc: '탄력 있고 강한 전자 저음으로 댄스 음악의 추진력과 그루브 강화',
    create(out) {
      const s = new Tone.MonoSynth({
        oscillator: { type: 'sawtooth' },
        filter: { Q: 4, type: 'lowpass', rolloff: -24 },
        envelope: { attack: 0.005, decay: 0.2, sustain: 0.4, release: 0.08 },
        filterEnvelope: { attack: 0.002, decay: 0.15, sustain: 0.2, release: 0.1, baseFrequency: 120, octaves: 3.2 },
        volume: -4,
      }).connect(out);
      return { ready: Promise.resolve(), play: (time, ev) => s.triggerAttackRelease(ev.n, '16n', time, ev.vel), stop: (time) => s.triggerRelease(time) };
    },
    events: () => seq('R.RO.RR.R.RO.RF.', (c, bar, i) => {
      const r = tr(PROG[bar].root, 12);
      return { time: T(bar, i), n: { R: r, O: tr(r, 12), F: tr(r, 7) }[c], vel: i % 4 === 0 ? 1 : 0.7 };
    }),
  },
  {
    id: 'upright-bass', cat: 'bass', en: 'Upright Bass', ko: '업라이트 베이스',
    desc: '깊고 자연스러운 어쿠스틱 저음으로 재즈·스윙 음악에 활용',
    ...samplerInstrument({
      build(out) {
        const b = sampler('contrabass', ['Fs1', 'G1', 'As1', 'C2', 'D2', 'E2', 'Fs2', 'Gs2', 'A2', 'Cs3', 'E3'], { release: 0.3, volume: 2 });
        b.s.chain(new Tone.Filter(1800, 'lowpass'), out);
        return { ready: [b.ready], voices: [b.s], play: (time, ev) => b.s.triggerAttackRelease(ev.n, '4n', time, ev.vel) };
      },
      // 워킹 베이스: 4분음표로 코드톤을 걷다가 다음 코드로 반음 접근
      events: () => WALK.flatMap((notes, bar) => notes.map((n, beat) => ({ time: `${bar}:${beat}:0`, n, vel: beat % 2 ? 0.7 : 0.9 }))),
    }),
  },

  /* ---------- 전자악기 ---------- */
  {
    id: 'synth', cat: 'synth', en: 'Synth', ko: '신스',
    desc: '다양한 전자 음색을 생성하여 멜로디·베이스·효과음 등에 활용',
    create(out) {
      const s = new Tone.MonoSynth({
        oscillator: { type: 'square' },
        filter: { Q: 2, type: 'lowpass', rolloff: -12 },
        envelope: { attack: 0.005, decay: 0.12, sustain: 0.3, release: 0.15 },
        filterEnvelope: { attack: 0.005, decay: 0.2, sustain: 0.3, release: 0.2, baseFrequency: 600, octaves: 3 },
        volume: -10,
      });
      s.chain(new Tone.FeedbackDelay({ delayTime: '8n.', feedback: 0.3, wet: 0.25 }), out);
      return { ready: Promise.resolve(), play: (time, ev) => s.triggerAttackRelease(ev.n, '16n', time, 0.8), stop: (time) => s.triggerRelease(time) };
    },
    // 아르페지에이터: 코드톤을 16분음표로 오르내림
    events: () => seq('xxxxxxxxxxxxxxxx', (c, bar, i) => {
      const ch = trAll(PROG[bar].chord, 12);
      const order = [0, 1, 2, 3, 4, 3, 2, 1];
      const idx = order[i % 8];
      return { time: T(bar, i), n: idx === 4 ? tr(ch[1], 12) : ch[idx] };
    }),
  },
  {
    id: 'synth-pad', cat: 'synth', en: 'Synth Pad', ko: '신스 패드',
    desc: '길게 지속되는 부드러운 전자 음색으로 공간감과 몽환적인 분위기 형성',
    create(out) {
      const s = new Tone.PolySynth(Tone.Synth, {
        // 2겹·리버브 3.5초: 3겹·6초는 로즈 등과 겹치면 오디오 처리가 실시간을 못 따라가 '지직' 잡음이 났다
        // (측정: 컨템포러리 재즈 0.80배속 → 0.96배속). 코러스가 넓이를 채워 줘서 소리 차이는 작다.
        oscillator: { type: 'fatsawtooth', count: 2, spread: 30 },
        envelope: { attack: 1.0, decay: 0.5, sustain: 0.8, release: 2.5 },
        volume: -8,
      });
      s.chain(new Tone.Filter(1400, 'lowpass'), new Tone.Chorus(1.5, 3.5, 0.6).start(), rev(3.5, 0.5), out);
      return { ready: Promise.resolve(), play: (time, ev) => s.triggerAttackRelease(PROG[ev.bar].chord, '1m', time, 0.6), stop: (time) => s.releaseAll(time) };
    },
    events: () => [0, 1, 2, 3].map((bar) => ({ time: `${bar}:0:0`, bar })),
  },

  /* ---------- 타악기 ---------- */
  {
    id: 'percussion', cat: 'perc', en: 'Percussion', ko: '퍼커션',
    desc: '셰이커·탬버린·콩가 등으로 리듬에 생동감과 다양한 질감 추가',
    create(out) {
      const bus = new Tone.Gain(1).connect(out);
      const shakerF = new Tone.Filter(6000, 'highpass').connect(bus);
      const shaker = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.005, decay: 0.05, sustain: 0 }, volume: -20 }).connect(shakerF);
      const tamb = new Tone.MetalSynth({ envelope: { attack: 0.001, decay: 0.15, release: 0.05 }, harmonicity: 8, modulationIndex: 30, resonance: 7000, octaves: 0.5, volume: -30 }).connect(bus);
      const conga = new Tone.MembraneSynth({ pitchDecay: 0.02, octaves: 1.2, envelope: { attack: 0.001, decay: 0.25, sustain: 0 }, volume: -6 }).connect(bus);
      return {
        ready: Promise.resolve(),
        play(time, ev) {
          if (ev.v === 'sh') shaker.triggerAttackRelease('32n', time, ev.vel);
          else if (ev.v === 'tb') tamb.triggerAttackRelease(500, '16n', time, ev.vel);
          else conga.triggerAttackRelease(ev.v === 'hi' ? 'E3' : 'A2', '8n', time, ev.vel);
        },
      };
    },
    events: () => drumSteps({ sh: 'xoxoxoxoxoxoxoxo', tb: '....x.......x...', hi: '...x..x.....x...', lo: 'x.........x...x.' }),
  },

  /* ---------- 피아노 ---------- */
  {
    id: 'electric-piano', cat: 'keys', en: 'Electric Piano', ko: '일렉트릭 피아노',
    desc: '부드럽고 따뜻한 전자 건반 음색으로 재즈·R&B·팝에 활용',
    create(out) {
      const s = new Tone.PolySynth(Tone.FMSynth, {
        harmonicity: 1, modulationIndex: 5,
        oscillator: { type: 'sine' }, modulation: { type: 'triangle' },
        envelope: { attack: 0.003, decay: 1.2, sustain: 0.15, release: 0.6 },
        modulationEnvelope: { attack: 0.003, decay: 0.4, sustain: 0.1, release: 0.4 },
        volume: -4,
      });
      s.chain(new Tone.AutoPanner(3).start(), rev(1.5, 0.18), out);
      return { ready: Promise.resolve(), play: (time, ev) => s.triggerAttackRelease(PROG[ev.bar].chord, ev.d, time, ev.vel), stop: (time) => s.releaseAll(time) };
    },
    // 싱코페이션 컴핑
    events: () => seq('..x...x.....x...', (c, bar, i) => ({ time: T(bar, i), bar, d: i === 12 ? '4n' : '8n', vel: 0.7 })),
  },
  {
    id: 'piano', cat: 'keys', en: 'Piano', ko: '피아노',
    desc: '선명하고 자연스러운 건반 음색으로 멜로디와 화성 표현',
    ...samplerInstrument({
      build(out) {
        const p = sampler('piano', ['A1', 'Ds2', 'A2', 'Ds3', 'A3', 'Ds4', 'A4', 'Ds5', 'A5'], { release: 1, volume: -6 });
        p.s.chain(rev(2, 0.2), out);
        return {
          ready: [p.ready], voices: [p.s],
          play(time, ev) {
            const pr = PROG[ev.bar];
            if (ev.lh) p.s.triggerAttackRelease(tr(pr.root, 12), '2n.', time, 0.7);
            p.s.triggerAttackRelease(pr.chord, ev.d, time, ev.vel);
          },
        };
      },
      events: () => [0, 1, 2, 3].flatMap((bar) => [
        { time: `${bar}:0:0`, bar, lh: true, d: '2n.', vel: 0.65 },
        { time: `${bar}:2:2`, bar, d: '4n', vel: 0.5 },
      ]),
    }),
  },
  {
    id: 'rhodes', cat: 'keys', en: 'Rhodes', ko: '로즈 피아노',
    desc: '둥글고 따뜻하며 벨처럼 울리는 음색으로 재즈·네오소울·Lo-fi에 활용',
    create(out) {
      const s = new Tone.PolySynth(Tone.FMSynth, {
        harmonicity: 3, modulationIndex: 2.5,
        oscillator: { type: 'sine' }, modulation: { type: 'sine' },
        envelope: { attack: 0.002, decay: 2.5, sustain: 0.25, release: 1.2 },
        modulationEnvelope: { attack: 0.002, decay: 0.25, sustain: 0.05, release: 0.5 },
        volume: -1,
      });
      s.chain(new Tone.Tremolo(4, 0.45).start(), new Tone.Chorus(0.8, 2.5, 0.3).start(), rev(2.2, 0.25), out);
      return {
        ready: Promise.resolve(),
        // 살짝 흩뿌리듯(롤) 누르는 코드
        play(time, ev) {
          const pr = PROG[ev.bar];
          [tr(pr.root, 12), ...pr.chord].forEach((n, k) => s.triggerAttackRelease(n, ev.d, time + k * 0.018, 0.65));
        },
        stop: (time) => s.releaseAll(time),
      };
    },
    events: () => [0, 1, 2, 3].flatMap((bar) => [
      { time: `${bar}:0:0`, bar, d: '2n.' },
      { time: `${bar}:3:2`, bar, d: '8n' },
    ]),
  },

  /* ---------- 현악기 ---------- */
  {
    id: 'cello', cat: 'strings', en: 'Cello', ko: '첼로',
    desc: '깊고 따뜻한 중저음으로 서정적이고 감성적인 멜로디 표현',
    ...samplerInstrument({
      build(out) {
        const c = sampler('cello', ['C2', 'E2', 'G2', 'As2', 'Cs3', 'E3', 'G3', 'As3', 'Cs4', 'E4', 'G4'], { attack: 0.08, release: 0.8, volume: -2 });
        c.s.chain(rev(2.5, 0.25), out);
        return { ready: [c.ready], voices: [c.s], play: (time, ev) => c.s.triggerAttackRelease(ev.n, ev.d, time, 0.8) };
      },
      events: () => COUNTER,
    }),
  },
  {
    id: 'strings', cat: 'strings', en: 'Strings', ko: '스트링스',
    desc: '바이올린·비올라·첼로 등의 앙상블로 풍부한 화성과 감성 표현',
    ...samplerInstrument({
      build(out) {
        const vn = sampler('violin', ['G3', 'A3', 'C4', 'E4', 'G4', 'A4', 'C5'], { attack: 0.35, release: 1.2, volume: -2 });
        const vc = sampler('cello', ['C2', 'E2', 'G2', 'As2', 'Cs3', 'E3', 'G3'], { attack: 0.35, release: 1.2, volume: 0 });
        const fx = rev(3, 0.3); fx.connect(out);
        vn.s.connect(fx); vc.s.connect(fx);
        return {
          ready: [vn.ready, vc.ready], voices: [vn.s, vc.s],
          play(time, ev) {
            const p = PROG[ev.bar];
            vn.s.triggerAttackRelease(p.chord.slice(1), '1m', time, 0.6);
            vc.s.triggerAttackRelease(tr(p.root, 12), '1m', time, 0.7);
          },
        };
      },
      events: () => [0, 1, 2, 3].map((bar) => ({ time: `${bar}:0:0`, bar })),
    }),
  },
];
