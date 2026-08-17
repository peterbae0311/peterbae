/**
 * good-words 카테고리 CRUD — Oracle good_words_categories 테이블.
 * id는 good_words.category가 FK로 참조하는 안정적 식별자라 라벨을 바꿔도 안 바뀐다(신규
 * 카테고리는 randomUUID() 발급 — oracle/good-words-schema.sql 참고).
 * 카테고리 삭제는 소프트 삭제다(개별 좋은글 삭제와 동일한 정책) — 관련 good_words 행도
 * 함께 소프트 삭제한다. 예전엔 FK의 ON DELETE CASCADE로 하드 삭제했었는데, 복구 불가능한
 * 삭제라 앱 전체의 "삭제는 소프트 삭제 + 로그 기록" 정책과 어긋나 바꿨다(2026-08-17).
 *
 * 카테고리마다 전용 AI 프롬프트(prompt)를 갖는다 — "수필"과 "명언"은 완전히 다른 기준으로
 * 원문을 찾아야 하므로, 이전의 전역 공용 프롬프트 방식(2026-08-16 한때 존재) 대신 카테고리
 * 관리 모달에서 카테고리별로 직접 편집한다(화면설계서 반영).
 */
import 'server-only';
import { randomUUID } from 'crypto';
import { withConnection } from './oracleDb';

export interface GoodWordsCategory {
  id: string;
  label: string;
  classification: string | null;
  prompt: string;
  sortOrder: number;
}

interface CategoryRow {
  ID: string;
  LABEL: string;
  CLASSIFICATION: string | null;
  PROMPT: string;
  SORT_ORDER: number;
}

function serialize(row: CategoryRow): GoodWordsCategory {
  return { id: row.ID, label: row.LABEL, classification: row.CLASSIFICATION, prompt: row.PROMPT, sortOrder: row.SORT_ORDER };
}

const SELECT_COLUMNS = 'id, label, classification, prompt, sort_order';

export async function listCategories(): Promise<GoodWordsCategory[]> {
  return withConnection(async (conn) => {
    const result = await conn.execute<CategoryRow>(
      `SELECT ${SELECT_COLUMNS} FROM good_words_categories WHERE deleted_at IS NULL ORDER BY sort_order ASC`
    );
    return (result.rows ?? []).map(serialize);
  });
}

export async function getCategory(id: string): Promise<GoodWordsCategory | null> {
  return withConnection(async (conn) => {
    const result = await conn.execute<CategoryRow>(
      `SELECT ${SELECT_COLUMNS} FROM good_words_categories WHERE id = :id AND deleted_at IS NULL`,
      { id }
    );
    const row = result.rows?.[0];
    return row ? serialize(row) : null;
  });
}

/** 대소문자/좌우 공백 무시하고 동일 라벨이 이미 존재하는지 확인 (excludeId: 이름 변경 시 자기 자신 제외). */
export async function categoryLabelExists(label: string, excludeId?: string): Promise<boolean> {
  return withConnection(async (conn) => {
    const result = await conn.execute<{ CNT: number }>(
      `SELECT COUNT(*) AS cnt FROM good_words_categories
       WHERE LOWER(label) = LOWER(:label) AND deleted_at IS NULL ${excludeId ? 'AND id != :excludeId' : ''}`,
      excludeId ? { label, excludeId } : { label }
    );
    return (result.rows?.[0]?.CNT ?? 0) > 0;
  });
}

export interface CategoryInput {
  label: string;
  classification: string | null;
  prompt: string;
}

const MAX_LABEL_LENGTH = 30;
const MAX_CLASSIFICATION_LENGTH = 50;
const MAX_PROMPT_LENGTH = 4000;

/** 카테고리 생성/수정 라우트 공용 입력 검증 — route.ts는 GET/POST 등 정해진 export만 허용되므로 여기 둔다. */
export function parseCategoryInput(body: unknown): { input?: CategoryInput; error?: string } {
  const b = body as Record<string, unknown> | null;
  const label = typeof b?.label === 'string' ? b.label.trim() : '';
  const classification = typeof b?.classification === 'string' ? b.classification.trim() : '';
  const prompt = typeof b?.prompt === 'string' ? b.prompt.trim() : '';

  if (!label) return { error: '제목을 입력해주세요.' };
  if (label.length > MAX_LABEL_LENGTH) return { error: `제목은 ${MAX_LABEL_LENGTH}자 이내로 입력해주세요.` };
  if (classification.length > MAX_CLASSIFICATION_LENGTH) return { error: `분류는 ${MAX_CLASSIFICATION_LENGTH}자 이내로 입력해주세요.` };
  if (!prompt) return { error: 'AI 프롬프트를 입력해주세요.' };
  if (prompt.length > MAX_PROMPT_LENGTH) return { error: `AI 프롬프트는 ${MAX_PROMPT_LENGTH}자 이내로 입력해주세요.` };

  return { input: { label, classification: classification || null, prompt } };
}

export async function createCategory(input: CategoryInput): Promise<GoodWordsCategory> {
  return withConnection(async (conn) => {
    const maxResult = await conn.execute<{ MAXORDER: number | null }>(
      `SELECT MAX(sort_order) AS maxOrder FROM good_words_categories WHERE deleted_at IS NULL`
    );
    const nextOrder = (maxResult.rows?.[0]?.MAXORDER ?? -1) + 1;
    const id = randomUUID();
    await conn.execute(
      `INSERT INTO good_words_categories (id, label, classification, prompt, sort_order)
       VALUES (:id, :label, :classification, :prompt, :sortOrder)`,
      { id, label: input.label, classification: input.classification, prompt: input.prompt, sortOrder: nextOrder }
    );
    return { id, label: input.label, classification: input.classification, prompt: input.prompt, sortOrder: nextOrder };
  });
}

/** 반환값: 실제로 행이 갱신됐는지 여부 (존재하지 않는 id면 false). */
export async function updateCategory(id: string, input: CategoryInput): Promise<boolean> {
  return withConnection(async (conn) => {
    const result = await conn.execute(
      `UPDATE good_words_categories SET label = :label, classification = :classification, prompt = :prompt
       WHERE id = :id AND deleted_at IS NULL`,
      { label: input.label, classification: input.classification, prompt: input.prompt, id }
    );
    return (result.rowsAffected ?? 0) > 0;
  });
}

/**
 * 카테고리 소프트 삭제 — 개별 좋은글 삭제와 동일한 정책(복구 가능한 흔적 남기기). 카테고리
 * 자신과 그 안의 모든 good_words 행을 같은 트랜잭션으로 함께 소프트 삭제한다(autoCommit을
 * 이 호출에서만 꺼서 두 UPDATE가 원자적으로 같이 커밋/롤백되게 한다).
 * 반환값: 실제로 삭제됐는지(이미 삭제됐거나 없는 id면 false).
 */
export async function deleteCategory(id: string, deletedBy: string): Promise<boolean> {
  return withConnection(async (conn) => {
    const catResult = await conn.execute(
      `UPDATE good_words_categories SET deleted_at = SYSTIMESTAMP, deleted_by = :deletedBy
       WHERE id = :id AND deleted_at IS NULL`,
      { deletedBy, id },
      { autoCommit: false }
    );
    const updated = (catResult.rowsAffected ?? 0) > 0;
    if (updated) {
      await conn.execute(
        `UPDATE good_words SET deleted_at = SYSTIMESTAMP, deleted_by = :deletedBy
         WHERE category = :id AND deleted_at IS NULL`,
        { deletedBy, id },
        { autoCommit: false }
      );
    }
    await conn.commit();
    return updated;
  });
}

export async function reorderCategories(order: string[]): Promise<void> {
  return withConnection(async (conn) => {
    for (let i = 0; i < order.length; i++) {
      await conn.execute(
        `UPDATE good_words_categories SET sort_order = :sortOrder WHERE id = :id AND deleted_at IS NULL`,
        { sortOrder: i, id: order[i] }
      );
    }
  });
}
