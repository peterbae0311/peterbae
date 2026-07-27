import { getSourceServiceKey } from '../lib/env.js';
import type { RawFetchItem, NormalizedEvent, SourceRow } from '../lib/types.js';
import type { SourceAdapter } from './types.js';

// data.go.kr(odcloud) 파일데이터 API. Swagger: https://infuser.odcloud.kr/oas/docs?namespace=15135584/v1
// exh_sources.base_url에는 최신 uddi 엔드포인트(2026-07-08 기준 "_20250912"본)가 저장돼 있다.
// GEP(글로벌전시포털) 등록 기준 2020~2026년 "개최 예정" 해외전시회 데이터(17,241건, 실제 응답으로 확인).
// 이전 데이터셋(namespace 15003367, "해외전시회 정보")는 연도 없는 'MM-DD~MM-DD' 기간만 제공하는
// 과거 스냅샷이라 제외했으나, 이 데이터셋은 개최시작예정일자/개최종료예정일자가 완전한 날짜(YYYY-MM-DD)로
// 내려오고 실제로 미래 일정(예정 534건, 진행중 42건, 2026-07-08 기준)이 포함되어 있어 채택함.
// 응답 필드: 해외전시회명, 개최예정연도, 개최시작예정일자, 개최종료예정일자, 개최국가명, 개최도시명,
//   전시장명, 개최주기, 산업분야, 참가기업수 등
//
// 전체 17,241건 중 진행중/예정은 576건뿐(2026-07-08 기준 나머지는 2020~2025년 이미 종료된 회차)이고,
// syncSource가 항목당 순차로 카테고리/장소 upsert를 하기 때문에 전체를 다 받으면 수십 시간이 걸린다.
// 이 서비스는 "지금 볼 수 있는 전시" 화면이 목적이므로 종료된 회차는 애초에 받아오지 않는다.
const PAGE_SIZE = 1000;

function isPastEvent(endDate: string): boolean {
  return endDate < new Date().toISOString().slice(0, 10);
}

const MAX_EVENT_SPAN_DAYS = 60;

/**
 * 원본에 종료일 오타가 섞여 있다(예: "2023-10-05"가 "2203-10-05"로 입력돼 180년짜리 전시회처럼 보임).
 * 실제 무역전시회가 60일을 넘는 경우는 사실상 없으므로, 그보다 길면 오타로 보고 종료일을 버린다.
 */
function sanitizeEndDate(startDate: string, endDate: string | null): string | null {
  if (!endDate) return null;
  const spanDays = (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86_400_000;
  return spanDays > MAX_EVENT_SPAN_DAYS ? null : endDate;
}

interface KotraFairItem {
  해외전시회명?: string;
  개최시작예정일자?: string;
  개최종료예정일자?: string;
  개최국가명?: string;
  개최도시명?: string;
  전시장명?: string;
  산업분야?: string;
}

export const kotraOverseasFairAdapter: SourceAdapter = {
  code: 'kotra_overseas_fair',
  defaultCategoryCode: 'IND_OVERSEAS',
  isOverseas: true,

  async fetchRaw(source: SourceRow): Promise<RawFetchItem[]> {
    if (!source.base_url) {
      throw new Error('kotra_overseas_fair: exh_sources.base_url이 설정되지 않았습니다.');
    }
    const serviceKey = getSourceServiceKey(source.code);
    if (!serviceKey) {
      throw new Error('kotra_overseas_fair: KOTRA_OVERSEAS_FAIR_SERVICE_KEY 환경변수가 필요합니다 (data.go.kr 활용신청 후 발급).');
    }

    const items: RawFetchItem[] = [];

    for (let page = 1; ; page += 1) {
      const url = new URL(source.base_url);
      url.searchParams.set('page', String(page));
      url.searchParams.set('perPage', String(PAGE_SIZE));
      url.searchParams.set('serviceKey', serviceKey);

      const res = await fetch(url.toString());
      if (!res.ok) {
        throw new Error(`kotra_overseas_fair: 목록 조회 실패 (HTTP ${res.status}, page=${page})`);
      }
      const json = (await res.json()) as { data?: KotraFairItem[]; totalCount?: number };
      const list = json.data ?? [];
      if (list.length === 0) break;

      for (const item of list) {
        const name = item.해외전시회명?.trim();
        const start = item.개최시작예정일자?.trim();
        if (!name || !start) continue;
        const end = sanitizeEndDate(start, item.개최종료예정일자?.trim() || null) ?? start;
        if (isPastEvent(end)) continue;
        const externalId = `${name}::${start}::${item.개최국가명 ?? ''}::${item.개최도시명 ?? ''}`;
        items.push({ externalId, payload: item as unknown as Record<string, unknown> });
      }

      const totalCount = json.totalCount ?? 0;
      if (list.length < PAGE_SIZE || items.length >= totalCount) break;
    }

    return items;
  },

  normalize(raw: RawFetchItem): NormalizedEvent | null {
    const p = raw.payload as unknown as KotraFairItem;
    const title = p.해외전시회명?.trim();
    const startDate = p.개최시작예정일자?.trim();
    if (!title || !startDate) return null;

    const country = p.개최국가명?.trim();
    const city = p.개최도시명?.trim();
    const venue = p.전시장명?.trim();
    const place = [country, city].filter(Boolean).join(' ');
    const venueName = venue ? [place, venue].filter(Boolean).join(' · ') || null : place || null;

    return {
      externalId: raw.externalId,
      title,
      rawCategoryValue: p.산업분야?.trim() || null,
      regionSido: null,
      regionSigungu: null,
      startDate,
      endDate: sanitizeEndDate(startDate, p.개최종료예정일자?.trim() || null),
      eventTime: null,
      venueName,
      priceInfo: null,
      imageUrl: null,
      sourceUrl: null,
    };
  },
};
