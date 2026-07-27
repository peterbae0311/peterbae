# PRD: 전시/공연 정보 통합 서비스

## 1. 개요

여러 공공/민간 API가 제각각 제공하는 전시·공연 정보를 하나의 공통 카테고리 체계로 정규화하여 자체 DB에 적재하고, 이를 기반으로 카테고리·일정·지역 등 기준으로 탐색 가능한 화면 서비스를 제공한다.

### 배경
- 국내 전시/공연 정보는 KOPIS, 문화포털, 문화공공데이터광장, 공공데이터포털, 서울 열린데이터광장 등 기관별로 분산되어 있고 필드 스키마가 서로 다르다.
- 각 API는 실시간 호출 시 응답 속도 및 rate limit 제약이 있어, 사용자향 서비스에서 직접 호출하기에 부적합하다.
- 따라서 "배치 수집 → 정규화 → 자체 DB 서빙" 구조가 필요하다.

### 목표
- 여러 API 소스의 데이터를 정기적으로 수집하여 공통 스키마로 정규화된 DB를 구축한다.
- 사용자가 카테고리(전시/공연/장르 등), 일정(기간, 진행중/예정/종료), 지역 등 조건으로 콘텐츠를 탐색할 수 있는 화면을 제공한다.
- 데이터 최신성을 유지하기 위한 업데이트(증분 갱신, 종료 처리) 체계를 갖춘다.

## 2. 대상 사용자

- 전시/공연 정보를 찾는 일반 사용자 (지역·기간·장르 기준 탐색)
- (내부) 데이터 운영자 — 수집 배치 상태, 소스별 오류, 매핑 실패 건 등을 확인하는 관리 화면 필요

## 3. 범위

### In Scope
- API 데이터 수집기 (소스별 클라이언트)
- 공통 스키마로의 정규화 및 카테고리 매핑
- DB 등록/업데이트(upsert)·중복 제거 로직
- 카테고리/일정/지역 기반 목록·상세·검색 화면
- 수집 배치 스케줄링 및 실패 모니터링

### Out of Scope (1차 버전 제외)
- 예매/결제 연동
- 사용자 계정, 개인화 추천
- 리뷰/평점 등 소셜 기능
- IND_ECONOMY(경제/비즈니스 행사) 카테고리 — 표준화된 공공 오픈API를 확인하지 못해 1차 범위에서 제외. 이후 소스가 확인되면 재검토

## 4. 데이터 소스

| 우선순위 | 소스 | 제공처 | 비고 |
|---|---|---|---|
| 1 | KOPIS 공연예술통합전산망 | 예술경영지원센터 | 국내 공연(뮤지컬·연극·클래식·무용) 표준 데이터, 공연목록/시설/기획사/축제/예매상황판 |
| 1 | 문화포털 OPEN API | 한국문화정보원 | `publicperformancedisplays` 등 공연·전시 통합 조회 |
| 2 | 문화공공데이터광장 전시정보(통합)/공연정보(통합) | 문체부 소속·산하기관 | 국립현대미술관·예술의전당·국립박물관 등 참여, 24개 메타데이터 칼럼 표준화 |
| 3 | 공공데이터포털 "한눈에보는문화정보조회서비스" | 한국문화정보원 | 공연·전시·문화유산·관광 등 종합, 위치좌표/썸네일 포함 |
| 3 | 서울 열린데이터광장 문화행사 정보 | 서울시 | 서울 지역 소규모 행사·축제, 위경도 포함 |

- 인증키는 공공데이터포털(data.go.kr) 회원가입 → 활용신청 → 승인 절차로 발급받는 구조이며, KOPIS/문화포털도 이를 통해 발급된다.
- 1차 통합 대상은 **KOPIS + 문화포털** 조합을 표준으로 한다.
- (구현 현황) **KOPIS**는 `exh_sources`에 등록 완료 — code=`kopis`, base_url=`https://www.kopis.or.kr/openApi/restful/pblprfr`(공연목록/상세), 목록 호출 주기 1일 1회(1440분). 서비스키는 별도로 공공데이터포털에서 발급받아 `.env`에 추가 필요 (아직 미발급).
- (구현 현황) **문화포털**도 `exh_sources`에 등록 완료 — code=`culture_portal`. 2026-07-05 실제 서비스키 발급 및 실사용 테스트로 아래 내용 확정/정정:
  - ~~`https://apis.data.go.kr/B553457/nopenapi/rest/publicperformancedisplays/period`~~ (검색으로 추정한 값, 실제로는 HTTP 404 — 잘못된 경로였음)
  - **정정된 End Point**(사용자의 data.go.kr 마이페이지 활용신청 상세에서 확인): `https://apis.data.go.kr/B553457/cultureinfo`, 데이터포맷 XML, 심의 자동승인, 활용기간 2026-07-05~2028-07-05
  - 사용할 오퍼레이션: **기간별 문화정보목록조회 `/period2`** → `exh_sources.base_url = https://apis.data.go.kr/B553457/cultureinfo/period2`
  - 정확한 요청 파라미터(data.go.kr 활용신청 상세의 "요청변수" 화면으로 확인): `serviceKey`, `PageNo`, `numOfrows`, `from`, `to`(YYYYMMDD), `serviceTp`(A=공연/전시, B=행사/축제, C=교육/체험 — 문화/공연 범위이므로 A로 고정). 이전에 썼던 `cPage`/`rows`는 잘못된 이름이었음(그래서 HTTP 401 발생)
  - 그 외 제공 오퍼레이션: 지역별(`/area2`), 상세정보(`/detail2`, `seq`로 단건 상세조회 — 목록에 없는 가격 등 필드 보강용, 추후 활용 검토), 문화캘린더(`/livelihood2`)
  - **분야별 조회(`/realm2`) 설명으로 확인한 정확한 realmCode 표**: A000=연극, B000=음악/콘서트, B002=국악, B003=뮤지컬/오페라, C000=무용/발레, D000=전시, E000=아동/가족, F000=행사/축제, G000=교육/체험, H000=도서, I00=체육, L000=기타
  - **응답 스키마 확정**(2026-07-05 실제 응답, 744건 조회 성공): `response.body.items.item[]` — `seq`(ID), `title`, `area`(시도), `sigungu`(시군구), `startDate`/`endDate`(YYYYMMDD), `place`(장소), `realmName`(분야), `thumbnail`(이미지). `response.body.totalCount`로 페이지네이션.
  - **어댑터 완전 구현 완료** — `src/adapters/culturePortal.ts` normalize() 포함, 실제 실행 결과 processed=744, failed=0
  - `exh_category_mappings`에 확정 매핑(is_confirmed=true) 등록 완료: 연극→PERF_PLAY, 음악/콘서트→PERF_POPMUSIC, 국악→PERF_TRAD, 무용/발레→PERF_DANCE, 전시→EXPO_MULTI(세부 장르 미제공이라 복합/기타로 처리), 뮤지컬/오페라→PERF_MUSICAL(오페라 단독 구분 불가, 다수가 실제 뮤지컬이라 대표값 채택), 아동/가족→PERF_MULTI. 행사/축제·교육/체험·도서·체육·기타는 `serviceTp=A` 필터로 범위 밖이라 매핑 보류
- (구현 현황) **문화공공데이터광장**은 2026-07-05 재조사 결과 전시/공연이 별개 API라는 게 확인되어 `culture_data_plaza` 단일 소스를 폐기(is_active=false)하고 2개로 분리 등록:
  - `culture_data_plaza_expo`(전시정보(통합), 한국문화정보원 외 12개 기관) — End Point `https://api.kcisa.kr/openapi/API_CCA_145/request`. 더미 키로 실제 호출해 경로 확인(403 "API Key is not valid" = 경로는 맞고 키만 없음). 파라미터: `serviceKey`(필수), `numOfRows`/`pageNo`(선택). 신청 페이지: [culture.go.kr id=598](https://www.culture.go.kr/data/openapi/openapiView.do?id=598)
  - `culture_data_plaza_perf`(공연정보(통합), 문체부 산하기관) — End Point `https://api.kcisa.kr/API_CNV_053/request` (주의: `/openapi/` 접두어 없음, 실제 확인함). 파라미터: `serviceKey`(필수), `numOfRows`/`pageNo`/`keyword`(선택, 빈 값이어도 파라미터 자체는 포함해야 함). 신청 페이지: [culture.go.kr id=556](https://www.culture.go.kr/data/openapi/openapiView.do?id=556)
  - **인증키 신청 방식이 KOPIS/문화포털과 다름**: data.go.kr 계정 불필요, culture.go.kr에서 바로 4단계(제공동의→신청자정보→활용정보→서비스키) 진행 후 **이메일로 서비스키 발송**. 개발 계정은 일일 1,000건 제한
  - **`culture_data_plaza_expo` 어댑터 구현 완료** (`src/adapters/cultureDataPlazaExpo.ts`). 응답 필드: `TITLE`/`CNTC_INSTT_NM`(담당기관)/`DESCRIPTION`/`IMAGE_OBJECT`/`LOCAL_ID`(기관 내부ID, 기관 간 unique 아님 → external_id는 기관명+LOCAL_ID 조합)/`URL`/`EVENT_SITE`/`GENRE`/`CHARGE`/`PERIOD`('YYYY-MM-DD ~ YYYY-MM-DD')/`EVENT_PERIOD`(시간). 지역(시도/시군구) 필드는 없음. `numOfRows=500`까지 허용 확인(총 9,479건, 페이지네이션으로 전량 수집). DESCRIPTION의 HTML 엔티티가 많아 fast-xml-parser 기본 entity expansion 한도(1000)에 걸려 `processEntities.maxTotalExpansions`를 올려서 해결
  - **데이터 품질 이슈 발견 및 대응** (실제 9,479건 실행으로 확인, 2026-07-05): ① 기관마다 `LOCAL_ID` 채번 방식이 달라 `기관명+LOCAL_ID` 조합으로도 1,608개 ID가 중복(같은 항목의 재수집으로 추정, 마지막 값으로 upsert되어 최종 6,462건 고유) ② 일부 기관(국립아시아문화전당 등)은 `PERIOD`가 순수 숫자로 내려와 파서가 number로 반환 → `.split()` 호출 시 예외 발생(205건 크래시) → `String()` 강제 변환으로 수정 ③ 일부 기관은 `PERIOD`를 비우고 `EVENT_PERIOD`에 기간을 넣음 → `PERIOD` 비어있으면 `EVENT_PERIOD`도 기간으로 재시도하도록 fallback 추가 ④ 그래도 구분자가 `~`도 공백도 아닌 등 파싱 불가능한 잔여 케이스(약 1,010건, 전체의 ~11%)는 정상적으로 건너뜀 — 수정 후 결과: threw=0, 정상 정규화 8,469건. **실제 DB 반영 완료**: processed=8,360/failed=1,119, `LOCAL_ID` 중복으로 최종 `exh_events` 5,635건 적재
  - **`culture_data_plaza_perf`는 보류 (2026-07-05 결정).** 응답에 날짜범위 필터 파라미터가 아예 없고 `totalCount=283,445`(수년치 과거 공연 포함 추정, KOPIS/문화포털처럼 "현재~예정"만 거르는 게 불가능). 정렬 기준이나 최신순 여부도 미확인이라 전량 수집이 비현실적이라 판단, 어댑터 구현을 보류하기로 함(base_url만 등록된 상태 유지). 다른 문화 소스(KOPIS/문화포털/전시정보통합)로도 공연 데이터는 충분히 커버되는 상황
  - ~~`culture_info_all`(한국문화정보원 한눈에보는문화정보조회서비스)~~ — **2026-07-05 비활성화(is_active=false).** 재조사 결과 `culture_portal`과 동일한 API(제공기관 한국문화정보원 B553457, 동일 엔드포인트 `publicperformancedisplays`)를 문화포털/공공데이터포털 두 카탈로그가 중복 등록한 것으로 확인되어 `culture_portal`로 통합. 서비스키 신청도 `culture_portal` 하나만 진행하면 됨 (data.go.kr 데이터셋 id 15138937 페이지에서 활용신청)
  - `seoul_culture_event`(서울 열린데이터광장 문화행사 정보) — base_url=`http://openapi.seoul.go.kr:8088`(서울 열린데이터광장 공통 URL 패턴: `{base_url}/{인증키}/json/culturalEventInfo/{시작index}/{종료index}`)
    - **어댑터 구현 완료** (`src/adapters/seoulCultureEvent.ts`), 2026-07-05 더미 키 `sample`로 실사용 검증. 인증키를 쿼리파라미터가 아니라 **URL 경로**에 넣는 방식(다른 소스와 다름). HTTPS 미지원(포트 8088, HTTP만 가능)
    - 응답 필드: `CODENAME`(분류)/`GUNAME`(자치구)/`TITLE`/`PLACE`/`USE_FEE`/`MAIN_IMG`/`STRTDATE`·`END_DATE`('YYYY-MM-DD HH:MM:SS.f')/`PRO_TIME`/`HMPG_ADDR`(상세링크, `cultcode` 쿼리값을 external_id로 사용). `regionSido`는 서울 고정
    - **데이터 품질 이슈**: 에러 응답이 `/json/` 요청에도 XML(`<RESULT><CODE>...`)로 오는 경우가 있어 방어 로직 추가 (텍스트가 `<`로 시작하면 정규식으로 CODE/MESSAGE 추출)
    - **정식 인증키 필요**: data.seoul.go.kr 회원가입 후 즉시 자동 발급(승인 대기 없음), 1회 최대 1,000건. 더미 키 `sample`은 1~5 범위로만 조회 가능해 실제 페이지네이션(전체 19,372건) 테스트는 정식 키 발급 후 진행 필요
- (구현 현황) 산업(IND) 3개 소스도 `exh_sources`에 등록 완료 (4.1 참고):
  - `worknet_job_fair`(한국고용정보원 워크넷 채용행사 정보, realtime_api) — End Point 확정: `http://openapi.work.go.kr/opi/opi/opia/empEventApi.do` (더미 키로 실제 호출해 확인, 2026-07-05). 어댑터는 원본 저장까지만 구현(`src/adapters/worknetJobFair.ts`), 응답 필드 미검증이라 `normalize()` 미구현
    - **보류 (2026-07-05, 사용자 요청).** 고용24 Open-API는 "**기업회원 전용** 서비스"이며 신청 후 **담당자 심사**를 거쳐야 발급(KOPIS와 같은 유형의 장벽 — 개인 계정으로 신청 가능한지 불확실, 즉시발급 아님). 사업자 계정 확보되거나 개인 신청 가능 여부 확인되면 재개
  - `motie_trade_fair`(산업통상자원부 국내 전시회 데이터, file_data) — base_url=`https://www.data.go.kr/data/3074097/fileData.do`, 갱신 주기 미확인(call_interval_minutes 비워둠)
  - `at_agrifood_fair`(한국농수산식품유통공사(aT) 행사현황, file_data) — base_url=`https://www.data.go.kr/data/15034395/fileData.do`, 갱신 주기 미확인(call_interval_minutes 비워둠)

### 4.1 산업(IND) 대분류 후보 소스

| 중분류 | 후보 소스 | 형태 | 비고 |
|---|---|---|---|
| IND_JOB (취업/채용박람회) | 한국고용정보원 워크넷 채용행사 API ([data.go.kr/data/15031948](https://www.data.go.kr/data/15031948/openapi.do)) | **실시간 오픈API** (RestAPI, JSON/XML) | 채용행사명·기간·장소·참여기업 채용정보 제공 — 기존 소스와 동일한 방식으로 배치 연동 가능 |
| IND_TRADEFAIR (산업/무역박람회) | 산업통상자원부 국내 전시회 데이터 ([data.go.kr/data/3074097](https://www.data.go.kr/data/3074097/fileData.do)) | **파일데이터** | 전시회명·주최기관·기간·장소·참가업체 수·참관객 수 등 포함, 실시간 API 아님 |
| IND_AGRIFOOD (농수산식품박람회) | 한국농수산식품유통공사(aT) 행사현황 ([data.go.kr/data/15034395](https://www.data.go.kr/data/15034395/fileData.do)), 농림축산식품 공공데이터포털 ([data.mafra.go.kr](https://data.mafra.go.kr/)) | 파일데이터 + 오픈API 신청형 | 농어촌박람회 등은 이쪽에 매핑. mafra.go.kr은 별도 활용신청 필요 |
| ~~IND_ECONOMY (경제/비즈니스 행사)~~ | 미확인 | — | **1차 범위 제외 확정.** 표준화된 공공 오픈API를 찾지 못함. 이후 개별 기관(상공회의소·창업진흥원 등) 재조사 시 재검토 |

- IND_TRADEFAIR/IND_AGRIFOOD는 **실시간 API가 아니라 파일데이터**이므로, 수집 배치 설계 시 "정기 파일 다운로드 + 파싱" 방식을 별도 유형으로 반영해야 한다 (5.1 참고).
- (참고) KOTRA 해외전시회 정보([data.go.kr/data/15003367](https://www.data.go.kr/data/15003367/fileData.do))도 존재하나 국내 산업행사 범위 밖(해외 전시)이라 이번 서비스 범위와는 다름.

## 5. 시스템 아키텍처 개요

```
[소스별 API 클라이언트] → [수집 배치] → [정규화/카테고리 매핑] → [Supabase DB] → [서비스 API] → [화면(웹)]
                                              ↑
                                   [카테고리 매핑 규칙 / 보정]
```

- **수집 배치**: 소스별 스케줄(cron)로 목록/상세 API 호출, rate limit 대응(호출 간격, 재시도, 백오프)
- **정규화**: 소스마다 다른 필드명·값 체계를 공통 스키마로 매핑 (예: 장르 코드 상이 → 공통 카테고리 코드로 변환)
- **DB 등록/업데이트**: 소스별 원본 식별자를 기준으로 upsert, 기간 종료된 항목은 상태 전환(종료 처리)
- **서비스 계층**: 정규화된 DB만 조회하여 응답 (외부 API 실시간 호출 없음)

## 6. 기능 요구사항

### 6.1 데이터 수집
- 소스별 어댑터를 두어 API 스펙 변경 시 해당 어댑터만 수정 가능한 구조로 분리
- 소스별 호출 주기 설정 가능 (예: KOPIS 목록 1일 1회, 상세는 변경분만)
- 소스 유형은 **실시간 오픈API**와 **파일데이터(정기 다운로드·파싱)** 두 가지로 구분하여 어댑터를 설계 (IND_TRADEFAIR/IND_AGRIFOOD 등 파일데이터 소스 대응)
- 실패 시 재시도 및 실패 로그 기록 (소스, 시각, 사유)

### 6.2 데이터 정규화 및 카테고리화
- 공통 카테고리 체계 정의: 대분류(전시/공연), 중분류(장르: 뮤지컬/연극/클래식/무용/미술전시/박물관 등), 지역, 상태(예정/진행중/종료)
- 소스별 원본 카테고리 값 → 공통 카테고리 매핑 테이블 관리 (신규 미매핑 값 발생 시 운영자 확인 큐에 적재)
- 동일 행사가 복수 소스에 중복 노출되는 경우의 중복 판별 기준 필요 (제목+기간+장소 유사도 등) — 상세 로직은 별도 정의

### 6.3 DB 관리
- 신규 등록 / 필드 업데이트 / 종료 처리(soft delete 또는 상태값 변경)
- 소스 원본 ID, 원본 payload 원문 보관 (재정규화 대비)
- 데이터 변경 이력(최소 수집 시각) 기록

### 6.4 화면 서비스
- 목록 화면: 카테고리 필터, 지역 필터, 기간(진행중/예정/종료) 필터, 검색어
- 상세 화면: 제목, 기간, 시간, 장소, 관람료, 이미지, 원본 출처 링크
- 일정 기준 화면: 캘린더 또는 기간별 정렬 뷰
- (관리자) 수집 배치 현황, 소스별 최근 수집 시각/실패 건수, 미매핑 카테고리 큐

## 7. 데이터 모델 (Supabase)

### 7.0 네이밍 규칙

연결된 Supabase 프로젝트(`peterbae0311's Project`)는 이 서비스 전용이 아니라 여러 개인 프로젝트가 공유하는 프로젝트이며, 이미 `categories`/`subcategories`/`sources`/`articles`(별도 뉴스 요약 앱) 테이블이 존재한다. 이름 충돌을 피하기 위해 이 서비스의 모든 테이블은 **`exh_` 접두어**를 사용한다.

### 7.1 테이블

- `exh_sources`: 소스 정의 — code(unique), name, provider, domain(`culture`/`industry`), fetch_type(`realtime_api`/`file_data`), base_url, call_interval_minutes, is_active
- `exh_categories`: 공통 카테고리 마스터(대/중분류 계층) — code(PK), parent_code(자기참조 FK, 대분류는 null), name, level(1=대분류/2=중분류), sort_order, is_active
- `exh_category_mappings`: 소스별 원본 카테고리 값 ↔ 공통 카테고리 코드 매핑 — source_id, raw_value, mapped_category_code, is_confirmed(미확정 시 운영자 확인 큐 대상)
- `exh_venues`: 장소/시설 마스터 — source_id, external_id, name, address, region_sido, region_sigungu, latitude, longitude
- `exh_raw_items`: 소스별 원본 수집 데이터(최신본 upsert) — source_id, external_id, payload(jsonb), collected_at
- `exh_events`: 정규화된 전시/공연/산업행사 항목 — source_id, external_id, title, category_code(FK→exh_categories), region_sido, region_sigungu, start_date, end_date, event_time, venue_id, price_info, image_url, source_url, first_seen_at, last_synced_at
- `exh_sync_logs`: 배치 실행 이력 — source_id, started_at, finished_at, status, processed_count, failed_count, error_message

### 7.2 진행상태(예정/진행중/종료)

`exh_events`에 상태를 컬럼으로 저장하지 않는다(날짜가 지나면 값이 바로 stale해짐). 대신 `start_date`/`end_date` 기준으로 상태를 계산하는 뷰 `exh_events_status`를 둔다.

### 7.3 RLS 정책 방향

- 사용자에게 노출되는 조회 대상(`exh_events`, `exh_venues`, `exh_categories`)은 RLS를 켜고 익명 SELECT를 허용한다.
- 운영/내부 테이블(`exh_sources`, `exh_category_mappings`, `exh_raw_items`, `exh_sync_logs`)은 RLS를 켜되 익명 SELECT 정책을 두지 않는다 — 수집 배치는 anon key가 아닌 service role key로 접근해 RLS를 우회하는 구조를 전제한다.

실제 DDL은 `supabase/migrations/0001_init_exh_schema.sql`에 작성했다.

## 8. 비기능 요구사항

- **성능**: 화면 서비스는 외부 API를 직접 호출하지 않고 자체 DB만 조회 (응답 지연 최소화)
- **안정성**: 소스 API 장애/스펙 변경 시 해당 소스만 실패 처리되고 전체 배치에 영향 없도록 격리
- **Rate Limit 대응**: 소스별 호출 간격 제어, 초과 시 대기/재시도
- **보안**: API 인증키는 환경변수(`.env`)로 관리하며 코드/커밋에 노출 금지
- **확장성**: 신규 소스 추가 시 기존 정규화 로직 변경 없이 어댑터만 추가하는 구조

## 9. 기술 스택 (현재 프로젝트 설정 기준)

- **DB/백엔드**: Supabase (`SUPABASE_URL`, `SUPABASE_ANON_KEY`)
- **LLM 활용 (선택)**: 카테고리 매핑 보정, 원문 요약/정제 등에 필요 시 OpenRouter / Groq / Gemini API 활용 가능 (`.env`에 키 구성됨)
- **프론트엔드**: Next.js(App Router) + React + Tailwind CSS v4, `web/` 하위에 별도 프로젝트로 구현(수집기 `src/`와 분리). 폰트는 `next/font/google`의 Noto Sans KR
- **수집 배치**: Node.js/TypeScript, 로컬/서버 스크립트 + OS 스케줄러(cron/작업 스케줄러)로 실행. `npm run sync -- <source_code|all>`

### 9.2 프론트엔드 구현 현황 (2026-07-05)

- **구조**: `web/app/page.tsx`(목록+캘린더+검색 통합, `searchParams` 기반), `web/app/events/[id]/page.tsx`(상세), `web/app/admin/page.tsx`(관리자). 필터/카드/페이지네이션/캘린더는 `web/components/`, 데이터 조회는 `web/lib/data.ts`
- **인증키 분리**: 공개 페이지는 anon key(`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `lib/supabase.ts`), 관리자 페이지는 RLS로 anon 접근이 막힌 `exh_sources`/`exh_sync_logs`/`exh_category_mappings`를 읽어야 해서 service role key 전용 서버 클라이언트(`lib/supabase-admin.ts`, `server-only` 패키지로 클라이언트 번들 유입 방지)로 분리
- **필터/검색/뷰 전환은 전부 URL 쿼리스트링 기반의 서버 컴포넌트 + `<Link>`로 구현** — 클라이언트 상태나 `useSearchParams` 없이 대분류 탭, 중분류 다중선택, 지역, 진행상태, 검색어, 카드/캘린더 뷰, 페이지네이션 전부 새로고침 없는 네비게이션으로 동작. 모바일 필터는 JS 없이 `<details>`로 바텀시트 대체
- **Playwright로 실제 브라우저 검증 완료**: 목록/캘린더/검색/상세/관리자/모바일(390px)/다크모드(prefers-color-scheme) 전부 실데이터로 확인
- **실제 데이터로 검증하다가 발견/수정한 버그 3건**:
  1. 기본 목록이 `start_date` 오름차순 정렬 때문에 수십 년 전 "종료"된 전시부터 노출됨 → 상태 미지정 시 종료 이벤트를 기본 제외하도록 쿼리 변경, `status=all`로 명시해야 종료 포함 전체 조회
  2. `end_date`가 없는 이벤트를 SQL 필터는 "무기한 유효"로, 화면 배지 계산(`computeStatus`)은 "당일 종료"로 서로 다르게 해석해 종료된 단발성 이벤트가 필터를 통과하던 불일치 → 두 로직 모두 `end_date ?? start_date` 기준으로 통일
  3. 문화공공데이터광장 등 일부 원본 데이터가 이중 이스케이프되어 있어(`&amp;lt;` → 파서가 한 번만 풀어 `&lt;`가 문자 그대로 남음) 제목에 `&lt;...&gt;`가 그대로 노출 + `EVENT_PERIOD` 필드의 `<br>` 태그도 문자 그대로 노출 → `decodeEntities`/`toMultiline` 유틸로 표시 직전 처리 (수집기 쪽 근본 수정은 아직 미반영)
  4. `/admin`이 `searchParams`/쿠키 등 요청시점 API를 안 써서 Next.js가 빌드 시점에 정적 프리렌더— 운영 대시보드가 스냅샷에 고정되는 문제라 `export const dynamic = "force-dynamic"`으로 강제 동적화
- **알려진 제한**: 지도 표시는 자리만 마련(좌표 select 미포함), 관리자 화면은 조회 전용(매핑 확정/재동기화 트리거 버튼은 UI만, 액션 미구현)
- **기타**: `create-next-app`이 `web/` 안에 별도 git 저장소를 자동 생성함(`web/.git`) — 상위 프로젝트는 git 미초기화 상태라 중첩 저장소로 남아있음, 필요 시 정리 필요

### 9.1 수집 어댑터 구현 현황

- `src/adapters/kopis.ts`: **구현 완료, 실사용 미검증.** 응답 필드는 실사용 사례 기반 추정(mt20id/prfnm/prfpdfrom/prfpdto/fcltynm/genrenm/area/poster) — KOPIS 서비스키를 아직 못 받아 실제 호출 테스트는 못 함
- `src/adapters/culturePortal.ts`: **완전 구현 + 실사용 검증 완료.** 실제 서비스키로 744건 조회·정규화·DB 적재까지 end-to-end 성공 (processed=744, failed=0)
- 나머지 6개 소스는 `src/adapters/registry.ts`에 미등록 — base_url/응답 스키마 확인 후 어댑터 추가
- 공통 파이프라인(`src/pipeline/syncSource.ts`): raw_items upsert → 카테고리 매핑 조회/미확정 시 fallback 분류 후 확인 큐 적재 → venues upsert → events upsert → sync_logs 기록
- 신규 환경변수: `SUPABASE_SERVICE_ROLE_KEY`(운영 테이블 쓰기용, RLS 우회), `KOPIS_SERVICE_KEY`, `CULTURE_PORTAL_SERVICE_KEY` — `.env`에 빈 값으로 추가해둠, 실제 값은 발급 후 채워야 함

## 10. 단계별 개발 계획 (제안)

- **Phase 1**: KOPIS + 문화포털 연동, 공통 스키마 정의(문화 대분류 중심), 기본 목록/상세 화면
- **Phase 2**: 문화공공데이터광장·공공데이터포털·서울 열린데이터광장 소스 추가, 중복 판별 로직 고도화
- **Phase 3**: 산업(IND) 대분류 연동 — 워크넷 채용행사 API(실시간), 산업통상자원부 국내전시회·aT 행사현황(파일데이터) 3개 소스 추가. IND_ECONOMY는 소스 미확보로 제외
- **Phase 4**: 관리자 모니터링 화면, 카테고리 매핑 큐 UI, 검색/캘린더 뷰 고도화

## 11. 리스크

- 기관별 인증키 발급 승인 소요 시간
- 소스별 필드 스키마·값 체계 상이로 인한 정규화 난이도
- 동일 행사의 다중 소스 중복 게재 판별 정확도
- API 스펙 변경(비공지)에 따른 수집 실패 가능성

## 12. 확인 필요 사항 (Open Questions)

- 중복 행사 판별 기준(유사도 임계값) 정의 방식
- 프론트엔드 기술 스택 및 배포 환경
- 관리자 화면 필요 범위(운영 인력 유무에 따라)
- 부록 A 중분류의 실제 소스별 원본 코드값(KOPIS genre 코드, 문화포털 realm 코드 등) 확인 및 `category_mappings` 반영
- `worknet_job_fair`는 사용자 요청으로 보류 중 (2026-07-05) — 고용24 Open-API가 기업회원 전용 + 담당자 심사 필요, 개인 신청 가능 여부 확인되면 재개
- `culture_data_plaza_perf`는 사용자 요청으로 보류 중 (2026-07-05) — 날짜필터 없음/전량 283,445건 문제, 페이지네이션 전략 없이는 재개 안 함
- KOPIS는 사용자 요청으로 보류 중 (2026-07-05) — 회원가입 가능 여부 확인되면 재개
- 대량 소스(수천 건 이상) 동기화 시 `syncSource.ts`의 건별 순차 DB 호출(raw_items→category→venue→event, 최대 4회/건) 성능 — 항목 수가 늘어나면 배치 upsert로 리팩터링 검토 필요
- `motie_trade_fair`, `at_agrifood_fair` 파일데이터의 실제 갱신 주기 확인 (현재 `call_interval_minutes` 비어있음, 11장 리스크 항목과 동일 이슈)
- 지역축제성 행사가 문화(FEST_LOCAL)인지 산업(IND_TRADEFAIR/IND_AGRIFOOD)인지 애매한 경우의 판별 기준 (예: 농산물+공연이 결합된 축제)
- 산업통상자원부/aT 파일데이터의 실제 갱신 주기 확인 (배치 스케줄 설계 전제)

## 부록 A. 공통 카테고리 체계 (대/중분류 초안)

대분류는 **산업(INDUSTRY) / 문화(CULTURE)** 2개 축으로 구성한다. 산업=일자리·산업·경제 관련 행사, 문화=산업 이외 전시·공연·축제 전반으로 정의한다 (기존 공연/전시/축제/행사 3분류는 문화 대분류 아래 중분류 그룹으로 통합). 중분류는 각 소스의 일반적인 장르/분야 구분을 참고해 초안으로 작성했으며, **실제 소스별 원본 코드값은 API 응답을 받아본 뒤 `category_mappings` 테이블에 확정 매핑해야 한다** (코드값을 지금 단정하지 않음).

### 대분류 1. 산업 (IND)

| 중분류 코드 | 중분류명 | 비고 |
|---|---|---|
| IND_TRADEFAIR | 산업/무역박람회 | 일반 산업 전시회, 무역박람회 |
| IND_AGRIFOOD | 농수산식품박람회 | 농어촌박람회 등 농수산/식품 관련 박람회 |
| IND_JOB | 취업/채용박람회 | |
| ~~IND_ECONOMY~~ | 경제/비즈니스 행사 | **1차 범위 제외.** 컨퍼런스, 설명회, 창업 관련 행사 등 — 표준 오픈API 미확보 |
| IND_ETC | 기타 산업행사 | 위 분류에 속하지 않는 산업/경제 관련 행사 |

> 산업(IND) 대분류는 워크넷 채용행사 API(IND_JOB, 실시간), 산업통상자원부 국내전시회·aT 행사현황(IND_TRADEFAIR/IND_AGRIFOOD, 파일데이터) 3개 소스로 채운다 (4.1 참고, Phase 3). IND_ECONOMY는 표준 소스를 찾지 못해 1차 범위에서 제외한다.

### 대분류 2. 문화 (CULTURE)

기존 공연·전시·축제/행사 구분을 중분류 그룹으로 유지한다 (코드 접두어로 계열 구분).

**공연 계열 (PERF_)**

| 중분류 코드 | 중분류명 | 비고 |
|---|---|---|
| PERF_PLAY | 연극 | |
| PERF_MUSICAL | 뮤지컬 | |
| PERF_DANCE | 무용/발레 | |
| PERF_CLASSIC | 클래식/서양음악 | 관현악, 실내악, 독주회 등 |
| PERF_TRAD | 국악/전통예술 | |
| PERF_OPERA | 오페라 | |
| PERF_POPMUSIC | 대중음악/콘서트 | |
| PERF_MULTI | 복합/기타 공연 | 서커스, 마술, 아동극, 복합장르 등 |

**전시 계열 (EXPO_)**

| 중분류 코드 | 중분류명 | 비고 |
|---|---|---|
| EXPO_ART | 미술(회화) | 서양화, 한국화, 동양화 포함 |
| EXPO_PHOTO | 사진 | |
| EXPO_SCULPTURE | 조각/설치 | |
| EXPO_CRAFT | 공예/디자인 | |
| EXPO_MEDIA | 미디어아트/뉴미디어 | |
| EXPO_CALLIGRAPHY | 서예 | |
| EXPO_HISTORY | 역사/유물 | 박물관 소장품·특별전 등 |
| EXPO_SCIENCE | 자연사/과학 | |
| EXPO_MULTI | 복합/기타 전시 | ① 장르 혼합(비엔날레·융복합아트·건축전·아카이브전 등 단일 중분류로 특정하기 어려운 전시), ② 매핑 미확정 원본값의 임시 분류(운영자 확인 큐 대상) — ②가 다수라면 매핑 작업 적체 신호로 간주 |

**축제/행사 계열 (FEST_)**

| 중분류 코드 | 중분류명 | 비고 |
|---|---|---|
| FEST_LOCAL | 지역축제 | 지자체 주관 축제 (문화 성격, 산업박람회 성격이면 IND_TRADEFAIR/IND_AGRIFOOD로) |
| FEST_TRAD | 전통/민속행사 | |
| FEST_EXPERIENCE | 체험/참여행사 | 마켓, 체험프로그램 등 |
| FEST_ETC | 기타행사 | 위 분류에 속하지 않는 문화행사 |

### 카테고리 외 별도 관리 항목 (참고)

다음은 "카테고리"가 아니라 별도 마스터 데이터 또는 필터 축으로 관리하는 것을 권장한다.

- **장소/시설**: KOPIS 공연시설, 문화포털 문화예술공간 등 → 별도 `venues` 테이블 (주소, 좌표 포함)
- **지역**: 시/도, 시/군/구 단위 필터 축 (카테고리와 별개의 검색 조건)
- **진행상태**: 예정/진행중/종료 — 카테고리가 아니라 날짜 기반 계산 값

### 매핑 운영 방식

1. 소스별 원본 카테고리/장르 값을 그대로 `raw_items.payload`에 보관
2. `category_mappings(source_id, raw_value, mapped_category_code)`에 매핑 규칙 등록
3. 정규화 배치 시 매핑 테이블 조회 → 없으면 `EXPO_MULTI`/`PERF_MULTI` 등 임시 분류 후 운영자 확인 큐에 적재
4. 운영자가 신규 원본 값에 대한 매핑을 확정하면 이후 배치부터 자동 반영
