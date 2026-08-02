import { NextRequest, NextResponse } from 'next/server';
import oracledb from 'oracledb';
import { verifyImageSlideshowRequest } from '@/lib/imageSlideshow/auth';
import { withConnection } from '@/lib/imageSlideshow/oracleDb';

interface PathParams {
  params: Promise<{ id: string }>;
}

/** "좋은 글" AI 분석 결과만 저장 — albums의 다른 필드는 건드리지 않는 부분 업데이트 */
export async function PATCH(request: NextRequest, { params }: PathParams) {
  const user = await verifyImageSlideshowRequest(request);
  if (!user) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const aiAnalysis: string | undefined = body?.ai_analysis;

  if (typeof aiAnalysis !== 'string') {
    return NextResponse.json({ error: 'ai_analysis(문자열)가 필요합니다.' }, { status: 400 });
  }

  await withConnection(async (conn) => {
    await conn.execute(
      `UPDATE albums SET ai_analysis = :aiAnalysis WHERE id = :id`,
      { id, aiAnalysis: { val: aiAnalysis, type: oracledb.CLOB } }
    );
  });

  return NextResponse.json({ ok: true });
}
