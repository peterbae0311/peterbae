# PRD: 한국증시 대시보드 (Tab 2)

## 1. 개요

**목적**: Peter-04 앱에 한국증시 대시보드 탭을 추가하여 KRX 업종별 등락률과 종목 데이터를 실시간 제공하고, LLM 기반 분석 팝업을 미국증시 탭과 동일한 UX로 지원한다.

**목표**
- NAVER Finance HTML 스크래핑으로 실시간 업종/종목 데이터 수집
- OpenRouter LLM으로 업종·종목 분석 팝업 제공
- 기존 컴포넌트 최대 재활용, 신규 개발 최소화

---

## 2. 기능 범위

| 기능 | Must / Should / Won't |
|------|----------------------|
| 업종 Top 20 목록 (등락률 정렬) | Must |
| 업종별 Top 5 종목 (회사명·종가·등락률·등락액) | Must |
| 업종 분석 팝업 (당일요약·단기·장기·기회·리스크) | Must |
| 종목 분석 팝업 (가이던스·단기·장기·목표주가·기회·리스크) | Must |
| DB 저장·히스토리 조회 | Won't |
| 차트 시각화 | Won't |

---

## 3. API Routes

| 경로 | 메서드 | 입력 | 출력 |
|------|--------|------|------|
| `/api/kr/sectors` | GET | 없음 | `{ sectors: [{ no, name, change_rate, change_amount }] }` Top 20 |
| `/api/kr/sector-stocks` | GET | `?no={업종코드}` | `{ stocks: [{ name, price, change_rate, change_amount }] }` Top 5 |
| `/api/kr/sector-analysis` | POST | `{ sector_name, stocks[] }` | `{ summary, short_term, long_term, opportunity, risk }` |
| `/api/kr/stock-analysis` | POST | `{ stock_name, price, change_rate }` | `{ guidance, short_term, long_term, target_price, opportunity, risk }` |

스크래핑은 서버 사이드에서만 실행 (CORS 우회). LLM 호출은 `OPENROUTER_API_KEY` 환경변수 사용 (하드코딩 금지).

---

## 4. 컴포넌트

| 컴포넌트 | 신규/재활용 |
|----------|-----------|
| `KoreanDashboard` (탭 컨테이너) | 신규 |
| `SectorCard` | 재활용 (한국 데이터 props 적용) |
| `StockRow` | 재활용 (₩ 단위 포맷 추가) |
| `SectorAnalysisModal` | 재활용 (필드명 한국어 조정) |
| `StockAnalysisModal` | 재활용 (가이던스·목표주가 필드 추가) |

---

## 5. 데이터 흐름

```
브라우저 → KoreanDashboard 마운트
  → GET /api/kr/sectors  → NAVER Finance 스크래핑 → 업종 Top 20 반환
  → 각 SectorCard 렌더
  → 업종 클릭 → GET /api/kr/sector-stocks?no=X → Top 5 종목 반환
  → 분석 버튼 클릭 → POST /api/kr/sector-analysis → OpenRouter LLM → 팝업 표시
  → 종목 클릭 → POST /api/kr/stock-analysis → OpenRouter LLM → 팝업 표시
```

---

## 6. 개발 단계

**Phase 1 — Backend** (backend-architect + llm-integration-specialist)
- NAVER Finance 스크래퍼 구현 (`/api/kr/sectors`, `/api/kr/sector-stocks`)
- LLM 분석 라우트 구현 (`/api/kr/sector-analysis`, `/api/kr/stock-analysis`)
- 에러 핸들링: 스크래핑 실패 시 빈 배열 반환, LLM 타임아웃 30초

**Phase 2 — Frontend** (frontend-developer + ux-designer)
- `KoreanDashboard` 컴포넌트 작성, 탭 전환 연결 (`app/page.tsx`)
- 기존 컴포넌트에 한국 데이터 포맷(₩, % 소수점 2자리) 적용
- 레이아웃: 좌 40% 업종 목록 / 우 60% 종목 상세 (기존 미국증시와 동일 비율)

**Phase 3 — QA** (qa-engineer)
- 스크래핑 응답 검증, LLM 분석 팝업 콘텐츠 확인
- 탭 전환 시 상태 초기화 확인

---

## 7. 범위 외 (Out of Scope)

- 실시간 WebSocket 스트리밍
- 종목 즐겨찾기·알림
- 백테스트·차트
- 텔레그램 봇 연동
