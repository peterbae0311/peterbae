import { XMLParser } from 'fast-xml-parser';
import { getSourceServiceKey } from '../lib/env.js';
import type { RawFetchItem, NormalizedEvent, SourceRow } from '../lib/types.js';
import type { SourceAdapter } from './types.js';

// End Point: https://apis.data.go.kr/B553457/cultureinfo/period2 (data.go.kr 활용신청 상세 "요청변수" 화면으로 확인, 2026-07-05)
// 파라미터: serviceKey, PageNo, numOfrows, from, to (그 외 keyword/gpsxfrom.../serviceTp는 선택)
// serviceTp: A=공연/전시, B=행사/축제, C=교육/체험 — 문화/공연 서비스 범위이므로 'A'로 고정
// 응답 구조(2026-07-05 실제 응답으로 확인):
//   response.body.items.item[] : { seq, area, gpsX, gpsY, place, title, endDate, sigungu, realmName, startDate, thumbnail, serviceName }
//   response.body.{PageNo,numOfrows,totalCount}, response.header.{resultMsg,resultCode}
const parser = new XMLParser({ ignoreAttributes: false });

const PAGE_SIZE = 100;

function yyyymmdd(d: Date): string {
  return d.toISOString().slice(0, 10).replaceAll('-', '');
}

/** 'YYYYMMDD' 숫자/문자열을 Postgres date 컬럼용 'YYYY-MM-DD'로 변환 */
function toIsoDate(raw: string): string {
  const s = raw.trim();
  if (s.length !== 8) return s;
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

interface CultureItem {
  seq?: number | string;
  area?: string;
  place?: string;
  title?: string;
  startDate?: number | string;
  endDate?: number | string;
  sigungu?: string;
  realmName?: string;
  thumbnail?: string;
  serviceName?: string;
}

export const culturePortalAdapter: SourceAdapter = {
  code: 'culture_portal',
  defaultCategoryCode: 'EXPO_MULTI',

  async fetchRaw(source: SourceRow): Promise<RawFetchItem[]> {
    if (!source.base_url) {
      throw new Error('culture_portal: exh_sources.base_url이 설정되지 않았습니다.');
    }
    const serviceKey = getSourceServiceKey(source.code);
    if (!serviceKey) {
      throw new Error(
        'culture_portal: CULTURE_PORTAL_SERVICE_KEY 환경변수가 필요합니다 (공공데이터포털 활용신청 승인 후 발급).'
      );
    }

    const today = new Date();
    const until = new Date(today);
    until.setDate(until.getDate() + 90);
    const from = yyyymmdd(today);
    const to = yyyymmdd(until);

    const items: RawFetchItem[] = [];

    for (let pageNo = 1; ; pageNo += 1) {
      const url = new URL(source.base_url);
      url.searchParams.set('serviceKey', serviceKey);
      url.searchParams.set('from', from);
      url.searchParams.set('to', to);
      url.searchParams.set('PageNo', String(pageNo));
      url.searchParams.set('numOfrows', String(PAGE_SIZE));
      url.searchParams.set('serviceTp', 'A');

      const res = await fetch(url.toString());
      if (!res.ok) {
        throw new Error(`culture_portal: 목록 조회 실패 (HTTP ${res.status}, page=${pageNo})`);
      }
      const xml = await res.text();
      const parsed = parser.parse(xml) as {
        response?: {
          body?: { items?: { item?: CultureItem | CultureItem[] }; totalCount?: number };
        };
      };

      const body = parsed.response?.body;
      const rawList = body?.items?.item;
      const list = Array.isArray(rawList) ? rawList : rawList ? [rawList] : [];
      if (list.length === 0) break;

      for (const item of list) {
        const externalId = String(item.seq ?? '').trim();
        if (!externalId) continue;
        items.push({ externalId, payload: item as unknown as Record<string, unknown> });
      }

      const totalCount = body?.totalCount ?? 0;
      if (list.length < PAGE_SIZE || items.length >= totalCount) break;
    }

    return items;
  },

  normalize(raw: RawFetchItem): NormalizedEvent | null {
    const p = raw.payload as unknown as CultureItem;
    const title = String(p.title ?? '').trim();
    const startDateRaw = String(p.startDate ?? '').trim();
    if (!title || !startDateRaw) return null;

    const endDateRaw = String(p.endDate ?? '').trim();

    return {
      externalId: raw.externalId,
      title,
      rawCategoryValue: p.realmName ? String(p.realmName).trim() : null,
      regionSido: p.area ? String(p.area).trim() : null,
      regionSigungu: p.sigungu ? String(p.sigungu).trim() : null,
      startDate: toIsoDate(startDateRaw),
      endDate: endDateRaw ? toIsoDate(endDateRaw) : null,
      eventTime: null,
      venueName: p.place ? String(p.place).trim() : null,
      priceInfo: null,
      imageUrl: p.thumbnail ? String(p.thumbnail).trim() : null,
      sourceUrl: null,
    };
  },
};
