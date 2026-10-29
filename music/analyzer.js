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

    onProgress?.(1, '완료');
    return {
      name: file.name,
      duration: hi.duration,
      bpmRaw: rhythm.bpm,
      bpm: normalizeBpm(rhythm.bpm),
      key: key.key, scale: key.scale, keyStrength: key.strength,
      instruments, genres, introInstruments: intro.instruments,
      envelope: loudnessEnvelope(hi.signal, 44100), width: hi.width,
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
   * 박 간격으로 템포를 재면 느린 발라드의 촘촘한 8분음표를 한 박으로 보고 두 배(예: 68 → 136)로 잡기 쉽다.
   * 느린 장르 비중이 크고 댄스 장르가 거의 없는데 120 BPM 이상이면 절반으로 본다.
   * 느린 곡 표본 없이 정한 보수적인 기준이라(빠른 곡 4곡에서 오작동 없음만 확인) 결과 화면의 [½]·[×2]로 언제든 고칠 수 있다 */
  const SLOW_GENRE = /Ballad|Easy Listening|Lounge|Chanson|Soft Rock|Ambient|Downtempo|Neo Soul|Smooth Jazz|Bossa|Folk|Acoustic/;
  const DANCE_GENRE = /House|Techno|Trance|Disco|Eurodance|Dance-pop|Drum n Bass|Hip Hop|Trap|Electro|Hardstyle|Breakbeat|Funk|Hi NRG|Italo/;
  const slowTempoFix = (result) => result.bpm >= 120 && genreSum(result, SLOW_GENRE) >= 0.3 && genreSum(result, DANCE_GENRE) < 0.15;

  return { analyze, toMixer, introPick, rhythmFeels, styleHints, slowTempoFix, keyShift, warmup: () => Promise.all([loadEssentia(), loadModels()]) };
})();
