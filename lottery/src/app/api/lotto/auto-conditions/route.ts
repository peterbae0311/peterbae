import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { callChatWithFallback, type ChatMessage } from '@/lib/ai-providers';

interface GeneratedCondition {
  conditionType: number;
  years: number;
  months: number;
  maxConsec: number;
  oddCount: number;
  sumMin: number;
  sumMax: number;
  minAC: number;
  minBands: number;
  lowCount: number;
  primeCount: number;
  minUniqueTails: number;
}

const SYSTEM_PROMPT = `한국 로또 6/45 당첨 번호 빈도 분석 조건을 JSON 배열로만 반환하세요. 코드블록 없이 순수 JSON만 출력.

조건 타입 (당첨자수/롤오버 조건은 당첨번호 자체와 무관한 구매행태 변수라 제외됨):
1=기간(years:0~20,months:0~12)
4=연속번호(maxConsec:0=없음,2=2개,3=3개이상)
5=홀수개수(oddCount:0~6)
6=합계범위(sumMin,sumMax:21~255 — 6/45 이론상 합계 범위)
7=AC값하한(minAC:3~10)
8=밴드커버(minBands:4 또는 5)
9=저번호개수(lowCount:1~5 — 1~22번 번호 개수)
10=소수개수(primeCount:1~4)
11=끝수다양성(minUniqueTails:4~6 — 고유 끝자리 개수)

형식(압축JSON, 해당 타입에 필요한 필드만 채우고 나머지는 기본값): [{"conditionType":1,"years":0,"months":3,"maxConsec":0,"oddCount":3,"sumMin":115,"sumMax":185,"minAC":7,"minBands":5,"lowCount":3,"primeCount":2,"minUniqueTails":5},...]

규칙: 총 10~12개, 타입1은 최소 4개(단기/중기/장기/전체), 타입4~11은 각각 1~2개씩 다양하게 포함(타입5는 oddCount 2,3,4 각각, 타입6은 두 가지 범위)`;


export async function POST() {
  const supabase = createServerClient();

  // DB 통계 수집
  const { data: statsRow } = await supabase
    .from('lotto_results')
    .select('round, draw_date')
    .order('round', { ascending: false })
    .limit(1)
    .single();

  const { data: firstRow } = await supabase
    .from('lotto_results')
    .select('round, draw_date')
    .order('round', { ascending: true })
    .limit(1)
    .single();

  const { count } = await supabase
    .from('lotto_results')
    .select('round', { count: 'exact', head: true });

  const latestRound = statsRow?.round ?? 0;
  const latestDate = statsRow?.draw_date ?? '';
  const firstDate = firstRow?.draw_date ?? '';
  const totalRounds = count ?? 0;

  const userPrompt = `현재 로또 DB 현황:
- 최신 회차: ${latestRound}회 (${latestDate})
- 최초 회차: ${firstRow?.round ?? 1}회 (${firstDate})
- 전체 데이터: 총 ${totalRounds}회차

위 현황을 바탕으로 당첨 번호 빈도 분석에 유용한 조건 세트를 생성해주세요.
JSON 배열만 반환하세요.`;

  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userPrompt },
  ];

  let rawContent: string;
  let usedProvider: string;
  let failures: string[];
  try {
    const result = await callChatWithFallback(messages, { maxTokens: 4000, temperature: 0.3 });
    rawContent = result.content;
    usedProvider = result.provider;
    failures = result.failures;
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
  console.info(`[auto-conditions] provider=${usedProvider}${failures.length > 0 ? ` (선행 실패: ${failures.join(' / ')})` : ''}`);

  try {
    // thinking 모델의 <think>...</think> 블록 제거
    const content = rawContent.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

    // JSON 배열 파싱
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      const preview = content.slice(0, 300);
      return NextResponse.json({ success: false, error: `AI 응답에서 조건을 파싱할 수 없습니다. 응답 미리보기: ${preview}` }, { status: 500 });
    }

    const parsed: GeneratedCondition[] = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return NextResponse.json({ success: false, error: '유효한 조건이 생성되지 않았습니다.' }, { status: 500 });
    }

    // 유효성 검증 및 정규화
    const validated = parsed
      .filter(c => [1, 4, 5, 6, 7, 8, 9, 10, 11].includes(Number(c.conditionType)))
      .map(c => ({
        conditionType: Number(c.conditionType),
        years: Math.max(0, Math.min(20, Number(c.years ?? 0))),
        months: Math.max(0, Math.min(12, Number(c.months ?? 0))),
        maxConsec: [0, 2, 3].includes(Number(c.maxConsec)) ? Number(c.maxConsec) : 0,
        oddCount: Math.max(0, Math.min(6, Number(c.oddCount ?? 3))),
        sumMin: Math.max(21, Math.min(255, Number(c.sumMin ?? 115))),
        sumMax: Math.max(21, Math.min(255, Number(c.sumMax ?? 185))),
        minAC: Math.max(3, Math.min(10, Number(c.minAC ?? 7))),
        minBands: [4, 5].includes(Number(c.minBands)) ? Number(c.minBands) : 5,
        lowCount: Math.max(1, Math.min(5, Number(c.lowCount ?? 3))),
        primeCount: Math.max(1, Math.min(4, Number(c.primeCount ?? 2))),
        minUniqueTails: Math.max(4, Math.min(6, Number(c.minUniqueTails ?? 5))),
      }));

    return NextResponse.json({ success: true, data: { conditions: validated, latestRound, totalRounds } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
