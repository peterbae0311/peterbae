'use client';

import React from 'react';
import KrStockRow from './KrStockRow';

export interface KrStock {
  code: string;
  name: string;
  price: number;
  changeRate: number;
  changeAmount: number;
}

export interface KrSector {
  no: string;
  name: string;
  changeRate: number;
  stocks: KrStock[];
}

interface KrSectorCardProps {
  sector: KrSector;
  rank: number;
  onSectorClick: (sector: KrSector) => void;
  onStockClick: (stock: KrStock) => void;
}

export default function KrSectorCard({
  sector,
  rank,
  onSectorClick,
  onStockClick,
}: KrSectorCardProps) {
  const isPositive = sector.changeRate >= 0;
  const colorStyle: React.CSSProperties = { color: isPositive ? 'var(--clr-up)' : 'var(--clr-down)' };
  const borderStyle: React.CSSProperties = { borderColor: isPositive ? 'var(--clr-up-border)' : 'var(--clr-down-border)' };
  const sign = isPositive ? '+' : '';

  return (
    <article className="border-b border-gray-800">
      {/* 업종 헤더: text-[13px]/font-bold — 최상위 계층 */}
      <div
        className="flex items-center justify-between px-2 py-1.5 border-l-2 cursor-pointer hover:bg-gray-700/50 transition-colors"
        style={{ ...borderStyle, backgroundColor: 'var(--bg-header)' }}
        onClick={() => onSectorClick(sector)}
        role="button"
        tabIndex={0}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onSectorClick(sector); }}
        aria-label={`${sector.name} AI 분석`}
      >
        <div className="flex items-center gap-1 min-w-0">
          <span className="text-[10px] text-gray-400 font-mono w-5 shrink-0">{rank}.</span>
          <span className="text-[13px] font-bold text-white truncate leading-snug">{sector.name}</span>
        </div>
        <div className="flex items-center shrink-0 ml-1 gap-1">
          <span style={colorStyle} className="text-[13px] font-mono font-bold leading-snug">
            {sign}{sector.changeRate.toFixed(2)}%
          </span>
          <span className="text-[10px] text-gray-500 hover:text-gray-300">🔍</span>
        </div>
      </div>

      {/* 컬럼 헤더: text-[10px]/font-medium — 중간 계층 (레이블) */}
      <div className="grid grid-cols-[5fr_10fr_30fr_20fr_15fr_20fr] items-center gap-x-1 px-2 py-0.5 bg-gray-900/80 border-b border-gray-700">
        <span className="text-[10px] font-medium text-gray-400 text-center">No</span>
        <span className="text-[10px] font-medium text-gray-400">코드</span>
        <span className="text-[10px] font-medium text-gray-400">회사명</span>
        <span className="text-[10px] font-medium text-gray-400 text-right">종가</span>
        <span className="text-[10px] font-medium text-gray-400 text-right">등락률</span>
        <span className="text-[10px] font-medium text-gray-400 text-right">등락액</span>
      </div>

      {/* 종목 행 */}
      <div>
        {sector.stocks.length === 0 ? (
          <div className="px-3 py-2 text-[10px] text-gray-600">종목 데이터 없음</div>
        ) : (
          sector.stocks.map((stock, idx) => (
            <KrStockRow
              key={stock.code}
              stock={stock}
              rank={idx + 1}
              onStockClick={onStockClick}
            />
          ))
        )}
      </div>
    </article>
  );
}
