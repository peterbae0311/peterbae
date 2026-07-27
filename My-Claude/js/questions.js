const QUESTIONS = [
  // ==================== 한국사 (10문제) ====================
  {
    id: 1,
    category: "한국사",
    difficulty: "medium",
    question: "조선을 건국한 왕은?",
    options: ["이성계", "왕건", "이방원", "세종"],
    correctAnswer: 0,
    explanation: "이성계(태조)는 1392년 고려를 멸하고 조선을 건국했습니다."
  },
  {
    id: 2,
    category: "한국사",
    difficulty: "easy",
    question: "한글을 창제한 조선의 왕은?",
    options: ["태종", "세종대왕", "성종", "연산군"],
    correctAnswer: 1,
    explanation: "세종대왕은 1443년 훈민정음(한글)을 창제했습니다."
  },
  {
    id: 3,
    category: "한국사",
    difficulty: "medium",
    question: "임진왜란이 발생한 연도는?",
    options: ["1582년", "1592년", "1602년", "1612년"],
    correctAnswer: 1,
    explanation: "임진왜란은 1592년 일본의 침략으로 시작되었습니다."
  },
  {
    id: 4,
    category: "한국사",
    difficulty: "hard",
    question: "삼국시대 고구려의 전성기를 이끈 왕은?",
    options: ["광개토대왕", "장수왕", "문무왕", "근초고왕"],
    correctAnswer: 0,
    explanation: "광개토대왕은 고구려의 영토를 크게 넓혀 전성기를 이끌었습니다."
  },
  {
    id: 5,
    category: "한국사",
    difficulty: "easy",
    question: "3.1 운동이 일어난 연도는?",
    options: ["1910년", "1919년", "1927년", "1945년"],
    correctAnswer: 1,
    explanation: "3.1 운동은 1919년 3월 1일 일제 강점기에 일어난 독립운동입니다."
  },
  {
    id: 6,
    category: "한국사",
    difficulty: "medium",
    question: "고려를 건국한 인물은?",
    options: ["견훤", "궁예", "왕건", "장보고"],
    correctAnswer: 2,
    explanation: "왕건(태조)은 918년 고려를 건국하고 후삼국을 통일했습니다."
  },
  {
    id: 7,
    category: "한국사",
    difficulty: "hard",
    question: "조선 시대 실학을 집대성한 학자로 '목민심서'를 저술한 인물은?",
    options: ["이황", "이이", "정약용", "박지원"],
    correctAnswer: 2,
    explanation: "정약용은 조선 후기 실학을 집대성하고 '목민심서' 등 방대한 저서를 남겼습니다."
  },
  {
    id: 8,
    category: "한국사",
    difficulty: "medium",
    question: "대한민국 임시정부가 수립된 도시는?",
    options: ["베이징", "상하이", "충칭", "도쿄"],
    correctAnswer: 1,
    explanation: "대한민국 임시정부는 1919년 중국 상하이에서 수립되었습니다."
  },
  {
    id: 9,
    category: "한국사",
    difficulty: "easy",
    question: "6.25 전쟁이 시작된 연도는?",
    options: ["1945년", "1948년", "1950년", "1953년"],
    correctAnswer: 2,
    explanation: "6.25 전쟁(한국전쟁)은 1950년 6월 25일 북한의 남침으로 시작되었습니다."
  },
  {
    id: 10,
    category: "한국사",
    difficulty: "hard",
    question: "신라의 삼국 통일을 완성한 왕은?",
    options: ["태종 무열왕", "문무왕", "신문왕", "경덕왕"],
    correctAnswer: 1,
    explanation: "문무왕은 676년 당나라 세력을 몰아내고 삼국 통일을 완성했습니다."
  },

  // ==================== 과학 (10문제) ====================
  {
    id: 11,
    category: "과학",
    difficulty: "easy",
    question: "물의 화학식은?",
    options: ["CO2", "H2O", "O2", "NaCl"],
    correctAnswer: 1,
    explanation: "물은 수소(H) 2개와 산소(O) 1개로 이루어진 H2O입니다."
  },
  {
    id: 12,
    category: "과학",
    difficulty: "medium",
    question: "빛의 속도는 약 얼마인가?",
    options: ["30만 km/s", "3만 km/s", "300만 km/s", "3억 km/s"],
    correctAnswer: 0,
    explanation: "빛의 속도는 진공에서 약 30만 km/s(약 3×10⁸ m/s)입니다."
  },
  {
    id: 13,
    category: "과학",
    difficulty: "easy",
    question: "지구에서 가장 가까운 별은?",
    options: ["시리우스", "베텔게우스", "태양", "북극성"],
    correctAnswer: 2,
    explanation: "지구에서 가장 가까운 별은 태양으로, 약 1억 5천만 km 거리에 있습니다."
  },
  {
    id: 14,
    category: "과학",
    difficulty: "medium",
    question: "원소 주기율표에서 원자번호 1번 원소는?",
    options: ["헬륨(He)", "수소(H)", "리튬(Li)", "탄소(C)"],
    correctAnswer: 1,
    explanation: "원자번호 1번은 수소(H)로, 가장 가볍고 우주에서 가장 풍부한 원소입니다."
  },
  {
    id: 15,
    category: "과학",
    difficulty: "hard",
    question: "DNA의 이중 나선 구조를 발견한 과학자들은?",
    options: ["파스퇴르, 코흐", "왓슨, 크릭", "뉴턴, 라이프니츠", "퀴리, 러더퍼드"],
    correctAnswer: 1,
    explanation: "제임스 왓슨과 프랜시스 크릭은 1953년 DNA의 이중 나선 구조를 발견했습니다."
  },
  {
    id: 16,
    category: "과학",
    difficulty: "easy",
    question: "사람의 혈액형을 결정하는 가장 대표적인 혈액형 시스템은?",
    options: ["MN식", "Rh식", "ABO식", "Lewis식"],
    correctAnswer: 2,
    explanation: "ABO식 혈액형이 가장 대표적으로, A형, B형, AB형, O형으로 나뉩니다."
  },
  {
    id: 17,
    category: "과학",
    difficulty: "medium",
    question: "만유인력의 법칙을 발견한 과학자는?",
    options: ["갈릴레이", "아인슈타인", "뉴턴", "케플러"],
    correctAnswer: 2,
    explanation: "아이작 뉴턴은 사과가 떨어지는 것을 보고 만유인력의 법칙을 발견했다고 전해집니다."
  },
  {
    id: 18,
    category: "과학",
    difficulty: "hard",
    question: "인체에서 가장 큰 장기는?",
    options: ["간", "폐", "피부", "소장"],
    correctAnswer: 2,
    explanation: "피부는 인체에서 가장 큰 장기로, 성인 기준 약 1.5~2m²의 면적을 가집니다."
  },
  {
    id: 19,
    category: "과학",
    difficulty: "medium",
    question: "지구 대기의 약 78%를 차지하는 기체는?",
    options: ["산소", "이산화탄소", "질소", "아르곤"],
    correctAnswer: 2,
    explanation: "지구 대기의 약 78%는 질소(N2)로 이루어져 있습니다."
  },
  {
    id: 20,
    category: "과학",
    difficulty: "hard",
    question: "광합성의 최종 산물로 옳은 것은?",
    options: ["포도당과 물", "포도당과 산소", "이산화탄소와 물", "아미노산과 산소"],
    correctAnswer: 1,
    explanation: "광합성은 이산화탄소와 물을 재료로 빛 에너지를 이용해 포도당과 산소를 만듭니다."
  },

  // ==================== 지리 (10문제) ====================
  {
    id: 21,
    category: "지리",
    difficulty: "easy",
    question: "세계에서 가장 긴 강은?",
    options: ["아마존 강", "나일 강", "미시시피 강", "양쯔 강"],
    correctAnswer: 1,
    explanation: "나일 강은 길이 약 6,650km로 세계에서 가장 긴 강입니다."
  },
  {
    id: 22,
    category: "지리",
    difficulty: "easy",
    question: "세계에서 가장 높은 산은?",
    options: ["K2", "에베레스트", "킬리만자로", "몽블랑"],
    correctAnswer: 1,
    explanation: "에베레스트 산(해발 8,849m)은 세계에서 가장 높은 산입니다."
  },
  {
    id: 23,
    category: "지리",
    difficulty: "medium",
    question: "세계에서 가장 큰 대륙은?",
    options: ["아메리카", "아프리카", "아시아", "유럽"],
    correctAnswer: 2,
    explanation: "아시아는 면적 약 4,400만 km²로 세계에서 가장 큰 대륙입니다."
  },
  {
    id: 24,
    category: "지리",
    difficulty: "medium",
    question: "브라질의 수도는?",
    options: ["상파울루", "리우데자네이루", "브라질리아", "살바도르"],
    correctAnswer: 2,
    explanation: "브라질의 수도는 브라질리아입니다. 1960년 새로 건설된 계획 도시입니다."
  },
  {
    id: 25,
    category: "지리",
    difficulty: "hard",
    question: "세계에서 가장 넓은 사막은?",
    options: ["사하라 사막", "아라비아 사막", "고비 사막", "남극 사막"],
    correctAnswer: 3,
    explanation: "남극 사막은 면적 약 1,400만 km²로 세계에서 가장 큰 사막입니다."
  },
  {
    id: 26,
    category: "지리",
    difficulty: "easy",
    question: "일본의 수도는?",
    options: ["오사카", "교토", "도쿄", "나고야"],
    correctAnswer: 2,
    explanation: "일본의 수도는 도쿄(東京)입니다."
  },
  {
    id: 27,
    category: "지리",
    difficulty: "medium",
    question: "세계에서 인구가 가장 많은 나라는?",
    options: ["중국", "인도", "미국", "인도네시아"],
    correctAnswer: 1,
    explanation: "인도는 2023년 중국을 제치고 세계 인구 1위 국가가 되었습니다."
  },
  {
    id: 28,
    category: "지리",
    difficulty: "hard",
    question: "세계에서 가장 깊은 호수는?",
    options: ["카스피해", "슈피리어 호", "바이칼 호", "탕가니카 호"],
    correctAnswer: 2,
    explanation: "바이칼 호는 최대 수심 약 1,642m로 세계에서 가장 깊은 호수입니다."
  },
  {
    id: 29,
    category: "지리",
    difficulty: "medium",
    question: "아프리카에서 가장 큰 나라는?",
    options: ["수단", "알제리", "콩고민주공화국", "리비아"],
    correctAnswer: 1,
    explanation: "알제리는 면적 약 238만 km²로 아프리카에서 가장 큰 나라입니다."
  },
  {
    id: 30,
    category: "지리",
    difficulty: "hard",
    question: "적도가 통과하지 않는 나라는?",
    options: ["에콰도르", "케냐", "인도네시아", "멕시코"],
    correctAnswer: 3,
    explanation: "멕시코는 북위 14~32° 사이에 위치해 적도(0°)가 통과하지 않습니다."
  },

  // ==================== 문화 (10문제) ====================
  {
    id: 31,
    category: "문화",
    difficulty: "easy",
    question: "올림픽 오륜기의 색이 아닌 것은?",
    options: ["파란색", "보라색", "빨간색", "노란색"],
    correctAnswer: 1,
    explanation: "올림픽 오륜기는 파란색, 노란색, 검은색, 초록색, 빨간색 5가지 색으로 구성됩니다."
  },
  {
    id: 32,
    category: "문화",
    difficulty: "easy",
    question: "셰익스피어의 작품이 아닌 것은?",
    options: ["햄릿", "오셀로", "파우스트", "맥베스"],
    correctAnswer: 2,
    explanation: "파우스트는 독일의 문호 괴테의 작품입니다. 나머지는 셰익스피어의 4대 비극입니다."
  },
  {
    id: 33,
    category: "문화",
    difficulty: "medium",
    question: "피카소의 대표작 '게르니카'는 어떤 사건을 묘사한 작품인가?",
    options: ["프랑스 혁명", "스페인 내전", "제1차 세계대전", "러시아 혁명"],
    correctAnswer: 1,
    explanation: "게르니카(1937)는 스페인 내전 중 나치 독일 공군의 게르니카 마을 폭격을 고발한 작품입니다."
  },
  {
    id: 34,
    category: "문화",
    difficulty: "medium",
    question: "베토벤의 '제9번 교향곡'의 별칭은?",
    options: ["운명", "합창", "전원", "영웅"],
    correctAnswer: 1,
    explanation: "베토벤의 교향곡 9번의 별칭은 '합창'으로, 4악장에 '환희의 송가'가 포함됩니다."
  },
  {
    id: 35,
    category: "문화",
    difficulty: "hard",
    question: "레오나르도 다빈치의 '최후의 만찬'이 있는 도시는?",
    options: ["피렌체", "베네치아", "밀라노", "로마"],
    correctAnswer: 2,
    explanation: "최후의 만찬은 이탈리아 밀라노의 산타 마리아 델레 그라치에 수도원에 있습니다."
  },
  {
    id: 36,
    category: "문화",
    difficulty: "easy",
    question: "세계 4대 문명에 해당하지 않는 것은?",
    options: ["메소포타미아 문명", "이집트 문명", "그리스 문명", "황하 문명"],
    correctAnswer: 2,
    explanation: "4대 문명은 메소포타미아, 이집트, 인더스, 황하 문명입니다. 그리스 문명은 포함되지 않습니다."
  },
  {
    id: 37,
    category: "문화",
    difficulty: "medium",
    question: "노벨상이 처음 시상된 연도는?",
    options: ["1895년", "1901년", "1910년", "1925년"],
    correctAnswer: 1,
    explanation: "노벨상은 알프레드 노벨의 유언에 따라 1901년 처음으로 시상되었습니다."
  },
  {
    id: 38,
    category: "문화",
    difficulty: "hard",
    question: "고대 그리스의 3대 비극 작가가 아닌 인물은?",
    options: ["아이스킬로스", "소포클레스", "에우리피데스", "아리스토파네스"],
    correctAnswer: 3,
    explanation: "아리스토파네스는 희극 작가입니다. 3대 비극 작가는 아이스킬로스, 소포클레스, 에우리피데스입니다."
  },
  {
    id: 39,
    category: "문화",
    difficulty: "medium",
    question: "유네스코(UNESCO)의 주요 목적은?",
    options: ["세계 무역 촉진", "군사 안보 협력", "교육·과학·문화 협력", "국제 금융 지원"],
    correctAnswer: 2,
    explanation: "UNESCO는 교육, 과학, 문화 분야에서 국제 협력을 통해 평화와 발전을 추구합니다."
  },
  {
    id: 40,
    category: "문화",
    difficulty: "hard",
    question: "현존하는 세계 최고(最古)의 금속 활자 인쇄본은?",
    options: ["구텐베르크 성경", "직지심체요절", "팔만대장경", "훈민정음"],
    correctAnswer: 1,
    explanation: "직지심체요절(1377년)은 현존하는 세계에서 가장 오래된 금속 활자 인쇄본으로, 유네스코에 등재되어 있습니다."
  }
];

const CATEGORIES = ["한국사", "과학", "지리", "문화"];

function getQuestionsByCategory(category) {
  return QUESTIONS.filter(q => q.category === category);
}

function getAllQuestions() {
  return [...QUESTIONS];
}

function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
