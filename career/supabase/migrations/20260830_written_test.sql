-- 필기 예상 문제(자기소개서/면접 준비 > 면접 예상 질문 > 필기 예상 문제) 기능용 테이블.
-- cover_letter_refs(회사)에 종속 — 회사 삭제 시 카테고리·문제 모두 cascade 삭제.

create table if not exists public.written_test_categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid(),
  ref_id      uuid not null references public.cover_letter_refs(id) on delete cascade,
  name        text not null,
  description text,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.written_test_categories enable row level security;

create policy owner_full_access on public.written_test_categories
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists written_test_categories_ref_id_idx
  on public.written_test_categories(ref_id);

-- type: 'choice4'(4지선다) | 'choice5'(5지선다) | 'short'(단답형)
-- choices: choice4/choice5일 때만 사용 (문항 텍스트 배열). short은 null.
-- answer: choice4/choice5는 choices 중 하나와 정확히 일치하는 텍스트, short은 모범 답안 텍스트.
create table if not exists public.written_test_questions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid(),
  category_id uuid not null references public.written_test_categories(id) on delete cascade,
  type        text not null check (type in ('choice4', 'choice5', 'short')),
  question    text not null,
  choices     jsonb,
  answer      text not null,
  explanation text,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

alter table public.written_test_questions enable row level security;

create policy owner_full_access on public.written_test_questions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists written_test_questions_category_id_idx
  on public.written_test_questions(category_id);
