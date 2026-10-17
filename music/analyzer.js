/* 업로드한 곡 분석: BPM·키(Essentia.js) + 장르·악기 인식(Essentia Discogs-EffNet → MTG-Jamendo 악기 헤드, onnxruntime-web).
 * 모든 처리는 브라우저 안에서만 하며 곡 파일은 어디에도 전송하지 않는다.
 * 모델(CC BY-NC-SA 4.0, MTG/UPF)은 essentia.upf.edu가 CORS를 허용하지 않아 models/에 두고 같은 출처에서 읽는다. */

const Analyzer = (() => {
  const EFFNET_URL = 'models/discogs-effnet-bsdynamic-1.onnx';
  const HEAD_URL = 'models/mtg_jamendo_instrument-discogs-effnet-1.onnx';
  const META_URLS = ['models/discogs-effnet-bsdynamic-1.json', 'models/mtg_jamendo_instrument-discogs-effnet-1.json'];
  const ANALYZE_SECONDS = 90; // 곡 가운데 구간만 분석 (전체를 돌리면 수 분 걸림)

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
    return { signal: out, duration: buf.duration };
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

    onProgress?.(1, '완료');
    return {
      name: file.name,
      duration: hi.duration,
      bpmRaw: rhythm.bpm,
      bpm: normalizeBpm(rhythm.bpm),
      key: key.key, scale: key.scale, keyStrength: key.strength,
      instruments, genres,
    };
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

  // 분석된 키를 기본 키(A minor / C major)에서 몇 반음 옮길지
  const PC = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
  function keyShift(key, scale) {
    if (!(key in PC)) return 0;
    const minorRoot = scale === 'minor' ? PC[key] : (PC[key] + 9) % 12; // 장조면 나란한조(단조)로
    let s = (minorRoot - 9 + 12) % 12;
    if (s > 6) s -= 12;
    return s;
  }

  return { analyze, toMixer, keyShift, warmup: () => Promise.all([loadEssentia(), loadModels()]) };
})();
