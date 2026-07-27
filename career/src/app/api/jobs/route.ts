import { NextRequest, NextResponse } from 'next/server';
import { searchAllJobs } from '@/lib/jobs';
import { SearchParams } from '@/lib/jobs/types';
import { serverEnv } from '@/lib/env.server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const keyword = searchParams.get('keyword')?.trim() ?? '';
  if (!keyword) {
    return NextResponse.json({ error: '검색어를 입력해주세요.' }, { status: 400 });
  }

  const params: SearchParams = {
    keyword,
    location:       searchParams.get('location')       || undefined,
    career:         searchParams.get('career')         || undefined,
    employmentType: searchParams.get('employmentType') || undefined,
    minSalary:      searchParams.get('minSalary')      ? Number(searchParams.get('minSalary')) : undefined,
  };

  try {
    const results = await searchAllJobs(params);
    const total   = results.reduce((sum, r) => sum + r.total, 0);
    const isDemo  = !serverEnv.saraminApiKey && !serverEnv.worknetApiKey;

    return NextResponse.json({ results, total, isDemo });
  } catch (err) {
    console.error('[/api/jobs]', err);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
