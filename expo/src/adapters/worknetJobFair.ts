import { XMLParser } from 'fast-xml-parser';
import { getSourceServiceKey } from '../lib/env.js';
import type { RawFetchItem, NormalizedEvent, SourceRow } from '../lib/types.js';
import type { SourceAdapter } from './types.js';

// End Point: http://openapi.work.go.kr/opi/opi/opia/empEventApi.do
// 더미 authKey로 실제 호출해 경로만 확인함(2026-07-05): 응답 <empEvList><message>유효하지 않은 인증키
// 입니다.</message><messageCd>002</messageCd></empEvList> — 경로는 맞고 키만 없는 상태.
// 파라미터는 같은 워크넷 API 계열인 wantedApi.do(채용정보) 문서 예시로 유추한 값이며 이 엔드포인트에서
// 실제로 확인된 것은 아니다: authKey(필수), callTp('L'=목록), returnType('XML'), startPage, display
// 응답의 개별 항목 필드 스키마는 인증키가 없어 확인 불가 — 정식 키 발급 후 실제 응답으로 확인 필요.
// TODO: 정식 키로 실제 응답을 확인하고 normalize()를 구현할 것.
const parser = new XMLParser({ ignoreAttributes: false });

export const worknetJobFairAdapter: SourceAdapter = {
  code: 'worknet_job_fair',
  defaultCategoryCode: 'IND_JOB',

  async fetchRaw(source: SourceRow): Promise<RawFetchItem[]> {
    if (!source.base_url) {
      throw new Error('worknet_job_fair: exh_sources.base_url이 설정되지 않았습니다.');
    }
    const serviceKey = getSourceServiceKey(source.code);
    if (!serviceKey) {
      throw new Error(
        'worknet_job_fair: WORKNET_JOB_FAIR_SERVICE_KEY 환경변수가 필요합니다 (워크넷 오픈API 회원가입 후 발급).'
      );
    }

    const url = new URL(source.base_url);
    url.searchParams.set('authKey', serviceKey);
    url.searchParams.set('callTp', 'L');
    url.searchParams.set('returnType', 'XML');
    url.searchParams.set('startPage', '1');
    url.searchParams.set('display', '100');

    const res = await fetch(url.toString());
    if (!res.ok) {
      throw new Error(`worknet_job_fair: 목록 조회 실패 (HTTP ${res.status})`);
    }
    const xml = await res.text();
    const parsed = parser.parse(xml) as Record<string, unknown>;

    // 응답 구조 미검증 상태이므로 페이지 전체를 단일 raw_item으로 보관한다.
    return [{ externalId: 'page-1', payload: parsed }];
  },

  normalize(): NormalizedEvent | null {
    throw new Error(
      'worknet_job_fair: 응답 필드 스키마가 아직 검증되지 않아 normalize()가 구현되지 않았습니다. ' +
        '정식 인증키로 응답 샘플을 확인한 뒤 구현하세요.'
    );
  },
};
