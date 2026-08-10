# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## hub의 역할 (모노레포 전체 아키텍처)

`hub`는 `peterbae.duckdns.org` 전체의 SSO 게이트 겸 앱 허브다.

* nginx가 모든 요청 앞단에서 `auth_request`로 `hub`의 `/api/auth/verify`(`src/app/api/auth/verify/route.ts`)를 호출해 로그인 여부와 앱별 접근 권한을 확인한다. `X-Original-URI` 헤더의 첫 path segment를 app_key로 판별한다.
* 로그인은 Supabase Auth 기반 이메일 OTP(`src/app/login/page.tsx`) — 비밀번호 없음. 이메일 입력 → `signInWithOtp({shouldCreateUser:false})`로 8자리 코드 발송(미등록 이메일은 계정이 새로 만들어지지 않고 차단) → `verifyOtp({email, token, type:'email'})`로 검증. 코드 자릿수(8자리)·만료 시간(60초)은 Supabase Dashboard의 Auth > Emails 설정값이 기준이며 코드로 제어할 수 없다. **주의**: Supabase가 로컬파트에 "test"가 포함된 이메일(`testing@gmail.com`, `testing2@gmail.com` 등)을 스팸 방지용으로 자동 차단해 "email is invalid" 오류를 낸다(실측 확인) — 이 두 계정은 OTP 로그인이 원천적으로 안 되므로 QA 계정이 필요하면 다른 이름으로 새로 만들 것. 앱별 접근 권한은 Supabase `app_access` 테이블(email + app_key)로 관리.
* `SUPER_ADMIN_EMAIL`(`src/lib/apps.ts`, `peter.bae0311@gmail.com`)은 모든 앱/모든 검사를 통과하는 전역 관리자 계정.
* 앱 목록은 `src/lib/apps.ts`의 `APPS` 배열에 등록. key는 nginx location의 첫 path segment와 반드시 일치해야 한다.
* 배포: GitHub Actions에서 빌드(서버가 물리 RAM 500MB라 서버에서 직접 `next build`하면 OOM) → SSH로 산출물 전송 → `deploy/remote-swap.sh`가 새 디렉토리 준비 후 원자적 `mv` 교체 → `pm2 reload`. 인프라는 Oracle Cloud 컴퓨트 인스턴스(무료 티어) + DuckDNS.
* **hub에 새 경로(페이지/API)를 추가할 때 실측으로 확인한 함정 2가지** (good-words 배포 때 발견, 2026-08-10):
  1. GitHub Actions의 `HUB_ENV` secret은 **빌드 시점에만** 쓰인다(`echo "$HUB_ENV" > .env` 후 `next build`). `remote-swap.sh`는 서버에 이미 있는 `~/apps/hub/.env`를 새 배포에도 그대로 복사해 유지하고, 빌드 아티팩트(tar)에는 `.env`가 아예 포함되지 않는다 — 즉 `HUB_ENV`를 갱신하고 재배포해도 서버에서 실제로 도는 프로세스의 환경변수는 안 바뀐다. 새 서버 전용 환경변수(Oracle 계정 등)를 추가했다면 **SSH로 `~/apps/hub/.env`를 직접 수정하고 `pm2 reload hub --update-env`까지 해야** 반영된다.
  2. hub 내부 통합 앱(`/dashboard`, `/admin`, `/api/image-slideshow/` 등)은 각각 `/etc/nginx/nginx.conf`(서버에만 있음, git 미추적)에 개별 `location /경로 { proxy_pass http://127.0.0.1:4006; ... }` 블록이 있어야 nginx가 요청을 hub로 전달한다. 새 경로를 추가했는데 이 블록이 없으면 nginx가 자체 404(Oracle Linux 기본 404 페이지)를 낸다 — hub 코드/배포가 정상이어도 겉으로는 "안 됨"으로 보인다. 새 hub 내부 페이지/API 경로를 추가할 때마다 이 location 블록을 잊지 말 것(수정 전 `sudo cp nginx.conf nginx.conf.bak-<날짜>-<설명>`으로 백업 → 편집 → `sudo nginx -t` → `sudo systemctl reload nginx`).
* `image_slideshow`처럼 원래 독립 정적 사이트였던 앱을 hub 내부로 통합할 때는, 프론트는 정적 파일 그대로 두고 Oracle DB 연동이 필요한 API만 `src/app/api/<app>/` 라우트로 hub에 흡수하는 패턴을 썼다. `good-words`(좋은글)는 처음부터 hub 내부 앱으로 신규 개발하므로 프론트도 `src/app/good-words/`의 정식 Next.js 페이지로 만든다(정적 사이트 이중화 불필요).
* Oracle DB(`oracledb` 드라이버) 사용 시 `next.config.js`의 `serverExternalPackages: ['oracledb']`가 이미 설정되어 있음 — 안 하면 라우트별로 별도 인스턴스가 번들링되어 NJS-012(invalid bind data type) 오류가 난다.

## good-words (좋은글) 앱 — 구현 상태

카테고리별로 좋은 글(위로가 되는 짧은 글)을 제공하는 반응형 웹 앱. hub 내부의 새 앱으로 개발했다 (`shopping-listapp` 저장소를 교체하려던 기존 계획은 폐기 — 해당 폴더는 삭제됨).

**코드/DB 모두 구현 완료.** `src/lib/apps.ts`에 등록됨, `src/app/good-words/page.tsx` + `SlideshowViewer.tsx`, `src/app/api/good-words/{route.ts,[id]/route.ts,generate/route.ts}`, `src/lib/goodWords/*` 모두 작성 완료. LLM 생성(`/api/good-words/generate`)은 Oracle 없이도 바로 동작한다 — 환경변수를 LLM용(`env.ts`, 없으면 그 provider만 실패)과 Oracle용(`oracleEnv.ts`, `required()`로 즉시 throw)으로 분리해뒀기 때문.

DB 인스턴스는 새로 만들지 않고 image_slideshow가 쓰는 eungmomoa-db를 그대로 공유하기로 결정했다(Always Free 슬롯 절약 + 지갑 파일 하나만 관리하면 되는 이점이, 물리적 인스턴스 분리로 얻는 격리 효과보다 크다고 판단 — 어차피 두 기능이 같은 hub 프로세스에서 돈다). 그래서 `GOOD_WORDS_ORACLE_CONNECT_STRING`/`WALLET_LOCATION`/`WALLET_PASSWORD`는 없고, `oracleEnv.ts`가 `IMAGE_SLIDESHOW_ORACLE_*` 키를 그대로 재사용한다. good-words 전용으로 새로 발급한 값은 그 DB 안의 전용 스키마 계정 2개(`GOOD_WORDS_ORACLE_USER=goodwords`/`PASSWORD`)뿐 — OCI 콘솔 → eungmomoa-db → Database Actions(SQL Developer Web, ADMIN으로 SSO 접속)에서 `CREATE USER goodwords ...` 실행 후 `ALTER SESSION SET CURRENT_SCHEMA = goodwords`로 전환해 `oracle/good-words-schema.sql` 실행 완료(2026-08-10). `.env.local`에는 값이 채워져 있고, **GitHub Actions의 `HUB_ENV` secret에도 반영해야 다음 배포부터 보관함 조회/저장/삭제가 실제로 동작한다** — 반영 전까지는 500 에러(의도된 동작, image_slideshow의 eager-required() 패턴과 동일).

* DB 인스턴스/지갑은 image_slideshow와 공유하지만, 접속 계정(스키마)이 다르므로 커넥션 풀은 여전히 분리한다 — `poolAlias: 'good-words'`로 image_slideshow의 default 풀과 섞이지 않게 한다(oracleDb.ts 주석 참고, alias 없이 만들면 NJS-046 충돌로 잘못된 풀을 재사용하게 됨).
* 콘텐츠 가드레일(`src/lib/goodWords/guardrail.ts`)은 키워드 기반 휴리스틱이다 — 정치/혐오/공격 표현은 대표 키워드 목록으로, "비교 금지"는 명시적 우열·등수 비교 표현만 우선 차단한다(정확한 판단 기준은 아래 미결정 사항 참고).

### 기능

1. 카테고리
   * 유형: 위로, 사랑, 가족, 인생, 인간관계, 용기, 감사, 쉼
   * '생성' 버튼 → LLM 실시간 생성으로 유형에 맞는 글 30개 생성
   * 생성된 글 중 선택하여 공유 보관함에 저장 또는 삭제

2. 좋은글 콘텐츠
   * 길이: 150~200자
   * 금지: 정치, 혐오, 비교, 공격적 표현
   * 지향: 따뜻함, 공감, 희망, 여운, 위로
   * 생성 직후 1차 필터링 + 저장 시점 2차 검증, 2단계 가드레일

3. 계정/데이터 소유권
   * 로그인 필요 (hub의 기존 Supabase Auth 이메일/비밀번호 그대로 사용, 별도 auth 구현 불필요)
   * 저장된 글은 사용자별로 격리되지 않는 **전체 공유 보관함**(글로벌 테이블, 사용자별 FK 불필요)
   * 삭제는 `peter.bae0311@gmail.com`만 가능 → hub에 이미 있는 `SUPER_ADMIN_EMAIL` 상수를 그대로 검사에 재사용

4. 슬라이드쇼 뷰어
   * 반응형 웹 단일 구현 (네이티브 앱/PWA/웹뷰 없음)
   * 시간 설정에 따라 자동으로 다음글 이동
   * 브라우저 내장 TTS(Web Speech API 등, 무료)로 읽어주기, 음소거 토글
   * 브라우저 미지원 시 텍스트만 표시하는 graceful degradation 필요
   * 뷰어 화면은 전체화면 몰입형 단일 카드 레이아웃, 목록형 화면(카테고리/보관함)은 40:60 분할 기본 원칙

### 기술 스택 / 환경변수

* DB: 오라클 클라우드 DB — image_slideshow의 eungmomoa-db 인스턴스 공유, 전용 스키마 계정만 신규 발급 필요(위 참조)
* LLM 생성: 실시간 생성 + 멀티 프로바이더 폴백 체인 — 1차 OpenRouter → 2차 Groq → 3차 Hugging Face
* 키는 `hub/.env.local`의 `GOOD_WORDS_OPENROUTER_API_KEY`, `GOOD_WORDS_GROQ_API_KEY`, `GOOD_WORDS_HF_TOKEN`에서 로드 (하드코딩 금지, git 커밋 금지)

### 보안

* 저장/삭제 등 모든 쓰기 작업은 서버 측에서 로그인 여부를 반드시 인가 체크 (프론트엔드 숨김만으로는 보안 확보 불가)
* 공유 보관함이므로 오남용 방지를 위해 삭제는 소프트 삭제 + 로그 기록 권장

### 미결정 사항 (Open Questions)

* 정량적 목표(사용 목표 등), 타겟 사용자 페르소나 상세
* ~~슬라이드쇼 자동 넘김 기본 시간값 및 설정 범위~~ → 구현 시 기본 8초, 3~30초 슬라이더로 잠정 결정(`SlideshowViewer.tsx`). 필요시 조정.
* "비교" 금지 표현의 정확한 판단 기준 (타인과의 비교만인지, 모든 비유적 비교 포함인지) — 현재는 휴리스틱으로 명시적 우열/등수 비교만 차단 중(`guardrail.ts`)
