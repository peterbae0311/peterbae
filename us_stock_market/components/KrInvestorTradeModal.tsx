'use client';

import React, { useEffect, useState } from 'react';

interface TradeStock {
  rank: number;
  code: string;
  name: string;
  price: number;
  changeRate: number;
  changeAmount: number;
  netVolume: number;
  netAmount: number;
  tradingVolume: number;
}

interface InvestorTradeResponse {
  buyTop: TradeStock[];
  sellTop: TradeStock[];
  fetchedAt: string;
  error?: string;
}

interface KrInvestorTradeModalProps {
  type: 'foreign' | 'institutional';
  onClose: () => void;
  onStockClick?: (stock: TradeStock) => void;
}

function StockRow({ stock, onStockClick }: { stock: TradeStock; onStockClick?: (stock: TradeStock) => void }) {
  const isPos = stock.changeRate >= 0;
  const priceColor: React.CSSProperties = { color: isPos ? 'var(--clr-up)' : 'var(--clr-down)' };
  const sign = isPos ? '+' : '';

  const fmtAmount = (n: number) =>
    Math.abs(n) >= 100
      ? `${Math.round(n / 100).toLocaleString('ko-KR')}억`
      : `${n.toLocaleString('ko-KR')}백만`;

  return (
    <div
      className="flex items-center px-1 py-0.5 border-b border-gray-800/40 hover:bg-gray-800/30 transition-colors"
      style={onStockClick ? { cursor: 'pointer' } : undefined}
      onClick={onStockClick ? () => onStockClick(stock) : undefined}
    >
      <span className="w-5 shrink-0 text-[10px] font-mono text-center" style={{ color: 'var(--text-muted)' }}>
        {stock.rank}
      </span>
      <span className="w-11 shrink-0 text-[10px] font-mono ml-1" style={{ color: 'var(--text-muted)' }}>
        {stock.code}
      </span>
      <span className="flex-1 text-[10px] truncate ml-1" style={{ color: 'var(--text-secondary)' }}>
        {stock.name}
      </span>
      {/* 종가 */}
      <span className="w-14 shrink-0 text-[10px] font-mono text-right" style={{ color: 'var(--text-primary)' }}>
        {stock.price > 0 ? stock.price.toLocaleString('ko-KR') : '-'}
      </span>
      {/* 등락율 */}
      <span className="w-13 shrink-0 text-[10px] font-mono font-bold text-right ml-1" style={stock.price > 0 ? priceColor : { color: 'var(--text-muted)' }}>
        {stock.price > 0 ? `${sign}${stock.changeRate.toFixed(2)}%` : '-'}
      </span>
      {/* 등락액 */}
      <span className="w-14 shrink-0 text-[10px] font-mono text-right ml-1" style={stock.price > 0 ? priceColor : { color: 'var(--text-muted)' }}>
        {stock.price > 0 ? `${sign}${Math.abs(stock.changeAmount).toLocaleString('ko-KR')}` : '-'}
      </span>
      {/* 순매수량(주) */}
      <span className="w-16 shrink-0 text-[10px] font-mono text-right ml-1" style={{ color: 'var(--text-primary)' }}>
        {stock.netVolume.toLocaleString('ko-KR')}
      </span>
      {/* 순매수금액 */}
      <span className="w-14 shrink-0 text-[10px] font-mono text-right ml-1" style={{ color: 'var(--text-primary)' }}>
        {fmtAmount(stock.netAmount)}
      </span>
      {/* 거래량 */}
      <span className="w-14 shrink-0 text-[10px] font-mono text-right ml-1" style={{ color: 'var(--text-muted)' }}>
        {stock.tradingVolume.toLocaleString('ko-KR')}
      </span>
    </div>
  );
}

function Panel({ title, stocks, onStockClick }: { title: string; stocks: TradeStock[]; onStockClick?: (stock: TradeStock) => void }) {
  return (
    <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
      <div
        className="px-2 py-1 text-xs font-bold shrink-0"
        style={{ backgroundColor: 'var(--bg-header)', color: 'var(--text-primary)' }}
      >
        {title}
      </div>

      {/* 컬럼 헤더 */}
      <div
        className="flex px-1 py-0.5 text-[10px] shrink-0"
        style={{ backgroundColor: 'var(--bg-card)', color: 'var(--text-muted)' }}
      >
        <span className="w-5 text-center">No</span>
        <span className="w-11 ml-1">코드</span>
        <span className="flex-1 ml-1">회사명</span>
        <span className="w-14 text-right">종가</span>
        <span className="w-13 text-right ml-1">등락율</span>
        <span className="w-14 text-right ml-1">등락액</span>
        <span className="w-16 text-right ml-1">순매수량</span>
        <span className="w-14 text-right ml-1">순매수금액</span>
        <span className="w-14 text-right ml-1">거래량</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {stocks.map(stock => (
          <StockRow key={`${stock.code}-${stock.rank}`} stock={stock} onStockClick={onStockClick} />
        ))}
      </div>
    </div>
  );
}

export default function KrInvestorTradeModal({ type, onClose, onStockClick }: KrInvestorTradeModalProps) {
  const [data, setData] = useState<InvestorTradeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const label = type === 'foreign' ? '외국인' : '기관';
  const endpoint = type === 'foreign' ? '/api/kr/foreign-trade' : '/api/kr/institutional-trade';

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(endpoint)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<InvestorTradeResponse>;
      })
      .then(json => {
        if (json.error) setError(json.error);
        setData(json);
      })
      .catch(err =>
        setError(err instanceof Error ? err.message : '데이터를 불러오지 못했습니다.')
      )
      .finally(() => setLoading(false));
  }, [endpoint]);

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`${label} 순매수/순매도 상위 30위`}
    >
      <div
        className="rounded-xl w-full max-w-6xl max-h-[85vh] overflow-hidden flex flex-col"
        style={{
          backgroundColor: 'var(--bg-modal)',
          border: '1px solid var(--border-strong)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* 모달 헤더 */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b shrink-0"
          style={{ borderColor: 'var(--border-strong)', backgroundColor: 'var(--bg-modal)' }}
        >
          <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
            {label} 순매수/순매도 상위 30위 (KOSPI)
          </span>
          <button
            onClick={onClose}
            className="text-lg leading-none ml-3 shrink-0 transition-colors hover:opacity-70"
            style={{ color: 'var(--text-muted)' }}
            aria-label="닫기"
          >
            ×
          </button>
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {loading && (
            <div className="flex items-center justify-center py-16 text-sm" style={{ color: 'var(--text-muted)' }}>
              <span className="mr-2 animate-spin inline-block w-4 h-4 border-2 border-gray-600 border-t-gray-300 rounded-full" />
              불러오는 중...
            </div>
          )}

          {error && !loading && (
            <div className="py-12 text-center text-sm text-red-400">{error}</div>
          )}

          {!loading && !error && data && (
            <div className="flex-1 flex overflow-hidden divide-x" style={{ borderColor: 'var(--border-strong)' }}>
              <Panel title={`${label} 순매수 상위`} stocks={data.buyTop} onStockClick={onStockClick} />
              <Panel title={`${label} 순매도 상위`} stocks={data.sellTop} onStockClick={onStockClick} />
            </div>
          )}
        </div>

        {/* 푸터 */}
        {data && !loading && (
          <div
            className="px-4 py-1.5 text-[10px] border-t shrink-0"
            style={{
              borderColor: 'var(--border-strong)',
              color: 'var(--text-muted)',
              backgroundColor: 'var(--bg-modal)',
            }}
          >
            기준시각:{' '}
            {new Date(data.fetchedAt).toLocaleString('ko-KR', {
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            })}
            {' '}· ETF·레버리지·인버스·선물·스팩 제외
          </div>
        )}
      </div>
    </div>
  );
}
