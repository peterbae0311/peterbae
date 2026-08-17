import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { SUPER_ADMIN_EMAIL } from '@/lib/apps';
import { checkGoodWordsContent } from '@/lib/goodWords/guardrail';
import { withConnection, formatOracleTimestamp } from '@/lib/goodWords/oracleDb';
import { handleApiError } from '@/lib/goodWords/apiError';

const MAX_CONTENT_LENGTH = 4000;
const MAX_SOURCE_LENGTH = 200;

interface GoodWordRow {
  ID: string;
  CATEGORY: string;
  CONTENT: string;
  SOURCE: string | null;
  CREATED_AT: unknown;
  CREATED_BY: string;
}

function serialize(row: GoodWordRow) {
  return {
    id: row.ID,
    category: row.CATEGORY,
    content: row.CONTENT,
    source: row.SOURCE,
    created_at: formatOracleTimestamp(row.CREATED_AT),
    created_by: row.CREATED_BY,
  };
}

/** 전체 공유 보관함 조회 — 로그인한 모든 사용자가 볼 수 있음. */
export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const category = request.nextUrl.searchParams.get('category');

  try {
    const rows = await withConnection(async (conn) => {
      const result = await conn.execute<GoodWordRow>(
        `SELECT id, category, content, source, created_at, created_by FROM good_words
         WHERE deleted_at IS NULL ${category ? 'AND category = :category' : ''}
         ORDER BY created_at DESC`,
        category ? { category } : {}
      );
      return result.rows ?? [];
    });

    return NextResponse.json({ items: rows.map(serialize) });
  } catch (err) {
    return handleApiError(err);
  }
}

interface SaveItem {
  category: string;
  content: string;
  source: string | null;
}

/**
 * 생성된 후보를 공유 보관함에 저장 — 공유 보관함 전체에 영향을 주므로 SUPER_ADMIN만 가능
 * (카테고리 관리와 동일한 권한 모델). 정치/혐오/공격적 표현은 저장 시점에 걸러내되, LLM이
 * 실제 원문을 정확히 재현했는지(저작권 정확성)는 검증하지 않는다 — 확인할 방법이 없음.
 */
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== SUPER_ADMIN_EMAIL) {
    return NextResponse.json({ error: '저장 권한이 없습니다.' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const items: SaveItem[] = Array.isArray(body?.items) ? body.items : [];
  if (items.length === 0) {
    return NextResponse.json({ error: '저장할 항목이 없습니다.' }, { status: 400 });
  }

  const toInsert: SaveItem[] = [];
  const rejected: { content: string; reason: string }[] = [];

  for (const item of items) {
    if (typeof item?.category !== 'string' || !item.category || typeof item?.content !== 'string' || !item.content.trim()) {
      rejected.push({ content: String(item?.content ?? ''), reason: '형식이 올바르지 않습니다.' });
      continue;
    }
    const content = item.content.trim();
    if (content.length > MAX_CONTENT_LENGTH) {
      rejected.push({ content, reason: `내용이 ${MAX_CONTENT_LENGTH}자를 초과합니다.` });
      continue;
    }
    const source = typeof item?.source === 'string' && item.source.trim() ? item.source.trim() : null;
    if (source && source.length > MAX_SOURCE_LENGTH) {
      rejected.push({ content, reason: `출처가 ${MAX_SOURCE_LENGTH}자를 초과합니다.` });
      continue;
    }
    const guard = checkGoodWordsContent(content);
    if (!guard.ok) {
      rejected.push({ content, reason: guard.reason ?? '가드레일 위반' });
      continue;
    }
    toInsert.push({ category: item.category, content, source });
  }

  try {
    let saved = 0;
    if (toInsert.length > 0) {
      await withConnection(async (conn) => {
        for (const item of toInsert) {
          try {
            // "삭제 전까지 계속 누적" — 같은 카테고리에 완전히 동일한 문장이 중복 저장되지
            // 않도록 (category, content_hash, ...) 유니크 인덱스로 DB가 원자적으로 막는다
            // (선행 SELECT-then-INSERT 방식은 두 요청이 동시에 들어오면 둘 다 통과하는
            // 레이스 컨디션이 있었음 — 인덱스 위반(ORA-00001)을 잡는 방식으로 교체).
            await conn.execute(
              `INSERT INTO good_words (id, category, content, source, created_by, content_hash)
               VALUES (:id, :category, :content, :source, :created_by, ORA_HASH(:content))`,
              { id: randomUUID(), category: item.category, content: item.content, source: item.source, created_by: user.email }
            );
            saved++;
          } catch (err) {
            if (err instanceof Error && err.message.includes('ORA-00001')) {
              rejected.push({ content: item.content, reason: '이미 존재하는 항목입니다.' });
            } else if (err instanceof Error && err.message.includes('ORA-02291')) {
              // 부모 키(카테고리)가 없음 — 저장 도중 카테고리가 삭제된 경우.
              rejected.push({ content: item.content, reason: '존재하지 않는 카테고리입니다.' });
            } else {
              throw err;
            }
          }
        }
      });
    }

    return NextResponse.json({ saved, rejected }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
