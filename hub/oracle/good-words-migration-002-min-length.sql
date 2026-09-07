-- ============================================================
-- good-words: "최대 글자수" 단일값 -> "글자수" 최소~최대 범위로 확장 (2026-09-07)
-- 이미 good-words-schema.sql을 실행해 good_words_categories 테이블이 존재하는 DB에서
-- 실행할 것. eungmomoa-db의 goodwords 스키마 계정으로 접속 후 이 파일을 그대로 실행.
-- ============================================================

ALTER TABLE good_words_categories ADD min_length NUMBER(10) DEFAULT 10 NOT NULL;
