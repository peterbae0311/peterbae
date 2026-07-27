'use client';

import React from 'react';
import type { KrStock } from './KrSectorCard';

interface KrStockRowProps {
  stock: KrStock;
  rank: number;
  onStockClick: (stock: KrStock) => void;
}

const COLS = 'grid-cols-[5fr_10fr_30fr_20fr_15fr_20fr]';

export default function KrStockRow({ stock, rank, onStockClick }: KrStockRowProps) {
  const isPositive = stock.changeRate >= 0;
  const colorStyle: React.CSSProperties = { color: isPositive ? 'var(--clr-up)' : 'var(--clr-down)' };
  const sign = isPositive ? '+' : '';

  return (
    <div
      className={`grid ${COLS} items-center gap-x-1 px-2 py-[3px] border-b border-gray-800/40 hover:bg-gray-800/30 transition-colors cursor-pointer`}
      onClick={() => onStockClick(stock)}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onStockClick(stock); }}
      aria-label={`${stock.name} 분석 보기`}
    >
      <span className="text-[10px] text-gray-500 font-mono text-center">{rank}</span>
      <span className="text-[11px] font-mono font-semibold text-gray-300 truncate">{stock.code}</span>
      <span className="text-[11px] font-semibold text-gray-300 truncate">{stock.name}</span>
      <span className="text-[11px] font-mono font-medium text-gray-200 text-right tabular-nums">
        {stock.price.toLocaleString('ko-KR')}
      </span>
      <span style={colorStyle} className="text-[11px] font-mono font-bold text-right tabular-nums">
        {sign}{stock.changeRate.toFixed(2)}%
      </span>
      <span style={colorStyle} className="text-[11px] font-mono font-medium text-right tabular-nums">
        {sign}{Math.abs(stock.changeAmount).toLocaleString('ko-KR')}
      </span>
    </div>
  );
}
