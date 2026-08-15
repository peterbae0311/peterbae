/**
 * good-words 콘텐츠 가드레일 — 생성 직후(1차)와 저장 시점(2차) 양쪽에서 동일하게 호출한다.
 * 키워드 기반 휴리스틱이라 완벽한 혐오/정치 표현 탐지는 아니고, 명백한 위반을 걸러내는
 * 1차 방어선이다. "비교 금지"의 정확한 기준(타인과의 비교만인지 모든 비유적 비교 포함인지)은
 * hub/CLAUDE.md에 미결정 사항으로 남아 있어, 우선 "명시적 우열/등수 비교" 표현만 걸러낸다.
 */

export const MIN_LENGTH = 80;
export const MAX_LENGTH = 150;

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

// 타인/집단 간 명시적 우열·등수 비교 표현 — 은유적 비교(인생을 계절에 비유 등)까지는 막지 않는다.
const COMPARISON_KEYWORDS = [
  '보다 낫', '보다 못', '보다 우월', '보다 열등', '1등', '꼴찌', '최고이고 나머지',
];

const BANNED_KEYWORD_GROUPS: { label: string; keywords: string[] }[] = [
  { label: '정치', keywords: POLITICAL_KEYWORDS },
  { label: '혐오', keywords: HATE_KEYWORDS },
  { label: '공격적 표현', keywords: AGGRESSIVE_KEYWORDS },
  { label: '비교', keywords: COMPARISON_KEYWORDS },
];

export interface GuardrailResult {
  ok: boolean;
  reason?: string;
}

export function checkGoodWordsContent(rawText: string): GuardrailResult {
  const text = rawText.trim();

  if (text.length < MIN_LENGTH || text.length > MAX_LENGTH) {
    return { ok: false, reason: `길이 위반(${text.length}자, 허용 범위 ${MIN_LENGTH}~${MAX_LENGTH}자)` };
  }

  for (const group of BANNED_KEYWORD_GROUPS) {
    const hit = group.keywords.find((kw) => text.includes(kw));
    if (hit) {
      return { ok: false, reason: `${group.label} 표현 포함("${hit}")` };
    }
  }

  return { ok: true };
}

export interface GuardrailRejection {
  text: string;
  reason: string;
}

export function filterGoodWordsBatch(texts: string[]): {
  passed: string[];
  rejected: GuardrailRejection[];
} {
  const passed: string[] = [];
  const rejected: GuardrailRejection[] = [];

  for (const text of texts) {
    const result = checkGoodWordsContent(text);
    if (result.ok) {
      passed.push(text.trim());
    } else {
      rejected.push({ text, reason: result.reason ?? '알 수 없는 사유' });
    }
  }

  return { passed, rejected };
}
