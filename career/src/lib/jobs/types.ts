export type JobSource = 'worknet' | 'saramin' | 'wanted' | 'jobkorea';

export interface Job {
  id: string;
  source: JobSource;
  title: string;
  company: string;
  location: string;
  career: string;
  employmentType: string;
  salary?: string;
  deadline?: string;
  url: string;
  postedAt?: string;
  description?: string;
  tags?: string[];
}

export interface SearchParams {
  keyword: string;
  location?: string;
  career?: string;
  employmentType?: string;
  minSalary?: number;
}

export interface JobSearchResult {
  source: JobSource;
  jobs: Job[];
  total: number;
  error?: string;
}

export const SOURCE_LABELS: Record<JobSource, string> = {
  worknet: '워크넷',
  saramin: '사람인',
  wanted: '원티드',
  jobkorea: '잡코리아',
};

export const SOURCE_COLORS: Record<JobSource, { bg: string; text: string; border: string }> = {
  worknet:  { bg: 'bg-emerald-50',  text: 'text-emerald-700', border: 'border-emerald-200' },
  saramin:  { bg: 'bg-blue-50',     text: 'text-blue-700',    border: 'border-blue-200'    },
  wanted:   { bg: 'bg-rose-50',     text: 'text-rose-700',    border: 'border-rose-200'    },
  jobkorea: { bg: 'bg-orange-50',   text: 'text-orange-700',  border: 'border-orange-200'  },
};
