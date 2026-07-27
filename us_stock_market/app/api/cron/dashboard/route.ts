import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getExchangeRate } from '@/lib/fmp';
import type { DayData, Session, Sector, Stock, SessionType } from '@/lib/types';

export const dynamic = 'force-dynamic';

const TICKER_KR: Record<string, string> = {
  NVDA:'엔비디아', AAPL:'애플', META:'메타', MSFT:'마이크로소프트', GOOGL:'알파벳',
  LLY:'일라이릴리', UNH:'유나이티드헬스', JNJ:'존슨앤드존슨', ABBV:'애브비', MRK:'머크',
  JPM:'JP모건', GS:'골드만삭스', BAC:'뱅크오브아메리카', MS:'모건스탠리', BLK:'블랙록',
  AMZN:'아마존', TSLA:'테슬라', HD:'홈디포', NKE:'나이키', MCD:'맥도날드',
  WMT:'월마트', PG:'P&G', KO:'코카콜라', COST:'코스트코', PEP:'펩시코',
  XOM:'엑손모빌', CVX:'셰브론', COP:'코노코필립스', EOG:'EOG리소시스', SLB:'슐럼버거',
  NEE:'넥스트에라에너지', DUK:'듀크에너지', SO:'서던컴퍼니', AEP:'AEP', D:'도미니언에너지',
  AMT:'아메리칸타워', PLD:'프롤로지스', EQIX:'에퀴닉스', SPG:'사이먼프라퍼티', CCI:'CCI',
  LIN:'린데', APD:'에어프로덕츠', FCX:'프리포트맥모란', NEM:'뉴몬트', DOW:'다우',
  CAT:'캐터필러', HON:'하니웰', UPS:'UPS', RTX:'RTX', DE:'디어앤컴퍼니',
  NFLX:'넷플릭스', DIS:'월트디즈니', T:'AT&T',
};

const SECTOR_NAMES: Record<string, { nameKr: string }> = {
  Technology:             { nameKr: '기술' },
  Healthcare:             { nameKr: '헬스케어' },
  'Financial Services':   { nameKr: '금융' },
  'Consumer Cyclical':    { nameKr: '소비재(경기)' },
  'Consumer Defensive':   { nameKr: '소비재(필수)' },
  'Communication Services': { nameKr: '통신' },
  Energy:                 { nameKr: '에너지' },
  Utilities:              { nameKr: '유틸리티' },
  'Real Estate':          { nameKr: '부동산' },
  'Basic Materials':      { nameKr: '소재' },
  Industrials:            { nameKr: '산업재' },
};

const SESSION_LABELS: Record<string, string> = {
  daymarket: '데이마켓', premarket: '프리마켓', regular: '정규장', aftermarket: '애프터마켓',
};

function getDayOfWeek(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  return ['일','월','화','수','목','금','토'][d.getUTCDay()];
}

interface RawStock {
  ticker: string;
  companyName: string;
  changePct: number;
  priceChange: number;
  closePrice: number;
}

interface SectorSnapshotRow {
  id: string;
  session_id: string;
  sector_name: string;
  change_pct: number;
  rank: number;
  raw_data: { stocks?: RawStock[] };
}

export async function GET() {
  try {
    const exchangeRate = await getExchangeRate().catch(() => 1380);

    const { data: tradeDates, error: datesError } = await supabase
      .from('alert_sessions')
      .select('trade_date')
      .eq('status', 'success')
      .order('trade_date', { ascending: false })
      .limit(14);

    if (datesError) throw datesError;

    const uniqueDates = [...new Set((tradeDates ?? []).map((r: { trade_date: string }) => r.trade_date))];

    const dayDataList: DayData[] = [];

    for (const tradeDate of uniqueDates) {
      const { data: sessionRows, error: sessionError } = await supabase
        .from('alert_sessions')
        .select('id, session_type, status')
        .eq('trade_date', tradeDate)
        .in('status', ['success', 'skipped']);

      if (sessionError) continue;

      const sessions: Session[] = [];

      for (const sessionRow of (sessionRows ?? [])) {
        if (sessionRow.status !== 'success') continue;

        const { data: snapshotRows, error: snapError } = await supabase
          .from('sector_snapshots')
          .select('id, session_id, sector_name, change_pct, rank, raw_data')
          .eq('session_id', sessionRow.id)
          .order('rank', { ascending: true });

        if (snapError) continue;

        const sectors: Sector[] = (snapshotRows as SectorSnapshotRow[] ?? []).map((snap) => {
          const rawStocks: RawStock[] = snap.raw_data?.stocks ?? [];
          const stocks: Stock[] = rawStocks.map((rs) => ({
            ticker: rs.ticker,
            nameKr: TICKER_KR[rs.ticker] ?? rs.ticker,
            changePercent: rs.changePct,
            changeDollar: rs.priceChange,
            closePrice: rs.closePrice,
          }));

          const sectorInfo = SECTOR_NAMES[snap.sector_name];
          return {
            id: snap.id,
            nameKr: sectorInfo?.nameKr ?? snap.sector_name,
            nameEn: snap.sector_name,
            changePercent: snap.change_pct,
            stocks,
          };
        }).sort((a, b) => b.changePercent - a.changePercent);

        sessions.push({
          type: sessionRow.session_type as SessionType,
          labelKr: SESSION_LABELS[sessionRow.session_type] ?? sessionRow.session_type,
          sectors,
        });
      }

      dayDataList.push({
        date: tradeDate,
        dayOfWeek: getDayOfWeek(tradeDate),
        exchangeRate,
        sessions,
      });
    }

    return NextResponse.json({ data: dayDataList });
  } catch {
    return NextResponse.json({ data: [] });
  }
}
