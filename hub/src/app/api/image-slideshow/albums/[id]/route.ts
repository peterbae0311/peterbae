import { NextRequest, NextResponse } from 'next/server';
import oracledb from 'oracledb';
import { verifyImageSlideshowRequest } from '@/lib/imageSlideshow/auth';
import { withConnection } from '@/lib/imageSlideshow/oracleDb';
import { deleteObjects } from '@/lib/imageSlideshow/ociStorage';
import { handleApiError } from '@/lib/imageSlideshow/apiError';

interface PathParams {
  params: Promise<{ id: string }>;
}

/** 앨범 메타데이터 수정 (사진 추가/삭제는 /photos 라우트가 담당) */
export async function PATCH(request: NextRequest, { params }: PathParams) {
  const user = await verifyImageSlideshowRequest(request);
  if (!user) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const { name, album_date, music_id, music_name, music_url, music_artist, music_list, cover_photo_id } = body ?? {};

  if (!name || typeof name !== 'string') {
    return NextResponse.json({ error: 'name은 필수입니다.' }, { status: 400 });
  }

  // music_id/name/url/artist는 값이 없으면 null인데, node-oracledb는 타입 힌트 없는 순수
  // JS null만으로는 바인드할 컬럼의 Oracle 타입을 추론하지 못해 NJS-012로 거부한다
  // (null이어도 항상 STRING이라고 명시해줘야 함).
  const nullableString = (v: unknown) => ({ val: v ?? null, type: oracledb.STRING });

  try {
    await withConnection(async (conn) => {
      await conn.execute(
        `UPDATE albums SET
           name = :name,
           album_date = ${album_date ? `TO_DATE(:album_date, 'YYYY-MM-DD')` : 'NULL'},
           music_id = :music_id, music_name = :music_name,
           music_url = :music_url, music_artist = :music_artist,
           music_list = :music_list,
           cover_photo_id = :cover_photo_id
         WHERE id = :id`,
        {
          id,
          name,
          ...(album_date ? { album_date } : {}),
          music_id: nullableString(music_id),
          music_name: nullableString(music_name),
          music_url: nullableString(music_url),
          music_artist: nullableString(music_artist),
          music_list: { val: JSON.stringify(music_list ?? []), type: oracledb.CLOB },
          cover_photo_id: nullableString(cover_photo_id),
        }
      );
    });
  } catch (err) {
    return handleApiError(err);
  }

  return NextResponse.json({ ok: true });
}

/** 앨범 삭제 — 사진 오브젝트를 OCI에서 먼저 정리(best-effort)한 뒤 행 삭제(photos는 FK cascade) */
export async function DELETE(request: NextRequest, { params }: PathParams) {
  const user = await verifyImageSlideshowRequest(request);
  if (!user) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });

  const { id } = await params;

  try {
    await withConnection(async (conn) => {
      const photoResult = await conn.execute<{ STORAGE_PATH: string }>(
        `SELECT storage_path FROM photos WHERE album_id = :id`,
        { id }
      );
      const paths = (photoResult.rows ?? []).map((r) => r.STORAGE_PATH);
      await deleteObjects(paths);

      await conn.execute(`DELETE FROM albums WHERE id = :id`, { id });
    });
  } catch (err) {
    return handleApiError(err);
  }

  return NextResponse.json({ ok: true });
}
