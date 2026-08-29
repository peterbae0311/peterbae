-- Admin > 로그인 이력 관리 옆 "Sub Agents" 탭의 데이터 소스.
-- claude_code_agents_v0.2.xlsx(Agents 폴더)의 서브 에이전트 로스터를 그대로 옮겨왔다 —
-- 이후 화면에서 추가/수정/삭제 가능. 조회/쓰기 전부 /api/admin/sub-agents가 service_role로
-- 처리하므로(accounts 탭과 동일 패턴) RLS는 활성화만 해두고 별도 정책은 두지 않는다
-- (service_role은 RLS를 우회하므로 정책이 없어도 API 라우트는 정상 동작 — anon/authenticated
-- 클라이언트의 직접 접근만 막힘).
create table if not exists public.sub_agents (
  id uuid primary key default gen_random_uuid(),
  sort_order int not null default 0,
  name_en text not null unique,
  name_ko text not null,
  color text,
  core_responsibility text,
  key_deliverables text,
  priority_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.sub_agents enable row level security;

insert into public.sub_agents (sort_order, name_en, name_ko, color, core_responsibility, key_deliverables, priority_note) values
  (1, 'product-planning-manager', '기획 관리자', 'Red', '전체 개발 일정 관리, PRD 작성, 제품 목표/기능/사용자 요구사항 정의', 'PRD, 로드맵, 기능 명세서', '기존 운영 중'),
  (2, 'backend-architect', '백엔드 개발자', 'Blue', '서버 아키텍처 설계, API 개발, 데이터 처리, 외부 서비스 통합', 'API 스펙, 서버 코드, DB 스키마', '보안 항목은 security-engineer로 분리 권장'),
  (3, 'frontend-developer', '프런트엔드 개발자', 'Green', 'UI 설계 및 구현, 반응형 디자인, 웹 접근성, 성능 최적화', '컴포넌트, 화면 UI', '기존 운영 중'),
  (4, 'qa-engineer', '품질 보증 엔지니어', 'Yellow', '기능 테스트, 에러 처리 검증, 성능 최적화, 코드 리뷰, 버그 발견', '테스트 케이스, QA 리포트', '데이터 정합성 검증은 data-qa-specialist로 분리 권장'),
  (5, 'llm-integration-expert', '통합 전문가', 'Purple', 'OpenRouter API 연동, 프롬프트 최적화, 텍스트 생성/요약 파이프라인 구축', '프롬프트 템플릿, LLM 연동 모듈', '기존 운영 중'),
  (6, 'perf-optimization-engineer', '최적화 전문가', 'Orange', '애플리케이션 성능 개선, 병목 지점 탐지 및 해결', '성능 분석 리포트, 최적화 패치', '기존 운영 중'),
  (7, 'ux-designer', 'UX 디자이너', 'Cyan', '화면 디자인, 버튼 배치, 에러 메시지 등 사용자 경험 개선', '와이어프레임, UX 가이드', '기존 운영 중'),
  (8, 'data-pipeline-engineer', '데이터 파이프라인 엔지니어', 'Teal', '공공 API(문화공공데이터광장·서울열린데이터광장 등) 배치 수집 스케줄링, rate limit 대응, 어댑터 유지보수, 정규화/중복제거, 데이터 신선도 모니터링', '수집 스케줄러, 어댑터 모듈, 데이터 신선도 대시보드', '신규 제안 · 우선순위 1'),
  (9, 'devops-engineer', '데브옵스 엔지니어', 'Brown', 'CI/CD 구성, 배포 자동화, PostgreSQL/PostGIS·Redis 운영환경 구성, 로깅/모니터링/알림', '배포 파이프라인, 인프라 코드, 모니터링 대시보드', '신규 제안 · 우선순위 2'),
  (10, 'security-engineer', '보안 엔지니어', 'Gray', 'API 키/시크릿 관리, 인증·인가, 외부 API 호출 보안(SSRF/인젝션 방어), 캐시 데이터 노출 점검', '보안 점검 체크리스트, 취약점 리포트', '신규 제안 · 우선순위 3, 기존 backend-architect에서 분리'),
  (11, 'data-qa-specialist', '데이터 QA 전문가', 'Lime', '수집된 공공데이터의 정합성 검증(좌표 오류, 날짜 파싱, 중복 필터링 정확도 등)', '데이터 검증 리포트, 이상치 목록', '신규 제안 · 우선순위 4, 기존 qa-engineer에서 분리'),
  (12, 'technical-writer', '기술 문서 작성자', 'Silver', 'API 문서, 아키텍처 문서, README 유지보수', 'API 레퍼런스, 아키텍처 문서', '선택적 도입'),
  (13, 'system-architect', '시스템 아키텍트', 'Indigo', 'backend/frontend/LLM 간 인터페이스 계약 조율, 전체 기술 의사결정', '시스템 아키텍처 다이어그램, 기술 의사결정 문서', '선택적 도입, PM이 겸임 가능')
on conflict (name_en) do nothing;
