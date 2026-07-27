# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

경력 관리 앱 — **자기소개서 작성** + **채용공고 통합 검색** 두 가지 기능을 상단 네비게이션으로 전환하며 사용.

**Stack:** Next.js 15 (App Router) · TypeScript · Tailwind CSS · Supabase · Anthropic SDK · axios · cheerio

## Commands

```bash
npm install          # 의존성 설치
npm run dev          # 개발 서버 (http://localhost:3000)
npm run build        # 프로덕션 빌드
npm run lint         # ESLint 검사
```

## Architecture

```
src/
  middleware.ts                       # 인증 가드 — 미로그인 시 /login 리다이렉트(API는 401)
  app/
    layout.tsx                        # 루트 레이아웃 + NavBar (상단 탭 메뉴)
    login/page.tsx                    # 로그인 페이지 (Supabase Auth 이메일/비밀번호)
    page.tsx                          # 채용 통합 검색 페이지
    cover-letter/page.tsx             # 자기소개서 관리 페이지
    api/
      jobs/route.ts                   # GET /api/jobs — 4개 사이트 병렬 조회
      cover-letter/generate/route.ts  # POST — Claude AI 답변 생성
  components/
    NavBar.tsx             # 상단 네비게이션 + 로그인 계정 표시/로그아웃 (/login에서는 숨김)
    SearchForm.tsx         # 채용 검색 폼
    JobCard.tsx            # 채용공고 카드
    JobList.tsx            # 사이트별 탭 + 카드 그리드
  lib/
    supabase.ts            # 브라우저용 Supabase 클라이언트(쿠키 세션) + 타입 정의
    supabaseServer.ts      # Route Handler용 Supabase 클라이언트 (쿠키에서 세션 읽음)
    jobs/
      types.ts             # 공통 타입 (Job, SearchParams, JobSearchResult)
      worknet.ts / saramin.ts / wanted.ts / jobkorea.ts / index.ts
  constants/
    locations.ts           # 지역 목록, 사이트별 지역 코드 매핑
```

## Supabase 테이블 구조 (자기소개서)

| 테이블 | 역할 |
|--------|------|
| `cover_letter_refs` | 회사별 자기소개서 참고 항목 (1) |
| `cover_letter_ref_urls` | 참고 URL 목록, `ref_id` FK (N) |
| `cover_letter_questions` | 자기소개서 문항 + AI 답변, `ref_id` FK (N) |

- 1:N 관계: `cover_letter_refs` → `cover_letter_ref_urls`, `cover_letter_questions`
- ON DELETE CASCADE 설정으로 회사 삭제 시 하위 데이터 자동 삭제

## Key Design Decisions

- **API 키 없으면 Mock 데이터 반환** — 워크넷/사람인은 키가 없으면 `getMockJobs()`를 반환하므로 즉시 UI 확인 가능. 원티드는 키 없이 실제 API 호출, 실패 시 mock으로 폴백.
- **API Route를 반드시 경유** — CORS 우회 및 API 키 노출 방지를 위해 모든 외부 호출은 `/api/jobs`에서 서버사이드로 처리.
- **Promise.allSettled** — 한 사이트 실패가 전체를 막지 않도록 결과를 개별로 처리. 에러 사이트는 `error` 필드 포함 빈 배열 반환.
- **잡코리아 스크래핑** — HTML selector가 사이트 구조 변경 시 깨질 수 있음. `src/lib/jobs/jobkorea.ts`의 selector를 업데이트할 것.

## 인증 & 멀티테넌시

- **Supabase Auth (이메일/비밀번호)** 기반 로그인. 회원가입 화면은 없음 — 가족/지인 계정은 Supabase 대시보드에서 관리자가 직접 생성.
- `src/middleware.ts`가 모든 페이지/`/api/*` 요청에서 세션을 검사. 미로그인 시 페이지는 `/login`으로 리다이렉트, API는 `401` 반환.
- **개인 데이터 테이블**(`resume_*`, `cover_letter_*`, `interview_questions` — 총 10개)은 각각 `user_id uuid default auth.uid()` 컬럼 + RLS `owner_full_access` 정책(`auth.uid() = user_id`)으로 계정별로 완전히 분리됨. 로그인한 사용자는 본인이 입력한 데이터만 조회/수정 가능.
- `insert` 시 `user_id`를 앱 코드에서 명시적으로 넣을 필요 없음 — 컬럼 기본값이 `auth.uid()`라서 인증된 세션으로 요청하면 DB가 자동으로 채움.
- 클라이언트 컴포넌트는 `src/lib/supabase.ts`의 `supabase`(쿠키 세션 기반 `createBrowserClient`)를 그대로 사용. **Route Handler(`src/app/api/**`)에서 이 테이블들을 다루는 코드는 반드시 `src/lib/supabaseServer.ts`의 `createServerSupabaseClient()`를 사용해야 함** — 브라우저 싱글턴은 `document.cookie`에 의존하므로 서버에서 세션을 읽지 못해 RLS에 막힘.
- `채용 통합 검색`(`/jobs`)은 개인 데이터를 저장하지 않으므로 로그인 게이트만 적용되고 별도 소유권 개념 없음.

## Environment Variables

`.env.local.example`을 복사해 `.env.local`로 저장 후 API 키 입력:

| 변수 | 용도 | 발급처 |
|------|------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL | Supabase 대시보드 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon 키 | Supabase 대시보드 |
| `ANTHROPIC_API_KEY` | AI 자기소개서 작성 | console.anthropic.com |
| `WORKNET_API_KEY` | 워크넷 채용공고 | work.go.kr/openapi |
| `SARAMIN_API_KEY` | 사람인 채용공고 | openapi.saramin.co.kr |
