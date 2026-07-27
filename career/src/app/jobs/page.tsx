'use client';

import { useState } from 'react';
import SearchForm from '@/components/SearchForm';
import JobList from '@/components/JobList';
import { SearchParams, JobSearchResult } from '@/lib/jobs/types';

interface SearchState {
  results: JobSearchResult[];
  total: number;
  isDemo: boolean;
}

export default function HomePage() {
  const [searchState, setSearchState] = useState<SearchState | null>(null);
  const [isLoading,   setIsLoading]   = useState(false);
  const [error,       setError]       = useState<string | null>(null);

  const handleSearch = async (params: SearchParams) => {
    setIsLoading(true);
    setError(null);

    try {
      const qs = new URLSearchParams({ keyword: params.keyword });
      if (params.location)       qs.set('location',       params.location);
      if (params.career)         qs.set('career',         params.career);
      if (params.employmentType) qs.set('employmentType', params.employmentType);
      if (params.minSalary)      qs.set('minSalary',      String(params.minSalary));

      const res  = await fetch(`/api/jobs?${qs.toString()}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? '검색 중 오류가 발생했습니다.');
        return;
      }
      setSearchState(data);
    } catch {
      setError('서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-56px)]">
      {/* 메인 콘텐츠 */}
      <main className="max-w-[1816px] mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-gray-200/70">
          <h1 className="text-2xl font-black tracking-tighter text-neutral-900">채용 통합 검색</h1>
        </div>

        <SearchForm onSearch={handleSearch} isLoading={isLoading} />

        {/* 로딩 */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-10 h-10 border-4 border-neutral-200 border-t-neutral-900 rounded-full animate-spin" />
            <p className="text-gray-500 text-sm">4개 사이트에서 채용공고를 검색하고 있습니다...</p>
          </div>
        )}

        {/* 에러 */}
        {error && !isLoading && (
          <div className="bg-red-50/80 backdrop-blur border border-red-200/70 rounded-2xl p-4 text-sm text-red-800 flex items-center gap-2 shadow-sm">
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {error}
          </div>
        )}

        {/* 결과 */}
        {searchState && !isLoading && (
          <JobList
            results={searchState.results}
            total={searchState.total}
            isDemo={searchState.isDemo}
          />
        )}

        {/* 초기 상태 */}
        {!searchState && !isLoading && !error && (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
            <div className="w-16 h-16 bg-neutral-200 rounded-2xl flex items-center justify-center shadow-glass">
              <svg className="w-8 h-8 text-neutral-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <div>
              <p className="text-gray-800 font-extrabold tracking-tight text-lg">원하는 직무를 검색해보세요</p>
              <p className="text-gray-400 text-sm mt-1">사람인, 워크넷, 원티드, 잡코리아의 채용공고를 한 번에 확인합니다</p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center mt-2">
              {['백엔드 개발자', '프론트엔드 개발자', '데이터 엔지니어', 'DevOps', 'AI 엔지니어'].map(kw => (
                <button
                  key={kw}
                  onClick={() => handleSearch({ keyword: kw })}
                  className="text-sm px-4 py-2 bg-white/70 backdrop-blur border border-white/60 rounded-full text-gray-600 hover:bg-neutral-100/70 hover:border-neutral-400 hover:text-neutral-900 hover:-translate-y-0.5 transition-all duration-200 shadow-sm"
                >
                  {kw}
                </button>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

