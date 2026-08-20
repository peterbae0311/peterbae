import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { getObjective, saveRefinedDraft } from '@/lib/refineObjectives/db';
import { callChatWithFallback } from '@/lib/refineObjectives/aiProviders';
import { handleApiError } from '@/lib/refineObjectives/apiError';
import { DEFAULT_REFINE_PROMPT } from '@/lib/refineObjectives/prompt';

const MAX_PROMPT_LENGTH = 4000;

/** 절차2 — 개별 학습목표 단위로 AI가 문장을 다듬어 refined_text(초안)에 저장한다(확정 아님). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const customPrompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';
  if (customPrompt.length > MAX_PROMPT_LENGTH) {
    return NextResponse.json({ error: `프롬프트는 ${MAX_PROMPT_LENGTH}자 이내여야 합니다.` }, { status: 400 });
  }

  try {
    const objective = await getObjective(supabase, id);
    if (!objective) return NextResponse.json({ error: '존재하지 않는 학습목표입니다.' }, { status: 404 });

    const { content, provider, failures } = await callChatWithFallback(
      [
        { role: 'system', content: customPrompt || DEFAULT_REFINE_PROMPT },
        { role: 'user', content: objective.confirmed_text },
      ],
      { maxTokens: 500, temperature: 0.4 }
    );

    const refinedText = content.trim().replace(/^["']|["']$/g, '');
    await saveRefinedDraft(supabase, id, refinedText);

    return NextResponse.json({ refined_text: refinedText, provider, providerFailures: failures });
  } catch (err) {
    return handleApiError(err);
  }
}
