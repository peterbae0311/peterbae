'use client';

import React, { useEffect, useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface KrStockAnalysisData {
  stockName: string;
  stockCode: string;
  price: number;
  changeRate: number;
  model?: string;
  modelCutoff?: string;
  analysis: {
    companyGuidance: string;
    shortTerm: string;
    longTerm: string;
    targetPriceRange: { low: number; consensus: number; high: number } | null;
    opportunities: string[];
    risks: string[];
    outlook: 'bullish' | 'neutral' | 'bearish';
    sources: string[];
  };
}

interface FundamentalsData {
  per: number | null;
  investorTrend: {
    date:          string;
    foreign:       number; // 순매수량 (주), 음수=순매도
    institutional: number;
    individual:    number;
  } | null;
  latestEarnings: { period: string; revenue: number; operatingProfit: number } | null;
  prevEarnings:   { period: string; revenue: number; operatingProfit: number } | null;
  companySummary: string[] | null;
  livePrice:      number | null;
  liveChangeRate: number | null;
  fetchedAt?: string;
  error?: string;
}

interface KrStockAnalysisModalProps {
  stockName: string;
  stockCode: string;
  price: number;
  changeRate: number;
  onClose: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const OUTLOOK_STYLE: Record<'bullish' | 'neutral' | 'bearish', string> = {
  bullish: 'bg-red-900/40 text-red-300 border border-red-700',
  neutral: 'bg-gray-700/60 text-gray-300 border border-gray-600',
  bearish: 'bg-blue-900/40 text-blue-300 border border-blue-700',
};
const OUTLOOK_LABEL: Record<'bullish' | 'neutral' | 'bearish', string> = {
  bullish: '강세', neutral: '중립', bearish: '약세',
};

function yoyColor(pct: number): React.CSSProperties {
  return { color: pct >= 0 ? 'var(--clr-up)' : 'var(--clr-down)' };
}
function yoySign(pct: number) { return pct >= 0 ? '+' : ''; }

function fmtOk(n: number) {
  return Math.abs(n) >= 10000
    ? `${(n / 10000).toFixed(1)}조`
    : `${n.toLocaleString('ko-KR')}억`;
}

function KrPriceRangeBar({
  low, consensus, high, current,
}: { low: number; consensus: number; high: number; current: number }) {
  const safeLow  = Math.min(low, high);
  const safeHigh = Math.max(low, high);
  const min = Math.min(safeLow, current) * 0.98;
  const max = Math.max(safeHigh, current) * 1.02;
  const range = max - min;
  const pct = (v: number) => `${(((v - min) / range) * 100).toFixed(1)}%`;
  const barW = `${Math.max(0, (((safeHigh - safeLow) / range) * 100)).toFixed(1)}%`;

  return (
    <div className="mt-2">
      <div className="relative h-2 bg-gray-700 rounded-full">
        <div className="absolute top-0 h-2 bg-blue-600/40 rounded-full" style={{ left: pct(safeLow), width: barW }} />
        <div className="absolute top-1/2 -translate-y-1/2 w-0.5 h-3 bg-gray-300 rounded" style={{ left: pct(consensus) }} />
        <div className="absolute top-1/2 -translate-y-1/2 w-2 h-2 bg-yellow-400 rounded-full border border-yellow-300"
          style={{ left: pct(current), transform: 'translate(-50%, -50%)' }} />
      </div>
      <div className="flex justify-between mt-1 text-[10px] text-gray-500 font-mono">
        <span>Low ₩{safeLow.toLocaleString('ko-KR')}</span>
        <span className="text-gray-400">컨센서스 ₩{consensus.toLocaleString('ko-KR')}</span>
        <span>High ₩{safeHigh.toLocaleString('ko-KR')}</span>
      </div>
    </div>
  );
}

// ── Fundamentals sections ─────────────────────────────────────────────────────

function InvestorTrendSection({ data }: { data: FundamentalsData }) {
  const t = data.investorTrend;
  if (!t) return null;

  const rows = [
    { label: '외국인', net: t.foreign },
    { label: '기관',   net: t.institutional },
    { label: '개인',   net: t.individual },
  ];

  const dateLabel = t.date
    ? `${t.date.slice(0, 4)}-${t.date.slice(4, 6)}-${t.date.slice(6, 8)}`
    : '당일';

  return (
    <div className="bg-gray-800 rounded-lg p-3 mb-3">
      <p className="text-[11px] font-semibold text-gray-400 mb-2">
        👥 투자자 동향
        <span className="ml-1 font-normal text-gray-500">({dateLabel} 순매수량)</span>
      </p>
      <table className="w-full text-[10px]">
        <thead>
          <tr style={{ color: 'var(--text-muted)' }}>
            <th className="text-left pb-1 pr-3">투자자</th>
            <th className="text-right pb-1">순매수량 (주)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ label, net }) => {
            const style: React.CSSProperties = { color: net >= 0 ? 'var(--clr-up)' : 'var(--clr-down)' };
            return (
              <tr key={label} className="border-t border-gray-700/50">
                <td className="py-1 pr-3 text-gray-300">{label}</td>
                <td className="py-1 text-right font-mono font-bold" style={style}>
                  {net >= 0 ? '+' : ''}{net.toLocaleString('ko-KR')}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function EarningsSection({ data }: { data: FundamentalsData }) {
  const latest = data.latestEarnings;
  const prev   = data.prevEarnings;
  const per    = data.per;

  if (!latest && per === null) return null;

  const revYoY  = latest && prev && prev.revenue !== 0
    ? ((latest.revenue - prev.revenue) / Math.abs(prev.revenue)) * 100 : null;
  const opYoY   = latest && prev && prev.operatingProfit !== 0
    ? ((latest.operatingProfit - prev.operatingProfit) / Math.abs(prev.operatingProfit)) * 100 : null;

  return (
    <div className="bg-gray-800 rounded-lg p-3 mb-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] font-semibold text-gray-400">
          📊 최근 실적
          {latest && <span className="ml-1 font-normal text-gray-500">({latest.period})</span>}
        </p>
        {per !== null && (
          <span className="text-[10px] font-mono text-gray-400">
            PER <span className="text-gray-200 font-bold">{per.toFixed(2)}배</span>
          </span>
        )}
      </div>

      {latest && (
        <div className="grid grid-cols-2 gap-2">
          {/* 매출액 */}
          <div className="bg-gray-700/40 rounded p-2">
            <p className="text-[10px] text-gray-500 mb-1">매출액</p>
            <p className="text-xs font-bold font-mono" style={{ color: 'var(--text-primary)' }}>
              {fmtOk(latest.revenue)}
            </p>
            {prev && revYoY !== null && (
              <p className="text-[10px] font-mono mt-0.5" style={yoyColor(revYoY)}>
                {yoySign(revYoY)}{revYoY.toFixed(1)}%
                <span className="text-gray-600 ml-1">vs {prev.period}</span>
              </p>
            )}
          </div>

          {/* 영업이익 */}
          <div className="bg-gray-700/40 rounded p-2">
            <p className="text-[10px] text-gray-500 mb-1">영업이익</p>
            <p className="text-xs font-bold font-mono" style={{ color: 'var(--text-primary)' }}>
              {fmtOk(latest.operatingProfit)}
            </p>
            {prev && opYoY !== null && (
              <p className="text-[10px] font-mono mt-0.5" style={yoyColor(opYoY)}>
                {yoySign(opYoY)}{opYoY.toFixed(1)}%
                <span className="text-gray-600 ml-1">vs {prev.period}</span>
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────

export default function KrStockAnalysisModal({
  stockName, stockCode, price, changeRate, onClose,
}: KrStockAnalysisModalProps) {
  const [analysis, setAnalysis]       = useState<KrStockAnalysisData | null>(null);
  const [analysisLoading, setALoading] = useState(true);
  const [analysisError, setAError]     = useState<string | null>(null);

  const [fundamentals, setFundamentals]   = useState<FundamentalsData | null>(null);
  const [fundLoading, setFLoading]         = useState(true);

  // 가격 즉시 표시 (LLM 분석과 독립)
  const [livePrice, setLivePrice]         = useState(price);
  const [liveChangeRate, setLiveChangeRate] = useState(changeRate);
  const [priceLoading, setPriceLoading]   = useState(price === 0);
  const [priceReady, setPriceReady]       = useState(price > 0);

  const displayPrice      = livePrice      || price;
  const displayChangeRate = liveChangeRate !== 0 ? liveChangeRate : changeRate;

  const isPositive = displayChangeRate >= 0;
  const changeStyle: React.CSSProperties = { color: isPositive ? 'var(--clr-up)' : 'var(--clr-down)' };
  const changeSign = isPositive ? '+' : '';

  // 가격 전용 실시간 fetch (검색 시 price=0인 경우)
  useEffect(() => {
    if (price > 0 || !stockCode) { setPriceReady(true); return; }
    setPriceLoading(true);
    fetch(`/us_stock_market/api/kr/stock-quote?code=${encodeURIComponent(stockCode)}`)
      .then(r => r.json() as Promise<{ price: number; changeRate: number; changeAmount: number }>)
      .then(d => {
        if (d.price > 0) { setLivePrice(d.price); setLiveChangeRate(d.changeRate); }
      })
      .catch(() => {})
      .finally(() => { setPriceLoading(false); setPriceReady(true); });
  }, [stockCode, price]);

  // 실시간 펀더멘털 fetch (투자자 동향 · PER · 실적)
  useEffect(() => {
    if (!stockCode) return;
    setFLoading(true);
    fetch(`/us_stock_market/api/kr/stock-fundamentals?code=${encodeURIComponent(stockCode)}`)
      .then(res => res.json() as Promise<FundamentalsData>)
      .then(setFundamentals)
      .catch(() => setFundamentals(null))
      .finally(() => setFLoading(false));
  }, [stockCode]);

  // LLM 분석 fetch — 가격이 준비된 후 실행
  useEffect(() => {
    if (!priceReady) return;

    const effectivePrice      = livePrice      || price;
    const effectiveChangeRate = liveChangeRate !== 0 ? liveChangeRate : changeRate;

    setALoading(true);
    setAError(null);
    fetch(
      `/api/kr/analysis/stock?name=${encodeURIComponent(stockName)}&code=${encodeURIComponent(stockCode)}&price=${encodeURIComponent(effectivePrice)}&changeRate=${encodeURIComponent(effectiveChangeRate)}`
    )
      .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json() as Promise<KrStockAnalysisData>; })
      .then(setAnalysis)
      .catch(err => setAError(err instanceof Error ? err.message : '분석 데이터를 불러오지 못했습니다.'))
      .finally(() => setALoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceReady]);

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`${stockName} 종목 분석`}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 sticky top-0 bg-gray-900 rounded-t-xl z-10">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold font-mono text-white">{stockCode}</span>
            <span className="text-sm font-bold text-gray-200">{stockName}</span>
            {priceLoading ? (
              <span className="animate-spin inline-block w-3 h-3 border-2 border-gray-600 border-t-gray-300 rounded-full" />
            ) : displayPrice > 0 ? (
              <span className="text-xs font-mono text-gray-300">₩{displayPrice.toLocaleString('ko-KR')}</span>
            ) : null}
            {displayPrice > 0 && (
              <span style={changeStyle} className="text-xs font-mono font-bold">
                {changeSign}{displayChangeRate.toFixed(2)}%
              </span>
            )}
            {analysis && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${OUTLOOK_STYLE[analysis.analysis.outlook]}`}>
                {OUTLOOK_LABEL[analysis.analysis.outlook]}
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-lg leading-none ml-3 shrink-0 transition-colors" aria-label="닫기">
            ×
          </button>
        </div>

        <div className="p-4">
          {/* ── 실시간 데이터 섹션 ── */}
          {fundLoading ? (
            <div className="bg-gray-800 rounded-lg p-3 mb-3 flex items-center gap-2 text-[11px] text-gray-500">
              <span className="animate-spin inline-block w-3 h-3 border-2 border-gray-600 border-t-gray-300 rounded-full" />
              투자자 동향 · 실적 불러오는 중...
            </div>
          ) : fundamentals && !fundamentals.error ? (
            <>
              <InvestorTrendSection data={fundamentals} />
              <EarningsSection data={fundamentals} />
            </>
          ) : null}

          {/* 🔴 리스크 — 최근 실적 바로 아래 */}
          {analysis && !analysisLoading && analysis.analysis.risks.length > 0 && (
            <div className="bg-gray-800 rounded-lg p-3 mb-3">
              <p className="text-[11px] font-semibold text-gray-400 mb-1.5">🔴 리스크</p>
              <ul className="space-y-2">
                {analysis.analysis.risks.map((item, i) => (
                  <li key={i} className="text-xs text-gray-200 flex gap-1.5">
                    <span className="text-red-500 shrink-0 mt-0.5">•</span>
                    <span className="leading-relaxed">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* ── LLM 분석 섹션 ── */}
          {analysisLoading && (
            <div className="flex items-center justify-center py-12 text-gray-400 text-sm">
              <span className="mr-2 animate-spin inline-block w-4 h-4 border-2 border-gray-600 border-t-gray-300 rounded-full" />
              AI 분석 중...
            </div>
          )}

          {analysisError && !analysisLoading && (
            <div className="py-8 text-center text-red-400 text-sm">{analysisError}</div>
          )}

          {analysis && !analysisLoading && (
            <>
              {/* 회사 개요 — 펀더멘털 API에서 가져온 실데이터 */}
              {fundamentals?.companySummary && (
                <div className="bg-gray-800 rounded-lg p-3 mb-3">
                  <p className="text-[11px] font-semibold text-gray-400 mb-1.5">🏢 회사 개요</p>
                  <ul className="space-y-1">
                    {fundamentals.companySummary.map((line, i) => (
                      <li key={i} className="text-xs text-gray-300 leading-relaxed flex gap-1.5">
                        <span className="text-gray-600 shrink-0 mt-0.5">•</span>
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="bg-gray-800 rounded-lg p-3 mb-3">
                <p className="text-[11px] font-semibold text-gray-400 mb-1">💬 회사 가이던스</p>
                <p className="text-xs text-gray-200 leading-relaxed">{analysis.analysis.companyGuidance}</p>
              </div>

              <div className="bg-gray-800 rounded-lg p-3 mb-3">
                <p className="text-[11px] font-semibold text-gray-400 mb-1">📈 단기 전망 (3개월)</p>
                <p className="text-xs text-gray-200 leading-relaxed">{analysis.analysis.shortTerm}</p>
              </div>

              <div className="bg-gray-800 rounded-lg p-3 mb-3">
                <p className="text-[11px] font-semibold text-gray-400 mb-1">🔭 장기 전망 (6개월)</p>
                <p className="text-xs text-gray-200 leading-relaxed">{analysis.analysis.longTerm}</p>
              </div>

              {analysis.analysis.targetPriceRange && (
                <div className="bg-gray-800 rounded-lg p-3 mb-3">
                  <p className="text-[11px] font-semibold text-gray-400 mb-1">🎯 목표 주가</p>
                  <KrPriceRangeBar
                    low={analysis.analysis.targetPriceRange.low}
                    consensus={analysis.analysis.targetPriceRange.consensus}
                    high={analysis.analysis.targetPriceRange.high}
                    current={analysis.price}
                  />
                </div>
              )}

              {/* 🟢 기회요인 — 단독 섹션, 전체 너비 */}
              {analysis.analysis.opportunities.length > 0 && (
                <div className="bg-gray-800 rounded-lg p-3 mb-3">
                  <p className="text-[11px] font-semibold text-gray-400 mb-1.5">🟢 기회요인</p>
                  <ul className="space-y-2">
                    {analysis.analysis.opportunities.map((item, i) => (
                      <li key={i} className="text-xs text-gray-200 flex gap-1.5">
                        <span className="text-green-500 shrink-0 mt-0.5">•</span>
                        <span className="leading-relaxed">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="bg-gray-800 rounded-lg p-3">
                <p className="text-[11px] font-semibold text-gray-400 mb-1">📚 참고 출처</p>
                <p className="text-[10px] text-gray-500 leading-relaxed">
                  {analysis.analysis.sources.join(', ')}
                </p>
                <p className="text-[10px] text-gray-600 mt-1.5">
                  🤖 AI 모델: <span className="font-mono">{analysis.model ?? 'openai/gpt-4o-mini'}{analysis.modelCutoff ? ` · 학습종료 ${analysis.modelCutoff}` : ''}</span>
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
