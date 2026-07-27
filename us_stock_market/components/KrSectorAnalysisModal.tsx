'use client';

import React, { useEffect, useState } from 'react';

interface KrSectorAnalysisData {
  sectorName: string;
  changeRate: number;
  analysis: {
    today: string;
    shortTerm: string;
    longTerm: string;
    opportunities: string[];
    risks: string[];
    outlook: 'bullish' | 'neutral' | 'bearish';
    sources: string[];
  };
}

interface KrSectorAnalysisModalProps {
  sectorName: string;
  changeRate: number;
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

export default function KrSectorAnalysisModal({
  sectorName,
  changeRate,
  onClose,
}: KrSectorAnalysisModalProps) {
  const [data, setData] = useState<KrSectorAnalysisData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(
      `/api/kr/analysis/sector?name=${encodeURIComponent(sectorName)}&changeRate=${encodeURIComponent(changeRate)}`
    )
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<KrSectorAnalysisData>;
      })
      .then(setData)
      .catch(err =>
        setError(err instanceof Error ? err.message : '분석 데이터를 불러오지 못했습니다.')
      )
      .finally(() => setLoading(false));
  }, [sectorName, changeRate]);

  const isPositive = changeRate >= 0;
  const changeStyle: React.CSSProperties = { color: isPositive ? 'var(--clr-up)' : 'var(--clr-down)' };
  const changeSign = isPositive ? '+' : '';

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`${sectorName} 업종 분석`}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* 모달 헤더 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 sticky top-0 bg-gray-900 rounded-t-xl">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-white">{sectorName}</span>
            <span style={changeStyle} className="text-xs font-mono font-bold">
              {changeSign}{changeRate.toFixed(2)}%
            </span>
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
              <div className="bg-gray-800 rounded-lg p-3 mb-3">
                <p className="text-[11px] font-semibold text-gray-400 mb-1">📅 당일 요약</p>
                <p className="text-xs text-gray-200 leading-relaxed">{data.analysis.today}</p>
              </div>

              <div className="bg-gray-800 rounded-lg p-3 mb-3">
                <p className="text-[11px] font-semibold text-gray-400 mb-1">📈 단기 전망 (3개월)</p>
                <p className="text-xs text-gray-200 leading-relaxed">{data.analysis.shortTerm}</p>
              </div>

              <div className="bg-gray-800 rounded-lg p-3 mb-3">
                <p className="text-[11px] font-semibold text-gray-400 mb-1">🔭 장기 전망 (6개월)</p>
                <p className="text-xs text-gray-200 leading-relaxed">{data.analysis.longTerm}</p>
              </div>

              <div className="bg-gray-800 rounded-lg p-3 mb-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[11px] font-semibold text-gray-400 mb-1.5">🟢 기회요인</p>
                    <ul className="space-y-1">
                      {data.analysis.opportunities.map((item, i) => (
                        <li key={i} className="text-xs text-gray-200 flex gap-1.5">
                          <span className="text-green-500 shrink-0 mt-0.5">•</span>
                          <span className="leading-relaxed">{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold text-gray-400 mb-1.5">🔴 리스크</p>
                    <ul className="space-y-1">
                      {data.analysis.risks.map((item, i) => (
                        <li key={i} className="text-xs text-gray-200 flex gap-1.5">
                          <span className="text-red-500 shrink-0 mt-0.5">•</span>
                          <span className="leading-relaxed">{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>

              <div className="bg-gray-800 rounded-lg p-3">
                <p className="text-[11px] font-semibold text-gray-400 mb-1">📚 참고 출처</p>
                <p className="text-[10px] text-gray-500 leading-relaxed">
                  {data.analysis.sources.join(', ')}
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
