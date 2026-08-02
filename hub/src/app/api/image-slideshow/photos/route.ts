import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { verifyImageSlideshowRequest } from '@/lib/imageSlideshow/auth';
import { withConnection } from '@/lib/imageSlideshow/oracleDb';
import { deleteObjects } from '@/lib/imageSlideshow/ociStorage';

interface PhotoInput {
  filename: string;
  storagePath: string;
  url: string;
  sortOrder: number;
}

/** OCI 업로드가 끝난 사진들을 albums 하위 photos 행으로 등록 (album_id는 이미 생성된 앨범이어야 함) */
export async function POST(request: NextRequest) {
  const user = await verifyImageSlideshowRequest(request);
  if (!user) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });

  const body = await request.json();
  const albumId: string | undefined = body?.albumId;
  const photos: PhotoInput[] | undefined = body?.photos;

  if (!albumId || !Array.isArray(photos) || photos.length === 0) {
    return NextResponse.json({ error: 'albumId와 photos 배열이 필요합니다.' }, { status: 400 });
  }

  const ids = await withConnection(async (conn) => {
    const inserted: string[] = [];
    for (const photo of photos) {
      const id = randomUUID();
      await conn.execute(
        `INSERT INTO photos (id, album_id, filename, storage_path, url, sort_order)
         VALUES (:id, :albumId, :filename, :storagePath, :url, :sortOrder)`,
        {
          id,
          albumId,
          filename: photo.filename,
          storagePath: photo.storagePath,
          url: photo.url,
          sortOrder: photo.sortOrder ?? 0,
        }
      );
      inserted.push(id);
    }
    return inserted;
  });

  return NextResponse.json({ ids }, { status: 201 });
}

/** 사진 삭제 — OCI 오브젝트를 먼저 정리(best-effort)한 뒤 행 삭제 */
export async function DELETE(request: NextRequest) {
  const user = await verifyImageSlideshowRequest(request);
  if (!user) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });

  const body = await request.json();
  const ids: string[] | undefined = body?.ids;

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'ids 배열이 필요합니다.' }, { status: 400 });
  }

  await withConnection(async (conn) => {
    const bindNames = ids.map((_, i) => `:id${i}`).join(', ');
    const binds = Object.fromEntries(ids.map((id, i) => [`id${i}`, id]));

    const photoResult = await conn.execute<{ STORAGE_PATH: string }>(
      `SELECT storage_path FROM photos WHERE id IN (${bindNames})`,
      binds
    );
    const paths = (photoResult.rows ?? []).map((r) => r.STORAGE_PATH);
    await deleteObjects(paths);

    await conn.execute(`DELETE FROM photos WHERE id IN (${bindNames})`, binds);
  });

  return NextResponse.json({ ok: true });
}
