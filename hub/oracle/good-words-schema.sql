-- ============================================================
-- good-words(좋은글): Oracle Autonomous DB schema
-- image_slideshow와 같은 eungmomoa-db 인스턴스를 공유하되, 별도 스키마 계정(goodwords)으로
-- 접속해 이 스크립트를 실행할 것 — image_slideshow의 albums/photos에는 권한이 없다
-- (hub/CLAUDE.md 참고). 로그인은 hub의 기존 Supabase Auth를 그대로 쓰므로 auth 테이블 없음.
-- 저장된 글은 사용자별로 격리되지 않는 전체 공유 보관함 — created_by는 감사(audit) 기록용.
-- ============================================================

CREATE TABLE good_words (
  id          VARCHAR2(36)              NOT NULL,
  -- 처음엔 VARCHAR2(20)(고정 8종 슬러그)였으나, 카테고리를 사용자가 자유롭게 생성할 수 있게
  -- 되면서 새 카테고리 id는 UUID(36자)로 발급 — 기존 8종 슬러그도 계속 유효(good_words_categories
  -- 시드 참고), 2026-08-15에 VARCHAR2(36)으로 확장.
  category    VARCHAR2(36)              NOT NULL,
  -- 80~150자(가드레일, 2026-08-15부터 — 이전엔 150~200자) 한글 기준 최대 600바이트(4바이트/자)
  -- 여유를 두어 1000바이트로 설정(기존 길이 유지, 축소는 불필요).
  content     VARCHAR2(1000)            NOT NULL,
  -- 글의 출처 — LLM 생성분은 'AI', 출처가 불분명하면 NULL(화면에는 공백 처리). 2026-08-15 추가.
  source      VARCHAR2(50),
  created_at  TIMESTAMP WITH TIME ZONE  DEFAULT SYSTIMESTAMP NOT NULL,
  created_by  VARCHAR2(255)             NOT NULL,
  -- 소프트 삭제 — SUPER_ADMIN_EMAIL만 삭제 가능(오남용 방지를 위해 하드 삭제 대신 로그 보존).
  deleted_at  TIMESTAMP WITH TIME ZONE,
  deleted_by  VARCHAR2(255),
  CONSTRAINT pk_good_words PRIMARY KEY (id)
);

-- 카테고리별 보관함 목록 조회(deleted_at IS NULL 필터 + created_at 정렬)가 가장 흔한 쿼리.
CREATE INDEX idx_good_words_category ON good_words (category, created_at DESC);

-- ============================================================
-- 카테고리 관리(생성/수정/삭제/순서 변경) — 2026-08-15 추가
-- id는 good_words.category가 그대로 참조하는 안정적 식별자(사용자가 라벨을 바꿔도 안 바뀜).
-- 기존 8종은 하위호환을 위해 예전 슬러그를 id로 그대로 시드했고, 새로 만드는 카테고리는
-- 애플리케이션에서 randomUUID()로 id를 발급한다.
-- ============================================================
CREATE TABLE good_words_categories (
  id          VARCHAR2(36)              NOT NULL,
  label       VARCHAR2(50)              NOT NULL,
  sort_order  NUMBER(10)                NOT NULL,
  created_at  TIMESTAMP WITH TIME ZONE  DEFAULT SYSTIMESTAMP NOT NULL,
  CONSTRAINT pk_good_words_categories PRIMARY KEY (id)
);

-- 카테고리 삭제 시 관련 좋은글을 DB 레벨에서 원자적으로 함께 제거(ON DELETE CASCADE) —
-- 애플리케이션에서 "카테고리 삭제 후 관련 글 삭제"를 2단계로 나누면 중간에 실패했을 때
-- 고아 레코드가 남을 수 있어, FK cascade로 일관성을 보장한다.
ALTER TABLE good_words ADD CONSTRAINT fk_good_words_category
  FOREIGN KEY (category) REFERENCES good_words_categories (id) ON DELETE CASCADE;

INSERT INTO good_words_categories (id, label, sort_order) VALUES ('comfort', '위로', 0);
INSERT INTO good_words_categories (id, label, sort_order) VALUES ('love', '사랑', 1);
INSERT INTO good_words_categories (id, label, sort_order) VALUES ('family', '가족', 2);
INSERT INTO good_words_categories (id, label, sort_order) VALUES ('life', '인생', 3);
INSERT INTO good_words_categories (id, label, sort_order) VALUES ('relationship', '인간관계', 4);
INSERT INTO good_words_categories (id, label, sort_order) VALUES ('courage', '용기', 5);
INSERT INTO good_words_categories (id, label, sort_order) VALUES ('gratitude', '감사', 6);
INSERT INTO good_words_categories (id, label, sort_order) VALUES ('rest', '쉼', 7);
COMMIT;
