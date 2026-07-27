import { Job, SOURCE_LABELS, SOURCE_COLORS } from '@/lib/jobs/types';

export default function JobCard({ job }: { job: Job }) {
  const color = SOURCE_COLORS[job.source];

  return (
    <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/60 shadow-sm hover:shadow-glass-lg hover:-translate-y-1 transition-all duration-200 p-5 flex flex-col gap-3 h-full">
      {/* 출처 배지 + 고용형태 */}
      <div className="flex items-center justify-between gap-2">
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${color.bg} ${color.text} ${color.border}`}>
          {SOURCE_LABELS[job.source]}
        </span>
        {job.employmentType && (
          <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full truncate max-w-[120px]">
            {job.employmentType}
          </span>
        )}
      </div>

      {/* 회사 + 직무명 */}
      <div>
        <p className="text-xs text-gray-500 mb-0.5 truncate">{job.company}</p>
        <h3 className="font-semibold text-gray-900 leading-snug line-clamp-2 text-sm">{job.title}</h3>
      </div>

      {/* 상세 정보 */}
      <div className="flex flex-col gap-1.5 text-xs text-gray-600 flex-1">
        {job.location && (
          <div className="flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="truncate">{job.location}</span>
          </div>
        )}
        {job.career && (
          <div className="flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <span>{job.career}</span>
          </div>
        )}
        {job.salary && (
          <div className="flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-emerald-700 font-medium">{job.salary}</span>
          </div>
        )}
      </div>

      {/* 기술 태그 */}
      {job.tags && job.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {job.tags.slice(0, 4).map(tag => (
            <span key={tag} className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* 마감일 + 공고 링크 */}
      <div className="flex items-center justify-between pt-2 border-t border-gray-50 mt-auto">
        <span className="text-xs text-gray-400">
          {job.deadline ? `마감 ${job.deadline}` : '상시채용'}
        </span>
        <a
          href={job.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-semibold text-neutral-900 hover:text-neutral-950 transition-colors"
        >
          공고 보기 →
        </a>
      </div>
    </div>
  );
}
