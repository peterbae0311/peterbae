'use client';

import React, { useEffect, useState } from 'react';

interface EtfMomentum {
  etf: string;
  name: string;
  momentum1W: number;
  momentum1M: number;
  score: number;
}

interface SectorMomentum {
  sector: string;
  momentum1W: number;
  momentum1M: number;
  score: number;
}

interface LlmAnalysis {
  usRotationSignal: string;
  krRotationSignal: string;
  usAnalysis: string;
  krAnalysis: string;
  usActionableInsight: string;
  krActionableInsight: string;
  confidence: 'high' | 'medium' | 'low';
}

interface RotationData {
  us: { topGainers: EtfMomentum[]; topLosers: EtfMomentum[] };
  kr: { topGainers: SectorMomentum[]; topLosers: SectorMomentum[] };
  analysis: LlmAnalysis;
  model: string;
  modelCutoff: string;
  fetchedAt: string;
}

interface SectorRotationModalProps {
  onClose: () => void;
}

const CONFIDENCE_STYLE: Record<'high' | 'medium' | 'low', string> = {
  high:   'bg-green-900/40 text-green-300 border border-green-700',
  medium: 'bg-yellow-900/40 text-yellow-300 border border-yellow-700',
  low:    'bg-gray-700/60 text-gray-300 border border-gray-600',
};

const CONFIDENCE_LABEL: Record<'high' | 'medium' | 'low', string> = {
  high:   '신뢰도 높음',
  medium: '신뢰도 중간',
  low:    '신뢰도 낮음',
};

function fmt(n: number): string {
  return (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
}

function scoreColor(n: number): React.CSSProperties {
  return { color: n > 0 ? 'var(--clr-up)' : n < 0 ? 'var(--clr-down)' : 'var(--text-muted)' };
}

function Arrow({ score }: { score: number }) {
  if (score > 1)  return <span style={{ color: 'var(--clr-up)',   fontSize: 10 }}>▲</span>;
  if (score < -1) return <span style={{ color: 'var(--clr-down)', fontSize: 10 }}>▼</span>;
  return <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>–</span>;
}

function Cell({
  children,
  borderRight,
  borderBottom,
  padded,
  bg,
}: {
  children: React.ReactNode;
  borderRight?: boolean;
  borderBottom?: boolean;
  padded?: boolean;
  bg?: boolean;
}) {
  return (
    <div
      style={{
        borderRight:  borderRight  ? '1px solid var(--border-strong)' : undefined,
        borderBottom: borderBottom ? '1px solid var(--border-strong)' : undefined,
        backgroundColor: bg ? 'var(--bg-card)' : undefined,
        padding: padded ? '12px 16px' : undefined,
      }}
    >
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>
      {children}
    </p>
  );
}

function TextBlock({ text }: { text: string }) {
  return <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{text}</p>;
}

function Divider() {
  return <div className="my-3" style={{ borderTop: '1px solid var(--border-soft)' }} />;
}

function EtfTable({ title, rows }: { title: string; rows: EtfMomentum[] }) {
  return (
    <div>
      <p className="text-[10px] font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>{title}</p>
      <div className="text-[9px] font-mono grid text-gray-500 pb-0.5"
        style={{ gridTemplateColumns: '2.8rem 1fr 3rem 3rem 3rem 0.8rem' }}>
        <span>티커</span>
        <span>섹터/테마</span>
        <span className="text-right">1주</span>
        <span className="text-right">1개월</span>
        <span className="text-right">스코어</span>
        <span />
      </div>
      {rows.map(r => (
        <div key={r.etf}
          className="grid items-center py-0.5 border-b border-gray-800/30 hover:bg-gray-800/20"
          style={{ gridTemplateColumns: '2.8rem 1fr 3rem 3rem 3rem 0.8rem' }}
        >
          <span className="text-[10px] font-mono font-bold" style={{ color: 'var(--text-secondary)' }}>{r.etf}</span>
          <span className="text-[10px] truncate pr-1" style={{ color: 'var(--text-muted)' }}>{r.name}</span>
          <span className="text-[10px] font-mono text-right" style={scoreColor(r.momentum1W)}>{fmt(r.momentum1W)}</span>
          <span className="text-[10px] font-mono text-right" style={scoreColor(r.momentum1M)}>{fmt(r.momentum1M)}</span>
          <span className="text-[10px] font-mono font-bold text-right" style={scoreColor(r.score)}>{fmt(r.score)}</span>
          <span className="text-right"><Arrow score={r.score} /></span>
        </div>
      ))}
    </div>
  );
}

function KrTable({ title, rows }: { title: string; rows: SectorMomentum[] }) {
  return (
    <div>
      <p className="text-[10px] font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>{title}</p>
      <div className="text-[9px] font-mono grid text-gray-500 pb-0.5"
        style={{ gridTemplateColumns: '1fr 3rem 3rem 3rem 0.8rem' }}>
        <span>업종</span>
        <span className="text-right">1주</span>
        <span className="text-right">1개월</span>
        <span className="text-right">스코어</span>
        <span />
      </div>
      {rows.map(r => (
        <div key={r.sector}
          className="grid items-center py-0.5 border-b border-gray-800/30 hover:bg-gray-800/20"
          style={{ gridTemplateColumns: '1fr 3rem 3rem 3rem 0.8rem' }}
        >
          <span className="text-[10px] truncate pr-1" style={{ color: 'var(--text-secondary)' }}>{r.sector}</span>
          <span className="text-[10px] font-mono text-right" style={scoreColor(r.momentum1W)}>{fmt(r.momentum1W)}</span>
          <span className="text-[10px] font-mono text-right" style={scoreColor(r.momentum1M)}>{fmt(r.momentum1M)}</span>
          <span className="text-[10px] font-mono font-bold text-right" style={scoreColor(r.score)}>{fmt(r.score)}</span>
          <span className="text-right"><Arrow score={r.score} /></span>
        </div>
      ))}
    </div>
  );
}

export default function SectorRotationModal({ onClose }: SectorRotationModalProps) {
  const [data, setData] = useState<RotationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch('/us_stock_market/api/sector-rotation')
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<{ success: boolean; data?: RotationData; error?: string }>;
      })
      .then(json => {
        if (!json.success || !json.data) throw new Error(json.error ?? '데이터를 불러오지 못했습니다.');
        setData(json.data);
      })
      .catch(err => setError(err instanceof Error ? err.message : '데이터를 불러오지 못했습니다.'))
      .finally(() => setLoading(false));
  }, []);

  const fetchedLabel = data
    ? new Date(data.fetchedAt).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="섹터 로테이션 분석"
    >
      <div
        className="rounded-xl w-full max-w-6xl max-h-[92vh] overflow-hidden flex flex-col"
        style={{ backgroundColor: 'var(--bg-modal)', border: '1px solid var(--border-strong)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── 헤더 ── */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b shrink-0"
          style={{ borderColor: 'var(--border-strong)' }}
        >
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>섹터 로테이션 분석</span>
            {data?.analysis && (
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${CONFIDENCE_STYLE[data.analysis.confidence]}`}>
                {CONFIDENCE_LABEL[data.analysis.confidence]}
              </span>
            )}
            {data?.model && (
              <span className="text-[10px] px-1.5 py-0.5 rounded font-mono"
                style={{ color: 'var(--text-muted)', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-soft)' }}>
                {data.model}
                {data.modelCutoff && (
                  <span className="ml-1.5" style={{ color: 'var(--text-muted)', opacity: 0.7 }}>
                    · 학습종료 {data.modelCutoff}
                  </span>
                )}
              </span>
            )}
            {fetchedLabel && (
              <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>기준 {fetchedLabel}</span>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-lg leading-none ml-3 shrink-0 transition-colors hover:opacity-70"
            style={{ color: 'var(--text-muted)' }}
            aria-label="닫기"
          >
            ×
          </button>
        </div>

        {/* ── 본문 ── */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-24 text-sm" style={{ color: 'var(--text-muted)' }}>
              <span className="mr-2 animate-spin inline-block w-4 h-4 border-2 border-gray-600 border-t-gray-300 rounded-full" />
              데이터 수집 및 분석 중... (30초 내외 소요)
            </div>
          )}

          {error && !loading && (
            <div className="py-12 text-center text-red-400 text-sm">{error}</div>
          )}

          {data && !loading && (
            // 단일 grid → 같은 행의 좌우 셀 높이가 자동으로 동기화됨
            <div
              className="grid"
              style={{
                gridTemplateColumns: '1fr 1fr',
                gridTemplateRows: 'auto auto auto auto auto',
                borderTop: '1px solid var(--border-strong)',
              }}
            >
              {/* ── Row 0: 컬럼 타이틀 ── */}
              <Cell borderRight borderBottom padded>
                <span className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>🇺🇸 미국증시</span>
              </Cell>
              <Cell borderBottom padded>
                <span className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>🇰🇷 한국증시</span>
              </Cell>

              {/* ── Row 1: 로테이션 신호 ── */}
              <Cell borderRight borderBottom padded bg>
                <SectionTitle>로테이션 신호</SectionTitle>
                <p className="text-xs font-semibold leading-relaxed" style={{ color: 'var(--text-primary)' }}>
                  {data.analysis.usRotationSignal}
                </p>
              </Cell>
              <Cell borderBottom padded bg>
                <SectionTitle>로테이션 신호</SectionTitle>
                <p className="text-xs font-semibold leading-relaxed" style={{ color: 'var(--text-primary)' }}>
                  {data.analysis.krRotationSignal}
                </p>
              </Cell>

              {/* ── Row 2: 시장 분석 ── */}
              <Cell borderRight borderBottom padded>
                <SectionTitle>미국 시장</SectionTitle>
                <TextBlock text={data.analysis.usAnalysis} />
              </Cell>
              <Cell borderBottom padded>
                <SectionTitle>한국 시장</SectionTitle>
                <TextBlock text={data.analysis.krAnalysis} />
              </Cell>

              {/* ── Row 3: 투자 시사점 ── */}
              <Cell borderRight borderBottom padded bg>
                <SectionTitle>투자 시사점</SectionTitle>
                <TextBlock text={data.analysis.usActionableInsight} />
              </Cell>
              <Cell borderBottom padded bg>
                <SectionTitle>투자 시사점</SectionTitle>
                <TextBlock text={data.analysis.krActionableInsight} />
              </Cell>

              {/* ── Row 4: 모멘텀 테이블 ── */}
              <Cell borderRight padded>
                <div className="flex items-baseline gap-2 mb-2">
                  <SectionTitle>미국 섹터/테마 ETF 모멘텀</SectionTitle>
                  <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>Score = 1주 − 1개월/4</span>
                </div>
                <EtfTable title="▲ 상승 모멘텀 상위 (매수세 유입)" rows={data.us.topGainers} />
                <Divider />
                <EtfTable title="▼ 하락 모멘텀 상위 (매수세 이탈)" rows={data.us.topLosers} />
              </Cell>
              <Cell padded>
                <div className="flex items-baseline gap-2 mb-2">
                  <SectionTitle>한국 업종 모멘텀</SectionTitle>
                  <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>Score = 1주 − 1개월/4</span>
                </div>
                {data.kr.topGainers.length === 0 && data.kr.topLosers.length === 0 ? (
                  <p className="text-xs py-2" style={{ color: 'var(--text-muted)' }}>한국 업종 데이터 없음 (DB 미수집)</p>
                ) : (
                  <>
                    <KrTable title="▲ 상승 모멘텀 상위 (매수세 유입)" rows={data.kr.topGainers} />
                    <Divider />
                    <KrTable title="▼ 하락 모멘텀 상위 (매수세 이탈)" rows={data.kr.topLosers} />
                  </>
                )}
              </Cell>

            </div>
          )}
        </div>
      </div>
    </div>
  );
}
