-- =====================================================
-- 출처 RSS URL 일괄 업데이트
-- ※ RSS 피드가 없는 출처(Scopus, JSTOR, Statista 등)는 제외
-- =====================================================

-- ── 보도/저널리즘 ──────────────────────────────────
UPDATE sources SET url = 'https://feeds.reuters.com/reuters/technologyNews'
  WHERE id = '430567e4-3e87-45d9-8e26-7c1a41099678'; -- Reuters

UPDATE sources SET url = 'https://feeds.apnews.com/apnews/topnews'
  WHERE id = 'fa944507-f6e0-48d0-af53-096f80e54af3'; -- Associated Press (AP)

UPDATE sources SET url = 'https://www.ft.com/?format=rss'
  WHERE id = 'f139c1c6-5513-498a-ad61-f98d9a6517d3'; -- Financial Times

UPDATE sources SET url = 'https://www.nature.com/nature.rss'
  WHERE id = 'cce6cb12-bf6b-4dda-9ea5-cfdc3db7e4a6'; -- Nature / Science

UPDATE sources SET url = 'https://www.economist.com/science-and-technology/rss.xml'
  WHERE id = 'c7a306f6-c6b5-4466-b82b-7330aee38171'; -- The Economist

-- ── 학술 논문/연구 ──────────────────────────────────
UPDATE sources SET url = 'https://arxiv.org/rss/cs.AI'
  WHERE id = '0d33a2cd-2f3a-4831-a923-02c91ba30c55'; -- arXiv

UPDATE sources SET url = 'https://ieeexplore.ieee.org/rss/recentlyPublished.rss'
  WHERE id = '2da09e7f-aa26-4ec1-9923-c14e7caf3c3d'; -- IEEE Xplore

UPDATE sources SET url = 'https://pubmed.ncbi.nlm.nih.gov/rss/search/?term=technology&format=rss'
  WHERE id = '4e3ad0ac-6ced-46e2-b369-0734e2862b49'; -- PubMed / PubMed Central

-- ── AI ─────────────────────────────────────────────
UPDATE sources SET url = 'https://deepmind.google/blog/rss.xml'
  WHERE id = 'f0f40f48-fcbb-4d34-a3dd-cea209486398'; -- Google DeepMind Blog

UPDATE sources SET url = 'https://www.anthropic.com/news/rss'
  WHERE id = 'a4270b41-6148-4914-bd97-7b3a7bce355a'; -- Anthropic Research

-- ── 기술/산업 리서치 ───────────────────────────────
UPDATE sources SET url = 'https://www.technologyreview.com/feed/'
  WHERE id = 'e2c4de39-ab0f-43e0-b9d0-d2c71bf7aa26'; -- MIT Technology Review

UPDATE sources SET url = 'https://www.mckinsey.com/rss/insights.rss'
  WHERE id = '2b57e62e-3cfc-49cf-bf08-8de0dfb17269'; -- McKinsey / BCG

UPDATE sources SET url = 'https://feeds.feedburner.com/gartner/all-research'
  WHERE id = 'c08052a9-06e9-4d31-9172-707e0bf19412'; -- Gartner / Forrester

-- ── 반도체 ─────────────────────────────────────────
UPDATE sources SET url = 'https://www.trendforce.com/feed/'
  WHERE id = '5cc14255-fccd-4a99-a1d3-fba730abb87e'; -- IC Insights / TrendForce

UPDATE sources SET url = 'https://www.semianalysis.com/feed'
  WHERE id = 'fd11a50c-87eb-4d4a-9894-54b6088de82c'; -- SemiAnalysis

UPDATE sources SET url = 'https://www.semi.org/en/rss.xml'
  WHERE id = 'aa35d852-11bb-4194-87de-6089d0b5c6c5'; -- SEMI.org

-- ── 데이터/통계 ────────────────────────────────────
UPDATE sources SET url = 'https://www.who.int/rss-feeds/news-english.xml'
  WHERE id = 'cc8b3014-cf69-47cb-a36d-8a35241147f0'; -- UN Data / WHO

-- ── 한국 특화 ──────────────────────────────────────
UPDATE sources SET url = 'https://www.etri.re.kr/rss/rssView.etri'
  WHERE id = 'c17f736a-3a59-4bc3-b65a-9061bfa00d38'; -- ETRI (한국전자통신연구원)

UPDATE sources SET url = 'https://www.kistep.re.kr/rss.es'
  WHERE id = 'f0f1ea1b-c2c7-4c4e-991c-bdb99c086e26'; -- KISTEP (과학기술정책연구원)

UPDATE sources SET url = 'https://kdi.re.kr/rss/rss_all.rss'
  WHERE id = '14935281-aeba-465c-a95c-b9a32f4c5723'; -- RISS + KDI

-- ── 휴머노이드 ─────────────────────────────────────
UPDATE sources SET url = 'https://ieeexplore.ieee.org/rss/recentlyPublished.rss?punumber=7083369'
  WHERE id = '5b06f2d1-e02b-4c92-9bef-da225ad83de8'; -- IEEE RA-L

UPDATE sources SET url = 'https://bostondynamics.com/blog/rss.xml'
  WHERE id = 'e4ad210a-d48a-4b0a-8d29-ccb5ba00a539'; -- Boston Dynamics

-- ── 전문미디어 ─────────────────────────────────────
UPDATE sources SET url = 'https://techcrunch.com/feed/'
  WHERE id = 'ae51bc10-f7bb-4318-91a8-6f8b4e79793d'; -- TechCrunch

UPDATE sources SET url = 'https://feeds.feedburner.com/venturebeat/SZYF'
  WHERE id = '1dc0a293-2909-4341-ba19-52d2bf87e5e4'; -- VentureBeat

UPDATE sources SET url = 'https://www.zdnet.com/news/rss.xml'
  WHERE id = '941e280f-b086-461b-a09c-dabdc7e21d4c'; -- ZDNet

UPDATE sources SET url = 'https://www.etnews.com/rss/rss.xml'
  WHERE id = '862cb7ee-a35f-4893-9810-857874fa1aca'; -- 전자신문

UPDATE sources SET url = 'https://aitimes.kr/rss/allArticle.xml'
  WHERE id = 'c391fc11-754b-458a-b268-a0d81b06b586'; -- AI Times

UPDATE sources SET url = 'https://www.semiconductortoday.com/rss/news_feed.xml'
  WHERE id = '53709eb6-c2b1-4931-ab98-997227489dde'; -- Semiconductor Today

UPDATE sources SET url = 'https://www.cloudpro.co.uk/feed'
  WHERE id = '4a0c6274-9dc7-4718-8e6c-b93dab4398ae'; -- CloudPro

UPDATE sources SET url = 'https://cloudcomputingtoday.co/feed'
  WHERE id = '1baee8b5-6e28-4c42-9dd7-70c4c2402b56'; -- Cloud Computing Today

UPDATE sources SET url = 'https://www.digitimes.com/rss/'
  WHERE id = 'c2e229b3-6fd7-41aa-b2a5-910d6392e365'; -- DIGITIMES

-- ── 커뮤니티 ───────────────────────────────────────
UPDATE sources SET url = 'https://www.reddit.com/r/Semiconductors/.rss'
  WHERE id = '7f1470b0-f755-4974-b46f-7922a5428179'; -- Reddit - r/Semiconductors

UPDATE sources SET url = 'https://www.reddit.com/r/cloudcomputing/.rss'
  WHERE id = 'a808bb4b-fd99-4329-9673-de6097ba5df1'; -- Reddit - r/cloudcomputing

-- ── 학술 ───────────────────────────────────────────
UPDATE sources SET url = 'https://ieeexplore.ieee.org/rss/recentlyPublished.rss?punumber=55'
  WHERE id = 'e5340da4-9c4c-4443-af95-f87dcfaaf080'; -- IEEE Electron Device Letters

UPDATE sources SET url = 'https://www.jair.org/index.php/jair/gateway/plugin/WebFeedGatewayPlugin/rss2'
  WHERE id = '996ced81-3ba1-402b-8c7d-2abef8c37959'; -- Journal of Artificial Intelligence Research

UPDATE sources SET url = 'https://journalofcloudcomputing.springeropen.com/articles.rss'
  WHERE id = 'ce99c761-72c0-4e7f-afaf-8ec62a1d6090'; -- Journal of Cloud Computing

UPDATE sources SET url = 'https://ieeexplore.ieee.org/rss/recentlyPublished.rss?punumber=6479988'
  WHERE id = '37519535-c2fc-4ab7-bf17-3839f0853bd1'; -- IEEE Cloud Computing

-- ── 공식기관 ───────────────────────────────────────
UPDATE sources SET url = 'https://aws.amazon.com/blogs/aws/feed/'
  WHERE id = 'a7dc58a2-5243-4748-a4c1-6b8257fb8f85'; -- Amazon Web Services

UPDATE sources SET url = 'https://azure.microsoft.com/en-us/updates/feed/'
  WHERE id = 'cd61b547-a4dd-479d-87a5-b3eb0839446d'; -- Microsoft Azure

UPDATE sources SET url = 'https://www.semiconductors.org/news/feed/'
  WHERE id = '4f513741-7061-452a-9f2b-f1b1cc4cc98e'; -- 미국반도체산업협회 (SIA)

UPDATE sources SET url = 'https://www.csail.mit.edu/news/feed'
  WHERE id = '4c6c4521-5c97-4c7a-a1dd-b2d9cac2dae6'; -- MIT CSAIL
