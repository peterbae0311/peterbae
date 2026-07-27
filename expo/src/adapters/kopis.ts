import { XMLParser } from 'fast-xml-parser';
import { getSourceServiceKey } from '../lib/env.js';
import type { RawFetchItem, NormalizedEvent, SourceRow } from '../lib/types.js';
import type { SourceAdapter } from './types.js';

// 응답 필드(mt20id/prfnm/prfpdfrom/prfpdto/fcltynm/genrenm/area/poster)는
// KOPIS 공연목록 API 실사용 사례로 확인된 값. 목록 루트는 <dbs><db>...</db></dbs>.
const parser = new XMLParser({ ignoreAttributes: false });

const PAGE_SIZE = 100;
const LOOKAHEAD_DAYS = 90;

function yyyymmdd(d: Date): string {
  return d.toISOString().slice(0, 10).replaceAll('-', '');
}

/** KOPIS 날짜는 'YYYY.MM.DD' 형식으로 내려온다. Postgres date 컬럼용으로 변환. */
function toIsoDate(raw: string): string {
  return raw.trim().replaceAll('.', '-');
}

export const kopisAdapter: SourceAdapter = {
  code: 'kopis',
  defaultCategoryCode: 'PERF_MULTI',

  async fetchRaw(source: SourceRow): Promise<RawFetchItem[]> {
    if (!source.base_url) {
      throw new Error('kopis: exh_sources.base_url이 설정되지 않았습니다.');
    }
    const serviceKey = getSourceServiceKey(source.code);
    if (!serviceKey) {
      throw new Error('kopis: KOPIS_SERVICE_KEY 환경변수가 필요합니다 (공공데이터포털 활용신청 승인 후 발급).');
    }

    const today = new Date();
    const until = new Date(today);
    until.setDate(until.getDate() + LOOKAHEAD_DAYS);
    const stdate = yyyymmdd(today);
    const eddate = yyyymmdd(until);

    const items: RawFetchItem[] = [];

    for (let page = 1; ; page += 1) {
      const url = new URL(source.base_url);
      url.searchParams.set('service', serviceKey);
      url.searchParams.set('stdate', stdate);
      url.searchParams.set('eddate', eddate);
      url.searchParams.set('cpage', String(page));
      url.searchParams.set('rows', String(PAGE_SIZE));

      const res = await fetch(url.toString());
      if (!res.ok) {
        throw new Error(`kopis: 목록 조회 실패 (HTTP ${res.status}, page=${page})`);
      }
      const xml = await res.text();
      const parsed = parser.parse(xml) as {
        dbs?: { db?: Record<string, unknown> | Record<string, unknown>[] };
      };

      const dbEntry = parsed.dbs?.db;
      const list = Array.isArray(dbEntry) ? dbEntry : dbEntry ? [dbEntry] : [];
      if (list.length === 0) break;

      for (const item of list) {
        const externalId = String((item as Record<string, unknown>).mt20id ?? '').trim();
        if (!externalId) continue;
        items.push({ externalId, payload: item as Record<string, unknown> });
      }

      if (list.length < PAGE_SIZE) break;
    }

    return items;
  },

  normalize(raw: RawFetchItem): NormalizedEvent | null {
    const p = raw.payload;
    const title = String(p.prfnm ?? '').trim();
    const startDateRaw = String(p.prfpdfrom ?? '').trim();
    if (!title || !startDateRaw) return null;

    const endDateRaw = String(p.prfpdto ?? '').trim();

    return {
      externalId: raw.externalId,
      title,
      rawCategoryValue: p.genrenm ? String(p.genrenm).trim() : null,
      regionSido: p.area ? String(p.area).trim() : null,
      regionSigungu: null,
      startDate: toIsoDate(startDateRaw),
      endDate: endDateRaw ? toIsoDate(endDateRaw) : null,
      eventTime: null,
      venueName: p.fcltynm ? String(p.fcltynm).trim() : null,
      priceInfo: null,
      imageUrl: p.poster ? String(p.poster).trim() : null,
      sourceUrl: `https://www.kopis.or.kr/por/db/pblprfr/pblprfrView.do?mt20Id=${raw.externalId}`,
    };
  },
};
