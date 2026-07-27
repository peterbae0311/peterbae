// SAP 전문용어 사전: 답변에 등장하는 용어를 감지해 주석으로 추가합니다.
const GLOSSARY: [string, string][] = [
  ['BTP',           'SAP Business Technology Platform — SAP 클라우드 개발·통합 플랫폼'],
  ['RAP',           'RESTful ABAP Programming Model — OData 기반 ABAP 개발 모델'],
  ['CDS View',      'Core Data Services View — ABAP 데이터 모델링 언어, DB 뷰 정의'],
  ['ABAP',          'Advanced Business Application Programming — SAP 전용 프로그래밍 언어'],
  ['S/4HANA',       'SAP S/4HANA — HANA DB 기반 차세대 ERP 시스템'],
  ['S/4',           'SAP S/4HANA의 약칭 — HANA 기반 차세대 ERP'],
  ['ECC',           'ERP Central Component — SAP ERP 구버전 시스템 (구 R/3)'],
  ['Fiori',         'SAP Fiori — SAP UX 디자인 시스템 및 앱 프레임워크'],
  ['UI5',           'SAPUI5 — Fiori 앱 개발용 JavaScript UI 프레임워크'],
  ['OData',         'Open Data Protocol — SAP API 연동에 사용되는 RESTful 웹 서비스 표준'],
  ['BAPI',          'Business Application Programming Interface — SAP 표준 함수 모듈 인터페이스'],
  ['RFC',           'Remote Function Call — SAP 시스템 간 원격 함수 호출 메커니즘'],
  ['BAdI',          'Business Add-In — SAP 표준 프로그램 확장 인터페이스 (객체지향)'],
  ['BADI',          'Business Add-In — SAP 표준 프로그램 확장 인터페이스'],
  ['Enhancement',   'SAP Enhancement — 표준 코드 수정 없이 기능을 추가하는 확장 기법'],
  ['User Exit',     'SAP User Exit — SAP 표준 프로그램 내 사용자 정의 코드 삽입 포인트'],
  ['ALV',           'ABAP List Viewer — ABAP 리포트용 표준 그리드·목록 출력 도구'],
  ['SmartForm',     'SAP SmartForm — 인쇄·출력 양식 개발 도구'],
  ['HANA',          'SAP HANA — 인메모리 기반 고성능 데이터베이스 플랫폼'],
  ['CAP',           'Cloud Application Programming Model — SAP BTP 풀스택 앱 개발 프레임워크'],
  ['FICO',          'FI(재무회계) + CO(관리회계) — SAP 재무 통합 모듈'],
  ['EWM',           'Extended Warehouse Management — SAP 확장 창고 관리 모듈'],
  ['HCM',           'Human Capital Management — SAP 인사 관리 모듈'],
  ['IDoc',          'Intermediate Document — SAP 시스템 간 전자 문서 교환 표준 포맷'],
  ['IDocs',         'Intermediate Documents — SAP 시스템 간 전자 문서 교환 포맷 복수형'],
  ['NetWeaver',     'SAP NetWeaver — SAP 애플리케이션 서버 미들웨어 플랫폼'],
  ['PO',            'SAP Process Orchestration — SAP 통합 미들웨어 솔루션'],
  ['PI',            'SAP Process Integration — SAP 시스템 간 미들웨어 통합 솔루션'],
  ['BW',            'SAP Business Warehouse — SAP 데이터 웨어하우스 솔루션'],
  ['BW/4HANA',      'SAP BW/4HANA — HANA 기반 차세대 데이터 웨어하우스'],
  ['LSMW',          'Legacy System Migration Workbench — SAP 레거시 데이터 마이그레이션 도구'],
  ['GRC',           'Governance, Risk & Compliance — SAP 내부통제·리스크 관리 솔루션'],
  ['SuccessFactors', 'SAP SuccessFactors — 클라우드 기반 HR 관리 솔루션'],
  ['Ariba',         'SAP Ariba — 클라우드 기반 구매·조달 관리 솔루션'],
  ['SAC',           'SAP Analytics Cloud — SAP 통합 분석·BI 클라우드 플랫폼'],
  ['Datasphere',    'SAP Datasphere — SAP 데이터 통합·공유 플랫폼'],
  ['RISE',          'RISE with SAP — SAP 클라우드 전환 패키지 프로그램'],
  ['Workflow',      'SAP Workflow — 비즈니스 프로세스 자동화·승인 흐름 도구'],
  ['ABAP OO',       'ABAP Object-Oriented — SAP 객체지향 프로그래밍 방식'],
  ['CPI',           'SAP Cloud Platform Integration — SAP 클라우드 통합 플랫폼'],
  ['SCP',           'SAP Cloud Platform — SAP BTP의 이전 명칭'],
  ['BASIS',         'SAP BASIS — SAP 시스템 설치·운영·유지보수 담당 기술 영역'],
];

// 단어 경계: 영문자·숫자·한글이 아닌 위치에서만 매칭
function makeRegex(term: string): RegExp {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![a-zA-Z0-9가-힣])${escaped}(?![a-zA-Z0-9가-힣])`, 'i');
}

export function findSapTerms(text: string): [string, string][] {
  const found: [string, string][] = [];
  const seen = new Set<string>();

  for (const [term, desc] of GLOSSARY) {
    const key = term.toUpperCase();
    if (seen.has(key)) continue;
    if (makeRegex(term).test(text)) {
      found.push([term, desc]);
      seen.add(key);
    }
  }

  return found;
}

export function appendSapGlossary(answer: string): string {
  const found = findSapTerms(answer);
  if (found.length === 0) return answer;

  const notes = found.map(([term, desc]) => `• ${term}: ${desc}`).join('\n');
  return `${answer}\n\n\n[SAP 용어 참고]\n${notes}`;
}
