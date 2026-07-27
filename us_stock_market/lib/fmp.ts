/**
 * Market data client — Yahoo Finance v8 chart (no API key, parallel requests)
 *
 * Sector performance : sector ETFs (XLK, XLV …) daily % change
 * Stock quotes       : individual tickers via parallel v8 chart requests
 *
 * getAllSectorsWithStocks issues ~44 concurrent requests (~1-2 s total).
 */

const YF_V8 = 'https://query1.finance.yahoo.com/v8/finance/chart';

// ── Generic fetch with retry ──────────────────────────────────────────────────

async function fetchWithRetry<T>(url: string, maxRetries = 3): Promise<T> {
  let lastError: Error = new Error('Unknown error');
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (attempt > 0) {
      await new Promise(r => setTimeout(r, Math.pow(2, attempt - 1) * 1000));
    }
    try {
      const res = await fetch(url, {
        cache: 'no-store',
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      return (await res.json()) as T;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }
  throw lastError;
}

// ── Market open check (time-based) ───────────────────────────────────────────

export async function isMarketOpen(): Promise<boolean> {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: false,
  }).formatToParts(new Date());

  const weekday = parts.find(p => p.type === 'weekday')?.value ?? '';
  const hour    = parseInt(parts.find(p => p.type === 'hour')?.value   ?? '0', 10);
  const minute  = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0', 10);

  if (['Sat', 'Sun'].includes(weekday)) return false;
  const mins = hour * 60 + minute;
  return mins >= 9 * 60 + 30 && mins < 16 * 60;
}

// ── Sector ETFs ───────────────────────────────────────────────────────────────

const SECTOR_ETFS: [string, string][] = [
  ['Technology',             'XLK'],
  ['Healthcare',             'XLV'],
  ['Financial Services',     'XLF'],
  ['Consumer Cyclical',      'XLY'],
  ['Consumer Defensive',     'XLP'],
  ['Communication Services', 'XLC'],
  ['Energy',                 'XLE'],
  ['Utilities',              'XLU'],
  ['Real Estate',            'XLRE'],
  ['Basic Materials',        'XLB'],
  ['Industrials',            'XLI'],
];

// ── Representative stocks per sector ─────────────────────────────────────────

const SECTOR_STOCKS: Record<string, string[]> = {
  'Technology':             ['NVDA', 'AAPL', 'META', 'MSFT', 'GOOGL', 'AMD',  'ORCL', 'ADBE', 'CRM',  'INTC'],
  'Healthcare':             ['LLY',  'UNH',  'JNJ',  'ABBV', 'MRK',   'TMO',  'DHR',  'BSX',  'ISRG', 'AMGN'],
  'Financial Services':     ['JPM',  'GS',   'BAC',  'MS',   'BLK',   'WFC',  'C',    'AXP',  'SPGI', 'MCO'],
  'Consumer Cyclical':      ['AMZN', 'TSLA', 'HD',   'NKE',  'MCD',   'LOW',  'TJX',  'BKNG', 'GM',   'F'],
  'Consumer Defensive':     ['WMT',  'PG',   'KO',   'COST', 'PEP',   'MDLZ', 'PM',   'MO',   'CL',   'GIS'],
  'Communication Services': ['GOOGL','META', 'NFLX', 'DIS',  'T',     'VZ',   'CMCSA','EA',   'TTWO', 'WBD'],
  'Energy':                 ['XOM',  'CVX',  'COP',  'EOG',  'SLB',   'PSX',  'VLO',  'MPC',  'OXY',  'HAL'],
  'Utilities':              ['NEE',  'DUK',  'SO',   'AEP',  'D',     'EXC',  'SRE',  'XEL',  'WEC',  'ES'],
  'Real Estate':            ['AMT',  'PLD',  'EQIX', 'SPG',  'CCI',   'O',    'VICI', 'PSA',  'EXR',  'AVB'],
  'Basic Materials':        ['LIN',  'APD',  'FCX',  'NEM',  'DOW',   'SHW',  'ECL',  'NUE',  'CF',   'MOS'],
  'Industrials':            ['CAT',  'HON',  'UPS',  'RTX',  'DE',    'LMT',  'NOC',  'GD',   'BA',   'EMR'],
};

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SectorData {
  sectorName: string;
  changePct:  number;
}

export interface StockData {
  ticker:      string;
  companyName: string;
  sectorName:  string;
  changePct:   number;
  priceChange: number;
  closePrice:  number;
}

export interface SectorWithStocks extends SectorData {
  stocks: StockData[];
}

// ── Yahoo Finance v8 chart: fetch one ticker ──────────────────────────────────

export interface YfMeta {
  symbol:                     string;
  shortName?:                 string;
  regularMarketPrice?:        number;
  chartPreviousClose?:        number;   // v8 chart 전일 종가
  previousClose?:             number;   // v8 chart 전일 종가 (alias)
  regularMarketChange?:       number;
  regularMarketChangePercent?:number;
  regularMarketPreviousClose?:number;
}

export async function getTickerData(ticker: string): Promise<YfMeta | null> {
  return fetchOneTicker(ticker);
}

// interval=1m 으로 당일 인트라데이 데이터 요청 → regularMarketPrice = 실시간 현재가
async function fetchOneTicker(ticker: string): Promise<YfMeta | null> {
  try {
    const url  = `${YF_V8}/${ticker}?interval=1m&range=1d&includePrePost=false`;
    const res  = await fetch(url, {
      cache: 'no-store',
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { chart?: { result?: [{ meta: YfMeta }] } };
    return data?.chart?.result?.[0]?.meta ?? null;
  } catch {
    return null;
  }
}

function metaToChangePct(m: YfMeta): number {
  if (m.regularMarketChangePercent != null) return m.regularMarketChangePercent;
  const prev  = m.chartPreviousClose ?? 0;
  const price = m.regularMarketPrice ?? 0;
  return prev > 0 ? ((price - prev) / prev) * 100 : 0;
}

// ── Exchange rate ─────────────────────────────────────────────────────────────

export async function getExchangeRate(): Promise<number> {
  const meta = await fetchOneTicker('USDKRW=X');
  return meta?.regularMarketPrice ?? 1380;
}

// ── Sector performance ────────────────────────────────────────────────────────

export async function getSectorPerformance(): Promise<SectorData[]> {
  const etfTickers = SECTOR_ETFS.map(([, etf]) => etf);
  const metas      = await Promise.all(etfTickers.map(fetchOneTicker));

  return SECTOR_ETFS
    .map(([sectorName], i) => ({
      sectorName,
      changePct: metas[i] ? metaToChangePct(metas[i]!) : 0,
    }))
    .sort((a, b) => b.changePct - a.changePct);
}

// ── Stock list per sector ─────────────────────────────────────────────────────

export async function getTopStocksForSector(sectorName: string, limit = 3): Promise<StockData[]> {
  const tickers = SECTOR_STOCKS[sectorName] ?? [];
  const metas   = await Promise.all(tickers.map(fetchOneTicker));

  return tickers
    .map((ticker, i) => {
      const m = metas[i];
      if (!m) return null;
      const changePct   = metaToChangePct(m);
      const prev        = m.chartPreviousClose ?? m.regularMarketPrice ?? 0;
      const price       = m.regularMarketPrice ?? 0;
      const priceChange = m.regularMarketChange ?? (price - prev);
      return { ticker, companyName: m.shortName ?? ticker, sectorName, changePct, priceChange, closePrice: price };
    })
    .filter((s): s is StockData => s !== null)
    .sort((a, b) => b.changePct - a.changePct)
    .slice(0, limit);
}

// ── getAllSectorsWithStocks — single batch of parallel requests ────────────────

export async function getAllSectorsWithStocks(stocksPerSector = 5): Promise<SectorWithStocks[]> {
  // Collect all unique tickers (ETFs + stocks) and fetch in one parallel burst
  const etfTickers   = SECTOR_ETFS.map(([, etf]) => etf);
  const stockTickers = [...new Set(Object.values(SECTOR_STOCKS).flat())];
  const allTickers   = [...etfTickers, ...stockTickers];

  const allMetas = await Promise.all(allTickers.map(fetchOneTicker));
  const metaMap  = new Map<string, YfMeta>();
  allTickers.forEach((t, i) => { if (allMetas[i]) metaMap.set(t, allMetas[i]!); });

  // Build sector list from ETF metas
  const sectors = SECTOR_ETFS
    .map(([sectorName, etf]) => ({
      sectorName,
      changePct: metaMap.has(etf) ? metaToChangePct(metaMap.get(etf)!) : 0,
    }))
    .sort((a, b) => b.changePct - a.changePct);

  // Attach stocks
  return sectors.map(sector => {
    const tickers = SECTOR_STOCKS[sector.sectorName] ?? [];
    const stocks  = tickers
      .map(ticker => {
        const m = metaMap.get(ticker);
        if (!m) return null;
        const changePct   = metaToChangePct(m);
        const prev        = m.chartPreviousClose ?? m.regularMarketPrice ?? 0;
        const price       = m.regularMarketPrice ?? 0;
        const priceChange = m.regularMarketChange ?? (price - prev);
        return { ticker, companyName: m.shortName ?? ticker, sectorName: sector.sectorName, changePct, priceChange, closePrice: price };
      })
      .filter((s): s is StockData => s !== null)
      .sort((a, b) => b.changePct - a.changePct)
      .slice(0, stocksPerSector);
    return { ...sector, stocks };
  });
}
