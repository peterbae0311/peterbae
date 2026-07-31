'use client';

import { useState, useEffect } from 'react';
import { SessionType, DayData } from '@/lib/types';
import SectorCard from '@/components/SectorCard';
import SectorAnalysisModal from '@/components/SectorAnalysisModal';
import StockAnalysisModal from '@/components/StockAnalysisModal';
import KoreanDashboard from '@/components/KoreanDashboard';
import SectorRotationModal from '@/components/SectorRotationModal';
import StockSearchBar from '@/components/StockSearchBar';

const SESSION_META: Record<SessionType, {
  icon: string; label: string; est: string; edt: string;
  headerBg: string; headerBorder: string; labelColor: string;
}> = {
  daymarket:   { icon: '☀️', label: '데이마켓',   est: '10:00~18:00',      edt: '09:00~17:00',
                 headerBg: 'bg-amber-950/70',   headerBorder: 'border-b-2 border-amber-600',   labelColor: 'text-amber-300' },
  premarket:   { icon: '🌅', label: '프리마켓',   est: '18:00~23:30',      edt: '17:00~22:30',
                 headerBg: 'bg-sky-950/70',     headerBorder: 'border-b-2 border-sky-600',     labelColor: 'text-sky-300' },
  regular:     { icon: '🔔', label: '정규장',     est: '23:30~익일06:00',  edt: '22:30~익일05:00',
                 headerBg: 'bg-emerald-950/70', headerBorder: 'border-b-2 border-emerald-600', labelColor: 'text-emerald-300' },
  aftermarket: { icon: '🌙', label: '애프터마켓', est: '06:00~10:00',      edt: '05:00~09:00',
                 headerBg: 'bg-violet-950/70',  headerBorder: 'border-b-2 border-violet-600',  labelColor: 'text-violet-300' },
};

const SESSION_ORDER: SessionType[] = ['aftermarket', 'daymarket', 'premarket', 'regular'];

function isEDT(): boolean {
  const now = new Date();
  const year = now.getFullYear();
  const mar = new Date(year, 2, 1);
  const dstStart = new Date(year, 2, 8 + ((7 - mar.getDay()) % 7));
  const nov = new Date(year, 10, 1);
  const dstEnd = new Date(year, 10, 1 + ((7 - nov.getDay()) % 7));
  return now >= dstStart && now < dstEnd;
}

type Theme = 'dark' | 'white' | 'light-grey';
const THEME_LABELS: Record<Theme, string> = { dark: '🌙', white: '☀️', 'light-grey': '🌤️' };

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<'us' | 'kr'>('us');
  const [theme, setTheme] = useState<Theme>('white');
  const [data, setData] = useState<DayData[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [sectorModal, setSectorModal] = useState<{ name: string; nameKr: string } | null>(null);
  const [stockModal, setStockModal] = useState<{ ticker: string; nameKr: string } | null>(null);
  const [rotationModal, setRotationModal] = useState(false);
  const edt = isEDT();

  useEffect(() => {
    const saved = localStorage.getItem('theme') as Theme | null;
    if (saved && ['dark', 'white', 'light-grey'].includes(saved)) setTheme(saved);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    fetch('/us_stock_market/api/dashboard')
      .then(r => r.json())
      .then((json: { data: DayData[] }) => {
        const loaded = json.data ?? [];
        setData(loaded);
        if (loaded.length > 0) setSelectedDate(loaded[0].date);
      })
      .catch(() => setData([]))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSectorModal(null);
        setStockModal(null);
        setRotationModal(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const day = data.find(d => d.date === selectedDate);

  const fxRate = day
    ? day.exchangeRate.toLocaleString('ko-KR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
    : '-';

  return (
    <>
    <div className="flex flex-col h-screen overflow-hidden bg-gray-950 text-gray-200">

      {/* ── 전체 너비 타이틀 바 ── */}
      <div className="flex items-center justify-between px-3 py-2 bg-gray-900 border-b border-gray-700 shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-white tracking-wide">증시 대시보드</span>

          {/* 탭 전환 */}
          <nav className="flex items-center gap-1" aria-label="시장 탭">
            {(['us', 'kr'] as const).map(tab => {
              const isLight = theme === 'white' || theme === 'light-grey';
              const isActive = activeTab === tab;
              const tabStyle = isLight
                ? isActive
                  ? { backgroundColor: '#2563eb', color: '#ffffff', border: 'none' }
                  : { backgroundColor: '#ffffff', color: '#6b7280', border: '1px solid #d1d5db' }
                : isActive
                  ? { backgroundColor: '#1d4ed8', color: '#ffffff', border: 'none' }
                  : { backgroundColor: '#172554', color: '#94a3b8', border: 'none' };
              return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={tabStyle}
                className="px-3 py-1 text-xs font-semibold rounded transition-colors"
                aria-current={isActive ? 'page' : undefined}
              >
                {tab === 'us' ? '미국증시' : '한국증시'}
              </button>
              );
            })}
          </nav>

          {activeTab === 'us' && isLoading && (
            <span className="text-[10px] text-gray-500 border border-gray-700 rounded px-1.5 py-0.5">로딩 중...</span>
          )}
        </div>
        <div className="flex items-center gap-3 text-[10px] text-gray-500">
          {activeTab === 'us' && <span>{edt ? 'EDT (서머타임 적용)' : 'EST'} · KST 기준</span>}
          <div className="flex items-center gap-0.5 border-l border-gray-700 pl-2 ml-1">
            {(Object.keys(THEME_LABELS) as Theme[]).map(t => (
              <button
                key={t}
                onClick={() => setTheme(t)}
                title={t === 'dark' ? '다크' : t === 'white' ? '화이트' : '라이트그레이'}
                className={`px-1.5 py-0.5 text-xs rounded transition-colors ${
                  theme === t ? 'bg-yellow-600 text-white' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                }`}
              >
                {THEME_LABELS[t]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── 한국증시 탭 본문 ── */}
      {activeTab === 'kr' && (
        <div className="flex-1 overflow-hidden">
          <KoreanDashboard />
        </div>
      )}

      {/* ── 미국증시 탭 본문 ── */}
      {activeTab === 'us' && (
      <div className="flex flex-1 overflow-hidden">

        {/* ── LEFT PANEL 10% ── */}
        <aside
          className="w-[10%] min-w-[90px] h-full flex flex-col shrink-0 border-r overflow-y-auto"
          style={{ backgroundColor: 'var(--bg-date-panel)', borderColor: 'var(--border-date-panel)' }}
          aria-label="날짜 목록"
        >
          {isLoading ? (
            <div className="px-2 py-3 text-[10px]" style={{ color: '#888888' }}>데이터 불러오는 중...</div>
          ) : data.length === 0 ? (
            <div className="px-2 py-3 text-[10px]" style={{ color: '#888888' }}>수집된 데이터 없음</div>
          ) : (
            data.map(d => {
              const active = d.date === selectedDate;
              return (
                <button
                  key={d.date}
                  onClick={() => setSelectedDate(d.date)}
                  className="w-full text-left px-2 py-2.5 border-b transition-colors"
                  style={{
                    borderColor: 'var(--border-date-panel)',
                    backgroundColor: active ? '#1d4ed8' : undefined,
                  }}
                  aria-current={active ? 'page' : undefined}
                >
                  <div className="text-[11px] font-semibold leading-tight" style={{ color: active ? '#ffffff' : 'var(--text-primary)' }}>
                    {d.date} <span style={{ color: active ? '#93c5fd' : 'var(--text-muted)' }}>({d.dayOfWeek})</span>
                  </div>
                </button>
              );
            })
          )}
        </aside>

        {/* ── RIGHT PANEL 90% ── */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* 서브헤더 */}
          <div className="px-3 py-1.5 border-b border-gray-800 bg-gray-900/60 shrink-0 flex items-center gap-3">
            <span className="text-xs font-bold text-white">미국증시 섹터 현황</span>
            <span className="text-[10px] text-emerald-400 font-semibold">🔔 정규장</span>
            <span className="text-gray-700 text-[10px]">|</span>
            <span className="text-[10px] text-gray-600">환율</span>
            <span className="text-[10px] font-mono text-gray-600">₩{fxRate} / $1</span>
            <span className="text-gray-700 text-[10px]">|</span>
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
            <span className="text-gray-700 text-[10px]">|</span>
            <StockSearchBar
              apiPath="/api/us/stock-search"
              placeholder="종목코드·명칭 검색"
              onSelect={r => setStockModal({ ticker: r.code, nameKr: r.name })}
            />
            {isLoading && (
              <span className="ml-auto flex items-center gap-1 text-[10px] text-gray-500">
                <span className="animate-spin inline-block w-3 h-3 border-2 border-gray-600 border-t-gray-300 rounded-full" />
                불러오는 중...
              </span>
            )}
          </div>

          {/* 정규장 섹터 그리드 */}
          <div className="flex-1 overflow-y-auto">
            {(() => {
              const regularSession = day?.sessions.find(s => s.type === 'regular');
              if (isLoading) return (
                <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
                  <span className="mr-2 animate-spin inline-block w-4 h-4 border-2 border-gray-600 border-t-gray-300 rounded-full" />
                  불러오는 중...
                </div>
              );
              if (!regularSession) return (
                <div className="flex items-center justify-center h-32 text-gray-600 text-xs">
                  정규장 데이터 없음
                </div>
              );
              return (
                <div className="grid grid-cols-3 divide-x divide-gray-800">
                  {regularSession.sectors.map((sector, idx) => (
                    <SectorCard
                      key={sector.id}
                      sector={sector}
                      rank={idx + 1}
                      exchangeRate={day?.exchangeRate ?? 1380}
                      onSectorClick={(name, nameKr) => setSectorModal({ name, nameKr })}
                      onStockClick={(ticker, nameKr) => setStockModal({ ticker, nameKr })}
                    />
                  ))}
                </div>
              );
            })()}
          </div>
        </main>
      </div>
      )}

    </div>

    {sectorModal && (
      <SectorAnalysisModal
        sectorName={sectorModal.name}
        sectorNameKr={sectorModal.nameKr}
        date={selectedDate ?? ''}
        onClose={() => setSectorModal(null)}
      />
    )}
    {stockModal && (
      <StockAnalysisModal
        ticker={stockModal.ticker}
        nameKr={stockModal.nameKr}
        date={selectedDate ?? ''}
        exchangeRate={day?.exchangeRate ?? 1380}
        onClose={() => setStockModal(null)}
      />
    )}
    {rotationModal && (
      <SectorRotationModal onClose={() => setRotationModal(false)} />
    )}
    </>
  );
}
