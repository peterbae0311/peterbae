'use client';

import { useState } from 'react';
import { JobSearchResult, SOURCE_LABELS, JobSource } from '@/lib/jobs/types';
import JobCard from './JobCard';

interface Props {
  results: JobSearchResult[];
  total: number;
  isDemo: boolean;
}

const ALL = 'all';

export default function JobList({ results, total, isDemo }: Props) {
  const [activeTab, setActiveTab] = useState<string>(ALL);

  const allJobs    = results.flatMap(r => r.jobs);
  const activeJobs = activeTab === ALL
    ? allJobs
    : (results.find(r => r.source === activeTab)?.jobs ?? []);

  const tabs = [
    { id: ALL,   label: '전체', count: total, error: false },
    ...results.map(r => ({ id: r.source, label: SOURCE_LABELS[r.source as JobSource], count: r.total, error: !!r.error })),
  ];

  return (
    <div className="space-y-4">
      {/* 데모 모드 안내 */}
      {isDemo && (
        <div className="flex items-start gap-3 bg-amber-50/80 backdrop-blur border border-amber-200/70 rounded-2xl p-4 text-sm text-amber-800 shadow-sm">
          <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>
            <strong>데모 모드</strong> — API 키가 설정되지 않아 샘플 데이터를 표시합니다.
            실제 채용 정보를 보려면 <code className="bg-amber-100 px-1 rounded">.env.local</code>에 API 키를 입력하세요.
            (원티드는 키 없이도 실제 데이터가 조회됩니다.)
          </span>
        </div>
      )}

      {/* 결과 요약 */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600">
          총 <strong className="text-gray-900">{total}개</strong>의 채용공고
        </p>
        <p className="text-xs text-gray-400">
          {results.map(r => `${SOURCE_LABELS[r.source as JobSource]} ${r.total}건`).join(' · ')}
        </p>
      </div>

      {/* 사이트별 탭 */}
      <div className="flex gap-1 bg-white/50 backdrop-blur border border-white/50 p-1 rounded-xl shadow-sm">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-2 px-2 rounded-lg text-sm font-medium transition-all duration-200 ${
              activeTab === tab.id
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
            <span className={`ml-1 text-xs ${activeTab === tab.id ? 'text-neutral-900' : 'text-gray-400'}`}>
              {tab.count}
            </span>
            {tab.error && <span className="ml-1 text-xs text-red-400">!</span>}
          </button>
        ))}
      </div>

      {/* 채용공고 그리드 */}
      {activeJobs.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {activeJobs.map(job => (
            <JobCard key={job.id} job={job} />
          ))}
        </div>
      ) : (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg">해당 사이트에서 검색 결과가 없습니다.</p>
        </div>
      )}
    </div>
  );
}
