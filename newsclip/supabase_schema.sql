-- =====================================================
-- 분야별 최신 기사 분석 웹앱 — Supabase DB 스키마
-- =====================================================

-- 1. L1 카테고리 (분야)
CREATE TABLE IF NOT EXISTS categories (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name        text NOT NULL UNIQUE,          -- 예: '반도체', 'AI'
  order_num   int  DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);

-- 2. L2 서브카테고리 (하위 분야)
CREATE TABLE IF NOT EXISTS subcategories (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id   uuid NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  name          text NOT NULL,               -- 예: '공급망/시장 전망'
  description   text,                        -- 말풍선 설명
  rss_sources   text[],                      -- RSS 피드 URL 배열
  order_num     int  DEFAULT 0,
  created_at    timestamptz DEFAULT now(),
  UNIQUE(category_id, name)
);

-- 3. 수집된 기사
CREATE TABLE IF NOT EXISTS articles (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  subcategory_id    uuid NOT NULL REFERENCES subcategories(id) ON DELETE CASCADE,
  title             text NOT NULL,
  url               text NOT NULL UNIQUE,
  source            text,                    -- 출처 기관명
  author            text,
  published_at      timestamptz,
  summary           text,                    -- 원문 요약 (영어)
  summary_ko        text,                    -- 한국어 번역 요약
  full_content      text,                    -- 전문 (가능한 경우)
  full_content_ko   text,                    -- 한국어 번역 전문
  is_translated     boolean DEFAULT false,
  fetched_at        timestamptz DEFAULT now(),
  created_at        timestamptz DEFAULT now()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_articles_subcategory ON articles(subcategory_id);
CREATE INDEX IF NOT EXISTS idx_articles_published   ON articles(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_subcategories_category ON subcategories(category_id);

-- RLS 활성화 (anon 키로 읽기 허용)
ALTER TABLE categories    ENABLE ROW LEVEL SECURITY;
ALTER TABLE subcategories ENABLE ROW LEVEL SECURITY;
ALTER TABLE articles      ENABLE ROW LEVEL SECURITY;

-- 읽기 정책 (모든 사용자)
CREATE POLICY "categories_read"    ON categories    FOR SELECT USING (true);
CREATE POLICY "subcategories_read" ON subcategories FOR SELECT USING (true);
CREATE POLICY "articles_read"      ON articles      FOR SELECT USING (true);

-- 쓰기 정책 (서버 사이드 anon 키로 허용 — service_role 사용 시 RLS 우회)
CREATE POLICY "categories_insert"    ON categories    FOR INSERT WITH CHECK (true);
CREATE POLICY "subcategories_insert" ON subcategories FOR INSERT WITH CHECK (true);
CREATE POLICY "articles_insert"      ON articles      FOR INSERT WITH CHECK (true);
CREATE POLICY "categories_update"    ON categories    FOR UPDATE USING (true);
CREATE POLICY "subcategories_update" ON subcategories FOR UPDATE USING (true);
CREATE POLICY "articles_update"      ON articles      FOR UPDATE USING (true);

-- 4. 출처 관리
CREATE TABLE IF NOT EXISTS sources (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id     uuid REFERENCES categories(id) ON DELETE SET NULL,
  category_name   text,                           -- 카테고리 삭제 후 이름 보존용
  classification  text NOT NULL,                   -- 분류 (학술 논문/연구, 보도/저널리즘 등)
  name            text NOT NULL UNIQUE,            -- 출처명
  description     text NOT NULL,                   -- 설명
  url             text,                             -- 원문 URL
  weight          int DEFAULT 0 CHECK (weight BETWEEN 0 AND 100),
  priority        int DEFAULT 0,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sources_category ON sources(category_id);

ALTER TABLE sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sources_read"   ON sources FOR SELECT USING (true);
CREATE POLICY "sources_insert" ON sources FOR INSERT WITH CHECK (true);
CREATE POLICY "sources_update" ON sources FOR UPDATE USING (true);
CREATE POLICY "sources_delete" ON sources FOR DELETE USING (true);

-- =====================================================
-- 초기 데이터 (샘플 카테고리)
-- =====================================================
INSERT INTO categories (name, order_num) VALUES
  ('반도체', 1),
  ('AI', 2)
ON CONFLICT (name) DO NOTHING;
