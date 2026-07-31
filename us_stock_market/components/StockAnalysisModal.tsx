'use client';

import React, { useEffect, useState } from 'react';

interface StockAnalysisData {
  ticker: string;
  companyName: string;
  date: string;
  closePrice: number;
  changePct: number;
  model?: string;
  modelCutoff?: string;
  marketData: {
    targetPrice: number | null;
    pe: number | null;
    forwardEps: number | null;
    recommendation: string | null;
  };
  analysis: {
    companyOverview?: string;
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

interface StockAnalysisModalProps {
  ticker: string;
  nameKr: string;
  date: string;
  exchangeRate?: number;
  onClose: () => void;
}

const OUTLOOK_STYLE: Record<'bullish' | 'neutral' | 'bearish', string> = {
  bullish: 'bg-red-900/40 text-red-300 border border-red-700',
  neutral: 'bg-gray-700/60 text-gray-300 border border-gray-600',
  bearish: 'bg-blue-900/40 text-blue-300 border border-blue-700',
};

const OUTLOOK_LABEL: Record<'bullish' | 'neutral' | 'bearish', string> = {
  bullish: '강세',
  neutral: '중립',
  bearish: '약세',
};

function PriceRangeBar({
  low,
  consensus,
  high,
  current,
}: {
  low: number;
  consensus: number;
  high: number;
  current: number;
}) {
  const safeLow = Math.min(low, high);
  const safeHigh = Math.max(low, high);
  const min = Math.min(safeLow, current) * 0.98;
  const max = Math.max(safeHigh, current) * 1.02;
  const range = max - min;

  const pct = (val: number) => `${(((val - min) / range) * 100).toFixed(1)}%`;
  const barWidth = `${Math.max(0, (((safeHigh - safeLow) / range) * 100)).toFixed(1)}%`;

  return (
    <div className="mt-2">
      <div className="relative h-2 bg-gray-700 rounded-full">
        <div
          className="absolute top-0 h-2 bg-blue-600/40 rounded-full"
          style={{ left: pct(safeLow), width: barWidth }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-0.5 h-3 bg-gray-300 rounded"
          style={{ left: pct(consensus) }}
          title={`컨센서스 $${consensus.toFixed(2)}`}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-2 h-2 bg-yellow-400 rounded-full border border-yellow-300"
          style={{ left: pct(current), transform: 'translate(-50%, -50%)' }}
          title={`현재가 $${current.toFixed(2)}`}
        />
      </div>
      <div className="flex justify-between mt-1 text-[10px] text-gray-500 font-mono">
        <span>Low ${safeLow.toFixed(2)}</span>
        <span className="text-gray-400">Consensus ${consensus.toFixed(2)}</span>
        <span>High ${safeHigh.toFixed(2)}</span>
      </div>
    </div>
  );
}

export default function StockAnalysisModal({
  ticker,
  nameKr,
  date,
  exchangeRate = 1380,
  onClose,
}: StockAnalysisModalProps) {
  const [data, setData] = useState<StockAnalysisData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 가격 즉시 표시 (LLM 분석과 독립)
  const [livePrice, setLivePrice] = useState(0);
  const [liveChangePct, setLiveChangePct] = useState(0);
  const [priceLoading, setPriceLoading] = useState(true);

  useEffect(() => {
    setPriceLoading(true);
    fetch(`/us_stock_market/api/us/stock-quote?ticker=${encodeURIComponent(ticker)}`)
      .then(r => r.json() as Promise<{ price: number; changePct: number }>)
      .then(d => { setLivePrice(d.price ?? 0); setLiveChangePct(d.changePct ?? 0); })
      .catch(() => {})
      .finally(() => setPriceLoading(false));
  }, [ticker]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/us_stock_market/api/analysis/stock?ticker=${encodeURIComponent(ticker)}&date=${encodeURIComponent(date)}`)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<StockAnalysisData>;
      })
      .then(setData)
      .catch(err => setError(err instanceof Error ? err.message : '분석 데이터를 불러오지 못했습니다.'))
      .finally(() => setLoading(false));
  }, [ticker, date]);

  // 가격 표시: 즉시 fetch 우선, LLM 분석 응답으로 보정
  const displayPrice   = data?.closePrice  || livePrice;
  const displayChangePct = data != null ? data.changePct : liveChangePct;

  const isPositive = displayChangePct >= 0;
  const changeStyle: React.CSSProperties = {
    color: isPositive ? 'var(--clr-up)' : 'var(--clr-down)',
  };
  const changeSign = isPositive ? '+' : '';

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 sticky top-0 bg-gray-900 rounded-t-xl">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold font-mono text-white">{ticker}</span>
            <span className="text-sm font-bold text-gray-200">{nameKr}</span>
            {priceLoading ? (
              <span className="animate-spin inline-block w-3 h-3 border-2 border-gray-600 border-t-gray-300 rounded-full" />
            ) : displayPrice > 0 ? (
              <>
                <span className="text-xs font-mono text-gray-300">
                  ${displayPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="text-xs font-mono text-gray-500">
                  (₩{Math.round(displayPrice * exchangeRate).toLocaleString('ko-KR')})
                </span>
                <span style={changeStyle} className="text-xs font-mono font-bold">
                  {changeSign}{displayChangePct.toFixed(2)}%
                </span>
              </>
            ) : null}
            {data && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${OUTLOOK_STYLE[data.analysis.outlook]}`}>
                {OUTLOOK_LABEL[data.analysis.outlook]}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-lg leading-none ml-3 shrink-0 transition-colors"
            aria-label="닫기"
          >
            ×
          </button>
        </div>

        <div className="p-4">
          {loading && (
            <div className="flex items-center justify-center py-12 text-gray-400 text-sm">
              <span className="mr-2 animate-spin inline-block w-4 h-4 border-2 border-gray-600 border-t-gray-300 rounded-full" />
              분석 중...
            </div>
          )}

          {error && !loading && (
            <div className="py-8 text-center text-red-400 text-sm">{error}</div>
          )}

          {data && !loading && (
            <>
              {(data.marketData.targetPrice !== null ||
                data.marketData.pe !== null ||
                data.marketData.forwardEps !== null ||
                data.marketData.recommendation !== null) && (
                <div className="bg-gray-800 rounded-lg p-3 mb-3">
                  <p className="text-[11px] font-semibold text-gray-400 mb-2">📊 시장 데이터</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                    {data.marketData.targetPrice !== null && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-gray-500">목표주가</span>
                        <span className="text-xs font-mono text-gray-200">
                          ${data.marketData.targetPrice.toFixed(2)}
                        </span>
                      </div>
                    )}
                    {data.marketData.pe !== null && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-gray-500">P/E</span>
                        <span className="text-xs font-mono text-gray-200">
                          {data.marketData.pe.toFixed(1)}
                        </span>
                      </div>
                    )}
                    {data.marketData.forwardEps !== null && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-gray-500">Forward EPS</span>
                        <span className="text-xs font-mono text-gray-200">
                          ${data.marketData.forwardEps.toFixed(2)}
                        </span>
                      </div>
                    )}
                    {data.marketData.recommendation !== null && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-gray-500">추천</span>
                        <span className="text-xs text-gray-200">{data.marketData.recommendation}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {data.analysis.companyOverview && (
                <div className="bg-gray-800 rounded-lg p-3 mb-3">
                  <p className="text-[11px] font-semibold text-gray-400 mb-1">🏢 회사 개요</p>
                  <p className="text-xs text-gray-200 leading-relaxed">{data.analysis.companyOverview}</p>
                </div>
              )}

              <div className="bg-gray-800 rounded-lg p-3 mb-3">
                <p className="text-[11px] font-semibold text-gray-400 mb-1">💬 회사 가이던스</p>
                <p className="text-xs text-gray-200 leading-relaxed">{data.analysis.companyGuidance}</p>
              </div>

              <div className="bg-gray-800 rounded-lg p-3 mb-3">
                <p className="text-[11px] font-semibold text-gray-400 mb-1">📈 단기 전망 (3개월)</p>
                <p className="text-xs text-gray-200 leading-relaxed">{data.analysis.shortTerm}</p>
              </div>

              <div className="bg-gray-800 rounded-lg p-3 mb-3">
                <p className="text-[11px] font-semibold text-gray-400 mb-1">🔭 장기 전망 (6개월)</p>
                <p className="text-xs text-gray-200 leading-relaxed">{data.analysis.longTerm}</p>
              </div>

              {data.analysis.targetPriceRange && (
                <div className="bg-gray-800 rounded-lg p-3 mb-3">
                  <p className="text-[11px] font-semibold text-gray-400 mb-1">🎯 목표 주가</p>
                  <PriceRangeBar
                    low={data.analysis.targetPriceRange.low}
                    consensus={data.analysis.targetPriceRange.consensus}
                    high={data.analysis.targetPriceRange.high}
                    current={data.closePrice}
                  />
                </div>
              )}

              {/* 🔴 리스크 — 목표 주가 바로 아래, 전체 너비 */}
              {data.analysis.risks.length > 0 && (
                <div className="bg-gray-800 rounded-lg p-3 mb-3">
                  <p className="text-[11px] font-semibold text-gray-400 mb-1.5">🔴 리스크</p>
                  <ul className="space-y-2">
                    {data.analysis.risks.map((item, i) => (
                      <li key={i} className="text-xs text-gray-200 flex gap-1.5">
                        <span className="text-red-500 shrink-0 mt-0.5">•</span>
                        <span className="leading-relaxed">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 🟢 기회요인 — 리스크 바로 아래, 전체 너비 */}
              {data.analysis.opportunities.length > 0 && (
                <div className="bg-gray-800 rounded-lg p-3 mb-3">
                  <p className="text-[11px] font-semibold text-gray-400 mb-1.5">🟢 기회요인</p>
                  <ul className="space-y-2">
                    {data.analysis.opportunities.map((item, i) => (
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
                <p className="text-[10px] text-gray-500 leading-relaxed">{data.analysis.sources.join(', ')}</p>
                <p className="text-[10px] text-gray-600 mt-1.5">
                  🤖 AI 모델: <span className="font-mono">{data.model ?? 'openai/gpt-4o-mini'}{data.modelCutoff ? ` · 학습종료 ${data.modelCutoff}` : ''}</span>
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
