-- 앱별 최종 배포 완료 시각. dashboard_cards(사용자별 개인화)와 달리 이건 앱 자체의
-- 전역 속성이라 별도 테이블로 분리 — email 컬럼이 없고 app_key가 PK.
-- GitHub Actions의 각 배포 job이 성공적으로 끝난 직후 hub의
-- POST /api/dashboard/record-deploy를 호출해 upsert한다(hub/.github workflow 참고).
create table if not exists public.app_deployments (
  app_key text primary key,
  deployed_at timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.app_deployments enable row level security;

-- 배포 시각은 민감 정보가 아니라 로그인한 누구나 대시보드에서 읽을 수 있어야 한다.
-- 쓰기는 정책을 두지 않음 — record-deploy 라우트가 서비스롤(RLS 우회)로만 upsert한다.
create policy app_deployments_read on public.app_deployments
  for select
  using (true);
