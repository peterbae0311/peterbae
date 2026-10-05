/**
 * NAVER Finance data — server-side only, never import on the client.
 *
 * 2026-10: NAVER retired the old finance.naver.com/sise/* HTML pages (they now
 * 302/410 to the new stock.naver.com SPA). All market-data fetches below use
 * that SPA's JSON API instead of HTML scraping.
 */

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// 업종 등락율 랭킹 (구 finance.naver.com/sise/sise_group.naver 대체)
const INDUSTRY_RANKING_URL =
  'https://stock.naver.com/api/stockSecurity/rankings/v2/domestic/industries';
// 업종별 종목 리스트 (구 sise_group_detail.naver 대체) — 뒤에 /{업종코드}/stocklist 를 붙여 사용
const INDUSTRY_STOCKLIST_URL =
  'https://stock.naver.com/api/domestic/market/upjong';
// 외국인/기관 순매수·순매도 상위 랭킹 (구 sise_deal_rank_iframe.naver 대체)
const TREND_FOREIGN_ORG_URL =
  'https://stock.naver.com/api/domestic/market/trend/trendForeignOrg';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface KrStock {
  code: string;
  name: string;
  price: number;        // 종가 (₩)
  changeRate: number;   // 등락률 (%)
  changeAmount: number; // 등락액 (₩)
}

export interface KrSectorWithStocks {
  no: string;
  name: string;
  changeRate: number;
  stocks: KrStock[];
}

/** 외국인/기관 순매수·순매도 상위 종목 */
export interface TradeStock {
  rank: number;          // 순위 (1-based)
  code: string;          // 종목코드 6자리
  name: string;          // 종목명
  price: number;         // 종가 (₩)
  changeRate: number;    // 등락률 (%)
  changeAmount: number;  // 등락액 (₩)
  netVolume: number;     // 순매수/순매도 수량 (주)
  netAmount: number;     // 순매수/순매도 금액 (백만원)
  tradingVolume: number; // 당일 거래량
}

export interface InvestorTradeData {
  buyTop: TradeStock[];   // 순매수 상위 30
  sellTop: TradeStock[];  // 순매도 상위 30
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Fetch and parse a stock.naver.com JSON API response.
 */
async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    next: { revalidate: 0 },
  });
  if (!res.ok) {
    throw new Error(`NAVER Finance fetch failed: HTTP ${res.status} for ${url}`);
  }
  return res.json() as Promise<T>;
}

function toNum(s: string | undefined): number {
  if (!s) return 0;
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

// ── Sector ranking (stock.naver.com) ────────────────────────────────────────────

interface IndustryRankingItem {
  code: string;
  name: string;
  changeRate: string;
}

interface IndustryRankingResponse {
  items: IndustryRankingItem[];
}

interface UpjongStockItem {
  itemcode: string;
  itemname: string;
  nowPrice: string;
  prevChangeRate: string;
  prevChangePrice: string;
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Returns the top N Korean sectors (sorted by changeRate descending),
 * each populated with their top 10 stocks also sorted by changeRate descending.
 *
 * On any per-sector fetch error, that sector will have an empty stocks array.
 */
export async function getTopKrSectorsWithStocks(
  topN: number,
): Promise<KrSectorWithStocks[]> {
  const listRes = await fetchJson<IndustryRankingResponse>(
    `${INDUSTRY_RANKING_URL}?sortType=changeRate&size=${topN}&period=daily`,
  );

  const topSectors = (listRes.items ?? [])
    .map((it) => ({ no: it.code, name: it.name, changeRate: toNum(it.changeRate) }))
    .sort((a, b) => b.changeRate - a.changeRate)
    .slice(0, topN);

  const stocksResults = await Promise.all(
    topSectors.map(async (sector) => {
      try {
        const list = await fetchJson<UpjongStockItem[]>(
          `${INDUSTRY_STOCKLIST_URL}/${sector.no}/stocklist?marketType=ALL&orderType=up&startIdx=0&pageSize=10`,
        );
        const stocks: KrStock[] = list.map((s) => ({
          code: s.itemcode,
          name: s.itemname,
          price: toNum(s.nowPrice),
          changeRate: toNum(s.prevChangeRate),
          changeAmount: toNum(s.prevChangePrice),
        }));
        return stocks.sort((a, b) => b.changeRate - a.changeRate).slice(0, 10);
      } catch {
        return [] as KrStock[];
      }
    }),
  );

  return topSectors.map((sector, i) => ({
    no: sector.no,
    name: sector.name,
    changeRate: sector.changeRate,
    stocks: stocksResults[i],
  }));
}

// ── Investor trade ranking ─────────────────────────────────────────────────────

// ETF 브랜드 접두어 (대문자 비교)
const ETF_BRAND_PREFIXES = [
  'KODEX', 'TIGER', 'KBSTAR', 'ARIRANG', 'HANARO', 'KOSEF', 'KINDEX', 'TIMEFOLIO',
];
// ETF/선물/스팩 판별 키워드
const NON_STOCK_KEYWORDS = ['ETF', '레버리지', '인버스', '선물', '스팩'];

function isNonStock(name: string): boolean {
  const upper = name.toUpperCase();
  if (NON_STOCK_KEYWORDS.some(kw => upper.includes(kw.toUpperCase()))) return true;
  if (ETF_BRAND_PREFIXES.some(prefix => upper.startsWith(prefix))) return true;
  return false;
}

interface TrendForeignOrgItem {
  itemcode: string;
  itemname: string;
  nowPrice: string;
  prevChangeRate: string;
  prevChangePrice: string;
  accTradeVolume: string; // 순매수/순매도 수량 (주) — 매도 리스트에서는 음수
  accTradeAmount: string; // 순매수/순매도 금액 (원) — 매도 리스트에서는 음수
  dailyTradeVolume: string; // 당일 전체 거래량
}

interface TrendForeignOrgResponse {
  sections: {
    buyRankList: TrendForeignOrgItem[];
    sellRankList: TrendForeignOrgItem[];
  };
}

/**
 * 순매수/순매도 상위 30개(ETF·선물·스팩 제외)를 반환.
 */
async function fetchTradeRankingTop30(
  investorType: 'FOREIGNER' | 'ORGANIZATION',
  direction: 'buy' | 'sell',
): Promise<TradeStock[]> {
  const res = await fetchJson<TrendForeignOrgResponse>(
    `${TREND_FOREIGN_ORG_URL}?investorType=${investorType}&tradeType=KRX&marketType=KOSPI&startIdx=0&pageSize=30&periodType=DAY`,
  );
  const list = direction === 'buy' ? res.sections.buyRankList : res.sections.sellRankList;

  const filtered = (list ?? [])
    .filter(s => !isNonStock(s.itemname))
    .slice(0, 30);

  return filtered.map((s, i): TradeStock => ({
    rank: i + 1,
    code: s.itemcode,
    name: s.itemname,
    price: toNum(s.nowPrice),
    changeRate: toNum(s.prevChangeRate),
    changeAmount: toNum(s.prevChangePrice),
    netVolume: Math.abs(toNum(s.accTradeVolume)),
    netAmount: Math.abs(toNum(s.accTradeAmount)) / 1_000_000, // 원 → 백만원
    tradingVolume: toNum(s.dailyTradeVolume),
  }));
}

/**
 * Returns foreign investor (외국인) net-buy top 30 and net-sell top 30
 * for KOSPI stocks.
 */
export async function getForeignTradeRanking(): Promise<InvestorTradeData> {
  const [buyTop, sellTop] = await Promise.all([
    fetchTradeRankingTop30('FOREIGNER', 'buy'),
    fetchTradeRankingTop30('FOREIGNER', 'sell'),
  ]);
  return { buyTop, sellTop };
}

/**
 * Returns institutional investor (기관) net-buy top 30 and net-sell top 30
 * for KOSPI stocks.
 */
export async function getInstitutionalTradeRanking(): Promise<InvestorTradeData> {
  const [buyTop, sellTop] = await Promise.all([
    fetchTradeRankingTop30('ORGANIZATION', 'buy'),
    fetchTradeRankingTop30('ORGANIZATION', 'sell'),
  ]);
  return { buyTop, sellTop };
}

// ── Stock fundamentals (투자자 동향 · PER · 실적) ──────────────────────────────

export interface KrInvestorTrend {
  date:          string; // 기준일 "YYYYMMDD"
  foreign:       number; // 외국인 순매수량 (주), 음수=순매도
  institutional: number; // 기관 순매수량 (주)
  individual:    number; // 개인 순매수량 (주)
}

export interface KrEarnings {
  period:          string; // e.g. "2024.12."
  revenue:         number; // 매출액 (억원)
  operatingProfit: number; // 영업이익 (억원)
}

export interface KrStockFundamentals {
  per:            number | null;
  investorTrend:  KrInvestorTrend | null;
  latestEarnings: KrEarnings | null;
  prevEarnings:   KrEarnings | null;
  companySummary: string[] | null; // 회사 개요 (comment1~3)
  livePrice:      number | null;   // 현재가 (₩)
  liveChangeRate: number | null;   // 등락률 (%)
}

const MOBILE_HEADERS = {
  'User-Agent': USER_AGENT,
  Accept: 'application/json',
  Referer: 'https://m.stock.naver.com/',
};

/**
 * 종목 코드로 투자자 동향·PER·실적을 한 번에 반환 (JSON API 사용).
 *
 * - 투자자 동향: front-api/stock/domestic/trend  (외국인·기관·개인 순매수량)
 * - PER·실적:   api/stock/{code}/finance/annual  (매출액·영업이익·PER)
 */
export async function fetchKrStockFundamentals(code: string): Promise<KrStockFundamentals> {
  const toNum = (s: unknown): number => {
    if (typeof s !== 'string') return 0;
    const n = parseFloat(s.replace(/,/g, '').replace(/\+/g, ''));
    return isNaN(n) ? 0 : n;
  };

  const [trendRes, annualRes, basicRes] = await Promise.all([
    fetch(
      `https://m.stock.naver.com/front-api/stock/domestic/trend?code=${code}&marketType=KRX&pageSize=1`,
      { headers: MOBILE_HEADERS, next: { revalidate: 0 } },
    ).then(r => r.json()).catch(() => null),

    fetch(
      `https://m.stock.naver.com/api/stock/${code}/finance/annual`,
      { headers: MOBILE_HEADERS, next: { revalidate: 0 } },
    ).then(r => r.json()).catch(() => null),

    fetch(
      `https://m.stock.naver.com/api/stock/${code}/basic`,
      { headers: MOBILE_HEADERS, next: { revalidate: 0 } },
    ).then(r => r.json()).catch(() => null),
  ]);

  // ── 투자자 동향 ──────────────────────────────────────────────────────────
  let investorTrend: KrInvestorTrend | null = null;
  const r0 = trendRes?.result?.[0];
  if (r0) {
    investorTrend = {
      date:          r0.bizdate ?? '',
      foreign:       toNum(r0.foreignerPureBuyQuant),
      institutional: toNum(r0.organPureBuyQuant),
      individual:    toNum(r0.individualPureBuyQuant),
    };
  }

  // ── PER · 실적 ──────────────────────────────────────────────────────────
  let per: number | null = null;
  let latestEarnings: KrEarnings | null = null;
  let prevEarnings: KrEarnings | null = null;

  const fi = annualRes?.financeInfo;
  if (fi) {
    const titleList: Array<{ isConsensus: string; title: string; key: string }> =
      fi.trTitleList ?? [];
    const rowList: Array<{ title: string; columns: Record<string, { value: string }> }> =
      fi.rowList ?? [];

    // 실제 공시 기간만 (isConsensus = "N"), 최신 2개
    const actualPeriods = titleList.filter(t => t.isConsensus === 'N');
    if (actualPeriods.length >= 2) {
      const latest = actualPeriods[actualPeriods.length - 1];
      const prev   = actualPeriods[actualPeriods.length - 2];

      const getVal = (title: string, key: string): number => {
        const row = rowList.find(r => r.title === title);
        const v = row?.columns?.[key]?.value;
        return v && v !== '-' ? toNum(v) : 0;
      };

      latestEarnings = {
        period: latest.title,
        revenue: getVal('매출액', latest.key),
        operatingProfit: getVal('영업이익', latest.key),
      };
      prevEarnings = {
        period: prev.title,
        revenue: getVal('매출액', prev.key),
        operatingProfit: getVal('영업이익', prev.key),
      };

      const perVal = getVal('PER', latest.key);
      if (perVal > 0 && perVal < 10000) per = perVal;
    }
  }

  // ── 회사 개요 ────────────────────────────────────────────────────────────
  let companySummary: string[] | null = null;
  const cs = annualRes?.corporationSummary;
  if (cs) {
    const lines = [cs.comment1, cs.comment2, cs.comment3]
      .filter((s: unknown): s is string => typeof s === 'string' && s.trim().length > 0);
    if (lines.length > 0) companySummary = lines;
  }

  // ── 현재가 ───────────────────────────────────────────────────────────────
  let livePrice: number | null = null;
  let liveChangeRate: number | null = null;
  if (basicRes) {
    const p = toNum(basicRes.closePrice);
    const cr = toNum(basicRes.fluctuationsRatio);
    if (p > 0) { livePrice = p; liveChangeRate = cr; }
  }

  return { per, investorTrend, latestEarnings, prevEarnings, companySummary, livePrice, liveChangeRate };
}
