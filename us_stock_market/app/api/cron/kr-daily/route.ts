/**
 * Korean market daily close alert
 * Schedule (UTC): 10 7 * * 1-5  →  KST 16:10 (월~금)
 *
 * KOSPI 장마감(15:30 KST) 후 kr-seed 크론(16:00 KST)이 업종 데이터를 저장한 뒤 실행.
 * 텔레그램으로 다음 5개 섹션을 1건으로 전송:
 *   1. 업종 등락률 상위 10
 *   2. 외국인 순매수 상위 10 (등락률순)
 *   3. 외국인 순매도 상위 10 (등락률순)
 *   4. 기관 순매수 상위 10 (등락률순)
 *   5. 기관 순매도 상위 10 (등락률순)
 */

import { NextResponse } from 'next/server';
import { getForeignTradeRanking, getInstitutionalTradeRanking, type TradeStock } from '@/lib/naverFinance';
import { getSupabaseClient } from '@/lib/supabase';
import { sendTelegramMessage } from '@/lib/telegram';

export const dynamic = 'force-dynamic';

function getKstDateLabel(): string {
  const fmt = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });
  return fmt.format(new Date()).replace(/^\d{4}년\s*/, '');
}

function getKstTimeLabel(): string {
  const fmt = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return `${fmt.format(new Date())} KST`;
}

function fmtPrice(n: number): string {
  return n.toLocaleString('ko-KR');
}

function fmtChange(stock: TradeStock): string {
  const sign = stock.changeRate >= 0 ? '+' : '';
  return `${sign}${fmtPrice(stock.changeAmount)}원 (${sign}${stock.changeRate.toFixed(2)}%)`;
}

function buildTradeSection(title: string, stocks: TradeStock[]): string {
  const top10 = [...stocks]
    .sort((a, b) => b.changeRate - a.changeRate)
    .slice(0, 10);

  let s = `${title}\n\n`;
  top10.forEach(stock => {
    s += `${stock.name}  ${fmtPrice(stock.price)}원  ${fmtChange(stock)}\n`;
  });
  return s;
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET ?? '';
  if (cronSecret) {
    const auth = request.headers.get('authorization') ?? '';
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    // 오늘 KST 날짜
    const kstDate = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

    // 병렬 fetch
    const supabase = getSupabaseClient();
    const [sectorResult, foreign, institutional] = await Promise.all([
      supabase
        .from('kr_sector_snapshots')
        .select('sector_name, change_rate')
        .eq('trade_date', kstDate)
        .order('change_rate', { ascending: false })
        .limit(10),
      getForeignTradeRanking(),
      getInstitutionalTradeRanking(),
    ]);

    const sectors = sectorResult.data ?? [];
    const dateLabel = getKstDateLabel();
    const timeLabel = getKstTimeLabel();

    // ── 메시지 조립 ───────────────────────────────────────────────────────────
    let msg = `🇰🇷 한국증시 마감 | ${dateLabel}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;

    // 1. 업종 등락률 상위 10
    msg += `📊 *업종 등락률 상위 10*\n\n`;
    if (sectors.length > 0) {
      sectors.forEach((s, i) => {
        const rate = s.change_rate as number;
        const sign = rate >= 0 ? '+' : '';
        msg += `${i + 1}. ${s.sector_name}  ${sign}${rate.toFixed(2)}%\n`;
      });
    } else {
      msg += `(데이터 없음)\n`;
    }

    msg += `\n━━━━━━━━━━━━━━━━━━━━━━\n`;

    // 2. 외국인 순매수 상위 10
    msg += buildTradeSection(`🟢 *외국인 순매수 상위 10*`, foreign.buyTop);

    msg += `\n`;

    // 3. 외국인 순매도 상위 10
    msg += buildTradeSection(`🔴 *외국인 순매도 상위 10*`, foreign.sellTop);

    msg += `\n━━━━━━━━━━━━━━━━━━━━━━\n`;

    // 4. 기관 순매수 상위 10
    msg += buildTradeSection(`🟢 *기관 순매수 상위 10*`, institutional.buyTop);

    msg += `\n`;

    // 5. 기관 순매도 상위 10
    msg += buildTradeSection(`🔴 *기관 순매도 상위 10*`, institutional.sellTop);

    msg += `\n━━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `⚡ ${timeLabel}`;

    const result = await sendTelegramMessage(msg);

    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: 500 });
    }

    return NextResponse.json({ success: true, message_id: result.message_id, date: kstDate });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
