export interface SourceRow {
  id: string;
  code: string;
  name: string;
  provider: string | null;
  domain: 'culture' | 'industry';
  fetch_type: 'realtime_api' | 'file_data';
  base_url: string | null;
  call_interval_minutes: number | null;
  is_active: boolean;
}

/** 어댑터가 외부 API에서 가져온 원본 항목 (exh_raw_items 저장 단위) */
export interface RawFetchItem {
  externalId: string;
  payload: Record<string, unknown>;
}

/** 원본 항목을 exh_events 스키마에 맞게 정규화한 결과 */
export interface NormalizedEvent {
  externalId: string;
  title: string;
  /** 소스 원본 카테고리/장르 값. exh_category_mappings 매핑 키로 사용 */
  rawCategoryValue: string | null;
  regionSido?: string | null;
  regionSigungu?: string | null;
  /** 'YYYY.MM.DD', 'YYYY-MM-DD' 등 소스 원본 형식 그대로. syncSource에서 date로 변환 */
  startDate: string;
  endDate?: string | null;
  eventTime?: string | null;
  venueName?: string | null;
  priceInfo?: string | null;
  imageUrl?: string | null;
  sourceUrl?: string | null;
}

export type SyncStatus = 'success' | 'partial' | 'failed';

export interface SyncResult {
  code: string;
  status: SyncStatus;
  processed: number;
  failed: number;
  errorMessage: string | null;
}
