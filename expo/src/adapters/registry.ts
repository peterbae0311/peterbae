import type { SourceAdapter } from './types.js';
import { kopisAdapter } from './kopis.js';
import { culturePortalAdapter } from './culturePortal.js';
import { cultureDataPlazaExpoAdapter } from './cultureDataPlazaExpo.js';
import { seoulCultureEventAdapter } from './seoulCultureEvent.js';
import { worknetJobFairAdapter } from './worknetJobFair.js';
import { kotraOverseasFairAdapter } from './kotraOverseasFair.js';

// 나머지 소스(culture_data_plaza_perf(보류), motie_trade_fair, at_agrifood_fair)는
// 사후 실적 통계이거나 과거 연도 스냅샷이라 실시간성이 없어 exh_sources에서 is_active=false로 제외돼 있다.
const adapters: Record<string, SourceAdapter> = {
  [kopisAdapter.code]: kopisAdapter,
  [culturePortalAdapter.code]: culturePortalAdapter,
  [cultureDataPlazaExpoAdapter.code]: cultureDataPlazaExpoAdapter,
  [seoulCultureEventAdapter.code]: seoulCultureEventAdapter,
  [worknetJobFairAdapter.code]: worknetJobFairAdapter,
  [kotraOverseasFairAdapter.code]: kotraOverseasFairAdapter,
};

export function getAdapter(code: string): SourceAdapter {
  const adapter = adapters[code];
  if (!adapter) {
    throw new Error(`'${code}' 소스의 수집 어댑터가 아직 구현되지 않았습니다. 구현된 소스: ${listAdapterCodes().join(', ')}`);
  }
  return adapter;
}

export function listAdapterCodes(): string[] {
  return Object.keys(adapters);
}
