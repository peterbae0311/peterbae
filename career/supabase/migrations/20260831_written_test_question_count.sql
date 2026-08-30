-- 카테고리별로 생성할 문제 개수를 사용자가 지정할 수 있도록 컬럼 추가 (기본 20).
alter table public.written_test_categories
  add column if not exists question_count int not null default 20;
