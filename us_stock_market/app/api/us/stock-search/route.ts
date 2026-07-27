import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface YahooQuote {
  symbol: string;
  shortname?: string;
  longname?: string;
  quoteType?: string;
}

interface SearchResult {
  code: string;
  name: string;
}

// 한글 회사명 → 미국 상장 티커 매핑
const KR_NAME_MAP: Array<{ keywords: string[]; symbol: string; name: string }> = [
  // 빅테크
  { keywords: ['애플'], symbol: 'AAPL', name: 'Apple Inc.' },
  { keywords: ['마이크로소프트', '마소'], symbol: 'MSFT', name: 'Microsoft Corp.' },
  { keywords: ['구글', '알파벳'], symbol: 'GOOGL', name: 'Alphabet Inc.' },
  { keywords: ['아마존'], symbol: 'AMZN', name: 'Amazon.com Inc.' },
  { keywords: ['엔비디아'], symbol: 'NVDA', name: 'NVIDIA Corp.' },
  { keywords: ['테슬라'], symbol: 'TSLA', name: 'Tesla Inc.' },
  { keywords: ['메타', '페이스북'], symbol: 'META', name: 'Meta Platforms Inc.' },
  { keywords: ['넷플릭스'], symbol: 'NFLX', name: 'Netflix Inc.' },
  // 반도체
  { keywords: ['AMD', '에이엠디'], symbol: 'AMD', name: 'Advanced Micro Devices' },
  { keywords: ['인텔'], symbol: 'INTC', name: 'Intel Corp.' },
  { keywords: ['퀄컴'], symbol: 'QCOM', name: 'Qualcomm Inc.' },
  { keywords: ['브로드컴'], symbol: 'AVGO', name: 'Broadcom Inc.' },
  { keywords: ['TSMC', '대만반도체', '티에스엠씨'], symbol: 'TSM', name: 'Taiwan Semiconductor' },
  { keywords: ['마이크론'], symbol: 'MU', name: 'Micron Technology' },
  { keywords: ['어플라이드머티리얼', '어플라이드'], symbol: 'AMAT', name: 'Applied Materials' },
  { keywords: ['ASML', '에이에스엠엘'], symbol: 'ASML', name: 'ASML Holding' },
  { keywords: ['아암', 'ARM'], symbol: 'ARM', name: 'Arm Holdings' },
  // 금융
  { keywords: ['JP모건', '제이피모건', '제이피'], symbol: 'JPM', name: 'JPMorgan Chase' },
  { keywords: ['뱅크오브아메리카', '뱅크오브', 'BOA'], symbol: 'BAC', name: 'Bank of America' },
  { keywords: ['골드만삭스', '골드만'], symbol: 'GS', name: 'Goldman Sachs' },
  { keywords: ['모건스탠리'], symbol: 'MS', name: 'Morgan Stanley' },
  { keywords: ['버크셔', '버크셔해서웨이'], symbol: 'BRK-B', name: 'Berkshire Hathaway' },
  { keywords: ['비자'], symbol: 'V', name: 'Visa Inc.' },
  { keywords: ['마스터카드'], symbol: 'MA', name: 'Mastercard Inc.' },
  { keywords: ['페이팔'], symbol: 'PYPL', name: 'PayPal Holdings' },
  { keywords: ['코인베이스'], symbol: 'COIN', name: 'Coinbase Global' },
  // 소비재·유통
  { keywords: ['월마트'], symbol: 'WMT', name: 'Walmart Inc.' },
  { keywords: ['코스트코'], symbol: 'COST', name: 'Costco Wholesale' },
  { keywords: ['홈디포'], symbol: 'HD', name: 'Home Depot' },
  { keywords: ['나이키'], symbol: 'NKE', name: 'Nike Inc.' },
  { keywords: ['스타벅스'], symbol: 'SBUX', name: 'Starbucks Corp.' },
  { keywords: ['맥도날드'], symbol: 'MCD', name: "McDonald's Corp." },
  { keywords: ['코카콜라'], symbol: 'KO', name: 'Coca-Cola Co.' },
  { keywords: ['펩시', '펩시코'], symbol: 'PEP', name: 'PepsiCo Inc.' },
  // 제약·바이오
  { keywords: ['존슨앤존슨', '존앤존', '존슨'], symbol: 'JNJ', name: 'Johnson & Johnson' },
  { keywords: ['화이자'], symbol: 'PFE', name: 'Pfizer Inc.' },
  { keywords: ['모더나'], symbol: 'MRNA', name: 'Moderna Inc.' },
  { keywords: ['일라이릴리', '릴리'], symbol: 'LLY', name: 'Eli Lilly' },
  { keywords: ['애브비'], symbol: 'ABBV', name: 'AbbVie Inc.' },
  { keywords: ['머크'], symbol: 'MRK', name: 'Merck & Co.' },
  // 에너지
  { keywords: ['엑손모빌', '엑슨'], symbol: 'XOM', name: 'Exxon Mobil' },
  { keywords: ['쉐브론'], symbol: 'CVX', name: 'Chevron Corp.' },
  // 미디어·엔터
  { keywords: ['디즈니'], symbol: 'DIS', name: 'Walt Disney Co.' },
  { keywords: ['컴캐스트'], symbol: 'CMCSA', name: 'Comcast Corp.' },
  { keywords: ['스포티파이'], symbol: 'SPOT', name: 'Spotify Technology' },
  // 소프트웨어·클라우드
  { keywords: ['세일즈포스'], symbol: 'CRM', name: 'Salesforce Inc.' },
  { keywords: ['어도비'], symbol: 'ADBE', name: 'Adobe Inc.' },
  { keywords: ['오라클'], symbol: 'ORCL', name: 'Oracle Corp.' },
  { keywords: ['서비스나우'], symbol: 'NOW', name: 'ServiceNow Inc.' },
  { keywords: ['팔로알토'], symbol: 'PANW', name: 'Palo Alto Networks' },
  { keywords: ['크라우드스트라이크'], symbol: 'CRWD', name: 'CrowdStrike Holdings' },
  { keywords: ['스노우플레이크'], symbol: 'SNOW', name: 'Snowflake Inc.' },
  { keywords: ['팔란티어'], symbol: 'PLTR', name: 'Palantir Technologies' },
  { keywords: ['줌'], symbol: 'ZM', name: 'Zoom Video' },
  // 모빌리티
  { keywords: ['우버'], symbol: 'UBER', name: 'Uber Technologies' },
  { keywords: ['에어비앤비'], symbol: 'ABNB', name: 'Airbnb Inc.' },
  { keywords: ['리비안'], symbol: 'RIVN', name: 'Rivian Automotive' },
  { keywords: ['루시드'], symbol: 'LCID', name: 'Lucid Group' },
  // 통신
  { keywords: ['AT&T', '에이티앤티'], symbol: 'T', name: 'AT&T Inc.' },
  { keywords: ['버라이즌'], symbol: 'VZ', name: 'Verizon Communications' },
  // 방산·항공
  { keywords: ['보잉'], symbol: 'BA', name: 'Boeing Co.' },
  { keywords: ['록히드마틴', '록히드'], symbol: 'LMT', name: 'Lockheed Martin' },
  // 중국 ADR
  { keywords: ['바이두'], symbol: 'BIDU', name: 'Baidu Inc.' },
  { keywords: ['알리바바'], symbol: 'BABA', name: 'Alibaba Group' },
  { keywords: ['징동', 'JD', '제이디'], symbol: 'JD', name: 'JD.com Inc.' },
  { keywords: ['핀둬둬', '테무'], symbol: 'PDD', name: 'PDD Holdings' },
  { keywords: ['니오'], symbol: 'NIO', name: 'NIO Inc.' },
  // 지수 ETF
  { keywords: ['S&P500', 'SPY', '스파이'], symbol: 'SPY', name: 'SPDR S&P 500 ETF' },
  { keywords: ['QQQ', '큐큐큐', '나스닥ETF'], symbol: 'QQQ', name: 'Invesco QQQ ETF' },
];

function searchKrNames(query: string): SearchResult[] {
  const q = query.toLowerCase().replace(/\s+/g, '');
  return KR_NAME_MAP
    .filter(item => item.keywords.some(kw => kw.toLowerCase().replace(/\s+/g, '').includes(q) || q.includes(kw.toLowerCase().replace(/\s+/g, ''))))
    .slice(0, 10)
    .map(item => ({ code: item.symbol, name: item.name }));
}

function hasKorean(str: string): boolean {
  return /[가-힣]/.test(str);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q')?.trim();

  if (!query || query.length === 0) {
    return NextResponse.json({ results: [] });
  }

  // 한글 포함 시 매핑 테이블에서 검색
  if (hasKorean(query)) {
    return NextResponse.json({ results: searchKrNames(query) });
  }

  // 영문/숫자 쿼리 → Yahoo Finance
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=10&newsCount=0&enableFuzzyQuery=true&enableNavLinks=false`,
      {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        next: { revalidate: 0 },
      },
    );

    if (!res.ok) return NextResponse.json({ results: [] });

    const data = (await res.json()) as { quotes?: YahooQuote[] };
    const results: SearchResult[] = (data?.quotes ?? [])
      .filter(q => q.quoteType === 'EQUITY' || q.quoteType === 'ETF')
      .slice(0, 10)
      .map(q => ({
        code: q.symbol,
        name: q.shortname ?? q.longname ?? q.symbol,
      }));

    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ results: [] });
  }
}
