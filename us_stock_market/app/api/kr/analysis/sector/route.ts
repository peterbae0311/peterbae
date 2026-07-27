import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface KrSectorAnalysis {
  today: string;
  shortTerm: string;
  longTerm: string;
  opportunities: string[];
  risks: string[];
  outlook: string;
  sources: string[];
}

// GET /api/kr/analysis/sector?name=반도체&changeRate=1.23
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sectorName = searchParams.get('name');
    const changeRateParam = searchParams.get('changeRate');

    if (!sectorName) {
      return NextResponse.json(
        { error: 'name 파라미터가 필요합니다' },
        { status: 400 },
      );
    }

    const changeRate = changeRateParam != null ? parseFloat(changeRateParam) : 0;
    const changeRateStr = `${changeRate >= 0 ? '+' : ''}${changeRate.toFixed(2)}%`;

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'OPENROUTER_API_KEY가 설정되지 않았습니다' },
        { status: 500 },
      );
    }

    const prompt = `당신은 전문 한국 주식 시장 애널리스트입니다. 아래 데이터를 바탕으로 한국 증시의 ${sectorName} 업종을 분석해주세요.

## 시장 데이터
- 업종명: ${sectorName}
- 당일 등락률: ${changeRateStr}

## 분석 요청 (JSON 형식으로 반환)
{
  "today": "당일 업종 흐름 요약 2-3문장",
  "shortTerm": "향후 3개월 전망 2-3문장",
  "longTerm": "향후 6개월 전망 2-3문장",
  "opportunities": ["기회요인1", "기회요인2", "기회요인3"],
  "risks": ["리스크1", "리스크2", "리스크3"],
  "outlook": "bullish 또는 neutral 또는 bearish",
  "sources": ["참고기관1", "참고기관2"]
}

한국투자증권, 삼성증권, 미래에셋, NH투자증권, Goldman Sachs, JP Morgan 등 신뢰할 수 있는 기관의 관점을 참고하여 분석하세요.
반드시 JSON만 반환하세요.`;

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      }),
      next: { revalidate: 0 },
    });

    const llmData = (await response.json()) as {
      choices?: Array<{ message: { content: string } }>;
      error?: { message: string };
    };

    if (!llmData.choices?.[0]) {
      throw new Error(llmData.error?.message ?? 'OpenRouter: no choices in response');
    }

    const raw = llmData.choices[0].message.content;
    const jsonStr = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const analysis = JSON.parse(jsonStr) as KrSectorAnalysis;

    return NextResponse.json({
      sectorName,
      changeRate,
      analysis: {
        today: analysis.today,
        shortTerm: analysis.shortTerm,
        longTerm: analysis.longTerm,
        opportunities: analysis.opportunities ?? [],
        risks: analysis.risks ?? [],
        outlook: analysis.outlook ?? 'neutral',
        sources: analysis.sources ?? [],
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: '분석 생성 실패', details: message },
      { status: 500 },
    );
  }
}
