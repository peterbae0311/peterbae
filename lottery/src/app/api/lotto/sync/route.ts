import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

const LOTTO_API_BASE = 'https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo=';

interface LottoApiResponse {
  returnValue: string;
  drwNo: number;
  drwNoDate: string;
  drwtNo1: number;
  drwtNo2: number;
  drwtNo3: number;
  drwtNo4: number;
  drwtNo5: number;
  drwtNo6: number;
  bnusNo: number;
  firstPrzwnerCo: number;
  firstWinamnt: number;
}

async function fetchFromDhlottery(round: number): Promise<LottoApiResponse | null> {
  try {
    const res = await fetch(`${LOTTO_API_BASE}${round}`, {
      next: { revalidate: 0 },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const data: LottoApiResponse = await res.json();
    if (data.returnValue !== 'success') return null;
    return data;
  } catch {
    return null;
  }
}

async function fetchFromNaver(round: number): Promise<LottoApiResponse | null> {
  try {
    const query = encodeURIComponent(`로또 ${round}회`);
    const res = await fetch(`https://search.naver.com/search.naver?query=${query}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept-Language': 'ko-KR,ko;q=0.9',
      },
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) return null;
    const html = await res.text();

    // 요청한 회차가 실제로 선택된 탭인지 확인 (미래 회차 방지)
    if (!html.includes(`data-kgs-option="${round}" aria-selected="true"`)) return null;

    // 당첨번호 6개
    const winMatch = html.match(/<div class="winning_number">([\s\S]*?)<\/div>/);
    if (!winMatch) return null;
    const nums: number[] = [];
    const numRe = /<span class="ball[^"]*">(\d+)<\/span>/g;
    let m: RegExpExecArray | null;
    while ((m = numRe.exec(winMatch[1])) !== null) nums.push(Number(m[1]));
    if (nums.length !== 6) return null;

    // 보너스 번호
    const bonusMatch = html.match(/<div class="bonus_number">[\s\S]*?<span class="ball[^"]*">(\d+)<\/span>/);
    if (!bonusMatch) return null;

    // 추첨일: "(2026.06.27.)" 형태
    const dateRe = new RegExp(`data-kgs-option="${round}"[^>]*>[\\s\\S]{0,200}?\\((\\d{4}\\.\\d{2}\\.\\d{2})\\.?\\)`);
    const dateMatch = html.match(dateRe);
    const drawDate = dateMatch ? dateMatch[1].replace(/\./g, '-') : '';

    // 1등 당첨금
    const prizeMatch = html.match(/<p class="win_text">[\s\S]*?<strong[^>]*>([\d,]+)<\/strong>/);
    const prizeAmt = prizeMatch ? parseInt(prizeMatch[1].replace(/,/g, ''), 10) : 0;

    // 1등 당첨자 수 ("N명" 패턴)
    const winnersMatch = html.match(/<p class="win_text">[\s\S]*?(\d+)명/);
    const winners = winnersMatch ? parseInt(winnersMatch[1], 10) : 0;

    return {
      returnValue: 'success',
      drwNo: round,
      drwNoDate: drawDate,
      drwtNo1: nums[0], drwtNo2: nums[1], drwtNo3: nums[2],
      drwtNo4: nums[3], drwtNo5: nums[4], drwtNo6: nums[5],
      bnusNo: Number(bonusMatch[1]),
      firstPrzwnerCo: winners,
      firstWinamnt: prizeAmt,
    };
  } catch {
    return null;
  }
}

async function fetchLottoRound(round: number): Promise<LottoApiResponse | null> {
  const fromDhlottery = await fetchFromDhlottery(round);
  if (fromDhlottery) return fromDhlottery;
  return fetchFromNaver(round);
}

// 회차 하나를 upsert. 실패하면 잠깐 대기 후 최대 2번 더 시도 — 트랜지언트 DB/네트워크
// 오류로 회차 하나가 통째로 누락되는 걸 줄인다. 그래도 실패하면 명확히 로그를 남긴다.
async function upsertRound(
  supabase: ReturnType<typeof createServerClient>,
  round: number,
  data: LottoApiResponse,
): Promise<boolean> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const { error } = await supabase.from('lotto_results').upsert(
      {
        round: data.drwNo,
        draw_date: data.drwNoDate,
        num1: data.drwtNo1,
        num2: data.drwtNo2,
        num3: data.drwtNo3,
        num4: data.drwtNo4,
        num5: data.drwtNo5,
        num6: data.drwtNo6,
        bonus1: data.bnusNo,
        bonus2: null,
        first_prize_winners: data.firstPrzwnerCo,
        first_prize_amount: data.firstWinamnt,
      },
      { onConflict: 'round' }
    );
    if (!error) return true;
    console.error(`[sync] round ${round} upsert 실패 (시도 ${attempt}/3): ${error.message}`);
    if (attempt < 3) await new Promise(r => setTimeout(r, 300 * attempt));
  }
  return false;
}

export async function GET() {
  const supabase = createServerClient();

  try {
    // DB에 이미 있는 회차 전체 목록 — MAX(round)만 보면 그 이전에 upsert가 실패해
    // 비어버린 회차(gap)를 다시는 재시도하지 못한다. 매번 1..maxRound 구간의
    // 결측 회차를 함께 채워 넣어 영구 누락을 방지한다.
    // PostgREST 기본 응답 상한(보통 1000행)에 걸리지 않도록 페이지네이션으로 전체를 가져온다 —
    // 안 그러면 회차가 1000개를 넘는 순간부터 maxRound가 실제보다 작게 계산돼, 최신 회차를
    // 못 가져오고 이미 있는 회차들만 매번 헛되이 재처리하게 된다.
    const existingRoundsList: number[] = [];
    {
      const PAGE = 1000;
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from('lotto_results')
          .select('round')
          .order('round', { ascending: true })
          .range(from, from + PAGE - 1);
        if (error) throw new Error(error.message);
        if (!data || data.length === 0) break;
        existingRoundsList.push(...data.map(r => r.round as number));
        if (data.length < PAGE) break;
        from += PAGE;
      }
    }

    const existingRounds = new Set(existingRoundsList);
    const maxRound = existingRounds.size > 0 ? Math.max(...existingRounds) : 0;

    const missingRounds: number[] = [];
    for (let r = 1; r <= maxRound; r++) {
      if (!existingRounds.has(r)) missingRounds.push(r);
    }

    const upserted: number[] = [];
    const failedRounds: number[] = [];

    // 1) 과거 결측 회차 재시도 (이미 추첨된 회차이므로 fetch 실패해도 다음 회차로 계속 진행)
    for (const round of missingRounds) {
      const data = await fetchLottoRound(round);
      if (!data) { failedRounds.push(round); continue; }
      if (await upsertRound(supabase, round, data)) upserted.push(round);
      else failedRounds.push(round);
    }

    // 2) 최신 회차 이어받기 — fetch가 연속 실패하면 아직 추첨 안 된 미래 회차로 보고 중단
    let consecutiveFailures = 0;
    const MAX_CONSECUTIVE_FAILURES = 3;

    for (let round = maxRound + 1; ; round++) {
      const data = await fetchLottoRound(round);

      if (!data) {
        consecutiveFailures++;
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) break;
        continue;
      }
      consecutiveFailures = 0;

      if (await upsertRound(supabase, round, data)) upserted.push(round);
      else failedRounds.push(round);
    }

    if (failedRounds.length > 0) {
      console.error(`[sync] 최종 실패 회차: ${failedRounds.join(', ')}`);
    }

    return NextResponse.json({
      success: true,
      data: {
        syncedRounds: upserted.length,
        rounds: upserted,
        failedRounds,
        startedFrom: maxRound + 1,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
