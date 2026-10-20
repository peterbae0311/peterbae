/* 곡 업로드 → 분석 → 믹서에 조합 적용 */

const ANALYSIS_SCRIPTS = [
  'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.19.2/dist/ort.min.js',
  'https://cdn.jsdelivr.net/npm/essentia.js@0.1.3/dist/essentia-wasm.web.js',
  'https://cdn.jsdelivr.net/npm/essentia.js@0.1.3/dist/essentia.js-core.umd.js',
  'analyzer.js?v=20261020r',
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

async function handleFile(file) {
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
    const mix = Analyzer.toMixer(res, MAX_ACTIVE);
    const semis = Analyzer.keyShift(res.key, res.scale);
    last = { res, mix, semis, intro: Analyzer.introPick(res), feel: Analyzer.rhythmFeels(res), hints: Analyzer.styleHints(res, mix) };
    if (lastAudioUrl) URL.revokeObjectURL(lastAudioUrl);
    lastAudioUrl = URL.createObjectURL(file);
    renderResult();
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
  const bpmNote = Math.round(res.bpmRaw) !== res.bpm ? `<small>(분석값 ${Math.round(res.bpmRaw)} → 범위에 맞춤)</small>` : '';
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
        <div><b>${esc(res.name)}</b><small>${fmtTime(res.duration)} · 가운데 구간 분석</small></div>
        <button class="ghost" id="r-pick">다른 곡 선택</button>
      </div>
      <audio controls src="${lastAudioUrl}" title="원곡을 재생하면 믹서는 멈춥니다"></audio>
      <div class="r-stats"><b>${res.bpm}</b> BPM ${bpmNote} · <b>${res.key} ${res.scale === 'minor' ? 'minor' : 'major'}</b> <small>${keyNote}</small></div>
      <button class="primary" id="r-apply" title="분석한 악기·BPM·코드 진행으로 되돌려 다시 재생">이 조합 다시 켜기</button>
    </div>
    <div class="r-mid">
      <div class="r-row"><span class="r-label">장르</span><div class="chips">${genres}</div></div>
      <div class="r-row"><span class="r-label">리듬</span><div class="chips">${optChips('feel', feel)}</div></div>
      <div class="r-row"><span class="r-label">분위기</span><div class="chips">${optChips('mood', hints.mood)}${optChips('energy', [hints.energy])}</div></div>
      <div class="r-row"><span class="r-label">편곡</span><div class="chips">${optChips('arr', hints.arr)}</div></div>
      <div class="r-row"><span class="r-label">사운드</span><div class="chips">${optChips('mix', hints.mix)}</div></div>
      <div class="r-row"><span class="r-label">인식된 악기</span><div class="chips">${detected}</div></div>
      <div class="r-row"><span class="r-label">켜진 악기</span><div class="chips">${picked}</div></div>
      <div class="r-row"><span class="r-label">도입부 악기</span><div class="chips">${
        intro?.drumFill ? `<span class="chip on" style="--c:${catById.drums.color}" title="앞 6초의 드럼 점수가 높아 드럼 필로 시작하는 곡으로 봤습니다">드럼 필</span>${
          intro.bass ? `<span class="chip on" style="--c:${catById[byId[intro.bass].cat].color}" title="앞 6초에 베이스도 두드러집니다">${byId[intro.bass].ko}</span>` : ''}`
        : intro ? `<span class="chip on" style="--c:${catById[byId[intro.id].cat].color}" title="앞 6초에서 가장 두드러진 악기">${byId[intro.id].ko}</span>`
        : '<span class="muted">뚜렷한 악기가 없습니다</span>'}</div></div>
      ${unsupported.length ? `<p class="muted r-note">${unsupported.join(', ')}은(는) 믹서에 없는 악기라 제외했습니다.</p>` : ''}
    </div>
    <div class="r-style">
      ${fmtTabsHtml('r-fmt')}
      <div class="r-style-box">
        <textarea id="r-style" rows="9" readonly aria-label="곡 분석으로 만든 Suno Style"></textarea>
        <button type="button" class="sd-copy" id="r-copy-style" aria-label="Suno Style 복사" title="Suno Style 복사"><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
      </div>
      <small class="muted">분석으로 추정한 값입니다(1~9번). 보컬과 세부 조정은 Suno Style Builder 탭의 [곡 분석 불러오기]로 이어서 고를 수 있습니다.</small>
    </div>`;
  const outs = songStyleOut(last);
  $('#r-style').value = outs[styleFmt];
  bindFmtTabs($('#r-fmt'), (f) => { $('#r-style').value = outs[f]; });
  $('#r-copy-style').onclick = async (e) => {
    const btn = e.currentTarget;
    if (!(await copyText($('#r-style').value))) return;
    btn.classList.add('done');
    setTimeout(() => btn.classList.remove('done'), 1200);
    flash('Suno Style을 복사했습니다.', 'ok');
  };
  up.result.hidden = false;
  // 결과가 있으면 큰 파일 선택 칸은 숨기고 '다른 곡 선택' 버튼으로 대신한다(세로 공간 확보)
  up.panel.classList.add('has-result');
  $('#r-pick').onclick = () => up.file.click();
  $('#r-apply').onclick = () => markPreset(null) || applyCombo(mix.picks.map((p) => p.id), res.bpm, semis);
  // 원곡과 믹서가 겹쳐 들리지 않게 한쪽만 재생
  $('audio', up.result).onplay = () => stopTransport();
}

up.file.onchange = () => handleFile(up.file.files[0]);
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
up.panel.addEventListener('drop', (e) => handleFile(e.dataTransfer.files[0]));
