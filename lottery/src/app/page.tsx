'use client';

import { useEffect, useState, useCallback, useRef, useMemo, type ReactNode } from 'react';
import { scoreCombo, selectExpertPicks, getPrizeTier } from '@/lib/lotto-engine';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LottoResult {
  id: number;
  round: number;
  draw_date: string;
  num1: number | null;
  num2: number | null;
  num3: number | null;
  num4: number | null;
  num5: number | null;
  num6: number | null;
  bonus1: number | null;
  bonus2: number | null;
  first_prize_winners: number | null;
  first_prize_amount: number | null;
}

type ConditionType = 1 | 4 | 5 | 6 | 7 | 8 | 10 | 11;

interface ConditionRow {
  id: string;
  conditionType: ConditionType;
  years: number;
  months: number;
  maxConsec: number;       // 0=없음, 2=2개, 3=3개+
  oddCount: number;        // 홀수 개수 (0~6)
  sumMin: number;          // 합계 최소
  sumMax: number;          // 합계 최대
  minAC: number;           // conditionType 7: AC값 하한
  minBands: number;        // conditionType 8: 최소 밴드 수 (4 or 5)
  primeCount: number;      // conditionType 10: 소수 포함 개수
  minUniqueTails: number;  // conditionType 11: 최소 고유 끝수 개수
  roundsAnalyzed: number | null;
  numbers: number[] | null;
  frequencies: number[] | null;
  distribution: number[] | null; // [01-09, 10-19, 20-29, 30-39, 40-45]
  bonusNumbers: number[] | null; // 보너스 번호 빈도 상위 10개
  isLoading: boolean;
}

interface ConfirmedPurchase {
  id: number;
  target_round: number;
  combos: number[][];
  confirmed_at: string;
  generation_mode?: string | null;
  prize_tier?: string | null;
  matched_numbers?: number[] | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatAmount(amount: number | null): string {
  if (amount == null) return '-';
  return amount.toLocaleString('ko-KR') + '원';
}

function makeId(): string {
  return Math.random().toString(36).slice(2, 10);
}


const GENERATION_STRATEGY: { tag: string; color: string; desc: string }[] = [
  { tag: '순수 랜덤', color: 'bg-gray-100 text-gray-600', desc: '1~45에서 6개 완전 무작위 추출 — 어떠한 필터도 적용하지 않음' },
  { tag: 'Claude 추천 5개', color: 'bg-violet-100 text-violet-700', desc: '생성된 조합 중 조건분석 기반 보너스후보·빈도상위 번호를 많이 포함한 상위 5개를 골라 보여줌' },
];

const MODE_LABELS: Record<string, string> = {
  anchor2: '앵커2', anchor3: '앵커3', anchor: '앵커4', 'no-consec': '연속없음', 'two-consec': '연속2개', random: '랜덤',
};

const MODE_ORDER: Record<string, number> = {
  anchor2: 0, anchor3: 1, anchor: 2, 'no-consec': 3, 'two-consec': 4, random: 5,
};

function selectBestPurchases(
  purchases: ConfirmedPurchase[],
  actual: LottoResult | undefined,
  bonusCandidates: number[] = [],
  topFreqNums: number[] = [],
): { purchase: ConfirmedPurchase; reason: string }[] {
  if (purchases.length < 2) return purchases.map(p => ({ purchase: p, reason: '' }));
  const tierOrder = ['1등', '2등', '3등', '4등', '5등', '낙첨'];
  const winSet = actual
    ? new Set([actual.num1, actual.num2, actual.num3, actual.num4, actual.num5, actual.num6].filter((n): n is number => n != null))
    : new Set<number>();
  const sorted = [...purchases].sort((a, b) =>
    (MODE_ORDER[a.generation_mode ?? ''] ?? 99) - (MODE_ORDER[b.generation_mode ?? ''] ?? 99)
  );
  const scored = sorted.map(p => {
    const mode = p.generation_mode ?? '';
    if (actual) {
      const analyses = p.combos.map(combo => {
        const mc = combo.filter(n => winSet.has(n)).length;
        const bm = mc === 5 && actual.bonus1 != null && combo.includes(actual.bonus1);
        return { mc, tier: getPrizeTier(mc, bm) };
      });
      const bestTierIdx = Math.min(...analyses.map(a => tierOrder.indexOf(a.tier)));
      const avgMatch = analyses.reduce((s, a) => s + a.mc, 0) / analyses.length;
      return { p, mode, bestTierIdx, avgMatch, reason: `최고 ${tierOrder[bestTierIdx] ?? '낙첨'} · 평균 ${avgMatch.toFixed(1)}개 일치` };
    } else {
      const avgScore = p.combos.reduce((s, c) => s + scoreCombo(c, bonusCandidates, topFreqNums), 0) / p.combos.length;
      return { p, mode, bestTierIdx: 999, avgMatch: avgScore, reason: '' };
    }
  });
  if (actual) {
    return scored
      .sort((a, b) => a.bestTierIdx !== b.bestTierIdx ? a.bestTierIdx - b.bestTierIdx : b.avgMatch - a.avgMatch)
      .slice(0, 2)
      .map(s => ({ purchase: s.p, reason: s.reason }));
  } else {
    const byScore = [...scored].sort((a, b) => b.avgMatch - a.avgMatch);
    const first = byScore[0];
    const secondDiff = byScore.find(s => s.p.id !== first.p.id && s.mode !== first.mode);
    const secondSame = byScore.find(s => s.p.id !== first.p.id);
    const second = secondDiff ?? secondSame;
    const result: { purchase: ConfirmedPurchase; reason: string }[] = [
      { purchase: first.p, reason: `최고 점수 ${first.avgMatch.toFixed(0)}점` },
    ];
    if (second) {
      result.push({
        purchase: second.p,
        reason: secondDiff
          ? `${MODE_LABELS[second.mode] ?? second.mode} 다양성 확보`
          : `2위 점수 ${second.avgMatch.toFixed(0)}점`,
      });
    }
    return result;
  }
}

function buildConditionText(c: Pick<ConditionRow, 'conditionType' | 'years' | 'months' | 'maxConsec' | 'oddCount' | 'sumMin' | 'sumMax' | 'minAC' | 'minBands' | 'primeCount' | 'minUniqueTails'>): string {
  const { conditionType, years, months, maxConsec, oddCount, sumMin, sumMax, minAC, minBands, primeCount, minUniqueTails } = c;
  if (conditionType === 4) {
    const label = maxConsec === 0 ? '없음' : maxConsec === 2 ? '2개' : '3개+';
    return `연속번호 ${label} 회차에서 가장 많이 나온 숫자 6개 추출`;
  }
  if (conditionType === 5) return `홀수 ${oddCount}개 회차에서 가장 많이 나온 숫자 6개 추출`;
  if (conditionType === 6) return `합계 ${sumMin}~${sumMax} 범위 회차에서 가장 많이 나온 숫자 6개 추출`;
  if (conditionType === 7) return `AC값 ${minAC} 이상 회차에서 가장 많이 나온 숫자 6개 추출`;
  if (conditionType === 8) return `${minBands ?? 5}밴드 이상 커버 회차에서 가장 많이 나온 숫자 6개 추출`;
  if (conditionType === 10) return `소수 ${primeCount ?? 2}개 포함 회차에서 가장 많이 나온 숫자 6개 추출`;
  if (conditionType === 11) return `끝수 ${minUniqueTails ?? 5}종 이상 회차에서 가장 많이 나온 숫자 6개 추출`;
  if (years === 0 && months === 0) return '전체 당첨번호에서 가장 많이 나온 숫자 6개 추출';
  const parts: string[] = [];
  if (years > 0) parts.push(`${years}년`);
  if (months > 0) parts.push(`${months}개월`);
  return `최근 ${parts.join(' ')} 당첨번호에서 가장 많이 나온 숫자 6개 추출`;
}

function parseConditionText(text: string): Omit<ConditionRow, 'id' | 'roundsAnalyzed' | 'numbers' | 'frequencies' | 'distribution' | 'bonusNumbers' | 'isLoading'> {
  const base = { years: 0, months: 0, maxConsec: 0, oddCount: 3, sumMin: 110, sumMax: 166, minAC: 7, minBands: 5, primeCount: 2, minUniqueTails: 5 };
  if (text.includes('연속번호')) {
    const m = text.match(/연속번호 (없음|2개|3개\+)/);
    const label = m ? m[1] : '없음';
    return { ...base, conditionType: 4, maxConsec: label === '없음' ? 0 : label === '2개' ? 2 : 3 };
  }
  if (text.includes('홀수')) {
    const m = text.match(/홀수 (\d+)개/);
    return { ...base, conditionType: 5, oddCount: m ? parseInt(m[1]) : 3 };
  }
  if (text.includes('합계')) {
    const m = text.match(/합계 (\d+)~(\d+)/);
    return { ...base, conditionType: 6, sumMin: m ? parseInt(m[1]) : 110, sumMax: m ? parseInt(m[2]) : 166 };
  }
  if (text.includes('AC값')) {
    const m = text.match(/AC값 (\d+)/);
    return { ...base, conditionType: 7, minAC: m ? parseInt(m[1]) : 7 };
  }
  if (text.includes('밴드')) {
    const m = text.match(/(\d+)밴드/);
    return { ...base, conditionType: 8, minBands: m ? parseInt(m[1]) : 5 };
  }
  if (text.includes('소수')) {
    const m = text.match(/소수 (\d+)개/);
    return { ...base, conditionType: 10, primeCount: m ? parseInt(m[1]) : 2 };
  }
  if (text.includes('끝수')) {
    const m = text.match(/끝수 (\d+)종/);
    return { ...base, conditionType: 11, minUniqueTails: m ? parseInt(m[1]) : 5 };
  }
  const yearMatch = text.match(/(\d+)년/);
  const monthMatch = text.match(/(\d+)개월/);
  return { ...base, conditionType: 1, years: yearMatch ? parseInt(yearMatch[1]) : 0, months: monthMatch ? parseInt(monthMatch[1]) : 0 };
}


function rowToApiBody(row: ConditionRow) {
  return {
    conditionType: row.conditionType,
    years: row.years, months: row.months,
    maxConsec: row.maxConsec,
    oddCount: row.oddCount, sumMin: row.sumMin, sumMax: row.sumMax, minAC: row.minAC,
    minBands: row.minBands, primeCount: row.primeCount, minUniqueTails: row.minUniqueTails,
  };
}

const BLANK_ROW = { roundsAnalyzed: null, numbers: null, frequencies: null, distribution: null, bonusNumbers: null, isLoading: false };
const ROW_DEFAULTS = { maxConsec: 0, oddCount: 3, sumMin: 110, sumMax: 166, minAC: 7, minBands: 5, primeCount: 2, minUniqueTails: 5 };
const DEFAULT_CONDITIONS: ConditionRow[] = [
  { id: makeId(), conditionType: 1, years: 0, months: 1,  ...ROW_DEFAULTS, ...BLANK_ROW },
  { id: makeId(), conditionType: 1, years: 0, months: 3,  ...ROW_DEFAULTS, ...BLANK_ROW },
  { id: makeId(), conditionType: 1, years: 0, months: 6,  ...ROW_DEFAULTS, ...BLANK_ROW },
  { id: makeId(), conditionType: 1, years: 1, months: 0,  ...ROW_DEFAULTS, ...BLANK_ROW },
  { id: makeId(), conditionType: 1, years: 0, months: 0,  ...ROW_DEFAULTS, ...BLANK_ROW },
  { id: makeId(), conditionType: 5, years: 0, months: 0,  ...ROW_DEFAULTS, oddCount: 3,  ...BLANK_ROW },
  { id: makeId(), conditionType: 6, years: 0, months: 0,  ...ROW_DEFAULTS, sumMin: 110, sumMax: 166, ...BLANK_ROW },
];

// ---------------------------------------------------------------------------
// NumberBall
// ---------------------------------------------------------------------------

function getLottoColor(num: number): string {
  if (num <= 10) return 'bg-yellow-400 text-white';
  if (num <= 20) return 'bg-blue-500 text-white';
  if (num <= 30) return 'bg-red-500 text-white';
  if (num <= 40) return 'bg-slate-500 text-white';
  return 'bg-green-500 text-white';
}

function NumberBall({ num, size = 'md', freq, hoverFreq, highlighted }: { num: number | null; size?: 'sm' | 'md' | 'lg'; freq?: number; hoverFreq?: number; highlighted?: boolean }) {
  if (num == null) {
    const dim = size === 'lg' ? 'w-12 h-12 text-base' : size === 'sm' ? 'w-8 h-8 text-sm' : 'w-10 h-10 text-sm';
    return <span className={`inline-flex items-center justify-center ${dim} rounded-full bg-gray-100 text-gray-400 `}>-</span>;
  }

  const colorClass = highlighted ? getLottoColor(num) : 'bg-white border border-gray-300 text-gray-500';

  if (freq != null) {
    const dim = size === 'lg' ? 'w-14 h-14' : size === 'sm' ? 'w-10 h-10' : 'w-12 h-12';
    const numText = size === 'lg' ? 'text-base' : size === 'sm' ? 'text-xs' : 'text-sm';
    const freqText = size === 'lg' ? 'text-[12px]' : 'text-[9px]';
    return (
      <span className={`inline-flex flex-col items-center justify-center ${dim} rounded-full ${colorClass}  leading-none gap-0.5`}>
        <span className={numText}>{String(num).padStart(2, '0')}</span>
        <span className={`${freqText} opacity-80`}>{freq}회</span>
      </span>
    );
  }

  const dim = size === 'lg' ? 'w-12 h-12 text-base' : size === 'sm' ? 'w-8 h-8 text-sm' : 'w-10 h-10 text-sm';
  const ball = (
    <span className={`inline-flex items-center justify-center ${dim} rounded-full ${colorClass} `}>
      {String(num).padStart(2, '0')}
    </span>
  );

  // 호버 시 빈도 표시 (hoverFreq)
  if (hoverFreq != null) {
    return (
      <span className="relative group inline-flex flex-col items-center">
        {ball}
        <span className="absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap
          bg-gray-800 text-white text-[9px] font-medium px-1.5 py-0.5 rounded
          opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 z-10">
          {hoverFreq}회
        </span>
      </span>
    );
  }

  return ball;
}

// ---------------------------------------------------------------------------
// DistributionPopup
// ---------------------------------------------------------------------------

function DistributionPopup({
  distribution, conditionText, roundsAnalyzed, onClose,
}: {
  distribution: number[];
  conditionText: string;
  roundsAnalyzed: number | null;
  onClose: () => void;
}) {
  const LABELS  = ['01 ~ 09', '10 ~ 19', '20 ~ 29', '30 ~ 39', '40 ~ 45'];
  const COLORS  = ['bg-yellow-400', 'bg-blue-500', 'bg-red-500', 'bg-orange-500', 'bg-green-500'];
  const TEXTCOL = ['text-yellow-600', 'text-blue-600', 'text-red-600', 'text-orange-600', 'text-green-600'];
  const total   = distribution.reduce((a, b) => a + b, 0);
  const maxVal  = Math.max(...distribution, 1);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl px-7 py-6 w-[480px] max-w-[92vw]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-base  text-gray-800">📊 번호 분포도</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none px-1">✕</button>
        </div>
        <p className="text-[11px] text-gray-400 mb-5 leading-relaxed">
          {conditionText}
          {roundsAnalyzed != null ? <span className="ml-1 text-indigo-400 font-medium">· 분석 {roundsAnalyzed.toLocaleString()}회차</span> : ''}
        </p>

        {/* Bars */}
        <div className="space-y-3.5">
          {distribution.map((count, i) => {
            const pct    = total > 0 ? Math.round((count / total) * 100) : 0;
            const barPct = (count / maxVal) * 100;
            return (
              <div key={i} className="flex items-center gap-3">
                <span className={`text-[11px]  w-[60px] flex-shrink-0 ${TEXTCOL[i]}`}>{LABELS[i]}</span>
                <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${COLORS[i]} rounded-full`}
                    style={{ width: `${barPct}%`, transition: 'width 0.5s ease' }}
                  />
                </div>
                <div className="flex items-baseline gap-1 w-[90px] flex-shrink-0 justify-end">
                  <span className="text-xs  text-gray-700">{count.toLocaleString()}회</span>
                  <span className="text-[12px] text-gray-400">({pct}%)</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="mt-5 pt-3 border-t border-gray-100 flex items-center justify-between">
          <span className="text-[11px] text-gray-400">전체 <b>{total.toLocaleString()}</b>개 번호 분석</span>
          <div className="flex gap-2.5">
            {LABELS.map((label, i) => (
              <div key={i} className="flex items-center gap-1">
                <span className={`inline-block w-2 h-2 rounded-full ${COLORS[i]}`} />
                <span className="text-[9px] text-gray-400">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

const IconList = () => (
  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
    <circle cx="3" cy="6" r="0.5" fill="currentColor" stroke="none"/>
    <circle cx="3" cy="12" r="0.5" fill="currentColor" stroke="none"/>
    <circle cx="3" cy="18" r="0.5" fill="currentColor" stroke="none"/>
  </svg>
);

const IconBarChart = () => (
  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/>
    <line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/>
  </svg>
);

const IconDice = ({ size = 'sm' }: { size?: 'sm' | 'md' }) => (
  <svg className={size === 'md' ? 'w-3.5 h-3.5' : 'w-3 h-3'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="3"/>
    <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" stroke="none"/>
    <circle cx="15.5" cy="8.5" r="1.5" fill="currentColor" stroke="none"/>
    <circle cx="8.5" cy="15.5" r="1.5" fill="currentColor" stroke="none"/>
    <circle cx="15.5" cy="15.5" r="1.5" fill="currentColor" stroke="none"/>
  </svg>
);

// ---------------------------------------------------------------------------
// SectionHeader
// ---------------------------------------------------------------------------

function SectionHeader({ icon, title, small }: { icon: ReactNode; title: string; small?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`flex-shrink-0 inline-flex items-center justify-center ${small ? 'w-6 h-6' : 'w-8 h-8'} rounded-full bg-indigo-600 text-white`}>{icon}</span>
      <h2 className={`${small ? 'text-sm' : 'text-xl'}  text-gray-800 tracking-tight`}>{title}</h2>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Prize tier helpers
// ---------------------------------------------------------------------------


function getTierStyle(tier: string): string {
  if (tier === '1등') return 'text-yellow-700 bg-yellow-100 border-yellow-200';
  if (tier === '2등') return 'text-orange-700 bg-orange-100 border-orange-200';
  if (tier === '3등') return 'text-red-700 bg-red-100 border-red-200';
  if (tier === '4등') return 'text-blue-700 bg-blue-100 border-blue-200';
  if (tier === '5등') return 'text-emerald-700 bg-emerald-100 border-emerald-200';
  return 'text-gray-400 bg-gray-100 border-gray-200';
}

function getTierTextColor(tier: string): string {
  if (tier === '1등') return 'text-yellow-700';
  if (tier === '2등') return 'text-orange-700';
  if (tier === '3등') return 'text-red-700';
  if (tier === '4등') return 'text-blue-700';
  if (tier === '5등') return 'text-emerald-700';
  return 'text-gray-400';
}

// Claude 추천 5개 표시용 점수 — selectExpertPicks의 선정 기준(보너스후보·빈도상위 가중치)과
// 동일한 공식을 재사용해, 화면에 보이는 순위와 점수가 항상 같은 기준으로 정렬되게 한다.
function expertDisplayScore(combo: number[], bonusNums: number[], freqNums: number[]): number {
  return scoreCombo(combo, bonusNums, freqNums);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export default function Home() {
  const [results, setResults] = useState<LottoResult[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [isRegisteringLatest, setIsRegisteringLatest] = useState(false);
  const [registerLatestMsg, setRegisterLatestMsg] = useState('');
  const [conditions, setConditions] = useState<ConditionRow[]>(DEFAULT_CONDITIONS);
  const [isSavingConditions, setIsSavingConditions] = useState(false);
  const [saveConditionsMsg, setSaveConditionsMsg] = useState('');
  const [conditionSort, setConditionSort] = useState<'asc' | 'desc' | null>(null);

  // Section 3 state
  const [gameCount, setGameCount] = useState(100);
  const maxGameCount = 100;
  const [type3Numbers, setType3Numbers] = useState<number[][]>([]);
  const [selectedComboIndices, setSelectedComboIndices] = useState<Set<number>>(new Set());
  const [expertPicks, setExpertPicks] = useState<number[][]>([]);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [aiError, setAiError] = useState('');
  const [confirmMsg, setConfirmMsg] = useState('');
  const [isSavingPredicted, setIsSavingPredicted] = useState(false);
  const [confirmedPurchases, setConfirmedPurchases] = useState<ConfirmedPurchase[]>([]);
  const [openConfirmedIds, setOpenConfirmedIds] = useState<Set<number>>(new Set());
  const [isConfirming, setIsConfirming] = useState(false);
  const [sendingTelegramRound, setSendingTelegramRound] = useState<number | null>(null);
  const [telegramMsg, setTelegramMsg] = useState<{ round: number; ok: boolean; text: string } | null>(null);
  // DB에서 불러온 직후 auto-save 방지용 플래그
  const skipSaveRef = useRef(false);

  // Claude 추천 5개 중 확정에 포함할 항목 체크 (기본 상위 3개)
  const [expertPickChecked, setExpertPickChecked] = useState<Set<number>>(new Set());
  // 고급(게임수 조절 · 전체 조합) 아코디언
  const [showAdvanced, setShowAdvanced] = useState(false);
  // Claude 추천 5개 최종 확정
  const [isConfirmingFinal, setIsConfirmingFinal] = useState(false);
  const [finalConfirmMsg, setFinalConfirmMsg] = useState('');

  // 조건분석 결과 번호별 공통 빈도 (메인 +1, 보너스 상위5 +0.5 가중치) — Claude 추천 5개 채점에 사용
  const numberFreq = useMemo(() => {
    const freq: Record<number, number> = {};
    conditions
      .filter(c => Array.isArray(c.numbers) && c.numbers!.length === 6)
      .forEach(c => {
        (c.numbers as number[]).forEach(n => { freq[n] = (freq[n] ?? 0) + 1; });
        if (Array.isArray(c.bonusNumbers)) {
          (c.bonusNumbers as number[]).slice(0, 5).forEach(n => { freq[n] = (freq[n] ?? 0) + 0.5; });
        }
      });
    return freq;
  }, [conditions]);

  // 2등 전략: 보너스 후보 번호 (조건 분석 보너스 빈도 가중 합산, 상위 3개)
  const bonusCandidateNums = useMemo(() => {
    const freq: Record<number, number> = {};
    conditions
      .filter(c => Array.isArray(c.bonusNumbers) && (c.bonusNumbers as number[]).length > 0)
      .forEach(c => {
        (c.bonusNumbers as number[]).slice(0, 5).forEach((n, rank) => {
          freq[n] = (freq[n] ?? 0) + (5 - rank);
        });
      });
    return Object.entries(freq)
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .slice(0, 3)
      .map(([num]) => Number(num))
      .sort((a, b) => a - b);
  }, [conditions]);

  // 3등 전략: 빈도 상위 번호 (상위 10개)
  const topFreqNums = useMemo(() =>
    Object.entries(numberFreq)
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .slice(0, 10)
      .map(([num]) => Number(num)),
  [numberFreq]);

  // 확정 팝업
  const [showInfoPopup, setShowInfoPopup] = useState(false);

  // 조건 유형 설명 팝업
  const [showConditionHelp, setShowConditionHelp] = useState(false);
  const [conditionHelpTab, setConditionHelpTab] = useState<'relation' | 'types'>('relation');

  // 성과 대시보드
  const [showDashboard, setShowDashboard] = useState(false);

  const mergedBonusNums = bonusCandidateNums;

  // 분포도 팝업
  const [distPopup, setDistPopup] = useState<{
    distribution: number[];
    conditionText: string;
    roundsAnalyzed: number | null;
  } | null>(null);
  const [distLoadingIds, setDistLoadingIds] = useState<Set<string>>(new Set());

  // 백테스팅 — 생성 모드의 과거 성과 배지 (개별 조합 단위 지표는 존재하지 않음). "생성" 클릭 시 함께 채워짐
  const [modeBacktest, setModeBacktest] = useState<{ hitRate3Plus: number; hitRate5Plus: number; roi: number } | null>(null);

  const [tooltipInfo, setTooltipInfo] = useState<{ id: string; x: number; y: number; above: boolean } | null>(null);
  const showTooltip = (e: React.MouseEvent, id: string) => {
    const r = e.currentTarget.getBoundingClientRect();
    const above = r.top > 140;
    setTooltipInfo({ id, x: r.left + r.width / 2, y: above ? r.top - 8 : r.bottom + 8, above });
  };

  // ---------------------------------------------------------------------------
  // Load saved conditions from DB on mount
  // ---------------------------------------------------------------------------

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/lottery/api/lotto/save-conditions');
        const data = await res.json();
        if (!data.success || !Array.isArray(data.data) || data.data.length === 0) return;

        type FullData = {
          conditionType: number; years: number; months: number;
          maxConsec: number;
          oddCount: number; sumMin: number; sumMax: number; minAC: number;
          minBands?: number; primeCount?: number; minUniqueTails?: number;
          numbers: number[] | null; frequencies: number[] | null;
          roundsAnalyzed: number | null; distribution: number[] | null;
          bonusNumbers: number[] | null;
        };
        type DbRow = {
          condition_text: string;
          num1: number; num2: number; num3: number; num4: number; num5: number; num6: number;
          full_data?: FullData | null;
        };

        const initial: ConditionRow[] = data.data.map((row: DbRow) => {
          // full_data가 있으면 즉시 복원 (API 재실행 불필요)
          if (row.full_data) {
            const fd = row.full_data;
            return {
              id: makeId(),
              conditionType: fd.conditionType as ConditionType,
              years: fd.years, months: fd.months,
              maxConsec: fd.maxConsec, oddCount: fd.oddCount,
              sumMin: fd.sumMin, sumMax: fd.sumMax, minAC: fd.minAC,
              minBands: fd.minBands ?? 5,
              primeCount: fd.primeCount ?? 2, minUniqueTails: fd.minUniqueTails ?? 5,
              roundsAnalyzed: fd.roundsAnalyzed,
              numbers: fd.numbers,
              frequencies: fd.frequencies,
              distribution: fd.distribution,
              bonusNumbers: fd.bonusNumbers,
              isLoading: false,
            };
          }
          // fallback: condition_text 파싱 후 재실행
          const parsed = parseConditionText(row.condition_text);
          return {
            id: makeId(), ...parsed,
            roundsAnalyzed: null,
            numbers: [row.num1, row.num2, row.num3, row.num4, row.num5, row.num6],
            frequencies: null, isLoading: true, distribution: null, bonusNumbers: null,
          };
        });
        // 새로 추가된 조건 타입이 저장된 데이터에 없으면 기본값으로 추가
        if (!initial.some(r => r.conditionType === 5)) {
          initial.push({ id: makeId(), conditionType: 5 as ConditionType, years: 0, months: 0, ...ROW_DEFAULTS, oddCount: 3, ...BLANK_ROW });
        }
        if (!initial.some(r => r.conditionType === 6)) {
          initial.push({ id: makeId(), conditionType: 6 as ConditionType, years: 0, months: 0, ...ROW_DEFAULTS, sumMin: 115, sumMax: 185, ...BLANK_ROW });
        }
        setConditions(initial);

        // full_data 없는 row만 재실행
        const needsExecution = initial.some(r => r.isLoading);
        if (!needsExecution) return;

        const executed = await Promise.all(
          initial.map(async (row) => {
            if (!row.isLoading) return row;
            try {
              const r = await fetch('/lottery/api/lotto/execute-condition', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(rowToApiBody(row)),
              });
              const d = await r.json();
              if (d.success && Array.isArray(d.data?.numbers)) {
                return { ...row, numbers: d.data.numbers, frequencies: d.data.frequencies ?? null, roundsAnalyzed: d.data.rounds_analyzed ?? null, distribution: d.data.distribution ?? null, bonusNumbers: d.data.bonusNumbers ?? null, isLoading: false };
              }
            } catch { /* ignore */ }
            return { ...row, isLoading: false };
          })
        );
        setConditions(executed);
      } catch { /* keep defaults */ }
    })();
  }, []);

  // ---------------------------------------------------------------------------
  // Section 1: Load + sync
  // ---------------------------------------------------------------------------

  const syncAndLoad = useCallback(async () => {
    try {
      const res = await fetch('/lottery/api/lotto/results');
      const data = await res.json();
      if (data.success) setResults(data.data ?? []);
      else setSyncMessage('데이터 로드 실패: ' + (data.error ?? ''));
    } catch (err) {
      setSyncMessage('데이터 로드 오류: ' + (err instanceof Error ? err.message : String(err)));
    }

    setIsSyncing(true);
    setSyncMessage('동기화 중...');
    try {
      const syncRes = await fetch('/lottery/api/lotto/sync');
      const syncData = await syncRes.json();
      if (syncData.success) {
        const synced = syncData.data?.syncedRounds ?? 0;
        if (synced > 0) {
          setSyncMessage(`${synced}개 회차 동기화 완료`);
          const res = await fetch('/lottery/api/lotto/results');
          const data = await res.json();
          if (data.success) setResults(data.data ?? []);
        } else {
          setSyncMessage('최신 데이터입니다');
        }
      } else {
        setSyncMessage('');
      }
    } catch { setSyncMessage(''); }
    finally { setIsSyncing(false); }
  }, []);

  useEffect(() => { syncAndLoad(); }, [syncAndLoad]);

  const registerLatest = useCallback(async () => {
    if (isRegisteringLatest) return;
    setIsRegisteringLatest(true);
    setRegisterLatestMsg('');
    try {
      const res = await fetch('/lottery/api/lotto/sync');
      const data = await res.json();
      if (data.success) {
        const synced = data.data?.syncedRounds ?? 0;
        if (synced > 0) {
          const rounds: number[] = data.data?.rounds ?? [];
          setRegisterLatestMsg(`${rounds[rounds.length - 1]}회차 등록 완료`);
          const r = await fetch('/lottery/api/lotto/results');
          const d = await r.json();
          if (d.success) setResults(d.data ?? []);
        } else {
          setRegisterLatestMsg('이미 최신 당첨번호입니다');
        }
      } else {
        setRegisterLatestMsg('등록 실패: ' + (data.error ?? ''));
      }
    } catch (err) {
      setRegisterLatestMsg('오류: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsRegisteringLatest(false);
      setTimeout(() => setRegisterLatestMsg(''), 4000);
    }
  }, [isRegisteringLatest]);

  // ---------------------------------------------------------------------------
  // Section 3: Load saved predictions on mount
  // ---------------------------------------------------------------------------

  useEffect(() => {
    (async () => {
      let loaded = false;
      try {
        const res = await fetch('/lottery/api/lotto/predicted');
        const data = await res.json();
        if (data.success && Array.isArray(data.data.type3) && data.data.type3.length >= 100) {
          skipSaveRef.current = true;
          setType3Numbers(data.data.type3);
          setTimeout(() => { skipSaveRef.current = false; }, 0);
          loaded = true;
        }
      } catch { /* ignore */ }

      if (!loaded) {
        try {
          const res = await fetch('/lottery/api/lotto/ai-predict', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ count: 100, mode: 'random' }),
          });
          const d = await res.json();
          if (d.success && Array.isArray(d.data?.combinations)) {
            skipSaveRef.current = true;
            setType3Numbers(d.data.combinations);
            await fetch('/lottery/api/lotto/predicted', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ type3: d.data.combinations }),
            });
            setTimeout(() => { skipSaveRef.current = false; }, 0);
          }
        } catch { /* ignore */ }
      }
    })();
  }, []);

  // ---------------------------------------------------------------------------
  // Section 2: Conditions
  // ---------------------------------------------------------------------------

  const executeCondition = useCallback(async (rowId: string) => {
    const row = conditions.find((c) => c.id === rowId);
    if (!row) return;
    setConditions((prev) => prev.map((c) => (c.id === rowId ? { ...c, isLoading: true } : c)));
    try {
      const res = await fetch('/lottery/api/lotto/execute-condition', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rowToApiBody(row)),
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.data?.numbers)) {
        setConditions((prev) => prev.map((c) =>
          c.id === rowId ? {
            ...c,
            numbers: data.data.numbers,
            frequencies: data.data.frequencies ?? null,
            roundsAnalyzed: data.data.rounds_analyzed ?? null,
            distribution: data.data.distribution ?? null,
            bonusNumbers: data.data.bonusNumbers ?? null,
            isLoading: false,
          } : c
        ));
      } else {
        setConditions((prev) => prev.map((c) => (c.id === rowId ? { ...c, isLoading: false } : c)));
      }
    } catch {
      setConditions((prev) => prev.map((c) => (c.id === rowId ? { ...c, isLoading: false } : c)));
    }
  }, [conditions]);

  // 분포도 버튼: 이미 데이터 있으면 바로 팝업, 없으면 독립 API 호출 후 팝업
  const openDistribution = useCallback(async (rowId: string) => {
    const row = conditions.find((c) => c.id === rowId);
    if (!row) return;

    const condText = buildConditionText(row);
    const rowBody = rowToApiBody(row);

    // 이미 분포 데이터가 있으면 즉시 팝업
    if (row.distribution) {
      setDistPopup({ distribution: row.distribution, conditionText: condText, roundsAnalyzed: row.roundsAnalyzed });
      return;
    }

    // 분포 데이터 없으면 독립적으로 fetch
    setDistLoadingIds((prev) => new Set(prev).add(rowId));
    try {
      const res = await fetch('/lottery/api/lotto/execute-condition', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rowBody),
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.data?.distribution)) {
        const dist: number[] = data.data.distribution;
        setConditions((prev) => prev.map((c) =>
          c.id === rowId ? { ...c, distribution: dist, roundsAnalyzed: data.data.rounds_analyzed ?? c.roundsAnalyzed } : c
        ));
        setDistPopup({ distribution: dist, conditionText: condText, roundsAnalyzed: data.data.rounds_analyzed ?? row.roundsAnalyzed });
      }
    } catch { /* ignore */ }
    finally {
      setDistLoadingIds((prev) => { const s = new Set(prev); s.delete(rowId); return s; });
    }
  }, [conditions]);

  const addConditionRow = useCallback(() => {
    setConditions((prev) => [...prev, { id: makeId(), conditionType: 1 as ConditionType, years: 0, months: 0, ...ROW_DEFAULTS, ...BLANK_ROW }]);
  }, []);

  const removeConditionRow = useCallback((rowId: string) => {
    setConditions((prev) => prev.length <= 1 ? prev : prev.filter((c) => c.id !== rowId));
  }, []);

  const updateConditionType = useCallback((rowId: string, conditionType: ConditionType) => {
    setConditions((prev) => prev.map((c) => c.id === rowId ? ({ ...c, conditionType, maxConsec: 0, ...BLANK_ROW } as ConditionRow) : c));
  }, []);

  const updateMaxConsec = useCallback((rowId: string, maxConsec: number) => {
    setConditions((prev) => prev.map((c) => c.id === rowId ? { ...c, maxConsec, ...BLANK_ROW } : c));
  }, []);

  const updateYears = useCallback((rowId: string, years: number) => {
    setConditions((prev) => prev.map((c) => c.id === rowId ? { ...c, years, ...BLANK_ROW } : c));
  }, []);

  const updateMonths = useCallback((rowId: string, months: number) => {
    setConditions((prev) => prev.map((c) => c.id === rowId ? { ...c, months, ...BLANK_ROW } : c));
  }, []);

  const updateOddCount = useCallback((rowId: string, oddCount: number) => {
    setConditions((prev) => prev.map((c) => c.id === rowId ? { ...c, oddCount, ...BLANK_ROW } : c));
  }, []);

  const updateSumMin = useCallback((rowId: string, sumMin: number) => {
    setConditions((prev) => prev.map((c) => c.id === rowId ? { ...c, sumMin, ...BLANK_ROW } : c));
  }, []);

  const updateSumMax = useCallback((rowId: string, sumMax: number) => {
    setConditions((prev) => prev.map((c) => c.id === rowId ? { ...c, sumMax, ...BLANK_ROW } : c));
  }, []);

  const updateMinAC = useCallback((rowId: string, minAC: number) => {
    setConditions((prev) => prev.map((c) => c.id === rowId ? { ...c, minAC, ...BLANK_ROW } : c));
  }, []);

  const updateMinBands = useCallback((rowId: string, minBands: number) => {
    setConditions((prev) => prev.map((c) => c.id === rowId ? { ...c, minBands, ...BLANK_ROW } : c));
  }, []);

  const updatePrimeCount = useCallback((rowId: string, primeCount: number) => {
    setConditions((prev) => prev.map((c) => c.id === rowId ? { ...c, primeCount, ...BLANK_ROW } : c));
  }, []);

  const updateMinUniqueTails = useCallback((rowId: string, minUniqueTails: number) => {
    setConditions((prev) => prev.map((c) => c.id === rowId ? { ...c, minUniqueTails, ...BLANK_ROW } : c));
  }, []);

  const resetConditionNumbers = useCallback(() => {
    setConditions((prev) => prev.map((c) => ({ ...c, numbers: null, frequencies: null, roundsAnalyzed: null })));
  }, []);

  // 조건 정렬 기준값: 타입 우선, 타입 내 세부 파라미터 순
  const conditionSortKey = useCallback((c: ConditionRow): number => {
    const base = c.conditionType * 100000;
    if (c.conditionType === 1) return base + c.years * 12 + c.months;
    if (c.conditionType === 4) return base + c.maxConsec;
    if (c.conditionType === 5) return base + c.oddCount;
    if (c.conditionType === 6) return base + c.sumMin;
    if (c.conditionType === 7) return base + c.minAC;
    return base;
  }, []);

  const sortedConditions = useMemo(() => {
    if (!conditionSort) return conditions;
    return [...conditions].sort((a, b) =>
      conditionSort === 'asc'
        ? conditionSortKey(a) - conditionSortKey(b)
        : conditionSortKey(b) - conditionSortKey(a)
    );
  }, [conditions, conditionSort, conditionSortKey]);

  const toggleConditionSort = useCallback(() => {
    setConditionSort(prev => prev === 'asc' ? 'desc' : prev === 'desc' ? null : 'asc');
  }, []);

  const saveConditions = useCallback(async () => {
    const executed = conditions.filter((c) => c.numbers !== null && c.numbers.length === 6);
    if (executed.length === 0) {
      setSaveConditionsMsg('저장할 결과가 없습니다.');
      setTimeout(() => setSaveConditionsMsg(''), 3000);
      return;
    }
    setIsSavingConditions(true);
    try {
      const res = await fetch('/lottery/api/lotto/save-conditions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conditions: executed.map((c) => ({
            condition_text: buildConditionText(c),
            num1: (c.numbers as number[])[0], num2: (c.numbers as number[])[1],
            num3: (c.numbers as number[])[2], num4: (c.numbers as number[])[3],
            num5: (c.numbers as number[])[4], num6: (c.numbers as number[])[5],
            full_data: {
              ...rowToApiBody(c),
              numbers: c.numbers, frequencies: c.frequencies,
              roundsAnalyzed: c.roundsAnalyzed, distribution: c.distribution,
              bonusNumbers: c.bonusNumbers,
            },
          })),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSaveConditionsMsg(`${executed.length}개 조건 저장 완료`);
      } else {
        setSaveConditionsMsg(`저장 실패: ${data.error}`);
      }
    } catch { setSaveConditionsMsg('저장 중 오류가 발생했습니다.'); }
    finally { setIsSavingConditions(false); setTimeout(() => setSaveConditionsMsg(''), 4000); }
  }, [conditions]);

  // ---------------------------------------------------------------------------
  // Section 3: AI generation (Type 3)
  // ---------------------------------------------------------------------------

  const generateAIPredictions = useCallback(async () => {
    setIsGeneratingAI(true);
    setAiError('');
    setSelectedComboIndices(new Set());

    try {
      // 랜덤 100개 생성
      const res = await fetch('/lottery/api/lotto/ai-predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: gameCount }),
      });
      const d = await res.json();
      if (d.success && Array.isArray(d.data?.combinations)) {
        skipSaveRef.current = true;
        setType3Numbers(d.data.combinations);
        await fetch('/lottery/api/lotto/predicted', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type3: d.data.combinations }),
        });
        setTimeout(() => { skipSaveRef.current = false; }, 0);
      } else {
        setAiError(d.error ?? '조합 생성 오류');
        return;
      }

      // 최근 100회차 백테스트로 과거 성과 참고치 확보 (조합 생성과는 무관, 참고용 배지)
      const latestRound = results[0]?.round ?? 0;
      const endRound = latestRound > 0 ? latestRound - 1 : undefined;
      const startRound = endRound ? endRound - 100 + 1 : undefined;
      const bt = await fetch('/lottery/api/lotto/backtest', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gamesPerRound: 5, startRound, endRound, conditionType: 1, years: 1, months: 0 }),
      }).then(r => r.json()).catch(() => ({ success: false }));
      if (bt.success) {
        setModeBacktest({ hitRate3Plus: bt.data.hitRate3Plus, hitRate5Plus: bt.data.hitRate5Plus, roi: bt.data.roi });
      }
    } catch { setAiError('서버 연결 오류'); }
    finally { setIsGeneratingAI(false); }
  }, [gameCount, results]);

  // ---------------------------------------------------------------------------
  // Section 3: Save all predictions to DB
  // ---------------------------------------------------------------------------

  const savePredictions = useCallback(async (t3: number[][]) => {
    if (t3.length === 0) return;
    setIsSavingPredicted(true);
    try {
      await fetch('/lottery/api/lotto/predicted', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type3: t3 }),
      });
    } catch { /* ignore */ }
    finally { setIsSavingPredicted(false); }
  }, []);

  // Auto-save type3 when it changes
  useEffect(() => {
    if (skipSaveRef.current) return;
    if (type3Numbers.length > 0) savePredictions(type3Numbers);
  }, [type3Numbers]); // eslint-disable-line react-hooks/exhaustive-deps

  // 전문가 추천 5개 자동 선정 — 조건분석에서 나온 보너스후보·빈도상위 종합 점수 상위 5개
  useEffect(() => {
    const picks = selectExpertPicks(type3Numbers, mergedBonusNums, topFreqNums);
    setExpertPicks(picks);
    // 기본 체크 = 추천 5개 전부
    setExpertPickChecked(new Set(picks.map((_, i) => i)));
  }, [type3Numbers, mergedBonusNums, topFreqNums]);

  // Claude 추천 5개 — 표시 점수 내림차순으로 정렬 (원래 배열 인덱스 i는 체크 상태 참조용으로 보존)
  const rankedExpertPicks = useMemo(() =>
    expertPicks
      .map((combo, i) => ({ combo, i, score: expertDisplayScore(combo, mergedBonusNums, topFreqNums) }))
      .sort((a, b) => b.score - a.score),
  [expertPicks, mergedBonusNums, topFreqNums]);

  // 최종확정은 Claude 추천 5개를 넘을 수 없음 — 해제는 항상 허용, 추가만 캡에서 막음
  const toggleExpertPick = useCallback((idx: number) => {
    setExpertPickChecked(prev => {
      const next = new Set(prev);
      if (next.has(idx)) { next.delete(idx); return next; }
      if (next.size >= 5) return prev;
      next.add(idx);
      return next;
    });
  }, []);

  const toggleComboSelection = useCallback((idx: number) => {
    setSelectedComboIndices(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  }, []);

  const toggleAllCombos = useCallback(() => {
    setSelectedComboIndices(prev =>
      prev.size === type3Numbers.length
        ? new Set()
        : new Set(type3Numbers.map((_, i) => i))
    );
  }, [type3Numbers]);

  // ---------------------------------------------------------------------------
  // Section 3: Confirmed purchases
  // ---------------------------------------------------------------------------

  const loadConfirmed = useCallback(async () => {
    try {
      const res = await fetch('/lottery/api/lotto/confirmed');
      const d = await res.json();
      if (d.success) setConfirmedPurchases(d.data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadConfirmed(); }, [loadConfirmed]);

  // 추첨 결과가 있는 확정 항목의 prize_tier / matched_numbers 자동 저장
  useEffect(() => {
    if (results.length === 0 || confirmedPurchases.length === 0) return;
    const tierOrder = ['1등', '2등', '3등', '4등', '5등', '낙첨'];
    const toUpdate = confirmedPurchases.filter(p => {
      if (p.prize_tier != null) return false;
      return results.some(r => r.round === p.target_round);
    });
    if (toUpdate.length === 0) return;
    (async () => {
      for (const p of toUpdate) {
        const actual = results.find(r => r.round === p.target_round)!;
        const winSet = new Set([actual.num1, actual.num2, actual.num3, actual.num4, actual.num5, actual.num6].filter((n): n is number => n != null));
        const matchCounts = p.combos.map(combo => combo.filter(n => winSet.has(n)).length);
        const tiers = p.combos.map((combo, i) => {
          const bm = matchCounts[i] === 5 && actual.bonus1 != null && combo.includes(actual.bonus1);
          return getPrizeTier(matchCounts[i], bm);
        });
        const bestTier = tiers.reduce((best, t) =>
          tierOrder.indexOf(t) < tierOrder.indexOf(best) ? t : best, '낙첨');
        try {
          await fetch('/lottery/api/lotto/confirmed', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: p.id, prize_tier: bestTier, matched_numbers: matchCounts }),
          });
        } catch { /* ignore */ }
      }
      await loadConfirmed();
    })();
  }, [results, confirmedPurchases, loadConfirmed]);

  // Claude 추천(체크된 것) + 휠링(체크된 것) 통합 확정 — loadConfirmed 이후 정의
  const confirmFinalSelection = useCallback(async () => {
    const combos = expertPicks.filter((_, i) => expertPickChecked.has(i));
    // Claude 추천은 최대 5개뿐이라 5게임을 넘을 수 없음 (토글 단계에서도 캡을 걸어두지만 여기서도 방어)
    if (combos.length === 0 || combos.length > 5 || results.length === 0) return;
    setIsConfirmingFinal(true);
    setFinalConfirmMsg('');
    try {
      const target_round = results[0].round + 1;
      const res = await fetch('/lottery/api/lotto/confirmed', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_round, combos, generation_mode: 'random' }),
      });
      const data = await res.json();
      if (!data.success) { setFinalConfirmMsg(data.error ?? '확정 실패'); return; }
      setFinalConfirmMsg(`제${target_round}회 ${combos.length}게임 1세트 확정 완료`);
      await loadConfirmed();
    } catch (e) {
      setFinalConfirmMsg(e instanceof Error ? e.message : '확정 실패');
    } finally {
      setIsConfirmingFinal(false);
      setTimeout(() => setFinalConfirmMsg(''), 4000);
    }
  }, [expertPicks, expertPickChecked, results, loadConfirmed]);

  // 삭제된 항목이 열려 있으면 닫기
  useEffect(() => {
    setOpenConfirmedIds(prev => {
      const ids = new Set(confirmedPurchases.map(p => p.id));
      const next = new Set([...prev].filter(id => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [confirmedPurchases]);

  const confirmPurchase = useCallback(async () => {
    if (selectedComboIndices.size === 0 || results.length === 0) return;
    const target_round = results[0].round + 1;
    setIsConfirming(true);
    try {
      const selectedCombos = type3Numbers.filter((_, i) => selectedComboIndices.has(i));
      const res = await fetch('/lottery/api/lotto/confirmed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_round, combos: selectedCombos, generation_mode: 'random' }),
      });
      const d = await res.json();
      if (d.success) {
        setSelectedComboIndices(new Set());
        await loadConfirmed();
      }
    } catch { /* ignore */ }
    finally { setIsConfirming(false); }
  }, [type3Numbers, selectedComboIndices, results, loadConfirmed]);

  const deleteConfirmed = useCallback(async (id: number) => {
    try {
      await fetch(`/lottery/api/lotto/confirmed?id=${id}`, { method: 'DELETE' });
      await loadConfirmed();
    } catch { /* ignore */ }
  }, [loadConfirmed]);

  const sendTelegram = useCallback(async (round: number) => {
    const roundPurchases = confirmedPurchases.filter(p => p.target_round === round);
    if (roundPurchases.length === 0) return;
    const actual = results.find(r => r.round === round);
    const toSend = roundPurchases.length >= 2
      ? selectBestPurchases(roundPurchases, actual, bonusCandidateNums, topFreqNums).map(s => s.purchase)
      : roundPurchases;
    setSendingTelegramRound(round);
    try {
      const res = await fetch('/lottery/api/lotto/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_round: round,
          purchases: toSend.map((p, i) => ({
            label: ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'][i] ?? `(${i + 1})`,
            combos: p.combos,
            generation_mode: p.generation_mode ?? null,
          })),
        }),
      });
      const d = await res.json();
      setTelegramMsg({ round, ok: d.success, text: d.success ? '전송 완료' : d.error ?? '전송 실패' });
    } catch {
      setTelegramMsg({ round, ok: false, text: '전송 오류' });
    } finally {
      setSendingTelegramRound(null);
      setTimeout(() => setTelegramMsg(null), 4000);
    }
  }, [confirmedPurchases, results, bonusCandidateNums, topFreqNums]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <>
    <main className="w-full bg-gray-50 md:h-screen md:overflow-hidden">
      <div className="flex flex-col md:flex-row md:h-full">

        {/* ===== LEFT: Sections 1 & 2 ===== */}
        <div className="flex flex-col md:w-1/2 md:flex-shrink-0 md:min-w-0 md:overflow-hidden">

          {/* SECTION 1 */}
          <section className="flex flex-col bg-white border-b border-gray-200 shadow-sm md:flex-[2] md:min-h-0 md:border-r">
            <div className="flex-none px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <SectionHeader icon={<IconList />} title="참고) 로또 당첨 번호" small />
              <div className="flex items-center gap-2">
                {registerLatestMsg && (
                  <span className={`text-xs font-medium ${registerLatestMsg.includes('완료') ? 'text-emerald-600' : registerLatestMsg.includes('최신') ? 'text-gray-400' : 'text-red-500'}`}>
                    {registerLatestMsg}
                  </span>
                )}
                {!registerLatestMsg && isSyncing
                  ? <span className="inline-flex items-center gap-1.5 text-xs text-indigo-500 font-medium"><span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />동기화 중...</span>
                  : !registerLatestMsg && syncMessage ? <span className="text-xs text-gray-400">{syncMessage}</span> : null}
                <button
                  onClick={registerLatest}
                  disabled={isRegisteringLatest || isSyncing}
                  className="px-3 py-1.5 text-xs  bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 active:scale-95 transition-all disabled:opacity-40 whitespace-nowrap"
                >
                  {isRegisteringLatest ? '확인 중...' : '최신 당첨번호 등록'}
                </button>
              </div>
            </div>
            <div className="overflow-x-auto overflow-y-auto max-h-56 md:max-h-none md:flex-1">
              <table className="w-full border-separate border-spacing-0 text-sm min-w-[560px]">
                <thead className="sticky top-0 z-10" style={{ boxShadow: '0 2px 0 #a5b4fc' }}>
                  <tr className="bg-indigo-50">
                    <th className="border-b border-indigo-200 px-3 py-1.5 text-center text-xs  text-indigo-700 whitespace-nowrap">회차</th>
                    <th className="border-b border-indigo-200 px-3 py-1.5 text-center text-xs  text-indigo-700 whitespace-nowrap">추첨일</th>
                    <th colSpan={6} className="border-b border-indigo-200 px-2 py-1.5 text-center text-xs  text-indigo-700">당첨번호</th>
                    <th className="border-b border-l-2 border-indigo-200 border-l-indigo-200 px-2 py-1.5 text-center text-xs  text-indigo-700">보너스</th>
                    <th className="border-b border-l-2 border-indigo-200 border-l-indigo-200 px-2 py-1.5 text-center text-xs  text-indigo-700 whitespace-nowrap">당첨자</th>
                    <th className="border-b border-indigo-200 px-2 py-1.5 text-center text-xs  text-indigo-700 whitespace-nowrap">당첨금</th>
                  </tr>
                </thead>
                <tbody>
                  {results.length === 0 && (
                    <tr><td colSpan={10} className="px-4 py-8 text-center text-sm text-gray-400">{isSyncing ? '데이터를 불러오는 중입니다...' : '데이터가 없습니다.'}</td></tr>
                  )}
                  {results.map((row, i) => (
                    <tr key={row.id} className={`${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-indigo-50 transition-colors`}>
                      <td className="border-b border-r border-gray-200 px-3 py-1 text-center text-sm font-medium text-gray-700 whitespace-nowrap">{String(row.round).padStart(5, '0')}</td>
                      <td className="border-b border-r border-gray-200 px-3 py-1 text-center text-[14px] text-gray-500 whitespace-nowrap">{row.draw_date}</td>
                      {[row.num1, row.num2, row.num3, row.num4, row.num5, row.num6].map((num, idx) => (
                        <td key={idx} className="border-b border-r border-gray-200 px-2 py-1 text-center"><NumberBall num={num} size="sm" /></td>
                      ))}
                      <td className="border-b border-r border-l-2 border-gray-200 border-l-indigo-200 px-2 py-1 text-center"><NumberBall num={row.bonus1} size="sm" /></td>
                      <td className="border-b border-r border-l-2 border-gray-200 border-l-indigo-200 px-2 py-1 text-center text-[14px] text-gray-600 whitespace-nowrap">
                        {row.first_prize_winners != null ? <span className="font-medium">{row.first_prize_winners}명</span> : '-'}
                      </td>
                      <td className="border-b border-gray-200 px-2 py-1 text-right text-[14px] text-gray-700 whitespace-nowrap font-medium">{formatAmount(row.first_prize_amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* SECTION 2 */}
          <section className="flex flex-col bg-white border-b border-gray-200 shadow-sm md:flex-[3] md:min-h-0 md:border-r md:overflow-hidden">
            <div className="flex-none px-4 py-3 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-1.5">
                <SectionHeader icon={<IconBarChart />} title="참고) 당첨 빈도 분석" small />
                <button
                  onClick={() => setShowConditionHelp(true)}
                  className="flex-shrink-0 inline-flex items-center justify-center w-4 h-4 rounded-full bg-gray-200 text-gray-500 text-[12px]  hover:bg-gray-300 hover:text-gray-700 transition-colors"
                  title="조건 유형별 설명"
                >
                  ?
                </button>
              </div>
              <div className="flex items-center gap-2">
                {saveConditionsMsg && (
                  <span className={`text-xs font-medium ${saveConditionsMsg.includes('완료') ? 'text-emerald-600' : saveConditionsMsg.includes('중') ? 'text-blue-500' : 'text-red-500'}`}>
                    {saveConditionsMsg}
                  </span>
                )}
                <button onClick={saveConditions} disabled={isSavingConditions} className="px-3 py-1.5 text-xs  bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 active:scale-95 transition-all disabled:opacity-40">
                  {isSavingConditions ? '저장 중...' : '결과 저장'}
                </button>
                <button onClick={resetConditionNumbers} className="px-3 py-1.5 text-xs  bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 active:scale-95 transition-all disabled:opacity-40">초기화</button>
              </div>
            </div>
            <div className="overflow-x-auto overflow-y-auto max-h-72 md:max-h-none md:flex-1 md:min-h-0">
              <table className="w-full border-separate border-spacing-0 text-xs min-w-[600px]">
                <thead className="sticky top-0 z-10" style={{ boxShadow: '0 2px 0 #6ee7b7' }}>
                  <tr className="bg-emerald-50">
                    <th className="border-b border-emerald-100 px-3 py-2 text-left text-xs  text-emerald-700 bg-emerald-50">
                      <button onClick={toggleConditionSort} className="flex items-center gap-1 hover:text-emerald-900 transition-colors select-none">
                        조건
                        <span className="text-[12px] leading-none">
                          {conditionSort === 'asc' ? '▲' : conditionSort === 'desc' ? '▼' : '⇅'}
                        </span>
                      </button>
                    </th>
                    <th className="border-b border-emerald-100 px-2 py-2 text-center text-xs  text-emerald-700 whitespace-nowrap bg-emerald-50">실행</th>
                    <th className="border-b border-emerald-100 px-2 py-2 text-center text-xs  text-emerald-700 whitespace-nowrap bg-emerald-50">분석 회차</th>
                    <th colSpan={6} className="border-b border-emerald-100 px-3 py-2 text-center text-xs font-medium text-emerald-600 bg-emerald-50">추출번호</th>
                    <th className="border-b border-emerald-100 px-2 py-2 text-center text-xs  text-emerald-700 bg-emerald-50">관리</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedConditions.map((row, i) => (
                    <tr key={row.id} className={`${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-emerald-50 transition-colors`}>
                      <td className="border-b border-gray-100 px-3 py-1.5">
                        <div className="flex items-center gap-1.5 text-xs text-gray-600 whitespace-nowrap">
                          <select value={row.conditionType} onChange={(e) => updateConditionType(row.id, Number(e.target.value) as ConditionType)}
                            className="border border-gray-200 rounded px-1 py-0.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-emerald-400">
                            <option value={1}>기간</option>
                            <option value={4}>연속번호</option>
                            <option value={5}>홀짝</option>
                            <option value={6}>합계</option>
                            <option value={7}>AC값</option>
                            <option value={8}>밴드커버</option>
                            <option value={10}>소수포함</option>
                            <option value={11}>끝수다양</option>
                          </select>
                          {row.conditionType === 1 && (
                            <>
                              <select value={row.years} onChange={(e) => updateYears(row.id, Number(e.target.value))}
                                className="border border-gray-200 rounded px-1 py-0.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-emerald-400">
                                <option value={0}>-</option>
                                {Array.from({ length: 20 }, (_, i) => i + 1).map((y) => <option key={y} value={y}>{y}</option>)}
                              </select>
                              <span>년</span>
                              <select value={row.months} onChange={(e) => updateMonths(row.id, Number(e.target.value))}
                                className="border border-gray-200 rounded px-1 py-0.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-emerald-400">
                                <option value={0}>-</option>
                                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{m}</option>)}
                              </select>
                              <span>개월</span>
                              <span className="text-gray-400">
                                {row.years === 0 && row.months === 0 ? '전체' : '당첨번호 빈도 상위 6개'}
                              </span>
                            </>
                          )}
                          {row.conditionType === 4 && (
                            <>
                              <select value={row.maxConsec} onChange={(e) => updateMaxConsec(row.id, Number(e.target.value))}
                                className="border border-gray-200 rounded px-1 py-0.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-emerald-400">
                                <option value={0}>없음</option>
                                <option value={2}>2개</option>
                                <option value={3}>3개+</option>
                              </select>
                              <span className="text-gray-400">연속번호 회차 빈도 상위 6개</span>
                            </>
                          )}
                          {row.conditionType === 5 && (
                            <>
                              <span className="text-gray-400">홀수</span>
                              <select value={row.oddCount} onChange={(e) => updateOddCount(row.id, Number(e.target.value))}
                                className="border border-gray-200 rounded px-1 py-0.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-emerald-400">
                                {[0,1,2,3,4,5,6].map(n => <option key={n} value={n}>{n}개</option>)}
                              </select>
                              <span className="text-gray-400">회차 빈도 상위 6개</span>
                            </>
                          )}
                          {row.conditionType === 6 && (
                            <>
                              <span className="text-gray-400">합계</span>
                              <input type="number" min={21} max={255} value={row.sumMin}
                                onChange={(e) => updateSumMin(row.id, Number(e.target.value))}
                                className="border border-gray-200 rounded px-1 py-0.5 text-xs bg-white w-14 focus:outline-none focus:ring-1 focus:ring-emerald-400" />
                              <span className="text-gray-400">~</span>
                              <input type="number" min={21} max={255} value={row.sumMax}
                                onChange={(e) => updateSumMax(row.id, Number(e.target.value))}
                                className="border border-gray-200 rounded px-1 py-0.5 text-xs bg-white w-14 focus:outline-none focus:ring-1 focus:ring-emerald-400" />
                              <span className="text-gray-400">범위 빈도 상위 6개</span>
                            </>
                          )}
                          {row.conditionType === 7 && (
                            <>
                              <span className="text-gray-400">AC값</span>
                              <select value={row.minAC} onChange={(e) => updateMinAC(row.id, Number(e.target.value))}
                                className="border border-gray-200 rounded px-1 py-0.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-emerald-400">
                                {[3,4,5,6,7,8,9,10].map(n => <option key={n} value={n}>{n} 이상</option>)}
                              </select>
                              <span className="text-gray-400">회차 빈도 상위 6개</span>
                            </>
                          )}
                          {row.conditionType === 8 && (
                            <>
                              <select value={row.minBands} onChange={(e) => updateMinBands(row.id, Number(e.target.value))}
                                className="border border-gray-200 rounded px-1 py-0.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-emerald-400">
                                <option value={4}>4밴드</option>
                                <option value={5}>5밴드</option>
                              </select>
                              <span className="text-gray-400">이상 커버 회차 빈도 상위 6개</span>
                            </>
                          )}
                          {row.conditionType === 10 && (
                            <>
                              <span className="text-gray-400">소수</span>
                              <select value={row.primeCount} onChange={(e) => updatePrimeCount(row.id, Number(e.target.value))}
                                className="border border-gray-200 rounded px-1 py-0.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-emerald-400">
                                {[1,2,3,4].map(n => <option key={n} value={n}>{n}개</option>)}
                              </select>
                              <span className="text-gray-400">포함 회차 빈도 상위 6개</span>
                            </>
                          )}
                          {row.conditionType === 11 && (
                            <>
                              <span className="text-gray-400">끝수</span>
                              <select value={row.minUniqueTails} onChange={(e) => updateMinUniqueTails(row.id, Number(e.target.value))}
                                className="border border-gray-200 rounded px-1 py-0.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-emerald-400">
                                {[4,5,6].map(n => <option key={n} value={n}>{n}종 이상</option>)}
                              </select>
                              <span className="text-gray-400">회차 빈도 상위 6개</span>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="border-b border-gray-100 px-2 py-1.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => executeCondition(row.id)} disabled={row.isLoading}
                            className="inline-flex items-center gap-0.5 px-2 py-1 text-xs  bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-40 whitespace-nowrap">
                            {row.isLoading ? <span className="inline-block w-2.5 h-2.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : '실행'}
                          </button>
                          <button
                            onClick={() => openDistribution(row.id)}
                            disabled={distLoadingIds.has(row.id)}
                            className="inline-flex items-center gap-0.5 px-2 py-1 text-xs  bg-amber-500 text-white rounded hover:bg-amber-600 disabled:opacity-50 whitespace-nowrap"
                            title="번호 분포도 보기"
                          >
                            {distLoadingIds.has(row.id)
                              ? <span className="inline-block w-2.5 h-2.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              : '분포도'}
                          </button>
                        </div>
                      </td>
                      <td className="border-b border-gray-100 px-2 py-1.5 text-center whitespace-nowrap">
                        {row.roundsAnalyzed != null
                          ? <span className="text-xs font-medium text-gray-600">{row.roundsAnalyzed.toLocaleString()}회</span>
                          : <span className="text-gray-300 text-xs">-</span>}
                      </td>
                      {[0,1,2,3,4,5].map((idx) => (
                        <td key={idx} className="border-b border-gray-100 px-3 py-1.5 text-center">
                          {row.numbers != null
                            ? <NumberBall num={row.numbers[idx]} size="sm" hoverFreq={row.frequencies != null ? row.frequencies[idx] : undefined} />
                            : <span className="text-gray-300 text-xs">-</span>}
                        </td>
                      ))}
                      <td className="border-b border-gray-100 px-2 py-1.5 text-center whitespace-nowrap">
                        <button onClick={addConditionRow} className="inline-flex items-center justify-center w-5 h-5 rounded-full text-emerald-600 hover:bg-emerald-100  text-sm" title="행 추가">+</button>
                        <button onClick={() => removeConditionRow(row.id)} disabled={conditions.length <= 1}
                          className="inline-flex items-center justify-center w-5 h-5 rounded-full text-red-400 hover:bg-red-50  text-sm disabled:opacity-25" title="행 삭제">-</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

        </div>{/* end left */}

        {/* ===== RIGHT: Section 3 ===== */}
        <div className="md:w-1/2 md:flex-shrink-0 md:h-full">
          <section className="flex flex-col bg-white border-t border-gray-200 shadow-sm md:h-full md:border-t-0 md:border-l md:overflow-hidden">

            {/* Header */}
            <div className="flex-none px-4 py-3 border-b border-gray-100 md:px-5 md:py-4">
              <div className="flex flex-wrap items-center justify-between gap-y-2 mb-3">
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-indigo-600 text-white">
                    <IconDice size="md" />
                  </span>
                  <h2 className="text-xl  text-gray-900 tracking-tight">예상 당첨 번호</h2>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <button
                    onClick={generateAIPredictions}
                    disabled={isGeneratingAI}
                    onMouseEnter={(e) => showTooltip(e, 'generate')}
                    onMouseLeave={() => setTooltipInfo(null)}
                    className="flex-shrink-0 inline-flex items-center gap-1.5 px-4 py-2 text-sm  bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 whitespace-nowrap transition-all shadow-sm"
                  >
                    {isGeneratingAI
                      ? <><span className="inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />백테스트 · 생성 중</>
                      : '🎲 생성'}
                  </button>
                  <button
                    onClick={() => setShowInfoPopup(true)}
                    className="flex-shrink-0 inline-flex items-center gap-1.5 px-4 py-2 text-sm  bg-rose-500 text-white rounded-xl hover:bg-rose-600 whitespace-nowrap transition-all shadow-sm"
                  >
                    🎯 확정
                  </button>
                  <button
                    onClick={() => setShowDashboard(true)}
                    className="flex-shrink-0 inline-flex items-center gap-1.5 px-4 py-2 text-sm  bg-amber-500 text-white rounded-xl hover:bg-amber-600 whitespace-nowrap transition-all shadow-sm"
                  >
                    📊 성과
                  </button>
                </div>
              </div>

            </div>

            {/* Body */}
            <div className="px-4 py-4 flex flex-col gap-4 md:flex-1 md:min-h-0 md:overflow-y-auto md:px-5">

              {/* Claude 추천 5개 */}
              {expertPicks.length > 0 && (
                <div className="flex-none rounded-2xl border border-violet-200 bg-violet-50/60 px-4 py-3">
                  <div className="flex items-center gap-2 mb-2 min-w-0">
                    <span className="inline-flex items-center gap-1.5 text-sm  text-violet-900 whitespace-nowrap">
                      🤖 Claude 추천 5개
                    </span>
                    <span className="text-[12px] text-violet-400 font-medium hidden sm:block">밴드분산 · 홀짝균형 · 보너스후보 · 빈도상위 종합 점수 상위 5개</span>
                  </div>

                  {/* 백테스팅 배지 — 5개 전체에 적용되는 과거 성과 참고치 */}
                  <div className="flex items-center gap-2 mb-2 px-3 py-1.5 bg-white/70 rounded-lg text-[11px] flex-wrap">
                    <span className="flex-shrink-0  text-violet-700 bg-violet-100 px-2 py-0.5 rounded-full">랜덤 모드</span>
                    {isGeneratingAI ? (
                      <span className="text-gray-400">백테스트로 과거 성과 확인 중...</span>
                    ) : modeBacktest ? (
                      <span className="text-gray-500">
                        최근 100회차 3등 이상 <b className={modeBacktest.hitRate3Plus > 0 ? 'text-emerald-600' : 'text-gray-400'}>{modeBacktest.hitRate3Plus}%</b>
                        {' · '}ROI <b className={modeBacktest.roi >= 0 ? 'text-emerald-600' : 'text-red-500'}>{modeBacktest.roi > 0 ? '+' : ''}{modeBacktest.roi}%</b>
                      </span>
                    ) : (
                      <span className="text-gray-400">과거 성과 데이터 없음</span>
                    )}
                    <span className="ml-auto text-gray-400 hidden sm:inline">이 5개 전체에 적용되는 참고치입니다</span>
                  </div>

                  <div className="flex flex-col divide-y divide-violet-100 rounded-xl border border-violet-200 bg-white overflow-hidden">
                    {rankedExpertPicks.map(({ combo, i, score }, rank) => {
                      const sum = combo.reduce((a, b) => a + b, 0);
                      const odds = combo.filter(n => n % 2 === 1).length;
                      const bandCount = [combo.some(n => n <= 9), combo.some(n => n >= 10 && n <= 19),
                        combo.some(n => n >= 20 && n <= 29), combo.some(n => n >= 30 && n <= 39),
                        combo.some(n => n >= 40)].filter(Boolean).length;
                      const checked = expertPickChecked.has(i);
                      const atCap = !checked && expertPickChecked.size >= 5;
                      return (
                        <div
                          key={i}
                          onClick={() => toggleExpertPick(i)}
                          className={`flex items-center gap-2 px-3 py-2 transition-all ${atCap ? 'opacity-30 cursor-not-allowed' : `cursor-pointer hover:bg-violet-50/60 ${checked ? '' : 'opacity-50'}`}`}
                        >
                          <span className={`flex-shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center ${checked ? 'bg-violet-600 border-violet-600' : 'border-gray-300'}`}>
                            {checked && <span className="text-white text-[9px] ">✓</span>}
                          </span>
                          <span className="flex-shrink-0 w-5 h-5 rounded-full bg-violet-600 text-white text-[12px]  flex items-center justify-center">{rank + 1}</span>
                          <div className="flex gap-3 flex-1">
                            {combo.map((num, j) => <NumberBall key={j} num={num} size="sm" highlighted={checked} />)}
                          </div>
                          <div
                            className="flex-shrink-0 flex items-center gap-1.5 text-[14px] text-violet-500 font-medium whitespace-nowrap"
                            onMouseEnter={(e) => showTooltip(e, 'combo-stats')}
                            onMouseLeave={() => setTooltipInfo(null)}
                          >
                            <span>합{sum}</span>
                            <span>홀{odds}/짝{6 - odds}</span>
                            <span>{bandCount}밴드</span>
                            <span className="text-violet-700 ">{score}점</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 고급 — 게임 수 조절 · 전체 조합 보기 */}
              <div className="flex-none rounded-2xl border border-gray-200 bg-gray-50/60 overflow-hidden">
                <button
                  onClick={() => setShowAdvanced(v => !v)}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-xs  text-gray-500 hover:text-gray-700 transition-colors"
                >
                  <span className={`inline-block transition-transform ${showAdvanced ? 'rotate-90' : ''}`}>▸</span>
                  고급 — 게임 수 조절 · 전체 조합 보기{type3Numbers.length > 0 ? ` (${type3Numbers.length}개)` : ''}
                </button>
                {showAdvanced && (
                  <div className="px-4 pb-4 flex flex-col gap-3">
                    {/* 게임 수 조절 패널 */}
                    <div className="bg-indigo-50/70 rounded-xl border border-indigo-100 px-4 py-3">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-sm  text-indigo-800 whitespace-nowrap">게임 수</span>
                        <div className="flex-1 min-w-[120px]">
                          <input
                            type="range" min={5} max={maxGameCount} step={5} value={gameCount}
                            onChange={(e) => setGameCount(Number(e.target.value))}
                            className="w-full h-2 rounded-full appearance-none cursor-pointer accent-indigo-600 bg-indigo-200"
                          />
                          <div className="flex justify-between text-[12px] text-indigo-400 mt-0.5">
                            <span>5</span><span>25</span><span>50</span><span>75</span><span>100</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <input
                            type="number" min={5} max={100} step={5} value={gameCount}
                            onChange={(e) => setGameCount(Math.min(maxGameCount, Math.max(5, Number(e.target.value))))}
                            className="w-14 border border-indigo-300 rounded-lg px-2 py-1 text-sm text-center  text-indigo-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
                          />
                          <span className="text-sm text-indigo-600 font-medium">게임</span>
                        </div>
                      </div>
                      <div className="mt-2.5 grid grid-cols-3 gap-2">
                        <div className="bg-white rounded-xl border border-indigo-100 px-2 py-2 text-center">
                          <div className="text-[12px] text-gray-400 mb-0.5">구매 비용</div>
                          <div className="text-sm  text-gray-800">{(gameCount * 1000).toLocaleString()}원</div>
                        </div>
                        <div className="bg-white rounded-xl border border-indigo-100 px-2 py-2 text-center">
                          <div className="text-[12px] text-gray-400 mb-0.5">1등 확률</div>
                          <div className="text-sm  text-indigo-600">1 / {Math.round(8145060 / gameCount).toLocaleString()}</div>
                        </div>
                        <div className="bg-white rounded-xl border border-amber-100 px-2 py-2 text-center">
                          <div className="text-[12px] text-amber-500 mb-0.5">기본 대비</div>
                          <div className="text-sm  text-amber-600">× {(gameCount / 5).toFixed(1)} 배</div>
                        </div>
                      </div>
                    </div>

                    {/* Type 3 원본 조합 리스트 */}
                    <div className="flex-none flex flex-col rounded-2xl border border-emerald-200 bg-emerald-50/60 px-4 py-4 md:px-5">
                      <div className="flex-none flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-base  text-emerald-900">
                            랜덤 &times; {type3Numbers.length > 0 ? type3Numbers.length : gameCount}
                          </span>
                          {type3Numbers.length > 0 && (
                            <button
                              onClick={toggleAllCombos}
                              className="text-xs text-emerald-600 font-medium hover:text-emerald-800 transition-colors"
                            >
                              {selectedComboIndices.size === type3Numbers.length ? '전체 해제' : '전체 선택'}
                            </button>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {confirmMsg && <span className="text-xs font-medium text-red-500">{confirmMsg}</span>}
                          {isSavingPredicted && <span className="text-xs text-gray-400">저장 중...</span>}
                          {type3Numbers.length > 0 && (
                            <button
                              onClick={confirmPurchase}
                              disabled={isConfirming || results.length === 0 || selectedComboIndices.size === 0}
                              className="inline-flex items-center gap-1 px-3 py-1 text-xs  bg-rose-500 text-white rounded-lg hover:bg-rose-600 disabled:opacity-40 transition-all"
                            >
                              {isConfirming
                                ? <><span className="inline-block w-2.5 h-2.5 border-2 border-white border-t-transparent rounded-full animate-spin" />확정 중</>
                                : `🎯 확정하기 ${selectedComboIndices.size > 0 ? `(${selectedComboIndices.size}개)` : ''}`}
                            </button>
                          )}
                        </div>
                      </div>
                      {type3Numbers.length > 0 ? (
                        <>
                          {(() => {
                            const useGrid = type3Numbers.length > 5;
                            if (useGrid) {
                              const half = Math.ceil(type3Numbers.length / 2);
                              const renderCol = (combos: number[][], offset: number) => (
                                <div className="flex flex-col divide-y divide-emerald-100 rounded-xl border border-emerald-200 bg-white overflow-hidden">
                                  {combos.map((combo, i) => {
                                    const idx = offset + i;
                                    const selected = selectedComboIndices.has(idx);
                                    return (
                                      <div
                                        key={i}
                                        onClick={() => toggleComboSelection(idx)}
                                        className={`flex items-center gap-1.5 py-2 px-2 cursor-pointer transition-all ${selected ? 'bg-indigo-50 ring-1 ring-inset ring-indigo-300' : 'hover:bg-gray-50'}`}
                                      >
                                        <span className={`w-4 h-4 flex-shrink-0 rounded-full border-2 flex items-center justify-center ${selected ? 'bg-indigo-500 border-indigo-500' : 'border-gray-300'}`}>
                                          {selected && <span className="text-white text-[9px] ">✓</span>}
                                        </span>
                                        <div className="flex justify-center gap-1 flex-1">
                                          {combo.map((num, j) => <NumberBall key={j} num={num} size="sm" highlighted={selected} />)}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              );
                              return (
                                <div className="grid grid-cols-2 gap-2">
                                  {renderCol(type3Numbers.slice(0, half), 0)}
                                  {renderCol(type3Numbers.slice(half), half)}
                                </div>
                              );
                            }
                            return (
                              <div className="flex flex-col rounded-xl border border-emerald-200 bg-white overflow-hidden divide-y divide-emerald-100">
                                {type3Numbers.map((combo, i) => {
                                  const selected = selectedComboIndices.has(i);
                                  return (
                                    <div
                                      key={i}
                                      onClick={() => toggleComboSelection(i)}
                                      className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-all ${selected ? 'bg-indigo-50 ring-1 ring-inset ring-indigo-300' : 'hover:bg-gray-50'}`}
                                    >
                                      <span className={`w-5 h-5 flex-shrink-0 rounded-full border-2 flex items-center justify-center ${selected ? 'bg-indigo-500 border-indigo-500' : 'border-gray-300'}`}>
                                        {selected && <span className="text-white text-xs ">✓</span>}
                                      </span>
                                      <div className="flex justify-center gap-2.5 flex-1">
                                        {combo.map((num, j) => <NumberBall key={j} num={num} size="md" highlighted={selected} />)}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })()}
                        </>
                      ) : (
                        <p className="text-sm text-gray-400">{aiError || '버튼을 눌러 번호를 생성하세요.'}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* 최종 확정 트레이 — Claude 추천 체크 */}
              {expertPicks.length > 0 && (() => {
                const totalSelected = expertPickChecked.size;
                return (
                  <div className="sticky bottom-0 -mx-4 md:-mx-5 mt-auto px-4 md:px-5 py-3 bg-white/95 backdrop-blur-sm border-t border-gray-200 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm  text-gray-800">선택 {totalSelected}게임 <span className="text-[11px] font-normal text-gray-400">/ 최대 5게임 · 1세트로 확정</span></div>
                      <div className="text-[11px] text-gray-400">
                        {(totalSelected * 1000).toLocaleString()}원
                        {totalSelected > 0 ? ` · 1등 확률 1 / ${Math.round(8145060 / totalSelected).toLocaleString()}` : ''}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {finalConfirmMsg && <span className="text-xs font-medium text-emerald-600">{finalConfirmMsg}</span>}
                      <button
                        onClick={confirmFinalSelection}
                        disabled={isConfirmingFinal || totalSelected === 0 || results.length === 0}
                        className="inline-flex items-center gap-1.5 px-5 py-2 text-sm  bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-40 transition-all"
                      >
                        {isConfirmingFinal
                          ? <><span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />확정 중</>
                          : '🎯 최종 확정'}
                      </button>
                    </div>
                  </div>
                );
              })()}

            </div>
          </section>
        </div>

      </div>

      {/* 확정 팝업 */}
      {showInfoPopup && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setShowInfoPopup(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-[560px] max-w-[95vw] max-h-[85vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 팝업 헤더 */}
            <div className="flex-none flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-base  text-gray-800">🎯 확정 현황</h3>
              <button onClick={() => setShowInfoPopup(false)} className="text-gray-400 hover:text-gray-700 text-xl leading-none px-1">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-6">

              {/* 구매 이력 — 회차별 그룹 + 아코디언 */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm  text-rose-800">📋 구매 이력</h4>
                  {confirmedPurchases.length > 0 && (
                    <span className="text-[12px] text-gray-400">{new Set(confirmedPurchases.map(p => p.target_round)).size}회차 · {confirmedPurchases.length}종</span>
                  )}
                </div>
                {confirmedPurchases.length === 0 ? (
                  <p className="text-sm text-gray-400">확정된 구매 이력이 없습니다.</p>
                ) : (() => {
                  const tierOrder = ['1등', '2등', '3등', '4등', '5등', '낙첨'];
                  const slotLabels = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];

                  // 회차별 그룹화, 최신 회차 먼저
                  const byRound = confirmedPurchases.reduce<Record<number, ConfirmedPurchase[]>>((acc, p) => {
                    (acc[p.target_round] ??= []).push(p);
                    return acc;
                  }, {});
                  const rounds = Object.keys(byRound).map(Number).sort((a, b) => b - a);

                  return (
                    <div className="flex flex-col gap-3">
                      {rounds.map(round => {
                        const purchases = byRound[round];
                        const actual = results.find(r => r.round === round);
                        const winNums = actual
                          ? [actual.num1, actual.num2, actual.num3, actual.num4, actual.num5, actual.num6].filter((n): n is number => n != null)
                          : [];
                        const winSet = new Set(winNums);
                        const displaySet = new Set<number>([...winNums, ...(actual?.bonus1 != null ? [actual.bonus1] : [])]);

                        // 전체 회차 최고 등수
                        const roundBestTier = purchases.flatMap(p =>
                          actual ? p.combos.map(combo => {
                            const matchCount = combo.filter(n => winSet.has(n)).length;
                            const bonusMatch = matchCount === 5 && actual.bonus1 != null && combo.includes(actual.bonus1);
                            return getPrizeTier(matchCount, bonusMatch);
                          }) : []
                        ).reduce((best, t) =>
                          tierOrder.indexOf(t) < tierOrder.indexOf(best) ? t : best, '낙첨');

                        return (
                          <div key={round} className="rounded-xl border border-rose-100 overflow-hidden">
                            {/* 회차 헤더 */}
                            <div className="flex items-center gap-2 px-4 py-2.5 bg-rose-50 border-b border-rose-100">
                              <span className="text-sm  text-rose-800">{round}회</span>
                              {actual ? (
                                <span className="text-[12px] text-gray-400">{actual.draw_date}</span>
                              ) : (
                                <span className="text-[12px] text-amber-500 ">추첨 대기</span>
                              )}
                              <span className="text-[12px] text-gray-400">{purchases.length}종 확정</span>
                              <div className="ml-auto flex items-center gap-2">
                                {actual && roundBestTier !== '낙첨' && (
                                  <span className={`text-[12px]  px-2 py-0.5 rounded-full border ${getTierStyle(roundBestTier)}`}>
                                    최고 {roundBestTier}
                                  </span>
                                )}
                                {!actual && (
                                  <button
                                    onClick={() => sendTelegram(round)}
                                    disabled={sendingTelegramRound === round}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[12px]  bg-sky-500 text-white hover:bg-sky-600 disabled:opacity-50 transition-all"
                                  >
                                    {sendingTelegramRound === round
                                      ? <><span className="inline-block w-2 h-2 border border-white border-t-transparent rounded-full animate-spin" />전송 중</>
                                      : '✈ 전송'}
                                  </button>
                                )}
                                {telegramMsg?.round === round && (
                                  <span className={`text-[12px] font-medium ${telegramMsg.ok ? 'text-sky-600' : 'text-red-500'}`}>
                                    {telegramMsg.text}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* 당첨 번호 (추첨 완료 시) */}
                            {actual && (
                              <div className="flex items-center gap-2 px-4 py-2 border-b border-rose-100 bg-white/60">
                                <span className="text-[12px] text-gray-400 flex-shrink-0 w-12">당첨번호</span>
                                <div className="flex gap-1 flex-wrap">
                                  {winNums.map((num, j) => <NumberBall key={j} num={num} size="sm" highlighted />)}
                                  {actual.bonus1 != null && (
                                    <><span className="text-[12px] text-gray-300 self-center">+</span>
                                    <NumberBall num={actual.bonus1} size="sm" highlighted /></>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* 슬롯 목록 (아코디언) */}
                            <div className="divide-y divide-rose-100">
                              {(() => {
                                const sortedPurchases = [...purchases].sort((a, b) =>
                                  (MODE_ORDER[a.generation_mode ?? ''] ?? 99) - (MODE_ORDER[b.generation_mode ?? ''] ?? 99)
                                );
                                const selectedReasons: Map<number, string> = purchases.length >= 2
                                  ? new Map(selectBestPurchases(purchases, actual, bonusCandidateNums, topFreqNums).map(s => [s.purchase.id, s.reason]))
                                  : new Map();
                                return sortedPurchases.map((purchase, slotIdx) => {
                                  const analyses = actual
                                    ? purchase.combos.map(combo => {
                                        const matchCount = combo.filter(n => winSet.has(n)).length;
                                        const bonusMatch = matchCount === 5 && actual.bonus1 != null && combo.includes(actual.bonus1);
                                        return { matchCount, bonusMatch, tier: getPrizeTier(matchCount, bonusMatch) };
                                      })
                                    : null;
                                  const bestTier = analyses?.reduce((best, a) =>
                                    tierOrder.indexOf(a.tier) < tierOrder.indexOf(best) ? a.tier : best, '낙첨');
                                  const isOpen = openConfirmedIds.has(purchase.id);
                                  const isSelected = selectedReasons.has(purchase.id);
                                  const selectionReason = selectedReasons.get(purchase.id);

                                  return (
                                    <div key={purchase.id} className="bg-white">
                                      {/* 슬롯 헤더 (클릭으로 토글) */}
                                      <div
                                        className="flex items-center gap-2 px-4 py-2.5 cursor-pointer hover:bg-rose-50/60 transition-colors select-none"
                                        onClick={() => setOpenConfirmedIds(prev => { const next = new Set(prev); isOpen ? next.delete(purchase.id) : next.add(purchase.id); return next; })}
                                      >
                                        <span className="text-xs  text-rose-500 w-4">{slotLabels[slotIdx]}</span>
                                        {purchase.generation_mode && (
                                          <span className="text-[12px]  px-1.5 py-0.5 rounded bg-violet-100 text-violet-700">
                                            {MODE_LABELS[purchase.generation_mode] ?? purchase.generation_mode}
                                          </span>
                                        )}
                                        {isSelected && (
                                          <span className="flex items-center gap-1">
                                            <span className="text-[12px]  px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 border border-emerald-200">
                                              선정
                                            </span>
                                            <span className="text-[12px] text-emerald-600">{selectionReason}</span>
                                          </span>
                                        )}
                                        {actual && bestTier ? (
                                          <span className={`text-[12px]  px-1.5 py-0.5 rounded-full border ${getTierStyle(bestTier)}`}>
                                            최고 {bestTier}
                                          </span>
                                        ) : !actual ? (
                                          <span className="text-[12px] text-gray-400">대기 중</span>
                                        ) : null}
                                        <button
                                          onClick={(e) => { e.stopPropagation(); deleteConfirmed(purchase.id); }}
                                          className="ml-auto text-gray-300 hover:text-red-400 text-base leading-none transition-colors px-1"
                                          title="삭제"
                                        >×</button>
                                        <span className="text-[12px] text-gray-300">{isOpen ? '▲' : '▼'}</span>
                                      </div>

                                      {/* 조합 상세 (펼쳐짐) */}
                                      {isOpen && (
                                        <div className="px-4 pb-3 bg-rose-50/20">
                                          <div className="flex flex-col divide-y divide-rose-100">
                                            {purchase.combos.map((combo, i) => (
                                              <div key={i} className="flex items-center gap-2 py-1.5">
                                                <div className="flex gap-1 flex-1">
                                                  {combo.map((num, j) => (
                                                    <NumberBall key={j} num={num} size="sm" highlighted={actual ? displaySet.has(num) : false} />
                                                  ))}
                                                </div>
                                                {analyses && (
                                                  <span className={`flex-shrink-0 text-[12px]  px-1.5 py-0.5 rounded-full border ${getTierStyle(analyses[i].tier)}`}>
                                                    {analyses[i].tier}
                                                  </span>
                                                )}
                                              </div>
                                            ))}
                                          </div>
                                          {analyses && bestTier && (
                                            <div className="mt-2 pt-2 border-t border-rose-100 text-[11px] text-gray-500 text-center">
                                              최고 <b className={getTierTextColor(bestTier)}>{bestTier}</b>
                                              {' · '}평균 일치 <b className="text-gray-700">
                                                {(analyses.reduce((s, a) => s + a.matchCount, 0) / analyses.length).toFixed(1)}개
                                              </b>
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  );
                                });
                              })()}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>

              {/* 생성 전략 */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <h4 className="text-sm  text-indigo-800">⚙️ 생성 전략</h4>
                  <span className="px-2 py-0.5 rounded-full text-[12px]  bg-indigo-100 text-indigo-700">랜덤</span>
                </div>
                <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 px-4 py-4 flex flex-col gap-2.5">
                  {GENERATION_STRATEGY.map(({ tag, color, desc }) => (
                    <div key={tag} className="flex items-start gap-3">
                      <span className={`flex-shrink-0 mt-0.5 inline-flex items-center justify-center w-[108px] px-2 py-1 rounded-lg text-xs  whitespace-nowrap ${color}`}>{tag}</span>
                      <span className="text-xs text-gray-600 leading-snug pt-0.5">{desc}</span>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* 분포도 팝업 */}
      {distPopup && (
        <DistributionPopup
          distribution={distPopup.distribution}
          conditionText={distPopup.conditionText}
          roundsAnalyzed={distPopup.roundsAnalyzed}
          onClose={() => setDistPopup(null)}
        />
      )}

      {/* ===== 조건 유형 설명 팝업 ===== */}
      {showConditionHelp && (() => {
        const CONDITION_HELP: { label: string; desc: string; required: string }[] = [
          { label: '기간', desc: '최근 N년 N개월(또는 전체) 당첨번호 중 가장 자주 나온 상위 6개 번호를 추출합니다.', required: '연도, 개월 수 (둘 다 0이면 전체 회차 대상)' },
          { label: '연속번호', desc: '연속된 번호(n, n+1)가 없는/2개인/3개 이상인 회차만 모아, 그 안에서 가장 자주 나온 6개를 추출합니다.', required: '연속 패턴 — 없음 / 2개 / 3개+' },
          { label: '홀짝', desc: '홀수 개수가 지정한 값과 일치하는 회차만 모아, 그 안에서 가장 자주 나온 6개를 추출합니다.', required: '홀수 개수 (0~6, 정확히 일치)' },
          { label: '합계', desc: '6개 번호의 합이 지정한 범위(최소~최대) 안에 드는 회차만 모아, 그 안에서 가장 자주 나온 6개를 추출합니다.', required: '합계 최소값, 최대값 (이상~이하)' },
          { label: 'AC값', desc: '번호 간 차이값의 다양성 지표(AC)가 지정한 값 이상인 회차만 모아, 그 안에서 가장 자주 나온 6개를 추출합니다.', required: 'AC값 하한 (0~10, 이상)' },
          { label: '밴드커버', desc: '1~9·10~19·20~29·30~39·40~45 구간 중 지정한 개수 이상을 커버하는 회차만 모아, 그 안에서 가장 자주 나온 6개를 추출합니다.', required: '최소 커버 밴드 수 (4 또는 5, 이상)' },
          { label: '소수포함', desc: '소수(2,3,5,7,11...) 개수가 지정한 값과 일치하는 회차만 모아, 그 안에서 가장 자주 나온 6개를 추출합니다.', required: '소수 개수 (0~6, 정확히 일치)' },
          { label: '끝수다양', desc: '끝자리 숫자(0~9)의 종류 수가 지정한 값 이상인 회차만 모아, 그 안에서 가장 자주 나온 6개를 추출합니다.', required: '최소 고유 끝수 종류 수 (이상)' },
        ];
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
            onClick={() => setShowConditionHelp(false)}
          >
            <div
              className="bg-white rounded-2xl shadow-2xl px-6 py-5 w-[700px] max-w-[92vw] max-h-[80vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base  text-gray-800">조건 유형 설명</h3>
                <button onClick={() => setShowConditionHelp(false)} className="text-gray-400 hover:text-gray-700 text-xl leading-none px-1">✕</button>
              </div>

              {/* 탭 */}
              <div className="flex items-center bg-gray-100 rounded-lg p-1 gap-1 mb-4 w-fit">
                {([
                  { key: 'relation', label: '당첨번호 생성과 연관 관계' },
                  { key: 'types', label: '조건 유형별 설명' },
                ] as const).map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setConditionHelpTab(key)}
                    className={`px-2.5 py-1 rounded-md text-xs  transition-all ${
                      conditionHelpTab === key ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {conditionHelpTab === 'relation' ? (
                <>
                  <p className="text-xs text-gray-600 leading-relaxed mb-4">
                    번호 생성은 항상 <b>완전 무작위(랜덤)</b>이며, 조건분석 결과가 조합 자체를 바꾸지는 않습니다.
                    대신 각 조건 행의 상위6 번호와 보너스 번호가 모여 <b>보너스 후보(2등 전략)</b>·<b>빈도 상위(3등 전략)</b>
                    번호를 만들고, 이 번호들이 아래 두 단계에서 쓰입니다.
                  </p>
                  <div className="flex flex-col divide-y divide-gray-100">
                    <div className="py-2.5 flex flex-col gap-1">
                      <span className="text-xs  text-violet-700">1) 조합 100개 생성</span>
                      <p className="text-xs text-gray-600 leading-relaxed">1~45 중 6개를 완전 무작위로 뽑아 게임 수만큼 생성합니다. 조건분석 결과는 이 단계에 전혀 관여하지 않습니다.</p>
                    </div>
                    <div className="py-2.5 flex flex-col gap-1">
                      <span className="text-xs  text-violet-700">2) Claude 추천 5개 선정</span>
                      <p className="text-xs text-gray-600 leading-relaxed">생성된 100개 중, 조건분석에서 나온 보너스 후보·빈도 상위 번호를 많이 포함한 조합일수록 점수가 높아져 상위 5개로 추천됩니다. 조건분석을 실행해두지 않으면 이 가중치 없이 밴드분산·홀짝균형 등 조합 자체의 구조적 점수만으로 5개가 선정됩니다.</p>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex flex-col divide-y divide-gray-100">
                    {CONDITION_HELP.map(({ label, desc, required }) => (
                      <div key={label} className="py-2.5 flex flex-col gap-1">
                        <span className="text-xs  text-emerald-700">{label}</span>
                        <p className="text-xs text-gray-600 leading-relaxed">{desc}</p>
                        <p className="text-[11px] text-gray-400">필수 지정: {required}</p>
                      </div>
                    ))}
                  </div>
                  <p className="text-[12px] text-gray-300 text-center mt-4">
                    각 조건 행에서 유형을 선택하면 위 방식대로 필터링된 회차 안에서 상위 6개 번호를 계산합니다.
                  </p>
                </>
              )}
            </div>
          </div>
        );
      })()}

      {/* ===== 성과 대시보드 팝업 ===== */}
      {showDashboard && (() => {
        const TIER_ORDER = ['1등', '2등', '3등', '4등', '5등', '낙첨'];
        const MODE_LABEL: Record<string, string> = {
          anchor: '앵커4', anchor3: '앵커3', anchor2: '앵커2',
          'no-consec': '연속없음', 'two-consec': '연속2개',
          random: '랜덤', 'wheel-full': '풀휠', 'wheel-budget': '예산휠', 'wheel-topscore': '고득점휠',
        };
        const TIER_COLOR: Record<string, string> = {
          '1등': 'bg-rose-500', '2등': 'bg-orange-500', '3등': 'bg-amber-400',
          '4등': 'bg-blue-400', '5등': 'bg-emerald-400', '낙첨': 'bg-gray-200',
        };
        const TIER_BADGE2: Record<string, string> = {
          '1등': 'bg-rose-50 text-rose-600 border-rose-200',
          '2등': 'bg-orange-50 text-orange-600 border-orange-200',
          '3등': 'bg-amber-50 text-amber-700 border-amber-200',
          '4등': 'bg-blue-50 text-blue-600 border-blue-200',
          '5등': 'bg-emerald-50 text-emerald-700 border-emerald-200',
          '낙첨': 'bg-gray-50 text-gray-400 border-gray-200',
        };

        // 결과 있는 구매만 분석
        const analyzed = confirmedPurchases.filter(p => p.prize_tier != null);
        // 회차별 그룹화
        const byRound: Record<number, ConfirmedPurchase[]> = {};
        analyzed.forEach(p => { (byRound[p.target_round] ??= []).push(p); });
        const roundKeys = Object.keys(byRound).map(Number).sort((a, b) => b - a);

        // 회차별 최고 등수 계산
        const roundStats = roundKeys.map(round => {
          const purchases = byRound[round];
          const bestTier = purchases.reduce((best, p) => {
            const t = p.prize_tier ?? '낙첨';
            return TIER_ORDER.indexOf(t) < TIER_ORDER.indexOf(best) ? t : best;
          }, '낙첨');
          const games = purchases.reduce((sum, p) => sum + p.combos.length, 0);
          const modes = [...new Set(purchases.map(p => p.generation_mode ?? '?'))];
          return { round, games, bestTier, modes, purchases };
        });

        // 요약 집계
        const totalAnalyzedRounds = roundStats.length;
        const totalGames = roundStats.reduce((s, r) => s + r.games, 0);
        const hitRounds = roundStats.filter(r => r.bestTier !== '낙첨').length;
        const hitRate = totalAnalyzedRounds > 0 ? hitRounds / totalAnalyzedRounds * 100 : 0;

        // 등수 분포 (회차 기준 최고 등수)
        const tierDist: Record<string, number> = { '1등': 0, '2등': 0, '3등': 0, '4등': 0, '5등': 0, '낙첨': 0 };
        roundStats.forEach(r => { tierDist[r.bestTier] = (tierDist[r.bestTier] ?? 0) + 1; });

        // 고정 당첨금 추산 (matched_numbers에서 3매치=5등, 4매치=4등)
        let cnt5 = 0, cnt4 = 0;
        analyzed.forEach(p => {
          if (Array.isArray(p.matched_numbers)) {
            p.matched_numbers.forEach((mc: number) => {
              if (mc === 3) cnt5++;
              else if (mc === 4) cnt4++;
            });
          }
        });
        const fixedPrize = cnt5 * 5000 + cnt4 * 50000;
        const totalInvest = totalGames * 1000;

        // 대기 중 (결과 없는) 구매
        const pending = confirmedPurchases.filter(p => p.prize_tier == null);
        const pendingRounds = new Set(pending.map(p => p.target_round)).size;

        // 전략별 성과
        const modeStats: Record<string, { rounds: number; hits: number }> = {};
        roundStats.forEach(r => {
          r.modes.forEach(m => {
            if (!modeStats[m]) modeStats[m] = { rounds: 0, hits: 0 };
            modeStats[m].rounds++;
            if (r.bestTier !== '낙첨') modeStats[m].hits++;
          });
        });

        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
            onClick={() => setShowDashboard(false)}
          >
            <div
              className="bg-white rounded-2xl shadow-2xl w-[680px] max-w-[95vw] max-h-[88vh] flex flex-col overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* 헤더 */}
              <div className="flex-none flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <h3 className="text-base  text-gray-800">📊 성과 대시보드</h3>
                <div className="flex items-center gap-3">
                  {pendingRounds > 0 && (
                    <span className="text-[11px] text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                      대기 {pendingRounds}회차
                    </span>
                  )}
                  <button onClick={() => setShowDashboard(false)} className="text-gray-400 hover:text-gray-700 text-xl leading-none px-1">✕</button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-5">

                {analyzed.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                    <span className="text-4xl mb-3">🎰</span>
                    <p className="text-sm font-medium">분석된 구매 이력이 없습니다</p>
                    <p className="text-xs mt-1 text-gray-300">추첨 결과가 반영된 구매 이력이 있어야 성과를 확인할 수 있습니다.</p>
                  </div>
                ) : (
                  <>
                    {/* 요약 카드 4개 */}
                    <div className="grid grid-cols-4 gap-3">
                      {[
                        { label: '분석 회차', value: `${totalAnalyzedRounds}회차`, sub: `게임 ${totalGames}개`, color: 'border-indigo-100 bg-indigo-50', valueColor: 'text-indigo-700' },
                        { label: '적중 회차', value: `${hitRounds}회`, sub: `적중률 ${hitRate.toFixed(1)}%`, color: hitRounds > 0 ? 'border-emerald-200 bg-emerald-50' : 'border-gray-100 bg-gray-50', valueColor: hitRounds > 0 ? 'text-emerald-700' : 'text-gray-400' },
                        { label: '투자금', value: `${(totalInvest / 10000).toFixed(0)}만원`, sub: `게임당 1,000원`, color: 'border-gray-100 bg-gray-50', valueColor: 'text-gray-700' },
                        { label: '확정 당첨금', value: `${fixedPrize.toLocaleString()}원`, sub: `5등×${cnt5} + 4등×${cnt4}`, color: fixedPrize > 0 ? 'border-amber-200 bg-amber-50' : 'border-gray-100 bg-gray-50', valueColor: fixedPrize > 0 ? 'text-amber-700' : 'text-gray-400' },
                      ].map(card => (
                        <div key={card.label} className={`rounded-xl border ${card.color} px-3 py-3 text-center`}>
                          <div className="text-[12px] text-gray-500 mb-1">{card.label}</div>
                          <div className={`text-base  ${card.valueColor}`}>{card.value}</div>
                          <div className="text-[12px] text-gray-400 mt-0.5">{card.sub}</div>
                        </div>
                      ))}
                    </div>

                    {/* 등수 분포 */}
                    <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                      <p className="text-xs  text-gray-600 mb-3">
                        회차별 최고 등수 분포
                        <span className="ml-2 text-gray-400 font-normal">({totalAnalyzedRounds}회차 기준)</span>
                      </p>
                      <div className="flex flex-col gap-1.5">
                        {TIER_ORDER.map(tier => {
                          const cnt = tierDist[tier] ?? 0;
                          const pct = totalAnalyzedRounds > 0 ? cnt / totalAnalyzedRounds * 100 : 0;
                          return (
                            <div key={tier} className="flex items-center gap-2">
                              <span className={`w-10 text-right text-[12px]  px-1 py-0.5 rounded border ${TIER_BADGE2[tier]}`}>{tier}</span>
                              <div className="flex-1 h-4 bg-white rounded border border-gray-100 overflow-hidden">
                                <div className={`h-full rounded transition-all duration-500 ${TIER_COLOR[tier]}`} style={{ width: `${pct}%` }} />
                              </div>
                              <span className="w-20 text-[12px] text-gray-500 text-right">
                                {cnt}회 <span className="text-gray-400">({pct.toFixed(1)}%)</span>
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* 전략별 성과 */}
                    {Object.keys(modeStats).length > 0 && (
                      <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                        <p className="text-xs  text-gray-600 mb-3">전략별 적중률</p>
                        <div className="grid grid-cols-2 gap-2">
                          {Object.entries(modeStats)
                            .sort((a, b) => (b[1].hits / Math.max(b[1].rounds, 1)) - (a[1].hits / Math.max(a[1].rounds, 1)))
                            .map(([mode, stat]) => {
                              const rate = stat.rounds > 0 ? stat.hits / stat.rounds * 100 : 0;
                              return (
                                <div key={mode} className="bg-white rounded-lg border border-gray-100 px-3 py-2 flex items-center justify-between gap-2">
                                  <span className="text-[11px]  text-gray-700 px-1.5 py-0.5 rounded bg-violet-100 text-violet-700">{MODE_LABEL[mode] ?? mode}</span>
                                  <div className="text-right">
                                    <div className="text-xs  text-gray-800">{rate.toFixed(1)}%</div>
                                    <div className="text-[12px] text-gray-400">{stat.hits}/{stat.rounds}회</div>
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      </div>
                    )}

                    {/* 회차별 이력 */}
                    <div>
                      <p className="text-xs  text-gray-600 mb-2">회차별 이력 <span className="text-gray-400 font-normal">({roundStats.length}회차)</span></p>
                      <div className="rounded-xl border border-gray-100 overflow-hidden">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-gray-50 border-b border-gray-100 text-gray-500">
                              <th className="text-left px-3 py-2 font-medium whitespace-nowrap">회차</th>
                              <th className="text-left px-3 py-2 font-medium">전략</th>
                              <th className="text-center px-3 py-2 font-medium whitespace-nowrap">게임</th>
                              <th className="text-center px-3 py-2 font-medium whitespace-nowrap">최고</th>
                              <th className="text-left px-3 py-2 font-medium">일치 수</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {roundStats.map(r => {
                              const isHit = r.bestTier !== '낙첨';
                              const allMatchCounts = r.purchases.flatMap(p =>
                                Array.isArray(p.matched_numbers) ? (p.matched_numbers as number[]) : []
                              );
                              return (
                                <tr key={r.round} className={isHit ? 'bg-emerald-50/50' : 'bg-white'}>
                                  <td className="px-3 py-2 font-medium text-gray-700 whitespace-nowrap">{r.round}회</td>
                                  <td className="px-3 py-2">
                                    <div className="flex gap-1 flex-wrap">
                                      {r.modes.map(m => (
                                        <span key={m} className="text-[12px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 font-medium">
                                          {MODE_LABEL[m] ?? m}
                                        </span>
                                      ))}
                                    </div>
                                  </td>
                                  <td className="px-3 py-2 text-center text-gray-500">{r.games}</td>
                                  <td className="px-3 py-2 text-center">
                                    <span className={`inline-block px-1.5 py-0.5 rounded border text-[12px]  ${TIER_BADGE2[r.bestTier] ?? ''}`}>
                                      {r.bestTier}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2">
                                    <div className="flex gap-0.5 flex-wrap">
                                      {allMatchCounts.map((mc, i) => (
                                        <span
                                          key={i}
                                          className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[9px]                                             ${mc >= 5 ? 'bg-rose-100 text-rose-600' : mc === 4 ? 'bg-blue-100 text-blue-600' : mc === 3 ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-400'}`}
                                        >
                                          {mc}
                                        </span>
                                      ))}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* 안내 */}
                    <p className="text-[12px] text-gray-300 text-center">
                      5등(3일치)=5,000원·4등(4일치)=50,000원 고정 기준. 3등 이상은 실제 당첨금 별도 확인 필요.
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </main>

    {/* ===== 버튼 호버 툴팁 (fixed — overflow-hidden 섹션에서도 노출) ===== */}
    {tooltipInfo && (() => {
      const TOOLTIPS: Record<string, { title: string; titleColor: string; desc: string }> = {
        generate: {
          title: '🎲 생성',
          titleColor: 'text-indigo-300',
          desc: '1~45 중 6개를 완전 무작위로 100개 생성하고, 조건분석 기반 점수로 상위 5개를 추천합니다. 최근 100회차 백테스트 성과도 함께 표시됩니다.',
        },
        'combo-stats': {
          title: '📊 조합 통계 · 점수 산정식',
          titleColor: 'text-violet-300',
          desc: '합=6개 번호 합계, 홀/짝=홀수·짝수 개수, 밴드=1~9·10~19·20~29·30~39·40~45 중 포함 구간 수.\n\n점수 = 밴드(3밴드+5·4밴드+10·5밴드+15)\n+ 홀짝균형(3:3+20·2:4+15·1:5+6)\n+ 합계범위(108~168+20·93~183+10)\n+ 끝수다양성(종류수×3, 최대15)\n− 연속쌍3개+ 페널티(−10)\n+ 보너스후보 포함개수×5\n+ 빈도상위 포함개수×2',
        },
      };
      const tip = TOOLTIPS[tooltipInfo.id];
      if (!tip) return null;
      return (
        <div
          className="pointer-events-none fixed z-[300] w-64 max-w-[80vw] rounded-xl bg-gray-900 px-3 py-2.5 text-xs text-white shadow-2xl"
          style={{
            left: tooltipInfo.x,
            top: tooltipInfo.y,
            width: tip.desc.length > 80 ? '20rem' : undefined,
            transform: `translateX(-50%) ${tooltipInfo.above ? 'translateY(-100%)' : 'translateY(0)'}`,
          }}
        >
          <p className={` mb-1 ${tip.titleColor}`}>{tip.title}</p>
          <p className="text-gray-300 leading-relaxed whitespace-pre-line">{tip.desc}</p>
          {tooltipInfo.above
            ? <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
            : <div className="absolute bottom-full left-1/2 -translate-x-1/2 border-4 border-transparent border-b-gray-900" />
          }
        </div>
      );
    })()}
    </>
  );
}
