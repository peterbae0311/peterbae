import { getSourceServiceKey } from '../lib/env.js';
import { fetchWithRetry } from '../lib/http.js';
import type { RawFetchItem, NormalizedEvent, SourceRow } from '../lib/types.js';
import type { SourceAdapter } from './types.js';

// End Point: https://apis.data.go.kr/B551011/KorService2/searchFestival2 (실제 호출로 확인, 2026-07-31)
// data.go.kr 계정의 공용 인증키를 쓴다 — culture_portal, kotra_overseas_fair와 동일 계정 키 재사용.
// 파라미터: serviceKey, MobileOS(필수, 임의 상수 "ETC"), MobileApp(필수, 임의 앱명), _type=json,
//   numOfRows/pageNo(페이지네이션), eventStartDate(YYYYMMDD) — 종료일이 이 날짜 이후인 축제만 반환(진행중+예정).
// 응답 구조: response.body.items.item[] — 필드는 소문자: contentid, contenttypeid(15=축제),
//   title, addr1/addr2, eventstartdate/eventenddate(YYYYMMDD), firstimage, mapx/mapy, tel,
//   lclsSystm1/2/3(자체 분류 코드), cat1/2/3(대부분 빈 값으로 내려옴 — 실제 응답 기준)
const PAGE_SIZE = 500;

interface FestivalItem {
  contentid?: string;
  title?: string;
  addr1?: string;
  eventstartdate?: string;
  eventenddate?: string;
  firstimage?: string;
  tel?: string;
  lclsSystm1?: string;
  lclsSystm2?: string;
  lclsSystm3?: string;
}

/** addr1 = '시도 시군구 상세주소...' 형식. 앞 두 토큰을 시도/시군구로 추출(다른 필드가 다 비어있어 이 방법뿐).*/
function splitAddr(addr1: string | undefined): [string | null, string | null] {
  if (!addr1) return [null, null];
  const tokens = addr1.trim().split(/\s+/);
  return [tokens[0] || null, tokens[1] || null];
}

/** 'YYYYMMDD' → 'YYYY-MM-DD' */
function toIsoDate(value: string | undefined): string | null {
  if (!value || value.length !== 8) return null;
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

export const tourApiFestivalAdapter: SourceAdapter = {
  code: 'tour_api_festival',
  defaultCategoryCode: 'FEST_LOCAL',

  async fetchRaw(source: SourceRow): Promise<RawFetchItem[]> {
    if (!source.base_url) {
      throw new Error('tour_api_festival: exh_sources.base_url이 설정되지 않았습니다.');
    }
    const serviceKey = getSourceServiceKey(source.code);
    if (!serviceKey) {
      throw new Error(
        'tour_api_festival: TOUR_API_FESTIVAL_SERVICE_KEY 환경변수가 필요합니다 (data.go.kr 활용신청 후 발급).'
      );
    }

    const todayYmd = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const items: RawFetchItem[] = [];

    for (let pageNo = 1; ; pageNo += 1) {
      const url = new URL(source.base_url);
      url.searchParams.set('serviceKey', serviceKey);
      url.searchParams.set('MobileOS', 'ETC');
      url.searchParams.set('MobileApp', 'peterbae');
      url.searchParams.set('_type', 'json');
      url.searchParams.set('numOfRows', String(PAGE_SIZE));
      url.searchParams.set('pageNo', String(pageNo));
      url.searchParams.set('eventStartDate', todayYmd);

      const res = await fetchWithRetry(url.toString());
      if (!res.ok) {
        throw new Error(`tour_api_festival: 목록 조회 실패 (HTTP ${res.status}, page=${pageNo})`);
      }
      const json = (await res.json()) as {
        response?: { body?: { items?: { item?: FestivalItem | FestivalItem[] }; totalCount?: number } };
      };

      const body = json.response?.body;
      const rawList = body?.items?.item;
      const list = Array.isArray(rawList) ? rawList : rawList ? [rawList] : [];
      if (list.length === 0) break;

      for (const item of list) {
        const externalId = item.contentid ? String(item.contentid).trim() : '';
        if (!externalId) continue;
        items.push({ externalId, payload: item as unknown as Record<string, unknown> });
      }

      const totalCount = body?.totalCount ?? 0;
      if (list.length < PAGE_SIZE || items.length >= totalCount) break;
    }

    return items;
  },

  normalize(raw: RawFetchItem): NormalizedEvent | null {
    const p = raw.payload as unknown as FestivalItem;
    const title = String(p.title ?? '').trim();
    const startDate = toIsoDate(p.eventstartdate);
    if (!title || !startDate) return null;

    const [regionSido, regionSigungu] = splitAddr(p.addr1);
    const rawCategoryValue = p.lclsSystm3 || p.lclsSystm2 || p.lclsSystm1 || null;

    return {
      externalId: raw.externalId,
      title,
      rawCategoryValue,
      regionSido,
      regionSigungu,
      startDate,
      endDate: toIsoDate(p.eventenddate),
      eventTime: null,
      venueName: p.addr1 ? String(p.addr1).trim() || null : null,
      priceInfo: null,
      imageUrl: p.firstimage ? String(p.firstimage).trim() || null : null,
      sourceUrl: null,
    };
  },
};
