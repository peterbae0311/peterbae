'use client';

import { useEffect, useState } from 'react';
import KrSectorCard from './KrSectorCard';
import KrSectorAnalysisModal from './KrSectorAnalysisModal';
import KrStockAnalysisModal from './KrStockAnalysisModal';
import KrInvestorTradeModal from './KrInvestorTradeModal';
import SectorRotationModal from './SectorRotationModal';
import StockSearchBar from './StockSearchBar';
import type { KrSector, KrStock } from './KrSectorCard';

interface KrSectorsResponse {
  sectors: KrSector[];
  fetchedAt: string;
  date?: string;
  source?: 'db' | 'live';
  error?: string;
}

interface KrDatesResponse {
  dates: string[];
}

function getDayOfWeek(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  return ['일', '월', '화', '수', '목', '금', '토'][d.getUTCDay()];
}

export default function KoreanDashboard() {
  const [dates, setDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [datesLoading, setDatesLoading] = useState(true);

  const [sectors, setSectors] = useState<KrSector[]>([]);
  const [fetchedAt, setFetchedAt] = useState<string>('');
  const [source, setSource] = useState<'db' | 'live' | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [sectorModal, setSectorModal] = useState<KrSector | null>(null);
  const [stockModal, setStockModal] = useState<KrStock | null>(null);
  const [foreignModal, setForeignModal] = useState(false);
  const [institutionalModal, setInstitutionalModal] = useState(false);
  const [rotationModal, setRotationModal] = useState(false);

  // 날짜 목록 fetch (마운트 시 1회)
  useEffect(() => {
    setDatesLoading(true);
    fetch('/api/kr/sectors/dates')
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<KrDatesResponse>;
      })
      .then(json => {
        const loaded = json.dates ?? [];
        setDates(loaded);
        if (loaded.length > 0) setSelectedDate(loaded[0]);
      })
      .catch(() => {
        // 날짜 API 실패 시 오늘 날짜로 폴백
        const today = new Date().toISOString().slice(0, 10);
        setDates([today]);
        setSelectedDate(today);
      })
      .finally(() => setDatesLoading(false));
  }, []);

  // 업종 데이터 fetch (selectedDate 변경 시)
  useEffect(() => {
    if (!selectedDate) return;
    setIsLoading(true);
    setError(null);
    fetch(`/api/kr/sectors?date=${selectedDate}`)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<KrSectorsResponse>;
      })
      .then(json => {
        setSectors(json.sectors ?? []);
        setFetchedAt(json.fetchedAt ?? json.date ?? '');
        setSource(json.source);
        if (json.error) setError(json.error);
      })
      .catch(err =>
        setError(err instanceof Error ? err.message : '데이터를 불러오지 못했습니다.')
      )
      .finally(() => setIsLoading(false));
  }, [selectedDate]);

  // ESC 키로 모달 닫기
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSectorModal(null);
        setStockModal(null);
        setForeignModal(false);
        setInstitutionalModal(false);
        setRotationModal(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const fetchedAtLabel = fetchedAt
    ? new Date(fetchedAt).toLocaleString('ko-KR', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '-';

  return (
    <>
      <div className="flex h-full overflow-hidden">

        {/* 왼쪽 날짜 패널 (10%) */}
        <aside
          className="w-[10%] min-w-[90px] h-full flex flex-col shrink-0 border-r overflow-y-auto"
          style={{ backgroundColor: 'var(--bg-date-panel)', borderColor: 'var(--border-date-panel)' }}
          aria-label="날짜 목록"
        >
          {datesLoading ? (
            <div className="px-2 py-3 text-[10px]" style={{ color: '#888888' }}>
              불러오는 중...
            </div>
          ) : dates.length === 0 ? (
            <div className="px-2 py-3 text-[10px]" style={{ color: '#888888' }}>
              수집된 데이터 없음
            </div>
          ) : (
            dates.map(date => {
              const active = date === selectedDate;
              const dow = getDayOfWeek(date);
              return (
                <button
                  key={date}
                  onClick={() => setSelectedDate(date)}
                  className="w-full text-left px-2 py-2.5 border-b transition-colors"
                  style={{
                    borderColor: 'var(--border-date-panel)',
                    backgroundColor: active ? '#1d4ed8' : undefined,
                  }}
                  aria-current={active ? 'page' : undefined}
                >
                  <div
                    className="text-[11px] font-semibold leading-tight"
                    style={{ color: active ? '#ffffff' : 'var(--text-primary)' }}
                  >
                    {date}{' '}
                    <span style={{ color: active ? '#93c5fd' : 'var(--text-muted)' }}>({dow})</span>
                  </div>
                </button>
              );
            })
          )}
        </aside>

        {/* 오른쪽 콘텐츠 (90%) */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* 서브 헤더 */}
          <div className="px-3 py-1.5 border-b border-gray-800 bg-gray-900/60 shrink-0 flex items-center gap-3">
            <span className="text-xs font-bold text-white">한국증시 업종 현황</span>
            <span className="text-gray-700 text-[10px]">|</span>
            <span className="text-[10px] text-gray-600">기준시각</span>
            <span className="text-[10px] font-mono text-gray-600">{fetchedAtLabel}</span>
            {source && (
              <>
                <span className="text-gray-700 text-[10px]">|</span>
                <span className="text-[10px] text-gray-600">
                  {source === 'db' ? '저장된 데이터' : '실시간'}
                </span>
              </>
            )}
            <span className="text-gray-700 text-[10px]">|</span>
            <button
              onClick={() => setForeignModal(true)}
              className="px-2 py-0.5 text-[10px] rounded border transition-colors hover:opacity-80"
              style={{
                borderColor: 'var(--border-strong)',
                color: 'var(--text-secondary)',
                backgroundColor: 'var(--bg-card)',
              }}
            >
              외국인 매수/매도 상위
            </button>
            <button
              onClick={() => setInstitutionalModal(true)}
              className="px-2 py-0.5 text-[10px] rounded border transition-colors hover:opacity-80"
              style={{
                borderColor: 'var(--border-strong)',
                color: 'var(--text-secondary)',
                backgroundColor: 'var(--bg-card)',
              }}
            >
              기관 매수/매도 상위
            </button>
            <button
              onClick={() => setRotationModal(true)}
              className="px-2 py-0.5 text-[10px] rounded border transition-colors hover:opacity-80"
              style={{
                borderColor: 'var(--border-strong)',
                color: 'var(--text-secondary)',
                backgroundColor: 'var(--bg-card)',
              }}
            >
              섹터 로테이션
            </button>
            <StockSearchBar
              apiPath="/api/kr/stock-search"
              placeholder="종목코드·명칭 검색"
              onSelect={r =>
                setStockModal({ code: r.code, name: r.name, price: 0, changeRate: 0, changeAmount: 0 })
              }
            />
            {isLoading && (
              <span className="ml-auto flex items-center gap-1 text-[10px] text-gray-500">
                <span className="animate-spin inline-block w-3 h-3 border-2 border-gray-600 border-t-gray-300 rounded-full" />
                불러오는 중...
              </span>
            )}
          </div>

          {/* 본문 */}
          <div className="flex-1 overflow-y-auto">
            {error && !isLoading && (
              <div className="flex items-center justify-center h-32 text-red-400 text-xs px-4 text-center">
                {error}
              </div>
            )}

            {isLoading && (
              <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
                <span className="mr-2 animate-spin inline-block w-4 h-4 border-2 border-gray-600 border-t-gray-300 rounded-full" />
                불러오는 중...
              </div>
            )}

            {!isLoading && !error && sectors.length === 0 && (
              <div className="flex items-center justify-center h-32 text-gray-600 text-xs">
                수집된 데이터 없음
              </div>
            )}

            {!isLoading && sectors.length > 0 && (
              <div className="grid grid-cols-3 divide-x divide-gray-800">
                {sectors.map((sector, idx) => (
                  <KrSectorCard
                    key={sector.no}
                    sector={sector}
                    rank={idx + 1}
                    onSectorClick={setSectorModal}
                    onStockClick={setStockModal}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {sectorModal && (
        <KrSectorAnalysisModal
          sectorName={sectorModal.name}
          changeRate={sectorModal.changeRate}
          onClose={() => setSectorModal(null)}
        />
      )}

      {stockModal && (
        <KrStockAnalysisModal
          stockName={stockModal.name}
          stockCode={stockModal.code}
          price={stockModal.price}
          changeRate={stockModal.changeRate}
          onClose={() => setStockModal(null)}
        />
      )}

      {foreignModal && (
        <KrInvestorTradeModal
          type="foreign"
          onClose={() => setForeignModal(false)}
          onStockClick={stock => {
            setForeignModal(false);
            setStockModal({ code: stock.code, name: stock.name, price: stock.price, changeRate: stock.changeRate, changeAmount: stock.changeAmount });
          }}
        />
      )}

      {institutionalModal && (
        <KrInvestorTradeModal
          type="institutional"
          onClose={() => setInstitutionalModal(false)}
          onStockClick={stock => {
            setInstitutionalModal(false);
            setStockModal({ code: stock.code, name: stock.name, price: stock.price, changeRate: stock.changeRate, changeAmount: stock.changeAmount });
          }}
        />
      )}

      {rotationModal && (
        <SectorRotationModal onClose={() => setRotationModal(false)} />
      )}
    </>
  );
}
