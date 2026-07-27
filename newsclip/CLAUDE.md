# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

**분야별 최신 기사 보기 웹앱** 
— 분야별 권위있는 기관에서 작성한 최신 기사나 발표자료를 수집하여 카테고리 L1, L2별 기사를 선별하여 10개를 목록으로 표시
(경고) 백그라운드 작업이라도 커서 움직임을 항상 보여줘. 멈춘것 처럼 보이지 않도록 해줘.


## 기술 스택

- **프레임워크**: Next.js (App Router, `NEXT_PUBLIC_*` 환경변수 사용)
- **DB**: Supabase (PostgreSQL)
- **AI/LLM**: OpenRouter API, Groq API, Gemini API

## 환경변수 (.env)

| 키 | 용도 |
|---|---|
| `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL |
| `SUPABASE_ANON_KEY` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase 익명 키 |
| `OPENROUTER_API_KEY` | OpenRouter LLM 호출 (서버 전용) |
| `GROQ_API_KEY` | Groq LLM 호출 (서버 전용) |

> ⚠️ `NEXT_PUBLIC_` 접두사 없는 키는 클라이언트에 절대 노출되지 않음.
> Supabase anon key는 RLS 정책으로 보호됨.

## Supabase DB 테이블 구조

### `categories` — L1 카테고리
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid | PK |
| name | text | 분야명 (예: 반도체, AI) |
| order_num | int | 표시 순서 |

### `subcategories` — L2 서브카테고리
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid | PK |
| category_id | uuid | FK → categories.id |
| name | text | 서브카테고리명 |
| description | text | 말풍선 설명 |
| rss_sources | text[] | RSS 피드 URL 배열 |

### `articles` — 수집된 기사
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid | PK |
| subcategory_id | uuid | FK → subcategories.id |
| title | text | 제목 (한국어) |
| url | text | 원문 URL (UNIQUE) |
| source | text | 출처 기관명 |
| published_at | timestamptz | 발행일 |
| summary | text | 원문 요약 |
| summary_ko | text | 한국어 요약 |
| is_translated | boolean | 번역 여부 |

## 화면 레이아웃

```
┌── 헤더: 앱 타이틀 + 카테고리 생성 버튼 ──────────────────────┐
├── L1 탭 [반도체] [AI] ... [기사 보기 버튼] ────────────────────┤
├── L2 [전체] [공급망/시장] [설계/아키텍처] [제조/파운드리] ──────┤
│    ↑ 호버 시 말풍선(tooltip) 표시                            │
└── 기사 목록 (서브카테고리별, 각 10개) ──────────────────────────┘
         ↓ 클릭 시
    [팝업: 기사 제목, 출처, 한국어 요약, 원문 링크, 번역 버튼]
```

## 핵심 기능 구현 포인트

### 카테고리 생성
- 카테고리명 입력 → AI가 서브카테고리 4~6개 + RSS 소스 자동 생성 → DB 저장
- API: `POST /api/categories` → `lib/ai.ts:generateSubcategories()`

### 기사 수집
- 「기사 보기」 버튼 → `POST /api/articles` → RSS 피드 fetch → AI 요약/번역 → DB upsert
- `lib/rss.ts:fetchMultipleRss()` — 병렬 fetch, 중복 제거, 최신순 정렬
- `lib/ai.ts:summarizeArticle()` — Groq로 빠른 요약, 실패 시 OpenRouter 폴백

### 번역
- Groq API 우선 사용 (속도), 실패 시 OpenRouter 폴백
- 이미 한국어 비율 30% 이상이면 번역 생략
- 팝업 내 「한국어 번역」 버튼: 전문 번역 on-demand

### 보안
- AI/외부 API 키는 서버 전용 환경변수만 사용 (API Route에서만 호출)
- Supabase RLS 활성화 (anon key로 읽기 허용, 쓰기도 허용)
- `.env` → `.gitignore`에 포함
- `.env.example` 제공 (실제 값 없는 템플릿)
