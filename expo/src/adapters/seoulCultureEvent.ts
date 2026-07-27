import { getSourceServiceKey } from '../lib/env.js';
import type { RawFetchItem, NormalizedEvent, SourceRow } from '../lib/types.js';
import type { SourceAdapter } from './types.js';

// End Point 패턴: {base_url}/{인증키}/json/culturalEventInfo/{시작index}/{종료index}/
// (서울 열린데이터광장 공통 URL 규칙 — 다른 API와 달리 인증키를 쿼리파라미터가 아니라 경로에 넣는다)
// 더미 키 'sample'로 실제 호출해 필드 확인함(2026-07-05). sample 키는 최대 5건 제한이라
// 실사용에는 반드시 정식 인증키가 필요 (data.seoul.go.kr 회원가입 후 즉시 발급, 1회 최대 1,000건).
// 응답 구조: { culturalEventInfo: { list_total_count, RESULT:{CODE,MESSAGE}, row: [...] } }
//   row 필드: CODENAME(분류), GUNAME(자치구), TITLE, PLACE, USE_FEE, INQUIRY, MAIN_IMG,
//             STRTDATE/END_DATE('YYYY-MM-DD HH:MM:SS.f'), PRO_TIME, HMPG_ADDR(상세링크, cultcode 포함), ORG_LINK
// 별도의 고유 ID 필드가 없어 HMPG_ADDR의 cultcode 쿼리값을 external_id로 사용.
const PAGE_SIZE = 1000;

interface SeoulEventRow {
  CODENAME?: string;
  GUNAME?: string;
  TITLE?: string;
  PLACE?: string;
  USE_FEE?: string;
  IS_FREE?: string;
  MAIN_IMG?: string;
  STRTDATE?: string;
  END_DATE?: string;
  PRO_TIME?: string;
  HMPG_ADDR?: string;
  ORG_LINK?: string;
}

function extractCultCode(hmpgAddr: string | undefined): string | null {
  if (!hmpgAddr) return null;
  const m = hmpgAddr.match(/cultcode=(\d+)/);
  return m ? m[1] : null;
}

/** 'YYYY-MM-DD HH:MM:SS.f' 또는 'YYYY-MM-DD' → 'YYYY-MM-DD' */
function toDateOnly(value: string | undefined): string | null {
  if (!value) return null;
  const s = value.trim();
  return s.length >= 10 ? s.slice(0, 10) : null;
}

export const seoulCultureEventAdapter: SourceAdapter = {
  code: 'seoul_culture_event',
  defaultCategoryCode: 'FEST_ETC',

  async fetchRaw(source: SourceRow): Promise<RawFetchItem[]> {
    if (!source.base_url) {
      throw new Error('seoul_culture_event: exh_sources.base_url이 설정되지 않았습니다.');
    }
    const serviceKey = getSourceServiceKey(source.code);
    if (!serviceKey) {
      throw new Error(
        'seoul_culture_event: SEOUL_CULTURE_EVENT_SERVICE_KEY 환경변수가 필요합니다 (data.seoul.go.kr 회원가입 후 즉시 발급).'
      );
    }

    const items: RawFetchItem[] = [];

    for (let start = 1; ; start += PAGE_SIZE) {
      const end = start + PAGE_SIZE - 1;
      const url = `${source.base_url}/${serviceKey}/json/culturalEventInfo/${start}/${end}/`;

      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`seoul_culture_event: 목록 조회 실패 (HTTP ${res.status}, range=${start}-${end})`);
      }
      const text = await res.text();

      // 에러 응답은 /json/ 요청이어도 XML(<RESULT><CODE>...)로 오는 경우가 있다 (예: 샘플키 5건 초과).
      if (text.trimStart().startsWith('<')) {
        const code = text.match(/<CODE>(.*?)<\/CODE>/)?.[1] ?? 'UNKNOWN';
        const message = text.match(/<MESSAGE>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/MESSAGE>/)?.[1] ?? text.slice(0, 200);
        throw new Error(`seoul_culture_event: API 오류 (${code}) ${message}`);
      }

      const parsed = JSON.parse(text) as {
        culturalEventInfo?: { list_total_count?: number; row?: SeoulEventRow[]; RESULT?: { CODE?: string; MESSAGE?: string } };
        RESULT?: { CODE?: string; MESSAGE?: string };
      };

      // 정상 JSON이지만 culturalEventInfo가 없는 에러 형태도 방어적으로 처리
      if (!parsed.culturalEventInfo) {
        const code = parsed.RESULT?.CODE ?? 'UNKNOWN';
        const message = parsed.RESULT?.MESSAGE ?? text.slice(0, 200);
        throw new Error(`seoul_culture_event: API 오류 (${code}) ${message}`);
      }

      const rows = parsed.culturalEventInfo.row ?? [];
      if (rows.length === 0) break;

      for (const row of rows) {
        const externalId = extractCultCode(row.HMPG_ADDR) ?? `${row.TITLE}::${row.STRTDATE}`;
        if (!externalId) continue;
        items.push({ externalId, payload: row as unknown as Record<string, unknown> });
      }

      const totalCount = parsed.culturalEventInfo.list_total_count ?? 0;
      if (rows.length < PAGE_SIZE || items.length >= totalCount) break;
    }

    return items;
  },

  normalize(raw: RawFetchItem): NormalizedEvent | null {
    const p = raw.payload as unknown as SeoulEventRow;
    const title = String(p.TITLE ?? '').trim();
    const startDate = toDateOnly(p.STRTDATE);
    if (!title || !startDate) return null;

    return {
      externalId: raw.externalId,
      title,
      rawCategoryValue: p.CODENAME ? String(p.CODENAME).trim() || null : null,
      regionSido: '서울',
      regionSigungu: p.GUNAME ? String(p.GUNAME).trim() || null : null,
      startDate,
      endDate: toDateOnly(p.END_DATE),
      eventTime: p.PRO_TIME ? String(p.PRO_TIME).trim() || null : null,
      venueName: p.PLACE ? String(p.PLACE).trim() || null : null,
      priceInfo: (p.USE_FEE && String(p.USE_FEE).trim()) || (p.IS_FREE ? String(p.IS_FREE).trim() : null) || null,
      imageUrl: p.MAIN_IMG ? String(p.MAIN_IMG).trim() || null : null,
      sourceUrl: (p.HMPG_ADDR && String(p.HMPG_ADDR).trim()) || (p.ORG_LINK ? String(p.ORG_LINK).trim() : null) || null,
    };
  },
};
