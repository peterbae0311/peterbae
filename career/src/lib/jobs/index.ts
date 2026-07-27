import { searchWorknet } from './worknet';
import { searchSaramin } from './saramin';
import { searchWanted } from './wanted';
import { searchJobkorea } from './jobkorea';
import { JobSearchResult, SearchParams } from './types';

const SOURCES: Array<{ key: JobSearchResult['source']; fn: (p: SearchParams) => Promise<import('./types').Job[]> }> = [
  { key: 'worknet',  fn: searchWorknet  },
  { key: 'saramin',  fn: searchSaramin  },
  { key: 'wanted',   fn: searchWanted   },
  { key: 'jobkorea', fn: searchJobkorea },
];

export async function searchAllJobs(params: SearchParams): Promise<JobSearchResult[]> {
  const settled = await Promise.allSettled(SOURCES.map(s => s.fn(params)));

  return settled.map((result, i) => {
    const source = SOURCES[i].key;
    if (result.status === 'fulfilled') {
      return { source, jobs: result.value, total: result.value.length };
    }
    console.error(`[${source}] failed:`, result.reason);
    return { source, jobs: [], total: 0, error: '검색 중 오류가 발생했습니다.' };
  });
}

export type { Job, JobSearchResult, SearchParams } from './types';
