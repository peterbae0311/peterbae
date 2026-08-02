import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import oracledb from 'oracledb';
import { verifyImageSlideshowRequest } from '@/lib/imageSlideshow/auth';
import { withConnection, formatOracleDate, formatOracleTimestamp } from '@/lib/imageSlideshow/oracleDb';
import { handleApiError } from '@/lib/imageSlideshow/apiError';

interface AlbumRow {
  ID: string;
  NAME: string;
  ALBUM_DATE: unknown;
  MUSIC_ID: string | null;
  MUSIC_NAME: string | null;
  MUSIC_URL: string | null;
  MUSIC_ARTIST: string | null;
  // eungmomoa-db가 19c라 네이티브 JSON 타입이 없어 CLOB(JSON 문자열)로 저장 — fetchAsString 설정 덕에 string으로 옴
  MUSIC_LIST: string | null;
  COVER_PHOTO_ID: string | null;
  CREATED_AT: unknown;
}

interface PhotoRow {
  ID: string;
  ALBUM_ID: string;
  FILENAME: string;
  URL: string;
  SORT_ORDER: number;
}

function serializeAlbum(row: AlbumRow, photos: PhotoRow[]) {
  return {
    id: row.ID,
    name: row.NAME,
    album_date: formatOracleDate(row.ALBUM_DATE),
    music_id: row.MUSIC_ID,
    music_name: row.MUSIC_NAME,
    music_url: row.MUSIC_URL,
    music_artist: row.MUSIC_ARTIST,
    music_list: row.MUSIC_LIST ? JSON.parse(row.MUSIC_LIST) : [],
    cover_photo_id: row.COVER_PHOTO_ID,
    created_at: formatOracleTimestamp(row.CREATED_AT),
    photos: photos
      .filter((p) => p.ALBUM_ID === row.ID)
      .sort((a, b) => a.SORT_ORDER - b.SORT_ORDER)
      .map((p) => ({ id: p.ID, filename: p.FILENAME, url: p.URL, sort_order: p.SORT_ORDER })),
  };
}

/** 앨범 전체 + 각 앨범의 사진 목록 (기존 Supabase의 albums.select('*, photos(...)')와 동일한 응답 모양) */
export async function GET(request: NextRequest) {
  const user = await verifyImageSlideshowRequest(request);
  if (!user) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });

  try {
    const albums = await withConnection(async (conn) => {
      const albumResult = await conn.execute<AlbumRow>(
        `SELECT id, name, album_date, music_id, music_name, music_url, music_artist, music_list, cover_photo_id, created_at
         FROM albums ORDER BY created_at DESC`
      );
      const photoResult = await conn.execute<PhotoRow>(
        `SELECT id, album_id, filename, url, sort_order FROM photos`
      );
      const albumRows = albumResult.rows ?? [];
      const photoRows = photoResult.rows ?? [];
      return albumRows.map((row) => serializeAlbum(row, photoRows));
    });

    return NextResponse.json({ albums });
  } catch (err) {
    return handleApiError(err);
  }
}

/** 앨범 메타데이터만 생성 — 사진/음악 파일은 /upload-url로 먼저 업로드 후 /photos로 별도 등록 */
export async function POST(request: NextRequest) {
  const user = await verifyImageSlideshowRequest(request);
  if (!user) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });

  const body = await request.json();
  const { name, album_date, music_id, music_name, music_url, music_artist, music_list } = body ?? {};

  if (!name || typeof name !== 'string') {
    return NextResponse.json({ error: 'name은 필수입니다.' }, { status: 400 });
  }

  const id = randomUUID();

  // 값이 없으면 null인데, node-oracledb는 타입 힌트 없는 순수 JS null만으로는 바인드할
  // 컬럼의 Oracle 타입을 추론하지 못해 NJS-012로 거부한다(null이어도 STRING 명시 필요).
  const nullableString = (v: unknown) => ({ val: v ?? null, type: oracledb.STRING });

  try {
    await withConnection(async (conn) => {
      await conn.execute(
        `INSERT INTO albums (id, name, album_date, music_id, music_name, music_url, music_artist, music_list)
         VALUES (:id, :name, ${album_date ? `TO_DATE(:album_date, 'YYYY-MM-DD')` : 'NULL'},
                 :music_id, :music_name, :music_url, :music_artist, :music_list)`,
        {
          id,
          name,
          ...(album_date ? { album_date } : {}),
          music_id: nullableString(music_id),
          music_name: nullableString(music_name),
          music_url: nullableString(music_url),
          music_artist: nullableString(music_artist),
          music_list: { val: JSON.stringify(music_list ?? []), type: oracledb.CLOB },
        }
      );
    });
  } catch (err) {
    return handleApiError(err);
  }

  return NextResponse.json({ id }, { status: 201 });
}
