/* Suno Style Builder: 11개 항목을 고르면 Suno에 붙여 넣을 Style of Music을 만든다([생성] 버튼).
 * 제외 항목(11번)은 별도 칸 없이 Style of Music 마지막 줄에 'no …'로 들어간다.
 * 화면 표시는 한글, 출력은 Suno가 잘 알아듣는 영어 키워드. 스타일 칸은 앞쪽 단어일수록 영향이 커서
 * 장르 → 주 악기 → 리듬 → 반주 → 분위기 순으로 쓴다. */

// 믹서 악기 → Suno에서 통하는 표현
const SUNO_TERM = {
  sample: 'chopped soul samples', turntable: 'turntable scratches', vinyl: 'vinyl crackle',
  brass: 'brass section', sax: 'saxophone', orchestra: 'orchestral strings and brass',
  'ambient-guitar': 'ambient reverb guitar', 'electric-guitar': 'electric guitar', 'funk-guitar': 'funky rhythm guitar',
  guitar: 'acoustic guitar', 'nylon-guitar': 'nylon string guitar',
  boombap: 'boom bap drums', brushes: 'brushed jazz drums', 'drum-machine': 'drum machine', drums: 'live drums',
  'electronic-drums': 'electronic drums', 'soft-drums': 'soft drums', trap: 'trap drums, 808 bass',
  bass: 'bass guitar', 'synth-bass': 'synth bass', 'upright-bass': 'upright bass',
  synth: 'synth lead', 'synth-pad': 'synth pads', percussion: 'percussion',
  'electric-piano': 'electric piano', piano: 'piano', rhodes: 'rhodes piano',
  cello: 'cello', strings: 'string ensemble',
};

const GENRE_EN = {
  '재즈 발라드': 'jazz ballad', '스윙 재즈': 'swing jazz', '보사노바 재즈': 'bossa nova jazz', '컨템포러리 재즈': 'contemporary jazz', '재즈 팝': 'jazz pop',
  '팝 발라드': 'pop ballad', '어쿠스틱 발라드': 'acoustic ballad', 'R&B 발라드': 'r&b ballad', '록 발라드': 'rock ballad', '시네마틱 발라드': 'cinematic ballad',
  '어쿠스틱 팝': 'acoustic pop', '신스 팝': 'synth pop', '인디 팝': 'indie pop', '드림 팝': 'dream pop', '시티 팝': 'city pop',
  '로파이 힙합': 'lo-fi hip hop', '재즈 힙합': 'jazz hip hop', '붐뱁 힙합': 'boom bap hip hop', '멜로딕 힙합': 'melodic hip hop', '칠 힙합': 'chill hip hop',
  '트랩': 'trap', '하우스·EDM': 'house, edm', '펑크': 'funk', '록': 'rock',
};

// tip: 마우스를 올리면 보이는 설명, shown: 말풍선의 '출력'에 보여 줄 값(en이 내부 코드일 때)
const o = (ko, en, tip, shown) => ({ ko, en, tip, shown });

// 세부 장르의 소리 특징(영어). 장르 이름만 줄 때보다 Suno가 의도를 더 정확히 따른다
// 시대(80s·90s·retro 등) 표현은 넣지 않는다: 장르는 현재 기준으로 해석하고, 레트로 느낌은 분위기·사운드 항목에서 고른다
const GENRE_TRAITS = {
  '재즈 발라드': 'slow tempo, intimate piano, soft saxophone, brushed drums',
  '스윙 재즈': 'swinging ride cymbal, walking bass, big band horns',
  '보사노바 재즈': 'nylon guitar, gentle bossa rhythm, soft percussion',
  '컨템포러리 재즈': 'sophisticated jazz harmony, rhodes, smooth electric textures',
  '재즈 팝': 'jazzy chords, catchy pop melody, warm horns',
  '팝 발라드': 'emotional piano, sweeping strings, big chorus',
  '어쿠스틱 발라드': 'acoustic guitar, intimate piano, stripped-back',
  'R&B 발라드': 'slow r&b groove, soulful chords, smooth bass',
  '록 발라드': 'power ballad, building band sound, emotional guitar',
  '시네마틱 발라드': 'orchestral strings, dramatic build, film score feel',
  '어쿠스틱 팝': 'bright acoustic guitar, light percussion, warm and breezy',
  '신스 팝': 'synth-driven, drum machine, electronic pop',
  '인디 팝': 'jangly guitars, quirky synths, lo-fi charm',
  '드림 팝': 'reverb-drenched guitars, hazy pads, ethereal',
  '시티 팝': 'urban pop, funky bass, lush chords, glossy production',
  '로파이 힙합': 'dusty drums, mellow keys, vinyl texture, relaxed',
  '재즈 힙합': 'jazzy samples, upright bass, boom bap groove',
  '붐뱁 힙합': 'hard-hitting kick and snare, sampled loops, head-nodding groove',
  '멜로딕 힙합': 'melodic hooks, atmospheric pads, trap-influenced beat',
  '칠 힙합': 'laid-back beat, soft keys, mellow atmosphere',
  '트랩': 'rolling hi-hats, heavy 808 bass, dark atmosphere',
  '하우스·EDM': 'four-on-the-floor kick, synth leads, festival energy',
  '펑크': 'syncopated rhythm guitar, tight bass groove, punchy horns',
  '록': 'distorted electric guitars, live drums, driving energy',
};
const genreLine = (name) => `${GENRE_EN[name]} (${GENRE_TRAITS[name]})`;

/* ---------------- 코드 진행(7번 줄) ----------------
 * 세부 장르의 추천 조합 진행을 쓰고, 7번에서 키를 골랐으면 그 키로 옮긴다.
 * 옮기려면 진행마다 기준 키가 필요해서 따로 적어 둔다(app.js GENRES의 prog와 짝). */
const PROG_KEY = {
  '재즈 발라드': 'C major', '스윙 재즈': 'C major', '보사노바 재즈': 'F major', '컨템포러리 재즈': 'D minor', '재즈 팝': 'A minor',
  '팝 발라드': 'C major', '어쿠스틱 발라드': 'G major', 'R&B 발라드': 'G minor', '록 발라드': 'D major', '시네마틱 발라드': 'A minor',
  '어쿠스틱 팝': 'C major', '신스 팝': 'D minor', '인디 팝': 'C major', '드림 팝': 'C major', '시티 팝': 'A minor',
  '로파이 힙합': 'C major', '재즈 힙합': 'C major', '붐뱁 힙합': 'A minor', '멜로딕 힙합': 'A minor', '칠 힙합': 'C major',
  '트랩': 'A minor', '하우스·EDM': 'A minor', '펑크': 'E minor', '록': 'A major',
};
const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const pcOf = (name) => (SHARP_NAMES.includes(name) ? SHARP_NAMES : FLAT_NAMES).indexOf(name);

// 'A minor' → { root: 9, minor: true }
const parseKey = (k) => { const [r, m] = k.split(' '); return { root: pcOf(r), minor: m === 'minor' }; };

function transposeProg(prog, fromKey, toKey) {
  const from = parseKey(fromKey);
  const to = parseKey(toKey);
  // 장조↔단조가 다르면 나란한조로 맞춘 뒤 옮긴다(예: C major 진행을 A minor로 → 그대로)
  let target = to.root;
  if (from.minor && !to.minor) target = (to.root + 9) % 12;
  if (!from.minor && to.minor) target = (to.root + 3) % 12;
  const semis = (target - from.root + 12) % 12;
  // 옮긴 키의 관용 표기: #키는 #, 그 외는 b
  const majorRoot = from.minor ? (target + 3) % 12 : target;
  const names = [7, 2, 9, 4, 11, 6].includes(majorRoot) ? SHARP_NAMES : FLAT_NAMES;
  return prog.map((c) => {
    const m = /^([A-G][b#]?)(.*)$/.exec(c);
    return names[(pcOf(m[1]) + semis) % 12] + m[2];
  });
}

function progressionFor() {
  const preset = GENRES.flatMap((g) => g.items).find((p) => p.name === sb.genre);
  if (preset) return sb.key ? transposeProg(preset.prog, PROG_KEY[preset.name], sb.key) : preset.prog;
  // 장르 없이 키만 있으면 믹서 기본 진행(A minor)을 그 키로 — 곡 분석 뒤 믹서가 실제로 연주하는 진행과 같다
  if (sb.key) return transposeProg(DEFAULT_PROG, 'A minor', sb.key);
  return null;
}

const GENRE_DESC = {
  '재즈 발라드': '느린 템포에 피아노·색소폰이 감성적으로 노래하는 재즈입니다.',
  '스윙 재즈': '통통 튀는 스윙 리듬과 브라스가 어우러진 빅밴드풍 재즈입니다.',
  '보사노바 재즈': '브라질풍 나일론 기타와 부드럽게 흔들리는 리듬의 재즈입니다.',
  '컨템포러리 재즈': '세련된 화성과 전자 사운드를 섞은 재즈입니다.',
  '재즈 팝': '재즈 화성에 팝의 친근한 멜로디를 더한 장르입니다.',
  '팝 발라드': '피아노·스트링스 위에 감정을 쌓아 올리는 대중 발라드입니다.',
  '어쿠스틱 발라드': '어쿠스틱 기타·피아노 중심의 담백한 발라드입니다.',
  'R&B 발라드': '그루브 있는 드럼과 소울풀한 화성의 느린 R&B입니다.',
  '록 발라드': '밴드 사운드로 점점 커지며 웅장해지는 발라드입니다.',
  '시네마틱 발라드': '오케스트라로 영화음악처럼 극적으로 펼쳐지는 발라드입니다.',
  '어쿠스틱 팝': '어쿠스틱 악기로 가볍고 따뜻하게 만든 팝입니다.',
  '신스 팝': '신시사이저와 드럼 머신 중심의 전자 팝입니다.',
  '인디 팝': '기타와 신스가 섞인 감각적이고 자유로운 분위기의 팝입니다.',
  '드림 팝': '리버브 가득한 기타·패드로 몽환적으로 퍼지는 팝입니다.',
  '시티 팝': '세련된 코드와 펑키한 베이스의 도시적인 팝입니다.',
  '로파이 힙합': '느슨한 비트와 따뜻한 잡음의, 공부·휴식할 때 듣기 좋은 힙합입니다.',
  '재즈 힙합': '재즈 샘플과 업라이트 베이스를 쓴 여유 있는 힙합입니다.',
  '붐뱁 힙합': '묵직한 킥과 강한 스네어, 샘플 루프 중심의 힙합입니다.',
  '멜로딕 힙합': '랩보다 노래하듯 멜로디가 강한 힙합입니다.',
  '칠 힙합': '여유롭고 편안한 분위기의 힙합입니다.',
  '트랩': '빠른 하이햇 롤과 묵직한 808 저음의 힙합입니다.',
  '하우스·EDM': '4박 킥이 계속 이어지는 클럽 댄스 음악입니다.',
  '펑크': '끊어 치는 기타와 탄력 있는 베이스의 그루브 음악입니다.',
  '록': '일렉 기타와 라이브 드럼 중심의 밴드 음악입니다.',
};
// 조성별 관용 표기: 장조는 b(Db·Ab), 단조는 #(C#·G#) 쪽이 흔하다
const MAJOR_KEYS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const MINOR_KEYS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];

// 항목 정의. groups 안의 각 그룹이 하나의 선택값(single/multi/select/number)을 가진다.
const SB_STEPS = [
  { n: 1, title: 'Intro', ko: '인트로', groups: [
    { key: 'intro', type: 'single', options: [
      // fits: 3번과 같이 대표 장르부터(일반적인 장르 관행 기준)
      { ...o('인트로 없음', '', '인트로 없이 곧바로 본 곡(벌스나 메인 테마)으로 시작합니다.', ''),
        fits: { 힙합: ['붐뱁 힙합', '멜로딕 힙합'], 팝: ['신스 팝', '인디 팝'], '일렉트로닉·밴드': ['펑크'] } },
      { ...o('피아노 인트로', 'soft piano', '잔잔한 피아노 연주로 조용히 시작합니다.', 'soft piano intro'),
        fits: { 발라드: ['팝 발라드', '시네마틱 발라드'], 재즈: ['재즈 발라드'], 힙합: ['칠 힙합'] } },
      { ...o('패드 인트로', 'ambient pads', '길게 깔리는 신스 패드로 공간감 있게 시작합니다. 앰비언트에서도 많이 씁니다.', 'ambient pads intro'),
        fits: { 팝: ['드림 팝', '신스 팝'], '일렉트로닉·밴드': ['하우스·EDM'], 발라드: ['R&B 발라드'] } },
      { ...o('드럼 필', 'drum fill', '짧은 드럼 연타로 힘 있게 곡을 엽니다.', 'drum fill intro'),
        fits: { '일렉트로닉·밴드': ['록', '펑크'], 팝: ['인디 팝'], 재즈: ['스윙 재즈'] } },
      { ...o('기타 리프', 'guitar riff', '귀에 남는 짧은 기타 프레이즈로 시작합니다.', 'guitar riff intro'),
        fits: { '일렉트로닉·밴드': ['록', '펑크'], 팝: ['인디 팝', '시티 팝'], 발라드: ['록 발라드'] } },
      { ...o('아카펠라', 'a cappella vocals', '반주 없이 목소리만으로 시작합니다. 10번에서 보컬을 고를 때 어울립니다.', 'a cappella vocals intro'),
        fits: { 발라드: ['팝 발라드', 'R&B 발라드'], 팝: ['어쿠스틱 팝'] } },
      { ...o('시네마틱 빌드업', 'cinematic build-up', '현악기와 효과음으로 영화처럼 점점 고조시키며 시작합니다.', 'cinematic build-up intro'),
        fits: { 발라드: ['시네마틱 발라드', '록 발라드'], '일렉트로닉·밴드': ['하우스·EDM'] } },
      { ...o('바이닐 노이즈', 'vinyl crackle', '레코드판 잡음으로 복고 분위기를 깔고 시작합니다.', 'vinyl crackle intro'),
        fits: { 힙합: ['로파이 힙합', '재즈 힙합', '칠 힙합'], 재즈: ['재즈 발라드'] } },
    ] },
  ] },
  { n: 2, title: 'Main Instrument', ko: '주 악기', groups: [{ key: 'main', type: 'instrument' }] },
  { n: 3, title: 'Rhythm & BPM', ko: '리듬·BPM', groups: [
    { key: 'bpm', type: 'number', min: 60, max: 180, unit: 'BPM',
      tip: '곡의 빠르기(1분에 들어가는 박 수). 대략 발라드 60~80 · 힙합 80~100 · 팝 100~130 · 하우스·댄스 120~130 · 펑크 록 160 이상' },
    { key: 'feel', type: 'multi', max: 2, options: [
      // fits: 어울리는 장르/세부 장르(추천 조합의 GENRES 이름과 같게) — 말풍선에 설명 아래 줄로 표시.
      // 순서는 그 리듬이 가장 잘 드러나는(대표하는) 장르부터. 사용 통계가 아니라 일반적인 장르 관행 기준이다.
      { ...o('스트레이트', 'straight beat', '박을 고르게 나누는 가장 기본적인 리듬입니다.'),
        fits: { '일렉트로닉·밴드': ['록'], 팝: ['인디 팝', '어쿠스틱 팝'], 발라드: ['록 발라드', '팝 발라드'] } },
      { ...o('스윙', 'swing feel', '8분음표를 "길게-짧게" 튕겨 치는 재즈식 리듬입니다.'),
        fits: { 재즈: ['스윙 재즈', '재즈 발라드'], 힙합: ['재즈 힙합'] } },
      { ...o('셔플', 'shuffle groove', '셋잇단음표처럼 통통 튀는 리듬입니다. 블루스·로큰롤의 기본 리듬이기도 합니다.'),
        fits: { '일렉트로닉·밴드': ['록'], 재즈: ['스윙 재즈', '재즈 팝'] } },
      { ...o('하프타임', 'half-time', '스네어를 한 마디에 한 번만 쳐서 BPM보다 절반 느리게 느껴지는 리듬입니다.'),
        fits: { '일렉트로닉·밴드': ['트랩'], 힙합: ['멜로딕 힙합'], 발라드: ['R&B 발라드', '시네마틱 발라드'] } },
      { ...o('포온더플로어', 'four-on-the-floor', '킥 드럼이 매 박마다 "쿵 쿵 쿵 쿵" 들어가는 리듬입니다. 디스코의 기본 리듬이기도 합니다.'),
        fits: { '일렉트로닉·밴드': ['하우스·EDM'], 팝: ['신스 팝'] } },
      { ...o('싱코페이션', 'syncopated groove', '강박을 일부러 엇박으로 밀어서 그루브를 만드는 리듬입니다.'),
        fits: { '일렉트로닉·밴드': ['펑크'], 발라드: ['R&B 발라드'], 팝: ['시티 팝'], 재즈: ['보사노바 재즈', '컨템포러리 재즈'] } },
      { ...o('레이드백', 'laid-back groove', '박보다 살짝 늦게 치듯 여유 있게 늘어지는 느낌입니다.'),
        fits: { 힙합: ['로파이 힙합', '칠 힙합', '붐뱁 힙합'], 재즈: ['컨템포러리 재즈'] } },
      { ...o('드라이빙', 'driving beat', '쉬지 않고 앞으로 밀고 나가는 힘 있는 리듬입니다.'),
        fits: { '일렉트로닉·밴드': ['록', '하우스·EDM'], 팝: ['인디 팝'] } },
    ] },
  ] },
  { n: 4, title: 'Genre', ko: '장르', groups: [{ key: 'genre', type: 'genre' }] },
  { n: 5, title: 'Supporting Instruments', ko: '반주 악기', groups: [{ key: 'support', type: 'instruments' }] }, // 개수 제한 없음
  { n: 6, title: 'Mood & Energy', ko: '분위기·에너지', groups: [
    { key: 'mood', type: 'multi', max: 3, options: [
      { ...o('감성적', 'emotional', '마음을 울리는, 감정이 풍부한 분위기입니다.'),
        fits: { 발라드: ['팝 발라드', 'R&B 발라드', '어쿠스틱 발라드'], 힙합: ['멜로딕 힙합'] } },
      { ...o('우울한', 'melancholic', '쓸쓸하고 슬픈 분위기입니다.'),
        fits: { 발라드: ['시네마틱 발라드', '어쿠스틱 발라드'], 힙합: ['로파이 힙합'], 팝: ['드림 팝'] } },
      { ...o('희망찬', 'uplifting', '기운을 북돋우는 밝고 긍정적인 분위기입니다.'),
        fits: { 팝: ['어쿠스틱 팝', '인디 팝'], 발라드: ['록 발라드'], '일렉트로닉·밴드': ['하우스·EDM'] } },
      { ...o('몽환적', 'dreamy', '꿈속처럼 흐릿하게 떠다니는 분위기입니다.'),
        fits: { 팝: ['드림 팝'], 힙합: ['칠 힙합'], 재즈: ['컨템포러리 재즈'] } },
      { ...o('로맨틱', 'romantic', '사랑스럽고 달콤한 분위기입니다.'),
        fits: { 재즈: ['재즈 발라드', '보사노바 재즈'], 발라드: ['R&B 발라드', '팝 발라드'] } },
      { ...o('향수', 'nostalgic', '옛 추억을 떠올리게 하는 그리운 분위기입니다.'),
        fits: { 팝: ['시티 팝'], 힙합: ['로파이 힙합', '붐뱁 힙합'], 재즈: ['스윙 재즈'] } },
      { ...o('레트로', 'retro', '지난 시대의 사운드를 되살린 복고풍 분위기입니다. 장르를 옛 스타일로 해석하게 할 때 고릅니다.'),
        fits: { 팝: ['신스 팝', '시티 팝'], '일렉트로닉·밴드': ['펑크'], 재즈: ['스윙 재즈'] } },
      { ...o('어두운', 'dark', '무겁고 긴장감 있는 분위기입니다.'),
        fits: { '일렉트로닉·밴드': ['트랩'], 힙합: ['붐뱁 힙합'], 발라드: ['시네마틱 발라드'] } },
      { ...o('편안한', 'chill', '긴장을 풀어 주는 느긋한 분위기입니다.'),
        fits: { 힙합: ['칠 힙합', '로파이 힙합'], 재즈: ['보사노바 재즈'], 팝: ['어쿠스틱 팝'] } },
      { ...o('웅장한', 'epic', '크고 장엄하게 몰아치는 분위기입니다.'),
        fits: { 발라드: ['시네마틱 발라드', '록 발라드'], '일렉트로닉·밴드': ['록'] } },
      { ...o('경쾌한', 'playful', '가볍고 장난스럽게 통통 튀는 분위기입니다.'),
        fits: { 재즈: ['스윙 재즈', '재즈 팝'], 팝: ['어쿠스틱 팝', '시티 팝'], '일렉트로닉·밴드': ['펑크'] } },
    ] },
    { key: 'energy', type: 'single', options: [
      { ...o('낮음', 'low energy', '조용하고 잔잔하게, 배경음악처럼 흘러갑니다.'),
        fits: { 힙합: ['로파이 힙합', '칠 힙합'], 재즈: ['재즈 발라드', '보사노바 재즈'], 발라드: ['어쿠스틱 발라드'] } },
      { ...o('중간', 'medium energy', '적당히 움직임이 있는 일상적인 에너지입니다.'),
        fits: { 팝: ['시티 팝', '인디 팝'], 재즈: ['재즈 팝'], 힙합: ['붐뱁 힙합'] } },
      { ...o('높음', 'high energy', '처음부터 힘 있고 신나게 몰아칩니다.'),
        fits: { '일렉트로닉·밴드': ['하우스·EDM', '록', '펑크'], 팝: ['신스 팝'] } },
      { ...o('점점 고조', 'building energy', '조용히 시작해서 뒤로 갈수록 커지고 강해집니다.'),
        fits: { 발라드: ['록 발라드', '시네마틱 발라드'], '일렉트로닉·밴드': ['하우스·EDM'] } },
    ] },
  ] },
  { n: 7, title: 'Melody & Harmony', ko: '멜로디·화성', groups: [
    { key: 'key', type: 'select', options: [o('키 지정 안 함', ''), ...MAJOR_KEYS.flatMap((k, i) => [o(`${k} major`, `${k} major`), o(`${MINOR_KEYS[i]} minor`, `${MINOR_KEYS[i]} minor`)])],
      tip: '곡의 조성(키). major(장조)는 밝고 경쾌하게, minor(단조)는 어둡고 감성적으로 들립니다. 지정하지 않으면 Suno가 알아서 정합니다. 4번에서 세부 장르를 골랐으면 그 장르의 코드 진행도 이 키로 옮겨서 함께 넣습니다.' },
    { key: 'harmony', type: 'multi', max: 2, options: [
      // fits: 3번과 같이 대표 장르부터(일반적인 장르 관행 기준)
      { ...o('중독성 훅', 'catchy hook', '한 번 들으면 귀에 맴도는 짧고 반복되는 멜로디를 강조합니다. K-pop의 핵심 요소이기도 합니다.'),
        fits: { 팝: ['신스 팝', '시티 팝', '인디 팝'], '일렉트로닉·밴드': ['하우스·EDM'], 힙합: ['멜로딕 힙합'] } },
      { ...o('서정적 멜로디', 'lyrical melody', '노래하듯 길고 부드럽게 흐르는 멜로디입니다.'),
        fits: { 발라드: ['팝 발라드', '어쿠스틱 발라드', '시네마틱 발라드'], 재즈: ['재즈 발라드'] } },
      { ...o('재즈 7th 코드', 'jazzy seventh chords', '7음을 더한 코드로 세련되고 따뜻한 화성을 냅니다. 네오소울에서도 즐겨 씁니다.'),
        fits: { 재즈: ['재즈 발라드', '컨템포러리 재즈', '스윙 재즈'], 힙합: ['로파이 힙합', '재즈 힙합', '칠 힙합'], 팝: ['시티 팝'], 발라드: ['R&B 발라드'] } },
      { ...o('단순한 팝 진행', 'simple pop chord progression', '기본 코드 3~4개를 반복하는 익숙하고 따라 부르기 쉬운 진행입니다.'),
        fits: { 팝: ['어쿠스틱 팝', '인디 팝'], 발라드: ['팝 발라드'], '일렉트로닉·밴드': ['하우스·EDM', '록'] } },
      { ...o('풍성한 화성', 'lush harmonies', '여러 음과 화음을 겹쳐 풍부하고 꽉 찬 화성을 만듭니다. 코러스·스트링스가 있을 때 효과적입니다.'),
        fits: { 발라드: ['시네마틱 발라드', 'R&B 발라드'], 재즈: ['컨템포러리 재즈'], 팝: ['시티 팝', '드림 팝'] } },
      { ...o('모달', 'modal harmony', '일반 장조·단조 대신 도리안 같은 선법을 써서 독특하고 몽환적인 분위기를 냅니다.'),
        fits: { 재즈: ['컨템포러리 재즈'], '일렉트로닉·밴드': ['펑크'], 팝: ['드림 팝'] } },
    ] },
  ] },
  { n: 8, title: 'Arrangement', ko: '편곡·구성', groups: [
    { key: 'arr', type: 'multi', max: 3, options: [
      { ...o('미니멀', 'minimal', '악기 수를 줄이고 빈 공간을 살린 담백한 편곡입니다.', 'minimal arrangement'),
        fits: { 힙합: ['칠 힙합', '로파이 힙합'], 발라드: ['어쿠스틱 발라드'], 재즈: ['재즈 발라드'] } },
      { ...o('층층이 쌓기', 'layered', '악기와 소리를 겹겹이 쌓아 풍성하고 꽉 찬 편곡입니다.', 'layered arrangement'),
        fits: { 발라드: ['시네마틱 발라드', '록 발라드'], 팝: ['드림 팝', '신스 팝'], '일렉트로닉·밴드': ['하우스·EDM'] } },
      { ...o('벌스-코러스', 'verse-chorus', '절(벌스)과 후렴(코러스)이 번갈아 나오는 대중가요 기본 구성입니다.', 'verse-chorus structure'),
        fits: { 팝: ['어쿠스틱 팝', '인디 팝', '신스 팝'], 발라드: ['팝 발라드', '록 발라드'], '일렉트로닉·밴드': ['록'] } },
      { ...o('빌드업 → 드롭', 'build-up-drop', '긴장감을 점점 끌어올린 뒤 한 번에 터뜨리는 구간을 넣습니다.', 'build-up and drop'),
        fits: { '일렉트로닉·밴드': ['하우스·EDM', '트랩'], 팝: ['신스 팝'] } },
      { ...o('브레이크다운', 'breakdown', '마지막 후렴 앞에서 악기를 덜어 내 잠시 숨을 고르는 구간을 넣습니다.', 'breakdown'),
        fits: { '일렉트로닉·밴드': ['하우스·EDM', '펑크'], 팝: ['시티 팝'], 발라드: ['록 발라드'] } },
      { ...o('페이드아웃 엔딩', 'fade-out', '곡 끝에서 소리가 점점 작아지며 사라지게 끝냅니다.', 'fade-out ending'),
        fits: { 팝: ['시티 팝', '드림 팝'], 힙합: ['로파이 힙합', '칠 힙합'], '일렉트로닉·밴드': ['펑크'] } },
    ] },
  ] },
  { n: 9, title: 'Sound & Mixing', ko: '사운드·믹싱', groups: [
    { key: 'mix', type: 'multi', max: 3, options: [
      { ...o('로파이 따뜻함', 'warm lo-fi mix', '고음을 살짝 깎고 잡음을 더해 오래된 녹음처럼 포근하게 들리게 합니다.'),
        fits: { 힙합: ['로파이 힙합', '칠 힙합', '재즈 힙합'] } },
      { ...o('빈티지 아날로그', 'vintage analog warmth', '70~80년대 아날로그 장비로 녹음한 듯 따뜻하고 두툼한 소리입니다.'),
        fits: { 팝: ['시티 팝'], '일렉트로닉·밴드': ['펑크', '록'], 재즈: ['스윙 재즈', '재즈 발라드'] } },
      { ...o('깔끔한 모던', 'polished modern production', '요즘 차트 곡처럼 선명하고 깨끗하게 다듬은 소리입니다. K-pop의 기본 사운드이기도 합니다.'),
        fits: { 팝: ['신스 팝', '어쿠스틱 팝'], '일렉트로닉·밴드': ['하우스·EDM', '트랩'], 발라드: ['팝 발라드'] } },
      { ...o('넓은 스테레오', 'wide stereo', '소리를 좌우로 넓게 펼쳐 공간이 넓게 느껴지게 합니다.'),
        fits: { '일렉트로닉·밴드': ['하우스·EDM'], 팝: ['드림 팝', '신스 팝'], 발라드: ['시네마틱 발라드'] } },
      { ...o('리버브 풍부', 'lush reverb', '넓은 공간에서 울리는 듯한 잔향을 넉넉하게 줍니다. 앰비언트에서도 많이 씁니다.'),
        fits: { 발라드: ['시네마틱 발라드', '팝 발라드'], 팝: ['드림 팝'], 재즈: ['재즈 발라드'] } },
      { ...o('펀치감 드럼', 'punchy drums', '킥과 스네어가 또렷하고 세게 때리는 드럼 소리입니다.'),
        fits: { 힙합: ['붐뱁 힙합', '멜로딕 힙합'], '일렉트로닉·밴드': ['트랩', '록', '하우스·EDM'], 팝: ['인디 팝'] } },
      { ...o('테이프 질감', 'tape saturation', '카세트·릴 테이프 특유의 살짝 찌그러진 따뜻한 질감을 더합니다.'),
        fits: { 힙합: ['로파이 힙합', '붐뱁 힙합'], 팝: ['시티 팝', '인디 팝'], '일렉트로닉·밴드': ['펑크'] } },
    ] },
  ] },
  { n: 10, title: 'Vocal Style', ko: '보컬', groups: [
    { key: 'vocal', type: 'single', options: [
      // 남성·여성, 한국어·영어는 장르와 관계가 없어(성별을 장르에 묶으면 근거 없는 고정관념이 됨) 장르 줄을 넣지 않는다
      { ...o('연주곡', 'instrumental', '노래 없이 악기로만 만듭니다. 보컬 톤·언어 선택이 꺼지고, 제외 항목에 vocals가 자동으로 들어갑니다.'),
        fits: { 힙합: ['로파이 힙합', '칠 힙합'], 재즈: ['스윙 재즈', '컨템포러리 재즈'], '일렉트로닉·밴드': ['하우스·EDM'] } },
      o('남성', 'male vocals', '남성 보컬이 부릅니다.'),
      o('여성', 'female vocals', '여성 보컬이 부릅니다.'),
      { ...o('듀엣', 'male and female duet', '남녀가 주고받거나 함께 부르는 듀엣입니다.'),
        fits: { 발라드: ['팝 발라드', 'R&B 발라드'], 팝: ['시티 팝'] } },
      { ...o('합창', 'choir', '여러 명이 함께 부르는 합창입니다.'),
        fits: { 발라드: ['시네마틱 발라드'], '일렉트로닉·밴드': ['록'] } },
    ] },
    { key: 'tone', type: 'multi', max: 2, needsVocal: true, options: [
      { ...o('숨소리 섞인', 'breathy', '숨이 섞여 가볍고 속삭이는 듯한 음색입니다.'),
        fits: { 팝: ['드림 팝', '인디 팝'], 재즈: ['보사노바 재즈'], 발라드: ['어쿠스틱 발라드'] } },
      { ...o('소울풀', 'soulful', '감정을 깊게 담아 굴리듯 부르는 소울 창법입니다.'),
        fits: { 발라드: ['R&B 발라드'], 재즈: ['재즈 팝'], '일렉트로닉·밴드': ['펑크'] } },
      { ...o('파워풀', 'powerful', '성량이 크고 고음이 시원하게 뻗는 목소리입니다.'),
        fits: { 발라드: ['록 발라드', '팝 발라드'], '일렉트로닉·밴드': ['록'] } },
      { ...o('허스키', 'raspy', '거칠고 살짝 갈라지는 매력적인 목소리입니다.'),
        fits: { '일렉트로닉·밴드': ['록'], 발라드: ['록 발라드'], 재즈: ['재즈 발라드'] } },
      { ...o('속삭이듯', 'whispery', '귓속말하듯 아주 작고 가깝게 부릅니다.'),
        fits: { 팝: ['드림 팝'], 재즈: ['보사노바 재즈'], 힙합: ['칠 힙합'] } },
      { ...o('부드러운', 'smooth', '매끄럽고 편안하게 흐르는 음색입니다.'),
        fits: { 재즈: ['재즈 발라드', '재즈 팝'], 발라드: ['R&B 발라드'], 팝: ['시티 팝'] } },
    ] },
    { key: 'lang', type: 'single', needsVocal: true, options: [
      o('한국어', 'korean lyrics', '한국어로 부르게 합니다. 가사 칸에 한국어 가사를 넣으면 더 정확합니다.'),
      o('영어', 'english lyrics', '영어로 부르게 합니다. 가사 칸에 영어 가사를 넣으면 더 정확합니다.'),
    ] },
  ] },
  { n: 11, title: 'Exclusions', ko: '제외', groups: [
    { key: 'excl', type: 'multi', max: 8, options: [
      o('보컬', 'vocals', '노래 없이 연주곡으로 만들 때 고릅니다. 10번에서 "연주곡"을 고르면 자동으로 들어갑니다.'),
      o('오토튠', 'autotune', '음정을 기계적으로 보정해서 로봇처럼 들리는 보컬 효과를 뺍니다.'),
      o('EDM 드롭', 'edm drop', '빌드업 뒤에 전자음이 한꺼번에 터지는 "드롭" 구간을 뺍니다.'),
      o('강한 디스토션', 'heavy distortion', '메탈 기타처럼 지글거리며 강하게 찌그러지는 소리를 뺍니다.'),
      o('랩', 'rap', '노래 대신 랩 파트가 들어가지 않게 합니다.'),
      o('기타 솔로', 'guitar solo', '곡 중간에 길게 나오는 일렉 기타 솔로를 뺍니다.'),
      o('과한 리버브', 'excessive reverb', '소리가 멀고 뭉개지게 만드는 과한 잔향을 줄입니다.'),
      o('808', '808 bass', '트랩에서 쓰는, 묵직하게 길게 울리는 808 저음을 뺍니다.'),
    ] },
  ] },
];

const SB_KEY = 'music.suno.v1';
const SB_DEFAULT = () => ({
  intro: '', main: '', bpm: 120, feel: [], genre: '', genreCustom: '', support: [], mood: [], energy: '',
  key: '', harmony: [], arr: [], mix: [], vocal: '', tone: [], lang: '', excl: [],
});
let sb = SB_DEFAULT();
try {
  const saved = JSON.parse(localStorage.getItem(SB_KEY) || '{}');
  for (const [k, v] of Object.entries(sb)) {
    if (k in saved && Array.isArray(v) === Array.isArray(saved[k]) && typeof v === typeof saved[k]) sb[k] = saved[k];
  }
} catch {}
if (sb.key) {
  const [r, m] = sb.key.split(' ');
  const pc = pcOf(r);
  sb.key = pc >= 0 ? `${(m === 'minor' ? MINOR_KEYS : MAJOR_KEYS)[pc]} ${m}` : '';
}
const saveSb = () => { try { localStorage.setItem(SB_KEY, JSON.stringify(sb)); } catch {} };

const sbEl = { form: $('#sb-form') };
const hasVocal = () => sb.vocal && sb.vocal !== 'instrumental';

/* ---------------- 제외 항목 ---------------- */
// 11번에서 고른 값 + 연주곡이면 vocals. Style of Music 11번 줄에 'no …'로 들어간다
const excludeWords = () => [...new Set([...sb.excl, ...(sb.vocal === 'instrumental' ? ['vocals'] : [])])];

const usesTrap = () => sb.main === 'trap' || sb.support.includes('trap');
// 제외 항목 중 지금 고른 다른 값과 부딪치는 것: [제외 값, 이유]
const EXCL_CONFLICTS = [
  ['vocals', () => hasVocal(), '10번에서 보컬을 골라서 보컬은 제외할 수 없습니다'],
  ['808 bass', usesTrap, '트랩 드럼(808 포함)을 골라서 808은 제외할 수 없습니다'],
];
const exclConflict = (en) => EXCL_CONFLICTS.find(([v, on]) => v === en && on());

// 나중에 고른 값과 부딪치는 제외 항목은 자동으로 해제하고 알려 준다
function resolveConflicts() {
  const removed = EXCL_CONFLICTS.filter(([v, on]) => on() && sb.excl.includes(v));
  if (!removed.length) return;
  sb.excl = sb.excl.filter((x) => !removed.some(([v]) => v === x));
  flash(`제외 항목에서 해제했습니다: ${removed.map(([, , why]) => why).join(' · ')}`, 'warn');
}

/* ---------------- 화면 ---------------- */
// 마우스를 올리면 보이는 말풍선(악기 카드와 같은 .desc 스타일). 설명과 실제로 들어가는 영어 키워드를 함께 보여 줌
function tipEl(tip, en) {
  const t = document.createElement('span');
  t.className = 'desc';
  t.innerHTML = `${tip}${en ? `<em>출력: ${en}</em>` : ''}`;
  return t;
}

function chip(label, on, onClick, disabled = false, tip = '', en = '') {
  const b = document.createElement('button');
  b.className = 'sb-chip';
  b.append(Object.assign(document.createElement('span'), { className: 'lbl', textContent: label }));
  if (tip) b.append(tipEl(tip, en));
  b.setAttribute('aria-pressed', String(on));
  b.disabled = disabled;
  b.onclick = onClick;
  return b;
}

const MULTI_NAME = { feel: '리듬 느낌', support: '반주 악기', mood: '분위기', harmony: '멜로디·화성', arr: '편곡·구성', mix: '사운드·믹싱', tone: '보컬 톤', excl: '제외 항목' };

function toggleMulti(key, value, max) {
  const arr = sb[key];
  if (arr.includes(value)) sb[key] = arr.filter((x) => x !== value);
  else if (arr.length >= max) return flash(`${MULTI_NAME[key]}는 최대 ${max}개까지 고를 수 있습니다. 이미 고른 것 중 하나를 먼저 해제해 주세요.`, 'warn');
  else sb[key] = [...arr, value];
  commit();
}

// 여러 개 고르는 항목: 'n/최대 선택' 표시, 한도가 차면 안 고른 칩을 흐리게(누르면 이유를 알려 줌)
function limitHint(box, key, max) {
  const n = sb[key].length;
  if (n >= max) box.querySelectorAll('.sb-chip[aria-pressed="false"]:not(:disabled)').forEach((c) => c.classList.add('full'));
  box.append(Object.assign(document.createElement('small'), { className: `sb-hint${n >= max ? ' full' : ''}`, textContent: `${n}/${max} 선택` }));
}

let sbGenreTab = 0;
// 선택된 세부 장르가 들어 있는 장르 탭을 연다(불러오기·새로고침 뒤에도 선택이 보이게)
const syncGenreTab = () => {
  const i = GENRES.findIndex((g) => g.items.some((it) => it.name === sb.genre));
  if (i >= 0) sbGenreTab = i;
};
// 말풍선: 설명 아래에 '장르 / 세부 장르' 줄(대표 장르부터)을 붙인다
const withFits = (tip, x) => tip + (x.fits
  ? `<span class="fits">${Object.entries(x.fits).map(([gr, subs]) => `<span>${gr} / ${subs.join(', ')}</span>`).join('')}</span>`
  : '');

function renderGroup(g) {
  const box = document.createElement('div');
  box.className = 'sb-group';
  const off = g.needsVocal && !hasVocal();
  if (g.type === 'single') {
    // 다시 누르면 해제. 값이 ''인 선택지(예: 인트로 없음)는 '아무것도 안 고름'과 같은 상태
    g.options.forEach((x) => box.append(chip(x.ko, sb[g.key] === x.en, () => {
      sb[g.key] = sb[g.key] === x.en ? '' : x.en;
      commit();
    }, off, withFits(x.tip, x), x.shown ?? x.en)));
  } else if (g.type === 'multi') {
    g.options.forEach((x) => {
      const conflict = g.key === 'excl' && exclConflict(x.en);
      const tip = withFits(conflict ? `${x.tip}<br>(${conflict[2]})` : x.tip, x);
      box.append(chip(x.ko, sb[g.key].includes(x.en), () => toggleMulti(g.key, x.en, g.max), off || !!conflict, tip, x.shown ?? x.en));
    });
    if (g.max < g.options.length) limitHint(box, g.key, g.max);
  } else if (g.type === 'select') {
    const s = document.createElement('select');
    s.className = 'sb-select';
    g.options.forEach((x) => s.append(new Option(x.ko, x.en, false, sb[g.key] === x.en)));
    s.onchange = () => { sb[g.key] = s.value; commit(); };
    if (g.tip) {
      const wrap = Object.assign(document.createElement('span'), { className: 'sb-tipwrap' });
      wrap.append(s, tipEl(g.tip, 'Style: (선택한 키) key — 예: A minor key'));
      box.append(wrap);
    } else box.append(s);
  } else if (g.type === 'number') {
    const i = Object.assign(document.createElement('input'), { type: 'number', min: g.min, max: g.max, value: sb[g.key], className: 'sb-num' });
    i.onchange = () => {
      const v = Math.round(Number(i.value));
      if (i.value.trim() !== '' && Number.isFinite(v) && v > 0) sb[g.key] = Math.max(g.min, Math.min(g.max, v));
      commit(); // 잘못된 값이면 이전 값으로 다시 그려짐
    };
    const wrap = Object.assign(document.createElement('span'), { className: 'sb-tipwrap' });
    wrap.append(i, Object.assign(document.createElement('span'), { className: 'sb-unit', textContent: g.unit }));
    if (g.tip) wrap.append(tipEl(g.tip));
    box.append(wrap);
  } else if (g.type === 'instrument') {
    const s = document.createElement('select');
    s.className = 'sb-select';
    s.append(new Option('선택 안 함', ''));
    CATEGORIES.forEach((c) => {
      const og = document.createElement('optgroup');
      og.label = c.name;
      INSTRUMENTS.filter((d) => d.cat === c.id).forEach((d) => og.append(new Option(`${d.ko} (${d.en})`, d.id, false, sb.main === d.id)));
      s.append(og);
    });
    s.onchange = () => { sb.main = s.value; sb.support = sb.support.filter((id) => id !== s.value); commit(); };
    const wrap = Object.assign(document.createElement('span'), { className: 'sb-tipwrap' });
    const d = byId[sb.main];
    const tip = '곡을 이끄는 중심 악기입니다. 스타일에서 가장 앞쪽에 들어가 소리의 색깔을 크게 좌우합니다.'
      + (d ? `<br><b class="tip-sub">${d.ko}</b>${d.desc}` : '');
    wrap.append(s, tipEl(tip, d ? SUNO_TERM[d.id] : ''));
    box.append(wrap);
  } else if (g.type === 'instruments') {
    INSTRUMENTS.forEach((d) => {
      if (d.id !== sb.main) {
        box.append(chip(d.ko, sb.support.includes(d.id), () => toggleMulti('support', d.id, g.max), false, d.desc, SUNO_TERM[d.id]));
        return;
      }
      // 주 악기로 고른 악기는 반주에 겹쳐 넣지 않는다. 누르면 주 악기에서 빼고 반주로 옮긴다
      const c = chip(`${d.ko} · 주 악기`, false, () => {
        sb.main = '';
        sb.support = [...sb.support, d.id];
        commit();
        flash(`${d.ko}을(를) 주 악기에서 반주 악기로 옮겼습니다. 2번에서 주 악기를 다시 골라 주세요.`, 'ok');
      }, false, `${d.desc}<br>(2번 주 악기로 골라 둔 악기입니다. 누르면 주 악기에서 빼고 반주 악기로 옮깁니다)`, SUNO_TERM[d.id]);
      c.classList.add('is-main');
      box.append(c);
    });
    if (sb.support.length) box.append(Object.assign(document.createElement('small'), { className: 'sb-hint', textContent: `${sb.support.length}개 선택` }));
  } else if (g.type === 'genre') {
    const tabs = document.createElement('div');
    tabs.className = 'sb-gtabs';
    GENRES.forEach((gr, i) => {
      const t = chip(gr.name, i === sbGenreTab, () => { sbGenreTab = i; renderSb(); });
      t.classList.add('sb-gtab');
      tabs.append(t);
    });
    box.append(tabs);
    GENRES[sbGenreTab].items.forEach((it) => box.append(chip(it.name, sb.genre === it.name, () => {
      sb.genre = sb.genre === it.name ? '' : it.name;
      // BPM은 3번에서 정한 값을 그대로 둔다(장르의 BPM은 말풍선에 추천값으로만 보여 줌)
      commit();
    }, false, `${GENRE_DESC[it.name]}<br>추천 ${it.bpm} BPM · ${it.prog.join(' – ')} (믹서 추천 조합 기준)`, genreLine(it.name))));
    if (sb.genreCustom) {
      const c = chip(`분석: ${sb.genreCustom}`, true, () => { sb.genreCustom = ''; commit(); });
      c.title = '곡 분석에서 가져온 장르(누르면 제거)';
      box.append(c);
    }
  }
  return box;
}

function renderSb() {
  const focusables = () => [...sbEl.form.querySelectorAll('button, select, input')];
  const focusIdx = focusables().indexOf(document.activeElement);
  sbEl.form.replaceChildren(...SB_STEPS.map((step) => {
    const row = document.createElement('div');
    row.className = 'sb-row';
    row.innerHTML = `<div class="sb-label"><b>${step.n}. ${step.title}</b><small>${step.ko}</small></div>`;
    const body = document.createElement('div');
    body.className = 'sb-body';
    step.groups.forEach((g) => body.append(renderGroup(g)));
    row.append(body);
    return row;
  }));
  if (focusIdx >= 0) focusables()[focusIdx]?.focus();
  renderStyleCount();
}

/* ---------------- Style of Music: [생성] ---------------- */
// 8번은 값이 내부 코드라 스타일 문장에 쓸 영어 표현으로 바꾼다
const ARR_EN = {
  minimal: 'minimal arrangement', layered: 'layered arrangement', 'verse-chorus': 'verse-chorus structure',
  'build-up-drop': 'build-up and drop', breakdown: 'breakdown', 'fade-out': 'fade-out ending',
};

// 항목마다 고른 값을 영어로 모은다. 비어 있으면 그 줄은 생략
function stepValues(n) {
  switch (n) {
    case 1: return [sb.intro && `${sb.intro} intro`];
    case 2: return [sb.main && SUNO_TERM[sb.main]];
    case 3: return [`${sb.bpm} bpm`, ...sb.feel];
    case 4: return [sb.genre && genreLine(sb.genre), sb.genreCustom];
    case 5: return sb.support.map((id) => SUNO_TERM[id]);
    case 6: return [...sb.mood, sb.energy];
    case 7: {
      const prog = progressionFor();
      return [sb.key && `${sb.key} key`, prog && `chord progression ${prog.join(' - ')}`, ...sb.harmony];
    }
    case 8: return sb.arr.map((a) => ARR_EN[a]);
    case 9: return sb.mix;
    case 10: return sb.vocal === 'instrumental' ? ['instrumental'] : [[sb.tone.join(', '), sb.vocal].filter(Boolean).join(' '), sb.lang];
    // 11번: 단어만 쓰면 Suno가 오히려 그 소리를 넣을 수 있어 'no'를 붙인다
    case 11: return excludeWords().map((x) => `no ${x}`);
    default: return [];
  }
}

let styleSnapshot = null; // 마지막 [생성] 때의 선택값. 바뀌면 다시 생성하라고 알려 준다
function generateStyle() {
  const lines = SB_STEPS
    .map((s) => [s, stepValues(s.n).filter(Boolean)])
    .filter(([, v]) => v.length)
    .map(([s, v]) => `${s.n}.${s.title} : ${v.join(', ')}`);
  if (lines.length <= 1 && !sb.feel.length) return flash('항목을 하나 이상 골라 주세요.', 'warn');
  $('#sb-style').value = lines.join('\n');
  styleSnapshot = JSON.stringify(sb);
  try { localStorage.setItem('music.suno.style', $('#sb-style').value); localStorage.setItem('music.suno.styleSnap', styleSnapshot); } catch {}
  renderStyleCount();
}

function clearStyle() {
  $('#sb-style').value = '';
  styleSnapshot = null;
  try { localStorage.removeItem('music.suno.style'); localStorage.removeItem('music.suno.styleSnap'); } catch {}
  renderStyleCount();
}

function renderStyleCount() {
  const text = $('#sb-style').value;
  const stale = text && styleSnapshot !== JSON.stringify(sb);
  const el = $('#sb-style-count');
  el.textContent = text ? `${text.length}자${stale ? ' · 선택이 바뀌었습니다. [생성]을 다시 누르세요' : ''}` : '';
  el.classList.toggle('warn', text.length > 1000 || !!stale);
}

function commit() {
  if (!hasVocal()) { sb.tone = []; sb.lang = ''; }
  resolveConflicts();
  syncGenreTab();
  saveSb();
  renderSb();
}

/* ---------------- 불러오기 ---------------- */
// 주 악기 고르는 우선순위: 멜로디·화성을 끄는 악기 → 리듬 악기
const MAIN_PRIORITY = ['keys', 'guitar', 'wind', 'strings', 'synth', 'dj', 'bass', 'perc', 'drums'];
function setInstrumentsFrom(ids) {
  const sorted = [...ids].sort((a, b) => MAIN_PRIORITY.indexOf(byId[a].cat) - MAIN_PRIORITY.indexOf(byId[b].cat));
  sb.main = sorted[0] || '';
  // 반주는 리듬(드럼·베이스)부터 채워 곡의 뼈대가 먼저 전달되게
  const rest = sorted.slice(1).sort((a, b) => MAIN_PRIORITY.indexOf(byId[b].cat) - MAIN_PRIORITY.indexOf(byId[a].cat));
  sb.support = rest;
}

function fromMixer() {
  const ids = INSTRUMENTS.filter((d) => state[d.id]?.active).map((d) => d.id);
  if (!ids.length) return flash('믹서에 켜진 악기가 없습니다. 악기나 추천 조합을 먼저 골라 주세요.', 'warn');
  setInstrumentsFrom(ids);
  sb.bpm = +el.bpm.value; // Transport.bpm은 rampTo 중이면 중간값일 수 있음
  if (currentPreset) { sb.genre = currentPreset; sb.genreCustom = ''; }
  commit();
  flash('지금 믹서의 악기·BPM' + (currentPreset ? '·장르' : '') + '를 불러왔습니다.', 'ok');
}

function fromSong() {
  if (!last) return flash('먼저 "곡으로 조합 만들기" 탭에서 곡을 분석해 주세요.', 'warn');
  const { res, mix } = last;
  setInstrumentsFrom(mix.picks.map((p) => p.id));
  sb.bpm = res.bpm;
  // 분석은 #/b 어느 쪽으로든 줄 수 있어 키 목록의 표기로 맞춘다(예: 장조 C# → Db, 단조 Db → C#)
  const minor = res.scale === 'minor';
  const list = minor ? MINOR_KEYS : MAJOR_KEYS;
  const pc = pcOf(res.key);
  sb.key = pc >= 0 ? `${list[pc]} ${minor ? 'minor' : 'major'}` : '';
  sb.genre = '';
  sb.genreCustom = res.genres.slice(0, 2).map(([g]) => g.split('---').pop().toLowerCase()).join(', ');
  // 보컬은 있어도 성별까지는 알 수 없어 채우지 않고 안내만 한다
  const voice = mix.detected.some((d) => d.key === 'voice' && d.score > 0.2);
  commit();
  flash(`"${res.name}" 분석 결과를 불러왔습니다.${voice && !sb.vocal ? ' 보컬이 감지되었으니 10번에서 보컬 종류를 골라 주세요.' : ''}`, 'ok');
}

// 고른 주 악기 + 반주 악기를 믹서로 들어보기(장르를 골랐으면 그 장르의 코드 진행으로)
function previewSb() {
  const ids = [sb.main, ...sb.support].filter(Boolean);
  if (!ids.length) return flash('주 악기나 반주 악기를 먼저 골라 주세요.', 'warn');
  const preset = GENRES.flatMap((g) => g.items).find((p) => p.name === sb.genre);
  markPreset(null);
  applyCombo(ids, sb.bpm, 0, preset?.prog ?? DEFAULT_PROG);
}

async function copyOut(id, label) {
  const text = $(`#${id}`).value;
  if (!text) return flash(`${label}에 복사할 내용이 없습니다. 먼저 [생성]을 눌러 주세요.`, 'warn');
  if (await copyText(text)) flash(`${label}을(를) 복사했습니다.`, 'ok');
}

$('#sb-from-mixer').onclick = fromMixer;
$('#sb-from-song').onclick = fromSong;
$('#sb-preview').onclick = previewSb;
$('#sb-reset').onclick = () => { sb = SB_DEFAULT(); commit(); };
$('#sb-gen').onclick = generateStyle;
$('#sb-copy-style').onclick = () => copyOut('sb-style', 'Style of Music');
$('#sb-clear-style').onclick = clearStyle;
try {
  $('#sb-style').value = localStorage.getItem('music.suno.style') || '';
  styleSnapshot = localStorage.getItem('music.suno.styleSnap');
} catch {}
syncGenreTab();
renderSb();
