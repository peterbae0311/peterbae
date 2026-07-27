'use client';

import React from 'react';
import { Sector } from '@/lib/types';
import StockRow from './StockRow';

interface SectorCardProps {
  sector: Sector;
  rank: number;
  exchangeRate: number;
  onSectorClick?: (sectorName: string, sectorNameKr: string) => void;
  onStockClick?: (ticker: string, nameKr: string) => void;
}

export default function SectorCard({ sector, rank, exchangeRate, onSectorClick, onStockClick }: SectorCardProps) {
  const isPositive = sector.changePercent >= 0;
  const colorStyle: React.CSSProperties = { color: isPositive ? 'var(--clr-up)' : 'var(--clr-down)' };
  const borderStyle: React.CSSProperties = { borderColor: isPositive ? 'var(--clr-up-border)' : 'var(--clr-down-border)' };
  const sign = isPositive ? '+' : '';

  return (
    <article className="border-b border-gray-800">
      {/* 섹터 헤더: text-[13px]/font-bold — 최상위 계층 */}
      <div
        className={`flex items-center justify-between px-2 py-1.5 border-l-2${onSectorClick ? ' cursor-pointer hover:bg-gray-700/50 transition-colors' : ''}`}
        style={{ ...borderStyle, backgroundColor: 'var(--bg-header)' }}
        onClick={() => onSectorClick?.(sector.nameEn, sector.nameKr)}
      >
        <div className="flex items-center gap-1 min-w-0">
          <span className="text-[10px] text-gray-400 font-mono w-4 shrink-0">{rank}.</span>
          <span className="text-[13px] font-bold text-white truncate leading-snug">{sector.nameKr}</span>
          <span className="text-[10px] text-gray-500 truncate hidden xl:inline">({sector.nameEn})</span>
        </div>
        <div className="flex items-center shrink-0 ml-1">
          <span style={colorStyle} className="text-[13px] font-mono font-bold leading-snug">
            {sign}{sector.changePercent.toFixed(2)}%
          </span>
          {onSectorClick && (
            <span className="text-[10px] text-gray-500 ml-1 hover:text-gray-300">🔍</span>
          )}
        </div>
      </div>

      {/* 컬럼 헤더: text-[10px]/font-medium — 중간 계층 (레이블) */}
      <div className="flex items-center px-2 py-0.5 bg-gray-900/80 border-b border-gray-700">
        <span className="w-4 shrink-0 text-[10px] font-medium text-gray-400 text-center">No</span>
        <span className="w-9 shrink-0 text-[10px] font-medium text-gray-400 ml-1">코드</span>
        <span className="flex-1 text-[10px] font-medium text-gray-400 ml-1">회사명</span>
        <span className="w-14 shrink-0 text-[10px] font-medium text-gray-400 text-right">종가($)</span>
        <span className="w-16 shrink-0 text-[10px] font-medium text-gray-400 text-right ml-1">종가(₩)</span>
        <span className="w-12 shrink-0 text-[10px] font-medium text-gray-400 text-right ml-1">등락율</span>
        <span className="w-12 shrink-0 text-[10px] font-medium text-gray-400 text-right ml-1">등락액($)</span>
      </div>

      {/* 종목 행 — 등락율 상위 5개 */}
      <div>
        {[...sector.stocks]
          .sort((a, b) => b.changePercent - a.changePercent)
          .slice(0, 10)
          .map((stock, idx) => (
            <StockRow key={stock.ticker} stock={stock} rank={idx + 1} exchangeRate={exchangeRate} onStockClick={onStockClick} />
          ))}
      </div>
    </article>
  );
}
