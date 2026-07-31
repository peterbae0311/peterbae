-- 사용자별 대시보드 카드 커스터마이징(이름/설명/순서).
-- app_key/URL 자체는 여기서 안 다룸 — 그건 lib/apps.ts(고정 레지스트리)와
-- app_access(권한) 소관이고, 이 테이블은 순수 표시용 오버레이.
create table if not exists public.dashboard_cards (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  app_key text not null,
  custom_label text,
  custom_description text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (email, app_key)
);

alter table public.dashboard_cards enable row level security;

-- 본인 것만 읽고 쓸 수 있음 — 관리자 전체조회 개념 자체가 필요 없음(개인 설정이라).
create policy dashboard_cards_owner on public.dashboard_cards
  for all
  using ((auth.jwt() ->> 'email') = email)
  with check ((auth.jwt() ->> 'email') = email);
