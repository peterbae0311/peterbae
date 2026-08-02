import { NextRequest, NextResponse } from 'next/server';
import { verifyImageSlideshowRequest } from '@/lib/imageSlideshow/auth';
import { createUploadPar } from '@/lib/imageSlideshow/ociStorage';
import { handleApiError } from '@/lib/imageSlideshow/apiError';

/**
 * 브라우저가 사진/음악 파일을 OCI Object Storage에 직접 PUT할 수 있도록
 * 짧게 유효한 업로드 URL(PAR)을 발급한다. 이 서버는 파일 바이트를 거치지 않는다.
 */
export async function POST(request: NextRequest) {
  const user = await verifyImageSlideshowRequest(request);
  if (!user) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });

  const body = await request.json();
  const path: string | undefined = body?.path;

  if (!path || typeof path !== 'string' || path.includes('..') || path.startsWith('/')) {
    return NextResponse.json({ error: '올바르지 않은 path입니다.' }, { status: 400 });
  }

  try {
    const { uploadUrl, publicUrl } = await createUploadPar(path);
    return NextResponse.json({ uploadUrl, publicUrl });
  } catch (err) {
    return handleApiError(err);
  }
}
