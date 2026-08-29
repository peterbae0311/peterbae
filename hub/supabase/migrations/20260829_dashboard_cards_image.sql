-- 대시보드 카드에 사용자별 이미지(로컬 선택 또는 AI 생성) 저장.
-- 별도 스토리지 버킷 없이 WebP로 인코딩한 data URL 문자열을 그대로 저장한다
-- (560x374 WebP 기준 수십KB 수준이라 text 컬럼으로 충분 — dashboard_cards가 이미
-- 사용자별 개인화 오버레이 테이블이라 이미지도 같은 테이블/같은 RLS를 그대로 재사용).
alter table public.dashboard_cards add column if not exists custom_image text;
