import { XMLParser } from 'fast-xml-parser';
import { getSourceServiceKey } from '../lib/env.js';
import { fetchWithRetry } from '../lib/http.js';
import type { RawFetchItem, NormalizedEvent, SourceRow } from '../lib/types.js';
import type { SourceAdapter } from './types.js';

// End Point: https://api.kcisa.kr/openapi/API_CCA_145/request (culture.go.kr id=598 상세페이지로 확인, 2026-07-05)
// 파라미터: serviceKey(필수), numOfRows/pageNo(선택). 날짜범위 필터 파라미터는 없음 — 전체 목록을 페이지네이션으로 수집.
// 응답 구조(실제 응답으로 확인): response.body.items.item[] — 필드는 대문자 스네이크케이스
//   TITLE, CNTC_INSTT_NM(담당기관), DESCRIPTION, IMAGE_OBJECT, LOCAL_ID(기관 내부ID, 기관 간 unique 아님),
//   URL, EVENT_SITE, GENRE, CHARGE, PERIOD('YYYY-MM-DD ~ YYYY-MM-DD'), EVENT_PERIOD(시간)
// 기관마다 LOCAL_ID가 겹칠 수 있어 external_id는 CNTC_INSTT_NM+LOCAL_ID 조합(둘 다 없으면 URL)으로 구성.
// DESCRIPTION 필드에 HTML 엔티티(&lt;, &amp; 등)가 많이 포함돼 있어 fast-xml-parser의
// 기본 entity expansion 제한(1000)에 numOfRows=500 페이지 하나로도 걸린다. 신뢰 가능한
// 정부 API 응답이므로 한도를 넉넉히 올려둔다.
const parser = new XMLParser({ ignoreAttributes: false, processEntities: { maxTotalExpansions: 1_000_000 } });

const PAGE_SIZE = 500;

interface PlazaExpoItem {
  TITLE?: string;
  CNTC_INSTT_NM?: string;
  DESCRIPTION?: string;
  IMAGE_OBJECT?: string;
  LOCAL_ID?: string | number;
  URL?: string;
  EVENT_SITE?: string;
  GENRE?: string;
  CHARGE?: string;
  PERIOD?: string;
  EVENT_PERIOD?: string;
}

/**
 * 'YYYY-MM-DD ~ YYYY-MM-DD' (공백 개수 불규칙) 형식을 [start, end]로 분리.
 * 일부 항목은 PERIOD가 순수 숫자로 내려와 fast-xml-parser가 number로 파싱하므로 String()으로 강제 변환한다.
 * '~'가 없으면 기간 형식이 아닌 것으로 보고 [null, null] 반환.
 */
function splitPeriod(value: unknown): [string | null, string | null] {
  if (value === undefined || value === null) return [null, null];
  const s = String(value).trim();
  if (!s || !s.includes('~')) return [null, null];
  const parts = s.split('~').map((p) => p.trim());
  return [parts[0] || null, parts[1] || null];
}

export const cultureDataPlazaExpoAdapter: SourceAdapter = {
  code: 'culture_data_plaza_expo',
  defaultCategoryCode: 'EXPO_MULTI',

  async fetchRaw(source: SourceRow): Promise<RawFetchItem[]> {
    if (!source.base_url) {
      throw new Error('culture_data_plaza_expo: exh_sources.base_url이 설정되지 않았습니다.');
    }
    const serviceKey = getSourceServiceKey(source.code);
    if (!serviceKey) {
      throw new Error(
        'culture_data_plaza_expo: CULTURE_DATA_PLAZA_EXPO_SERVICE_KEY 환경변수가 필요합니다 (culture.go.kr 활용신청 후 이메일로 발급).'
      );
    }

    const items: RawFetchItem[] = [];

    for (let pageNo = 1; ; pageNo += 1) {
      const url = new URL(source.base_url);
      url.searchParams.set('serviceKey', serviceKey);
      url.searchParams.set('numOfRows', String(PAGE_SIZE));
      url.searchParams.set('pageNo', String(pageNo));

      const res = await fetchWithRetry(url.toString());
      if (!res.ok) {
        throw new Error(`culture_data_plaza_expo: 목록 조회 실패 (HTTP ${res.status}, page=${pageNo})`);
      }
      const xml = await res.text();
      const parsed = parser.parse(xml) as {
        response?: { body?: { items?: { item?: PlazaExpoItem | PlazaExpoItem[] }; totalCount?: number } };
      };

      const body = parsed.response?.body;
      const rawList = body?.items?.item;
      const list = Array.isArray(rawList) ? rawList : rawList ? [rawList] : [];
      if (list.length === 0) break;

      for (const item of list) {
        const instt = item.CNTC_INSTT_NM ? String(item.CNTC_INSTT_NM).trim() : '';
        const localId = item.LOCAL_ID ? String(item.LOCAL_ID).trim() : '';
        const externalId = instt && localId ? `${instt}::${localId}` : String(item.URL ?? '').trim();
        if (!externalId) continue;
        items.push({ externalId, payload: item as unknown as Record<string, unknown> });
      }

      const totalCount = body?.totalCount ?? 0;
      if (list.length < PAGE_SIZE || items.length >= totalCount) break;
    }

    return items;
  },

  normalize(raw: RawFetchItem): NormalizedEvent | null {
    const p = raw.payload as unknown as PlazaExpoItem;
    const title = String(p.TITLE ?? '').trim();
    if (!title) return null;

    // 일부 기관은 PERIOD를 비워두고 EVENT_PERIOD에 기간을 넣는다 — PERIOD가 비어있으면 EVENT_PERIOD를 기간으로 시도
    let [startDate, endDate] = splitPeriod(p.PERIOD);
    let eventTime: string | null = null;
    if (startDate) {
      eventTime = p.EVENT_PERIOD !== undefined && p.EVENT_PERIOD !== null ? String(p.EVENT_PERIOD).trim() || null : null;
    } else {
      [startDate, endDate] = splitPeriod(p.EVENT_PERIOD);
    }
    if (!startDate) return null;

    return {
      externalId: raw.externalId,
      title,
      rawCategoryValue: p.GENRE ? String(p.GENRE).trim() || null : null,
      regionSido: null,
      regionSigungu: null,
      startDate,
      endDate,
      eventTime,
      venueName: (p.EVENT_SITE && String(p.EVENT_SITE).trim()) || (p.CNTC_INSTT_NM ? String(p.CNTC_INSTT_NM).trim() : null),
      priceInfo: p.CHARGE ? String(p.CHARGE).trim() || null : null,
      imageUrl: p.IMAGE_OBJECT ? String(p.IMAGE_OBJECT).trim() || null : null,
      sourceUrl: p.URL ? String(p.URL).trim() || null : null,
    };
  },
};
