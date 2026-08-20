-- 학습목표 다듬기(refine_objectives): 과정 > 과목 > 학습목표 3단계 마스터 데이터.
-- 접근 권한은 nginx auth_request(app_access) + API 라우트의 로그인 확인이 1차 방어선이라
-- (다른 hub 내부 앱과 동일한 신뢰 경계), 여기서는 로그인 여부만 확인한다 — 개인 소유 데이터가
-- 아니라 운영자 전체가 공유하는 마스터 데이터라 이메일 단위 소유 개념이 없다.
create table if not exists public.refine_objectives_courses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.refine_objectives_subjects (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.refine_objectives_courses(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- status: 'confirmed'(초안 없음, confirmed_text가 최신) / 'reviewing'(AI 초안이 refined_text에
-- 있고 운영자 검토 대기 중). '반영'을 누르면 confirmed_text ← 검토된 문장, refined_text는
-- 비우고 다시 'confirmed'로 돌아간다 — 이전 값 이력은 남기지 않는 단순 덮어쓰기(결정 반영).
create table if not exists public.refine_objectives_learning_objectives (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.refine_objectives_subjects(id) on delete cascade,
  confirmed_text text not null,
  refined_text text,
  status text not null default 'confirmed' check (status in ('confirmed', 'reviewing')),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.refine_objectives_courses enable row level security;
alter table public.refine_objectives_subjects enable row level security;
alter table public.refine_objectives_learning_objectives enable row level security;

create policy refine_objectives_courses_auth on public.refine_objectives_courses
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy refine_objectives_subjects_auth on public.refine_objectives_subjects
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy refine_objectives_learning_objectives_auth on public.refine_objectives_learning_objectives
  for all using (auth.uid() is not null) with check (auth.uid() is not null);
