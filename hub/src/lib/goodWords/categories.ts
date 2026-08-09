/**
 * good-words 카테고리 정의. API 요청/응답과 DB의 category 컬럼에는 key를 쓰고,
 * 화면에는 label을 보여준다. 클라이언트 컴포넌트에서도 import하므로 'server-only' 아님.
 */
export interface GoodWordsCategory {
  key: string;
  label: string;
}

export const GOOD_WORDS_CATEGORIES: GoodWordsCategory[] = [
  { key: 'comfort',      label: '위로' },
  { key: 'love',         label: '사랑' },
  { key: 'family',       label: '가족' },
  { key: 'life',         label: '인생' },
  { key: 'relationship', label: '인간관계' },
  { key: 'courage',      label: '용기' },
  { key: 'gratitude',    label: '감사' },
  { key: 'rest',         label: '쉼' },
];

export function isValidCategoryKey(key: unknown): key is string {
  return typeof key === 'string' && GOOD_WORDS_CATEGORIES.some((c) => c.key === key);
}

export function categoryLabel(key: string): string {
  return GOOD_WORDS_CATEGORIES.find((c) => c.key === key)?.label ?? key;
}
