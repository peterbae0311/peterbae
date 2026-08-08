import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import {
  type LottoRow, type GenerationMode, type FilterParams,
  filterByCondition, getTopKNumbers, getTopBonusNumbers,
  generateCombinations, selectExpertPicks, getPrizeTier, calcROI,
} from '@/lib/lotto-engine';

const TIER_ORDER = ['1등', '2등', '3등', '4등', '5등', '낙첨'];

// 전체 회차 캐시 — lotto_results는 주 1회만 늘어나는데 매 백테스트 호출마다
// 전체 테이블을 재조회하던 것을 캐싱해 반복 호출(생성 버튼 클릭마다) 비용을 없앤다.
let allResultsCache: { data: LottoRow[]; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

async function loadAllResults(supabase: ReturnType<typeof createServerClient>): Promise<LottoRow[]> {
  if (allResultsCache && Date.now() - allResultsCache.fetchedAt < CACHE_TTL_MS) {
    return allResultsCache.data;
  }
  const PAGE = 1000;
  const allResults: LottoRow[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('lotto_results')
      .select('round, draw_date, num1, num2, num3, num4, num5, num6, bonus1, first_prize_winners, first_prize_amount')
      .order('round', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    allResults.push(...(data as LottoRow[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  allResultsCache = { data: allResults, fetchedAt: Date.now() };
  return allResults;
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient();

  let body: {
    startRound?: number;
    endRound?: number;
    mode?: string;
    gamesPerRound?: number;
    conditionType?: number;
    years?: number;
    months?: number;
    maxConsec?: number;
    oddCount?: number;
    sumMin?: number;
    sumMax?: number;
    minAC?: number;
  };
  try { body = await req.json(); } catch {
    return NextResponse.json({ success: false, error: '잘못된 요청 형식' }, { status: 400 });
  }

  const mode = (body.mode ?? 'anchor2') as GenerationMode;
  const gamesPerRound = Math.min(Math.max(Number(body.gamesPerRound ?? 5), 1), 20);
  const conditionParams: FilterParams = {
    conditionType: (Number(body.conditionType ?? 1)) as FilterParams['conditionType'],
    years: Number(body.years ?? 1),
    months: Number(body.months ?? 0),
    maxConsec: Number(body.maxConsec ?? 0),
    oddCount: Number(body.oddCount ?? 3),
    sumMin: Number(body.sumMin ?? 110),
    sumMax: Number(body.sumMax ?? 166),
    minAC: Number(body.minAC ?? 7),
  };

  // 전체 회차 데이터 로드 (5분 캐시)
  let allResults: LottoRow[];
  try {
    allResults = await loadAllResults(supabase);
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }

  if (allResults.length < 50) {
    return NextResponse.json({ success: false, error: '데이터 부족 (최소 50회차 필요)' }, { status: 422 });
  }

  // 테스트 범위 결정
  const minRound = allResults[0].round;
  const maxRound = allResults[allResults.length - 1].round;
  const startRound = Math.max(Number(body.startRound ?? minRound + 50), minRound + 50);
  const endRound = Math.min(Number(body.endRound ?? maxRound), maxRound);

  if (startRound > endRound) {
    return NextResponse.json({ success: false, error: '유효하지 않은 회차 범위' }, { status: 422 });
  }

  // round -> index map for O(1) lookup
  const roundIndex = new Map<number, number>();
  for (let i = 0; i < allResults.length; i++) {
    roundIndex.set(allResults[i].round, i);
  }

  // 테스트 대상 회차 (최대 200회로 제한)
  const testRounds: number[] = [];
  for (let r = startRound; r <= endRound; r++) {
    if (roundIndex.has(r)) testRounds.push(r);
  }
  const sampled = testRounds.length > 200
    ? testRounds.filter((_, i) => i % Math.ceil(testRounds.length / 200) === 0)
    : testRounds;

  // 앵커 수 결정
  const anchorCount = mode === 'anchor2' ? 2 : mode === 'anchor3' ? 3 : mode === 'anchor' ? 4 : 0;

  interface RoundResult {
    round: number;
    anchorNums: number[];
    combos: number[][];
    tiers: string[];
    bestTier: string;
  }

  const roundResults: RoundResult[] = [];
  const allTiers: string[] = [];

  for (const targetRound of sampled) {
    const targetIdx = roundIndex.get(targetRound)!;
    // 이전 회차만 사용 (데이터 누수 방지)
    const priorResults = [...allResults.slice(0, targetIdx)].reverse(); // 최신순

    if (priorResults.length < 10) continue;

    const filtered = filterByCondition(priorResults, conditionParams);
    const analysisData = filtered.length >= 10 ? filtered : priorResults;

    const { numbers: topNums } = getTopKNumbers(analysisData, Math.max(anchorCount, 6));
    const { numbers: bonusNums } = getTopBonusNumbers(analysisData);

    const anchorNums = anchorCount > 0 ? topNums.slice(0, anchorCount) : [];

    // gamesPerRound개만 최종 사용하므로 후보군은 3배만 뽑아 selectExpertPicks가 고르게 한다
    // (10배는 생성 비용(생성 로직이 count에 비선형으로 스케일링됨)에 비해 과했다)
    const rawCombos = generateCombinations(mode, {
      count: Math.min(gamesPerRound * 3, 50),
      anchorNumbers: anchorNums,
      bonusNumbers: bonusNums.slice(0, 5),
    });

    const expertCombos = selectExpertPicks(rawCombos, anchorNums, bonusNums.slice(0, 5), topNums.slice(0, 6));
    const combos = expertCombos.slice(0, gamesPerRound);

    if (combos.length === 0) continue;

    const actual = allResults[targetIdx];
    const winSet = new Set([actual.num1, actual.num2, actual.num3, actual.num4, actual.num5, actual.num6]);

    const tiers = combos.map(combo => {
      const mc = combo.filter(n => winSet.has(n)).length;
      const bm = mc === 5 && actual.bonus1 != null && combo.includes(actual.bonus1);
      return getPrizeTier(mc, bm);
    });

    const bestTierIdx = Math.min(...tiers.map(t => TIER_ORDER.indexOf(t)));
    const bestTier = TIER_ORDER[bestTierIdx] ?? '낙첨';

    roundResults.push({ round: targetRound, anchorNums, combos, tiers, bestTier });
    allTiers.push(...tiers);
  }

  // 집계
  const tierCounts: Record<string, number> = { '1등': 0, '2등': 0, '3등': 0, '4등': 0, '5등': 0, '낙첨': 0 };
  const bestTierCounts: Record<string, number> = { '1등': 0, '2등': 0, '3등': 0, '4등': 0, '5등': 0, '낙첨': 0 };
  for (const t of allTiers) tierCounts[t] = (tierCounts[t] ?? 0) + 1;
  for (const r of roundResults) bestTierCounts[r.bestTier] = (bestTierCounts[r.bestTier] ?? 0) + 1;

  const totalRounds = roundResults.length;
  const hitRate5Plus = totalRounds > 0
    ? roundResults.filter(r => r.bestTier !== '낙첨').length / totalRounds * 100
    : 0;
  const hitRate3Plus = totalRounds > 0
    ? roundResults.filter(r => ['1등', '2등', '3등'].includes(r.bestTier)).length / totalRounds * 100
    : 0;
  const roi = calcROI(allTiers);

  // 시뮬레이션 전체 회차에서 앵커로 쓰인 번호의 등장 빈도를 집계 — 가장 자주 앵커로
  // 선택됐던 상위 anchorCount개를 "백테스트가 추천하는 앵커번호"로 반환 (앵커모드가 아니면 빈 배열)
  const anchorTally: Record<number, number> = {};
  for (const r of roundResults) {
    r.anchorNums.forEach(n => { anchorTally[n] = (anchorTally[n] ?? 0) + 1; });
  }
  const recommendedAnchors = Object.entries(anchorTally)
    .sort((a, b) => b[1] - a[1] || Number(a[0]) - Number(b[0]))
    .slice(0, anchorCount)
    .map(([n]) => Number(n))
    .sort((a, b) => a - b);

  return NextResponse.json({
    success: true,
    data: {
      mode,
      totalRounds,
      totalGames: allTiers.length,
      startRound: sampled[0] ?? startRound,
      endRound: sampled[sampled.length - 1] ?? endRound,
      tierCounts,
      bestTierCounts,
      hitRate5Plus: Math.round(hitRate5Plus * 10) / 10,
      hitRate3Plus: Math.round(hitRate3Plus * 10) / 10,
      roi: Math.round(roi * 10) / 10,
      recommendedAnchors,
      // 최근 20회차 상세 결과 (UI 표시용)
      recentResults: roundResults.slice(-20).map(r => ({
        round: r.round,
        anchorNums: r.anchorNums,
        bestTier: r.bestTier,
        tiers: r.tiers,
      })),
    },
  });
}
