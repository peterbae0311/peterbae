import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { getTokenKeyValue } from '@/lib/tokenStore';

/**
 * 대시보드 카드용 이미지를 생성한다 — image_studio의 HF FLUX.1-schnell → Pollinations.ai
 * 폴백 패턴(app.js의 generateImage)과 동일한 전략이지만, 여기서는 hub 내부 라우트라
 * 클라이언트가 아닌 서버에서 두 provider를 순서대로 직접 호출한다(image_studio는 별도
 * 정적 사이트라 프록시를 거쳐야 했던 것과 다름).
 */
// 최종 카드 배너는 3:2(560x374, page.tsx의 CARD_IMAGE_WIDTH/HEIGHT 참고)지만, 여기서 쓰는
// 무료 모델(FLUX.1-schnell/Pollinations flux-realism)은 3:2(768x512)로 직접 요청해도
// 여전히 가로로 늘어난 왜곡을 냈다(실측 확인, 사용자 제보) — 두 provider 모두 정사각형이
// 아닌 비율에서 진짜 멀티 종횡비 생성이 아니라 정사각형 결과를 비균등 리사이즈하는 것으로
// 보인다. 그래서 아예 정사각형(1:1)으로만 생성해 왜곡 가능성 자체를 없애고, 클라이언트의
// cropToCardWebp가 중앙을 crop(리사이즈가 아니라 잘라내기라 왜곡 없음)해서 최종 규격으로
// 변환한다.
const GEN_WIDTH = 768;
const GEN_HEIGHT = 768;
// 카드 배너는 사진이 아니라 앱을 상징하는 배너라 image_studio의 포토리얼리스틱 스타일 대신
// 플랫 일러스트 톤으로 지정. "텍스트 절대 생성 금지" 요구사항은 프롬프트 지시 + negative
// prompt 이중으로 넣지만, 생성형 모델 특성상 100% 보장은 아니다.
// "abstract geometric shapes"를 고정 지시했던 이전 버전은 카드 제목/설명과 전혀 무관한
// 추상 무늬만 나온다는 제보가 있어(실측 확인) 제거 — 대신 아래 sceneFor()가 만든 구체적인
// 장면 묘사가 스타일과 함께 실제 내용을 좌우하게 한다.
const STYLE_PREFIX =
  'modern flat vector illustration, minimalist tech app banner, clean simple design, ' +
  'vibrant colors, high quality, no text anywhere';
const NEGATIVE_PROMPT =
  'text, letters, words, numbers, typography, captions, watermark, logo, signature, label, ' +
  'title, subtitle, heading, caption, low quality, blurry, photorealistic, human face, realistic photo';

interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

// 이미지 생성 모델(FLUX.1-schnell/Pollinations)은 한글 프롬프트를 사실상 이해하지 못해
// 카드 제목/설명을 한글 그대로 넘기면 내용과 무관한 결과가 나온다(실측 확인, 사용자 제보).
// 그래서 생성 전에 별도 텍스트 LLM으로 한글 제목/설명을 짧은 영어 장면 묘사로 바꾼다 —
// manage_token(Key 관리)에 이미 등록돼 있고 image_studio도 쓰는 범용 키(OPENROUTER_API_KEY/
// GROQ_API_KEY/HF_TOKEN)를 그대로 재사용한다.
async function sceneFor(label: string, description: string): Promise<string | null> {
  const providers = [
    { url: 'https://openrouter.ai/api/v1/chat/completions', keyName: 'OPENROUTER_API_KEY', model: 'nvidia/nemotron-3-super-120b-a12b:free' },
    { url: 'https://api.groq.com/openai/v1/chat/completions', keyName: 'GROQ_API_KEY', model: 'openai/gpt-oss-120b' },
    { url: 'https://router.huggingface.co/v1/chat/completions', keyName: 'HF_TOKEN', model: 'meta-llama/Llama-3.1-8B-Instruct' },
  ] as const;

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content:
        'You write short, concrete English visual-scene descriptions (max 2 sentences) for AI image ' +
        'generation banners that represent a software app\'s function. Respond with ONLY the scene ' +
        'description in English — no preamble, no quotes, no style words. The scene must contain no ' +
        'readable text, letters, numbers, or logos.',
    },
    {
      role: 'user',
      content: `App name (Korean): ${label}${description ? `\nApp description (Korean): ${description}` : ''}`,
    },
  ];

  for (const p of providers) {
    const apiKey = await getTokenKeyValue(p.keyName);
    if (!apiKey) continue;
    try {
      const res = await fetch(p.url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: p.model, messages, max_tokens: 150, temperature: 0.6 }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) continue;
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content;
      if (typeof content === 'string' && content.trim()) return content.trim();
    } catch {
      continue;
    }
  }
  return null;
}

async function generateWithHF(prompt: string): Promise<{ dataUrl: string } | null> {
  const hfToken = await getTokenKeyValue('HF_TOKEN');
  if (!hfToken) return null;
  try {
    const res = await fetch(
      'https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${hfToken}`,
          'Content-Type': 'application/json',
          'x-use-cache': 'false',
        },
        body: JSON.stringify({
          inputs: prompt,
          parameters: { width: GEN_WIDTH, height: GEN_HEIGHT, num_inference_steps: 4, negative_prompt: NEGATIVE_PROMPT },
        }),
        signal: AbortSignal.timeout(60_000),
      }
    );
    if (!res.ok) return null; // rate limit(429)을 포함해 모든 실패는 Pollinations 폴백으로 넘긴다.
    const buffer = await res.arrayBuffer();
    const contentType = res.headers.get('content-type') || 'image/jpeg';
    return { dataUrl: `data:${contentType};base64,${Buffer.from(buffer).toString('base64')}` };
  } catch {
    return null;
  }
}

async function generateWithPollinations(prompt: string): Promise<{ dataUrl: string }> {
  const seed = Math.floor(Math.random() * 9_999_999);
  const params = new URLSearchParams({
    width: String(GEN_WIDTH),
    height: String(GEN_HEIGHT),
    seed: String(seed),
    model: 'flux-realism',
    nologo: 'true',
    negative: NEGATIVE_PROMPT,
    enhance: 'false',
  });
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?${params}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(90_000) });
  if (!res.ok) throw new Error(`이미지 생성 실패(Pollinations ${res.status})`);
  const buffer = await res.arrayBuffer();
  const contentType = res.headers.get('content-type') || 'image/jpeg';
  return { dataUrl: `data:${contentType};base64,${Buffer.from(buffer).toString('base64')}` };
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const label = typeof body?.label === 'string' ? body.label.trim() : '';
  const description = typeof body?.description === 'string' ? body.description.trim() : '';
  if (!label) {
    return NextResponse.json({ error: '카드 제목을 먼저 입력해주세요.' }, { status: 400 });
  }

  // 한글 제목/설명을 이미지 모델이 실제로 반영할 수 있도록 영어 장면 묘사로 먼저 변환하고,
  // 텍스트 LLM이 전부 실패하면(드묾) 원문이라도 넘겨 생성 자체는 계속되게 한다.
  const scene = (await sceneFor(label, description)) || `${label}${description ? `, ${description}` : ''}`;
  const prompt = `${STYLE_PREFIX}, ${scene}`;

  try {
    const hfResult = await generateWithHF(prompt);
    if (hfResult) return NextResponse.json({ dataUrl: hfResult.dataUrl, provider: 'huggingface' });

    const pollinationsResult = await generateWithPollinations(prompt);
    return NextResponse.json({ dataUrl: pollinationsResult.dataUrl, provider: 'pollinations' });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '이미지 생성 중 오류가 발생했습니다.' },
      { status: 502 }
    );
  }
}
