/* 곡 업로드 → 분석 → 믹서에 조합 적용 */

const ANALYSIS_SCRIPTS = [
  'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.19.2/dist/ort.min.js',
  'https://cdn.jsdelivr.net/npm/essentia.js@0.1.3/dist/essentia-wasm.web.js',
  'https://cdn.jsdelivr.net/npm/essentia.js@0.1.3/dist/essentia.js-core.umd.js',
  'analyzer.js?v=20261029c',
];

const up = {
  panel: $('#panel-upload'), drop: $('#drop'), file: $('#file'), progress: $('#progress'), result: $('#result'),
};
let libsP, busy = false, lastAudioUrl = null, last = null;

// 분석 라이브러리는 3MB 가까이 되므로 곡을 처음 올릴 때만 불러온다
function loadLibs() {
  return (libsP ??= ANALYSIS_SCRIPTS.reduce(
    (p, src) => p.then(() => new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error(`스크립트를 불러오지 못했습니다: ${src}`));
      document.body.append(s);
    })),
    Promise.resolve()
  ).catch((e) => { libsP = null; throw e; }));
}

function showProgress(ratio, label) {
  up.progress.hidden = false;
  $('.bar i', up.progress).style.transform = `scaleX(${ratio})`;
  $('span', up.progress).textContent = `${label}… ${Math.round(ratio * 100)}%`;
}

// partial: 곡 일부(90초 녹음)라 곡 전체 흐름을 보는 항목은 판단하지 않는다. source: 결과 칸에 보여 줄 출처(링크·녹음)
async function handleFile(file, { partial = false, source = '' } = {}) {
  if (!file) return;
  if (busy) return flash('지금 곡을 분석하고 있습니다. 끝난 뒤에 다시 올려 주세요.', 'warn');
  if (!/^audio\//.test(file.type) && !/\.(mp3|wav|m4a|flac|ogg|aac)$/i.test(file.name)) {
    flash('오디오 파일만 올릴 수 있습니다.', 'warn');
    return;
  }
  busy = true;
  up.drop.classList.add('busy');
  up.result.hidden = true;
  // 분석에 실패하면 되돌릴 수 있게 지금 조합을 기억해 둔다
  const prev = {
    ids: INSTRUMENTS.filter((d) => state[d.id] && isOn(state[d.id])).map((d) => d.id),
    bpm: +el.bpm.value, prog: HARMONY.prog, shift: HARMONY.shift, preset: currentPreset,
  };
  // 새 곡을 고르면 이전 곡으로 만든 조합·원곡 재생·코드 진행을 초기화한다.
  // 분석이 10초 넘게 메인 스레드를 쓰므로, 그동안 이전 조합이 계속 돌면 이전 곡 비트가 끊기며 남아 들린다.
  clearAll();
  document.querySelectorAll('audio').forEach((a) => a.pause());
  if (started) applyHarmony(DEFAULT_PROG, 0);
  try {
    // 브라우저 자동재생 정책 때문에 사용자 동작(파일 선택) 직후에 오디오를 깨워 둔다
    await initAudio();
    showProgress(0.01, '분석 도구 불러오는 중');
    await loadLibs();
    const res = await Analyzer.analyze(file, showProgress);
    Object.assign(res, { partial, source, bpmBase: res.bpm, bpmFix: '' });
    // 느린 곡을 두 배 템포로 잡은 것 같으면 절반으로(결과 화면의 [½]·[×2]로 되돌릴 수 있음)
    if (Analyzer.slowTempoFix(res)) Object.assign(res, { bpm: Math.round(res.bpm / 2), bpmFix: 'auto' });
    const mix = Analyzer.toMixer(res, MAX_ACTIVE);
    const semis = Analyzer.keyShift(res.key, res.scale);
    last = { res, mix, semis, intro: Analyzer.introPick(res) };
    deriveFromBpm();
    // 분석 장르가 기존 세부 장르에 없으면 추천 조합·Style Builder에 새 장르로 추가한다
    const newGenre = genreFromAnalysis(last);
    if (addCustomGenre(newGenre)) flash(`새 장르 '${newGenre.name}'을(를) 추천 조합·Style Builder의 ${newGenre.cat} 탭에 추가했습니다.`, 'ok');
    if (lastAudioUrl) URL.revokeObjectURL(lastAudioUrl);
    lastAudioUrl = URL.createObjectURL(file);
    renderResult();
    if (webInfo) { webInfo.kept = false; renderWeb(); } // ②의 원곡 정보는 유지하고, ③은 새 분석 기준으로 다시 고르게
    up.progress.hidden = true;
    markPreset(null);
    if (mix.picks.length) await applyCombo(mix.picks.map((p) => p.id), res.bpm, semis);
    else flash('곡에서 믹서에 있는 악기와 비슷한 소리를 찾지 못했습니다. 다른 곡으로 다시 시도해 보세요.', 'warn');
  } catch (err) {
    console.error(err);
    up.progress.hidden = true;
    // 실패하면 이전 화면과 조합으로 되돌린다(이전 분석 결과가 있으면 그 결과를 다시 보여 줌)
    if (last) renderResult();
    else up.panel.classList.remove('has-result');
    if (prev.ids.length) {
      applyCombo(prev.ids, prev.bpm, prev.shift, prev.prog);
      markPreset(prev.preset);
    }
    flash(/decode|Unable to decode|EncodingError/i.test(String(err))
      ? '이 파일 형식은 브라우저에서 읽을 수 없습니다. MP3나 WAV로 바꿔서 올려 주세요.'
      : '분석하지 못했습니다. 네트워크 연결을 확인하고 다시 시도해 주세요.', 'error');
  } finally {
    busy = false;
    up.drop.classList.remove('busy');
    up.file.value = '';
  }
}

const pct = (v) => `${Math.round(v * 100)}%`;
const fmtTime = (sec) => { const t = Math.round(sec); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; }; // 119.6초 → 2:00 (1:60 아님)
const genreLabel = (g) => g.replace('---', ' · ');
const esc = (t) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function renderResult() {
  const { res, mix, semis, intro, feel, hints } = last;
  // 추정한 선택값 칩(한글 이름, 말풍선에 출력 영어)
  const optChips = (key, vals) => vals.map((v) => `<span class="chip" title="추정 · 출력: ${v}">${OPTION_KO[key][v] ?? v}</span>`).join('')
    || '<span class="muted">추정할 근거가 없습니다</span>';
  const bpmNote = res.bpmFix ? `<small>(분석값 ${res.bpmBase} → ${res.bpmFix === 'auto' ? '느린 곡으로 보고 ½ 자동 보정' : '직접 보정'})</small>`
    : Math.round(res.bpmRaw) !== res.bpm ? `<small>(분석값 ${Math.round(res.bpmRaw)} → 범위에 맞춤)</small>` : '';
  const canScale = (f) => res.bpm * f >= 60 && res.bpm * f <= 180; // 믹서 BPM 범위
  const bpmBtns = `<span class="bpm-fix"><button class="ghost" id="r-half" title="두 배로 잡혔을 때(느린 곡): 절반으로" ${canScale(0.5) ? '' : 'disabled'}>½</button><button class="ghost" id="r-double" title="절반으로 잡혔을 때(빠른 곡): 두 배로" ${canScale(2) ? '' : 'disabled'}>×2</button></span>`;
  const keyNote = semis === 0 ? '(기본 키 그대로)' : `(기본 키에서 ${semis > 0 ? '+' : ''}${semis}반음)`;
  const genres = res.genres.slice(0, 3).map(([g, v]) => `<span class="chip">${esc(genreLabel(g))} <em>${pct(v)}</em></span>`).join('');
  const detected = mix.detected.map((d) => `<span class="chip ${d.unsupported ? 'off' : ''}" title="${d.unsupported ? '믹서에 없는 악기' : ''}">${d.ko} <em>${pct(d.score)}</em></span>`).join('')
    || '<span class="muted">뚜렷하게 인식된 악기가 없습니다</span>';
  const picked = mix.picks.map((p) => {
    const d = byId[p.id];
    return `<span class="chip on" style="--c:${catById[d.cat].color}">${d.ko}</span>`;
  }).join('') || '<span class="muted">없음</span>';
  const unsupported = mix.detected.filter((d) => d.unsupported).map((d) => d.ko);

  up.result.innerHTML = `
    <div class="r-left">
      <div class="r-name">
        <div><b>${esc(res.name)}</b><small>${fmtTime(res.duration)} · ${res.source ? `${esc(res.source)} · ` : ''}${res.partial ? '녹음한 부분 분석' : '가운데 구간 분석'}</small></div>
        <button class="ghost" id="r-pick">다른 곡 선택</button>
      </div>
      <audio controls src="${lastAudioUrl}" title="원곡을 재생하면 믹서는 멈춥니다"></audio>
      <div class="r-stats"><b>${res.bpm}</b> BPM ${bpmBtns} ${bpmNote} · <b>${res.key} ${res.scale === 'minor' ? 'minor' : 'major'}</b> <small>${keyNote}</small></div>
      <button class="primary" id="r-apply" title="분석한 악기·BPM·코드 진행으로 되돌려 다시 재생">이 조합 다시 켜기</button>
    </div>
    <div class="r-mid">
      <div class="r-row"><span class="r-label">장르</span><div class="chips">${genres}</div></div>
      <div class="r-row"><span class="r-label">리듬</span><div class="chips">${optChips('feel', feel)}${last.web ? webMark : ''}</div></div>
      <div class="r-row"><span class="r-label">분위기</span><div class="chips">${optChips('mood', hints.mood)}${optChips('energy', [hints.energy])}${last.web ? webMark : ''}</div></div>
      <div class="r-row"><span class="r-label">편곡</span><div class="chips">${optChips('arr', hints.arr)}${hints.outro ? optChips('outro', [hints.outro]) : ''}</div></div>
      <div class="r-row"><span class="r-label">사운드</span><div class="chips">${optChips('mix', hints.mix)}</div></div>
      <div class="r-row"><span class="r-label">인식된 악기</span><div class="chips">${detected}</div></div>
      <div class="r-row"><span class="r-label">켜진 악기</span><div class="chips">${picked}</div></div>
      <div class="r-row"><span class="r-label">도입부 악기</span><div class="chips">${
        intro?.drumFill ? `<span class="chip on" style="--c:${catById.drums.color}" title="앞 6초의 드럼 점수가 높아 드럼 필로 시작하는 곡으로 봤습니다">드럼 필</span>${
          intro.bass ? `<span class="chip on" style="--c:${catById[byId[intro.bass].cat].color}" title="앞 6초에 베이스도 두드러집니다">${byId[intro.bass].ko}</span>` : ''}`
        : intro ? `<span class="chip on" style="--c:${catById[byId[intro.id].cat].color}" title="앞 6초에서 가장 두드러진 악기">${byId[intro.id].ko}</span>`
        : '<span class="muted">뚜렷한 악기가 없습니다</span>'}</div></div>
      ${unsupported.length ? `<p class="muted r-note">${unsupported.join(', ')}은(는) 믹서에 없는 악기라 제외했습니다.</p>` : ''}
      <p class="muted r-note">분석으로 추정한 값입니다.${res.partial ? ' 곡 일부를 녹음해서 페이드아웃·브레이크다운·점점 고조는 판단하지 않았습니다.' : ''} Suno 스타일은 Suno Style Builder 탭의 [곡 분석 불러오기]로 이 값을 가져와 보컬·Concept과 함께 만듭니다.</p>
    </div>`;
  up.result.hidden = false;
  // ② 원곡 정보는 처음부터 ①과 함께 보인다. 이미 찾은 웹 결과가 있으면 ③ 선택 상태를 새 결과에 맞춰 다시 그린다
  if (webInfo && !si.out.hidden) renderWeb();
  // 결과가 있으면 큰 파일 선택 칸은 숨기고 '다른 곡 선택' 버튼으로 대신한다(세로 공간 확보)
  up.panel.classList.add('has-result');
  // 결과가 나오면 가져오기 칸(탭·링크·녹음)은 접고 [다른 곡 분석]으로 다시 연다 — 결과가 화면 위쪽에 오게
  up.panel.classList.remove('src-open');
  $('#r-pick').onclick = () => up.file.click();
  $('#r-apply').onclick = () => markPreset(null) || applyCombo(mix.picks.map((p) => p.id), res.bpm, semis);
  $('#r-half').onclick = () => scaleBpm(0.5);
  $('#r-double').onclick = () => scaleBpm(2);
  // 원곡과 믹서가 겹쳐 들리지 않게 한쪽만 재생
  $('audio', up.result).onplay = () => stopTransport();
}

// BPM에 따라 달라지는 추정(리듬의 '드라이빙', 에너지)을 다시 계산한다
function deriveFromBpm() {
  last.feel = Analyzer.rhythmFeels(last.res);
  last.hints = Analyzer.styleHints(last.res, last.mix);
  applyWebOverride();
}

// 분석 BPM이 두 배·절반으로 잡혔을 때 고친다: 결과 화면·믹서 속도·Suno Style이 함께 바뀐다
function scaleBpm(f) {
  const { res } = last;
  const bpm = Math.round(res.bpm * f);
  if (bpm < 60 || bpm > 180) return flash('믹서가 지원하는 60~180 BPM을 벗어나 바꿀 수 없습니다.', 'warn');
  res.bpm = bpm;
  res.bpmFix = bpm === res.bpmBase ? '' : 'manual';
  deriveFromBpm();
  renderResult();
  setBpm(bpm);
  flash(`BPM을 ${bpm}으로 바꿨습니다.`, 'ok');
}

up.file.onchange = () => { const f = up.file.files[0]; if (f) songInfoFromFile(f); handleFile(f); };
$('#panel-upload').addEventListener('dragenter', () => {
  const btn = $('#panel-upload .pdesc');
  if (btn.getAttribute('aria-expanded') !== 'true') setPanelOpen(btn, true);
});
// 끌어다 놓기는 패널 전체에서 받는다(결과가 있어 큰 칸이 숨겨져도 동작)
['dragenter', 'dragover'].forEach((t) => up.panel.addEventListener(t, (e) => { e.preventDefault(); up.panel.classList.add('over'); }));
['dragleave', 'drop'].forEach((t) => up.panel.addEventListener(t, (e) => {
  e.preventDefault();
  if (t === 'drop' || !up.panel.contains(e.relatedTarget)) up.panel.classList.remove('over');
}));
up.panel.addEventListener('drop', (e) => { const f = e.dataTransfer.files[0]; if (f) { showSrc('file'); songInfoFromFile(f); } handleFile(f); });

/* ---------------- 링크로 분석 ----------------
 * 링크 하나로 두 가지를 처리한다:
 *  - 음원 파일(받아 보니 audio)이면 받아서 파일과 똑같이 분석
 *  - 유튜브·스트리밍·웹페이지처럼 음원을 받을 수 없으면(받기는 각 서비스 약관이 금지) 제목만 가져오고,
 *    그 곡을 새 탭에서 재생하며 녹음(90초 / 곡 끝까지)해서 분석하도록 녹음 칸을 펼친다 */
const STREAM_SITE = /(^|\.)(youtube\.com|youtu\.be|spotify\.com|soundcloud\.com|music\.apple\.com|melon\.com|genie\.co\.kr|vibe\.naver\.com)$/i;
const streamBox = $('#stream-box');

function showStream(url) {
  streamBox.hidden = false;
  $('#stream-open').href = url.href;
  const can = !!(navigator.mediaDevices?.getDisplayMedia && window.MediaRecorder);
  $('#stream-unsupported').hidden = can;
  $('#rec-start').disabled = !can;
  songInfoFromLink(url.href);
  $('#stream-open').focus();
}

async function analyzeUrl(raw) {
  let url;
  try { url = new URL(raw.trim()); } catch { return flash('링크 형식이 올바르지 않습니다. https://로 시작하는 주소를 넣어 주세요.', 'warn'); }
  if (busy || rec) return flash('지금 다른 곡을 분석하거나 녹음하고 있습니다. 끝난 뒤에 다시 시도해 주세요.', 'warn');
  streamBox.hidden = true;
  if (STREAM_SITE.test(url.hostname)) {
    flash('스트리밍 링크는 음원을 받을 수 없어 곡을 재생하며 녹음해서 분석합니다. [새 탭에서 열기] 후 녹음 버튼을 눌러 주세요.', 'warn');
    return showStream(url);
  }
  initAudio().catch(() => {}); // 받는 동안 클릭(사용자 동작)이 만료되기 전에 오디오를 깨워 둔다
  showProgress(0.01, '링크에서 받는 중');
  let blob = null;
  try {
    const r = await fetch(url);
    if (r.ok) blob = await r.blob();
  } catch (err) {
    console.warn(err); // 사이트가 막아 둔 경우(CORS 등) — 녹음으로 넘긴다
  }
  up.progress.hidden = true;
  if (!blob || /^text\//.test(blob.type) || /json|xml/.test(blob.type)) {
    flash('이 링크에서 음원 파일을 받을 수 없어 재생하며 녹음해서 분석합니다. [새 탭에서 열기] 후 녹음 버튼을 눌러 주세요.', 'warn');
    return showStream(url);
  }
  const name = decodeURIComponent(url.pathname.split('/').pop() || '') || url.hostname;
  songInfoFromFile(new File([blob], name));
  // 서버가 형식을 알려 주지 않으면(octet-stream 등) 디코딩 단계에서 실제 형식을 판단한다
  await handleFile(new File([blob], name, { type: /^audio\//.test(blob.type) ? blob.type : 'audio/mpeg' }), { source: '링크' });
}

// ① 곡 분석 초기화: 분석 결과·원곡·링크 입력·녹음 칸을 지우고 파일 선택 화면과 믹서를 처음 상태로.
// ② 원곡 정보(제목·가수·웹 정보)는 따로 [초기화]가 있어 여기서는 그대로 둔다
$('#upload-reset').onclick = () => {
  if (busy || rec) return flash('지금 분석하거나 녹음하는 중입니다. 끝난 뒤(또는 녹음 [취소] 후)에 초기화해 주세요.', 'warn');
  if (last && !confirm('분석 결과와 켜 둔 악기를 지울까요?')) return;
  up.panel.classList.remove('src-open');
  resetMixer();
  last = null;
  if (lastAudioUrl) URL.revokeObjectURL(lastAudioUrl);
  lastAudioUrl = null;
  up.result.replaceChildren();
  up.result.hidden = true;
  up.progress.hidden = true;
  up.panel.classList.remove('has-result');
  $('#url-input').value = '';
  streamBox.hidden = true;
  // ②는 그대로 두되, 반영할 분석 결과가 없어졌으니 ③ 선택 칸을 새 상태로 다시 그린다
  if (webInfo && !si.out.hidden) renderWeb();
  flash('곡 분석을 초기화했습니다. 새 곡을 선택해 주세요.', 'ok');
};

// ② 원곡 정보 초기화: 제목·가수·웹에서 찾은 정보를 지운다. ③에서 웹 정보로 바꿔 둔 분석값은 소리 분석 값으로 되돌린다
$('#song-reset').onclick = () => {
  const has = si.title.value || si.artist.value || webInfo;
  if (has && !confirm('제목·가수와 웹에서 찾은 정보를 지울까요?')) return;
  if (last?.web) {
    delete last.web;
    deriveFromBpm();
    renderResult();
  }
  songInfoSeq++; // 진행 중이던 링크 제목 조회가 다시 채우지 않게
  setSongInfo('', '', '');
  flash('원곡 정보를 초기화했습니다.', 'ok');
};

$('#url-form').onsubmit = (e) => { e.preventDefault(); analyzeUrl($('#url-input').value); };

/* ---------------- 재생 중인 소리 녹음 ----------------
 * 다른 탭에서 재생하는 곡의 소리를 녹음해서 분석한다(화면 공유의 '탭 오디오 공유'). 녹음은 분석에만 쓰고 저장·전송하지 않는다.
 * 90초 녹음은 곡 일부라 곡 전체 흐름(페이드아웃·브레이크다운·점점 고조)은 판단하지 않는다. */
const REC_SECONDS = 90;
const REC_MAX = 360;      // '곡 끝까지'도 6분이면 멈춘다
const REC_QUIET_DB = -50; // 이보다 작으면 소리가 없는 것으로 본다
let rec = null;

async function startRecording(full) {
  if (busy || rec) return flash('지금 다른 곡을 분석하거나 녹음하고 있습니다. 끝난 뒤에 다시 시도해 주세요.', 'warn');
  if (!navigator.mediaDevices?.getDisplayMedia || !window.MediaRecorder) {
    return flash('이 브라우저는 소리 녹음을 지원하지 않습니다. 데스크톱 Chrome이나 Edge에서 이용해 주세요.', 'warn');
  }
  initAudio().catch(() => {});
  let stream;
  try {
    // 크롬은 소리만 공유할 수 없어 화면도 함께 받지만, 녹음에는 소리만 쓴다
    stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true, selfBrowserSurface: 'exclude', systemAudio: 'include' });
  } catch (e) {
    // 공유 창에서 [취소]한 경우도 NotAllowedError라 구분이 어렵다 → 이유와 함께 안내해 '눌러도 아무 일 없음'처럼 보이지 않게
    console.warn('getDisplayMedia', e);
    return flash(e?.name === 'NotAllowedError'
      ? '녹음을 시작하지 못했습니다. 공유 창에서 [취소]했거나 브라우저가 화면 공유를 막았습니다. 다시 눌러 곡이 재생되는 탭을 고르고 "탭 오디오도 공유"를 켜 주세요.'
      : `녹음을 시작하지 못했습니다(${e?.name || e}). 데스크톱 Chrome·Edge 최신 버전에서 시도해 주세요.`, 'warn');
  }
  const tracks = stream.getAudioTracks();
  if (!tracks.length) {
    stream.getTracks().forEach((t) => t.stop());
    return flash('소리가 공유되지 않았습니다. 공유 창에서 곡이 재생되는 탭을 고르고 "탭 오디오도 공유"를 켜 주세요.', 'warn');
  }
  const audio = new MediaStream(tracks);
  const ctx = new AudioContext();
  const meter = ctx.createAnalyser();
  meter.fftSize = 2048;
  ctx.createMediaStreamSource(audio).connect(meter);
  const recorder = new MediaRecorder(audio);
  rec = { stream, recorder, ctx, meter, full, chunks: [], t0: performance.now(), heard: 0, quietSince: 0, cancel: false };
  recorder.ondataavailable = (e) => { if (e.data.size) rec?.chunks.push(e.data); };
  recorder.onstop = finishRecording;
  tracks[0].onended = () => stopRecording(); // 브라우저의 [공유 중지]
  recorder.start(1000);
  rec.timer = setInterval(tickRecording, 250);
  setRecButtons(full);
  tickRecording();
}

// 녹음 방식 토글(곡 끝까지 / 앞부분 90초): 누르면 바로 선택이 바뀌고 기억한다. 녹음은 [● 녹음 시작]으로 한다
let recFull = true;
try { recFull = localStorage.getItem('music.rec.mode') !== 'part'; } catch {}
function renderRecMode() {
  document.querySelectorAll('#rec-mode [data-rec]').forEach((b) => b.setAttribute('aria-checked', String((b.dataset.rec === 'full') === recFull)));
}
// 녹음 중에는 시작 버튼을 빨간 '● 녹음 중'으로 바꾸고 방식 토글을 잠근다. 끝나면 원래대로
function setRecButtons(recording) {
  const b = $('#rec-start');
  b.textContent = recording !== undefined ? '● 녹음 중' : '● 녹음 시작';
  b.classList.toggle('recording', recording !== undefined);
  b.disabled = recording !== undefined;
  document.querySelectorAll('#rec-mode [data-rec]').forEach((x) => { x.disabled = recording !== undefined; });
}

function tickRecording() {
  const sec = (performance.now() - rec.t0) / 1000;
  const buf = new Float32Array(rec.meter.fftSize);
  rec.meter.getFloatTimeDomainData(buf);
  const db = 10 * Math.log10(buf.reduce((s, v) => s + v * v, 0) / buf.length + 1e-12);
  if (db > REC_QUIET_DB) { rec.heard += 0.25; rec.quietSince = 0; } else if (!rec.quietSince) rec.quietSince = sec;
  const limit = rec.full ? REC_MAX : REC_SECONDS;
  // 끝까지 녹음: 소리가 60초 넘게 난 뒤 8초 동안 조용하면 곡이 끝난 것으로 본다.
  // 예전 기준(30초 뒤 4초)은 곡 중간의 조용한 구간·유튜브 버퍼링·일시정지에서도 멈춰 90초쯤에 끝나 버렸다
  const ended = rec.full && rec.heard >= 60 && rec.quietSince && sec - rec.quietSince >= 8;
  if (ended) rec.endedBySilence = true;
  if (sec >= limit || ended) return stopRecording();
  const box = $('#rec-status');
  box.hidden = false;
  $('.bar i', box).style.transform = `scaleX(${rec.full ? 0 : sec / limit})`;
  $('.bar', box).hidden = rec.full; // 곡 길이를 모르면 진행 바 대신 경과 시간만
  $('span', box).textContent = sec >= 5 && rec.heard < 1 ? `녹음 중 ${fmtTime(sec)} · 소리가 들리지 않습니다. 다른 탭에서 곡을 재생해 주세요`
    : rec.full ? `녹음 중 ${fmtTime(sec)} · 곡이 끝나면 자동으로 멈춥니다` : `녹음 중 ${fmtTime(sec)} / ${fmtTime(limit)}`;
}

function stopRecording(cancel = false) {
  if (!rec || rec.recorder.state === 'inactive') return;
  rec.cancel = cancel;
  clearInterval(rec.timer);
  rec.recorder.stop(); // 마지막 조각을 넘긴 뒤 onstop → finishRecording
  rec.stream.getTracks().forEach((t) => t.stop());
  rec.ctx.close();
}

function finishRecording() {
  const { chunks, recorder, full, cancel, heard, endedBySilence } = rec;
  rec = null;
  $('#rec-status').hidden = true;
  setRecButtons();
  if (cancel) return;
  if (endedBySilence) flash('8초 동안 소리가 없어 곡이 끝난 것으로 보고 녹음을 멈췄습니다. 곡 중간이었다면 다시 녹음해 주세요.', 'ok');
  if (heard < 10) return flash('녹음된 소리가 10초도 되지 않아 분석하지 않았습니다. 곡을 재생하면서 다시 녹음해 주세요.', 'warn');
  const type = recorder.mimeType || 'audio/webm';
  const now = new Date();
  const name = `녹음 ${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}.webm`;
  handleFile(new File(chunks, name, { type }), { partial: !full, source: full ? '녹음(곡 전체)' : '녹음(앞부분)' });
}

$('#rec-mode').onclick = (e) => {
  const b = e.target.closest('[data-rec]');
  if (!b || b.disabled) return;
  recFull = b.dataset.rec === 'full';
  try { localStorage.setItem('music.rec.mode', recFull ? 'full' : 'part'); } catch {}
  renderRecMode();
};
renderRecMode();
$('#rec-start').onclick = () => startRecording(recFull);
$('#rec-stop').onclick = () => stopRecording();
$('#rec-cancel').onclick = () => stopRecording(true);

/* ---------------- 분석 방법 탭: [파일][링크] (녹음은 링크 탭 안에서) ---------------- */
function showSrc(src) {
  document.querySelectorAll('#src-tabs [data-src]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.src === src)));
  document.querySelectorAll('#panel-upload .src-pane').forEach((p) => { p.hidden = p.dataset.pane !== src; });
  try { localStorage.setItem('music.upload.src', src); } catch {}
}
$('#src-tabs').onclick = (e) => { const b = e.target.closest('[data-src]'); if (b) showSrc(b.dataset.src); };
try { const s = localStorage.getItem('music.upload.src'); if (['file', 'link'].includes(s)) showSrc(s); } catch {}

/* ---------------- 곡 정보(제목·가수) ----------------
 * 웹 검색에 쓴다. 파일 → MP3 태그(ID3)나 파일 이름, 유튜브 링크 → 영상 제목에서 자동으로 채우고 직접 고칠 수 있다 */
const si = { title: $('#song-title'), artist: $('#song-artist'), src: $('#song-info-src'), find: $('#web-find'), out: $('#web-result') };
const webMark = '<small class="muted" title="웹에서 찾은 원곡 정보로 바꾼 값">· 웹 정보</small>';
let webInfo = null;

function setSongInfo(title, artist, src) {
  webInfo = null; // 다른 곡이 되면 이전 곡의 웹 정보는 쓰지 않는다
  si.title.value = title;
  si.artist.value = artist;
  si.src.textContent = src;
  si.out.hidden = true;
  si.out.replaceChildren();
}
// "가수 - 제목" 꼴이면 나눈다. 대괄호 꼬리표(방송·공식 MV 등)와 " | " 뒤는 뺀다
function splitTitle(raw) {
  let t = raw.replace(/\.[a-z0-9]{2,4}$/i, '').replace(/_+/g, ' ').split(/\s[|｜]\s/)[0];
  t = t.replace(/\[[^\]]*\]|【[^】]*】/g, '')
    .replace(/\((?:official|mv|m\/v|lyrics?|audio|live|band ver|narr\.?|feat\.?|ft\.|prod\.?|[^)]*방송|[^)]*ver\.?)[^)]*\)/gi, '')
    .replace(/\s+/g, ' ').trim();
  const m = t.match(/^(.+?)\s[-–]\s(.+)$/);
  return m ? { artist: m[1].trim(), title: m[2].trim() } : { artist: '', title: t };
}
// 곡 정보 채우기 요청 번호: 늦게 끝난 이전 요청(예: 유튜브 제목 조회)이 새 곡 정보를 덮어쓰지 않게 한다
let songInfoSeq = 0;
// ②에서 이미 웹 정보를 찾았으면(예: 인기곡 → 원곡 정보 찾기 후 ①에 링크·파일을 넣음) 제목·가수·웹 정보를 그대로 둔다.
// 다른 곡이면 ②의 [초기화]로 지우면 된다
function keepWebInfo() {
  if (!webInfo) return false;
  si.src.textContent = '②에서 찾은 원곡 정보를 그대로 둡니다. 다른 곡이면 ② [초기화] 후 다시 찾아 주세요.';
  return true;
}
async function songInfoFromFile(file) {
  if (keepWebInfo()) return;
  const seq = ++songInfoSeq;
  const tag = await readId3(file).catch(() => null);
  if (seq !== songInfoSeq || keepWebInfo()) return;
  // Suno로 만든 곡은 태그의 가수가 Suno 아이디라 웹 검색을 방해한다 → 가수는 비우고 ②를 건너뛰어도 된다고 알린다
  if (tag?.title && tag.suno) return setSongInfo(tag.title, '', 'Suno로 만든 곡이에요(파일 태그). 웹에는 정보가 없을 수 있어 ②는 건너뛰어도 돼요.');
  if (tag?.title) return setSongInfo(tag.title, tag.artist || '', '파일의 곡 정보 태그에서 가져왔습니다. 다르면 고쳐 주세요.');
  const g = splitTitle(file.name);
  setSongInfo(g.title, g.artist, '파일 이름에서 가져왔습니다. 다르면 고쳐 주세요.');
}
async function songInfoFromLink(href) {
  if (keepWebInfo()) return;
  const seq = ++songInfoSeq;
  si.src.textContent = '링크에서 곡 제목을 가져오는 중…';
  try {
    const d = await describeApi({ resolve: href });
    if (seq !== songInfoSeq || keepWebInfo()) return;
    const g = splitTitle(d.title || '');
    setSongInfo(g.title, g.artist, `영상 제목 "${d.title}"에서 가져왔습니다. 다르면 고쳐 주세요.`);
  } catch (e) {
    if (seq !== songInfoSeq || webInfo) return;
    si.src.textContent = e.message === 'NO_SERVER'
      ? '링크 제목 가져오기는 배포 사이트에서만 됩니다. 제목을 직접 입력해 주세요.'
      : `제목을 가져오지 못했습니다(${e.message}). 직접 입력해 주세요.`;
  }
}

// MP3 앞부분의 ID3v2 태그에서 제목(TIT2/TT2)·가수(TPE1/TP1)만 읽는다
async function readId3(file) {
  const buf = new Uint8Array(await file.slice(0, 512 * 1024).arrayBuffer());
  if (buf[0] !== 0x49 || buf[1] !== 0x44 || buf[2] !== 0x33) return null; // "ID3"
  const ver = buf[3];
  const syncsafe = (i) => (buf[i] << 21) | (buf[i + 1] << 14) | (buf[i + 2] << 7) | buf[i + 3];
  const end = Math.min(buf.length, 10 + syncsafe(6));
  let p = 10;
  if ((buf[5] & 0x40) && ver >= 3) p += ver === 4 ? syncsafe(10) : ((buf[10] << 24) | (buf[11] << 16) | (buf[12] << 8) | buf[13]) + 4;
  const text = (b) => {
    const label = ['latin1', 'utf-16', 'utf-16be', 'utf-8'][b[0]] ?? 'utf-8';
    return new TextDecoder(label).decode(b.subarray(1)).split('\0')[0].trim();
  };
  const head = ver === 2 ? 6 : 10;
  const out = {};
  while (p + head <= end) {
    const id = String.fromCharCode(...buf.subarray(p, p + (ver === 2 ? 3 : 4)));
    if (!/^[A-Z0-9]{3,4}$/.test(id)) break;
    const size = ver === 2 ? (buf[p + 3] << 16) | (buf[p + 4] << 8) | buf[p + 5]
      : ver === 4 ? syncsafe(p + 4)
      : (buf[p + 4] << 24) | (buf[p + 5] << 16) | (buf[p + 6] << 8) | buf[p + 7];
    if (size <= 0) break;
    const body = buf.subarray(p + head, p + head + size);
    if (id === 'TIT2' || id === 'TT2') out.title = text(body);
    if (id === 'TPE1' || id === 'TP1') out.artist = text(body);
    // Suno 다운로드 파일: 주석에 'made with suno', 주소 태그에 suno.com/song/…
    if (['WOAS', 'COMM', 'TXXX', 'COM', 'WAS'].includes(id) && /suno\.com|made with suno/i.test(new TextDecoder('latin1').decode(body).replace(/\0/g, ''))) out.suno = true;
    p += head + size;
  }
  return out.title ? out : null;
}

/* ---------------- 웹에서 원곡 정보 찾기 ----------------
 * hub /api/music/describe: Last.fm 태그 + Tavily 웹 검색 결과를 LLM이 정리해 리듬·분위기를 Style Builder 값으로 돌려준다.
 * 근거(출처)가 없으면 found=false. [분석값 대신 이 값 쓰기]를 누르면 소리 분석으로 추정한 리듬·분위기 대신 쓴다 */
async function describeApi(body) {
  const r = await fetch('/api/music/describe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => null);
  if (!r.ok || !d) throw new Error(d?.error || ([404, 405, 501].includes(r.status) ? 'NO_SERVER' : `HTTP ${r.status}`));
  return d;
}

function applyWebOverride() {
  if (!last?.web) return;
  const w = last.web;
  if (w.rhythm.length) last.feel = [...w.rhythm];
  if (w.mood.length) last.hints.mood = [...w.mood];
  if (w.energy) last.hints.energy = w.energy;
}

function renderWeb() {
  const w = webInfo;
  const box = si.out;
  box.hidden = false;
  // Last.fm 태그(청취자들이 붙인 꼬리표)는 분위기 단서로 함께 보여 준다. 출처 링크는 보이지 않는다
  const tagRow = w.tags.length ? `<div class="chips"><span class="w-label">Last.fm 태그</span>${w.tags.map((t) => `<span class="chip">${esc(t)}</span>`).join('')}</div>` : '';
  if (!w.found) {
    box.innerHTML = `<p>웹에서 <b>${esc(w.query)}</b>의 주제·리듬·분위기 정보를 찾지 못했습니다. 제목·가수를 정확히 적었는지 확인해 주세요. 직접 만든 곡(Suno 등)은 웹에 정보가 없으니 소리 분석 결과를 쓰면 됩니다.</p>${tagRow}`;
    return;
  }
  const chips = (key, vals) => vals.map((v) => `<span class="chip on">${OPTION_KO[key]?.[v] ?? esc(v)}</span>`).join('') || '<span class="muted">근거 없음</span>';
  box.innerHTML = `
    <h4>웹에서 찾은 원곡 정보: ${esc(w.song)}${w.artist ? ` — ${esc(w.artist)}` : ''}</h4>
    ${w.themeKo ? `<p><b>주제</b> ${esc(w.themeKo)}</p>` : ''}
    ${w.rhythmKo ? `<p><b>리듬</b> ${esc(w.rhythmKo)}</p>` : ''}
    ${w.moodKo ? `<p><b>분위기</b> ${esc(w.moodKo)}</p>` : ''}
    <div class="chips"><span class="w-label">리듬</span>${chips('feel', w.rhythm)}</div>
    <div class="chips"><span class="w-label">분위기</span>${chips('mood', w.mood)}${w.energy ? chips('energy', [w.energy]) : ''}</div>
    ${tagRow}
    <div class="w-step">
      <h3 class="step-h"><span class="step-n">3</span>반영 여부 선택</h3>
      <div class="w-foot">${last?.web
        ? `<b class="w-state">✓ 웹 정보로 바꿨습니다</b><button class="ghost" id="web-undo">소리 분석 값으로 되돌리기</button>`
        : `<button class="primary" id="web-apply">웹 정보로 바꾸기</button><button class="ghost" id="web-keep">소리 분석 값 유지</button>${w.kept ? '<b class="w-state">✓ 소리 분석 값을 유지합니다</b>' : ''}`}
        <small class="muted">바꾸면 위 분석 결과의 리듬·분위기·에너지와 Suno Style이 함께 바뀝니다.</small>
      </div>
    </div>`;
  const apply = $('#web-apply', box);
  if (apply) apply.onclick = () => {
    if (!last) return flash('먼저 곡을 분석해 주세요. 분석이 끝나면 이 값으로 바꿀 수 있습니다.', 'warn');
    w.kept = false;
    last.web = { rhythm: w.rhythm, mood: w.mood, energy: w.energy };
    applyWebOverride();
    renderResult();
    renderWeb();
    flash('웹에서 찾은 리듬·분위기로 바꿨습니다.', 'ok');
  };
  const keep = $('#web-keep', box);
  if (keep) keep.onclick = () => { w.kept = true; renderWeb(); };
  const undo = $('#web-undo', box);
  if (undo) undo.onclick = () => { delete last.web; deriveFromBpm(); renderResult(); renderWeb(); flash('소리 분석으로 추정한 값으로 되돌렸습니다.', 'ok'); };
}

si.find.onclick = async () => {
  const title = si.title.value.trim(), artist = si.artist.value.trim();
  if (!title) { si.title.focus(); return flash('곡 제목을 입력해 주세요. 제목을 알아야 웹에서 원곡을 찾을 수 있습니다.', 'warn'); }
  si.find.disabled = true;
  const label = si.find.textContent;
  si.find.textContent = '찾는 중…';
  try {
    webInfo = await describeApi({ title, artist });
    webInfo.query = artist ? `${artist} - ${title}` : title;
    renderWeb();
  } catch (e) {
    flash(e.message === 'NO_SERVER' ? '웹 검색은 허브가 있는 배포 사이트에서만 됩니다.' : `원곡 정보를 찾지 못했습니다: ${e.message}`, 'error');
  } finally {
    si.find.disabled = false;
    si.find.textContent = label;
  }
};
[si.title, si.artist].forEach((x) => x.addEventListener('keydown', (e) => { if (e.key === 'Enter') si.find.click(); }));

// 결과가 있을 때 접어 둔 가져오기 칸(파일·링크)을 다시 연다
$('#src-again').onclick = () => up.panel.classList.add('src-open');
