-- ============================================================
-- good-words(좋은글): Oracle Autonomous DB schema
-- image_slideshow와 별도 지갑/계정(hub/CLAUDE.md 참고) — 계정 발급 후 이 스크립트를 실행할 것.
-- 로그인은 hub의 기존 Supabase Auth를 그대로 쓰므로 auth 테이블 없음.
-- 저장된 글은 사용자별로 격리되지 않는 전체 공유 보관함 — created_by는 감사(audit) 기록용.
-- ============================================================

CREATE TABLE good_words (
  id          VARCHAR2(36)              NOT NULL,
  category    VARCHAR2(20)              NOT NULL,
  -- 150~200자(가드레일) 한글 기준 최대 800바이트(4바이트/자) 여유를 두어 1000바이트로 설정.
  content     VARCHAR2(1000)            NOT NULL,
  created_at  TIMESTAMP WITH TIME ZONE  DEFAULT SYSTIMESTAMP NOT NULL,
  created_by  VARCHAR2(255)             NOT NULL,
  -- 소프트 삭제 — SUPER_ADMIN_EMAIL만 삭제 가능(오남용 방지를 위해 하드 삭제 대신 로그 보존).
  deleted_at  TIMESTAMP WITH TIME ZONE,
  deleted_by  VARCHAR2(255),
  CONSTRAINT pk_good_words PRIMARY KEY (id)
);

-- 카테고리별 보관함 목록 조회(deleted_at IS NULL 필터 + created_at 정렬)가 가장 흔한 쿼리.
CREATE INDEX idx_good_words_category ON good_words (category, created_at DESC);
