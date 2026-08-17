import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { SUPER_ADMIN_EMAIL } from '@/lib/apps';
import { checkGoodWordsContent } from '@/lib/goodWords/guardrail';
import { withConnection } from '@/lib/goodWords/oracleDb';
import { handleApiError } from '@/lib/goodWords/apiError';

const MAX_CONTENT_LENGTH = 4000;
const MAX_SOURCE_LENGTH = 200;
const MAX_TRANSLATION_LENGTH = 4000;

/** 좋은글 수정(내용/출처) — 공유 보관함 오남용 방지를 위해 peter.bae0311@gmail.com만 가능. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || user.email !== SUPER_ADMIN_EMAIL) {
    return NextResponse.json({ error: '수정 권한이 없습니다.' }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const content = typeof body?.content === 'string' ? body.content.trim() : '';
  const source = typeof body?.source === 'string' && body.source.trim() ? body.source.trim() : null;
  const translation = typeof body?.translation === 'string' && body.translation.trim() ? body.translation.trim() : null;

  if (!content) {
    return NextResponse.json({ error: '내용을 입력해주세요.' }, { status: 400 });
  }
  if (content.length > MAX_CONTENT_LENGTH) {
    return NextResponse.json({ error: `내용은 ${MAX_CONTENT_LENGTH}자 이내로 입력해주세요.` }, { status: 400 });
  }
  if (source && source.length > MAX_SOURCE_LENGTH) {
    return NextResponse.json({ error: `출처는 ${MAX_SOURCE_LENGTH}자 이내로 입력해주세요.` }, { status: 400 });
  }
  if (translation && translation.length > MAX_TRANSLATION_LENGTH) {
    return NextResponse.json({ error: `번역은 ${MAX_TRANSLATION_LENGTH}자 이내로 입력해주세요.` }, { status: 400 });
  }
  const guard = checkGoodWordsContent(content);
  if (!guard.ok) {
    return NextResponse.json({ error: guard.reason ?? '가드레일 위반' }, { status: 400 });
  }
  if (translation) {
    const translationGuard = checkGoodWordsContent(translation);
    if (!translationGuard.ok) {
      return NextResponse.json({ error: translationGuard.reason ?? '가드레일 위반' }, { status: 400 });
    }
  }

  try {
    const updated = await withConnection(async (conn) => {
      // content_hash도 같이 갱신 — 저장 시점의 중복 방지 유니크 인덱스(category, content_hash)가
      // 이 값을 기준으로 하므로, 수정 후에도 최신 내용과 일치하도록 유지해야 한다.
      const result = await conn.execute(
        `UPDATE good_words SET content = :content, source = :source, translation = :translation, content_hash = ORA_HASH(:content)
         WHERE id = :id AND deleted_at IS NULL`,
        { content, source, translation, id }
      );
      return result.rowsAffected ?? 0;
    });

    if (updated === 0) {
      return NextResponse.json({ error: '존재하지 않거나 삭제된 항목입니다.' }, { status: 404 });
    }

    return NextResponse.json({ id, content, source, translation });
  } catch (err) {
    if (err instanceof Error && err.message.includes('ORA-00001')) {
      return NextResponse.json({ error: '같은 카테고리에 이미 동일한 내용이 있습니다.' }, { status: 409 });
    }
    return handleApiError(err);
  }
}

/** 소프트 삭제 — 공유 보관함 오남용 방지를 위해 peter.bae0311@gmail.com만 가능. */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || user.email !== SUPER_ADMIN_EMAIL) {
    return NextResponse.json({ error: '삭제 권한이 없습니다.' }, { status: 403 });
  }

  const { id } = await params;

  try {
    const updated = await withConnection(async (conn) => {
      const result = await conn.execute(
        `UPDATE good_words SET deleted_at = SYSTIMESTAMP, deleted_by = :email
         WHERE id = :id AND deleted_at IS NULL`,
        { email: user.email, id }
      );
      return result.rowsAffected ?? 0;
    });

    if (updated === 0) {
      return NextResponse.json({ error: '이미 삭제되었거나 존재하지 않습니다.' }, { status: 404 });
    }

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return handleApiError(err);
  }
}
