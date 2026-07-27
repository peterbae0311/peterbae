import axios from 'axios';
import { Job, SearchParams } from './types';
import { SARAMIN_LOCATION_CODES, LOCATION_LABELS } from '@/constants/locations';
import { serverEnv } from '@/lib/env.server';

const SARAMIN_API_URL = 'https://oapi.saramin.co.kr/job-search';

const CAREER_CODES: Record<string, string> = {
  new:         '1',
  experienced: '2,3,4,5,6,7,8,9,10',
};

const EMP_TYPE_CODES: Record<string, string> = {
  regular:   '1',
  contract:  '2',
  intern:    '5',
  freelance: '6',
};

export async function searchSaramin(params: SearchParams): Promise<Job[]> {
  const apiKey = serverEnv.saraminApiKey;

  if (!apiKey) {
    return getMockJobs(params);
  }

  try {
    const query: Record<string, string | number> = {
      'access-key': apiKey,
      keywords:     params.keyword,
      count:        20,
      start:        0,
    };

    if (params.location && SARAMIN_LOCATION_CODES[params.location]) {
      query.loc_mcd = SARAMIN_LOCATION_CODES[params.location];
    }
    if (params.career && CAREER_CODES[params.career]) {
      query.career_lvl = CAREER_CODES[params.career];
    }
    if (params.employmentType && EMP_TYPE_CODES[params.employmentType]) {
      query.job_type = EMP_TYPE_CODES[params.employmentType];
    }
    if (params.minSalary) {
      query.min_pay = params.minSalary;
    }

    const { data } = await axios.get(SARAMIN_API_URL, { params: query, timeout: 10000 });
    const list = data?.jobs?.job ?? [];

    return list.map((j: Record<string, unknown>) => {
      const pos     = j.position  as Record<string, unknown>;
      const company = j.company   as Record<string, Record<string, unknown>>;
      return {
        id:             `saramin-${j.id}`,
        source:         'saramin' as const,
        title:          (pos?.title as string)                              ?? '',
        company:        (company?.detail?.name as string)                   ?? '',
        location:       ((pos?.location as Record<string, string[]>)?.name ?? []).join(', '),
        career:         ((pos?.experience as Record<string, string>)?.required) ?? '경력무관',
        employmentType: (((pos?.['employment-type'] as Record<string, string[]>)?.name) ?? []).join(', '),
        salary:         ((j.salary as Record<string, string>)?.name) || undefined,
        deadline:       (j['expiration-date'] as string) || undefined,
        url:            (j.url as string) ?? 'https://www.saramin.co.kr',
        postedAt:       (j['opening-date'] as string) || undefined,
      };
    });
  } catch (err) {
    console.error('[saramin]', err);
    throw err;
  }
}

function getMockJobs(params: SearchParams): Job[] {
  const loc = params.location ? (LOCATION_LABELS[params.location] ?? '서울') : '서울';
  const kw  = params.keyword  || '개발자';

  return [
    {
      id:             'saramin-mock-1',
      source:         'saramin',
      title:          `${kw} (경력 2~5년)`,
      company:        '카카오 계열사',
      location:       `${loc} 강남구`,
      career:         '경력 2~5년',
      employmentType: '정규직',
      salary:         '5,000~8,000만원',
      deadline:       '2025-08-01',
      url:            'https://www.saramin.co.kr',
      postedAt:       '2025-06-21',
      tags:           ['Node.js', 'TypeScript', 'AWS'],
    },
    {
      id:             'saramin-mock-2',
      source:         'saramin',
      title:          `신입 ${kw} 공개 채용`,
      company:        '네이버 파트너사',
      location:       '경기 성남시 분당구',
      career:         '신입',
      employmentType: '정규직',
      salary:         '3,000~4,500만원',
      deadline:       '2025-07-25',
      url:            'https://www.saramin.co.kr',
      postedAt:       '2025-06-23',
      tags:           ['React', 'TypeScript', 'Next.js'],
    },
    {
      id:             'saramin-mock-3',
      source:         'saramin',
      title:          `데이터 ${kw}`,
      company:        '빅데이터 전문기업',
      location:       `${loc} 마포구`,
      career:         '경력 3년 이상',
      employmentType: '정규직',
      salary:         '6,000~9,000만원',
      deadline:       '2025-08-10',
      url:            'https://www.saramin.co.kr',
      postedAt:       '2025-06-19',
      tags:           ['Python', 'Spark', 'Airflow'],
    },
  ];
}
