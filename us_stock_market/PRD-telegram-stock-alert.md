# PRD: 미국 주식 텔레그램 자동 알림 시스템

**문서 버전**: v1.0  
**작성일**: 2026-05-08  
**작성자**: product-planning-manager  
**프로젝트**: Peter-04 미국증시  

---

## 1. 제품 개요 (Product Overview)

### 1.1 목적 (Purpose)

미국 주식 시장의 각 거래 세션(프리마켓, 정규장, 애프터마켓) 마감 직후, 섹터별 상승률 순위와 상위 종목 정보를 LLM 요약과 함께 텔레그램으로 자동 발송하는 알림 시스템을 구축한다.

### 1.2 배경 (Background)

- 미국 주식 시장은 한국 시간 기준으로 새벽~오전에 걸쳐 운영되어 실시간 모니터링이 어렵다.
- 거래 세션 종료 후 주요 움직임을 빠르게 파악하고 싶은 개인 투자자 수요가 높다.
- 단순 등락률 나열이 아닌, LLM 기반 상승 사유 요약을 통해 정보 밀도를 높인다.

### 1.3 목표 (Goals)

| 우선순위 | 목표 |
|---|---|
| P0 | 3개 거래 세션 마감 후 자동으로 텔레그램 메시지 발송 |
| P0 | 섹터별 상승률 순위 및 섹터 내 상위 종목 정보 제공 |
| P1 | LLM(OpenRouter)으로 종목별 상승 사유 한국어 요약 생성 |
| P1 | 발송 이력 Supabase DB 저장 및 중복 발송 방지 |
| P2 | Next.js 웹 대시보드에서 발송 이력 및 설정 관리 |

### 1.4 목표 사용자 (Target Users)

- **주요**: 미국 주식에 관심 있는 개인 투자자 (Peter 및 소규모 그룹)
- **부차**: 섹터 로테이션 및 모멘텀 전략을 참고하는 중급 투자자

### 1.5 핵심 가치 (Core Value Proposition)

> "잠자는 동안 일어난 미국 시장의 핵심 움직임을 기상 후 텔레그램에서 바로 확인한다."

---

## 2. 기능 요구사항 (Functional Requirements)

### 2.1 기능 목록 (MoSCoW 우선순위)

| ID | 기능 | MoSCoW | 담당 에이전트 |
|---|---|---|---|
| F-01 | 주식 데이터 수집 (섹터별 등락률) | Must | backend-architect |
| F-02 | 섹터 내 상위 종목 필터링 | Must | backend-architect |
| F-03 | 텔레그램 메시지 발송 | Must | backend-architect |
| F-04 | 세션별 발송 스케줄 자동화 (Cron) | Must | backend-architect |
| F-05 | LLM 종목 상승 사유 요약 생성 | Must | llm-integration-specialist |
| F-06 | 발송 이력 DB 저장 | Should | backend-architect |
| F-07 | 중복 발송 방지 로직 | Should | backend-architect |
| F-08 | 웹 대시보드 (발송 이력 조회) | Could | frontend-developer |
| F-09 | 텔레그램 봇 커맨드 인터페이스 | Could | backend-architect |
| F-10 | 발송 설정 관리 UI (섹터 필터, 종목 수) | Won't (v1) | frontend-developer |

### 2.2 상세 기능 명세

#### F-01: 주식 데이터 수집

- **입력**: 거래 세션 종료 트리거 (Cron 또는 Webhook)
- **처리**:
  - 외부 주식 API를 호출하여 전체 미국 주식의 섹터별 등락률 수집
  - 수집 대상: 섹터명, 섹터 평균 등락률(%), 섹터 내 종목 목록(회사명, 티커, 종가, 등락률, 전일 대비 가격 변화)
- **출력**: 정형화된 JSON 데이터
- **오류 처리**: API 호출 실패 시 최대 3회 재시도, 실패 로그 기록

#### F-02: 섹터 내 상위 종목 필터링

- **로직**: 각 섹터에서 등락률 기준 상위 N개 종목 추출 (기본값: 3개)
- **조건**: 등락률 양수(+) 종목만 포함 (하락 섹터 내 상위는 제외 또는 별도 섹션)
- **섹터 정렬**: 섹터 평균 등락률 내림차순

#### F-03: 텔레그램 메시지 발송

- **방식**: Telegram Bot API (`sendMessage`) 사용
- **대상**: 사전 설정된 Chat ID (개인 또는 그룹)
- **포맷**: 마크다운 또는 HTML 형식 (가독성 우선)
- **제한**: 텔레그램 메시지 최대 4,096자 — 초과 시 메시지 분할 발송

#### F-04: 세션별 발송 스케줄 자동화

- **방식**: Vercel Cron Jobs (Next.js API Route 활용)
- **세션별 트리거 시각** (한국 표준시 KST 기준):

| 세션 | 마감 시각 (미국 동부) | 발송 시각 (KST) | 비고 |
|---|---|---|---|
| 프리마켓 | 09:30 ET | 23:30 KST | 정규장 직전 |
| 정규장 | 16:00 ET | 익일 06:00 KST | |
| 애프터마켓 | 20:00 ET | 익일 10:00 KST | |

- **DST(서머타임) 처리**: 미국 EDT(UTC-4) / EST(UTC-5) 자동 판별 필요

#### F-05: LLM 종목 상승 사유 요약

- **모델**: OpenRouter API (권장 모델: `google/gemini-flash-1.5` 또는 `openai/gpt-4o-mini` — 비용 효율 우선)
- **입력 컨텍스트**: 티커, 회사명, 등락률, 거래량 변화, (가능 시) 최신 뉴스 헤드라인
- **출력**: 한국어 1~2문장 요약
- **예시 출력**: "실적 발표에서 EPS가 시장 예상을 15% 상회하며 강한 매수세 유입"
- **비용 제어**: 섹터 상위 3개 종목만 LLM 요약 적용 (전체 종목 X)

#### F-06: 발송 이력 DB 저장

- **저장 시점**: 텔레그램 발송 성공 후
- **저장 내용**: 세션 유형, 발송 시각, 메시지 내용, 발송 상태(성공/실패), 섹터 데이터 JSON

#### F-07: 중복 발송 방지

- **로직**: 발송 전 DB에서 해당 날짜 + 세션 유형으로 조회, 이미 발송 기록이 있으면 스킵
- **목적**: Cron 중복 실행 또는 수동 재실행 시 사고 방지

---

## 3. 데이터 요구사항 (Data Requirements)

### 3.1 외부 API 후보

| API | 특징 | 가격 | 권장 용도 |
|---|---|---|---|
| **Financial Modeling Prep (FMP)** | 섹터 성과, 종목 상세 데이터 풍부 | 무료 티어 가능 | 1순위 추천 |
| **Polygon.io** | 실시간/과거 데이터, 그룹별 집계 | 무료 티어 제한적 | 대안 |
| **Alpha Vantage** | 무료 티어 넉넉, 속도 느림 | 무료 | 예산 제약 시 |
| **Yahoo Finance (비공식)** | 무료, 불안정 | 무료 | MVP 프로토타입 |

**권장**: MVP 단계에서는 FMP 무료 티어로 시작 → 데이터 품질 검증 후 유료 플랜 전환 여부 결정

**필수 데이터 포인트:**
- 섹터별 집계: 섹터명, 당일 등락률(%)
- 종목별: 티커, 회사명, 현재가(종가), 전일 종가, 등락률(%), 거래량
- (선택) 뉴스 헤드라인: LLM 컨텍스트 보강용

### 3.2 Supabase DB 스키마 개요

#### 테이블: `alert_sessions`
```
id              uuid         PK, default gen_random_uuid()
session_type    varchar(20)  'premarket' | 'regular' | 'aftermarket'
trade_date      date         거래일 (미국 동부시간 기준)
sent_at         timestamptz  실제 발송 시각 (KST)
status          varchar(10)  'success' | 'failed' | 'skipped'
telegram_msg_id bigint       텔레그램 발송 메시지 ID (성공 시)
created_at      timestamptz  default now()
```

#### 테이블: `sector_snapshots`
```
id              uuid         PK
session_id      uuid         FK -> alert_sessions.id
sector_name     varchar(100) 섹터명
change_pct      decimal(5,2) 섹터 등락률(%)
rank            smallint     섹터 순위
raw_data        jsonb        원본 API 응답 (종목 목록 포함)
created_at      timestamptz  default now()
```

#### 테이블: `stock_summaries`
```
id              uuid         PK
session_id      uuid         FK -> alert_sessions.id
ticker          varchar(10)  종목 티커
company_name    varchar(200)
sector_name     varchar(100)
change_pct      decimal(5,2) 등락률(%)
price_change    decimal(10,2) 전일 대비 가격 변화 ($)
llm_summary     text         LLM 생성 요약 (한국어)
created_at      timestamptz  default now()
```

---

## 4. 시스템 아키텍처 개요 (System Architecture)

### 4.1 컴포넌트 구성

```
┌─────────────────────────────────────────────────────┐
│                  Vercel (Next.js)                   │
│                                                     │
│  ┌─────────────────┐    ┌────────────────────────┐  │
│  │   Cron Jobs     │    │   API Routes           │  │
│  │  (3 schedules)  │───>│  /api/cron/premarket   │  │
│  │                 │    │  /api/cron/regular     │  │
│  └─────────────────┘    │  /api/cron/aftermarket │  │
│                         └──────────┬───────────┘  │
└────────────────────────────────────┼────────────────┘
                                     │
              ┌──────────────────────┼──────────────────────┐
              │                      │                      │
              v                      v                      v
   ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
   │   Stock API     │    │  OpenRouter API │    │    Supabase     │
   │ (FMP/Polygon)   │    │  (LLM 요약)      │    │    (DB 저장)     │
   └────────┬────────┘    └────────┬────────┘    └────────┬────────┘
            │                      │                      │
            └──────────────────────┴──────────────────────┘
                                   │
                                   v
                        ┌─────────────────────┐
                        │   Telegram Bot API  │
                        │   (메시지 발송)       │
                        └─────────────────────┘
```

### 4.2 데이터 흐름

```
[Cron 트리거]
    │
    ▼
[중복 발송 확인] ──(이미 발송)──> [스킵, 로그 기록]
    │ (미발송)
    ▼
[Stock API 호출] ──(실패)──> [재시도 3회] ──(실패)──> [에러 알림]
    │ (성공)
    ▼
[섹터별 정렬 및 상위 종목 필터링]
    │
    ▼
[OpenRouter LLM 호출] ── 상위 종목별 상승 사유 요약 생성
    │
    ▼
[메시지 포맷팅]
    │
    ▼
[Telegram Bot API 발송]
    │
    ▼
[Supabase DB 저장] ── 발송 이력, 섹터 스냅샷, 종목 요약
```

### 4.3 기술 스택 상세

| 레이어 | 기술 | 역할 |
|---|---|---|
| 런타임 | Next.js 14+ (App Router) | Cron, API Route, 웹 UI |
| 스케줄링 | Vercel Cron Jobs | 세션별 자동 트리거 |
| DB | Supabase (PostgreSQL) | 발송 이력, 스냅샷 저장 |
| 주식 데이터 | FMP API (1순위) | 섹터/종목 등락률 |
| LLM | OpenRouter API | 상승 사유 한국어 요약 |
| 메신저 | Telegram Bot API | 알림 발송 |
| 배포 | Vercel | CI/CD (GitHub 연동) |

---

## 5. 발송 스케줄 (Notification Schedule)

### 5.1 세션별 발송 타이밍

#### EST 기준 (서머타임 미적용 기간, 11월~3월)

| 세션 | 미국 EST 마감 | UTC 마감 | KST 발송 시각 | Cron 표현식 (UTC) |
|---|---|---|---|---|
| 프리마켓 | 09:30 EST | 14:30 UTC | 23:30 KST | `35 14 * * 1-5` |
| 정규장 | 16:00 EST | 21:00 UTC | 06:00 KST (익일) | `5 21 * * 1-5` |
| 애프터마켓 | 20:00 EST | 01:00 UTC (익일) | 10:00 KST | `5 1 * * 2-6` |

#### EDT 기준 (서머타임 적용 기간, 3월~11월)

| 세션 | 미국 EDT 마감 | UTC 마감 | KST 발송 시각 | Cron 표현식 (UTC) |
|---|---|---|---|---|
| 프리마켓 | 09:30 EDT | 13:30 UTC | 22:30 KST | `35 13 * * 1-5` |
| 정규장 | 16:00 EDT | 20:00 UTC | 05:00 KST (익일) | `5 20 * * 1-5` |
| 애프터마켓 | 20:00 EDT | 00:00 UTC (익일) | 09:00 KST | `5 0 * * 2-6` |

> **주의**: DST 전환 시기(3월 둘째 주 일요일, 11월 첫째 주 일요일)에 Cron 표현식을 수동 업데이트하거나, 코드에서 동적으로 처리해야 함.

### 5.2 공휴일 처리

- 미국 주식 시장 공휴일(NYSE Holiday Calendar) 기준으로 발송 스킵
- FMP API의 `is-the-market-open` 엔드포인트 활용 가능
- 공휴일 스킵 로그를 DB에 `status = 'skipped'`로 기록

---

## 6. 텔레그램 메시지 포맷 (Telegram Message Format)

### 6.1 메시지 구조

```
[이모지] 세션명 마감 | MM월 DD일 (요일)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 섹터별 상승률 순위
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[섹터별 블록 반복]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚡ 발송 시각: HH:MM KST
```

### 6.2 실제 메시지 예시 — 정규장 마감

```
🔔 미국 정규장 마감 | 5월 7일 (수)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 섹터별 상승률 순위 (S&P 500 기준)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🥇 기술 (Technology)  +2.84%
  ├ NVDA  +5.23%  (+$6.42)
  │  ↳ AI 서버 수요 급증으로 데이터센터 매출이 전년 대비 200% 성장할 것이라는 전망 상향에 강한 매수세 유입
  ├ AAPL  +2.11%  (+$3.78)
  │  ↳ 아이폰 16 사전 예약 물량이 예상을 30% 초과하며 공급망 우려 해소
  └ META  +1.95%  (+$9.20)
     ↳ Threads 월간 활성 사용자 수 3억 돌파 발표로 광고 수익 성장 기대감 상승

🥈 에너지 (Energy)  +1.67%
  ├ XOM   +2.45%  (+$2.89)
  │  ↳ 원유 재고 예상치 대비 감소로 유가 반등, WTI $82 회복
  ├ CVX   +1.89%  (+$2.01)
  │  ↳ Permian 분지 생산량 목표 상향 조정 발표
  └ COP   +1.34%  (+$1.56)
     ↳ 분기 배당 15% 인상 발표

🥉 헬스케어 (Healthcare)  +1.23%
  ├ LLY   +3.10%  (+$18.70)
  │  ↳ 비만치료제 임상 3상 결과 발표에서 체중 감량 효과 경쟁사 대비 우수 확인
  ├ UNH   +1.05%  (+$5.60)
  │  ↳ 의료비 지출 효율화 프로그램 성과 발표
  └ JNJ   +0.87%  (+$1.35)
     ↳ 신약 FDA 패스트트랙 지정

[하락 섹터 요약]
📉 하락 섹터: 부동산 -0.98% | 유틸리티 -0.54%

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚡ 발송: 06:03 KST  |  데이터: FMP
```

### 6.3 실제 메시지 예시 — 프리마켓 마감

```
🌅 미국 프리마켓 마감 | 5월 8일 (목)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 프리마켓 섹터별 상승률 순위
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🥇 소비재 (Consumer Discretionary)  +1.42%
  ├ AMZN  +2.10%  (+$4.51)
  │  ↳ 프라임 데이 조기 발표로 이커머스 수익 기대감 상승
  ├ TSLA  +1.87%  (+$3.29)
  │  ↳ 중국 4월 인도량 전월 대비 18% 증가 발표
  └ HD    +0.98%  (+$3.12)
     ↳ 주택 착공 건수 예상 상회로 리모델링 수요 회복 기대

[이하 동일 구조]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚡ 발송: 23:33 KST  |  데이터: FMP
```

### 6.4 메시지 세션별 이모지 구분

| 세션 | 이모지 | 발송 시 머리말 |
|---|---|---|
| 프리마켓 | 🌅 | 미국 프리마켓 마감 |
| 정규장 | 🔔 | 미국 정규장 마감 |
| 애프터마켓 | 🌙 | 미국 애프터마켓 마감 |

### 6.5 메시지 길이 초과 처리

- 전체 섹터 수 포함 시 4,096자 초과 가능
- 처리 방안: 상위 5개 섹터만 포함 (나머지는 요약 텍스트로 처리)
- 분할 발송 시: 메시지 상단에 "(1/2)", "(2/2)" 표시

---

## 7. 개발 우선순위 및 단계별 계획 (Development Phases)

### 7.1 Phase 1: MVP (목표 기간: 2주)

**목표**: 정규장 마감 후 1회 발송 기능 완성 및 검증

| Task | 담당 에이전트 | 예상 기간 |
|---|---|---|
| 주식 API 연동 (FMP) 및 데이터 수집 로직 | backend-architect | 3일 |
| 섹터 정렬 및 상위 종목 필터링 로직 | backend-architect | 1일 |
| OpenRouter LLM 요약 프롬프트 작성 및 연동 | llm-integration-specialist | 2일 |
| 텔레그램 봇 설정 및 메시지 발송 기능 | backend-architect | 1일 |
| Vercel Cron 1개 (정규장) 설정 | backend-architect | 1일 |
| Supabase 테이블 생성 및 저장 로직 | backend-architect | 1일 |
| 메시지 포맷 구현 (마크다운) | backend-architect | 1일 |
| 통합 테스트 및 수동 발송 검증 | qa-engineer | 2일 |

**Phase 1 완료 기준 (Acceptance Criteria)**:
- [ ] 수동 트리거 시 정규장 마감 데이터 수집 성공
- [ ] LLM 요약 섹터 상위 3개 종목에 정상 생성
- [ ] 텔레그램으로 지정 Chat ID에 메시지 발송 성공
- [ ] 발송 이력 Supabase에 저장 확인
- [ ] 중복 발송 방지 로직 검증

### 7.2 Phase 2: 전체 세션 확장 (목표 기간: 1주)

**목표**: 프리마켓, 애프터마켓 세션 추가 및 Cron 자동화

| Task | 담당 에이전트 | 예상 기간 |
|---|---|---|
| 프리마켓/애프터마켓 API 엔드포인트 추가 | backend-architect | 1일 |
| Vercel Cron 2개 추가 및 DST 처리 | backend-architect | 1일 |
| 공휴일 스킵 로직 구현 | backend-architect | 1일 |
| 세션별 메시지 포맷 차별화 | backend-architect | 1일 |
| 3개 세션 통합 테스트 | qa-engineer | 1일 |

**Phase 2 완료 기준**:
- [ ] 3개 세션 모두 Cron 자동 발송 동작 확인
- [ ] 공휴일(NYSE 기준) 자동 스킵 동작 확인
- [ ] 연속 5일 무중단 자동 발송 검증

### 7.3 Phase 3: 웹 대시보드 (목표 기간: 1주)

**목표**: 발송 이력 조회 및 시스템 상태 확인 웹 UI

| Task | 담당 에이전트 | 예상 기간 |
|---|---|---|
| 웹 대시보드 UI 설계 (40:60 레이아웃) | ux-designer | 1일 |
| 발송 이력 목록 페이지 구현 | frontend-developer | 2일 |
| 세션별 섹터 스냅샷 상세 조회 | frontend-developer | 1일 |
| 수동 발송 트리거 버튼 (관리자용) | frontend-developer | 1일 |

### 7.4 Phase 4: 고도화 (선택적, 목표 기간: 2주)

| 기능 | 담당 에이전트 | 비고 |
|---|---|---|
| 뉴스 헤드라인 수집 → LLM 컨텍스트 보강 | llm-integration-specialist | 정확도 향상 |
| 발송 설정 관리 UI (섹터 필터, 종목 수 조절) | frontend-developer | 유연성 향상 |
| 텔레그램 봇 커맨드 (`/status`, `/today`) | backend-architect | 사용자 편의 |
| 성능 최적화 (API 응답 캐싱) | perf-optimization-engineer | 비용 절감 |
| 알림 구독자 관리 (다수 Chat ID) | backend-architect | 확장성 |

---

## 8. 비기능 요구사항 (Non-Functional Requirements)

### 8.1 성능 (Performance)

- Cron 트리거부터 텔레그램 발송 완료까지 **5분 이내** (LLM 처리 포함)
- Stock API 호출 타임아웃: 10초
- LLM API 호출 타임아웃: 30초 (종목당)
- Vercel Serverless Function 최대 실행 시간: 300초 (Pro 플랜 필요)

### 8.2 보안 (Security)

- **API 키 관리**: 모든 API 키는 `.env` 파일 또는 Vercel 환경 변수에서 로드, 코드에 하드코딩 절대 금지
- **대상 키**: `OPENROUTER_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `FMP_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`
- `.env` 파일은 `.gitignore`에 반드시 포함하여 GitHub에 절대 커밋하지 않음
- Telegram Chat ID는 DB에 저장하여 코드에서 분리

### 8.3 신뢰성 (Reliability)

- Stock API 실패 시 자동 재시도 3회 (Exponential Backoff)
- LLM API 실패 시 요약 없이 등락률 데이터만 발송 (Graceful Degradation)
- 발송 실패 시 에러 로그를 Supabase에 기록
- Vercel Cron 실패 알림: 별도 에러 텔레그램 채널로 발송 (Phase 2)

### 8.4 확장성 (Scalability)

- 구독자(Chat ID) 다수 지원 구조로 설계 (Phase 1에서는 단일 Chat ID)
- 섹터 필터링, 발송 종목 수 설정을 하드코딩 없이 DB/환경변수로 관리

---

## 9. UX/UI 가이드라인 (Phase 3 웹 대시보드)

- **디자인 스타일**: 밝고 트렌디하고 산뜻한 스타일 (다크모드 선택적)
- **레이아웃**: 좌측 40% (네비게이션 + 세션 필터) / 우측 60% (발송 이력, 상세 내용)
- **컬러 팔레트**: 상승 종목 = 초록계열, 하락 종목 = 빨강계열 (미국 시장 관례)
- **반응형**: 모바일에서도 핵심 정보 확인 가능하도록 설계
- **담당 에이전트**: ux-designer (화면 설계), frontend-developer (구현)

---

## 10. 리스크 및 고려사항 (Risks & Mitigation)

| 리스크 | 심각도 | 발생 가능성 | 완화 전략 |
|---|---|---|---|
| 주식 API 무료 티어 한도 초과 | 높음 | 중간 | 일별 호출 수 모니터링, 데이터 캐싱, FMP → Polygon 전환 플랜 준비 |
| Vercel Serverless 300초 타임아웃 초과 | 높음 | 중간 | LLM 병렬 호출, 종목 수 제한, Pro 플랜 확인 |
| DST 전환 시 발송 타이밍 오류 | 중간 | 높음 | 코드 레벨에서 `luxon` 또는 `date-fns-tz`로 동적 처리 |
| 텔레그램 API Rate Limit | 낮음 | 낮음 | 메시지 간 500ms 딜레이, 분할 발송 시 1초 간격 |
| OpenRouter API 비용 급증 | 중간 | 낮음 | 저비용 모델 우선 사용, 월별 비용 한도 설정 |
| 주식 API 데이터 품질 문제 | 중간 | 중간 | 이상값 필터링 로직, 수동 검증 절차 |
| 미국 주식 시장 조기 마감 (단축 거래일) | 낮음 | 낮음 | NYSE 캘린더 API 연동으로 특수 거래일 처리 |

---

## 11. 에이전트별 역할 요약

| 에이전트 | Phase 1 | Phase 2 | Phase 3 |
|---|---|---|---|
| **backend-architect** | Stock API 연동, 텔레그램 발송, Cron, Supabase 저장 | 세션 확장, DST 처리, 공휴일 스킵 | 수동 트리거 API |
| **llm-integration-specialist** | OpenRouter 연동, 요약 프롬프트 최적화 | 뉴스 컨텍스트 보강 (P4) | - |
| **qa-engineer** | 통합 테스트, 발송 검증 | 3개 세션 회귀 테스트 | 웹 UI 테스트 |
| **frontend-developer** | - | - | 대시보드 구현 |
| **ux-designer** | - | - | 대시보드 화면 설계 |
| **perf-optimization-engineer** | - | - | API 캐싱, 응답 최적화 (P4) |

---

## 12. 성공 지표 (Success Metrics)

| 지표 | 목표값 | 측정 방법 |
|---|---|---|
| 발송 성공률 | 95% 이상 | DB `status = 'success'` / 전체 세션 수 |
| 발송 지연 시간 | 마감 후 5분 이내 | `sent_at` - 세션 마감 시각 |
| LLM 요약 생성 성공률 | 90% 이상 | `llm_summary` non-null 비율 |
| 사용자 피드백 | 주 1회 이상 긍정 반응 | 텔레그램 리액션/답변 |
| 월 API 비용 | $10 이하 (MVP 기준) | OpenRouter + FMP 청구서 |

---

*이 PRD는 product-planning-manager가 작성하였으며, 구현 시작 전 backend-architect 및 llm-integration-specialist와 기술 실현 가능성 검토 세션을 진행할 것을 권장합니다.*
