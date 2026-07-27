-- =====================================================
-- 공통 출처 초기 데이터 (35건)
-- 출처: 참고 자료/공통 출처.xlsx
-- category_id = NULL (공통 출처 — 특정 카테고리에 종속되지 않음)
-- =====================================================

INSERT INTO sources (category_id, category_name, classification, name, description, url, weight, priority) VALUES
  -- 학술 논문/연구 (7건)
  (NULL, '공통', '학술 논문/연구', 'PubMed / PubMed Central', 'NIH 운영, 의학·생명과학 최대 DB', 'https://pubmed.ncbi.nlm.nih.gov', 0, 1),
  (NULL, '공통', '학술 논문/연구', 'Google Scholar', '분야 무관 학술 검색, 피인용 수 확인 가능', 'https://scholar.google.com', 0, 1),
  (NULL, '공통', '학술 논문/연구', 'IEEE Xplore', '전기·전자·컴퓨터공학 핵심 학술 플랫폼', 'https://ieeexplore.ieee.org', 0, 1),
  (NULL, '공통', '학술 논문/연구', 'arXiv', '물리·수학·CS·AI 프리프린트 서버 (동료심사 전)', 'https://arxiv.org', 0, 1),
  (NULL, '공통', '학술 논문/연구', 'JSTOR', '인문·사회과학 학술지 아카이브', 'https://www.jstor.org', 0, 1),
  (NULL, '공통', '학술 논문/연구', 'Scopus (Elsevier)', '다학제적 인용 DB, 저널 랭킹·인용 분석', 'https://www.scopus.com', 0, 1),
  (NULL, '공통', '학술 논문/연구', 'Web of Science (Clarivate)', 'Impact Factor 원천, 학술지 권위 평가', 'https://www.webofscience.com', 0, 1),
  -- 보도/저널리즘 (5건)
  (NULL, '공통', '보도/저널리즘', 'Reuters', '글로벌 통신사, 사실 보도 중심', 'https://www.reuters.com', 0, 1),
  (NULL, '공통', '보도/저널리즘', 'Associated Press (AP)', '글로벌 양대 통신사, 팩트 기반 보도', 'https://apnews.com', 0, 1),
  (NULL, '공통', '보도/저널리즘', 'The Economist', '경제·정치·국제 이슈 심층 분석', 'https://www.economist.com', 0, 1),
  (NULL, '공통', '보도/저널리즘', 'Nature / Science', '세계 최고 권위 종합 과학 저널', 'https://www.nature.com', 0, 1),
  (NULL, '공통', '보도/저널리즘', 'Financial Times', '글로벌 경제·금융 보도 기준점', 'https://www.ft.com', 0, 1),
  -- 데이터/통계 (4건)
  (NULL, '공통', '데이터/통계', 'World Bank Open Data', '국가별 경제·사회 지표 제공', 'https://data.worldbank.org', 0, 1),
  (NULL, '공통', '데이터/통계', 'OECD Data', '선진국 정책 비교 데이터·보고서', 'https://data.oecd.org', 0, 1),
  (NULL, '공통', '데이터/통계', 'UN Data / WHO', '국제기구 공식 통계', 'https://data.un.org', 0, 1),
  (NULL, '공통', '데이터/통계', 'Statista', '산업·시장 통계 집약 플랫폼', 'https://www.statista.com', 0, 1),
  -- 기술/산업 리서치 (3건)
  (NULL, '공통', '기술/산업 리서치', 'McKinsey / BCG', '경영·산업 트렌드 데이터 기반 리서치', 'https://www.mckinsey.com', 0, 1),
  (NULL, '공통', '기술/산업 리서치', 'Gartner / Forrester', 'IT·테크 산업 시장 분석·전망', 'https://www.gartner.com', 0, 1),
  (NULL, '공통', '기술/산업 리서치', 'MIT Technology Review', '기술 트렌드, 학술 깊이 + 저널리즘 접근성', 'https://www.technologyreview.com', 0, 1),
  -- 한국 특화 (1건 — 공통 분류)
  (NULL, '공통', '한국 특화', 'RISS + KDI', '국내 학술논문(RISS) + 경제·정책 분석(KDI)', 'https://www.riss.kr', 0, 1),
  -- 반도체 (3건)
  (NULL, '공통', '반도체', 'SEMI.org', '글로벌 반도체 장비·소재 산업협회', 'https://www.semi.org', 0, 1),
  (NULL, '공통', '반도체', 'IC Insights / TrendForce', '반도체 시장 데이터 기준점', 'https://www.trendforce.com', 0, 1),
  (NULL, '공통', '반도체', 'SemiAnalysis', '반도체 기술 심층 분석 (구독형)', 'https://www.semianalysis.com', 0, 1),
  -- AI (5건)
  (NULL, '공통', 'AI', 'OpenAI Blog', 'GPT 시리즈 등 1차 연구 발표', 'https://openai.com/blog', 0, 1),
  (NULL, '공통', 'AI', 'Google DeepMind Blog', 'AlphaFold 등 AI 연구 1차 출처', 'https://deepmind.google', 0, 1),
  (NULL, '공통', 'AI', 'Anthropic Research', 'Claude 관련 안전성·기술 연구', 'https://www.anthropic.com/research', 0, 1),
  (NULL, '공통', 'AI', 'Meta AI Blog', 'LLaMA 등 오픈소스 AI 연구', 'https://ai.meta.com/blog', 0, 1),
  (NULL, '공통', 'AI', 'Papers with Code', '논문 + 구현 코드 함께 확인', 'https://paperswithcode.com', 0, 1),
  -- 휴머노이드 (4건)
  (NULL, '공통', '휴머노이드', 'IEEE RA-L (Robotics & Automation Letters)', '로보틱스 최고 권위 저널', 'https://www.ieee-ras.org', 0, 1),
  (NULL, '공통', '휴머노이드', 'ICRA / IROS 학회', '로보틱스 양대 국제학회', 'https://www.ieee-ras.org', 0, 1),
  (NULL, '공통', '휴머노이드', 'Boston Dynamics 공식 자료', '로봇 기술 시연 및 발표', 'https://bostondynamics.com', 0, 1),
  (NULL, '공통', '휴머노이드', 'Tesla Optimus / Figure AI', '휴머노이드 로봇 상용화 기업 발표', 'https://www.figure.ai', 0, 1),
  -- 한국 특화 추가 (3건)
  (NULL, '공통', '한국 특화', 'ETRI (한국전자통신연구원)', '국내 ICT 기술 연구 보고서', 'https://www.etri.re.kr', 0, 1),
  (NULL, '공통', '한국 특화', 'KISTEP (과학기술정책연구원)', '과학기술 정책 동향 분석', 'https://www.kistep.re.kr', 0, 1),
  (NULL, '공통', '한국 특화', 'KSIA (한국반도체산업협회)', '국내 반도체 산업 통계·동향', 'https://www.ksia.or.kr', 0, 1)
ON CONFLICT (name) DO NOTHING;
