import { DayData, Sector, Session, SessionType, Stock } from './types';

function st(ticker: string, nameKr: string, closePrice: number, chgPct: number): Stock {
  return { ticker, nameKr, closePrice, changePercent: chgPct,
           changeDollar: parseFloat((closePrice * chgPct / 100).toFixed(2)) };
}

function sec(id: string, nameKr: string, nameEn: string, chgPct: number, stocks: Stock[]): Sector {
  return { id, nameKr, nameEn, changePercent: chgPct, stocks };
}

function sess(type: SessionType, labelKr: string, sectors: Sector[]): Session {
  return { type, labelKr, sectors: [...sectors].sort((a, b) => b.changePercent - a.changePercent) };
}

// ── 2026-05-08 (목) — 강세장, 환율 1,464.6 ───────────────────────────────────

const d0508: DayData = {
  date: '2026-05-08', dayOfWeek: '목', exchangeRate: 1464.6,
  sessions: [
    sess('daymarket', '데이마켓', [
      sec('energy',      '에너지',    'Energy',                   0.78, [
        st('XOM',  '엑손모빌',        147.70,  1.12),
        st('CVX',  '셰브론',          183.20,  0.89),
        st('COP',  '코노코필립스',    114.80,  0.55),
      ]),
      sec('healthcare',  '헬스케어',  'Healthcare',               0.45, [
        st('LLY',  '일라이릴리',      961.20,  0.78),
        st('UNH',  '유나이티드헬스',  374.80,  0.41),
        st('JNJ',  '존슨앤드존슨',    222.50,  0.22),
      ]),
      sec('technology',  '기술',      'Technology',               0.31, [
        st('NVDA', '엔비디아',        215.40,  0.52),
        st('AAPL', '애플',            287.30,  0.28),
        st('META', '메타',            605.40,  0.19),
      ]),
      sec('industrials', '산업재',    'Industrials',              0.18, [
        st('CAT',  '캐터필러',        890.40,  0.31),
        st('HON',  '하니웰',          216.80,  0.18),
        st('UPS',  'UPS',             100.30,  0.08),
      ]),
      sec('staples',     '필수소비재','Consumer Staples',          0.12, [
        st('PG',   'P&G',             146.70,  0.21),
        st('KO',   '코카콜라',         73.60,  0.14),
        st('WMT',  '월마트',          130.80,  0.05),
      ]),
      sec('financials',  '금융',      'Financials',              -0.18, [
        st('JPM',  'JP모건',          306.20, -0.12),
        st('BAC',  '뱅크오브아메리카', 53.60, -0.21),
        st('GS',   '골드만삭스',      872.10, -0.29),
      ]),
      sec('materials',   '소재',      'Materials',               -0.25, [
        st('LIN',  '린데',            521.30, -0.18),
        st('APD',  '에어프로덕츠',    292.40, -0.28),
        st('FCX',  '프리포트맥모란',   49.20, -0.41),
      ]),
      sec('consumer',    '경기소비재','Consumer Discretionary',  -0.42, [
        st('AMZN', '아마존',          271.20, -0.31),
        st('TSLA', '테슬라',          409.05, -0.68),
        st('NKE',  '나이키',           44.40, -0.24),
      ]),
      sec('utilities',   '유틸리티',  'Utilities',               -0.61, [
        st('NEE',  '넥스트에라에너지',  94.20, -0.48),
        st('DUK',  '듀크에너지',       116.20, -0.62),
        st('SO',   '서던컴퍼니',        91.50, -0.78),
      ]),
      sec('realestate',  '부동산',    'Real Estate',             -0.75, [
        st('AMT',  '아메리칸타워',    179.80, -0.58),
        st('PLD',  '프롤로지스',      142.90, -0.79),
        st('SPG',  '사이먼프라퍼티',  174.60, -0.91),
      ]),
    ]),

    sess('premarket', '프리마켓', [
      sec('technology',  '기술',      'Technology',               1.82, [
        st('NVDA', '엔비디아',        215.40,  3.41),
        st('META', '메타',            605.40,  1.95),
        st('AAPL', '애플',            287.30,  1.12),
      ]),
      sec('energy',      '에너지',    'Energy',                   1.24, [
        st('XOM',  '엑손모빌',        147.70,  1.78),
        st('COP',  '코노코필립스',    114.80,  1.45),
        st('CVX',  '셰브론',          183.20,  0.88),
      ]),
      sec('healthcare',  '헬스케어',  'Healthcare',               0.67, [
        st('LLY',  '일라이릴리',      961.20,  1.10),
        st('UNH',  '유나이티드헬스',  374.80,  0.62),
        st('JNJ',  '존슨앤드존슨',    222.50,  0.38),
      ]),
      sec('industrials', '산업재',    'Industrials',              0.44, [
        st('CAT',  '캐터필러',        890.40,  0.72),
        st('HON',  '하니웰',          216.80,  0.41),
        st('UPS',  'UPS',             100.30,  0.22),
      ]),
      sec('materials',   '소재',      'Materials',                0.28, [
        st('FCX',  '프리포트맥모란',   49.20,  0.51),
        st('LIN',  '린데',            521.30,  0.31),
        st('APD',  '에어프로덕츠',    292.40,  0.18),
      ]),
      sec('consumer',    '경기소비재','Consumer Discretionary',  -0.33, [
        st('AMZN', '아마존',          271.20, -0.21),
        st('NKE',  '나이키',           44.40, -0.35),
        st('TSLA', '테슬라',          409.05, -0.71),
      ]),
      sec('staples',     '필수소비재','Consumer Staples',         -0.41, [
        st('PG',   'P&G',             146.70, -0.28),
        st('WMT',  '월마트',          130.80, -0.44),
        st('KO',   '코카콜라',         73.60, -0.58),
      ]),
      sec('financials',  '금융',      'Financials',              -0.58, [
        st('JPM',  'JP모건',          306.20, -0.38),
        st('BAC',  '뱅크오브아메리카', 53.60, -0.62),
        st('GS',   '골드만삭스',      872.10, -0.95),
      ]),
      sec('utilities',   '유틸리티',  'Utilities',               -0.72, [
        st('NEE',  '넥스트에라에너지',  94.20, -0.55),
        st('DUK',  '듀크에너지',       116.20, -0.78),
        st('SO',   '서던컴퍼니',        91.50, -0.91),
      ]),
      sec('realestate',  '부동산',    'Real Estate',             -0.89, [
        st('AMT',  '아메리칸타워',    179.80, -0.72),
        st('PLD',  '프롤로지스',      142.90, -0.94),
        st('SPG',  '사이먼프라퍼티',  174.60, -1.08),
      ]),
    ]),

    sess('regular', '정규장', [
      sec('technology',  '기술',      'Technology',               2.84, [
        st('NVDA', '엔비디아',        215.40,  5.23),
        st('AAPL', '애플',            287.30,  2.11),
        st('META', '메타',            605.40,  1.95),
      ]),
      sec('energy',      '에너지',    'Energy',                   1.67, [
        st('XOM',  '엑손모빌',        147.70,  2.45),
        st('CVX',  '셰브론',          183.20,  1.89),
        st('COP',  '코노코필립스',    114.80,  1.34),
      ]),
      sec('healthcare',  '헬스케어',  'Healthcare',               0.92, [
        st('LLY',  '일라이릴리',      961.20,  1.45),
        st('UNH',  '유나이티드헬스',  374.80,  1.12),
        st('JNJ',  '존슨앤드존슨',    222.50,  0.55),
      ]),
      sec('industrials', '산업재',    'Industrials',              0.65, [
        st('CAT',  '캐터필러',        890.40,  1.08),
        st('HON',  '하니웰',          216.80,  0.62),
        st('UPS',  'UPS',             100.30,  0.38),
      ]),
      sec('staples',     '필수소비재','Consumer Staples',          0.31, [
        st('WMT',  '월마트',          130.80,  0.48),
        st('PG',   'P&G',             146.70,  0.32),
        st('KO',   '코카콜라',         73.60,  0.18),
      ]),
      sec('financials',  '금융',      'Financials',              -0.43, [
        st('JPM',  'JP모건',          306.20, -0.21),
        st('BAC',  '뱅크오브아메리카', 53.60, -0.58),
        st('GS',   '골드만삭스',      872.10, -0.89),
      ]),
      sec('materials',   '소재',      'Materials',               -0.58, [
        st('LIN',  '린데',            521.30, -0.42),
        st('APD',  '에어프로덕츠',    292.40, -0.61),
        st('FCX',  '프리포트맥모란',   49.20, -0.88),
      ]),
      sec('consumer',    '경기소비재','Consumer Discretionary',  -1.25, [
        st('AMZN', '아마존',          271.20, -0.95),
        st('TSLA', '테슬라',          409.05, -2.34),
        st('NKE',  '나이키',           44.40, -0.67),
      ]),
      sec('utilities',   '유틸리티',  'Utilities',               -1.44, [
        st('NEE',  '넥스트에라에너지',  94.20, -1.12),
        st('DUK',  '듀크에너지',       116.20, -1.48),
        st('SO',   '서던컴퍼니',        91.50, -1.78),
      ]),
      sec('realestate',  '부동산',    'Real Estate',             -1.62, [
        st('AMT',  '아메리칸타워',    179.80, -1.28),
        st('PLD',  '프롤로지스',      142.90, -1.71),
        st('SPG',  '사이먼프라퍼티',  174.60, -1.94),
      ]),
    ]),

    sess('aftermarket', '애프터마켓', [
      sec('consumer',    '경기소비재','Consumer Discretionary',   1.52, [
        st('AMZN', '아마존',          271.20,  2.18),
        st('NKE',  '나이키',           44.40,  1.34),
        st('TSLA', '테슬라',          409.05,  0.95),
      ]),
      sec('technology',  '기술',      'Technology',               0.88, [
        st('META', '메타',            605.40,  1.42),
        st('NVDA', '엔비디아',        215.40,  0.91),
        st('AAPL', '애플',            287.30,  0.44),
      ]),
      sec('industrials', '산업재',    'Industrials',              0.42, [
        st('CAT',  '캐터필러',        890.40,  0.68),
        st('HON',  '하니웰',          216.80,  0.41),
        st('UPS',  'UPS',             100.30,  0.22),
      ]),
      sec('staples',     '필수소비재','Consumer Staples',          0.21, [
        st('WMT',  '월마트',          130.80,  0.32),
        st('PG',   'P&G',             146.70,  0.21),
        st('KO',   '코카콜라',         73.60,  0.12),
      ]),
      sec('materials',   '소재',      'Materials',                0.08, [
        st('FCX',  '프리포트맥모란',   49.20,  0.14),
        st('LIN',  '린데',            521.30,  0.08),
        st('APD',  '에어프로덕츠',    292.40,  0.04),
      ]),
      sec('energy',      '에너지',    'Energy',                  -0.31, [
        st('CVX',  '셰브론',          183.20, -0.18),
        st('XOM',  '엑손모빌',        147.70, -0.35),
        st('COP',  '코노코필립스',    114.80, -0.52),
      ]),
      sec('healthcare',  '헬스케어',  'Healthcare',              -0.47, [
        st('JNJ',  '존슨앤드존슨',    222.50, -0.28),
        st('UNH',  '유나이티드헬스',  374.80, -0.51),
        st('LLY',  '일라이릴리',      961.20, -0.72),
      ]),
      sec('financials',  '금융',      'Financials',              -0.82, [
        st('BAC',  '뱅크오브아메리카', 53.60, -0.58),
        st('JPM',  'JP모건',          306.20, -0.79),
        st('GS',   '골드만삭스',      872.10, -1.18),
      ]),
      sec('utilities',   '유틸리티',  'Utilities',               -0.95, [
        st('NEE',  '넥스트에라에너지',  94.20, -0.72),
        st('DUK',  '듀크에너지',       116.20, -0.98),
        st('SO',   '서던컴퍼니',        91.50, -1.18),
      ]),
      sec('realestate',  '부동산',    'Real Estate',             -1.11, [
        st('PLD',  '프롤로지스',      142.90, -0.88),
        st('AMT',  '아메리칸타워',    179.80, -1.14),
        st('SPG',  '사이먼프라퍼티',  174.60, -1.32),
      ]),
    ]),
  ],
};

// ── 2026-05-07 (수) — 혼조세, 환율 1,461.2 ───────────────────────────────────

const d0507: DayData = {
  date: '2026-05-07', dayOfWeek: '수', exchangeRate: 1461.2,
  sessions: [
    sess('daymarket', '데이마켓', [
      sec('financials',  '금융',      'Financials',               0.62, [
        st('JPM',  'JP모건',          308.40,  0.88),
        st('GS',   '골드만삭스',      876.40,  0.71),
        st('BAC',  '뱅크오브아메리카', 54.10,  0.44),
      ]),
      sec('consumer',    '경기소비재','Consumer Discretionary',   0.28, [
        st('AMZN', '아마존',          272.80,  0.45),
        st('NKE',  '나이키',           44.80,  0.31),
        st('TSLA', '테슬라',          411.60,  0.12),
      ]),
      sec('industrials', '산업재',    'Industrials',              0.15, [
        st('CAT',  '캐터필러',        894.80,  0.24),
        st('HON',  '하니웰',          218.20,  0.14),
        st('UPS',  'UPS',             100.90,  0.08),
      ]),
      sec('materials',   '소재',      'Materials',                0.08, [
        st('FCX',  '프리포트맥모란',   49.60,  0.14),
        st('LIN',  '린데',            524.60,  0.08),
        st('APD',  '에어프로덕츠',    294.20,  0.04),
      ]),
      sec('staples',     '필수소비재','Consumer Staples',         -0.05, [
        st('KO',   '코카콜라',         74.10, -0.04),
        st('PG',   'P&G',             147.40, -0.06),
        st('WMT',  '월마트',          131.60, -0.08),
      ]),
      sec('technology',  '기술',      'Technology',              -0.15, [
        st('AAPL', '애플',            288.20, -0.08),
        st('META', '메타',            608.20, -0.18),
        st('NVDA', '엔비디아',        216.80, -0.31),
      ]),
      sec('energy',      '에너지',    'Energy',                  -0.34, [
        st('CVX',  '셰브론',          184.10, -0.22),
        st('XOM',  '엑손모빌',        148.40, -0.38),
        st('COP',  '코노코필립스',    115.60, -0.51),
      ]),
      sec('utilities',   '유틸리티',  'Utilities',               -0.42, [
        st('NEE',  '넥스트에라에너지',  94.80, -0.32),
        st('DUK',  '듀크에너지',       117.40, -0.44),
        st('SO',   '서던컴퍼니',        92.30, -0.56),
      ]),
      sec('healthcare',  '헬스케어',  'Healthcare',              -0.51, [
        st('JNJ',  '존슨앤드존슨',    223.80, -0.35),
        st('UNH',  '유나이티드헬스',  376.20, -0.54),
        st('LLY',  '일라이릴리',      964.50, -0.72),
      ]),
      sec('realestate',  '부동산',    'Real Estate',             -0.68, [
        st('AMT',  '아메리칸타워',    180.60, -0.51),
        st('PLD',  '프롤로지스',      143.60, -0.72),
        st('SPG',  '사이먼프라퍼티',  176.80, -0.88),
      ]),
    ]),

    sess('premarket', '프리마켓', [
      sec('healthcare',  '헬스케어',  'Healthcare',               1.38, [
        st('LLY',  '일라이릴리',      964.50,  2.21),
        st('UNH',  '유나이티드헬스',  376.20,  1.18),
        st('JNJ',  '존슨앤드존슨',    223.80,  0.62),
      ]),
      sec('financials',  '금융',      'Financials',               0.91, [
        st('GS',   '골드만삭스',      876.40,  1.44),
        st('JPM',  'JP모건',          308.40,  0.87),
        st('BAC',  '뱅크오브아메리카', 54.10,  0.58),
      ]),
      sec('consumer',    '경기소비재','Consumer Discretionary',   0.48, [
        st('NKE',  '나이키',           44.80,  0.72),
        st('AMZN', '아마존',          272.80,  0.51),
        st('TSLA', '테슬라',          411.60,  0.24),
      ]),
      sec('staples',     '필수소비재','Consumer Staples',          0.22, [
        st('WMT',  '월마트',          131.60,  0.34),
        st('PG',   'P&G',             147.40,  0.22),
        st('KO',   '코카콜라',         74.10,  0.12),
      ]),
      sec('industrials', '산업재',    'Industrials',              0.11, [
        st('CAT',  '캐터필러',        894.80,  0.18),
        st('HON',  '하니웰',          218.20,  0.11),
        st('UPS',  'UPS',             100.90,  0.06),
      ]),
      sec('technology',  '기술',      'Technology',              -0.38, [
        st('AAPL', '애플',            288.20, -0.25),
        st('META', '메타',            608.20, -0.41),
        st('NVDA', '엔비디아',        216.80, -0.62),
      ]),
      sec('materials',   '소재',      'Materials',               -0.51, [
        st('LIN',  '린데',            524.60, -0.38),
        st('APD',  '에어프로덕츠',    294.20, -0.54),
        st('FCX',  '프리포트맥모란',   49.60, -0.78),
      ]),
      sec('energy',      '에너지',    'Energy',                  -0.72, [
        st('COP',  '코노코필립스',    115.60, -0.55),
        st('CVX',  '셰브론',          184.10, -0.78),
        st('XOM',  '엑손모빌',        148.40, -0.98),
      ]),
      sec('utilities',   '유틸리티',  'Utilities',               -0.84, [
        st('NEE',  '넥스트에라에너지',  94.80, -0.64),
        st('DUK',  '듀크에너지',       117.40, -0.88),
        st('SO',   '서던컴퍼니',        92.30, -1.08),
      ]),
      sec('realestate',  '부동산',    'Real Estate',             -0.97, [
        st('AMT',  '아메리칸타워',    180.60, -0.78),
        st('PLD',  '프롤로지스',      143.60, -1.02),
        st('SPG',  '사이먼프라퍼티',  176.80, -1.18),
      ]),
    ]),

    sess('regular', '정규장', [
      sec('consumer',    '경기소비재','Consumer Discretionary',   1.78, [
        st('TSLA', '테슬라',          411.60,  3.12),
        st('AMZN', '아마존',          272.80,  1.58),
        st('NKE',  '나이키',           44.80,  0.92),
      ]),
      sec('technology',  '기술',      'Technology',               1.24, [
        st('NVDA', '엔비디아',        216.80,  2.18),
        st('META', '메타',            608.20,  1.31),
        st('AAPL', '애플',            288.20,  0.48),
      ]),
      sec('financials',  '금융',      'Financials',               0.58, [
        st('GS',   '골드만삭스',      876.40,  0.91),
        st('JPM',  'JP모건',          308.40,  0.62),
        st('BAC',  '뱅크오브아메리카', 54.10,  0.28),
      ]),
      sec('industrials', '산업재',    'Industrials',              0.35, [
        st('CAT',  '캐터필러',        894.80,  0.58),
        st('HON',  '하니웰',          218.20,  0.34),
        st('UPS',  'UPS',             100.90,  0.18),
      ]),
      sec('staples',     '필수소비재','Consumer Staples',          0.18, [
        st('WMT',  '월마트',          131.60,  0.28),
        st('PG',   'P&G',             147.40,  0.18),
        st('KO',   '코카콜라',         74.10,  0.10),
      ]),
      sec('energy',      '에너지',    'Energy',                  -0.48, [
        st('CVX',  '셰브론',          184.10, -0.31),
        st('XOM',  '엑손모빌',        148.40, -0.52),
        st('COP',  '코노코필립스',    115.60, -0.78),
      ]),
      sec('materials',   '소재',      'Materials',               -0.62, [
        st('LIN',  '린데',            524.60, -0.45),
        st('APD',  '에어프로덕츠',    294.20, -0.66),
        st('FCX',  '프리포트맥모란',   49.60, -0.94),
      ]),
      sec('healthcare',  '헬스케어',  'Healthcare',              -0.82, [
        st('JNJ',  '존슨앤드존슨',    223.80, -0.58),
        st('UNH',  '유나이티드헬스',  376.20, -0.87),
        st('LLY',  '일라이릴리',      964.50, -1.12),
      ]),
      sec('utilities',   '유틸리티',  'Utilities',               -0.95, [
        st('NEE',  '넥스트에라에너지',  94.80, -0.72),
        st('DUK',  '듀크에너지',       117.40, -1.01),
        st('SO',   '서던컴퍼니',        92.30, -1.24),
      ]),
      sec('realestate',  '부동산',    'Real Estate',             -1.08, [
        st('AMT',  '아메리칸타워',    180.60, -0.84),
        st('PLD',  '프롤로지스',      143.60, -1.14),
        st('SPG',  '사이먼프라퍼티',  176.80, -1.32),
      ]),
    ]),

    sess('aftermarket', '애프터마켓', [
      sec('technology',  '기술',      'Technology',               2.12, [
        st('NVDA', '엔비디아',        216.80,  3.88),
        st('META', '메타',            608.20,  1.94),
        st('AAPL', '애플',            288.20,  0.72),
      ]),
      sec('healthcare',  '헬스케어',  'Healthcare',               0.68, [
        st('LLY',  '일라이릴리',      964.50,  1.18),
        st('JNJ',  '존슨앤드존슨',    223.80,  0.55),
        st('UNH',  '유나이티드헬스',  376.20,  0.38),
      ]),
      sec('staples',     '필수소비재','Consumer Staples',          0.31, [
        st('PG',   'P&G',             147.40,  0.44),
        st('WMT',  '월마트',          131.60,  0.31),
        st('KO',   '코카콜라',         74.10,  0.18),
      ]),
      sec('industrials', '산업재',    'Industrials',              0.18, [
        st('CAT',  '캐터필러',        894.80,  0.28),
        st('HON',  '하니웰',          218.20,  0.18),
        st('UPS',  'UPS',             100.90,  0.10),
      ]),
      sec('materials',   '소재',      'Materials',               -0.12, [
        st('LIN',  '린데',            524.60, -0.09),
        st('APD',  '에어프로덕츠',    294.20, -0.13),
        st('FCX',  '프리포트맥모란',   49.60, -0.20),
      ]),
      sec('financials',  '금융',      'Financials',              -0.32, [
        st('BAC',  '뱅크오브아메리카', 54.10, -0.22),
        st('JPM',  'JP모건',          308.40, -0.35),
        st('GS',   '골드만삭스',      876.40, -0.48),
      ]),
      sec('consumer',    '경기소비재','Consumer Discretionary',  -0.61, [
        st('NKE',  '나이키',           44.80, -0.45),
        st('AMZN', '아마존',          272.80, -0.62),
        st('TSLA', '테슬라',          411.60, -0.88),
      ]),
      sec('energy',      '에너지',    'Energy',                  -0.94, [
        st('CVX',  '셰브론',          184.10, -0.71),
        st('XOM',  '엑손모빌',        148.40, -0.98),
        st('COP',  '코노코필립스',    115.60, -1.21),
      ]),
      sec('utilities',   '유틸리티',  'Utilities',               -1.08, [
        st('NEE',  '넥스트에라에너지',  94.80, -0.82),
        st('DUK',  '듀크에너지',       117.40, -1.14),
        st('SO',   '서던컴퍼니',        92.30, -1.38),
      ]),
      sec('realestate',  '부동산',    'Real Estate',             -1.22, [
        st('AMT',  '아메리칸타워',    180.60, -0.96),
        st('PLD',  '프롤로지스',      143.60, -1.28),
        st('SPG',  '사이먼프라퍼티',  176.80, -1.48),
      ]),
    ]),
  ],
};

// ── 2026-05-06 (화) — 약세장, 환율 1,458.3 ───────────────────────────────────

const d0506: DayData = {
  date: '2026-05-06', dayOfWeek: '화', exchangeRate: 1458.3,
  sessions: [
    sess('daymarket', '데이마켓', [
      sec('healthcare',  '헬스케어',  'Healthcare',               0.41, [
        st('UNH',  '유나이티드헬스',  378.60,  0.65),
        st('LLY',  '일라이릴리',      968.80,  0.48),
        st('JNJ',  '존슨앤드존슨',    225.20,  0.18),
      ]),
      sec('energy',      '에너지',    'Energy',                   0.22, [
        st('XOM',  '엑손모빌',        149.80,  0.35),
        st('COP',  '코노코필립스',    116.40,  0.25),
        st('CVX',  '셰브론',          185.60,  0.11),
      ]),
      sec('staples',     '필수소비재','Consumer Staples',          0.14, [
        st('KO',   '코카콜라',         74.80,  0.21),
        st('PG',   'P&G',             148.20,  0.14),
        st('WMT',  '월마트',          132.40,  0.08),
      ]),
      sec('industrials', '산업재',    'Industrials',              0.07, [
        st('HON',  '하니웰',          219.60,  0.10),
        st('CAT',  '캐터필러',        899.60,  0.07),
        st('UPS',  'UPS',             101.60,  0.04),
      ]),
      sec('materials',   '소재',      'Materials',               -0.08, [
        st('LIN',  '린데',            528.20, -0.06),
        st('APD',  '에어프로덕츠',    296.80, -0.09),
        st('FCX',  '프리포트맥모란',   50.10, -0.12),
      ]),
      sec('technology',  '기술',      'Technology',              -0.19, [
        st('AAPL', '애플',            289.80, -0.12),
        st('META', '메타',            612.10, -0.21),
        st('NVDA', '엔비디아',        218.20, -0.34),
      ]),
      sec('consumer',    '경기소비재','Consumer Discretionary',  -0.38, [
        st('NKE',  '나이키',           45.20, -0.28),
        st('AMZN', '아마존',          274.50, -0.41),
        st('TSLA', '테슬라',          414.20, -0.55),
      ]),
      sec('financials',  '금융',      'Financials',              -0.57, [
        st('BAC',  '뱅크오브아메리카', 54.80, -0.44),
        st('JPM',  'JP모건',          310.80, -0.58),
        st('GS',   '골드만삭스',      881.20, -0.79),
      ]),
      sec('utilities',   '유틸리티',  'Utilities',               -0.71, [
        st('NEE',  '넥스트에라에너지',  95.40, -0.54),
        st('DUK',  '듀크에너지',       118.60, -0.74),
        st('SO',   '서던컴퍼니',        93.10, -0.92),
      ]),
      sec('realestate',  '부동산',    'Real Estate',             -0.85, [
        st('AMT',  '아메리칸타워',    181.80, -0.66),
        st('PLD',  '프롤로지스',      144.40, -0.88),
        st('SPG',  '사이먼프라퍼티',  179.20, -1.04),
      ]),
    ]),

    sess('premarket', '프리마켓', [
      sec('energy',      '에너지',    'Energy',                   1.58, [
        st('COP',  '코노코필립스',    116.40,  2.31),
        st('XOM',  '엑손모빌',        149.80,  1.72),
        st('CVX',  '셰브론',          185.60,  0.98),
      ]),
      sec('technology',  '기술',      'Technology',               0.82, [
        st('NVDA', '엔비디아',        218.20,  1.45),
        st('META', '메타',            612.10,  0.88),
        st('AAPL', '애플',            289.80,  0.34),
      ]),
      sec('consumer',    '경기소비재','Consumer Discretionary',   0.38, [
        st('TSLA', '테슬라',          414.20,  0.62),
        st('AMZN', '아마존',          274.50,  0.38),
        st('NKE',  '나이키',           45.20,  0.18),
      ]),
      sec('industrials', '산업재',    'Industrials',              0.24, [
        st('CAT',  '캐터필러',        899.60,  0.38),
        st('HON',  '하니웰',          219.60,  0.22),
        st('UPS',  'UPS',             101.60,  0.14),
      ]),
      sec('materials',   '소재',      'Materials',                0.12, [
        st('FCX',  '프리포트맥모란',   50.10,  0.21),
        st('LIN',  '린데',            528.20,  0.12),
        st('APD',  '에어프로덕츠',    296.80,  0.06),
      ]),
      sec('healthcare',  '헬스케어',  'Healthcare',              -0.28, [
        st('JNJ',  '존슨앤드존슨',    225.20, -0.18),
        st('UNH',  '유나이티드헬스',  378.60, -0.31),
        st('LLY',  '일라이릴리',      968.80, -0.44),
      ]),
      sec('staples',     '필수소비재','Consumer Staples',         -0.45, [
        st('PG',   'P&G',             148.20, -0.32),
        st('WMT',  '월마트',          132.40, -0.48),
        st('KO',   '코카콜라',         74.80, -0.62),
      ]),
      sec('financials',  '금융',      'Financials',              -0.88, [
        st('BAC',  '뱅크오브아메리카', 54.80, -0.66),
        st('JPM',  'JP모건',          310.80, -0.92),
        st('GS',   '골드만삭스',      881.20, -1.18),
      ]),
      sec('utilities',   '유틸리티',  'Utilities',               -1.02, [
        st('NEE',  '넥스트에라에너지',  95.40, -0.78),
        st('DUK',  '듀크에너지',       118.60, -1.08),
        st('SO',   '서던컴퍼니',        93.10, -1.32),
      ]),
      sec('realestate',  '부동산',    'Real Estate',             -1.18, [
        st('AMT',  '아메리칸타워',    181.80, -0.92),
        st('PLD',  '프롤로지스',      144.40, -1.24),
        st('SPG',  '사이먼프라퍼티',  179.20, -1.44),
      ]),
    ]),

    sess('regular', '정규장', [
      sec('technology',  '기술',      'Technology',               1.92, [
        st('NVDA', '엔비디아',        218.20,  3.54),
        st('META', '메타',            612.10,  2.01),
        st('AAPL', '애플',            289.80,  0.78),
      ]),
      sec('consumer',    '경기소비재','Consumer Discretionary',   1.48, [
        st('TSLA', '테슬라',          414.20,  2.67),
        st('AMZN', '아마존',          274.50,  1.38),
        st('NKE',  '나이키',           45.20,  0.58),
      ]),
      sec('energy',      '에너지',    'Energy',                   0.78, [
        st('COP',  '코노코필립스',    116.40,  1.21),
        st('XOM',  '엑손모빌',        149.80,  0.88),
        st('CVX',  '셰브론',          185.60,  0.42),
      ]),
      sec('industrials', '산업재',    'Industrials',              0.44, [
        st('CAT',  '캐터필러',        899.60,  0.72),
        st('HON',  '하니웰',          219.60,  0.42),
        st('UPS',  'UPS',             101.60,  0.22),
      ]),
      sec('materials',   '소재',      'Materials',                0.22, [
        st('FCX',  '프리포트맥모란',   50.10,  0.38),
        st('LIN',  '린데',            528.20,  0.22),
        st('APD',  '에어프로덕츠',    296.80,  0.12),
      ]),
      sec('healthcare',  '헬스케어',  'Healthcare',              -0.38, [
        st('JNJ',  '존슨앤드존슨',    225.20, -0.24),
        st('UNH',  '유나이티드헬스',  378.60, -0.42),
        st('LLY',  '일라이릴리',      968.80, -0.58),
      ]),
      sec('staples',     '필수소비재','Consumer Staples',         -0.52, [
        st('PG',   'P&G',             148.20, -0.38),
        st('KO',   '코카콜라',         74.80, -0.54),
        st('WMT',  '월마트',          132.40, -0.68),
      ]),
      sec('financials',  '금융',      'Financials',              -1.12, [
        st('BAC',  '뱅크오브아메리카', 54.80, -0.88),
        st('JPM',  'JP모건',          310.80, -1.15),
        st('GS',   '골드만삭스',      881.20, -1.48),
      ]),
      sec('utilities',   '유틸리티',  'Utilities',               -1.28, [
        st('NEE',  '넥스트에라에너지',  95.40, -0.98),
        st('DUK',  '듀크에너지',       118.60, -1.34),
        st('SO',   '서던컴퍼니',        93.10, -1.62),
      ]),
      sec('realestate',  '부동산',    'Real Estate',             -1.44, [
        st('AMT',  '아메리칸타워',    181.80, -1.12),
        st('PLD',  '프롤로지스',      144.40, -1.52),
        st('SPG',  '사이먼프라퍼티',  179.20, -1.76),
      ]),
    ]),

    sess('aftermarket', '애프터마켓', [
      sec('financials',  '금융',      'Financials',               0.82, [
        st('GS',   '골드만삭스',      881.20,  1.24),
        st('JPM',  'JP모건',          310.80,  0.78),
        st('BAC',  '뱅크오브아메리카', 54.80,  0.44),
      ]),
      sec('technology',  '기술',      'Technology',               0.48, [
        st('AAPL', '애플',            289.80,  0.72),
        st('NVDA', '엔비디아',        218.20,  0.51),
        st('META', '메타',            612.10,  0.28),
      ]),
      sec('staples',     '필수소비재','Consumer Staples',          0.24, [
        st('WMT',  '월마트',          132.40,  0.36),
        st('PG',   'P&G',             148.20,  0.24),
        st('KO',   '코카콜라',         74.80,  0.14),
      ]),
      sec('industrials', '산업재',    'Industrials',              0.12, [
        st('CAT',  '캐터필러',        899.60,  0.18),
        st('HON',  '하니웰',          219.60,  0.12),
        st('UPS',  'UPS',             101.60,  0.07),
      ]),
      sec('materials',   '소재',      'Materials',               -0.08, [
        st('LIN',  '린데',            528.20, -0.06),
        st('APD',  '에어프로덕츠',    296.80, -0.09),
        st('FCX',  '프리포트맥모란',   50.10, -0.14),
      ]),
      sec('healthcare',  '헬스케어',  'Healthcare',              -0.12, [
        st('JNJ',  '존슨앤드존슨',    225.20, -0.08),
        st('UNH',  '유나이티드헬스',  378.60, -0.14),
        st('LLY',  '일라이릴리',      968.80, -0.21),
      ]),
      sec('energy',      '에너지',    'Energy',                  -0.44, [
        st('CVX',  '셰브론',          185.60, -0.32),
        st('XOM',  '엑손모빌',        149.80, -0.48),
        st('COP',  '코노코필립스',    116.40, -0.65),
      ]),
      sec('consumer',    '경기소비재','Consumer Discretionary',  -0.71, [
        st('NKE',  '나이키',           45.20, -0.51),
        st('AMZN', '아마존',          274.50, -0.74),
        st('TSLA', '테슬라',          414.20, -1.02),
      ]),
      sec('utilities',   '유틸리티',  'Utilities',               -0.88, [
        st('NEE',  '넥스트에라에너지',  95.40, -0.67),
        st('DUK',  '듀크에너지',       118.60, -0.92),
        st('SO',   '서던컴퍼니',        93.10, -1.12),
      ]),
      sec('realestate',  '부동산',    'Real Estate',             -1.02, [
        st('AMT',  '아메리칸타워',    181.80, -0.79),
        st('PLD',  '프롤로지스',      144.40, -1.08),
        st('SPG',  '사이먼프라퍼티',  179.20, -1.24),
      ]),
    ]),
  ],
};

// ── 내보내기 ──────────────────────────────────────────────────────────────────

export const mockData: DayData[] = [d0508, d0507, d0506];

export function getSession(date: string, sessionType: string) {
  const day = mockData.find(d => d.date === date);
  return day?.sessions.find(s => s.type === sessionType) ?? null;
}
