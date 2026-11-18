/* 업로드한 곡 분석: BPM·키(Essentia.js) + 장르·악기 인식(Essentia Discogs-EffNet → MTG-Jamendo 악기 헤드, onnxruntime-web).
 * 모든 처리는 브라우저 안에서만 하며 곡 파일은 어디에도 전송하지 않는다.
 * 모델(CC BY-NC-SA 4.0, MTG/UPF)은 essentia.upf.edu가 CORS를 허용하지 않아 models/에 두고 같은 출처에서 읽는다. */

const Analyzer = (() => {
  const EFFNET_URL = 'models/discogs-effnet-bsdynamic-1.onnx';
  const HEAD_URL = 'models/mtg_jamendo_instrument-discogs-effnet-1.onnx';
  const META_URLS = ['models/discogs-effnet-bsdynamic-1.json', 'models/mtg_jamendo_instrument-discogs-effnet-1.json'];
  const ANALYZE_SECONDS = 90; // 곡 가운데 구간만 분석 (전체를 돌리면 수 분 걸림)
  const INTRO_SECONDS = 6; // 도입부 악기는 앞부분만 따로 본다(가운데 구간에는 인트로가 들어가지 않음). 길게 보면 곡 내내 깔리는 악기가 섞인다

  let essentiaP, modelsP;

  function loadEssentia() {
    return (essentiaP ??= EssentiaWASM().then((wasm) => new Essentia(wasm)));
  }

  function loadModels() {
    return (modelsP ??= (async () => {
      ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.19.2/dist/';
      const [effnet, head, ...metas] = await Promise.all([
        ort.InferenceSession.create(EFFNET_URL, { executionProviders: ['wasm'] }),
        ort.InferenceSession.create(HEAD_URL, { executionProviders: ['wasm'] }),
        ...META_URLS.map((u) => fetch(u).then((r) => r.json())),
      ]);
      return { effnet, head, genres: metas[0].classes, instruments: metas[1].classes };
    })().catch((e) => { modelsP = null; throw e; }));
  }

  // decodeAudioData는 컨텍스트의 샘플레이트로 리샘플해 주므로 원하는 레이트로 바로 디코딩한다.
  async function decodeMono(arrayBuffer, sampleRate) {
    const buf = await new OfflineAudioContext(1, 1, sampleRate).decodeAudioData(arrayBuffer.slice(0));
    const n = buf.length;
    const out = new Float32Array(n);
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < n; i++) out[i] += d[i] / buf.numberOfChannels;
    }
    return { signal: out, duration: buf.duration, width: stereoWidth(buf) };
  }

  // 좌우 차이(side)와 합(mid)의 에너지 비. 모노면 0, 좌우가 많이 다를수록 커진다
  function stereoWidth(buf) {
    if (buf.numberOfChannels < 2) return 0;
    const l = buf.getChannelData(0), r = buf.getChannelData(1);
    let mid = 0, side = 0;
    for (let i = 0; i < l.length; i += 4) {
      const m = l[i] + r[i], s = l[i] - r[i];
      mid += m * m; side += s * s;
    }
    return mid ? Math.sqrt(side / mid) : 0;
  }

  // 0.5초 단위 음량(dB) — 페이드아웃·브레이크다운·점점 고조를 찾는 데 쓴다
  const ENV_STEP = 0.5;
  function loudnessEnvelope(sig, sr) {
    const w = Math.floor(sr * ENV_STEP);
    const env = [];
    for (let i = 0; i + w <= sig.length; i += w) {
      let e = 0;
      for (let j = i; j < i + w; j++) e += sig[j] * sig[j];
      env.push(10 * Math.log10(e / w + 1e-12));
    }
    return env;
  }

  const middle = (sig, sr, seconds) => {
    const len = Math.min(sig.length, Math.floor(seconds * sr));
    const start = Math.floor((sig.length - len) / 2);
    return sig.subarray(start, start + len);
  };

  const tick = () => new Promise((r) => setTimeout(r, 0)); // 진행 표시가 그려질 틈

  // TensorflowPredictEffnetDiscogs와 같은 입력: 16kHz, 512/256 프레임의 96밴드 멜, 128프레임 패치(홉 62)
  function melPatches(essentia, sig) {
    const FRAME = 512, HOP = 256, BANDS = 96, PATCH = 128, PATCH_HOP = 62;
    const nFrames = Math.floor((sig.length - FRAME) / HOP) + 1;
    const mel = new Float32Array(nFrames * BANDS);
    for (let f = 0; f < nFrames; f++) {
      const v = essentia.arrayToVector(sig.subarray(f * HOP, f * HOP + FRAME));
      const bands = essentia.vectorToArray(essentia.TensorflowInputMusiCNN(v).bands);
      mel.set(bands, f * BANDS);
      v.delete?.();
    }
    const nPatches = Math.max(1, Math.floor((nFrames - PATCH) / PATCH_HOP) + 1);
    const patches = [];
    for (let p = 0; p < nPatches; p++) {
      const data = new Float32Array(PATCH * BANDS);
      data.set(mel.subarray(p * PATCH_HOP * BANDS, Math.min(mel.length, (p * PATCH_HOP + PATCH) * BANDS)));
      patches.push(data);
    }
    return patches;
  }

  async function runModels(models, patches, onProgress) {
    const BATCH = 8;
    const genreSum = new Float32Array(models.genres.length);
    const instSum = new Float32Array(models.instruments.length);
    const instMax = new Float32Array(models.instruments.length);
    for (let i = 0; i < patches.length; i += BATCH) {
      const chunk = patches.slice(i, i + BATCH);
      const input = new Float32Array(chunk.length * 128 * 96);
      chunk.forEach((p, k) => input.set(p, k * 128 * 96));
      const out = await models.effnet.run({ [models.effnet.inputNames[0]]: new ort.Tensor('float32', input, [chunk.length, 128, 96]) });
      const tensors = Object.values(out);
      const preds = tensors.find((t) => t.dims[1] === models.genres.length);
      const emb = tensors.find((t) => t.dims[1] === 1280);
      preds.data.forEach((v, j) => (genreSum[j % genreSum.length] += v));

      const headOut = await models.head.run({ [models.head.inputNames[0]]: new ort.Tensor('float32', emb.data, [chunk.length, 1280]) });
      const probs = Object.values(headOut).find((t) => t.dims[t.dims.length - 1] === models.instruments.length && t.data.every((x) => x >= 0 && x <= 1));
      probs.data.forEach((v, j) => {
        const c = j % instSum.length;
        instSum[c] += v;
        instMax[c] = Math.max(instMax[c], v);
      });
      onProgress?.(0.35 + 0.6 * Math.min(1, (i + BATCH) / patches.length), '악기·장르 인식 중');
      await tick();
    }
    const n = patches.length;
    const instruments = Object.fromEntries(models.instruments.map((c, j) => [c, { mean: instSum[j] / n, max: instMax[j] }]));
    const genres = models.genres.map((c, j) => [c, genreSum[j] / n]).sort((a, b) => b[1] - a[1]);
    return { instruments, genres };
  }

  function normalizeBpm(bpm) {
    if (!bpm || !isFinite(bpm)) return 120;
    while (bpm < 60) bpm *= 2;
    while (bpm > 180) bpm /= 2;
    return Math.round(bpm);
  }

  async function analyze(file, onProgress) {
    onProgress?.(0.02, '파일 읽는 중');
    const ab = await file.arrayBuffer();
    onProgress?.(0.05, '분석 엔진 불러오는 중');
    const [essentia, models, hi, lo] = await Promise.all([
      loadEssentia(),
      loadModels(),
      decodeMono(ab, 44100),
      decodeMono(ab, 16000),
    ]);

    onProgress?.(0.15, '템포·키 분석 중');
    await tick();
    const seg = middle(hi.signal, 44100, 60);
    const segVec = essentia.arrayToVector(seg);
    const rhythm = essentia.RhythmExtractor2013(segVec, 208, 'degara', 40);
    const key = essentia.KeyExtractor(segVec);
    segVec.delete?.();

    onProgress?.(0.3, '스펙트럼 계산 중');
    await tick();
    const patches = melPatches(essentia, middle(lo.signal, 16000, ANALYZE_SECONDS));
    const { instruments, genres } = await runModels(models, patches, onProgress);

    onProgress?.(0.96, '도입부 분석 중');
    await tick();
    const intro = await runModels(models, melPatches(essentia, lo.signal.subarray(0, INTRO_SECONDS * 16000)));
    onProgress?.(0.98, '곡 구조 분석 중');
    await tick();
    // 두 배로 잡힌 템포면 마디가 반으로 쪼개지므로 보정한 템포로 마디를 센다
    const tempoForBars = slowTempoFix({ bpm: normalizeBpm(rhythm.bpm), genres }) ? normalizeBpm(rhythm.bpm) / 2 : normalizeBpm(rhythm.bpm);
    const bars = barFeatures(lo.signal, 16000, tempoForBars);

    onProgress?.(1, '완료');
    return {
      name: file.name,
      duration: hi.duration,
      bpmRaw: rhythm.bpm,
      bpm: normalizeBpm(rhythm.bpm),
      key: key.key, scale: key.scale, keyStrength: key.strength,
      instruments, genres, introInstruments: intro.instruments,
      envelope: loudnessEnvelope(hi.signal, 44100), width: hi.width,
      bars,
    };
  }

  /* ---------------- 원곡 멜로디 추출 ----------------
   * 곡의 한 구간(보통 첫 후렴)에서 가장 두드러진 음높이(보컬·주선율)를 Melodia(PredominantPitchMelodia)로 따라가
   * 음표로 바꾼다. 반주가 섞인 곡에서도 '가장 크게 들리는 선율'을 찾지만, 리버브가 많거나 악기가 겹치면 음이 틀릴 수 있다.
   *  - 2.9ms마다 음높이(Hz) → MIDI 음, 5프레임 중앙값으로 떨림을 줄인다
   *  - 반음 0.6 넘게 바뀌거나 소리가 끊기면 새 음표. 90ms보다 짧은 음은 버린다(장식음·잡음)
   *  - 박자에 맞춰 16분음표 칸으로 반올림한다(구간 시작을 0으로) */
  // 음높이 추적: start초부터 dur초 동안 2.9ms마다 MIDI 음(소리 없으면 0), 5프레임 중앙값으로 떨림을 줄인다
  async function pitchTrack(file, start, dur) {
    const essentia = await loadEssentia();
    const sr = 44100;
    const { signal } = await decodeMono(await file.arrayBuffer(), sr);
    const a = Math.max(0, Math.floor(start * sr)), z = Math.min(signal.length, Math.floor((start + dur) * sr));
    const v = essentia.arrayToVector(signal.subarray(a, z));
    const eq = essentia.EqualLoudness(v).signal;
    const r = essentia.PredominantPitchMelodia(eq, 10, 3, 2048, false, 0.8, 128, 1, 40, 20000, 100, 80, 20, 0.9, 0.9, 27.5625, 55, sr, 100, false, 0.2);
    const hz = essentia.vectorToArray(r.pitch);
    v.delete?.(); eq.delete?.();
    const raw = Array.from(hz, (f) => (f > 0 ? 69 + 12 * Math.log2(f / 440) : 0));
    const med = raw.map((m, i) => {
      if (!m) return 0;
      const w = raw.slice(Math.max(0, i - 2), i + 3).filter(Boolean).sort((x, y) => x - y);
      return w[Math.floor(w.length / 2)];
    });
    return { med, hop: 128 / sr, start: a / sr };
  }

  // track: 이미 따 둔 음높이(예: 노래 흐름 분석의 곡 전체)가 있으면 그 구간만 잘라 쓴다(다시 따지 않아 빠름)
  async function extractMelody(file, start, dur, bpm, track = null) {
    let med, hop;
    if (track) {
      hop = track.hop;
      med = track.med.slice(Math.max(0, Math.round((start - track.start) / hop)), Math.round((start + dur - track.start) / hop));
    } else ({ med, hop } = await pitchTrack(file, start, dur));
    const notes = [];
    let cur = null;
    const close = (i) => {
      if (cur && (i - cur.i0) * hop >= 0.09) {
        const ms = med.slice(cur.i0, i).filter(Boolean).sort((x, y) => x - y);
        notes.push({ midi: Math.round(ms[Math.floor(ms.length / 2)]), start: cur.i0 * hop, dur: (i - cur.i0) * hop });
      }
      cur = null;
    };
    med.forEach((m, i) => {
      if (!m) { close(i); return; }
      if (cur && Math.abs(m - cur.ref) > 0.6) close(i);
      if (!cur) cur = { i0: i, ref: m };
      else cur.ref = cur.ref * 0.9 + m * 0.1;
    });
    close(med.length);
    // 16분음표 칸으로: 같은 칸에서 시작하면 긴 음만, 겹치면 앞 음을 줄인다
    const step = 60 / (bpm || 120) / 4;
    const q = [];
    for (const n of notes) {
      const s0 = Math.round(n.start / step), len = Math.max(1, Math.round(n.dur / step));
      const prev = q[q.length - 1];
      if (prev && prev.s0 === s0) { if (len > prev.len) Object.assign(prev, { midi: n.midi, len }); continue; }
      if (prev && prev.s0 + prev.len > s0) prev.len = Math.max(1, s0 - prev.s0);
      q.push({ midi: n.midi, s0, len });
    }
    return { notes: q, step, start, dur };
  }


  /* ---------------- 구간별 노래 흐름 ----------------
   * 곡 전체 음높이(pitchTrack)와 마디별 크기(r.bars)로 구간마다 '어떻게 부르는지'를 한글·영어 문장으로 만든다.
   * 구간을 앞·중간·끝 셋으로 나눠 음높이·크기 흐름을 보고, 곡 분위기(단조·감성 계열이면 애절·쓸쓸)를 얹는다.
   * 값은 곡 안에서의 상대 비교(곡 노래 구간의 중앙값 기준)라 곡마다 기준이 맞춰진다. 소리로 해석한 것이라 실제 느낌과 다를 수 있다 */
  const pct = (arr, p) => { const a = arr.filter(Boolean).sort((x, y) => x - y); return a.length ? a[Math.min(a.length - 1, Math.floor(a.length * p))] : 0; };
  function sectionDelivery(r, secs, track, sad) {
    const pitchIn = (t0, t1) => {
      const a = Math.max(0, Math.floor((t0 - track.start) / track.hop)), z = Math.min(track.med.length, Math.floor((t1 - track.start) / track.hop));
      return track.med.slice(a, z);
    };
    const dbIn = (t0, t1) => avg(r.bars.filter((b) => b.t >= t0 && b.t < t1).map((b) => b.db));
    const singing = secs.filter((x) => !/^(Intro|Outro|Interlude|Instrumental|Post-Chorus)/.test(x.name));
    const allP = singing.flatMap((x) => pitchIn(x.start, x.end));
    const songMed = pct(allP, 0.5), songHi = pct(allP, 0.9);
    const songDb = pct(singing.map((x) => dbIn(x.start, x.end)), 0.5);
    let chorusDb = null;
    return secs.map((x) => {
      const span = x.end - x.start;
      const th = [0, 1, 2].map((k) => {
        const t0 = x.start + (span * k) / 3, t1 = x.start + (span * (k + 1)) / 3;
        const p = pitchIn(t0, t1);
        return { p: pct(p, 0.5), hi: pct(p, 0.9), db: dbIn(t0, t1), voiced: p.filter(Boolean).length / Math.max(1, p.length) };
      });
      const P = pct(pitchIn(x.start, x.end), 0.5) - songMed;
      const L = dbIn(x.start, x.end) - songDb;
      const rise = th[2].p - th[0].p >= 2 || th[2].db - th[0].db >= 2;
      const ko = [], en = [];
      const add = (k, e) => { ko.push(k); en.push(e); };
      const name = x.name;
      if (/^Intro/.test(name)) add('악기로 분위기를 여는 도입', 'instrumental opening that sets the mood');
      else if (/^(Interlude|Instrumental|Post-Chorus)/.test(name)) add('노래를 쉬어 가는 간주', 'instrumental break');
      else if (/^Outro/.test(name)) add('여운을 남기며 마무리', 'lingering, fading ending');
      else if (/Chorus$/.test(name) && !/Pre/.test(name)) {
        const fin = /^Final/.test(name);
        if (fin && chorusDb !== null && L - chorusDb >= 1) add('가장 크게', 'the biggest, fullest chorus');
        // 앞: 낮게 시작하면 애절·부드럽게, 높게 시작하면 처음부터 힘차게
        if (th[0].p && th[0].p <= songMed + 0.5) add(sad ? '초반은 낮고 애절하게' : '초반은 낮고 부드럽게', sad ? 'low and yearning start' : 'low, gentle start');
        else add('처음부터 힘차게', 'powerful from the first line');
        // 중간: 곡 최고음 근처면 고음 폭발
        if (Math.max(th[1].hi, th[1].p) >= songHi - 1) add('중간에서 고음으로 감정 폭발', 'soaring high notes and an emotional peak in the middle');
        else if (th[1].p - th[0].p >= 1.5) add('중간으로 갈수록 고조', 'building intensity in the middle');
        // 끝: 중간보다 내려가면 하강
        if (th[2].p && th[2].p <= th[1].p - 1.5) add(sad ? '마지막은 쓸쓸하고 아름다운 하강 멜로디' : '마지막은 부드럽게 내려앉는 멜로디', sad ? 'wistful, beautiful falling melody at the end' : 'gently falling melody at the end');
        else add('끝까지 힘 있게', 'strong to the end');
        if (!fin) chorusDb = L;
      } else if (/Pre-?Chorus/.test(name)) {
        if (rise) add('서서히 감정 상승', 'gradual emotional build-up');
        else add('후렴을 향해 긴장감 유지', 'steady tension leading into the chorus');
      } else if (/^Bridge/.test(name)) {
        if (L <= -1.5) add('악기를 덜어 낸 고요한 분위기', 'stripped-back, intimate mood');
        else add('새로운 분위기로 전환', 'a fresh turn in mood');
        if (rise) add('점점 고조', 'building up');
      } else {
        // 벌스 등: 크기·음높이로 말투를 정한다
        if (L <= -1 && P <= 0) add('담담하고 절제된 목소리', 'restrained, understated vocals');
        else if (L >= 1.5) add('힘 있는 목소리', 'strong, confident vocals');
        else add('이야기하듯 자연스럽게', 'natural, conversational vocals');
        if (rise) add('뒤로 갈수록 조금씩 고조', 'slowly building toward the end');
      }
      return { ...x, ko: ko.join(', '), en: en.join(', ') };
    });
  }

  /* ---------------- 인식 결과 → 믹서 악기 ---------------- */

  // 모델이 아는 40개 악기 중 믹서에 대응하는 악기가 없는 것
  const UNSUPPORTED = { accordion: '아코디언', bell: '벨', clarinet: '클라리넷', flute: '플루트', harmonica: '하모니카', harp: '하프', oboe: '오보에', pipeorgan: '파이프 오르간', voice: '보컬' };

  const INST_KO = {
    acousticbassguitar: '어쿠스틱 베이스', acousticguitar: '어쿠스틱 기타', bass: '베이스', beat: '비트', bongo: '봉고', brass: '브라스',
    cello: '첼로', classicalguitar: '클래식 기타', computer: '컴퓨터 음악', doublebass: '더블 베이스', drummachine: '드럼 머신', drums: '드럼',
    electricguitar: '일렉트릭 기타', electricpiano: '일렉트릭 피아노', guitar: '기타', horn: '호른', keyboard: '키보드', orchestra: '오케스트라',
    organ: '오르간', pad: '패드', percussion: '퍼커션', piano: '피아노', rhodes: '로즈', sampler: '샘플러', saxophone: '색소폰',
    strings: '스트링스', synthesizer: '신시사이저', trombone: '트롬본', trumpet: '트럼펫', viola: '비올라', violin: '바이올린', ...UNSUPPORTED,
  };

  const PRESENT = 0.12; // 패치 평균 확률이 이 이상이면 쓰인 악기로 본다(테스트 곡으로 맞춘 값)

  function toMixer(result, maxCount) {
    const inst = (k) => result.instruments[k]?.mean ?? 0;
    // 400개 중 작은 값까지 더하면 넓은 패턴일수록 부풀려지므로 상위 장르만 본다
    const genre = (re) => result.genres.slice(0, 15).reduce((s, [c, v]) => (re.test(c) ? s + v : s), 0);
    const picks = new Map(); // mixer id -> { score, from }
    const add = (id, score, from) => {
      if (score < PRESENT * 0.5) return;
      const cur = picks.get(id);
      if (!cur || cur.score < score) picks.set(id, { score, from });
    };
    const present = (k) => inst(k) >= PRESENT;

    // 드럼: 하나만 고르고 스타일은 장르로 정한다
    const drumScore = Math.max(inst('drums'), inst('beat'), inst('drummachine'));
    if (drumScore >= PRESENT) {
      const styles = [
        ['trap', genre(/Trap|Cloud Rap|Drill|Crunk|Phonk/)],
        ['boombap', genre(/Boom Bap|Jazzy Hip-Hop|Hip Hop---Instrumental|Conscious|Trip Hop|Lo-Fi|Hardcore Hip-Hop|Gangsta/)],
        ['brushes', genre(/^Jazz---(?!Jazz-Funk|Fusion|Acid Jazz)|Swing|Big Band/)],
        ['electronic-drums', genre(/House|Techno|Trance|EDM|Dubstep|Drum n Bass|Breakbeat|Big Beat|Electro(?!nic)|Hardstyle/)],
        ['drum-machine', genre(/Synth-pop|Electropop|Italo|New Wave|Disco|Minimal|Electroclash/) + (inst('drummachine') > inst('drums') ? 0.1 : 0)],
        ['soft-drums', genre(/Bossa|Ambient|Easy Listening|Acoustic|Ballad|Lounge|Chanson/)],
      ].sort((a, b) => b[1] - a[1]);
      // 보사노바는 재즈 장르 합계에 묻히기 쉬워서 따로 우선한다
      const [style, s] = genre(/Bossa/) >= 0.15 ? ['soft-drums', 1] : styles[0];
      add(s >= 0.12 ? style : 'drums', drumScore, s >= 0.12 ? 'drums+genre' : 'drums');
      if (genre(/Bossa/) >= 0.15) add('percussion', drumScore * 0.6, 'genre');
    }

    // 베이스는 믹스 속에서 확률이 낮게 나오는 편이라 기준을 낮춘다
    const bassScore = Math.max(inst('bass'), inst('acousticbassguitar'), inst('doublebass'));
    if (bassScore >= PRESENT * 0.6) {
      const jazz = genre(/^Jazz---|Swing|Big Band|Bossa/);
      const electronic = genre(/^Electronic---|Trap|Synth-pop/);
      const id = inst('doublebass') >= inst('bass') * 0.8 || jazz > 0.15 ? 'upright-bass'
        : electronic > 0.4 && inst('synthesizer') >= 0.3 ? 'synth-bass' : 'bass';
      add(id, Math.max(bassScore, PRESENT), 'bass');
    }

    // 기타
    if (present('classicalguitar')) add('nylon-guitar', inst('classicalguitar'), 'classicalguitar');
    if (present('acousticguitar')) add('guitar', inst('acousticguitar'), 'acousticguitar');
    if (present('electricguitar')) {
      const funk = genre(/Funk \/ Soul---(Funk|Disco|Boogie|P\.Funk|Free Funk)|Jazz-Funk|Disco/);
      const ambient = genre(/Ambient|Post Rock|Shoegaze|Dream Pop|Drone|Post-Rock/);
      add(funk > 0.15 && funk >= ambient ? 'funk-guitar' : ambient > 0.15 ? 'ambient-guitar' : 'electric-guitar', inst('electricguitar'), 'electricguitar');
    }
    if (present('guitar') && ![...picks.keys()].some((id) => id.includes('guitar'))) {
      add(genre(/^Rock---|Metal|Punk|Grunge/) > 0.2 ? 'electric-guitar' : 'guitar', inst('guitar'), 'guitar');
    }

    // 건반
    if (present('piano')) add('piano', inst('piano'), 'piano');
    if (present('rhodes')) add('rhodes', inst('rhodes'), 'rhodes');
    if (present('electricpiano')) add('electric-piano', inst('electricpiano'), 'electricpiano');
    if (present('organ')) add('electric-piano', inst('organ'), 'organ');
    if (present('keyboard') && !picks.has('piano') && !picks.has('rhodes') && !picks.has('electric-piano')) add('piano', inst('keyboard'), 'keyboard');

    // 전자악기
    if (present('synthesizer')) add('synth', inst('synthesizer'), 'synthesizer');
    if (present('computer')) add('synth', inst('computer') * 0.9, 'computer');
    if (present('pad')) add('synth-pad', inst('pad'), 'pad');
    // 앰비언트 전자음악은 패드가 깔리는 경우가 대부분인데 모델은 synthesizer로만 잡는 편이다
    if (present('synthesizer') && genre(/Ambient|Berlin-School|Drone|New Age/) > 0.3) add('synth-pad', inst('synthesizer') * 0.8, 'synthesizer+genre');

    // 관악·현악·타악
    if (present('saxophone')) add('sax', inst('saxophone'), 'saxophone');
    for (const k of ['brass', 'trumpet', 'trombone', 'horn']) if (present(k)) add('brass', inst(k), k);
    if (present('orchestra')) add('orchestra', inst('orchestra'), 'orchestra');
    for (const k of ['strings', 'violin', 'viola']) if (present(k)) add('strings', inst(k), k);
    if (present('cello')) add('cello', inst('cello'), 'cello');
    for (const k of ['percussion', 'bongo']) if (present(k)) add('percussion', inst(k), k);

    // DJ·샘플: 악기라기보다 제작 방식이라 장르 신호를 함께 본다
    if (present('sampler')) add('sample', inst('sampler'), 'sampler');
    const turntablism = genre(/Turntablism|Cut-up\/DJ|DJ Battle Tool/);
    if (turntablism > 0.1) add('turntable', turntablism, 'genre');
    const lofi = genre(/Lo-Fi|Jazzy Hip-Hop|Hip Hop---Instrumental|Trip Hop/);
    if (lofi > 0.15) add('vinyl', lofi, 'genre');

    const ids = [...picks.entries()].sort((a, b) => b[1].score - a[1].score).slice(0, maxCount).map(([id, v]) => ({ id, ...v }));

    const detected = Object.entries(result.instruments)
      .filter(([k, v]) => v.mean >= PRESENT * 0.6)
      .sort((a, b) => b[1].mean - a[1].mean)
      .map(([k, v]) => ({ key: k, ko: INST_KO[k] ?? k, score: v.mean, unsupported: k in UNSUPPORTED }));

    return { picks: ids, detected };
  }

  /* ---------------- 장르 → 리듬 느낌(Style Builder 3번) ----------------
   * 박 단위로 킥·스윙 비율을 재지는 않고, 장르마다 기본이 되는 리듬을 쓴다(toMixer의 드럼 스타일과 같은 방식).
   * 값은 suno.js 3번 선택지의 en과 같아야 한다. */
  const FEEL_RULES = [
    ['four-on-the-floor', /---(.*House|.*Techno|.*Trance|Disco|Euro-Disco|Eurodance|Eurobeat|Italo-Disco|Italodance|Hi NRG|Nu-Disco|Hardstyle)$/],
    ['half-time', /Trap|Dubstep|Phonk|Cloud Rap/],
    ['swing feel', /Jazz---(Swing|Big Band|Bop|Hard Bop|Dixieland|Cool Jazz)$|Jump Blues/],
    // 상위 장르(Rock·Blues·Latin) 전체를 잡으면 메탈·드림팝·R&B·탱고까지 걸려서 대표 하위 장르만 고른다
    ['shuffle groove', /Blues---(Boogie Woogie|Chicago Blues|Electric Blues|Modern Electric Blues|Texas Blues|Jump Blues)$|Rock & Roll|Rockabilly|Blues Rock/],
    ['laid-back groove', /Lo-Fi|Jazzy Hip-Hop|Trip Hop|Downtempo|Neo Soul|Boom Bap/],
    ['syncopated groove', /Funk \/ Soul---(Funk|Boogie|Afrobeat|Contemporary R&B|New Jack Swing)$|Bossa|Samba|Reggae|Latin---(Salsa|Son|Son Montuno|Mambo|Cumbia|Merengue|Afro-Cuban|Batucada|Boogaloo)$|Breakbeat|Drum n Bass|Jungle|UK Garage/],
    ['straight beat', /Rock---(Pop Rock|Indie Rock|Alternative Rock|Hard Rock|Classic Rock|Arena Rock|Garage Rock|Brit Pop|Power Pop|Pub Rock|Grunge|Pop Punk|Punk|Post-Punk|New Wave)$/],
  ];
  const FEEL_MIN = 0.15; // 상위 장르 확률 합이 이 이상인 리듬만
  const DRIVING_BPM = 118; // 정박으로 꽉 차는 리듬이 이 빠르기 이상이면 '드라이빙'도 붙인다

  function rhythmFeels(result) {
    const genre = (re) => result.genres.slice(0, 15).reduce((s, [c, v]) => (re.test(c) ? s + v : s), 0);
    const feels = FEEL_RULES.map(([en, re]) => [en, genre(re)]).filter(([, v]) => v >= FEEL_MIN)
      .sort((a, b) => b[1] - a[1]).slice(0, 2).map(([en]) => en);
    if (feels.length < 2 && result.bpm >= DRIVING_BPM && feels.some((f) => f === 'four-on-the-floor' || f === 'straight beat')) feels.push('driving beat');
    return feels;
  }

  /* ---------------- 분위기·편곡·사운드(Style Builder 6·8·9번) ----------------
   * 값은 suno.js 선택지의 en과 같아야 한다. 장르·키·BPM과 음량 흐름으로 추정하고, 기준값은 세 곡
   * (상상속의 너·Electric Daydream·아틀란티스소녀)으로 맞췄다. 쓰지 않는 신호:
   * - 절대 음량: 마스터링 시대에 따라 -24~-9dB로 크게 달라 '깔끔한 모던' 판단에 쓸 수 없다
   * - 모델의 voice 점수: 노래가 있는 세 곡 모두 0.05 이하라 보컬 유무 판단에 쓸 수 없다 */
  const genreSum = (result, re) => result.genres.slice(0, 15).reduce((s, [c, v]) => (re.test(c) ? s + v : s), 0);
  const drumScore = (inst) => Math.max(...['drums', 'beat', 'drummachine'].map((k) => inst[k]?.mean ?? 0));

  const MOOD_MIN = 0.15;
  const MOOD_RULES = [
    ['uplifting', (r) => genreSum(r, /Euro House|Eurodance|Europop|Trance|Gospel|Happy Hardcore/) + (r.scale === 'major' && r.bpm >= 105 ? 0.2 : 0)],
    ['playful', (r) => genreSum(r, /J-pop|K-pop|Dance-pop|Bubblegum|Novelty|Ska|Children/)],
    ['chill', (r) => genreSum(r, /Lo-Fi|Downtempo|Chillwave|Ambient|Bossa|Easy Listening|Lounge|Smooth Jazz/)],
    ['dreamy', (r) => genreSum(r, /Dream Pop|Shoegaze|Ethereal|Chillwave|Ambient/)],
    // 'Soul'만 쓰면 상위 장르 'Funk / Soul' 전체(펑크·디스코 포함)에 걸려서 하위 장르로 지정한다
    ['emotional', (r) => genreSum(r, /---(Ballad|Emo|Soul|Neo Soul|Soul-Jazz|Contemporary R&B)$/)],
    ['romantic', (r) => genreSum(r, /Bossa|Lovers Rock|Smooth Jazz|Rhythm & Blues/)],
    ['melancholic', (r) => genreSum(r, /Slowcore|Sadcore|Darkwave/) + (r.scale === 'minor' && r.bpm < 100 ? 0.2 : 0)],
    ['dark', (r) => genreSum(r, /Trap|Darkwave|Industrial|Dark Ambient|Doom|Horrorcore|Phonk|Goth/)],
    ['epic', (r) => genreSum(r, /Soundtrack|Score|Symphonic|Epic|Neo-Classical|Post Rock|Power Metal/)],
    ['retro', (r) => genreSum(r, /Synthwave|Vaporwave|Italo-Disco|Hi NRG|Euro-Disco/)],
    ['nostalgic', (r) => genreSum(r, /City Pop|Vaporwave/)],
  ];

  // 음량 흐름: 앞뒤 무음을 잘라 낸 0.5초 단위 dB와 몸통 음량(10~90% 구간 중앙값)
  function levels(env) {
    let a = 0, b = env.length;
    while (a < b && env[a] < -50) a++;
    while (b > a && env[b - 1] < -50) b--;
    const v = env.slice(a, b);
    const body = v.slice(Math.floor(v.length * 0.1), Math.ceil(v.length * 0.9)).sort((x, y) => x - y);
    return { v, body: body[Math.floor(body.length / 2)] ?? -60 };
  }
  const avg = (arr) => arr.reduce((s, x) => s + x, 0) / (arr.length || 1);
  const per = (sec) => Math.round(sec / ENV_STEP);

  // 페이드아웃: 끝 12초를 3초씩 나눠 매번 2dB 이상 작아지고 합쳐서 12dB 이상 줄어든다.
  // 끝에서 갑자기 끊기거나 마지막 음이 울리다 사라지는 곡(세 곡 모두)은 앞쪽 구간이 줄지 않아 걸리지 않는다
  function fadesOut({ v }) {
    if (v.length < per(30)) return false;
    const seg = [12, 9, 6, 3].map((t) => avg(v.slice(v.length - per(t), v.length - per(t - 3))));
    return seg.every((x, i) => i === 0 || seg[i - 1] - x >= 2) && seg[0] - seg[3] >= 12;
  }

  // 브레이크다운: 곡의 45~92% 지점에서 6초 평균 음량이 몸통보다 2.5dB 이상 낮은 구간이 6초 넘게 이어진 뒤 다시 커진다
  function hasBreakdown({ v, body }) {
    const w = per(6);
    const smooth = v.map((_, i) => avg(v.slice(Math.max(0, i - w / 2), i + w / 2)));
    let run = 0;
    for (let i = Math.floor(v.length * 0.45); i < Math.floor(v.length * 0.92); i++) {
      if (smooth[i] <= body - 2.5) run++;
      else if (smooth[i] >= body - 1) {
        if (run >= w) return true;
        run = 0;
      }
      // body-2.5 ~ body-1 사이는 음량이 서서히 돌아오는 경사라 세던 길이를 그대로 둔다(여기서 지우면 복귀를 확인하기 전에 사라짐)
    }
    return false;
  }

  /* ---------------- 가사 구조 추정 ----------------
   * 곡 전체(16kHz)를 마디 단위로 잘라 마디마다 '화음 색(크로마 12)'과 '소리 색(대역 에너지 20)'·크기를 잰다.
   *  1) 경계: 마디끼리 닮은 정도 표(자기 유사 행렬)에서 앞뒤가 확 달라지는 지점(체커보드 노벨티)을 찾는다(구간은 4마디 이상)
   *  2) 이름: 구간끼리 마디 대 마디로 비교해 같은 소리가 반복되는 묶음을 만들고,
   *     여러 번 나오는 묶음 중 가장 큰 것은 후렴, 그 앞에 반복되는 것은 벌스, 후렴 바로 앞의 짧은 구간은 프리코러스,
   *     처음·끝의 다른 구간은 인트로·아웃트로, 두 번째 후렴 뒤 한 번만 나오는 구간은 브리지로 본다
   * 가사를 듣는 것이 아니라 소리의 반복·변화로 추정하므로 틀릴 수 있다(결과 화면에 '추정'으로 표시) */
  function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let k = 0; k < len / 2; k++) {
          const a = i + k, b = a + len / 2;
          const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
          re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
          const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
        }
      }
    }
  }

  // 마디마다 [크로마 12 + 대역 20] 특징과 크기(dB). 마디 길이는 측정 템포의 4박
  function barFeatures(sig, sr, bpm) {
    const N = 2048, HOP = 1024, NB = 20;
    const win = new Float32Array(N).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
    const binHz = sr / N;
    const pc = new Int8Array(N / 2).fill(-1);
    for (let k = 1; k < N / 2; k++) {
      const f = k * binHz;
      if (f >= 80 && f <= 5000) pc[k] = ((Math.round(12 * Math.log2(f / 440)) % 12) + 12 + 9) % 12; // C=0
    }
    const band = new Int8Array(N / 2);
    for (let k = 0; k < N / 2; k++) band[k] = Math.min(NB - 1, Math.floor((NB * Math.log(1 + (k * binHz) / 60)) / Math.log(1 + sr / 2 / 60)));
    const nFrames = Math.floor((sig.length - N) / HOP);
    const frames = [];
    const re = new Float32Array(N), im = new Float32Array(N);
    for (let f = 0; f < nFrames; f++) {
      let e = 0;
      for (let i = 0; i < N; i++) { const x = sig[f * HOP + i]; re[i] = x * win[i]; im[i] = 0; e += x * x; }
      fft(re, im);
      const chroma = new Float32Array(12), bands = new Float32Array(NB);
      for (let k = 1; k < N / 2; k++) {
        const m = re[k] * re[k] + im[k] * im[k];
        if (pc[k] >= 0) chroma[pc[k]] += Math.sqrt(m);
        bands[band[k]] += m;
      }
      frames.push({ chroma, bands, db: 10 * Math.log10(e / N + 1e-12) });
    }
    // 앞의 무음은 건너뛰고 첫 소리부터 마디를 센다
    let first = 0;
    while (first < frames.length && frames[first].db < -50) first++;
    const barFrames = ((240 / (bpm || 120)) * sr) / HOP;
    const bars = [];
    for (let b = 0; ; b++) {
      const a = Math.round(first + b * barFrames), z = Math.round(first + (b + 1) * barFrames);
      if (z > frames.length) break;
      const ch = new Float32Array(12), bd = new Float32Array(NB);
      let db = 0;
      for (let f = a; f < z; f++) {
        frames[f].chroma.forEach((v, i) => (ch[i] += v));
        frames[f].bands.forEach((v, i) => (bd[i] += v));
        db += frames[f].db;
      }
      const cn = Math.hypot(...ch) || 1;
      bars.push({ t: (a * HOP) / sr, chroma: Array.from(ch, (v) => v / cn), bands: Array.from(bd, (v) => Math.log10(v / (z - a) + 1e-9)), db: db / (z - a) });
    }
    return bars;
  }

  /* 반복 덩어리 방식: 대중가요는 '벌스 → (프리코러스) → 후렴' 덩어리가 통째로 두 번 반복되는 경우가 많다.
   * 마디 i와 i+L이 닮은 상태가 10마디 이상 이어지는 간격 L을 찾아 두 덩어리를 맞춰 놓고(경계가 어긋나지 않게),
   * 두 덩어리에서 함께 소리가 바뀌는 지점으로 안을 벌스·프리코러스·후렴으로 나눈다. 못 찾으면 null(아래 구간 방식) */
  function repeatStructure(S, nov, bars, r) {
    const n = bars.length;
    let best = null;
    for (let L = 12; L <= n - 10; L++) {
      const rr = Array.from({ length: n - L }, (_, i) => S[i][i + L]);
      const sm = rr.map((_, i) => avg(rr.slice(Math.max(0, i - 1), i + 2)));
      let i = 0;
      while (i < sm.length) {
        if (sm[i] < 0.6) { i++; continue; }
        let j = i;
        while (j + 1 < sm.length && sm[j + 1] >= 0.6) j++;
        const len = Math.min(j - i + 1, L); // 두 덩어리가 겹치지 않게
        const mean = avg(rr.slice(i, i + len));
        if (len >= 10 && mean >= 0.65 && i <= n * 0.3 && (!best || len * mean > best.len * best.mean)) best = { L, p: i, len, mean };
        i = j + 1;
      }
    }
    if (!best) return null;
    const { L, p, len } = best;
    // 덩어리 안 경계: 두 번 다 소리가 바뀌는 곳(노벨티 합). 3마디 이상 떨어진 큰 봉우리 2개까지
    const c = Array.from({ length: len }, (_, k) => nov[p + k] + (nov[p + L + k] ?? 0));
    const inner = c.slice(3, len - 2);
    const cm = avg(inner), cs = Math.sqrt(avg(inner.map((v) => (v - cm) ** 2)));
    const cand = [];
    for (let k = 3; k < len - 2; k++) if (c[k] >= c[k - 1] && c[k] >= (c[k + 1] ?? -1) && c[k] > cm + 0.5 * cs) cand.push(k);
    cand.sort((a, b) => c[b] - c[a]);
    const cuts = [];
    for (const k of cand) if (cuts.length < 2 && cuts.every((x) => Math.abs(x - k) >= 3)) cuts.push(k);
    cuts.sort((a, b) => a - b);
    const edges = [0, ...cuts, len];
    const parts = edges.slice(0, -1).map((a, i) => ({ a, z: edges[i + 1] }));
    const partDb = (pt) => avg([...bars.slice(p + pt.a, p + pt.z), ...bars.slice(p + L + pt.a, p + L + pt.z)].map((b) => b.db));
    // 후렴: 첫 조각을 뺀 나머지 중 가장 큰 조각(보통 마지막). 그 앞은 벌스 → 프리코러스, 뒤는 포스트코러스
    let ch = parts.length - 1;
    if (parts.length > 1) parts.slice(1).forEach((pt, i) => { if (partDb(pt) > partDb(parts[ch]) + 1) ch = i + 1; });
    const names = (vn) => parts.map((_, i) => (parts.length === 1 ? (partDb(parts[0]) >= avg(bars.map((b) => b.db)) ? 'Chorus' : `Verse ${vn}`)
      : i === ch ? 'Chorus' : i > ch ? 'Post-Chorus' : i === 0 ? `Verse ${vn}` : 'Pre-Chorus'));
    const out = [];
    const sec = (name, a, z) => { if (z > a) out.push({ name, a, z }); };
    if (p > 6) {
      let k = 2;
      for (let i = 2; i <= Math.min(8, p - 2); i++) if (nov[i] > nov[k]) k = i;
      sec('Intro', 0, k);
      sec(names(1)[0].startsWith('Verse') ? 'Verse 1' : 'Interlude', k, p);
    } else sec('Intro', 0, p);
    names(1).forEach((nm, i) => sec(nm, p + parts[i].a, p + parts[i].z));
    sec('Interlude', p + len, p + L); // 두 덩어리 사이(간주)
    names(2).forEach((nm, i) => sec(nm, p + L + parts[i].a, p + L + parts[i].z));
    // 두 번째 덩어리 뒤: 후렴과 닮은 마디(0.7 이상)가 4마디 넘게 이어지면 후렴, 그 앞은 브리지, 뒤는 아웃트로
    const restA = p + L + len;
    if (n - restA > 0) {
      const chorusBars = [];
      for (let k = parts[ch].a; k < parts[ch].z; k++) chorusBars.push(p + k);
      const like = Array.from({ length: n - restA }, (_, k) => Math.max(...chorusBars.map((cb) => S[restA + k][cb])) >= 0.7);
      let s0 = -1, s1 = -1;
      for (let k = 0; k < like.length; k++) {
        if (!like[k]) continue;
        let e = k;
        while (e + 1 < like.length && like[e + 1]) e++;
        if (e - k + 1 >= 4 && (s0 < 0 || e - k > s1 - s0)) { s0 = k; s1 = e; }
        k = e;
      }
      if (n - restA <= 6 && s0 < 0) sec('Outro', restA, n);
      else if (s0 < 0) { sec('Bridge', restA, Math.max(restA, n - 4)); sec('Outro', Math.max(restA, n - 4), n); }
      else { sec('Bridge', restA, restA + s0); sec('Chorus', restA + s0, restA + s1 + 1); sec('Outro', restA + s1 + 1, n); }
    }
    return out.map((x) => ({ name: x.name, start: bars[x.a].t, end: x.z < n ? bars[x.z].t : r.duration, bars: x.z - x.a }));
  }

  function songStructure(r) {
    const bars = r.bars;
    if (r.partial || !bars || bars.length < 24) return [];
    const n = bars.length;
    // 대역 값은 곡 전체 평균·편차로 맞춘 뒤 길이 1로(크로마와 같은 무게)
    const NB = bars[0].bands.length;
    const mu = Array.from({ length: NB }, (_, i) => avg(bars.map((b) => b.bands[i])));
    const sd = Array.from({ length: NB }, (_, i) => Math.sqrt(avg(bars.map((b) => (b.bands[i] - mu[i]) ** 2))) || 1);
    const feat = bars.map((b) => {
      const t = b.bands.map((v, i) => (v - mu[i]) / sd[i]);
      const tn = Math.hypot(...t) || 1;
      return [...b.chroma, ...t.map((v) => v / tn)];
    });
    const sim = (i, j) => feat[i].reduce((s, v, k) => s + v * feat[j][k], 0) / 2; // -1~1
    const S = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => sim(i, j)));
    // 체커보드 노벨티(반폭 4마디): 앞 4마디끼리·뒤 4마디끼리는 닮고 앞뒤는 다를수록 크다
    const K = 4;
    const nov = new Array(n).fill(0);
    for (let i = K; i <= n - K; i++) {
      let v = 0;
      for (let a = -K; a < K; a++) for (let b = -K; b < K; b++) v += ((a < 0) === (b < 0) ? 1 : -1) * S[i + a][i + b];
      nov[i] = v / (4 * K * K);
    }
    const rep = repeatStructure(S, nov, bars, r);
    if (rep) return finishStructure(rep);
    // 경계: 4마디 이상 떨어진 노벨티 봉우리(평균보다 뚜렷한 것). 8마디 경계에 가까우면 그쪽으로 붙인다
    const m = avg(nov.slice(K, n - K)), s2 = Math.sqrt(avg(nov.slice(K, n - K).map((v) => (v - m) ** 2)));
    let peaks = [];
    for (let i = K; i <= n - K; i++) if (nov[i] > m + 0.4 * s2 && nov[i] >= nov[i - 1] && nov[i] >= (nov[i + 1] ?? -1)) peaks.push(i);
    peaks.sort((a, b) => nov[b] - nov[a]);
    const cuts = [];
    for (const p of peaks) if (cuts.every((c) => Math.abs(c - p) >= 4)) cuts.push(p);
    cuts.sort((a, b) => a - b);
    const edges = [0, ...cuts, n];
    let segs = edges.slice(0, -1).map((a, i) => ({ a, z: edges[i + 1] }));
    // 구간끼리 마디 대 마디로 비교(같은 위치끼리 닮은 정도의 평균) → 0.55 이상이면 같은 묶음
    const segSim = (x, y) => {
      const L = Math.min(x.z - x.a, y.z - y.a);
      let v = 0;
      for (let k = 0; k < L; k++) v += S[x.a + k][y.a + k];
      return v / L;
    };
    let label = 0;
    segs.forEach((sg, i) => {
      if (sg.g !== undefined) return;
      sg.g = label;
      for (let j = i + 1; j < segs.length; j++) if (segs[j].g === undefined && segSim(sg, segs[j]) >= 0.55) segs[j].g = label;
      label++;
    });
    const db = (sg) => avg(bars.slice(sg.a, sg.z).map((b) => b.db));
    const groups = [...new Set(segs.map((s) => s.g))].map((g) => {
      const list = segs.filter((s) => s.g === g);
      return { g, count: list.length, db: avg(list.map(db)), first: list[0].a };
    });
    const repeated = groups.filter((x) => x.count >= 2);
    const chorusG = repeated.sort((a, b) => b.db - a.db)[0]?.g;
    const firstChorus = segs.find((s) => s.g === chorusG)?.a ?? n;
    const verseG = groups.filter((x) => x.count >= 2 && x.g !== chorusG && x.first < firstChorus).sort((a, b) => a.first - b.first)[0]?.g;
    let verse = 0, chorusSeen = 0;
    const out = segs.map((sg, i) => {
      let name;
      const len = sg.z - sg.a;
      if (sg.g === chorusG) { chorusSeen++; name = 'Chorus'; }
      else if (i === 0) name = 'Intro';
      else if (i === segs.length - 1) name = 'Outro';
      // 후렴이 두 번 나온 뒤 다시 나오는 벌스 비슷한 구간은 대개 브리지(벌스는 보통 두 번)
      else if (sg.g === verseG) name = chorusSeen >= 2 && verse >= 2 ? 'Bridge' : `Verse ${++verse}`;
      else if (segs[i + 1]?.g === chorusG && len <= 8) name = 'Pre-Chorus';
      else if (chorusSeen >= 2) name = 'Bridge';
      else if (chorusSeen === 0) name = `Verse ${++verse}`;
      else name = 'Interlude';
      return { name, start: bars[sg.a].t, end: sg.z < n ? bars[sg.z].t : r.duration, bars: len };
    });
    return finishStructure(out);
  }

  // 같은 이름이 이어지면 합치고(예: 후렴이 8마디씩 두 조각), 후렴이 두 번 이상이면 마지막을 Final Chorus로
  function finishStructure(out) {
    const merged = [];
    for (const x of out) {
      const p = merged[merged.length - 1];
      if (p && p.name === x.name) { p.end = x.end; p.bars += x.bars; } else merged.push({ ...x });
    }
    const lc = merged.map((x) => x.name).lastIndexOf('Chorus');
    if (merged.filter((x) => x.name === 'Chorus').length >= 2 && lc >= 0) merged[lc].name = 'Final Chorus';
    return merged;
  }

  function styleHints(result, mixer) {
    const r = result;
    const lv = levels(r.envelope);
    const drums = drumScore(r.instruments);
    // 곡 일부(90초 녹음)면 곡 전체 흐름을 보는 항목(점점 고조·페이드아웃·브레이크다운)은 판단하지 않는다.
    // 브레이크다운은 '곡의 45~92% 지점'을 보는데, 일부만 있으면 앞쪽 조용한 구간을 후반으로 착각한다
    const whole = !r.partial;

    const mood = MOOD_RULES.map(([en, f]) => [en, f(r)]).filter(([, v]) => v >= MOOD_MIN)
      .sort((a, b) => b[1] - a[1]).slice(0, 2).map(([en]) => en);

    // 에너지: 앞 1/3이 나머지보다 6dB 이상 작으면 점점 고조, 아니면 빠르기와 드럼으로
    const third = Math.floor(lv.v.length / 3);
    const energy = whole && avg(lv.v.slice(0, third)) <= avg(lv.v.slice(third)) - 6 ? 'building energy'
      : r.bpm >= 115 && drums >= 0.2 ? 'high energy'
      : r.bpm < 90 || drums < 0.12 ? 'low energy' : 'medium energy';

    const arr = [];
    if (whole && hasBreakdown(lv)) arr.push(genreSum(r, /Dubstep|Trance|Big Room|Electro House|Future Bass|Drum n Bass|Hardstyle|Bass Music/) >= 0.2 ? 'build-up-drop' : 'breakdown');
    if (genreSum(r, /^Pop---|K-pop|J-pop|Dance-pop|Contemporary R&B|Pop Rock|Soft Rock|Synth-pop|Eurodance|Hip-House/) >= 0.2) arr.push('verse-chorus');
    const n = mixer.picks.length;
    if (n >= 5) arr.push('layered');
    else if (n && n <= 2) arr.push('minimal');

    const mix = [];
    if (genreSum(r, /Lo-Fi|Jazzy Hip-Hop|Chillwave|Vaporwave/) >= 0.15) mix.push('warm lo-fi mix');
    if (genreSum(r, /Funk \/ Soul---|Boogie|Classic Rock|Psychedelic/) >= 0.2) mix.push('vintage analog warmth');
    else if (genreSum(r, /^Electronic---|K-pop|J-pop|Dance-pop|Contemporary R&B|Trap|^Pop---/) >= 0.3) mix.push('polished modern production');
    if (drums >= 0.2 && genreSum(r, /^Electronic---|^Hip Hop---|^Rock---|K-pop|Dance-pop/) >= 0.3) mix.push('punchy drums');
    if (r.width >= 0.45) mix.push('wide stereo');
    if (genreSum(r, /Ambient|Dream Pop|Shoegaze|Post Rock/) >= 0.2) mix.push('lush reverb');
    if (genreSum(r, /Boom Bap|Lo-Fi|Garage Rock/) >= 0.2) mix.push('tape saturation');

    // 끝맺음(Style Builder 1번 아웃트로): 끝 12초가 단계적으로 작아지면 페이드아웃
    const outro = whole && fadesOut(lv) ? 'fade-out' : '';

    return { mood, energy, arr: arr.slice(0, 3), mix: mix.slice(0, 3), outro };
  }

  // 앞부분 드럼 점수가 이 이상이면 드럼 필로 시작하는 곡으로 본다. 모델은 전자 드럼 위에 신스가 조금만 있어도
  // 신시사이저를 더 높게 잡아서 점수 1위만으로는 드럼 인트로를 놓친다(상상속의 너: 드럼만 나오는 도입부)
  const DRUM_FILL = 0.25;
  // 드럼 필과 함께 베이스가 이 이상이면 베이스도 인트로에 넣는다(상상속의 너 0.29 / Electric Daydream 0.17)
  const INTRO_BASS = 0.25;
  const BASS_IDS = ['bass', 'synth-bass', 'upright-bass'];

  // 도입부: { drumFill: true, bass?: 믹서 베이스 id } 또는 가장 두드러진 믹서 악기 { id }, 없으면 null.
  // 드럼 스타일·베이스 종류는 곡 전체 장르로 정한다
  function introPick(result) {
    const inst = result.introInstruments;
    if (!inst) return null;
    const score = (keys) => Math.max(...keys.map((k) => inst[k]?.mean ?? 0));
    const picks = toMixer({ instruments: inst, genres: result.genres }, Infinity).picks;
    if (score(['drums', 'beat', 'drummachine']) >= DRUM_FILL) {
      const bass = score(['bass', 'acousticbassguitar', 'doublebass']) >= INTRO_BASS && picks.find((p) => BASS_IDS.includes(p.id))?.id;
      return bass ? { drumFill: true, bass } : { drumFill: true };
    }
    return picks[0] ? { id: picks[0].id } : null;
  }

  // 분석된 키를 기본 키(A minor / C major)에서 몇 반음 옮길지
  const PC = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
  function keyShift(key, scale) {
    if (!(key in PC)) return 0;
    const minorRoot = scale === 'minor' ? PC[key] : (PC[key] + 9) % 12; // 장조면 나란한조(단조)로
    let s = (minorRoot - 9 + 12) % 12;
    if (s > 6) s -= 12;
    return s;
  }

  /* ---------------- 느린 곡의 두 배 템포 보정 ----------------
   * 박 간격으로 템포를 재면 느린 곡의 촘촘한 8분음표를 한 박으로 보고 두 배(예: 71 → 142)로 잡기 쉽다. 둘 중 하나면 절반으로 본다.
   *  1) 135 BPM 이상인데 원래 빠른 장르(드럼앤베이스·펑크·메탈·테크노·트랩 등)가 거의 없다
   *     — 2026-11-16 12곡 시험: 잘못 잡힌 2곡(꿈꾸던 어른이 되었나요 142 → 실제 약 71, Sparkle in Your Eyes 155 → 78)만
   *       135 이상이었고 제대로 잡힌 10곡은 모두 131 이하였다
   *  2) 120 BPM 이상이고 느린 장르(발라드·이지리스닝·네오소울 등) 비중이 크며 댄스 장르가 거의 없다
   * 장르 이름은 '대분류---세부'라 세부 장르만 본다(예전에는 'Electro'가 'Electronic---Downtempo'에도 걸려 2)가 막혔다).
   * 틀리면 결과 화면의 [½]·[×2]로 언제든 고칠 수 있다 */
  const SLOW_GENRE = /Ballad|Easy Listening|Lounge|Chanson|Soft Rock|Ambient|Downtempo|Neo Soul|Smooth Jazz|Bossa|Folk|Acoustic|Chillwave|Dream Pop/;
  const DANCE_GENRE = /House|Techno|Trance|Disco|Eurodance|Dance-pop|Drum n Bass|Hip Hop|Trap|^Electro$|Electro House|Hardstyle|Breakbeat|Funk|Hi NRG|Italo/;
  const FAST_GENRE = /Drum n Bass|Jungle|Hardcore|Hardstyle|Gabber|Punk|Metal|Thrash|Grindcore|Speedcore|Breakcore|Footwork|Juke|Techno|Trance|Dubstep|Trap|Ska|Bluegrass|Polka|Rockabilly|Surf|^Swing$|Bebop|Hi NRG|Eurobeat/;
  const subSum = (result, re) => result.genres.slice(0, 15).reduce((s, [c, v]) => (re.test(c.split('---').pop()) ? s + v : s), 0);
  const slowTempoFix = (result) => (result.bpm >= 135 && subSum(result, FAST_GENRE) < 0.15)
    || (result.bpm >= 120 && subSum(result, SLOW_GENRE) >= 0.3 && subSum(result, DANCE_GENRE) < 0.15);

  return { analyze, toMixer, introPick, rhythmFeels, styleHints, songStructure, extractMelody, pitchTrack, sectionDelivery, slowTempoFix, keyShift, warmup: () => Promise.all([loadEssentia(), loadModels()]) };
})();
