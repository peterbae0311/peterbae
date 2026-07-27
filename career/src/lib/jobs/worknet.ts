import axios from 'axios';
import * as cheerio from 'cheerio';
import { Job, SearchParams } from './types';
import { WORKNET_REGION_CODES, LOCATION_LABELS } from '@/constants/locations';
import { serverEnv } from '@/lib/env.server';

// 2025-02-11부터 개인도 신청 가능해진 신규 오픈API 포털의 엔드포인트.
// (구) www.work.go.kr/opi/opi/opia/wantedInfolist.do 는 더 이상 서비스되지 않음(404).
const WORKNET_API_URL = 'https://openapi.work.go.kr/opi/opi/opia/wantedApi.do';

const CAREER_CODES: Record<string, string> = {
  new:         '1',
  experienced: '2',
};

const EMP_TYPE_CODES: Record<string, string> = {
  regular:   '10',
  contract:  '20',
  intern:    '50',
  freelance: '40',
};

export async function searchWorknet(params: SearchParams): Promise<Job[]> {
  const apiKey = serverEnv.worknetApiKey;

  if (!apiKey) {
    return getMockJobs(params);
  }

  try {
    // 이 엔드포인트는 XML만 지원 — returnType=JSON/json 요청 시 "리턴 타입이 올바르지 않습니다" 오류 반환.
    const query: Record<string, string> = {
      authKey:    apiKey,
      callTp:     'L',
      returnType: 'XML',
      startPage:  '1',
      display:    '20',
      keyword:    params.keyword,
    };

    if (params.location && WORKNET_REGION_CODES[params.location]) {
      query.region = WORKNET_REGION_CODES[params.location];
    }
    if (params.career && CAREER_CODES[params.career]) {
      query.career = CAREER_CODES[params.career];
    }
    if (params.employmentType && EMP_TYPE_CODES[params.employmentType]) {
      query.empTpCd = EMP_TYPE_CODES[params.employmentType];
    }

    const { data } = await axios.get<string>(WORKNET_API_URL, { params: query, timeout: 10000, responseType: 'text' });
    const $ = cheerio.load(data, { xmlMode: true });

    const errorMessage = $('wantedRoot > message').first().text();
    if (errorMessage) {
      throw new Error(`워크넷 API 오류: ${errorMessage}`);
    }

    return $('wantedRoot > wanted').toArray().map(el => {
      const $el = $(el);
      const text = (tag: string) => $el.find(tag).first().text().trim();
      const wantedAuthNo = text('wantedAuthNo');

      return {
        id:             `worknet-${wantedAuthNo}`,
        source:         'worknet' as const,
        title:          text('title')   || '',
        company:        text('company') || '',
        location:       text('region')  || '',
        career:         text('career')  || '경력무관',
        employmentType: text('holidayTpNm') || '',
        salary:         text('sal') || text('salTpNm') || undefined,
        deadline:       text('closeDt') || undefined,
        url:            `https://www.work.go.kr/empInfo/empInfoSrch/detail/empDetailAuthView.do?wantedAuthNo=${wantedAuthNo}`,
        postedAt:       text('regDt') || undefined,
      };
    });
  } catch (err) {
    console.error('[worknet]', err);
    throw err;
  }
}

function getMockJobs(params: SearchParams): Job[] {
  const loc = params.location ? (LOCATION_LABELS[params.location] ?? '서울') : '서울';
  const kw  = params.keyword  || '개발자';

  return [
    {
      id:             'worknet-mock-1',
      source:         'worknet',
      title:          `${kw} (정규직)`,
      company:        '공공기관 IT센터',
      location:       `${loc} 중구`,
      career:         '경력 2년 이상',
      employmentType: '정규직',
      salary:         '3,500~5,000만원',
      deadline:       '2025-07-31',
      url:            'https://www.work.go.kr',
      postedAt:       '2025-06-20',
    },
    {
      id:             'worknet-mock-2',
      source:         'worknet',
      title:          `${kw} 신입 채용`,
      company:        '이노테크(주)',
      location:       `${loc} 강남구`,
      career:         '신입',
      employmentType: '정규직',
      salary:         '2,800~3,500만원',
      deadline:       '2025-08-15',
      url:            'https://www.work.go.kr',
      postedAt:       '2025-06-22',
    },
    {
      id:             'worknet-mock-3',
      source:         'worknet',
      title:          `시니어 ${kw}`,
      company:        '테크스타트업(주)',
      location:       `${loc} 마포구`,
      career:         '경력 5년 이상',
      employmentType: '정규직',
      salary:         '5,000~7,000만원',
      deadline:       '2025-07-20',
      url:            'https://www.work.go.kr',
      postedAt:       '2025-06-18',
    },
  ];
}
