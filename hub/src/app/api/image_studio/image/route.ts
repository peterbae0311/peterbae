import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { getTokenKeyValue } from '@/lib/tokenStore';

/**
 * image_studio의 이미지 생성(Hugging Face FLUX.1-schnell)을 대행하는 프록시.
 * 응답이 바이너리라 course_planning류의 텍스트 프록시와는 다르지만, 이미지 한 장
 * (보통 수백KB~2MB)은 오디오 파일(수십MB, STT는 그래서 프록시 대상에서 제외함)과
 * 비교하면 훨씬 작고 폴링 없는 단발 요청이라 hub 서버(RAM 500MB)에서도 감당 가능하다고
 * 판단해 프록시 대상에 포함했다. Pollinations 폴백은 키가 필요 없는 공개 API라
 * 클라이언트가 계속 직접 호출한다.
 */
// 실측(2026-08-15): black-forest-labs/FLUX.1-schnell은 hf-inference provider로는
// 410(deprecated)을 반환한다. inferenceProviderMapping상 together/fal-ai 등으로는
// 아직 살아있지만, 각 provider가 { inputs, parameters } 형식이 아닌 자기 고유의
// 요청 스펙을 요구해서(실측: together는 400 "Model not supported") 단순 URL 치환으로
// 안 끝난다 — provider별 스펙을 새로 맞추는 건 범위 밖이라 원래 엔드포인트를 유지하고,
// 클라이언트의 Pollinations 폴백이 HF 실패 시(어떤 이유든) 항상 받아주도록 넓혀뒀다.
const HF_IMAGE_URL = 'https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell';

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const prompt = body?.prompt;
  const width = body?.width;
  const height = body?.height;
  const negativePrompt = body?.negativePrompt;

  if (typeof prompt !== 'string' || !prompt || typeof width !== 'number' || typeof height !== 'number') {
    return NextResponse.json({ error: 'prompt/width/height가 필요합니다.' }, { status: 400 });
  }

  const hfToken = await getTokenKeyValue('HF_TOKEN');
  if (!hfToken) {
    return NextResponse.json({ error: 'Key 관리에 HF_TOKEN 값이 등록되어 있지 않습니다.' }, { status: 500 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(HF_IMAGE_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${hfToken}`,
        'Content-Type': 'application/json',
        'x-use-cache': 'false',
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          width,
          height,
          num_inference_steps: 4,
          ...(typeof negativePrompt === 'string' ? { negative_prompt: negativePrompt } : {}),
        },
      }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    return NextResponse.json({ error: 'HuggingFace 호출 중 네트워크 오류가 발생했습니다.' }, { status: 502 });
  }

  if (!upstream.ok) {
    const errText = await upstream.text().catch(() => '');
    return NextResponse.json(
      { error: `HF API ${upstream.status}: ${errText.slice(0, 200)}` },
      { status: upstream.status },
    );
  }

  const buffer = await upstream.arrayBuffer();
  const contentType = upstream.headers.get('content-type') || 'image/jpeg';
  const base64 = Buffer.from(buffer).toString('base64');
  return NextResponse.json({ dataUrl: `data:${contentType};base64,${base64}` });
}
