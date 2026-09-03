import { NextResponse } from 'next/server';
import { generateCombinations } from '@/lib/lotto-engine';

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const count = Math.min(Math.max(Number(body.count ?? 5), 1), 100);

  const combinations = generateCombinations(count);

  if (combinations.length === 0) {
    return NextResponse.json({ success: false, error: '조합 생성 실패' }, { status: 500 });
  }
  return NextResponse.json({ success: true, data: { combinations } });
}
