'use client';

import React from 'react';
import { Stock } from '@/lib/types';

interface StockRowProps {
  stock: Stock;
  rank: number;
  exchangeRate: number;
  onStockClick?: (ticker: string, nameKr: string) => void;
}

export default function StockRow({ stock, rank, exchangeRate, onStockClick }: StockRowProps) {
  const isPositive = stock.changePercent >= 0;
  const colorStyle: React.CSSProperties = { color: isPositive ? 'var(--clr-up)' : 'var(--clr-down)' };
  const sign = isPositive ? '+' : '';
  const krw = Math.round(stock.closePrice * exchangeRate);

  return (
    <div
      className={`flex items-center px-2 py-[3px] border-b border-gray-800/40 hover:bg-gray-800/30 transition-colors${onStockClick ? ' cursor-pointer' : ''}`}
      onClick={() => onStockClick?.(stock.ticker, stock.nameKr)}
    >
      {/* No: 순번, 작고 흐리게 */}
      <span className="w-4 shrink-0 text-[10px] text-gray-500 font-mono text-center">{rank}</span>

      {/* 회사코드: 11px semibold — 스캔 시 즉시 인식 */}
      <span className="w-9 shrink-0 text-[11px] font-mono font-semibold text-gray-200 ml-1">{stock.ticker}</span>

      {/* 회사명: 11px regular */}
      <span className="flex-1 text-[11px] font-semibold text-gray-300 truncate ml-1">{stock.nameKr}</span>

      {/* 종가($): 11px mono, medium weight — 참조 데이터 */}
      <span className="w-14 shrink-0 text-[11px] font-mono font-medium text-gray-200 text-right">
        {stock.closePrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </span>

      {/* 종가(₩): 11px mono, regular — 보조 참조 */}
      <span className="w-16 shrink-0 text-[11px] font-mono font-bold text-gray-400 text-right ml-1">
        {krw.toLocaleString('ko-KR')}
      </span>

      {/* 등락율: 11px mono bold — 핵심 정보, 색상으로도 강조 */}
      <span style={colorStyle} className="w-12 shrink-0 text-[11px] font-mono font-bold text-right ml-1">
        {sign}{stock.changePercent.toFixed(2)}%
      </span>

      {/* 등락액: 11px mono medium — 색상 연동, 보조 */}
      <span style={colorStyle} className="w-12 shrink-0 text-[11px] font-mono font-medium text-right ml-1">
        {sign}{Math.abs(stock.changeDollar).toFixed(2)}
      </span>
    </div>
  );
}
