import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { SUPER_ADMIN_EMAIL } from '@/lib/apps';
import { withConnection } from '@/lib/goodWords/oracleDb';
import { handleApiError } from '@/lib/goodWords/apiError';

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
