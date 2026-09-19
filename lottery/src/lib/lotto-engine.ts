// Shared computation engine — pure functions, no I/O

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LottoRow {
  round: number;
  draw_date: string;
  num1: number;
  num2: number;
  num3: number;
  num4: number;
  num5: number;
  num6: number;
  bonus1: number | null;
  first_prize_winners: number | null;
  first_prize_amount: number | null;
}

export interface FilterParams {
  conditionType: 1 | 4 | 5 | 6 | 7 | 8 | 10 | 11 | 12;
  years?: number;
  months?: number;
  maxConsec?: number;      // 0=없음, 2=2개, 3+=3이상
  oddCount?: number;
  sumMin?: number;
  sumMax?: number;
  minAC?: number;          // conditionType 7: AC값 하한
  minBands?: number;       // conditionType 8: 최소 밴드 수 (4 or 5)
  primeCount?: number;     // conditionType 10: 소수 포함 개수
  minUniqueTails?: number; // conditionType 11: 최소 고유 끝수 개수
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

// Internal helper — accepts pre-built Sets to avoid repeated construction when
// scoring many combos in a batch (e.g. selectExpertPicks scores 350 at once).
function _scoreCombo(combo: number[], bonusSet: Set<number>, freqSet: Set<number>): number {
  const s = [...combo].sort((a, b) => a - b);
  let score = 0;

  // 밴드 커버리지 (3밴드=5, 4밴드=10, 5밴드=15)
  const bandCount = [
    s.some(n => n <= 9), s.some(n => n >= 10 && n <= 19),
    s.some(n => n >= 20 && n <= 29), s.some(n => n >= 30 && n <= 39),
    s.some(n => n >= 40),
  ].filter(Boolean).length;
  score += Math.max(0, (bandCount - 2) * 5);

  // 홀짝 균형 (실제 당첨 분포 반영: 3:3=20, 2:4=15, 1:5=6)
  const odds = s.filter(n => n % 2 === 1).length;
  const oddDev = Math.abs(odds - 3);
  score += oddDev === 0 ? 20 : oddDev === 1 ? 15 : oddDev === 2 ? 6 : 0;

  // 합계 범위 (평균 138 기준: ±1σ +20, ±1.5σ +10)
  const sum = s.reduce((a, b) => a + b, 0);
  if (sum >= 108 && sum <= 168) score += 20;
  else if (sum >= 93 && sum <= 183) score += 10;

  // 끝자리 다양성 (max 15)
  const tails = new Set(s.map(n => n % 10));
  score += Math.min(tails.size * 3, 15);

  // 연속쌍 3개 이상 페널티
  let consecPairs = 0;
  for (let i = 0; i < s.length - 1; i++) {
    if (s[i + 1] - s[i] === 1) consecPairs++;
  }
  if (consecPairs >= 3) score -= 10;

  // 2등 전략: 보너스 후보 포함 시 가점
  score += combo.filter(n => bonusSet.has(n)).length * 5;

  // 3등 전략: 빈도 상위 포함 시 가점
  score += combo.filter(n => freqSet.has(n)).length * 2;

  return score;
}

// Public API — builds Sets internally; use this for single-combo scoring.
// For batch scoring, prefer calling _scoreCombo with shared Sets (see selectExpertPicks).
export function scoreCombo(combo: number[], bonusCandidates: number[] = [], topFreqNums: number[] = []): number {
  return _scoreCombo(combo, new Set(bonusCandidates), new Set(topFreqNums));
}

export function selectExpertPicks(
  combos: number[][],
  bonusCandidates: number[] = [],
  topFreqNums: number[] = [],
): number[][] {
  if (combos.length <= 5) return combos;
  // Build Sets ONCE — reused across all 350 _scoreCombo calls instead of
  // constructing 700 Sets (350 × bonusSet + 350 × freqSet) per invocation.
  const bonusSet = new Set(bonusCandidates);
  const freqSet = new Set(topFreqNums);

  const scored = [...combos]
    .map((combo, i) => ({
      combo, i,
      // Math.random() * 10 노이즈: 비슷한 점수 조합의 풀 진입 순위를 매 호출마다 다르게
      // → 상위 20개 후보가 달라지고 그리디 결과도 달라짐
      score: _scoreCombo(combo, bonusSet, freqSet) + Math.random() * 10,
    }))
    .sort((a, b) => b.score - a.score || a.i - b.i);

  // 상위 20개(최소 15%) 후보 추출
  const poolSize = Math.min(scored.length, Math.max(20, Math.ceil(scored.length * 0.15)));
  const pool = scored.slice(0, poolSize);

  // 다양성 우선 그리디 선택
  // selectedSets: 외부 루프 iteration당 1회 생성 (내부 루프마다 재생성하던 것 제거)
  const selected: number[][] = [];
  const remaining = [...pool];
  while (selected.length < 5 && remaining.length > 0) {
    const selectedSets = selected.map(sel => new Set(sel));
    let bestIdx = 0;
    let bestAdj = -Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const penalty = selectedSets.reduce((pen, selSet) => {
        const shared = remaining[i].combo.filter(n => selSet.has(n)).length;
        return pen + shared * 10;
      }, 0);
      const adj = remaining[i].score - penalty;
      if (adj > bestAdj) { bestAdj = adj; bestIdx = i; }
    }
    selected.push(remaining[bestIdx].combo);
    remaining.splice(bestIdx, 1);
  }
  return selected;
}

// 구조적 점수만의 최댓값(밴드15+홀짝20+합계20+끝수15) — 보너스후보/빈도상위 매치가
// 하나도 없으면 이 이상 못 올라간다. 임계값이 이보다 높으면 절대 도달 불가능하다.
const MAX_STRUCTURAL_SCORE = 70;

// minScore 이상인 조합만 count개를 찾을 때까지 무작위 조합을 계속 생성한다.
// (기존 selectExpertPicks처럼 "생성된 N개 중 상위 5개"가 아니라, 목표 점수를
// 만족하는 조합이 나올 때까지 직접 탐색 — Claude 추천 5개가 항상 임계값을 넘도록 보장한다)
export function generateHighScoreCombos(
  bonusCandidates: number[] = [],
  topFreqNums: number[] = [],
  options: { minScore?: number; count?: number; maxAttempts?: number; exclude?: Set<string>; excludeNumbers?: number[] } = {},
): { combos: number[][]; scores: number[]; reachable: boolean } {
  const { minScore = 80, count = 5, maxAttempts = 100000, exclude, excludeNumbers = [] } = options;
  const bonusSet = new Set(bonusCandidates);
  const freqSet = new Set(topFreqNums);
  // excludeNumbers에 담긴 번호는 후보 풀에서 완전히 제외 — 다른 그룹과 번호가 겹치지 않도록 한다.
  const excludeNumSet = new Set(excludeNumbers);
  const fullPool = Array.from({ length: 45 }, (_, i) => i + 1).filter(n => !excludeNumSet.has(n));

  // 보너스후보/빈도상위가 비어있으면(조건분석 미실행) 구조점수만으로는 임계값에
  // 절대 못 미치므로 — 무의미한 탐색을 반복하지 않고 즉시 포기한다.
  const reachable = MAX_STRUCTURAL_SCORE + bonusCandidates.length * 5 + Math.min(6, topFreqNums.length) * 2 >= minScore;

  // exclude로 넘어온 조합(다른 그룹에서 이미 채택된 조합)은 재선정하지 않는다.
  const seen = new Set<string>(exclude);
  const qualifying: { combo: number[]; score: number }[] = [];
  const best: { combo: number[]; score: number }[] = [];

  if (reachable) {
    for (let attempt = 0; attempt < maxAttempts && qualifying.length < count; attempt++) {
      const combo = uniformSample(fullPool).sort((a, b) => a - b);
      const key = combo.join(',');
      if (seen.has(key)) continue;
      seen.add(key);
      const score = _scoreCombo(combo, bonusSet, freqSet);
      if (score >= minScore) qualifying.push({ combo, score });
      else best.push({ combo, score });
    }
  }

  if (qualifying.length >= count) {
    qualifying.sort((a, b) => b.score - a.score);
    const top = qualifying.slice(0, count);
    return { combos: top.map(q => q.combo), scores: top.map(q => q.score), reachable: true };
  }

  // 극히 드문 경우(또는 애초에 도달 불가능한 경우) — 지금까지 찾은 것 중 점수 높은 순으로 채움
  const fallback = [...qualifying, ...best].sort((a, b) => b.score - a.score).slice(0, count);
  return { combos: fallback.map(q => q.combo), scores: fallback.map(q => q.score), reachable: qualifying.length >= count };
}

// ---------------------------------------------------------------------------
// Prize
// ---------------------------------------------------------------------------

export function getPrizeTier(matchCount: number, bonusMatch: boolean): string {
  if (matchCount === 6) return '1등';
  if (matchCount === 5 && bonusMatch) return '2등';
  if (matchCount === 5) return '3등';
  if (matchCount === 4) return '4등';
  if (matchCount === 3) return '5등';
  return '낙첨';
}

// 평균 당첨금 (ROI 추정용)
const PRIZE_AMOUNTS: Record<string, number> = {
  '1등': 2_000_000_000,
  '2등': 60_000_000,
  '3등': 1_500_000,
  '4등': 50_000,
  '5등': 5_000,
  '낙첨': 0,
};

export function calcROI(gameTiers: string[], costPerGame = 1000): number {
  const totalCost = gameTiers.length * costPerGame;
  const totalPrize = gameTiers.reduce((s, t) => s + (PRIZE_AMOUNTS[t] ?? 0), 0);
  return totalCost === 0 ? 0 : (totalPrize - totalCost) / totalCost * 100;
}

// ---------------------------------------------------------------------------
// AC값 — 조합 다양성 지표 (range: 0~10 for 6 numbers)
// ---------------------------------------------------------------------------

export function calcAC(combo: number[]): number {
  const diffs = new Set<number>();
  for (let i = 0; i < combo.length; i++) {
    for (let j = i + 1; j < combo.length; j++) {
      diffs.add(Math.abs(combo[i] - combo[j]));
    }
  }
  return diffs.size - (combo.length - 1);
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

export function getTopKNumbers(results: LottoRow[], k: number): { numbers: number[]; frequencies: number[] } {
  const freq: Record<number, number> = {};
  for (const row of results) {
    for (const num of [row.num1, row.num2, row.num3, row.num4, row.num5, row.num6]) {
      if (num != null) freq[num] = (freq[num] ?? 0) + 1;
    }
  }
  const topK = Object.entries(freq)
    .map(([num, count]) => ({ num: Number(num), count }))
    .sort((a, b) => b.count - a.count || a.num - b.num)
    .slice(0, k);
  return { numbers: topK.map(x => x.num), frequencies: topK.map(x => x.count) };
}

// 미출현 번호: results(최신순 정렬)에서 마지막으로 등장한 이후 경과한 회차 수(streak)가
// 가장 큰(=가장 오래 안 나온) 번호 k개를 뽑는다. 한 번도 안 나온 번호는 results.length로 취급.
export function getAbsentNumbers(results: LottoRow[], k: number): { numbers: number[]; streaks: number[] } {
  const lastSeenIndex = new Map<number, number>();
  results.forEach((row, i) => {
    for (const num of [row.num1, row.num2, row.num3, row.num4, row.num5, row.num6]) {
      if (num != null && !lastSeenIndex.has(num)) lastSeenIndex.set(num, i);
    }
  });
  const ranked = Array.from({ length: 45 }, (_, idx) => {
    const num = idx + 1;
    return { num, streak: lastSeenIndex.get(num) ?? results.length };
  }).sort((a, b) => b.streak - a.streak || a.num - b.num).slice(0, k);
  return { numbers: ranked.map(r => r.num), streaks: ranked.map(r => r.streak) };
}

export function getTopBonusNumbers(results: LottoRow[]): { numbers: number[]; frequencies: number[] } {
  const freq: Record<number, number> = {};
  for (const row of results) {
    if (row.bonus1 != null) freq[row.bonus1] = (freq[row.bonus1] ?? 0) + 1;
  }
  const top = Object.entries(freq)
    .map(([num, count]) => ({ num: Number(num), count }))
    .sort((a, b) => b.count - a.count || a.num - b.num)
    .slice(0, 10);
  return { numbers: top.map(x => x.num), frequencies: top.map(x => x.count) };
}

export function getDistribution(results: LottoRow[]): number[] {
  const ranges = [0, 0, 0, 0, 0];
  for (const row of results) {
    for (const num of [row.num1, row.num2, row.num3, row.num4, row.num5, row.num6]) {
      if (num == null) continue;
      if      (num <= 9)  ranges[0]++;
      else if (num <= 19) ranges[1]++;
      else if (num <= 29) ranges[2]++;
      else if (num <= 39) ranges[3]++;
      else                ranges[4]++;
    }
  }
  return ranges;
}

const PRIMES = new Set([2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43]);

// results는 round 내림차순(최신순)으로 정렬되어 있어야 함
export function filterByCondition(results: LottoRow[], params: FilterParams): LottoRow[] {
  const { conditionType } = params;

  if (conditionType === 4) {
    const maxConsec = params.maxConsec ?? 0;
    return results.filter(r => {
      const nums = [r.num1, r.num2, r.num3, r.num4, r.num5, r.num6]
        .filter((n): n is number => n != null)
        .sort((a, b) => a - b);
      let maxRun = 1, curRun = 1;
      for (let i = 1; i < nums.length; i++) {
        if (nums[i] - nums[i - 1] === 1) { curRun++; maxRun = Math.max(maxRun, curRun); }
        else curRun = 1;
      }
      if (maxConsec === 0) return maxRun === 1;
      if (maxConsec === 2) return maxRun === 2;
      return maxRun >= 3;
    });
  }
  if (conditionType === 5) {
    const oddCount = params.oddCount ?? 3;
    return results.filter(r => {
      const nums = [r.num1, r.num2, r.num3, r.num4, r.num5, r.num6].filter((n): n is number => n != null);
      return nums.filter(n => n % 2 === 1).length === oddCount;
    });
  }
  if (conditionType === 6) {
    const sumMin = params.sumMin ?? 110;
    const sumMax = params.sumMax ?? 166;
    return results.filter(r => {
      const nums = [r.num1, r.num2, r.num3, r.num4, r.num5, r.num6].filter((n): n is number => n != null);
      const s = nums.reduce((a, b) => a + b, 0);
      return s >= sumMin && s <= sumMax;
    });
  }
  if (conditionType === 7) {
    const minAC = params.minAC ?? 7;
    return results.filter(r => {
      const nums = [r.num1, r.num2, r.num3, r.num4, r.num5, r.num6].filter((n): n is number => n != null);
      return calcAC(nums) >= minAC;
    });
  }
  if (conditionType === 8) {
    const minBands = params.minBands ?? 5;
    return results.filter(r => {
      const nums = [r.num1, r.num2, r.num3, r.num4, r.num5, r.num6].filter((n): n is number => n != null);
      const bandCount = [
        nums.some(n => n >= 1 && n <= 9),
        nums.some(n => n >= 10 && n <= 19),
        nums.some(n => n >= 20 && n <= 29),
        nums.some(n => n >= 30 && n <= 39),
        nums.some(n => n >= 40 && n <= 45),
      ].filter(Boolean).length;
      return bandCount >= minBands;
    });
  }
  if (conditionType === 10) {
    // 소수 포함 수: 소수(2,3,5,...,43)가 정확히 primeCount개인 회차
    const primeCount = params.primeCount ?? 2;
    return results.filter(r => {
      const nums = [r.num1, r.num2, r.num3, r.num4, r.num5, r.num6].filter((n): n is number => n != null);
      return nums.filter(n => PRIMES.has(n)).length === primeCount;
    });
  }
  if (conditionType === 11) {
    // 끝수 다양성: 6개 번호의 끝자리(0~9)가 minUniqueTails개 이상 고유한 회차
    const minUniqueTails = params.minUniqueTails ?? 5;
    return results.filter(r => {
      const nums = [r.num1, r.num2, r.num3, r.num4, r.num5, r.num6].filter((n): n is number => n != null);
      return new Set(nums.map(n => n % 10)).size >= minUniqueTails;
    });
  }
  // conditionType === 1: 기간 기준
  const years = params.years ?? 0;
  const months = params.months ?? 0;
  const limit = years > 0 || months > 0 ? Math.round(years * 52 + months * (52 / 12)) : null;
  return limit != null ? results.slice(0, limit) : results;
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

export function uniformSample(pool: number[]): number[] {
  const p = [...pool];
  const result: number[] = [];
  while (result.length < 6 && p.length > 0) {
    const idx = Math.floor(Math.random() * p.length);
    result.push(p[idx]);
    p.splice(idx, 1);
  }
  return result;
}

export function generateCombinations(count: number): number[][] {
  const fullPool = Array.from({ length: 45 }, (_, i) => i + 1);
  return Array.from({ length: count }, () => uniformSample(fullPool).sort((a, b) => a - b));
}

