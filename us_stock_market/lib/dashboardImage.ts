/**
 * dashboardImage.ts
 *
 * Generates an 800x1200 dark-themed PNG summarising a full trading day.
 * Uses satori (HTML-like VNode → SVG) + sharp (SVG → PNG buffer).
 *
 * Layout:
 *   - Header  : date, exchange-rate
 *   - 4 Session panels (aftermarket / daymarket / premarket / regular)
 *     each showing top-5 sectors with change-percent
 *
 * Vercel Hobby-safe: no Chromium, ~3-4 MB total weight.
 */

import satori from 'satori';
import sharp from 'sharp';
import { readFile } from 'fs/promises';
import path from 'path';
import { supabase } from './supabase';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SectorRow {
  sector_name: string;
  change_pct: number;
  rank: number;
}

export interface SessionSummary {
  sessionType: 'aftermarket' | 'daymarket' | 'premarket' | 'regular';
  labelKr: string;
  sectors: SectorRow[]; // top 5, sorted by rank asc
}

export interface DashboardData {
  tradeDate: string;     // 'YYYY-MM-DD'
  exchangeRate: number;  // USD/KRW (0 if unavailable)
  sessions: SessionSummary[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SESSION_ORDER: Array<{ type: SessionSummary['sessionType']; labelKr: string }> = [
  { type: 'aftermarket', labelKr: '애프터마켓' },
  { type: 'daymarket',   labelKr: '데이마켓'   },
  { type: 'premarket',   labelKr: '프리마켓'   },
  { type: 'regular',     labelKr: '정규장'     },
];

const SECTOR_NAME_KR: Record<string, string> = {
  Technology:              '기술',
  Healthcare:              '헬스케어',
  'Financial Services':    '금융',
  'Consumer Cyclical':     '소비재(경기)',
  'Consumer Defensive':    '소비재(필수)',
  'Communication Services':'통신',
  Energy:                  '에너지',
  Utilities:               '유틸리티',
  'Real Estate':           '부동산',
  'Basic Materials':       '소재',
  Industrials:             '산업재',
};

function sectorKr(name: string): string {
  return SECTOR_NAME_KR[name] ?? name;
}

function fmtPct(v: number): string {
  return v >= 0 ? `+${v.toFixed(2)}%` : `${v.toFixed(2)}%`;
}

function pctColor(v: number): string {
  if (v > 0) return '#4ade80';  // green-400
  if (v < 0) return '#f87171';  // red-400
  return '#94a3b8';              // slate-400
}

// ── Supabase data fetch ───────────────────────────────────────────────────────

/**
 * Loads the four session summaries for a given trade date from Supabase.
 * Tables: alert_sessions, sector_snapshots
 */
export async function loadDashboardData(tradeDate: string): Promise<DashboardData> {
  // Fetch all successful alert_sessions for the trade date
  const { data: sessions, error: sessErr } = await supabase
    .from('alert_sessions')
    .select('id, session_type')
    .eq('trade_date', tradeDate)
    .eq('status', 'success');

  if (sessErr) {
    throw new Error(`loadDashboardData: alert_sessions query failed — ${sessErr.message}`);
  }

  const sessionRows = sessions ?? [];

  // Build a lookup: sessionType → id
  const idMap: Record<string, string> = {};
  for (const row of sessionRows) {
    idMap[row.session_type as string] = row.id as string;
  }

  // Fetch sector snapshots for all found session ids
  const ids = Object.values(idMap);
  let snapshotMap: Record<string, SectorRow[]> = {};

  if (ids.length > 0) {
    const { data: snaps, error: snapErr } = await supabase
      .from('sector_snapshots')
      .select('session_id, sector_name, change_pct, rank')
      .in('session_id', ids)
      .order('rank', { ascending: true });

    if (snapErr) {
      console.error('[dashboardImage] sector_snapshots query error:', snapErr.message);
    } else {
      for (const snap of snaps ?? []) {
        const sid = snap.session_id as string;
        if (!snapshotMap[sid]) snapshotMap[sid] = [];
        snapshotMap[sid].push({
          sector_name: snap.sector_name as string,
          change_pct:  snap.change_pct  as number,
          rank:        snap.rank        as number,
        });
      }
    }
  }

  // Assemble sessions in display order
  const builtSessions: SessionSummary[] = SESSION_ORDER.map(({ type, labelKr }) => {
    const sessionId = idMap[type] ?? '';
    const sectors = sessionId
      ? (snapshotMap[sessionId] ?? []).slice(0, 5)
      : [];
    return { sessionType: type, labelKr, sectors };
  });

  // Exchange rate: placeholder 0 (FMP free tier doesn't return forex in cron)
  // If you store it later, query here.
  return {
    tradeDate,
    exchangeRate: 0,
    sessions: builtSessions,
  };
}

// ── satori VNode helpers ──────────────────────────────────────────────────────
// satori accepts React-like VNodes: { type, props: { children, style, ... } }
// We construct them as plain objects to avoid a JSX dependency in a pure lib file.

type VNode = {
  type: string;
  props: Record<string, unknown>;
};

function el(
  type: string,
  props: Record<string, unknown>,
  ...children: Array<VNode | string | null | undefined>
): VNode {
  const filteredChildren = children.filter((c) => c != null);
  return {
    type,
    props: {
      ...props,
      children: filteredChildren.length === 1 ? filteredChildren[0] : filteredChildren,
    },
  };
}

// ── Image layout ──────────────────────────────────────────────────────────────

const W = 800;
const H = 1200;
const BG = '#0f172a';       // slate-900
const CARD_BG = '#1e293b';  // slate-800
const BORDER = '#334155';   // slate-700
const TEXT_PRIMARY = '#f1f5f9';   // slate-100
const TEXT_SECONDARY = '#94a3b8'; // slate-400
const ACCENT = '#38bdf8';         // sky-400

function buildSectorRow(sector: SectorRow, idx: number): VNode {
  const rankLabel = ['1', '2', '3', '4', '5'][idx] ?? String(idx + 1);
  const color = pctColor(sector.change_pct);

  return el(
    'div',
    {
      style: {
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 0',
        borderBottom: idx < 4 ? `1px solid ${BORDER}` : 'none',
      },
    },
    el(
      'div',
      { style: { display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '8px' } },
      el(
        'div',
        {
          style: {
            width: '20px',
            height: '20px',
            borderRadius: '50%',
            backgroundColor: BORDER,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '11px',
            color: TEXT_SECONDARY,
            fontWeight: 700,
          },
        },
        rankLabel,
      ),
      el(
        'div',
        { style: { fontSize: '13px', color: TEXT_PRIMARY, fontWeight: 500 } },
        sectorKr(sector.sector_name),
      ),
    ),
    el(
      'div',
      {
        style: {
          fontSize: '13px',
          fontWeight: 700,
          color,
          minWidth: '64px',
          textAlign: 'right',
        },
      },
      fmtPct(sector.change_pct),
    ),
  );
}

function buildSessionCard(session: SessionSummary): VNode {
  const hasSectors = session.sectors.length > 0;

  const sectorRows = hasSectors
    ? session.sectors.map((s, i) => buildSectorRow(s, i))
    : [
        el(
          'div',
          { style: { fontSize: '12px', color: TEXT_SECONDARY, padding: '8px 0' } },
          '데이터 없음',
        ),
      ];

  return el(
    'div',
    {
      style: {
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: CARD_BG,
        borderRadius: '10px',
        border: `1px solid ${BORDER}`,
        padding: '14px 16px',
        marginBottom: '12px',
      },
    },
    // Card header
    el(
      'div',
      {
        style: {
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          marginBottom: '10px',
        },
      },
      el(
        'div',
        {
          style: {
            fontSize: '13px',
            fontWeight: 700,
            color: ACCENT,
            backgroundColor: '#0c4a6e',
            borderRadius: '6px',
            padding: '2px 10px',
          },
        },
        session.labelKr,
      ),
      el(
        'div',
        { style: { fontSize: '11px', color: TEXT_SECONDARY, marginLeft: '8px' } },
        '섹터 TOP 5',
      ),
    ),
    // Sector rows
    ...sectorRows,
  );
}

function buildRootNode(data: DashboardData): VNode {
  const dateFormatted = data.tradeDate; // 'YYYY-MM-DD'
  const rateLabel =
    data.exchangeRate > 0
      ? `USD/KRW ${data.exchangeRate.toLocaleString('ko-KR')}`
      : '';

  return el(
    'div',
    {
      style: {
        width: `${W}px`,
        height: `${H}px`,
        backgroundColor: BG,
        display: 'flex',
        flexDirection: 'column',
        padding: '24px 24px 16px',
        fontFamily: 'Noto Sans KR',
        boxSizing: 'border-box',
      },
    },
    // ── Header ──
    el(
      'div',
      {
        style: {
          display: 'flex',
          flexDirection: 'column',
          marginBottom: '18px',
          borderBottom: `2px solid ${ACCENT}`,
          paddingBottom: '14px',
        },
      },
      el(
        'div',
        { style: { fontSize: '11px', color: TEXT_SECONDARY, marginBottom: '4px', letterSpacing: '1px' } },
        'DAILY MARKET REPORT',
      ),
      el(
        'div',
        {
          style: {
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'baseline',
            justifyContent: 'space-between',
          },
        },
        el(
          'div',
          { style: { fontSize: '26px', fontWeight: 800, color: TEXT_PRIMARY } },
          dateFormatted,
        ),
        rateLabel
          ? el(
              'div',
              { style: { fontSize: '14px', color: ACCENT, fontWeight: 600 } },
              rateLabel,
            )
          : null,
      ),
    ),
    // ── Session cards ──
    el(
      'div',
      {
        style: {
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
        },
      },
      ...data.sessions.map(buildSessionCard),
    ),
    // ── Footer ──
    el(
      'div',
      {
        style: {
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'center',
          alignItems: 'center',
          paddingTop: '8px',
          borderTop: `1px solid ${BORDER}`,
        },
      },
      el(
        'div',
        { style: { fontSize: '11px', color: TEXT_SECONDARY } },
        'Peter-04 | US Market Dashboard',
      ),
    ),
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Generates a PNG Buffer of the daily dashboard for the given trade date.
 * Fetches data from Supabase internally.
 *
 * @throws if Supabase query fails or image rendering fails.
 */
export async function generateDashboardImage(tradeDate: string): Promise<Buffer> {
  const data = await loadDashboardData(tradeDate);

  const fontPath = path.join(process.cwd(), 'public', 'fonts', 'NotoSansKR-Regular.ttf');
  const fontData = await readFile(fontPath);

  const svgString = await satori(buildRootNode(data) as Parameters<typeof satori>[0], {
    width: W,
    height: H,
    fonts: [
      {
        name: 'Noto Sans KR',
        data: fontData.buffer.slice(fontData.byteOffset, fontData.byteOffset + fontData.byteLength) as ArrayBuffer,
        weight: 400,
        style: 'normal',
      },
    ],
  });

  // Convert SVG → PNG via sharp
  const pngBuffer = await sharp(Buffer.from(svgString))
    .png()
    .toBuffer();

  return pngBuffer;
}
