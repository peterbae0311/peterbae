-- 과정별로 AI 다듬기에 쓸 프롬프트를 따로 관리한다("학습목표 프롬프트" 버튼).
-- null이면 애플리케이션이 기본 프롬프트(src/lib/refineObjectives/prompt.ts)를 사용한다.
alter table public.refine_objectives_courses add column if not exists prompt text;
