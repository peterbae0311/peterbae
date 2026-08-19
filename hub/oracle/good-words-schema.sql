-- ============================================================
-- good-words(좋은글): Oracle Autonomous DB schema
-- image_slideshow와 같은 eungmomoa-db 인스턴스를 공유하되, 별도 스키마 계정(goodwords)으로
-- 접속해 이 스크립트를 실행할 것 — image_slideshow의 albums/photos에는 권한이 없다
-- (hub/CLAUDE.md 참고). 로그인은 hub의 기존 Supabase Auth를 그대로 쓰므로 auth 테이블 없음.
-- 저장된 글은 사용자별로 격리되지 않는 전체 공유 보관함 — created_by는 감사(audit) 기록용.
-- ============================================================

CREATE TABLE good_words (
  id            VARCHAR2(36)              NOT NULL,
  category      VARCHAR2(36)              NOT NULL,
  -- 근대 문학 원문 발췌라 한 문단이 꽤 길 수 있어(2026-08-16, 화면설계서 반영으로 콘텐츠가
  -- "AI가 지어낸 150~200자 위로 문구"에서 "실제 문학 작품 발췌"로 바뀌면서 VARCHAR2(4000)으로 확장).
  content       VARCHAR2(4000)            NOT NULL,
  -- 저장 시점 중복 방지용 해시(ORA_HASH(content)) — 아래 idx_good_words_dedup 유니크 인덱스가
  -- 이 값을 기준으로 한다. content를 그대로 유니크 인덱스에 걸면 멀티바이트(한글) 콘텐츠가
  -- Oracle의 인덱스 키 길이 한도를 넘길 수 있어 해시로 우회했다(2026-08-17).
  content_hash  NUMBER                    NOT NULL,
  -- 글의 출처 — "저자명 · 자료명" 형태(예: 이효석 · 낙엽을 태우면서). 불분명하면 NULL(화면 공백 처리).
  source        VARCHAR2(200),
  -- content가 한국어가 아닌 경우의 한국어 번역 — 이미 한국어면 NULL(화면/TTS에서 번역 생략).
  -- 생성 시 LLM이 함께 만들어 저장하거나, 관리자가 수정 화면의 "번역 생성" 버튼으로 나중에
  -- 채울 수 있다(/api/good-words/translate, 2026-08-17 추가).
  translation   CLOB,
  created_at    TIMESTAMP WITH TIME ZONE  DEFAULT SYSTIMESTAMP NOT NULL,
  created_by    VARCHAR2(255)             NOT NULL,
  -- 소프트 삭제 — SUPER_ADMIN_EMAIL만 삭제 가능(오남용 방지를 위해 하드 삭제 대신 로그 보존).
  deleted_at    TIMESTAMP WITH TIME ZONE,
  deleted_by    VARCHAR2(255),
  CONSTRAINT pk_good_words PRIMARY KEY (id)
);

-- 카테고리별 보관함 목록 조회(deleted_at IS NULL 필터 + created_at 정렬)가 가장 흔한 쿼리.
CREATE INDEX idx_good_words_category ON good_words (category, created_at DESC);

-- 같은 카테고리에 완전히 동일한 문장이 중복 저장되는 것을 DB가 원자적으로 막는다("삭제 전까지
-- 계속 누적" 요구사항 — 여러 번 생성해도 중복은 안 쌓여야 함). 애초에 SELECT로 먼저 확인하고
-- INSERT하는 방식은 두 요청이 거의 동시에 들어오면 둘 다 통과해버리는 레이스 컨디션이 있었다
-- (2026-08-17 실측 확인 후 이 유니크 인덱스로 교체). 세 번째 컬럼의 CASE는 Oracle에 부분
-- 유니크 인덱스 문법이 없어 흉내낸 것 — 삭제 안 된 행끼리만 (category, content_hash) 유니크를
-- 강제하고, 삭제된 행은 서로/현재행과 절대 충돌하지 않게(ora_hash(id)는 행마다 달라 사실상 유니크).
CREATE UNIQUE INDEX idx_good_words_dedup ON good_words (
  category, content_hash, (CASE WHEN deleted_at IS NULL THEN 0 ELSE ora_hash(id) END)
);

-- ============================================================
-- 카테고리 관리(생성/수정/삭제/순서 변경)
-- id는 good_words.category가 그대로 참조하는 안정적 식별자(라벨을 바꿔도 안 바뀜) — 애플리케이션에서
-- randomUUID()로 발급한다.
--
-- classification/prompt는 2026-08-16 화면설계서 반영으로 추가 — 카테고리는 감정 테마(위로/사랑 등)가
-- 아니라 "수필/소설/평론/격언" 같은 문학 장르 탭이고, 각 카테고리가 저마다 다른 전용 AI 프롬프트를
-- 갖는다(예: 수필 탭은 "근대 수필에서 퍼블릭 도메인 문장을 찾아라", 격언 탭은 "명언·격언을 찾아라").
-- 한때 전역 공용 프롬프트 테이블(good_words_prompt_config)을 따로 뒀으나 배포 전에 이 방식으로
-- 대체됐다.
-- ============================================================
CREATE TABLE good_words_categories (
  id              VARCHAR2(36)              NOT NULL,
  label           VARCHAR2(50)              NOT NULL,
  classification  VARCHAR2(50),
  -- 좋은글 하나당 허용할 최대 글자수(한글 기준 문자 길이) — 카테고리마다 다르다(예: 소설은
  -- 1000, 수필은 400). generate/route.ts가 이 값을 LLM 프롬프트 힌트와 응답 필터 컷 양쪽에
  -- 그대로 사용한다(2026-08-17 추가, 이전엔 전 카테고리 공용 400자 하드코딩이었음).
  max_length      NUMBER(10)                DEFAULT 400 NOT NULL,
  -- "좋은글 생성" 클릭 시 한 번에 생성할 문장 개수 — 카테고리마다 다르게 지정 가능
  -- (2026-08-17 추가, 이전엔 전 카테고리 공용 20개 하드코딩이었음).
  generate_count  NUMBER(10)                DEFAULT 20 NOT NULL,
  prompt          CLOB                      NOT NULL,
  sort_order      NUMBER(10)                NOT NULL,
  created_at      TIMESTAMP WITH TIME ZONE  DEFAULT SYSTIMESTAMP NOT NULL,
  -- 소프트 삭제 — good_words와 동일한 정책(2026-08-17부터). 카테고리 삭제 시 애플리케이션이
  -- 카테고리 자신과 그 안의 good_words 행을 같은 트랜잭션으로 함께 소프트 삭제한다
  -- (lib/goodWords/categoriesDb.ts의 deleteCategory 참고). 처음엔 FK의 ON DELETE CASCADE로
  -- 하드 삭제했었는데, 복구 불가능한 삭제라 앱의 "삭제는 소프트 삭제 + 로그 기록" 정책과
  -- 어긋나 바꿨다.
  deleted_at      TIMESTAMP WITH TIME ZONE,
  deleted_by      VARCHAR2(255),
  CONSTRAINT pk_good_words_categories PRIMARY KEY (id)
);

-- CASCADE는 이제 정상 앱 흐름에서는 발동하지 않는다(위 소프트 삭제 참고) — 누군가 수동으로
-- 카테고리 행을 하드 DELETE하는 예외적 상황에서도 고아 good_words 행이 안 남게 하는
-- 방어적 안전장치로만 남겨둔다.
ALTER TABLE good_words ADD CONSTRAINT fk_good_words_category
  FOREIGN KEY (category) REFERENCES good_words_categories (id) ON DELETE CASCADE;

-- 초기 4개 카테고리(화면설계서 slide1 기준) — 실제 prompt 전문은 이 파일이 아니라
-- hub/src/app/api/good-words/categories에서 관리자가 입력한 값을 그대로 저장/조회한다.
-- 아래는 seed 목적의 예시일 뿐, 운영 중에는 화면의 카테고리 관리 모달로 자유롭게 수정한다.
