import axios from 'axios';
import { Job, SearchParams } from './types';
import { WANTED_LOCATION_SLUGS, LOCATION_LABELS } from '@/constants/locations';

const WANTED_API_URL = 'https://www.wanted.co.kr/api/v4/jobs';

export async function searchWanted(params: SearchParams): Promise<Job[]> {
  try {
    const query: Record<string, string | number> = {
      job_sort: 'job.latest_order',
      years:    -1,
      limit:    20,
      offset:   0,
    };

    if (params.keyword) {
      query.query = params.keyword;
    }
    if (params.location && WANTED_LOCATION_SLUGS[params.location]) {
      query.locations = WANTED_LOCATION_SLUGS[params.location];
    }
    if (params.career === 'new') {
      query.years = 0;
    } else if (params.career === 'experienced') {
      query.years = 2;
    }

    const { data } = await axios.get(WANTED_API_URL, {
      params: query,
      headers: {
        'User-Agent':        'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Accept':            'application/json, text/plain, */*',
        'Accept-Language':   'ko-KR,ko;q=0.9',
        'Referer':           'https://www.wanted.co.kr/',
        'Wanted-User-Agent': 'wanted-web',
      },
      timeout: 10000,
    });

    const list = data?.data ?? [];

    return list.map((j: Record<string, unknown>) => ({
      id:             `wanted-${j.id}`,
      source:         'wanted' as const,
      title:          (j.position as string)                     ?? '',
      company:        ((j.company as Record<string, string>)?.name) ?? '',
      location:       ((j.address as Record<string, string>)?.location) ?? '',
      career:         formatCareer(j.experience_level as Record<string, number> | null),
      employmentType: '정규직',
      salary:         formatSalary(j.salary as Record<string, number> | null),
      deadline:       undefined,
      url:            `https://www.wanted.co.kr/wd/${j.id}`,
      postedAt:       (j.created_time as string) || undefined,
      description:    (j.summary as string) || undefined,
      tags:           ((j.skill_tags as Array<{ title: string }>) ?? []).map(t => t.title),
    }));
  } catch (err) {
    console.error('[wanted]', err);
    return getMockJobs(params);
  }
}

function formatCareer(level: Record<string, number> | null): string {
  if (!level) return '경력무관';
  const min = level.min ?? 0;
  const max = level.max;
  if (min === 0 && (!max || max === 0)) return '신입';
  if (!max) return `${min}년 이상`;
  return `${min}~${max}년`;
}

function formatSalary(salary: Record<string, number> | null): string | undefined {
  if (!salary) return undefined;
  const { min, max } = salary;
  if (!min && !max) return undefined;
  const fmt = (v: number) => `${Math.round(v / 10000).toLocaleString()}만원`;
  if (min && max) return `${fmt(min)}~${fmt(max)}`;
  if (min) return `${fmt(min)} 이상`;
  return undefined;
}

function getMockJobs(params: SearchParams): Job[] {
  const loc = params.location ? (LOCATION_LABELS[params.location] ?? '서울') : '서울';
  const kw  = params.keyword  || '개발자';

  return [
    {
      id:             'wanted-mock-1',
      source:         'wanted',
      title:          `${kw} (Backend)`,
      company:        '토스',
      location:       `${loc} 강남구`,
      career:         '3~7년',
      employmentType: '정규직',
      salary:         '7,000~12,000만원',
      url:            'https://www.wanted.co.kr',
      postedAt:       '2025-06-24',
      tags:           ['Java', 'Spring', 'Kubernetes'],
    },
    {
      id:             'wanted-mock-2',
      source:         'wanted',
      title:          `${kw} (Frontend)`,
      company:        '당근마켓',
      location:       `${loc} 강남구`,
      career:         '2~5년',
      employmentType: '정규직',
      salary:         '6,000~10,000만원',
      url:            'https://www.wanted.co.kr',
      postedAt:       '2025-06-23',
      tags:           ['React', 'TypeScript', 'GraphQL'],
    },
    {
      id:             'wanted-mock-3',
      source:         'wanted',
      title:          `ML ${kw}`,
      company:        '네이버',
      location:       '경기 성남시',
      career:         '3년 이상',
      employmentType: '정규직',
      salary:         '8,000만원 이상',
      url:            'https://www.wanted.co.kr',
      postedAt:       '2025-06-22',
      tags:           ['Python', 'TensorFlow', 'PyTorch'],
    },
  ];
}
