import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { isValidCategoryKey } from '@/lib/goodWords/categories';
import { checkGoodWordsContent } from '@/lib/goodWords/guardrail';
import { withConnection, formatOracleTimestamp } from '@/lib/goodWords/oracleDb';
import { handleApiError } from '@/lib/goodWords/apiError';

interface GoodWordRow {
  ID: string;
  CATEGORY: string;
  CONTENT: string;
  CREATED_AT: unknown;
  CREATED_BY: string;
}

function serialize(row: GoodWordRow) {
  return {
    id: row.ID,
    category: row.CATEGORY,
    content: row.CONTENT,
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
  if (category && !isValidCategoryKey(category)) {
    return NextResponse.json({ error: '유효하지 않은 카테고리입니다.' }, { status: 400 });
  }

  try {
    const rows = await withConnection(async (conn) => {
      const result = await conn.execute<GoodWordRow>(
        `SELECT id, category, content, created_at, created_by FROM good_words
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
}

/** 생성된 후보 중 선택한 항목을 공유 보관함에 저장 — 저장 시점 2차 가드레일 검증. */
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !user.email) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const items: SaveItem[] = Array.isArray(body?.items) ? body.items : [];
  if (items.length === 0) {
    return NextResponse.json({ error: '저장할 항목이 없습니다.' }, { status: 400 });
  }

  const toInsert: SaveItem[] = [];
  const rejected: { content: string; reason: string }[] = [];

  for (const item of items) {
    if (!isValidCategoryKey(item?.category) || typeof item?.content !== 'string') {
      rejected.push({ content: String(item?.content ?? ''), reason: '형식이 올바르지 않습니다.' });
      continue;
    }
    const check = checkGoodWordsContent(item.content);
    if (!check.ok) {
      rejected.push({ content: item.content, reason: check.reason ?? '가드레일 위반' });
      continue;
    }
    toInsert.push({ category: item.category, content: item.content.trim() });
  }

  try {
    if (toInsert.length > 0) {
      await withConnection(async (conn) => {
        for (const item of toInsert) {
          await conn.execute(
            `INSERT INTO good_words (id, category, content, created_by)
             VALUES (:id, :category, :content, :created_by)`,
            { id: randomUUID(), category: item.category, content: item.content, created_by: user.email }
          );
        }
      });
    }

    return NextResponse.json({ saved: toInsert.length, rejected }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
