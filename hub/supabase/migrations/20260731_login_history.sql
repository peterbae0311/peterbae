-- 로그인 이력 관리 테이블. Admin 화면 탭2("로그인 이력 관리")에서 조회한다.
-- session_id는 Supabase Auth JWT의 session_id 클레임 — 로그인/로그아웃을 같은 행에 짝짓는 키.
-- 로그인 실패 시에는 세션 자체가 없으므로 session_id가 null일 수 있다.
create table if not exists public.login_history (
  id uuid primary key default gen_random_uuid(),
  session_id text,
  login_id text not null,
  login_at timestamptz not null default now(),
  logout_at timestamptz,
  result text not null check (result in ('success', 'fail')),
  fail_reason text,
  ip_address text,
  region_country text,
  os text,
  browser text,
  device text,
  created_at timestamptz not null default now()
);

create index if not exists login_history_session_id_idx on public.login_history (session_id);
create index if not exists login_history_login_id_idx on public.login_history (login_id);
create index if not exists login_history_login_at_idx on public.login_history (login_at desc);

alter table public.login_history enable row level security;

-- 조회는 최고관리자만. insert/update는 서버(API route)가 service_role 키로 하므로 RLS를 우회함
-- — 별도 정책 불필요(있어도 적용 안 됨).
create policy login_history_select_admin on public.login_history
  for select
  using ((auth.jwt() ->> 'email') = 'peter.bae0311@gmail.com');
