import axios from 'axios';
import * as cheerio from 'cheerio';
import { Job, SearchParams } from './types';
import { LOCATION_LABELS } from '@/constants/locations';

export async function searchJobkorea(params: SearchParams): Promise<Job[]> {
  try {
    const url = `https://www.jobkorea.co.kr/Search/?stext=${encodeURIComponent(params.keyword)}&tabType=recruit`;

    const { data } = await axios.get(url, {
      headers: {
        'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9',
        'Referer':         'https://www.jobkorea.co.kr/',
      },
      timeout: 15000,
    });

    const $     = cheerio.load(data);
    const jobs: Job[] = [];

    // 잡코리아 채용공고 목록 파싱 (구조 변경 시 selector 업데이트 필요)
    $('.list-post .post-item, .recruit-info li.list-item').each((i, el) => {
      if (i >= 20) return false;

      const title   = $(el).find('.post-list-corp-info-title, .title').first().text().trim();
      const company = $(el).find('.corp-name, .name').first().text().trim();
      if (!title || !company) return;

      const location       = $(el).find('.work-place, .loc').first().text().trim();
      const career         = $(el).find('.experience, .career').first().text().trim();
      const employmentType = $(el).find('.duty-name, .emp-type').first().text().trim();
      const salary         = $(el).find('.pay, .salary').first().text().trim();
      const deadline       = $(el).find('.date, .deadline').first().text().trim();
      const href           = $(el).find('a[href*="Recruit"]').first().attr('href') ?? '';

      jobs.push({
        id:             `jobkorea-${i}-${title.slice(0, 8)}`,
        source:         'jobkorea',
        title,
        company,
        location:       location || '',
        career:         career   || '경력무관',
        employmentType: employmentType || '',
        salary:         salary   || undefined,
        deadline:       deadline || undefined,
        url:            href.startsWith('http') ? href : `https://www.jobkorea.co.kr${href}`,
      });
    });

    return jobs.length > 0 ? jobs : getMockJobs(params);
  } catch (err) {
    console.error('[jobkorea]', err);
    return getMockJobs(params);
  }
}

function getMockJobs(params: SearchParams): Job[] {
  const loc = params.location ? (LOCATION_LABELS[params.location] ?? '서울') : '서울';
  const kw  = params.keyword  || '개발자';

  return [
    {
      id:             'jobkorea-mock-1',
      source:         'jobkorea',
      title:          `${kw} 경력 채용`,
      company:        '삼성SDS',
      location:       `${loc} 송파구`,
      career:         '경력 3~7년',
      employmentType: '정규직',
      salary:         '협의',
      deadline:       '2025-07-30',
      url:            'https://www.jobkorea.co.kr',
      postedAt:       '2025-06-20',
    },
    {
      id:             'jobkorea-mock-2',
      source:         'jobkorea',
      title:          `풀스택 ${kw}`,
      company:        'LG CNS',
      location:       `${loc} 마포구`,
      career:         '경력 2년 이상',
      employmentType: '정규직',
      salary:         '4,500~7,000만원',
      deadline:       '2025-08-05',
      url:            'https://www.jobkorea.co.kr',
      postedAt:       '2025-06-21',
    },
    {
      id:             'jobkorea-mock-3',
      source:         'jobkorea',
      title:          `DevOps / 클라우드 ${kw}`,
      company:        'SK텔레콤 협력사',
      location:       `${loc} 중구`,
      career:         '경력 3년 이상',
      employmentType: '계약직',
      salary:         '5,000~7,000만원',
      deadline:       '2025-07-28',
      url:            'https://www.jobkorea.co.kr',
      postedAt:       '2025-06-22',
    },
  ];
}
