# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Status

This repository is currently empty aside from a `.env` file — no source code, build configuration, or documentation has been added yet. There are no commands to build, lint, or test because no project has been scaffolded.

전시/공연 정보를 API 로 연계하고 싶어. 
- API 제공 사이트에서 제공하는 정보를 공통 카테고리화 해서 DB 등록 및 업데이트하여 데이터 관리
- 데이터를 카테고리, 일정 등 내용으로 화면 서비스 구성

( 기본 API 정보 및 아키텍처 )
1. API 제공 사이트
① KOPIS (공연예술통합전산망) — 예술경영지원센터 운영

https://www.kopis.or.kr/por/cs/openapi/openApiInfo.do
예술경영지원센터 운영, 공연 예매 정보 집계 및 DB, 예매상황판, 공연통계 등 제공합니다. Kopis
공연목록, 공연시설, 기획/제작사, 축제, 예매상황판 등 국내 공연(뮤지컬·연극·클래식·무용 등) 데이터로는 가장 표준적입니다.

② 문화포털 (culture.go.kr) OPEN API

https://www.culture.go.kr/data/openapi/openapiInfo.do
공연전시정보 조회서비스, 문화예술공간 조회서비스, 문화정보 조회서비스 등을 제공하며, 서비스 인증키는 공공데이터포털에서 발급받습니다. Culture
공연·전시 통합 검색에 적합 (publicperformancedisplays 엔드포인트).

③ 문화공공데이터광장 — 전시정보(통합)/공연정보(통합) 맞춤형 API

https://www.culture.go.kr/data/openapi/openapiList.do
문화체육관광부 소속/공공기관에서 개별 운영 중인 전시 정보를 연계·통합하여 제목, 기간, 시간, 장소, 관람시간, 관람료 등 총 24개 메타데이터 칼럼으로 표준화하여 제공하며, 국립현대미술관·예술의전당·국립박물관 등 다수 기관이 참여합니다. 공연정보 쪽도 국립아시아문화전당, 국립중앙극장, 국립정동극장 등이 표준화되어 제공됩니다. CultureCulture

④ 공공데이터포털 (data.go.kr)

한국문화정보원 "한눈에보는문화정보조회서비스": 공연, 전시, 문화예술, 문화유산, 관광, 체육, 도서 등 다양한 문화정보를 종합적으로 제공하며 기간별·지역별·분야별 목록과 상세정보, 위치 좌표, 썸네일 등을 포함 Korea Data Portal
KOPIS/문화포털 API도 여기서 인증키를 발급받는 구조입니다.

⑤ 서울 열린데이터광장 (data.seoul.go.kr) — 서울시 문화행사 정보

https://data.seoul.go.kr/dataList/OA-15486/S/1/datasetView.do
서울문화포털에서 제공하는 문화행사 정보로, 분류·자치구·공연명·장소·날짜·이용요금·위치(위경도)·행사시간 등을 제공합니다. Seoul
서울 지역 소규모 행사·축제까지 커버하고 싶다면 유용합니다.


참고: 대부분 인증키는 공공데이터포털(data.go.kr)에서 회원가입 → 활용신청 → 승인받는 구조라 첫 통합 대상으로는 KOPIS + 문화포털을 조합하는 게 표준적입니다.

2. 아키텍처 설계
여러 기관 API를 합칠 때 핵심 이슈는 
ⓐ 필드 스키마가 기관마다 제각각이라는 점, 
ⓑ 실시간 호출은 느리고 rate limit이 있다는 점입니다. 
그래서 "수집 배치 + 정규화 + 자체 DB 서빙" 구조를 권장합니다.


## Environment Configuration

`.env` defines API credentials for the following services, indicating the intended stack for this project:

- `OPENROUTER_API_KEY` — OpenRouter (LLM routing/inference)
- `GROQ_API_KEY` — Groq (LLM inference)
- `HF_TOKEN` — Hugging Face
- `GEMINI_API_KEY` — Google Gemini
- `SUPABASE_URL` / `SUPABASE_ANON_KEY` — Supabase (database/backend)

When scaffolding the project, wire configuration reads through these existing variable names rather than introducing new ones.

## Notes for Future Work

Since no code exists yet, update this file once the project structure is established: add real build/lint/test commands and document the actual architecture (e.g., how the backend integrates Supabase, and how LLM calls are routed across OpenRouter/Groq/Gemini) once those decisions are made in code.
