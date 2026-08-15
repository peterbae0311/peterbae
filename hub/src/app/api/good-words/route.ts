import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { checkGoodWordsContent } from '@/lib/goodWords/guardrail';
import { withConnection, formatOracleTimestamp } from '@/lib/goodWords/oracleDb';
import { handleApiError } from '@/lib/goodWords/apiError';

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
    if (typeof item?.category !== 'string' || !item.category || typeof item?.content !== 'string') {
      rejected.push({ content: String(item?.content ?? ''), reason: '형식이 올바르지 않습니다.' });
      continue;
    }
    const check = checkGoodWordsContent(item.content);
    if (!check.ok) {
      rejected.push({ content: item.content, reason: check.reason ?? '가드레일 위반' });
      continue;
    }
    const source = typeof item?.source === 'string' && item.source.trim() ? item.source.trim() : null;
    toInsert.push({ category: item.category, content: item.content.trim(), source });
  }

  try {
    let saved = 0;
    if (toInsert.length > 0) {
      await withConnection(async (conn) => {
        for (const item of toInsert) {
          try {
            await conn.execute(
              `INSERT INTO good_words (id, category, content, source, created_by)
               VALUES (:id, :category, :content, :source, :created_by)`,
              { id: randomUUID(), category: item.category, content: item.content, source: item.source, created_by: user.email }
            );
            saved++;
          } catch (err) {
            // ORA-02291: 부모 키(카테고리)가 없음 — 저장 도중 카테고리가 삭제된 경우.
            if (err instanceof Error && err.message.includes('ORA-02291')) {
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
