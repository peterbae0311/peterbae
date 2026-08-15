/**
 * good-words 카테고리 CRUD — Oracle good_words_categories 테이블.
 * id는 good_words.category가 FK로 참조하는 안정적 식별자라 라벨을 바꿔도 안 바뀐다
 * (기존 8종은 예전 슬러그를 id로 시드, 신규 카테고리는 randomUUID() 발급 — oracle/good-words-schema.sql 참고).
 * 카테고리 삭제는 DB의 ON DELETE CASCADE가 관련 good_words 행을 원자적으로 함께 지운다.
 */
import 'server-only';
import { randomUUID } from 'crypto';
import { withConnection } from './oracleDb';

export interface GoodWordsCategory {
  id: string;
  label: string;
  sortOrder: number;
}

interface CategoryRow {
  ID: string;
  LABEL: string;
  SORT_ORDER: number;
}

function serialize(row: CategoryRow): GoodWordsCategory {
  return { id: row.ID, label: row.LABEL, sortOrder: row.SORT_ORDER };
}

export async function listCategories(): Promise<GoodWordsCategory[]> {
  return withConnection(async (conn) => {
    const result = await conn.execute<CategoryRow>(
      `SELECT id, label, sort_order FROM good_words_categories ORDER BY sort_order ASC`
    );
    return (result.rows ?? []).map(serialize);
  });
}

/** 대소문자/좌우 공백 무시하고 동일 라벨이 이미 존재하는지 확인 (excludeId: 이름 변경 시 자기 자신 제외). */
export async function categoryLabelExists(label: string, excludeId?: string): Promise<boolean> {
  return withConnection(async (conn) => {
    const result = await conn.execute<{ CNT: number }>(
      `SELECT COUNT(*) AS cnt FROM good_words_categories
       WHERE LOWER(label) = LOWER(:label) ${excludeId ? 'AND id != :excludeId' : ''}`,
      excludeId ? { label, excludeId } : { label }
    );
    return (result.rows?.[0]?.CNT ?? 0) > 0;
  });
}

export async function getCategoryLabel(id: string): Promise<string | null> {
  return withConnection(async (conn) => {
    const result = await conn.execute<{ LABEL: string }>(
      `SELECT label FROM good_words_categories WHERE id = :id`,
      { id }
    );
    return result.rows?.[0]?.LABEL ?? null;
  });
}

export async function createCategory(label: string): Promise<GoodWordsCategory> {
  return withConnection(async (conn) => {
    const maxResult = await conn.execute<{ MAXORDER: number | null }>(
      `SELECT MAX(sort_order) AS maxOrder FROM good_words_categories`
    );
    const nextOrder = (maxResult.rows?.[0]?.MAXORDER ?? -1) + 1;
    const id = randomUUID();
    await conn.execute(
      `INSERT INTO good_words_categories (id, label, sort_order) VALUES (:id, :label, :sortOrder)`,
      { id, label, sortOrder: nextOrder }
    );
    return { id, label, sortOrder: nextOrder };
  });
}

/** 반환값: 실제로 행이 갱신됐는지 여부 (존재하지 않는 id면 false). */
export async function renameCategory(id: string, label: string): Promise<boolean> {
  return withConnection(async (conn) => {
    const result = await conn.execute(
      `UPDATE good_words_categories SET label = :label WHERE id = :id`,
      { label, id }
    );
    return (result.rowsAffected ?? 0) > 0;
  });
}

/** 카테고리 삭제 — FK의 ON DELETE CASCADE로 관련 good_words 행도 함께 제거됨. */
export async function deleteCategory(id: string): Promise<boolean> {
  return withConnection(async (conn) => {
    const result = await conn.execute(`DELETE FROM good_words_categories WHERE id = :id`, { id });
    return (result.rowsAffected ?? 0) > 0;
  });
}

export async function reorderCategories(order: string[]): Promise<void> {
  return withConnection(async (conn) => {
    for (let i = 0; i < order.length; i++) {
      await conn.execute(
        `UPDATE good_words_categories SET sort_order = :sortOrder WHERE id = :id`,
        { sortOrder: i, id: order[i] }
      );
    }
  });
}
