-- 전시/공연 정보 통합 서비스 - 초기 스키마
-- 공유 Supabase 프로젝트 내 이름 충돌 방지를 위해 모든 테이블에 exh_ 접두어 사용

-- =========================================
-- 1. 소스 정의
-- =========================================
create table public.exh_sources (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  provider text,
  domain text not null check (domain in ('culture', 'industry')),
  fetch_type text not null check (fetch_type in ('realtime_api', 'file_data')),
  base_url text,
  call_interval_minutes integer,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.exh_sources is '전시/공연/산업행사 데이터 소스 정의';

-- =========================================
-- 2. 카테고리 마스터 (대/중분류 계층)
-- =========================================
create table public.exh_categories (
  code text primary key,
  parent_code text references public.exh_categories (code),
  name text not null,
  level smallint not null check (level in (1, 2)),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.exh_categories is '공통 카테고리 마스터 (대분류 level=1, 중분류 level=2)';

-- 대분류
insert into public.exh_categories (code, parent_code, name, level, sort_order) values
  ('IND', null, '산업', 1, 1),
  ('CULTURE', null, '문화', 1, 2);

-- 중분류 - 산업
insert into public.exh_categories (code, parent_code, name, level, sort_order) values
  ('IND_JOB', 'IND', '취업/채용박람회', 2, 1),
  ('IND_TRADEFAIR', 'IND', '산업/무역박람회', 2, 2),
  ('IND_AGRIFOOD', 'IND', '농수산식품박람회', 2, 3),
  ('IND_ETC', 'IND', '기타 산업행사', 2, 4);

-- 중분류 - 문화 : 공연 계열
insert into public.exh_categories (code, parent_code, name, level, sort_order) values
  ('PERF_PLAY', 'CULTURE', '연극', 2, 10),
  ('PERF_MUSICAL', 'CULTURE', '뮤지컬', 2, 11),
  ('PERF_DANCE', 'CULTURE', '무용/발레', 2, 12),
  ('PERF_CLASSIC', 'CULTURE', '클래식/서양음악', 2, 13),
  ('PERF_TRAD', 'CULTURE', '국악/전통예술', 2, 14),
  ('PERF_OPERA', 'CULTURE', '오페라', 2, 15),
  ('PERF_POPMUSIC', 'CULTURE', '대중음악/콘서트', 2, 16),
  ('PERF_MULTI', 'CULTURE', '복합/기타 공연', 2, 17);

-- 중분류 - 문화 : 전시 계열
insert into public.exh_categories (code, parent_code, name, level, sort_order) values
  ('EXPO_ART', 'CULTURE', '미술(회화)', 2, 20),
  ('EXPO_PHOTO', 'CULTURE', '사진', 2, 21),
  ('EXPO_SCULPTURE', 'CULTURE', '조각/설치', 2, 22),
  ('EXPO_CRAFT', 'CULTURE', '공예/디자인', 2, 23),
  ('EXPO_MEDIA', 'CULTURE', '미디어아트/뉴미디어', 2, 24),
  ('EXPO_CALLIGRAPHY', 'CULTURE', '서예', 2, 25),
  ('EXPO_HISTORY', 'CULTURE', '역사/유물', 2, 26),
  ('EXPO_SCIENCE', 'CULTURE', '자연사/과학', 2, 27),
  ('EXPO_MULTI', 'CULTURE', '복합/기타 전시', 2, 28);

-- 중분류 - 문화 : 축제/행사 계열
insert into public.exh_categories (code, parent_code, name, level, sort_order) values
  ('FEST_LOCAL', 'CULTURE', '지역축제', 2, 30),
  ('FEST_TRAD', 'CULTURE', '전통/민속행사', 2, 31),
  ('FEST_EXPERIENCE', 'CULTURE', '체험/참여행사', 2, 32),
  ('FEST_ETC', 'CULTURE', '기타행사', 2, 33);

-- =========================================
-- 3. 카테고리 매핑 (소스 원본값 -> 공통 코드)
-- =========================================
create table public.exh_category_mappings (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.exh_sources (id) on delete cascade,
  raw_value text not null,
  mapped_category_code text references public.exh_categories (code),
  is_confirmed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_id, raw_value)
);

comment on table public.exh_category_mappings is '소스별 원본 카테고리 값 -> 공통 카테고리 코드 매핑. is_confirmed=false는 운영자 확인 큐 대상';

-- =========================================
-- 4. 장소/시설 마스터
-- =========================================
create table public.exh_venues (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.exh_sources (id),
  external_id text,
  name text not null,
  address text,
  region_sido text,
  region_sigungu text,
  latitude numeric,
  longitude numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_id, external_id)
);

-- =========================================
-- 5. 원본 수집 데이터 (소스별 최신본 upsert)
-- =========================================
create table public.exh_raw_items (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.exh_sources (id) on delete cascade,
  external_id text not null,
  payload jsonb not null,
  collected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (source_id, external_id)
);

comment on table public.exh_raw_items is '소스별 원본 payload 최신본 (재정규화 대비 보관)';

-- =========================================
-- 6. 정규화된 이벤트 (전시/공연/산업행사)
-- =========================================
create table public.exh_events (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.exh_sources (id),
  external_id text not null,
  title text not null,
  category_code text references public.exh_categories (code),
  region_sido text,
  region_sigungu text,
  start_date date not null,
  end_date date,
  event_time text,
  venue_id uuid references public.exh_venues (id),
  price_info text,
  image_url text,
  source_url text,
  first_seen_at timestamptz not null default now(),
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_id, external_id)
);

create index exh_events_category_idx on public.exh_events (category_code);
create index exh_events_region_idx on public.exh_events (region_sido, region_sigungu);
create index exh_events_date_idx on public.exh_events (start_date, end_date);

-- 진행상태(예정/진행중/종료)는 저장하지 않고 날짜 기준으로 계산
create view public.exh_events_status as
select
  e.*,
  case
    when current_date < e.start_date then 'upcoming'
    when e.end_date is null then case when current_date > e.start_date then 'ended' else 'ongoing' end
    when current_date > e.end_date then 'ended'
    else 'ongoing'
  end as status
from public.exh_events e;

-- =========================================
-- 7. 배치 실행 이력
-- =========================================
create table public.exh_sync_logs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.exh_sources (id),
  started_at timestamptz not null,
  finished_at timestamptz,
  status text check (status in ('success', 'partial', 'failed')),
  processed_count integer not null default 0,
  failed_count integer not null default 0,
  error_message text,
  created_at timestamptz not null default now()
);

-- =========================================
-- 8. RLS
-- =========================================
alter table public.exh_events enable row level security;
alter table public.exh_venues enable row level security;
alter table public.exh_categories enable row level security;
alter table public.exh_sources enable row level security;
alter table public.exh_category_mappings enable row level security;
alter table public.exh_raw_items enable row level security;
alter table public.exh_sync_logs enable row level security;

-- 사용자 노출 조회 테이블: 익명 SELECT 허용
create policy exh_events_public_select on public.exh_events for select using (true);
create policy exh_venues_public_select on public.exh_venues for select using (true);
create policy exh_categories_public_select on public.exh_categories for select using (true);

-- 운영/내부 테이블(exh_sources, exh_category_mappings, exh_raw_items, exh_sync_logs)은
-- 익명 SELECT 정책을 두지 않는다. 수집 배치는 service role key로 접근해 RLS를 우회한다.
