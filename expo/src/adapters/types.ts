import type { SourceRow, RawFetchItem, NormalizedEvent } from '../lib/types.js';

export interface SourceAdapter {
  code: string;
  /** 원본 카테고리 값이 없거나 매핑 미확정일 때 쓰는 임시 분류 코드 (exh_categories 참조) */
  defaultCategoryCode: string;
  /** true면 exh_events.is_overseas=true로 저장 — 웹에서 카카오맵/구글맵 분기에 사용 (기본값 false) */
  isOverseas?: boolean;
  fetchRaw(source: SourceRow): Promise<RawFetchItem[]>;
  /** null을 반환하면 해당 항목은 정규화 실패로 간주하고 건너뛴다 */
  normalize(raw: RawFetchItem): NormalizedEvent | null;
}
