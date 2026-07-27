# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

**Peter-04 미국증시** — 미국 주식 시장 관련 정보를 제공하는 웹 애플리케이션 프로토타입.  
배포: GitHub → Vercel 자동 빌드/배포.  
DB: Supabase (클라우드).

## 환경 변수

`.env` 파일에 아래 키가 정의되어 있음:
- `OPENROUTER_API_KEY` — LLM 호출 (OpenRouter)
- `GROQ_API_KEY` — Groq LLM API
- `HF_TOKEN` — Hugging Face
- `SUPABASE_URL` / `SUPABASE_ANON_KEY` — Supabase DB 연결

## MCP 서버 설정

| MCP 서버 | 용도 | 설치 명령 참조 |
|---|---|---|
| Supabase | 클라우드 DB 연동 | 작업1) MCP, Key 설정.txt |
| Playwright | 브라우저 자동화 / UI 테스트 | 작업1) MCP, Key 설정.txt |
| Context7 | 최신 라이브러리 문서 참조 | 작업1) MCP, Key 설정.txt |
| Sequential-Thinking | 단계적 사고 처리 | 작업1) MCP, Key 설정.txt |
| GitHub | 버전 관리 / 자동 업로드 | 작업1) MCP, Key 설정.txt |
| Notion | 작업 문서화 | 작업1) MCP, Key 설정.txt |

## 멀티 에이전트 구성

| 역할 | Agent ID | 담당 |
|---|---|---|
| 기획 관리자 | `product-planning-manager` | PRD 작성, 개발 일정 관리 |
| 백엔드 개발자 | `backend-architect` | API 개발, DB 설계, 서버 사이드 |
| 프런트엔드 개발자 | `frontend-developer` | UI 구현, 반응형 디자인 |
| 품질 보증 엔지니어 | `qa-engineer` | 기능 테스트, 코드 리뷰, 버그 발견 |
| LLM 통합 전문가 | `llm-integration-specialist` | OpenRouter API 연동, AI 파이프라인 |
| 최적화 전문가 | `perf-optimization-engineer` | 병목 분석, 성능 개선 |
| UX 디자이너 | `ux-designer` | 화면 설계, 사용성 개선 |

새 기능 개발 시 `product-planning-manager`로 PRD를 먼저 작성하고, 이후 해당 전문 에이전트에 위임하는 순서로 진행.

## Git / 배포

```bash
git init
git add .
git commit -m "메시지"
git remote add origin https://github.com/paul-bae/<repo>.git
git push -u origin main
```

GitHub에 push하면 Vercel이 자동으로 빌드·배포함.
