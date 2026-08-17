/**
 * good-words 콘텐츠 가드레일 — 정치/혐오/공격적 표현만 걸러내는 키워드 기반 휴리스틱이다.
 * 완벽한 탐지는 아니고 명백한 위반을 걸러내는 1차 방어선이다.
 *
 * 2026-08-16 화면설계서 반영 때 길이/정확성 검증(80~150자 강제, "실제 원문인지" 검증)까지
 * 한꺼번에 지웠었는데, 그건 "LLM이 원문을 정확히 재현했는지는 검증할 수 없다"는 별개의
 * 결정(사용자 확인)이었을 뿐 — 정치/혐오/욕설 필터까지 없앨 이유는 아니었어서 복원한다.
 */

const POLITICAL_KEYWORDS = [
  '대통령', '국회', '정당', '여당', '야당', '총선', '대선', '탄핵', '정치인',
  '진보진영', '보수진영', '좌파', '우파',
];

const HATE_KEYWORDS = [
  '한남', '김치녀', '틀딱', '급식충', '맘충', '전라디언', '경상디언', '벌레만도',
  '장애인 주제', '병신같', '지방충',
];

const AGGRESSIVE_KEYWORDS = [
  '씨발', '개새끼', '병신', '지랄', '좆', '미친놈', '미친년', '꺼져', '죽어버려',
];

const BANNED_KEYWORD_GROUPS: { label: string; keywords: string[] }[] = [
  { label: '정치', keywords: POLITICAL_KEYWORDS },
  { label: '혐오', keywords: HATE_KEYWORDS },
  { label: '공격적', keywords: AGGRESSIVE_KEYWORDS },
];

export interface GuardrailResult {
  ok: boolean;
  reason?: string;
}

export function checkGoodWordsContent(rawText: string): GuardrailResult {
  const text = rawText.trim();

  for (const group of BANNED_KEYWORD_GROUPS) {
    const hit = group.keywords.find((kw) => text.includes(kw));
    if (hit) {
      return { ok: false, reason: `${group.label} 표현 포함("${hit}")` };
    }
  }

  return { ok: true };
}
