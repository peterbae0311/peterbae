-- dashboard_cards는 원래 "본인 것만 읽고 쓸 수 있음"으로 설계됐다(개인 커스터마이징
-- 오버레이). 그런데 카드 이미지(custom_image)를 관리자 계정에서만 등록해왔기 때문에,
-- 다른 계정은 자기 소유 행이 없어 이미지를 전혀 보지 못하는 문제가 있었다.
--
-- 관리자가 설정한 값을 "기본값"으로 모든 계정이 읽을 수 있게 하고, 각자 자신의 행을
-- 만들면(개인화) 그게 우선하도록 클라이언트에서 병합한다. 쓰기 권한은 기존 정책대로
-- 본인 이메일 행에만 한정된다 — 이 정책은 SELECT만 추가로 허용한다.
create policy dashboard_cards_admin_defaults_read on public.dashboard_cards
  for select
  using (email = 'peter.bae0311@gmail.com');
