import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import oracledb from 'oracledb';
import { verifyImageSlideshowRequest } from '@/lib/imageSlideshow/auth';
import { withConnection, formatOracleDate, formatOracleTimestamp } from '@/lib/imageSlideshow/oracleDb';

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
  AI_ANALYSIS: string | null;
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
    ai_analysis: row.AI_ANALYSIS,
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

  const albums = await withConnection(async (conn) => {
    const albumResult = await conn.execute<AlbumRow>(
      `SELECT id, name, album_date, music_id, music_name, music_url, music_artist, music_list, ai_analysis, created_at
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

  await withConnection(async (conn) => {
    await conn.execute(
      `INSERT INTO albums (id, name, album_date, music_id, music_name, music_url, music_artist, music_list)
       VALUES (:id, :name, ${album_date ? `TO_DATE(:album_date, 'YYYY-MM-DD')` : 'NULL'},
               :music_id, :music_name, :music_url, :music_artist, :music_list)`,
      {
        id,
        name,
        ...(album_date ? { album_date } : {}),
        music_id: music_id ?? null,
        music_name: music_name ?? null,
        music_url: music_url ?? null,
        music_artist: music_artist ?? null,
        music_list: { val: JSON.stringify(music_list ?? []), type: oracledb.CLOB },
      }
    );
  });

  return NextResponse.json({ id }, { status: 201 });
}
