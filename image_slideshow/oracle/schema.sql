-- ============================================================
-- image_slideshow: Oracle Autonomous DB schema
-- Supabase Postgres(albums/photos)를 대체하는 스키마.
-- Auth는 계속 Supabase에 남으므로 auth.users 참조 없음 — album/photo에는
-- 소유자 개념이 없고(가족 공용 앨범), 접근 제어는 API 계층에서 JWT 검증으로 처리.
--
-- 타입 매핑:
--   uuid          -> VARCHAR2(36)  (DB 기본값 대신 API 계층에서 crypto.randomUUID()로 생성 —
--                                    기존 Supabase가 발급한 UUID 문자열과 형식을 그대로 유지해야
--                                    storage_path 등 기존 값과 이관 후에도 호환됨)
--   jsonb         -> CLOB CHECK (... IS JSON)  (실제 프로비저닝된 eungmomoa-db가 19c라 네이티브
--                                                JSON 타입 미지원 — 21c+였다면 JSON 타입 사용 가능)
--   timestamptz   -> TIMESTAMP WITH TIME ZONE
-- ============================================================

CREATE TABLE albums (
  id              VARCHAR2(36)              NOT NULL,
  name            VARCHAR2(200)             NOT NULL,
  album_date      DATE,
  music_id        VARCHAR2(50),
  music_name      VARCHAR2(200),
  music_url       VARCHAR2(1000),
  music_artist    VARCHAR2(200),
  music_list      CLOB CHECK (music_list IS JSON),
  -- 앨범 등록/수정 시 사용자가 고른 대표 이미지. FK 없음 — photos가 삭제돼도
  -- 클라이언트가 항상 "첫 사진으로 폴백"하므로 dangling id를 그냥 허용.
  cover_photo_id  VARCHAR2(36),
  created_at      TIMESTAMP WITH TIME ZONE  DEFAULT SYSTIMESTAMP NOT NULL,
  CONSTRAINT pk_albums PRIMARY KEY (id)
);

CREATE TABLE photos (
  id            VARCHAR2(36)   NOT NULL,
  album_id      VARCHAR2(36)   NOT NULL,
  filename      VARCHAR2(500)  NOT NULL,
  storage_path  VARCHAR2(1000) NOT NULL,
  url           VARCHAR2(1000) NOT NULL,
  sort_order    NUMBER(10)     DEFAULT 0 NOT NULL,
  CONSTRAINT pk_photos PRIMARY KEY (id),
  CONSTRAINT fk_photos_album FOREIGN KEY (album_id)
    REFERENCES albums (id) ON DELETE CASCADE
);

CREATE INDEX idx_photos_album_id ON photos (album_id);
CREATE INDEX idx_albums_created_at ON albums (created_at DESC);

-- 앱의 loadAlbums()가 매번 photos를 sort_order로 재정렬하므로 정렬 인덱스는 선택사항이지만,
-- 앨범당 사진 수가 늘어날 걸 감안해 album_id 인덱스는 필수.
