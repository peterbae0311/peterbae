import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { type LottoRow, getTopKNumbers, getTopBonusNumbers, getDistribution, filterByCondition, type FilterParams } from '@/lib/lotto-engine';

export async function POST(req: NextRequest) {
  const supabase = createServerClient();

  let body: {
    conditionType?: number; years?: number; months?: number;
    maxConsec?: number;
    oddCount?: number; sumMin?: number; sumMax?: number; minAC?: number;
    minBands?: number; lowCount?: number; primeCount?: number; minUniqueTails?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: '잘못된 요청 형식입니다.' }, { status: 400 });
  }

  const conditionType = Number(body.conditionType ?? 1) as FilterParams['conditionType'];

  // 전체 회차 페이지네이션 fetch
  const PAGE = 1000;
  const allResults: LottoRow[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('lotto_results')
      .select('round, draw_date, num1, num2, num3, num4, num5, num6, bonus1, first_prize_winners, first_prize_amount')
      .order('round', { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    if (!data || data.length === 0) break;
    allResults.push(...(data as LottoRow[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }

  const params: FilterParams = {
    conditionType,
    years: Number(body.years ?? 0),
    months: Number(body.months ?? 0),
    maxConsec: Number(body.maxConsec ?? 0),
    oddCount: Number(body.oddCount ?? 3),
    sumMin: Number(body.sumMin ?? 110),
    sumMax: Number(body.sumMax ?? 166),
    minAC: Number(body.minAC ?? 7),
    minBands: body.minBands != null ? Number(body.minBands) : undefined,
    lowCount: body.lowCount != null ? Number(body.lowCount) : undefined,
    primeCount: body.primeCount != null ? Number(body.primeCount) : undefined,
    minUniqueTails: body.minUniqueTails != null ? Number(body.minUniqueTails) : undefined,
  };

  const filteredResults = filterByCondition(allResults, params);

  if (filteredResults.length < 30) {
    return NextResponse.json({
      success: false,
      error: `필터링 결과가 너무 적습니다. (${filteredResults.length}회차 — 최소 30회차 필요)`,
    }, { status: 422 });
  }

  const { numbers, frequencies } = getTopKNumbers(filteredResults, 6);
  if (numbers.length < 6) {
    return NextResponse.json({ success: false, error: '충분한 데이터가 없습니다.' }, { status: 422 });
  }

  const distribution = getDistribution(filteredResults);
  const { numbers: bonusNumbers, frequencies: bonusFrequencies } = getTopBonusNumbers(filteredResults);

  return NextResponse.json({
    success: true,
    data: { numbers, frequencies, rounds_analyzed: filteredResults.length, distribution, bonusNumbers, bonusFrequencies },
  });
}
