/**
 * NAVER Finance scraper — server-side only, never import on the client.
 *
 * NAVER Finance HTML is EUC-KR encoded. We fetch as ArrayBuffer and decode
 * with TextDecoder('euc-kr') to handle the encoding correctly.
 */

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml',
  'Accept-Language': 'ko-KR,ko;q=0.9',
  Referer: 'https://finance.naver.com/',
};

const SECTOR_LIST_URL =
  'https://finance.naver.com/sise/sise_group.naver?type=upjong';
const SECTOR_DETAIL_URL =
  'https://finance.naver.com/sise/sise_group_detail.naver?type=upjong&no=';

// 외국인/기관 순매수·순매도 상위 랭킹 — iframe 버전 (실제 HTML 테이블 포함)
// investor_gubun: 9000 = 외국인, 1000 = 기관
// type: buy = 순매수 상위, sell = 순매도 상위
// sosok: 01 = KOSPI, 02 = KOSDAQ
const DEAL_RANK_IFRAME =
  'https://finance.naver.com/sise/sise_deal_rank_iframe.naver';

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
 * Fetch a NAVER Finance page as EUC-KR decoded HTML string.
 */
async function fetchEucKrPage(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: HEADERS,
    next: { revalidate: 0 },
  });
  if (!res.ok) {
    throw new Error(`NAVER Finance fetch failed: HTTP ${res.status} for ${url}`);
  }
  const buffer = await res.arrayBuffer();
  const html = new TextDecoder('euc-kr').decode(buffer);
  return html;
}

/**
 * Parse a number string from NAVER Finance HTML.
 * Strips inner HTML tags, Korean comma formatting, %, ▲, ▼ symbols.
 */
function parseNaverNumber(raw: string): number {
  // Strip any remaining HTML tags
  let s = raw.replace(/<[^>]+>/g, ' ').trim();
  // ▲ = positive (remove), ▼ = negative (mark with leading -)
  s = s.replace(/▲/g, '').replace(/▼\s*/g, '-').trim();
  // Strip commas and % signs
  s = s.replace(/,/g, '').replace(/%/g, '').trim();
  // Normalise double-minus
  s = s.replace(/--/g, '-');
  // Find first number (with optional leading sign)
  const match = s.match(/[-+]?\d+\.?\d*/);
  if (!match) return 0;
  const n = parseFloat(match[0]);
  return isNaN(n) ? 0 : n;
}

// ── Sector list parser ─────────────────────────────────────────────────────────

interface SectorEntry {
  no: string;
  name: string;
  changeRate: number;
}

/**
 * Parse the sector list HTML.
 *
 * Each sector row looks like:
 *   <a href="sise_group_detail.naver?type=upjong&amp;no=4">의약품</a>
 * The change rate appears in a nearby <td class="number"> cell.
 *
 * Strategy: extract the anchor tags with their sector numbers/names, then
 * walk the surrounding text to find associated change-rate values.
 */
function parseSectorList(html: string): SectorEntry[] {
  const sectors: SectorEntry[] = [];

  // Match every table row block that contains a sector link
  // Each row: <tr> ... <a href="...&no=NNN">NAME</a> ... <td ...>NUMBER</td> ...
  const rowRegex =
    /<tr[^>]*>([\s\S]*?)<\/tr>/gi;

  // Anchor pattern — actual HTML uses bare & (not &amp;)
  const anchorRegex =
    /sise_group_detail\.naver\?type=upjong&(?:amp;)?no=(\d+)"[^>]*>([^<]+)<\/a>/;

  // <td class="number"> — content may contain nested <span>/<em> tags
  const tdNumberRegex = /<td[^>]*class="number"[^>]*>([\s\S]*?)<\/td>/gi;

  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const rowHtml = rowMatch[1];
    const anchor = anchorRegex.exec(rowHtml);
    if (!anchor) continue;

    const no = anchor[1];
    const name = anchor[2].trim();

    // Collect all number cells in this row, stripping inner tags
    const nums: string[] = [];
    let tdMatch: RegExpExecArray | null;
    const tdClone = new RegExp(tdNumberRegex.source, 'gi');
    while ((tdMatch = tdClone.exec(rowHtml)) !== null) {
      const inner = tdMatch[1].replace(/<[^>]+>/g, ' ').trim();
      nums.push(inner);
    }

    // NAVER upjong list row layout (columns):
    // 업종명 | 현재 등락율 | 전일 등락율 | ... (varies by page version)
    // The first non-empty number cell after the name link is the change rate.
    let changeRate = 0;
    for (const raw of nums) {
      const stripped = raw.replace(/[▲▼%,+\s]/g, '');
      if (stripped === '' || stripped === '-') continue;
      changeRate = parseNaverNumber(raw);
      break;
    }

    sectors.push({ no, name, changeRate });
  }

  return sectors;
}

// ── Sector detail parser ───────────────────────────────────────────────────────

/**
 * Parse the sector detail HTML for a list of stocks.
 *
 * Stock name row:
 *   <td class="name"><a href="/item/main.naver?code=XXXXXX">종목명</a></td>
 *
 * Following <td class="number"> cells (in order within the same <tr>):
 *   현재가 | 전일비(등락액) | 등락률 | ...
 */
function parseSectorStocks(html: string): KrStock[] {
  const stocks: KrStock[] = [];

  // Match rows that contain a stock name cell
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const nameRegex =
    /class="name"[^>]*>[\s\S]*?code=([A-Z0-9]{6})"[^>]*>([^<]+)<\/a>/i;
  const tdNumberRegex = /<td[^>]*class="number"[^>]*>([\s\S]*?)<\/td>/gi;

  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const rowHtml = rowMatch[1];
    const nameMatch = nameRegex.exec(rowHtml);
    if (!nameMatch) continue;

    const code = nameMatch[1];
    const name = nameMatch[2].trim();

    // Extract all number cells in order
    const nums: string[] = [];
    let tdMatch: RegExpExecArray | null;
    const tdClone = new RegExp(tdNumberRegex.source, 'gi');
    while ((tdMatch = tdClone.exec(rowHtml)) !== null) {
      // Strip inner tags (e.g. <span>) to get plain text
      const inner = tdMatch[1].replace(/<[^>]+>/g, '').trim();
      nums.push(inner);
    }

    if (nums.length < 2) continue;

    // Column order on sise_group_detail: 현재가 | 전일비 | 등락률 | ...
    const price = parseNaverNumber(nums[0]);
    const changeAmount = parseNaverNumber(nums[1]);
    const changeRate = nums[2] !== undefined ? parseNaverNumber(nums[2]) : 0;

    if (price === 0 && changeAmount === 0) continue; // likely a header/empty row

    stocks.push({ code, name, price, changeRate, changeAmount });
  }

  return stocks;
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Returns the top N Korean sectors (sorted by changeRate descending),
 * each populated with their top 5 stocks also sorted by changeRate descending.
 *
 * On any per-sector fetch/parse error, that sector will have an empty stocks array.
 */
export async function getTopKrSectorsWithStocks(
  topN: number,
): Promise<KrSectorWithStocks[]> {
  // Step 1: fetch and parse the sector list
  const listHtml = await fetchEucKrPage(SECTOR_LIST_URL);
  const allSectors = parseSectorList(listHtml);

  // Sort by change rate descending (highest gainers first)
  const topSectors = allSectors
    .sort((a, b) => b.changeRate - a.changeRate)
    .slice(0, topN);

  // Step 2: fetch each sector's stock list in parallel
  const stocksResults = await Promise.all(
    topSectors.map(async (sector) => {
      try {
        const detailHtml = await fetchEucKrPage(
          `${SECTOR_DETAIL_URL}${sector.no}`,
        );
        const allStocks = parseSectorStocks(detailHtml);
        const top10 = allStocks
          .sort((a, b) => b.changeRate - a.changeRate)
          .slice(0, 10);
        return top10;
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

/**
 * sise_deal_rank_iframe.naver 페이지 파서.
 *
 * 페이지에는 당일/전일 등 여러 <table class="type_1"> 블록이 있고,
 * 각 블록의 행 구조:
 *   col[0]: 종목명 (anchor with code=XXXXXX)
 *   col[1]: 순매수수량 (천주)
 *   col[2]: 순매수금액 (백만원)
 *   col[3]: 당일거래량
 *
 * 중복 코드는 마지막 등장(당일 데이터)을 우선 사용.
 */
function parseDealRankIframe(html: string): TradeStock[] {
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const nameRegex = /href="[^"]*code=([0-9]{6})"[^>]*>\s*([^<]+)\s*<\/a>/i;
  const tdAllRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;

  // code → stock map (last occurrence = 당일 데이터)
  const map = new Map<string, TradeStock>();
  let rank = 1;

  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const rowHtml = rowMatch[1];

    const nameMatch = nameRegex.exec(rowHtml);
    if (!nameMatch) continue;

    const code = nameMatch[1];
    const name = nameMatch[2].trim();
    if (!code || !name) continue;

    const rawCells: string[] = [];
    let tdMatch: RegExpExecArray | null;
    const tdClone = new RegExp(tdAllRegex.source, 'gi');
    while ((tdMatch = tdClone.exec(rowHtml)) !== null) {
      rawCells.push(tdMatch[1].replace(/<[^>]+>/g, '').trim());
    }

    // 최소 3개 (종목명, 수량, 금액)
    if (rawCells.length < 3) continue;

    // col[1]=순매수수량(천주) → ×1000 = 실제 주수
    // col[2]=순매수금액(백만원)
    // col[3]=당일거래량 (없으면 0)
    const netVolume    = parseNaverNumber(rawCells[1]) * 1000;
    const netAmount    = parseNaverNumber(rawCells[2]);
    const tradingVolume = rawCells[3] !== undefined ? parseNaverNumber(rawCells[3]) : 0;

    if (netVolume === 0 && netAmount === 0) continue;

    map.set(code, { rank: rank++, code, name, price: 0, changeRate: 0, changeAmount: 0, netVolume, netAmount, tradingVolume });
  }

  return Array.from(map.values());
}

interface StockPriceInfo {
  price: number;
  changeRate: number;
  changeAmount: number;
}

/**
 * NAVER 모바일 API로 종목 가격 정보를 병렬 fetch.
 * 실패한 종목은 0으로 채워 반환.
 */
async function fetchStockPrices(codes: string[]): Promise<Map<string, StockPriceInfo>> {
  const toNum = (v: unknown): number => {
    if (typeof v === 'number') return v;
    if (typeof v === 'string') {
      const n = parseFloat(v.replace(/,/g, '').replace(/[+%▲]/g, '').replace(/▼/g, '-'));
      return isNaN(n) ? 0 : n;
    }
    return 0;
  };

  const entries = await Promise.all(
    codes.map(async (code): Promise<[string, StockPriceInfo]> => {
      try {
        const res = await fetch(`https://m.stock.naver.com/api/stock/${code}/basic`, {
          headers: {
            'User-Agent': HEADERS['User-Agent'],
            Accept: 'application/json',
            Referer: 'https://m.stock.naver.com/',
          },
          next: { revalidate: 0 },
        });
        if (!res.ok) return [code, { price: 0, changeRate: 0, changeAmount: 0 }];

        const json = await res.json() as Record<string, unknown>;
        return [code, {
          price: toNum(json.closePrice),
          changeAmount: toNum(json.compareToPreviousClosePrice),
          changeRate: toNum(json.fluctuationsRatio),
        }];
      } catch {
        return [code, { price: 0, changeRate: 0, changeAmount: 0 }];
      }
    }),
  );

  return new Map(entries);
}

/**
 * iframe URL로 순매수/순매도 상위 30개(ETF·선물·스팩 제외)를 반환.
 * 페이지가 전체 랭킹을 1회 로드하므로 페이지네이션 불필요.
 */
async function fetchTradeRankingTop30(
  investorType: 'frgn' | 'org',
  direction: 'buy' | 'sell',
): Promise<TradeStock[]> {
  const investorGubun = investorType === 'frgn' ? '9000' : '1000';
  const url = `${DEAL_RANK_IFRAME}?sosok=01&investor_gubun=${investorGubun}&type=${direction}`;

  const html = await fetchEucKrPage(url);
  const all = parseDealRankIframe(html);

  const filtered = all
    .filter(s => !isNonStock(s.name))
    .slice(0, 30);

  // 종가/등락율/등락액 병렬 fetch
  const priceMap = await fetchStockPrices(filtered.map(s => s.code));

  return filtered.map((s, i) => {
    const p = priceMap.get(s.code) ?? { price: 0, changeRate: 0, changeAmount: 0 };
    return { ...s, rank: i + 1, price: p.price, changeRate: p.changeRate, changeAmount: p.changeAmount };
  });
}

/**
 * Returns foreign investor (외국인) net-buy top 30 and net-sell top 30
 * for KOSPI stocks, scraped live from NAVER Finance.
 */
export async function getForeignTradeRanking(): Promise<InvestorTradeData> {
  const [buyTop, sellTop] = await Promise.all([
    fetchTradeRankingTop30('frgn', 'buy'),
    fetchTradeRankingTop30('frgn', 'sell'),
  ]);
  return { buyTop, sellTop };
}

/**
 * Returns institutional investor (기관) net-buy top 30 and net-sell top 30
 * for KOSPI stocks, scraped live from NAVER Finance.
 */
export async function getInstitutionalTradeRanking(): Promise<InvestorTradeData> {
  const [buyTop, sellTop] = await Promise.all([
    fetchTradeRankingTop30('org', 'buy'),
    fetchTradeRankingTop30('org', 'sell'),
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
  'User-Agent': HEADERS['User-Agent'],
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
