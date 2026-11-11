/* 편곡 흐름: 믹서 위쪽 막대의 [루프 | 곡 흐름]. 곡 흐름이면 4마디 루프 대신 곡처럼 구간이 이어지며 악기가 들어오고 빠진다.
 * Style Builder 8번(편곡·구성)과 1번 아웃트로에서 고른 대로 구간을 짠다(Suno에 보내기 전에 구성을 미리 들어 보기).
 * 미리 듣기용이라 구간을 실제 곡보다 짧게 둔다(벌스·후렴 4마디) — 바뀐 점이 금방 들리게.
 *  - 8번을 아무것도 안 고르면(또는 미니멀만): 인트로 2 → 본곡 8 → 아웃트로 2
 *  - 벌스-코러스: 벌스 4 → 후렴 4를 두 번(벌스는 드럼 없이, 후렴은 전체)
 *  - 빌드업 → 드롭: 후렴 앞에 빌드업 2(드럼만 남기고 점점 커짐), 후렴은 '드롭'
 *  - 브레이크다운: 마지막 후렴 앞에 화성 악기만 남긴 2마디 + 마지막 후렴
 *  - 미니멀: 어디서나 악기를 적게(드럼 빼기) / 층층이 쌓기: 구간마다 화성 → 베이스 → 드럼 순으로 하나씩 더함
 *  - 후렴 강조: 후렴 멜로디 +6dB, 벌스 멜로디는 작게 / 다이내믹 대비: 벌스는 아주 작게(45%), 후렴은 크게
 *  - 1번 아웃트로 페이드아웃: 마지막에 점점 작아지며 멈춤 / 깔끔한 엔딩: 마지막 마디에서 멈춤 / 그 밖: 처음부터 다시
 * 악기는 분류로 역할을 나눈다: 리듬(드럼·타악기·DJ) · 베이스 · 화성(그 밖). 켜 둔 악기의 채널을 구간마다 음소거한다.
 * app.js(flowGain)·melody.js 다음에 불러온다. */

const FLOW_KEY = 'music.flow';
let flowOn = false;
try { flowOn = localStorage.getItem(FLOW_KEY) === '1'; } catch {}
let flowRepeatId = null;

const flowSb = () => (typeof sb !== 'undefined' ? sb : { arr: [], outro: '' });
const FLOW_NAMES = { intro: '인트로', main: '본곡', verse: '벌스', build: '빌드업', chorus: '후렴', drop: '드롭', breakdown: '브레이크다운', final: '마지막 후렴', outro: '아웃트로' };
const FLOW_SECTION_ARR = ['verse-chorus', 'build-up-drop', 'breakdown', 'layered', 'dynamic-contrast', 'chorus-emphasis'];

// 8번·1번 선택 → 구간 목록 [{ type, bars, n(같은 종류의 몇 번째), i(몇 번째 구간) }]
function flowPlan() {
  const arr = flowSb().arr ?? [];
  const drop = arr.includes('build-up-drop');
  const brk = arr.includes('breakdown');
  const ch = drop ? 'drop' : 'chorus';
  let list;
  if (!arr.some((a) => FLOW_SECTION_ARR.includes(a))) list = [['intro', 2], ['main', 8], ['outro', 2]];
  else {
    list = [['intro', 2], ['verse', 4]];
    if (drop) list.push(['build', 2]);
    list.push([ch, 4], ['verse', 4]);
    if (drop) list.push(['build', 2]);
    list.push([ch, 4]);
    if (brk) list.push(['breakdown', 2], ['final', 4]);
    list.push(['outro', 2]);
  }
  const count = {};
  let start = 0;
  return list.map(([type, bars], i) => {
    count[type] = (count[type] ?? 0) + 1;
    const s = { type, bars, n: count[type], start, i };
    start += bars;
    return s;
  });
}

// 켜 둔 악기의 역할
const flowRole = (id) => {
  const cat = byId[id]?.cat;
  return ['drums', 'perc', 'dj'].includes(cat) ? 'rhythm' : cat === 'bass' ? 'bass' : 'harmony';
};
const FLOW_ALL = ['harmony', 'bass', 'rhythm'];

// 구간 → 켤 역할·멜로디·곡 크기(gain)·멜로디 음량 보정(dB)
function flowLayer(sec, barIn) {
  const arr = flowSb().arr ?? [];
  const minimal = arr.includes('minimal');
  const layered = arr.includes('layered');
  const contrast = arr.includes('dynamic-contrast');
  const emph = arr.includes('chorus-emphasis');
  const big = sec.type === 'chorus' || sec.type === 'drop' || sec.type === 'final';
  let roles = FLOW_ALL, melody = true, gain = 0.9, melBoost = 0;
  switch (sec.type) {
    case 'intro': roles = ['harmony']; melody = false; gain = 0.75; break;
    case 'outro': roles = ['harmony', 'bass']; melody = false; gain = 0.75; break;
    case 'verse': roles = ['harmony', 'bass']; gain = 0.8; break; // 벌스는 드럼 없이 → 후렴에서 드럼이 들어오는 차이가 들린다
    case 'build': roles = ['rhythm']; melody = false; gain = 0.3 + 0.7 * ((barIn + 1) / sec.bars); break; // 드럼만 남기고 점점 커짐
    case 'breakdown': roles = ['harmony']; gain = 0.55; break;
    case 'main': break;
    default: gain = 1; // 후렴·드롭·마지막 후렴
  }
  // 층층이 쌓기: 구간이 지날수록 화성 → 베이스 → 드럼(본곡이면 2마디마다 하나씩)
  if (layered && !['intro', 'outro', 'build'].includes(sec.type)) {
    const step = sec.type === 'main' ? Math.floor(barIn / 2) : sec.i - 1;
    roles = FLOW_ALL.slice(0, Math.min(3, step + 1));
  }
  if (minimal) roles = roles.filter((r) => r !== 'rhythm').length ? roles.filter((r) => r !== 'rhythm') : ['harmony'];
  if (contrast) gain = big ? 1 : sec.type === 'verse' ? 0.45 : gain;
  if (emph) melBoost = big ? 6 : sec.type === 'verse' ? -4 : 0;
  if (minimal) gain = Math.min(gain, 0.8);
  return { roles, melody, gain, melBoost };
}

// 지금 켜진 악기 중 그 역할이 하나도 없으면(예: 드럼 없이 피아노만) 화성 악기라도 들리게 한다
let flowNow = null; // 지금 구간에서 실제로 들리는 악기·멜로디(화면 표시용)
function flowApply(sec, barIn, time) {
  const L = flowLayer(sec, barIn);
  const on = Object.entries(state).filter(([, s]) => s.active);
  const audible = on.filter(([id]) => L.roles.includes(flowRole(id)));
  const keep = new Set((audible.length ? audible : on.filter(([id]) => flowRole(id) === 'harmony')).map(([id]) => id));
  on.forEach(([id, s]) => { s.channel.mute = !keep.has(id); });
  flowNow = { ids: [...keep], melody: !!mel && (L.melody || !on.length), roles: L.roles };
  if (mel) {
    // 음소거(mute)는 음량을 -∞로 바꾸는 방식이라 음량 조절과 겹치면 풀린다 → 음량만으로 켜고 끈다.
    // 악기 없이 멜로디만 들을 때는 멜로디를 끄지 않는다
    const melOn = L.melody || !on.length;
    mel.channel.volume.rampTo(melOn ? mel.baseVol + L.melBoost : -80, 0.15, time);
  }
  // 아웃트로 페이드아웃: 마지막 4마디 동안 0으로
  const fade = sec.type === 'outro' && flowSb().outro === 'fade-out';
  const target = fade ? Math.max(0, 0.8 * (1 - (barIn + 1) / sec.bars)) : L.gain;
  flowGain.gain.rampTo(target, fade || sec.type === 'build' ? Tone.Time('1m').toSeconds() : 0.3, time);
}

function flowUnmuteAll() {
  Object.values(state).forEach((s) => { if (s.channel) s.channel.mute = false; });
  if (mel) mel.channel.volume.rampTo(mel.baseVol, 0.2);
  if (flowGain) flowGain.gain.rampTo(1, 0.3);
}

// 지금 마디(재생 위치) → 구간. 끝을 넘으면 아웃트로 설정에 따라 멈추거나 처음부터
function flowAt(bar) {
  const plan = flowPlan();
  const total = plan.reduce((a, s) => a + s.bars, 0);
  const ending = flowSb().outro;
  const stopAtEnd = ending === 'fade-out' || ending === 'clean';
  if (bar >= total && stopAtEnd) return { end: true, plan, total };
  const b = bar % total;
  const sec = plan.find((s) => b >= s.start && b < s.start + s.bars);
  return { sec, barIn: b - sec.start, b, plan, total };
}

function flowTick(time) {
  if (!flowOn) return;
  const bar = Math.round(Tone.getTransport().getTicksAtTime(time) / (Tone.getTransport().PPQ * 4));
  const at = flowAt(bar);
  if (at.end) {
    Tone.getDraw().schedule(() => { stopTransport(); renderFlow(null); }, time);
    return;
  }
  flowApply(at.sec, at.barIn, time);
  Tone.getDraw().schedule(() => renderFlow(at), time);
}

// 악기를 켜고 끄거나 멜로디를 다시 만들었을 때 지금 구간을 바로 반영한다
function flowApplyNow() {
  if (!flowOn || !started) return;
  const bar = Math.floor(Tone.getTransport().ticks / (Tone.getTransport().PPQ * 4));
  const at = flowAt(bar);
  if (!at.end) flowApply(at.sec, at.barIn, Tone.now());
}

function flowStart() {
  if (flowRepeatId !== null || !started) return;
  flowRepeatId = Tone.getTransport().scheduleRepeat(flowTick, '1m', 0);
  flowApplyNow();
}
function flowStop() {
  if (flowRepeatId !== null) Tone.getTransport().clear(flowRepeatId);
  flowRepeatId = null;
  flowUnmuteAll();
  renderFlow(null);
}

const flowEl = { box: $('#flow-mode'), status: $('#flow-status') };
// 라벨 옆: 8번에서 고른 항목(멜로디의 '7번: …'처럼). 아래 줄: 구성 또는 지금 구간과 실제로 들리는 악기
const FLOW_ARR_KO = { minimal: '미니멀', layered: '층층이 쌓기', 'verse-chorus': '벌스-코러스', 'build-up-drop': '빌드업→드롭', breakdown: '브레이크다운', 'chorus-emphasis': '후렴 강조', 'dynamic-contrast': '다이내믹 대비' };
const FLOW_OUTRO_KO = { 'fade-out': '페이드아웃', clean: '깔끔한 엔딩' };
function renderFlow(at) {
  flowEl.box.querySelectorAll('[data-flow]').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.flow === 'song') === flowOn)));
  const picks = (flowSb().arr ?? []).map((a) => FLOW_ARR_KO[a] ?? a);
  const outro = FLOW_OUTRO_KO[flowSb().outro];
  flowEl.status.textContent = [picks.length ? `8번: ${picks.join('·')}` : '8번: 선택 없음', outro ? `1번: ${outro}` : ''].filter(Boolean).join(' · ');
  const now = $('#flow-now');
  if (!flowOn) { now.textContent = picks.length ? '루프 중 — [곡 흐름]을 눌러야 8번이 들려요' : ''; return; }
  const plan = flowPlan();
  if (!at || !isRunning()) {
    now.textContent = `${plan.map((s) => FLOW_NAMES[s.type]).join('→')} · ${plan.reduce((a, s) => a + s.bars, 0)}마디`;
    return;
  }
  const names = (flowNow?.ids ?? []).map((id) => byId[id]?.ko ?? id);
  if (flowNow?.melody) names.push('멜로디');
  const hint = flowRoleHint();
  now.innerHTML = `▶ <b>${FLOW_NAMES[at.sec.type]}</b> ${at.barIn + 1}/${at.sec.bars} · 들리는 소리: ${names.length ? esc(names.join('+')) : '없음'}`
    + (hint ? `<br><span class="warn">⚠ ${esc(hint.trim())}</span>` : '');
}

// 켜 둔 악기가 한 역할뿐이면(예: 피아노·현악기만) 구간마다 켜고 끌 것이 없어 차이가 거의 안 들린다
function flowRoleHint() {
  const roles = new Set(Object.entries(state).filter(([, s]) => s.active).map(([id]) => flowRole(id)));
  if (!roles.size) return ' 아래에서 드럼·베이스·화성 악기를 켜거나 추천 조합(예: 시티 팝, 하우스·EDM)을 골라 주세요.';
  if (roles.size < 3) {
    const miss = ['rhythm', 'bass', 'harmony'].filter((r) => !roles.has(r)).map((r) => ({ rhythm: '드럼', bass: '베이스', harmony: '피아노·기타 같은 화성 악기' })[r]);
    return ` 지금은 ${miss.join('·')}이(가) 꺼져 있어 구간 차이가 작게 들려요. 함께 켜 보세요.`;
  }
  return '';
}

async function setFlow(on, why = '') {
  if (on === flowOn) return;
  flowOn = on;
  try { localStorage.setItem(FLOW_KEY, flowOn ? '1' : '0'); } catch {}
  if (flowOn) {
    await initAudio();
    flowStart();
    // 곡 흐름은 처음(인트로)부터 들어야 해서 재생 중이면 처음으로 돌린다
    if (isRunning()) { Tone.getTransport().position = 0; flowApplyNow(); }
    flash(`${why || '곡 흐름으로 재생합니다. Style Builder 8번·1번 아웃트로에서 고른 구성대로 악기가 들어오고 빠집니다.'}${flowRoleHint()}`, 'ok');
  } else flowStop();
  renderFlow(null);
}
flowEl.box.onclick = (e) => {
  const b = e.target.closest('[data-flow]');
  if (b) setFlow(b.dataset.flow === 'song');
};
// Style Builder에서 8번·1번을 바꾸면 구간 안내를 다시 쓴다(재생 중이면 다음 마디부터 반영)
let flowArrSig = null; // suno.js가 처음 그릴 때 기준값을 잡는다(그 전에는 sb가 없다)
function refreshFlow() {
  const sig = JSON.stringify([flowSb().arr, flowSb().outro]);
  const changed = flowArrSig !== null && sig !== flowArrSig;
  flowArrSig = sig;
  if (!changed) { if (!isRunning()) renderFlow(null); return; } // 처음 그릴 때 라벨(8번 선택)을 채운다
  // 8번은 곡 흐름에서만 들리므로, 루프 중에 8번을 바꾸면 곡 흐름으로 바꿔 처음부터 들려준다
  if (!flowOn) {
    setFlow(true, `8번 편곡을 들려 드리려고 [편곡: 곡 흐름]으로 바꿨습니다(${flowPlan().map((x) => FLOW_NAMES[x.type]).join('→')}).`);
    return;
  }
  // 곡 흐름 재생 중이면 바뀐 구성을 처음부터 다시 들려준다(지금 구간이 바뀐 부분과 상관없으면 차이가 안 들리므로)
  if (isRunning()) {
    Tone.getTransport().position = 0;
    flowApplyNow();
    flash(`바뀐 구성으로 처음부터 재생합니다: ${flowPlan().map((x) => FLOW_NAMES[x.type]).join('→')}.${flowRoleHint()}`, 'ok');
  } else renderFlow(null);
}
// 오디오가 처음 준비될 때 곡 흐름이 켜져 있으면 시작한다
Tone.getTransport().on('start', () => { if (flowOn) { flowStart(); } });
renderFlow(null);

// 멜로디·편곡 '?' 도움말: 누르면 열고 다시 누르거나 바깥을 누르거나 Esc면 닫는다
const closeHelp = () => {
  document.querySelectorAll('.qhelp-pop').forEach((p) => { p.hidden = true; });
  document.querySelectorAll('.qhelp').forEach((b) => b.setAttribute('aria-expanded', 'false'));
};
document.querySelectorAll('.qhelp').forEach((btn) => {
  const pop = document.getElementById(btn.getAttribute('aria-controls'));
  btn.onclick = (e) => {
    e.stopPropagation();
    const open = pop.hidden;
    closeHelp();
    pop.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
  };
});
document.addEventListener('click', (e) => { if (!e.target.closest('.qhelp-pop')) closeHelp(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeHelp(); });
