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

// 코드 진행은 스타일에 넣지 않는다: 곡과 무관한 장르 기본 진행이 Suno의 화성을 엉뚱하게 끌고 갈 수 있다

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

// 항목 정의. groups 안의 각 그룹이 하나의 선택값(single/multi/select/number)을 가진다.
const SB_STEPS = [
  { n: 1, title: 'Intro/Outro', ko: '인트로/아웃트로', groups: [
    { key: 'intro', type: 'single', label: '인트로', options: [
      // fits: 3번과 같이 대표 장르부터(일반적인 장르 관행 기준)
      { ...o('인트로 없음', '', '인트로 없이 곧바로 본 곡(벌스나 메인 테마)으로 시작합니다.', ''),
        fits: { 힙합: ['붐뱁 힙합', '멜로딕 힙합'], 팝: ['신스 팝', '인디 팝'], '일렉트로닉·밴드': ['펑크'] } },
      { ...o('피아노 인트로', 'soft piano', '잔잔한 피아노 연주로 조용히 시작합니다.', 'soft piano intro'),
        fits: { 발라드: ['팝 발라드', '시네마틱 발라드'], 재즈: ['재즈 발라드'], 힙합: ['칠 힙합'] } },
      { ...o('패드 인트로', 'ambient pads', '길게 깔리는 신스 패드로 공간감 있게 시작합니다. 앰비언트에서도 많이 씁니다.', 'ambient pads intro'),
        fits: { 팝: ['드림 팝', '신스 팝'], '일렉트로닉·밴드': ['하우스·EDM'], 발라드: ['R&B 발라드'] } },
      { ...o('드럼 필', 'drum fill', '짧은 드럼 연타로 힘 있게 곡을 엽니다.', 'drum fill intro'),
        fits: { '일렉트로닉·밴드': ['록', '펑크'], 팝: ['인디 팝'], 재즈: ['스윙 재즈'] } },
      { ...o('드럼 필 + 신스 베이스', 'drum fill and synth bass', '드럼 연타로 열고 신스 베이스가 바로 그루브를 받쳐 주며 시작합니다. 곡 분석에서 도입부 드럼·베이스가 함께 두드러지면 자동으로 골라집니다.', 'drum fill and synth bass intro'),
        fits: { '일렉트로닉·밴드': ['하우스·EDM'], 팝: ['신스 팝'] } },
      { ...o('기타 리프', 'guitar riff', '귀에 남는 짧은 기타 프레이즈로 시작합니다.', 'guitar riff intro'),
        fits: { '일렉트로닉·밴드': ['록', '펑크'], 팝: ['인디 팝', '시티 팝'], 발라드: ['록 발라드'] } },
      { ...o('아카펠라', 'a cappella vocals', '반주 없이 목소리만으로 시작합니다. 10번에서 보컬을 고를 때 어울립니다.', 'a cappella vocals intro'),
        fits: { 발라드: ['팝 발라드', 'R&B 발라드'], 팝: ['어쿠스틱 팝'] } },
      { ...o('시네마틱 빌드업', 'cinematic build-up', '현악기와 효과음으로 영화처럼 점점 고조시키며 시작합니다.', 'cinematic build-up intro'),
        fits: { 발라드: ['시네마틱 발라드', '록 발라드'], '일렉트로닉·밴드': ['하우스·EDM'] } },
      { ...o('바이닐 노이즈', 'vinyl crackle', '레코드판 잡음으로 복고 분위기를 깔고 시작합니다.', 'vinyl crackle intro'),
        fits: { 힙합: ['로파이 힙합', '재즈 힙합', '칠 힙합'], 재즈: ['재즈 발라드'] } },
    ] },
    // 끝맺는 방식. 값은 OUTRO_EN으로 스타일 문장이 된다
    { key: 'outro', type: 'single', label: '아웃트로', options: [
      o('선택 안 함', '', 'Suno가 알아서 끝맺습니다.', ''),
      { ...o('깔끔한 엔딩', 'clean', '마지막 화음과 드럼 한 방으로 딱 끊어 끝냅니다. 곡이 흐지부지 끝나지 않게 할 때 좋습니다.', 'clean, decisive ending on a final hit'),
        fits: { 팝: ['신스 팝', '어쿠스틱 팝'], '일렉트로닉·밴드': ['록', '하우스·EDM', '펑크'] } },
      { ...o('페이드아웃', 'fade-out', '곡 끝에서 소리가 점점 작아지며 사라지게 끝냅니다.', 'gradual fade-out ending'),
        fits: { 팝: ['시티 팝', '드림 팝'], 힙합: ['로파이 힙합', '칠 힙합'], '일렉트로닉·밴드': ['펑크'] } },
      { ...o('후렴 반복', 'chorus', '마지막에 후렴 훅을 몇 번 더 반복하며 신나게 끝냅니다.', 'outro repeating the chorus hook'),
        fits: { 팝: ['신스 팝', '인디 팝'], '일렉트로닉·밴드': ['하우스·EDM'], 힙합: ['멜로딕 힙합'] } },
      { ...o('악기 아웃트로', 'instrumental', '노래가 끝난 뒤 메인 악기 멜로디로 짧게 마무리합니다.', 'instrumental outro with the main hook'),
        fits: { '일렉트로닉·밴드': ['록', '펑크'], 재즈: ['컨템포러리 재즈'], 팝: ['시티 팝'] } },
      { ...o('잔잔한 마무리', 'soft', '악기를 덜어 내고 피아노나 기타로 조용히 끝냅니다.', 'soft, gentle outro'),
        fits: { 발라드: ['팝 발라드', '어쿠스틱 발라드', '시네마틱 발라드'], 재즈: ['재즈 발라드'] } },
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
    // 분위기를 정하는 건 장조/단조뿐이고 키 이름(C·A…)은 노래 높이만 바꿔서 세 가지로만 고른다.
    // 직접 고르기 전에는 6번 분위기에 맞춰 자동으로 골라진다(autoKey)
    { key: 'key', type: 'single', options: [
      o('선택 안 함', '', 'Suno가 장르와 분위기를 보고 알아서 정합니다. 잘 모르겠으면 이걸 고르세요.', ''),
      o('밝게 (Major)', 'major', '장조. 밝고 경쾌하고 희망찬 느낌입니다. 희망찬·경쾌한·로맨틱·편안한 분위기와 어울립니다.', 'major key'),
      o('감성 (Minor)', 'minor', '단조. 감성적이고 애틋하거나 쓸쓸한 느낌입니다. 우울한·감성적·어두운·웅장한·몽환적 분위기와 어울립니다. 신나지만 살짝 애틋한 댄스곡에도 많이 씁니다.', 'minor key'),
    ] },
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
      // 페이드아웃 엔딩은 1번 아웃트로로 옮겼다
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

// 선택지 en → 한글, 항목별(곡 분석 결과 칸에서 씀). 예: OPTION_KO.feel['driving beat'] → '드라이빙'
const OPTION_KO = Object.fromEntries(SB_STEPS.flatMap((st) => st.groups).filter((g) => g.options)
  .map((g) => [g.key, Object.fromEntries(g.options.map((x) => [x.en, x.ko]))]));

const SB_KEY = 'music.suno.v1';
// 11번 제외 항목은 보컬만 빼고 모두 켜 둔다(보컬은 10번에서 연주곡을 고를 때만 자동으로 들어감)
const EXCL_DEFAULT = () => SB_STEPS.find((st) => st.n === 11).groups[0].options.map((x) => x.en).filter((en) => en !== 'vocals');
const SB_DEFAULT = () => ({
  intro: '', outro: '', main: '', bpm: 120, feel: [], genre: '', genreCustom: '', support: [], mood: [], energy: '',
  key: '', keyManual: false, harmony: [], arr: [], mix: [], vocal: '', tone: [], lang: '', excl: EXCL_DEFAULT(),
});
let sb = SB_DEFAULT();
try {
  const saved = JSON.parse(localStorage.getItem(SB_KEY) || '{}');
  for (const [k, v] of Object.entries(sb)) {
    if (k in saved && Array.isArray(v) === Array.isArray(saved[k]) && typeof v === typeof saved[k]) sb[k] = saved[k];
  }
  // 제외 기본값이 생기기 전에 저장된 선택(제외 없음)에는 한 번만 기본값을 채운다. 이후에 직접 끈 항목은 그대로 둔다
  if (!localStorage.getItem('music.suno.exclDefault')) {
    if (!sb.excl.length) sb.excl = EXCL_DEFAULT();
    localStorage.setItem('music.suno.exclDefault', '1');
  }
} catch {}
// 예전에는 페이드아웃이 8번 편곡에 있었다 → 1번 아웃트로로 옮긴다
if (sb.arr.includes('fade-out')) {
  sb.arr = sb.arr.filter((a) => a !== 'fade-out');
  sb.outro ||= 'fade-out';
}

// 예전에는 'E major'처럼 키 이름까지 골랐다 → 장조/단조만 남기고, 직접 고른 값으로 본다
if (sb.key && sb.key !== 'major' && sb.key !== 'minor') {
  sb.key = sb.key.endsWith('minor') ? 'minor' : 'major';
  sb.keyManual = true;
}

// 7번 자동 선택: 6번 분위기가 한쪽으로만 모이면 그쪽, 섞였거나 없으면 '선택 안 함'
const BRIGHT_MOODS = ['uplifting', 'playful', 'romantic', 'chill'];
const DARK_MOODS = ['melancholic', 'emotional', 'dark', 'epic', 'dreamy'];
function autoKey(mood) {
  const bright = mood.some((m) => BRIGHT_MOODS.includes(m));
  const dark = mood.some((m) => DARK_MOODS.includes(m));
  return bright === dark ? '' : bright ? 'major' : 'minor';
}
const saveSb = () => { try { localStorage.setItem(SB_KEY, JSON.stringify(sb)); } catch {} };

const sbEl = { form: $('#sb-form') };
const hasVocal = () => sb.vocal && sb.vocal !== 'instrumental';

/* ---------------- 제외 항목 ---------------- */
// 11번에서 고른 값 + 연주곡이면 vocals. Style of Music 11번 줄에 'no …'로 들어간다
const excludeWords = (s = sb) => [...new Set([...s.excl, ...(s.vocal === 'instrumental' ? ['vocals'] : [])])];

const usesTrap = () => sb.main === 'trap' || sb.support.includes('trap');
// 제외 항목 중 지금 고른 다른 값과 부딪치는 것: [제외 값, 이유]
const EXCL_CONFLICTS = [
  ['vocals', () => hasVocal(), '10번에서 보컬을 골라서 보컬은 제외할 수 없습니다'],
  ['808 bass', usesTrap, '트랩 드럼(808 포함)을 골라서 808은 제외할 수 없습니다'],
  ['edm drop', () => sb.arr.includes('build-up-drop'), '8번에서 빌드업 → 드롭을 골라서 EDM 드롭은 제외할 수 없습니다'],
  ['excessive reverb', () => sb.mix.includes('lush reverb'), '9번에서 리버브 풍부를 골라서 과한 리버브는 제외할 수 없습니다'],
];
const exclConflict = (en) => EXCL_CONFLICTS.find(([v, on]) => v === en && on());

// 나중에 고른 값과 부딪치는 제외 항목은 자동으로 해제하고 알려 준다
// 해제한 이유 목록을 돌려준다. quiet면 알림 없이 정리만(페이지를 열 때, 다른 알림과 합쳐 보여 줄 때)
function resolveConflicts(quiet = false) {
  const removed = EXCL_CONFLICTS.filter(([v, on]) => on() && sb.excl.includes(v));
  if (!removed.length) return [];
  sb.excl = sb.excl.filter((x) => !removed.some(([v]) => v === x));
  const why = removed.map(([, , w]) => w);
  if (!quiet) flash(`제외 항목에서 해제했습니다: ${why.join(' · ')}`, 'warn');
  return why;
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
  // 한 항목에 그룹이 여럿이면(예: 1번 인트로·아웃트로) 앞에 작은 이름을 붙여 구분한다
  if (g.label) box.append(Object.assign(document.createElement('span'), { className: 'sb-glabel', textContent: g.label }));
  const off = g.needsVocal && !hasVocal();
  if (g.type === 'single') {
    // 다시 누르면 해제. 값이 ''인 선택지(예: 인트로 없음)는 '아무것도 안 고름'과 같은 상태
    g.options.forEach((x) => box.append(chip(x.ko, sb[g.key] === x.en, () => {
      sb[g.key] = sb[g.key] === x.en ? '' : x.en;
      if (g.key === 'key') sb.keyManual = true; // 직접 고르면 6번 분위기에 따른 자동 선택을 끈다
      commit();
    }, off, withFits(x.tip, x), x.shown ?? x.en)));
    // 곡 분석에서 가져와 선택지에 없는 값(예: 인트로 'electronic drums')은 따로 보여 주고 누르면 지운다
    if (sb[g.key] && !g.options.some((x) => x.en === sb[g.key])) {
      const c = chip(`분석: ${sb[g.key]}`, true, () => { sb[g.key] = ''; commit(); }, off);
      c.title = '곡 분석에서 가져온 값(누르면 제거)';
      box.append(c);
    }
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

/* ---------------- Concept (1번 위) ----------------
 * 곡의 핵심 요구 사항. 처음에는 비어 있고, 컨셉 도우미에서 고른 항목으로 자동 작성된다.
 * 직접 고치면 자동 작성이 멈추고(conceptManual), [선택 항목으로 다시 만들기]로 되돌린다. [생성]하면 목록형·문장형 맨 앞쪽에 들어간다.
 * '① …' 같은 한글 제목 줄은 사람이 보는 메모라서 ':' 뒤의 영어 문장만 쓴다(':'로 시작하는 줄이 없으면 모든 줄을 쓴다) */
const CONCEPT_KEY = 'music.suno.concept';
const CONCEPT_MANUAL_KEY = 'music.suno.conceptManual';
// 예전 버전의 기본 내용 — 저장된 값이 이것과 같으면 직접 고친 것이 아니라서 자동 작성으로 바꾼다
const CONCEPT_LEGACY_DEFAULT = `① 속이 뻥 뚫리는 클라이맥스
: Short breakdown and rising snare build-up, then an explosive, euphoric, cathartic final chorus with a key change up and soaring high notes
② 중독성 있는 가사와 멜로디
: Extremely catchy, addictive sing-along chorus hook with repetitive lyrics and an earworm synth lead melody, plus a post-chorus vocal chop hook
③ 청량한 여성 보컬
: Crisp, airy, refreshing female vocals with a sparkling, clear tone, no male vocals
④ 보컬 없이 신스 베이스로 경쾌한 인트로
: Start immediately with a solo bouncy, groovy synth bass riff, punchy drums enter after 2 bars, instrumental intro with no vocals, no slow intro`;
let concept = '';
let conceptManual = false;
try {
  const v = localStorage.getItem(CONCEPT_KEY);
  conceptManual = localStorage.getItem(CONCEPT_MANUAL_KEY) === '1'
    || (v !== null && v.trim() !== '' && v.replace(/\n+/g, '\n') !== CONCEPT_LEGACY_DEFAULT.replace(/\n+/g, '\n') && localStorage.getItem(CONCEPT_MANUAL_KEY) === null);
  if (conceptManual && v !== null) concept = v;
} catch {}

function conceptParts(text = concept) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const english = lines.filter((l) => /^[:：]/.test(l)).map((l) => l.slice(1).trim());
  return (english.length ? english : lines).map((p) => p.replace(/[.\s]+$/, '')).filter(Boolean);
}

// renderSb가 행을 매번 새로 그려도 입력 중인 내용이 사라지지 않게 컨셉 행은 한 번만 만들어 재사용한다
const conceptRow = document.createElement('div');
conceptRow.className = 'sb-row sb-concept';
conceptRow.innerHTML = `<div class="sb-label"><b>Concept</b><small>컨셉 · 스타일 맨 앞에 들어감</small></div>
  <div class="sb-body">
    <textarea id="sb-concept" rows="9" spellcheck="false" aria-label="곡 컨셉"></textarea>
    <div class="sb-concept-foot">
      <small id="sb-concept-note"></small>
      <span class="sb-btns">
        <button type="button" class="ghost" id="sb-concept-reset">선택 항목으로 다시 만들기</button>
        <button type="button" class="ghost danger" id="sb-concept-clear" title="컨셉 도우미의 답과 Concept 내용만 지웁니다(1~11번 선택은 그대로)">컨셉 초기화</button>
      </span>
    </div>
  </div>`;
const conceptBox = $('#sb-concept', conceptRow);
conceptBox.value = concept;
// 세로 스크롤이 생기지 않게 내용 높이에 맞춘다(입력·폭 변경·탭이 처음 보일 때)
const fitConcept = () => {
  if (!conceptBox.offsetParent) return; // 숨겨진 동안에는 높이를 잴 수 없다
  conceptBox.style.height = 'auto';
  conceptBox.style.height = `${conceptBox.scrollHeight + conceptBox.offsetHeight - conceptBox.clientHeight}px`;
};
// 폭이 바뀔 때만 다시 맞춘다(높이를 바꾼 것으로 다시 불려 반복되지 않게). 숨겨졌다 보일 때도 폭이 0 → 실제 폭으로 바뀐다
let conceptWidth = 0;
new ResizeObserver(([e]) => {
  if (e.contentRect.width === conceptWidth) return;
  conceptWidth = e.contentRect.width;
  fitConcept();
}).observe(conceptBox);
conceptBox.placeholder = '위의 컨셉 도우미에서 항목을 고르면 여기에 자동으로 작성됩니다.';
function setConcept(text, manual) {
  concept = text;
  conceptManual = manual;
  if (conceptBox.value !== text) conceptBox.value = text;
  try { localStorage.setItem(CONCEPT_KEY, concept); localStorage.setItem(CONCEPT_MANUAL_KEY, manual ? '1' : '0'); } catch {}
  $('#sb-concept-note', conceptRow).textContent = manual
    ? '직접 고친 내용이라 도우미 선택이 바뀌어도 그대로 둡니다. \':\' 뒤의 영어 문장만 스타일에 들어갑니다.'
    : '도우미에서 고른 항목으로 자동 작성됩니다. 직접 고치면 자동 작성이 멈춥니다. \':\' 뒤의 영어 문장만 스타일에 들어갑니다.';
  fitConcept();
  renderStyleCount();
}
conceptBox.oninput = () => setConcept(conceptBox.value, true);
// 도우미 선택이 바뀌면(직접 고치지 않았을 때만) Concept을 다시 쓴다
const syncConcept = () => { if (!conceptManual) setConcept(helperConcept(), false); };
$('#sb-concept-reset', conceptRow).onclick = () => {
  setConcept(helperConcept(), false);
  flash('도우미에서 고른 항목으로 Concept을 다시 만들었습니다.', 'ok');
};

/* ---------------- 컨셉 도우미 (Concept 위) ----------------
 * 음악을 몰라도 "누가·언제·어떤 기분으로 들을 곡인가"에 답하면 Concept 초안과 6번 분위기 추천을 만든다.
 * 서버·LLM 없이 동작해야 해서 자유 입력 대신 선택지로 묻고, 선택지마다 영어 문장과 분위기(6번 값)를 붙여 둔다 */
const helperOpt = (ko, en, mood = []) => ({ ko, en, mood });
const HELPER_QS = [
  { key: 'scene', title: '① 듣는 상황', hint: '누가·언제·어디서 들을까요? (2개까지)', max: 2, options: [
    helperOpt('드라이브', 'perfect for a carefree drive'), helperOpt('카페·휴식', 'cozy café background'), helperOpt('출근길', 'a bright morning-commute pick-me-up'),
    helperOpt('운동', 'workout-ready drive', ['uplifting']), helperOpt('공부·집중', 'steady and focus-friendly', ['chill']), helperOpt('파티·댄스', 'made for the dance floor', ['playful']),
    helperOpt('밤 산책', 'a late-night walk under city lights', ['dreamy']), helperOpt('비 오는 날', 'a rainy-day listen', ['melancholic']),
  ] },
  { key: 'story', title: '② 한 줄 이야기', hint: '이 곡이 하는 말은? (1개)', max: 1, options: [
    helperOpt('설렘·새 사랑', 'a story of falling in love, giddy excitement', ['romantic', 'uplifting']),
    helperOpt('짝사랑', 'a story of a secret crush, shy and hopeful', ['romantic', 'dreamy']),
    helperOpt('이별·그리움', 'a story of missing someone who is gone', ['melancholic', 'emotional']),
    helperOpt('추억·회상', 'a story of looking back on golden memories', ['nostalgic', 'emotional']),
    helperOpt('위로·힐링', 'a gentle story of comfort and healing', ['chill', 'emotional']),
    helperOpt('자신감·도전', 'a story of courage and moving forward', ['uplifting', 'epic']),
    helperOpt('자유·일탈', 'a story of breaking free with carefree joy', ['playful', 'uplifting']),
  ] },
  { key: 'feel', title: '③ 느낌 단어', hint: '분위기·에너지·색깔 (3개까지)', max: 3, options: [
    helperOpt('청량한', 'crisp and refreshing'), helperOpt('따뜻한', 'warm and cozy', ['chill']), helperOpt('반짝이는', 'sparkling and bright', ['uplifting']),
    helperOpt('경쾌한', 'bouncy and playful', ['playful']), helperOpt('시원하게 뻥 뚫리는', 'wide-open and liberating', ['uplifting']), helperOpt('잔잔한', 'calm and gentle', ['chill']),
    helperOpt('몽환적인', 'dreamy and hazy', ['dreamy']), helperOpt('웅장한', 'grand and cinematic', ['epic']), helperOpt('쓸쓸한', 'lonely and wistful', ['melancholic']),
    helperOpt('황금빛', 'warm golden-hour glow'),
  ] },
  { key: 'must', title: '④ 꼭 지킬 것', hint: '이게 빠지면 이 곡이 아니다 싶은 것', max: 8, options: [
    helperOpt('속이 뻥 뚫리는 클라이맥스', 'Snare build-up into an explosive, cathartic final chorus with a key change and soaring high notes'),
    helperOpt('중독성 있는 가사와 멜로디', 'Catchy, addictive sing-along chorus hook with repetitive lyrics and an earworm synth melody'),
    helperOpt('청량한 여성 보컬', 'Crisp, airy, refreshing female vocals with a sparkling, clear tone, no male vocals'),
    helperOpt('부드러운 남성 보컬', 'Smooth, warm male vocals with an open, powerful chorus'),
    helperOpt('보컬 없이 신스 베이스로 경쾌한 인트로', 'Instrumental intro: solo bouncy synth bass riff, drums enter after 2 bars, no slow intro'),
    helperOpt('어쿠스틱 기타 중심', 'Bright acoustic guitar strumming leads the song with a warm, organic feel'),
    helperOpt('피아노 감성', 'Emotional piano carries the melody, intimate and heartfelt'),
  ] },
];
const HELPER_KEY = 'music.suno.helper';
// extra: ⑤ 직접 추가 원문, extraEn: 번역한 영어 줄들, extraSrc: 번역할 때의 원문(바뀌면 다시 번역해야 함)
const HELPER_EMPTY = () => ({ scene: [], story: [], feel: [], must: [], extra: '', extraEn: [], extraSrc: '' });
let helper = HELPER_EMPTY();
try { Object.assign(helper, JSON.parse(localStorage.getItem(HELPER_KEY) || '{}')); } catch {}
const saveHelper = () => { try { localStorage.setItem(HELPER_KEY, JSON.stringify(helper)); } catch {} };
const helperPicked = (q) => q.options.filter((x) => helper[q.key].includes(x.ko));

// 답 → Concept 초안(한글 제목 줄 + ':' 영어 줄)
function helperConcept() {
  const [scene, story, feel, must] = HELPER_QS.map(helperPicked);
  const items = []; // [한글 제목, 영어 문장] — 고른 것만, 번호는 ①부터 이어서
  if (scene.length) items.push([`듣는 상황: ${scene.map((x) => x.ko).join(', ')}`, sentence(joinAnd(scene.map((x) => x.en)))]);
  if (story.length) items.push([`이야기: ${story[0].ko}`, sentence(story[0].en)]);
  if (feel.length) items.push([`느낌: ${feel.map((x) => x.ko).join(' · ')}`, sentence(feel.map((x) => x.en).join(', '))]);
  must.forEach((x) => items.push([x.ko, x.en]));
  // ⑤ 직접 추가: 영어로 적었으면 그대로, 한글이면 번역이 끝난(원문이 그대로인) 경우에만 넣는다
  const extra = extraLines();
  if (extra.length && !HANGUL.test(helper.extra)) items.push(['직접 추가', extra.join('. ')]);
  else if (extra.length && extraTranslated()) items.push([`직접 추가: ${extra.join(' / ')}`, helper.extraEn.join('. ')]);
  return items.map(([ko, en], i) => `${'①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮'[i]} ${ko}\n: ${en}`).join('\n');
}

// 답 → 6번 분위기 추천(많이 나온 순으로 최대 3개)
function helperMoods() {
  const count = {};
  HELPER_QS.flatMap(helperPicked).forEach((x) => x.mood.forEach((m) => { count[m] = (count[m] || 0) + 1; }));
  return Object.entries(count).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([m]) => m);
}

const helperRow = document.createElement('div');
helperRow.className = 'sb-row sb-helper';
function renderHelper() {
  const body = document.createElement('div');
  body.className = 'sb-body';
  HELPER_QS.slice(0, 3).forEach((q) => body.append(helperGroup(q)));
  body.append(helperGroup(HELPER_QS[3]), extraBox());
  const ref = document.createElement('small');
  ref.className = 'sb-helper-note';
  ref.innerHTML = '⑥ 참고 곡: 비슷한 곡이 있으면 <b>곡으로 조합 만들기</b>에서 분석한 뒤 위의 [곡 분석 불러오기]로 장르·템포·악기를 가져오세요.';
  const preview = document.createElement('div');
  preview.className = 'sb-helper-preview';
  const apply = Object.assign(document.createElement('button'), { className: 'primary', textContent: '추천 분위기 6번에 적용' });
  apply.onclick = applyHelper;
  const foot = document.createElement('div');
  foot.className = 'sb-concept-foot';
  foot.append(preview, apply);
  body.append(ref, foot);
  helperRow.replaceChildren(
    Object.assign(document.createElement('div'), { className: 'sb-label', innerHTML: '<b>컨셉 도우미</b><small>고른 항목으로 아래 Concept이 작성돼요</small>' }),
    body,
  );
  renderHelperPreview();
}
/* ⑤ 직접 추가: 곡마다 덧붙이는 자유 지시. 영어는 그대로, 한글은 [영어로 번역](허브 /api/music/translate → Morfac)으로 바꿔 넣는다.
 * 원문을 고치면 번역이 낡은 것이 되어 Concept에서 빠지고 다시 번역하라고 알린다 */
const HANGUL = /[가-힣ㄱ-ㅎㅏ-ㅣ]/;
const extraLines = () => helper.extra.split('\n').map((l) => l.trim()).filter(Boolean);
const extraTranslated = () => helper.extraSrc === helper.extra && helper.extraEn.length > 0;

function extraBox() {
  const box = document.createElement('div');
  box.className = 'sb-group sb-extra';
  box.append(Object.assign(document.createElement('span'), { className: 'sb-glabel', textContent: '⑤ 직접 추가' }));
  const col = document.createElement('div');
  col.className = 'sb-extra-col';
  const area = Object.assign(document.createElement('textarea'), {
    rows: 3, value: helper.extra, spellcheck: false,
    placeholder: '덧붙이고 싶은 지시를 한 줄씩 적으세요. 한글은 [영어로 번역], 영어는 그대로 들어가요 (예: 후렴에 박수 소리를 넣어줘)',
  });
  const row = document.createElement('div');
  row.className = 'sb-extra-row';
  const btn = Object.assign(document.createElement('button'), { type: 'button', className: 'ghost', textContent: '영어로 번역' });
  const status = document.createElement('small');
  const update = () => {
    const ko = HANGUL.test(helper.extra);
    btn.hidden = !ko;
    status.textContent = !extraLines().length ? ''
      : !ko ? '영어 문장이라 그대로 Concept에 들어갑니다.'
      : extraTranslated() ? `번역: ${helper.extraEn.join(' / ')}`
      : '한글이 있어요. [영어로 번역]을 눌러야 Concept에 들어갑니다.';
    status.classList.toggle('warn', ko && !extraTranslated());
  };
  area.oninput = () => { helper.extra = area.value; saveHelper(); update(); syncConcept(); };
  btn.onclick = () => translateExtra(btn, update);
  row.append(btn, status);
  col.append(area, row);
  box.append(col);
  update();
  return box;
}

async function translateExtra(btn, done) {
  const src = helper.extra;
  btn.disabled = true;
  btn.textContent = '번역 중…';
  try {
    const r = await fetch('/api/music/translate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: src }),
    });
    const data = await r.json().catch(() => null);
    // 404·405·501: 번역 라우트가 없는 서버(로컬 정적 서버, nginx 설정 전)
    if (!r.ok || !Array.isArray(data?.lines)) throw new Error(data?.error || ([404, 405, 501].includes(r.status) ? 'NO_SERVER' : `HTTP ${r.status}`));
    Object.assign(helper, { extraEn: data.lines, extraSrc: src });
    saveHelper();
    syncConcept();
    flash('영어로 번역해 Concept에 넣었습니다.', 'ok');
  } catch (e) {
    flash(e.message === 'NO_SERVER'
      ? '번역 서버를 찾지 못했습니다. 번역은 허브가 있는 배포 사이트에서만 됩니다(로컬에서는 영어로 직접 적어 주세요).'
      : `번역하지 못했습니다: ${e.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '영어로 번역';
    done();
  }
}

function helperGroup(q) {
  const box = document.createElement('div');
  box.className = 'sb-group';
  box.title = q.hint;
  box.append(Object.assign(document.createElement('span'), { className: 'sb-glabel', textContent: q.title }));
  q.options.forEach((x) => box.append(chip(x.ko, helper[q.key].includes(x.ko), () => {
    const arr = helper[q.key];
    if (arr.includes(x.ko)) helper[q.key] = arr.filter((v) => v !== x.ko);
    else if (q.max === 1) helper[q.key] = [x.ko];
    else if (arr.length >= q.max) return flash(`${q.title}은(는) ${q.max}개까지 고를 수 있습니다.`, 'warn');
    else helper[q.key] = [...arr, x.ko];
    saveHelper();
    renderHelper();
    syncConcept();
  }, false, x.mood.length ? `${q.hint}<br>추천 분위기: ${x.mood.map((m) => OPTION_KO.mood[m]).join(', ')}` : q.hint, x.en)));
  return box;
}
function renderHelperPreview() {
  const moods = helperMoods();
  const key = autoKey(moods);
  $('.sb-helper-preview', helperRow).innerHTML = [
    `추천 분위기(6번): <b>${moods.length ? moods.map((m) => OPTION_KO.mood[m]).join(', ') : '없음'}</b>`,
    `7번: <b>${key === 'major' ? '밝게 (Major)' : key === 'minor' ? '감성 (Minor)' : '선택 안 함'}</b>`,
  ].filter(Boolean).join(' · ');
}
// 6번 분위기는 직접 고른 값을 덮어쓰지 않게 버튼으로만 적용한다(Concept은 선택에 따라 자동으로 바뀜)
function applyHelper() {
  const moods = helperMoods();
  if (!moods.length) return flash('추천할 분위기가 없습니다. ①~③에서 항목을 골라 주세요.', 'warn');
  sb.mood = moods;
  sb.keyManual = false; // 7번은 새 분위기에 맞춰 자동으로
  commit();
  flash(`6번 분위기를 ${moods.map((m) => OPTION_KO.mood[m]).join(', ')}(으)로 바꿨습니다.`, 'ok');
}

function renderSb() {
  const focusables = () => [...sbEl.form.querySelectorAll('button, select, input')];
  const focusIdx = focusables().indexOf(document.activeElement);
  sbEl.form.replaceChildren(helperRow, conceptRow, ...SB_STEPS.map((step) => {
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
  'build-up-drop': 'build-up and drop', breakdown: 'breakdown',
};
// 1번 아웃트로: 값 → 스타일 문장(선택지의 '출력'과 같다)
const OUTRO_EN = Object.fromEntries(SB_STEPS[0].groups.find((g) => g.key === 'outro').options.filter((x) => x.en).map((x) => [x.en, x.shown]));

// 항목마다 고른 값을 영어로 모은다. 비어 있으면 그 줄은 생략
function stepValues(n, s = sb) {
  switch (n) {
    case 1: return [s.intro && `${s.intro} intro`, s.outro && OUTRO_EN[s.outro]];
    case 2: return [s.main && SUNO_TERM[s.main]];
    case 3: return [`${s.bpm} bpm`, ...s.feel];
    case 4: return [s.genre && (s.genreShort ? GENRE_EN[s.genre] : genreLine(s.genre)), s.genreCustom];
    case 5: return s.support.map((id) => SUNO_TERM[id]);
    case 6: return [...s.mood, s.energy];
    case 7: return [s.key && `${s.key} key`, ...s.harmony];
    case 8: return s.arr.map((a) => ARR_EN[a]);
    case 9: return s.mix;
    case 10: return s.vocal === 'instrumental' ? ['instrumental'] : [[s.tone.join(', '), s.vocal].filter(Boolean).join(' '), s.lang];
    // 11번: 단어만 쓰면 Suno가 오히려 그 소리를 넣을 수 있어 'no'를 붙인다
    case 11: return excludeWords(s).map((x) => `no ${x}`);
    default: return [];
  }
}

// 선택값 → '번호.항목 : 값' 줄 목록(값이 없는 항목은 생략)
const styleLines = (s, steps = SB_STEPS) => steps
  .map((st) => [st, stepValues(st.n, s).filter(Boolean)])
  .filter(([, v]) => v.length)
  .map(([st, v]) => `${st.n}.${st.title} : ${v.join(', ')}`);

/* ---------------- 문장형 출력 ----------------
 * 같은 선택값을 Suno가 읽기 좋은 영어 문장으로 쓴다. 앞쪽 단어일수록 영향이 커서 분위기·장르·BPM·리듬을 첫 문장에 모으고,
 * 항목 이름(1.Intro 등)은 지시가 아니라 단어로 읽히므로 넣지 않는다 */
const ENERGY_ADJ = { 'low energy': 'low-energy', 'medium energy': 'mid-energy', 'high energy': 'high-energy', 'building energy': 'gradually building' };
const PUNCHY_INTRO = /drum|riff|bass/; // 바로 몰아치는 인트로는 느린 도입이 붙지 않게 막는다
const joinAnd = (xs) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);
const sentence = (t) => `${t[0].toUpperCase()}${t.slice(1)}.`;

// conceptLines: Concept 칸의 문장들. 목록형과 같이 맨 앞에 두고, 이후 항목 순서대로 이어 쓴다
// withExcl: Style Builder는 제외 항목을 Exclude Styles 칸으로 따로 내보내서 문장형에서 뺀다
// (스타일 칸에 'no ○○'로 쓰면 오히려 그 소리로 끌려갈 수 있다)
function styleProse(s, conceptLines = [], { withExcl = true } = {}) {
  const head = [...s.mood, ENERGY_ADJ[s.energy]].filter(Boolean).join(', ');
  const genre = [s.genre && (s.genreShort ? GENRE_EN[s.genre] : genreLine(s.genre)), s.genreCustom].filter(Boolean).join(', ');
  const out = conceptLines.map(sentence);
  out.push(sentence([[head, genre].filter(Boolean).join(' '), `${s.bpm} BPM`, ...s.feel].filter(Boolean).join(', ')));
  if (s.intro) out.push(sentence(`begin with ${s.intro}${PUNCHY_INTRO.test(s.intro) ? ', no slow or atmospheric intro' : ''}`));
  const support = s.support.map((id) => SUNO_TERM[id]);
  if (s.main) out.push(sentence(`${SUNO_TERM[s.main]} drives the song${support.length ? `, supported by ${joinAnd(support)}` : ''}`));
  else if (support.length) out.push(sentence(`featuring ${joinAnd(support)}`));
  const harmony = [s.key && `${s.key} key`, ...s.harmony].filter(Boolean);
  if (harmony.length) out.push(sentence(harmony.join(', ')));
  if (s.arr.length) out.push(sentence(joinAnd(s.arr.map((a) => ARR_EN[a]))));
  if (s.mix.length) out.push(sentence(s.mix.join(', ')));
  const vocal = stepValues(10, s).filter(Boolean);
  if (vocal.length) out.push(sentence(vocal.join(', ')));
  if (s.outro) out.push(sentence(OUTRO_EN[s.outro])); // '선택 안 함'이면 끝맺음은 Suno에 맡긴다
  const excl = withExcl ? excludeWords(s) : [];
  if (excl.length) out.push(sentence(excl.map((x) => `no ${x}`).join(', ')));
  return out.join(' ');
}

// 출력 형식(목록형/문장형). Style Builder와 곡 분석 결과 칸이 같은 선택을 쓴다
const STYLE_FMTS = ['list', 'prose'];
let styleFmt = 'list';
try { const f = localStorage.getItem('music.suno.styleFmt'); if (STYLE_FMTS.includes(f)) styleFmt = f; } catch {}
const fmtTabsHtml = (id) => `<span class="fmt-tabs" role="tablist" aria-label="출력 형식" id="${id}">${
  [['list', '목록형'], ['prose', '문장형']].map(([f, ko]) => `<button type="button" role="tab" data-fmt="${f}" aria-selected="${f === styleFmt}">${ko}</button>`).join('')}</span>`;
// 탭 묶음에 클릭을 건다. 어느 쪽에서 바꾸든 모든 탭 묶음과 출력 칸(id별 onPick)이 같은 형식으로 바뀐다
const fmtViews = {};
function bindFmtTabs(box, onPick) {
  fmtViews[box.id] = onPick;
  box.onclick = (e) => {
    const b = e.target.closest('[data-fmt]');
    if (!b) return;
    styleFmt = b.dataset.fmt;
    try { localStorage.setItem('music.suno.styleFmt', styleFmt); } catch {}
    document.querySelectorAll('.fmt-tabs [data-fmt]').forEach((x) => x.setAttribute('aria-selected', String(x.dataset.fmt === styleFmt)));
    Object.entries(fmtViews).forEach(([id, f]) => document.getElementById(id) && f(styleFmt));
  };
}

let styleSnapshot = null; // 마지막 [생성] 때의 선택값·컨셉. 바뀌면 다시 생성하라고 알려 준다
const styleState = () => JSON.stringify({ sb, concept });
let styleOut = { list: '', prose: '', excl: '' };
function showStyle() {
  $('#sb-style').value = styleOut[styleFmt] ?? '';
  $('#sb-excl').value = styleOut.excl ?? '';
  $('#sb-fmt').querySelectorAll('[data-fmt]').forEach((x) => x.setAttribute('aria-selected', String(x.dataset.fmt === styleFmt)));
  renderStyleCount();
}

/* ---------------- 1,000자 맞추기 ----------------
 * Suno 스타일 칸은 1,000자까지라, 넘으면 덜 중요한 것부터 하나씩 빼서 다시 만든다.
 * Concept·장르 이름·주 악기·BPM·분위기·키·보컬·인트로/아웃트로는 끝까지 남긴다 */
const STYLE_LIMIT = 1000;
const STYLE_CUTS = [
  ['4번 장르 설명(괄호)', (s) => ({ ...s, genreShort: true })],
  ['9번 사운드', (s) => ({ ...s, mix: [] })],
  ['7번 멜로디·화성 세부', (s) => ({ ...s, harmony: [] })],
  ['5번 반주 악기 일부', (s) => ({ ...s, support: s.support.slice(0, 2) })],
  ['8번 편곡', (s) => ({ ...s, arr: [] })],
  ['3번 리듬 세부', (s) => ({ ...s, feel: s.feel.slice(0, 1) })],
];
// make(s, conceptParts) → 출력 문자열. 위 순서로 빼도 넘으면 Concept 문장을 앞에서부터 하나씩 뺀다
// (컨셉 도우미 초안은 듣는 상황·이야기처럼 덜 구체적인 것이 앞에 온다). 그래도 넘으면 마지막으로 잘라 낸다
function fitStyle(make, s, parts) {
  let cur = s;
  let text = make(cur, parts);
  const cut = [];
  for (const [name, f] of STYLE_CUTS) {
    if (text.length <= STYLE_LIMIT) break;
    cur = f(cur);
    const next = make(cur, parts);
    if (next !== text) cut.push(name);
    text = next;
  }
  let dropped = 0;
  while (text.length > STYLE_LIMIT && dropped < parts.length) text = make(cur, parts.slice(++dropped));
  if (dropped) cut.push(`Concept 앞 ${dropped}문장`);
  if (text.length > STYLE_LIMIT) {
    text = text.slice(0, STYLE_LIMIT);
    cut.push('끝부분');
  }
  return { text, cut };
}

function generateStyle() {
  // 11번(제외)은 Exclude Styles 칸으로 따로 내보내므로 스타일 목록에서 뺀다
  const steps = SB_STEPS.filter((st) => st.n !== 11);
  const parts = conceptParts();
  if (styleLines(sb, steps).length <= 1 && !sb.feel.length && !parts.length) return flash('항목을 하나 이상 고르거나 컨셉을 적어 주세요.', 'warn');
  // 목록형은 'Concept : 문장. 문장.' 한 줄을 맨 위에
  const conceptLine = (ps) => (ps.length ? [`Concept : ${ps.map((p) => `${p}.`).join(' ')}`] : []);
  const list = fitStyle((s, ps) => [...conceptLine(ps), ...styleLines(s, steps)].join('\n'), sb, parts);
  const prose = fitStyle((s, ps) => styleProse(s, ps, { withExcl: false }), sb, parts);
  styleOut = { list: list.text, prose: prose.text, cut: { list: list.cut, prose: prose.cut }, excl: excludeWords(sb).join(', ') };
  styleSnapshot = styleState();
  try { localStorage.setItem('music.suno.styleOut', JSON.stringify(styleOut)); localStorage.setItem('music.suno.styleSnap', styleSnapshot); } catch {}
  showStyle();
}

function clearStyle() {
  styleOut = { list: '', prose: '', excl: '' };
  styleSnapshot = null;
  try { ['music.suno.styleOut', 'music.suno.style', 'music.suno.styleSnap'].forEach((k) => localStorage.removeItem(k)); } catch {}
  showStyle();
}

function renderStyleCount() {
  const text = $('#sb-style').value;
  const stale = text && styleSnapshot !== styleState();
  const el = $('#sb-style-count');
  const cut = styleOut.cut?.[styleFmt] ?? [];
  el.textContent = text ? `${text.length}/${STYLE_LIMIT}자${cut.length ? ` · 1,000자에 맞추려고 뺀 것: ${cut.join(', ')}` : ''}${stale ? ' · 선택이 바뀌었습니다. [생성]을 다시 누르세요' : ''}` : '';
  el.classList.toggle('warn', text.length > STYLE_LIMIT || !!stale);
}

function commit() {
  if (!hasVocal()) { sb.tone = []; sb.lang = ''; }
  if (!sb.keyManual) sb.key = autoKey(sb.mood);
  resolveConflicts();
  syncGenreTab();
  saveSb();
  renderSb();
}

/* ---------------- 불러오기 ---------------- */
// 주 악기 고르는 우선순위: 멜로디·화성을 끄는 악기 → 리듬 악기
const MAIN_PRIORITY = ['keys', 'guitar', 'wind', 'strings', 'synth', 'dj', 'bass', 'perc', 'drums'];
// main을 주지 않으면(믹서처럼 소리 비중을 모를 때) 우선순위 분류로 고른다
function instrumentsFrom(ids, main) {
  main ??= [...ids].sort((a, b) => MAIN_PRIORITY.indexOf(byId[a].cat) - MAIN_PRIORITY.indexOf(byId[b].cat))[0] || '';
  // 반주는 리듬(드럼·베이스)부터 채워 곡의 뼈대가 먼저 전달되게
  const rest = ids.filter((id) => id !== main).sort((a, b) => MAIN_PRIORITY.indexOf(byId[b].cat) - MAIN_PRIORITY.indexOf(byId[a].cat));
  return { main, support: rest };
}

// 곡 분석 결과 → 선택값(인트로·악기·BPM·리듬·장르·분위기·키·편곡·사운드). 보컬은 분석으로 알 수 없어 비워 둔다
// 주 악기는 인식 점수가 가장 높은 악기(picks는 점수순), 인트로는 앞부분에서 가장 두드러진 악기
function songSb({ res, mix, intro, feel = [], hints = {} }) {
  const ids = mix.picks.map((p) => p.id);
  return {
    ...SB_DEFAULT(),
    excl: [], // 제외는 분석과 무관한 기본값이라 결과 칸에는 넣지 않는다(예: 힙합 곡에 no rap이 붙지 않게)
    ...instrumentsFrom(ids, ids[0] || ''),
    // 'drum fill'만 있으면 1번 '드럼 필' 선택지와 같은 값이라 Style Builder에서 그 칩이 켜진다
    intro: intro?.drumFill ? (intro.bass ? `drum fill and ${SUNO_TERM[intro.bass]}` : 'drum fill') : intro ? SUNO_TERM[intro.id] : '',
    bpm: res.bpm,
    feel,
    mood: hints.mood ?? [], energy: hints.energy ?? '', arr: hints.arr ?? [], mix: hints.mix ?? [],
    outro: hints.outro ?? '',
    // 실제 곡의 장조/단조가 분위기 추정보다 정확해서 분석 결과를 쓴다(키 이름은 분위기에 영향이 없어 뺀다)
    key: res.key ? (res.scale === 'minor' ? 'minor' : 'major') : '',
    keyManual: !!res.key,
    genreCustom: res.genres.slice(0, 2).map(([g]) => g.split('---').pop().toLowerCase()).join(', '),
  };
}

// '곡으로 조합 만들기' 결과의 Suno Style 칸(목록형은 1~10번)
function songStyleOut(an) {
  const s = songSb(an);
  return { list: styleLines(s, SB_STEPS.filter((st) => st.n <= 10)).join('\n'), prose: styleProse(s) };
}

function fromMixer() {
  const ids = INSTRUMENTS.filter((d) => state[d.id]?.active).map((d) => d.id);
  if (!ids.length) return flash('믹서에 켜진 악기가 없습니다. 악기나 추천 조합을 먼저 골라 주세요.', 'warn');
  Object.assign(sb, instrumentsFrom(ids));
  sb.bpm = +el.bpm.value; // Transport.bpm은 rampTo 중이면 중간값일 수 있음
  if (currentPreset) { sb.genre = currentPreset; sb.genreCustom = ''; }
  commit();
  flash('지금 믹서의 악기·BPM' + (currentPreset ? '·장르' : '') + '를 불러왔습니다.', 'ok');
}

function fromSong() {
  if (!last) return flash('먼저 "곡으로 조합 만들기" 탭에서 곡을 분석해 주세요.', 'warn');
  const { res, mix } = last;
  const s = songSb(last);
  Object.assign(sb, { main: s.main, support: s.support, bpm: s.bpm, key: s.key, keyManual: s.keyManual, genre: '', genreCustom: s.genreCustom });
  if (s.intro) sb.intro = s.intro; // 도입부를 못 잡았으면 직접 고른 인트로를 그대로 둔다
  // 리듬·분위기·편곡·사운드는 곡마다 추정하는 값이라 새 곡 기준으로 덮어쓴다(못 찾으면 비움 — 이전 곡 값이 남지 않게)
  Object.assign(sb, { feel: s.feel, mood: s.mood, energy: s.energy, arr: s.arr, mix: s.mix });
  if (s.outro) sb.outro = s.outro; // 페이드아웃을 찾았을 때만 — 못 찾으면 직접 고른 아웃트로를 그대로 둔다
  // 보컬은 있어도 성별까지는 알 수 없어 채우지 않고 안내만 한다
  const voice = mix.detected.some((d) => d.key === 'voice' && d.score > 0.2);
  // 불러온 값과 부딪치는 제외 항목은 따로 알리지 않고 아래 알림에 합친다(경고가 바로 덮여 사라지지 않게)
  const freed = resolveConflicts(true);
  commit();
  flash(`"${res.name}" 분석 결과를 불러왔습니다.${freed.length ? ` 제외 항목에서 해제: ${freed.join(' · ')}.` : ''}${voice && !sb.vocal ? ' 보컬이 감지되었으니 10번에서 보컬 종류를 골라 주세요.' : ''}`, 'ok');
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
// 컨셉 도우미 답 + Concept 내용(직접 고친 것 포함)을 처음 상태로
function clearConcept() {
  helper = HELPER_EMPTY();
  saveHelper();
  renderHelper();
  setConcept('', false);
}
$('#sb-concept-clear', conceptRow).onclick = () => {
  clearConcept();
  flash('컨셉 도우미의 답과 Concept 내용을 지웠습니다.', 'ok');
};
// 1~11번 선택까지 모두 처음 상태로
$('#sb-reset').onclick = () => {
  sb = SB_DEFAULT();
  clearConcept();
  commit();
  flash('컨셉 도우미·Concept·모든 선택을 초기화했습니다.', 'ok');
};
$('#sb-gen').onclick = generateStyle;
$('#sb-copy-style').onclick = () => copyOut('sb-style', 'Style of Music');
$('#sb-copy-excl').onclick = () => copyOut('sb-excl', 'Exclude Styles');
$('#sb-clear-style').onclick = clearStyle;
try {
  // 예전 버전은 목록형 문자열 하나만 저장했다. 모양이 다르면(손상 등) 버리고 예전 값으로
  const saved = JSON.parse(localStorage.getItem('music.suno.styleOut') || 'null');
  const ok = saved && typeof saved.list === 'string' && typeof saved.prose === 'string';
  // excl은 나중에 생긴 칸이라 예전 저장값에는 없다
  styleOut = ok ? { excl: '', ...saved } : { list: localStorage.getItem('music.suno.style') || '', prose: '', excl: '' };
  styleSnapshot = localStorage.getItem('music.suno.styleSnap');
} catch {}
$('#sb-fmt').outerHTML = fmtTabsHtml('sb-fmt');
bindFmtTabs($('#sb-fmt'), showStyle);
// 저장된 선택에 제외 기본값을 채운 경우 등, 부딪치는 제외 항목을 열 때 조용히 정리한다
if (resolveConflicts(true).length) saveSb();
renderHelper();
setConcept(conceptManual ? concept : helperConcept(), conceptManual);
syncGenreTab();
renderSb();
showStyle();
