-- 이메일별 모노레포 접근 권한 관리용 테이블.
-- 기본 차단: app_access에 (email, app_key) 행이 없으면 접근 불가 (super admin 제외).
create table if not exists public.app_access (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  app_key text not null,
  created_at timestamptz not null default now(),
  unique (email, app_key)
);

alter table public.app_access enable row level security;

-- 본인 권한 확인(로그인한 계정이 자신의 행을 읽음) + 최고관리자는 전체 조회 가능.
create policy app_access_select on public.app_access
  for select
  using (
    (auth.jwt() ->> 'email') = email
    or (auth.jwt() ->> 'email') = 'peter.bae0311@gmail.com'
  );

-- 부여/회수는 최고관리자만.
create policy app_access_admin_write on public.app_access
  for all
  using ((auth.jwt() ->> 'email') = 'peter.bae0311@gmail.com')
  with check ((auth.jwt() ->> 'email') = 'peter.bae0311@gmail.com');
