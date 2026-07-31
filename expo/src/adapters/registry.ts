import type { SourceAdapter } from './types.js';
import { culturePortalAdapter } from './culturePortal.js';
import { cultureDataPlazaExpoAdapter } from './cultureDataPlazaExpo.js';
import { seoulCultureEventAdapter } from './seoulCultureEvent.js';
import { kotraOverseasFairAdapter } from './kotraOverseasFair.js';
import { tourApiFestivalAdapter } from './tourApiFestival.js';

// 나머지 소스(culture_data_plaza_perf(보류), motie_trade_fair, at_agrifood_fair)는
// 사후 실적 통계이거나 과거 연도 스냅샷이라 실시간성이 없어 exh_sources에서 is_active=false로 제외돼 있다.
//
// kopis, worknet_job_fair는 어댑터 구현은 되어있지만(kopis.ts, worknetJobFair.ts) 실제로
// 한 번도 데이터가 적재된 적이 없어(서비스키 미발급) 'all' 실행 대상에서 제외한다.
// 나중에 키를 발급받으면 아래 두 줄의 import/등록을 되살리면 된다.
const adapters: Record<string, SourceAdapter> = {
  [culturePortalAdapter.code]: culturePortalAdapter,
  [cultureDataPlazaExpoAdapter.code]: cultureDataPlazaExpoAdapter,
  [seoulCultureEventAdapter.code]: seoulCultureEventAdapter,
  [kotraOverseasFairAdapter.code]: kotraOverseasFairAdapter,
  [tourApiFestivalAdapter.code]: tourApiFestivalAdapter,
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
