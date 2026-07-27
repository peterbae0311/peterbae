import { NextRequest, NextResponse } from 'next/server';
import { serverEnv } from '@/lib/env.server';
import { appendSapGlossary } from '@/lib/sap-glossary';

const OR_URL   = 'https://openrouter.ai/api/v1/chat/completions';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

// OpenRouter: 현재 유효한 무료 모델 (2026-07 기준)
const OR_MODELS = [
  'qwen/qwen3-next-80b-a3b-instruct:free',
  'openai/gpt-oss-120b:free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'nousresearch/hermes-3-llama-3.1-405b:free',
];
const GROQ_MODEL = 'llama-3.3-70b-versatile';

export async function POST(request: NextRequest) {
  const apiKey = serverEnv.openrouterApiKey ?? serverEnv.groqApiKey;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'AI 기능을 사용하려면 .env에 OPENROUTER_API_KEY 또는 GROQ_API_KEY를 설정해주세요.' },
      { status: 501 }
    );
  }

  const { company_name, recruitment_notice, notes, urls, question, char_limit } = await request.json();

  if (!question?.trim()) {
    return NextResponse.json({ error: '문항 내용이 없습니다.' }, { status: 400 });
  }

  const systemPrompt = `당신은 취업 전문 컨설턴트입니다. 지원자의 정보를 바탕으로 자기소개서 문항에 대한 답변을 작성합니다.
- 오직 한국어(한글+필요한 영문 기술명)로만 작성합니다. 한자, 베트남어, 러시아어, 일본어 등 다른 언어 문자는 절대 사용하지 않습니다.
- 한국어 문장 안에 다른 언어 단어를 절대 삽입하지 않습니다 (예: "tham gia", "開発者" 금지).
- 답변은 자연스럽고 진정성/간절함/일관성 있고, 지원자의 관점에서 1인칭으로 작성합니다.
- 글자수 제한이 있으면 반드시 해당 글자수에 최대한 근접하게 작성합니다 (공백 포함, 제한의 98% 이상 채울 것).
- 글자수가 부족하면 구체적인 경험, 각오, 포부를 추가하여 반드시 목표 글자수를 채웁니다.
- 설명이나 머리말 없이 답변 내용만 출력합니다.`;

  const contextParts: string[] = [];
  if (company_name)       contextParts.push(`회사/기관명: ${company_name}`);
  if (recruitment_notice) contextParts.push(`모집 요강:\n${recruitment_notice}`);
  if (notes)              contextParts.push(`기타 사항:\n${notes}`);
  if (urls?.length)       contextParts.push(`참고 URL:\n${(urls as { title: string; url: string }[]).map(u => `- ${u.title}: ${u.url}`).join('\n')}`);

  const charInstruction = char_limit
    ? `글자수 제한: ${char_limit}자 (공백 포함).\n⚠️ 반드시 ${Math.round(char_limit * 0.98)}자 이상 ${char_limit}자 이하로 작성하세요.\n글자수가 ${Math.round(char_limit * 0.98)}자 미만이면 구체적인 경험·각오·포부 문장을 추가하여 반드시 ${char_limit}자에 도달하세요.`
    : '글자수 제한 없음';

  const userPrompt = `## 회사/기관 정보
${contextParts.join('\n\n') || '(정보 없음)'}

## 문항
${question}

## 작성 조건
${charInstruction}

위 문항에 대한 자기소개서 답변을 작성해주세요.`;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user',   content: userPrompt },
  ];
  const maxTokens = Math.min((char_limit ?? 800) * 3, 4000);

  // OpenRouter 시도 (모델 순서대로)
  if (serverEnv.openrouterApiKey) {
    for (const model of OR_MODELS) {
      try {
        const res = await fetch(OR_URL, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${serverEnv.openrouterApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ model, max_tokens: maxTokens, messages }),
        });

        if (res.ok) {
          const data = await res.json();
          let answer = sanitizeKorean((data.choices?.[0]?.message?.content ?? '').trim());
          answer = appendSapGlossary(truncate(answer, char_limit));
          return NextResponse.json({ answer, char_count: answer.length, model });
        }

        const errText = await res.text();
        console.warn(`[generate] OR ${model} 실패 (${res.status}):`, errText.slice(0, 200));
      } catch (e) {
        console.warn(`[generate] OR ${model} 연결 오류:`, e);
      }
    }
  }

  // Groq 폴백
  if (serverEnv.groqApiKey) {
    try {
      const res = await fetch(GROQ_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serverEnv.groqApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model: GROQ_MODEL, max_tokens: maxTokens, temperature: 0.85, messages }),
      });

      if (res.ok) {
        const data = await res.json();
        let answer = sanitizeKorean((data.choices?.[0]?.message?.content ?? '').trim());
        answer = truncate(answer, char_limit);

        // 글자수 미달 시 2차 보완 요청
        if (char_limit && answer.length < char_limit * 0.9) {
          const needed = char_limit - answer.length;
          const expandMessages = [
            ...messages,
            { role: 'assistant', content: answer },
            { role: 'user', content: `현재 답변은 ${answer.length}자입니다. ${char_limit}자 기준으로 ${needed}자가 부족합니다. 기존 내용 끝에 이어서 구체적인 경험, 각오, 포부를 추가하여 총 ${char_limit}자를 채워 완성하세요. 추가 내용만 출력하세요.` },
          ];
          const res2 = await fetch(GROQ_URL, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${serverEnv.groqApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ model: GROQ_MODEL, max_tokens: needed * 3, temperature: 0.85, messages: expandMessages }),
          });
          if (res2.ok) {
            const data2 = await res2.json();
            const extra = sanitizeKorean((data2.choices?.[0]?.message?.content ?? '').trim());
            answer = truncate(answer + ' ' + extra, char_limit);
          }
        }

        answer = appendSapGlossary(answer);
        return NextResponse.json({ answer, char_count: answer.length, model: GROQ_MODEL });
      }

      const errText = await res.text();
      console.error('[generate] Groq 실패:', errText.slice(0, 300));
      return NextResponse.json({ error: `AI 생성 오류: ${errText.slice(0, 200)}` }, { status: 500 });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[generate] Groq 연결 오류:', msg);
      return NextResponse.json({ error: `연결 오류: ${msg}` }, { status: 500 });
    }
  }

  return NextResponse.json({ error: 'AI 키가 설정되지 않았습니다.' }, { status: 501 });
}

function sanitizeKorean(text: string): string {
  // 한자(CJK), 베트남 발음기호 등 비한국어 문자 제거 후 공백 정리
  return text
    .replace(/[一-鿿㐀-䶿]/g, '')  // 한자(CJK)
    .replace(/[àáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿ]/gi, '')  // 라틴 발음기호
    .replace(/ {2,}/g, ' ')
    .trim();
}

function truncate(answer: string, char_limit: number | null | undefined): string {
  if (!char_limit || answer.length <= char_limit) return answer;
  const truncated = answer.slice(0, char_limit);
  const lastPunct = Math.max(
    truncated.lastIndexOf('다.'),
    truncated.lastIndexOf('요.'),
    truncated.lastIndexOf('.'),
  );
  return lastPunct > char_limit * 0.8 ? truncated.slice(0, lastPunct + 1) : truncated;
}
