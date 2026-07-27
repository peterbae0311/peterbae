// Types for US Stock Market Dashboard

export type SessionType = 'daymarket' | 'premarket' | 'regular' | 'aftermarket';

export interface Stock {
  ticker: string;
  nameKr: string;
  changePercent: number; // e.g. +5.23 or -1.20
  changeDollar: number;  // e.g. +6.42 or -2.10
  closePrice: number;    // 마감 종가 (USD)
}

export interface Sector {
  id: string;
  nameKr: string;
  nameEn: string;
  changePercent: number; // sector average change
  stocks: Stock[];
}

export interface Session {
  type: SessionType;
  labelKr: string;   // e.g. '프리마켓'
  sectors: Sector[];
}

export interface DayData {
  date: string;          // e.g. '2026-05-08'
  dayOfWeek: string;     // e.g. '목'
  exchangeRate: number;  // 당일 USD/KRW 환율
  sessions: Session[];
}

export interface SelectedSession {
  date: string;
  sessionType: SessionType;
}
