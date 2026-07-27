import { NextResponse } from 'next/server';
import { callLlm, modelDisplayLabel } from '@/lib/llm';

export const dynamic = 'force-dynamic';

interface KrStockAnalysis {
  companyGuidance: string;
  shortTerm: string;
  longTerm: string;
  targetPriceRange: {
    low: number;
    consensus: number;
    high: number;
  };
  opportunities: string[];
  risks: string[];
  outlook: string;
  sources: string[];
}

// GET /api/kr/analysis/stock?name=삼성전자&code=005930&price=75000&changeRate=1.23
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const stockName = searchParams.get('name');
    const stockCode = searchParams.get('code');
    const priceParam = searchParams.get('price');
    const changeRateParam = searchParams.get('changeRate');

    if (!stockName) {
      return NextResponse.json(
        { error: 'name 파라미터가 필요합니다' },
        { status: 400 },
      );
    }

    const price = priceParam != null ? parseFloat(priceParam) : 0;
    const changeRate = changeRateParam != null ? parseFloat(changeRateParam) : 0;
    const changeRateStr = `${changeRate >= 0 ? '+' : ''}${changeRate.toFixed(2)}%`;
    const priceStr = price > 0 ? price.toLocaleString('ko-KR') + '원' : '정보 없음';

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'OPENROUTER_API_KEY가 설정되지 않았습니다' },
        { status: 500 },
      );
    }

    const codeLabel = stockCode ? ` (종목코드: ${stockCode})` : '';

    const prompt = `당신은 전문 한국 주식 시장 기업 분석 애널리스트입니다.
분석 대상: ${stockName}${codeLabel}
현재가: ${priceStr} (${changeRateStr})

## 작성 원칙 (반드시 준수)
1. 모든 내용은 반드시 **${stockName}에만 해당하는 사실**이어야 합니다.
2. 다른 회사(경쟁사 포함)의 수치·사례·고객사 정보를 ${stockName}에 혼용하지 마세요.
3. 구체적 수치는 ${stockName}의 실제 공시·IR·애널리스트 보고서 기반으로 작성하세요.
4. 불확실한 수치에는 반드시 "약", "추정", "전망" 등의 단서를 붙이세요.
5. "글로벌 경기 불확실성", "금리 리스크" 같은 일반론 표현은 절대 사용하지 마세요.

## 출력 형식 (JSON만 반환, 설명 없이)
{
  "companyGuidance": "${stockName} 경영진이 최근 실적발표에서 제시한 중기/장기 가이던스. 매출 목표·마진 목표 등 구체적 수치 포함. 2-3문장.",
  "shortTerm": "${stockName}의 향후 3개월 실적·주가 전망. 예정된 실적발표·제품출시·수주 이벤트 언급. 2-3문장.",
  "longTerm": "${stockName}의 향후 6개월 실적·주가 전망. 구조적 성장 동력과 목표주가 근거 포함. 2-3문장.",
  "targetPriceRange": { "low": 원화정수, "consensus": 원화정수, "high": 원화정수 },
  "opportunities": [
    "${stockName}의 기회요인 1: 핵심 성장 동력. ${stockName} 고유의 시장 규모·수주·시기 등 수치 포함",
    "${stockName}의 기회요인 2: 동종업계 대비 ${stockName}만의 경쟁 우위 또는 차별화 요소",
    "${stockName}의 기회요인 3: ${stockName}이 수혜를 받는 정책·규제·산업 트렌드, 구체적 수치 포함"
  ],
  "risks": [
    "${stockName}의 리스크 1: 현재 가장 큰 실적 하방 압력. ${stockName}의 주요 고객사·매출 비중·금액 명시",
    "${stockName}의 리스크 2: ${stockName}의 원가·환율·경쟁 관련 수익성 리스크. 현재 수준과 영향도 명시",
    "${stockName}의 리스크 3: ${stockName}과 관련된 규제·소송·지배구조 등 구조적 리스크"
  ],
  "outlook": "bullish 또는 neutral 또는 bearish",
  "sources": ["출처1", "출처2"]
}

추가 규칙:
- 모든 텍스트 필드는 반드시 한국어로 작성. 영어·중국어·일본어 사용 금지.
- targetPriceRange의 low/consensus/high는 반드시 원화 정수.
- opportunities와 risks는 각각 정확히 3개.
- JSON 외 다른 텍스트 절대 출력 금지.`;

    const { content: jsonStr, model: usedModel } = await callLlm(apiKey, prompt);
    const analysis = JSON.parse(jsonStr) as KrStockAnalysis;

    const tpr = analysis.targetPriceRange;
    const targetPriceRange =
      tpr &&
      typeof tpr.low === 'number' &&
      typeof tpr.consensus === 'number' &&
      typeof tpr.high === 'number'
        ? tpr
        : null;

    return NextResponse.json({
      stockName,
      stockCode: stockCode ?? null,
      price,
      changeRate,
      model: modelDisplayLabel(usedModel),
      modelCutoff: usedModel.cutoff,
      analysis: {
        companyGuidance: analysis.companyGuidance,
        shortTerm: analysis.shortTerm,
        longTerm: analysis.longTerm,
        targetPriceRange,
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
