#!/usr/bin/env node
/**
 * Supabase(Postgres + Storage) → Oracle Autonomous DB + OCI Object Storage 데이터 이관.
 * hub 런타임과 무관한 1회성 관리 스크립트 — 인프라가 준비된 뒤 로컬/서버에서 직접 실행한다.
 *
 * 사용법:
 *   cd image_slideshow/oracle
 *   npm install
 *   cp .env.example .env      # 값 채우기
 *   node migrate-data.js --dry-run   # 먼저 연결/권한만 확인 (아무것도 쓰지 않음)
 *   node migrate-data.js             # 실제 이관
 *
 * 재실행 안전성: Oracle에 같은 id의 album이 이미 있으면 그 앨범(사진 포함)은 통째로 건너뛴다.
 * 중간에 실패해도 다시 실행하면 이미 옮겨진 앨범은 건드리지 않고 나머지만 이어서 진행된다.
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const oracledb = require('oracledb');
const common = require('oci-common');
const objectstorage = require('oci-objectstorage');
const { Readable } = require('stream');

const DRY_RUN = process.argv.includes('--dry-run');

function requiredEnv(key) {
  const value = process.env[key];
  if (!value) throw new Error(`환경변수 ${key}가 필요합니다. .env를 확인하세요.`);
  return value;
}

// ── Supabase (이관 원본) ────────────────────────────────────────
const supabase = createClient(
  requiredEnv('SUPABASE_URL'),
  requiredEnv('SUPABASE_SERVICE_ROLE_KEY') // RLS 우회 — 모든 행/파일에 접근해야 함
);
const SUPABASE_STORAGE_BUCKET = 'photos';

// ── Oracle (이관 대상) ──────────────────────────────────────────
oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
oracledb.autoCommit = true;
oracledb.fetchAsString = [oracledb.CLOB];

// ── OCI Object Storage (이관 대상) ─────────────────────────────
const OCI_REGION    = requiredEnv('OCI_REGION');
const OCI_NAMESPACE = requiredEnv('OCI_NAMESPACE');
const OCI_BUCKET    = requiredEnv('OCI_BUCKET');

const ociProvider = new common.SimpleAuthenticationDetailsProvider(
  requiredEnv('OCI_TENANCY_OCID'),
  requiredEnv('OCI_USER_OCID'),
  requiredEnv('OCI_FINGERPRINT'),
  requiredEnv('OCI_PRIVATE_KEY').replace(/\\n/g, '\n'),
  null,
  common.Region.fromRegionId(OCI_REGION)
);
const ociClient = new objectstorage.ObjectStorageClient({ authenticationDetailsProvider: ociProvider });

function publicUrlFor(objectName) {
  return `https://objectstorage.${OCI_REGION}.oraclecloud.com/n/${OCI_NAMESPACE}/b/${OCI_BUCKET}/o/${encodeURIComponent(objectName)}`;
}

/** Supabase Storage 공개 URL에서 버킷 내부 오브젝트 경로만 뽑아낸다. */
function extractSupabaseStoragePath(url) {
  const marker = `/storage/v1/object/public/${SUPABASE_STORAGE_BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return decodeURIComponent(url.slice(idx + marker.length));
}

async function downloadFromSupabase(storagePath) {
  const { data, error } = await supabase.storage.from(SUPABASE_STORAGE_BUCKET).download(storagePath);
  if (error) throw error;
  return Buffer.from(await data.arrayBuffer());
}

async function uploadToOci(objectName, buffer) {
  if (DRY_RUN) return;
  await ociClient.putObject({
    namespaceName: OCI_NAMESPACE,
    bucketName: OCI_BUCKET,
    objectName,
    putObjectBody: Readable.from(buffer),
    contentLength: buffer.length,
  });
}

/** 사진 한 장: Supabase에서 내려받아 같은 경로로 OCI에 업로드하고 새 공개 URL을 돌려준다. */
async function migratePhotoFile(storagePath) {
  const buf = await downloadFromSupabase(storagePath);
  await uploadToOci(storagePath, buf);
  return publicUrlFor(storagePath);
}

/**
 * music_list 이관 — source:'file'(실제 업로드 파일)만 옮기고 URL을 새로 씀.
 * source:'ai'(SoundHelix 등 외부 URL 카탈로그)는 Supabase에 파일이 없으므로 그대로 둔다.
 */
async function migrateMusicList(musicList) {
  const result = [];
  for (const item of musicList) {
    if (item.source === 'file' && item.url) {
      const path = extractSupabaseStoragePath(item.url);
      if (path) {
        try {
          const buf = await downloadFromSupabase(path);
          await uploadToOci(path, buf);
          result.push({ ...item, url: publicUrlFor(path) });
          continue;
        } catch (e) {
          console.warn(`  ⚠ 음악 파일 이관 실패 (${item.name || path}): ${e.message} — 기존 URL 유지`);
        }
      }
    }
    result.push(item);
  }
  return result;
}

async function albumExistsInOracle(conn, id) {
  const r = await conn.execute(`SELECT id FROM albums WHERE id = :id`, { id });
  return (r.rows || []).length > 0;
}

async function insertAlbumOracle(conn, album, musicList) {
  const firstMusicUrl = musicList[0]?.url ?? album.music_url ?? null;
  await conn.execute(
    `INSERT INTO albums (id, name, album_date, music_id, music_name, music_url, music_artist, music_list, ai_analysis, created_at)
     VALUES (:id, :name, ${album.album_date ? `TO_DATE(:album_date, 'YYYY-MM-DD')` : 'NULL'},
             :music_id, :music_name, :music_url, :music_artist, :music_list, :ai_analysis, :created_at)`,
    {
      id: album.id,
      name: album.name,
      ...(album.album_date ? { album_date: album.album_date } : {}),
      music_id: album.music_id ?? null,
      music_name: album.music_name ?? null,
      music_url: firstMusicUrl,
      music_artist: album.music_artist ?? null,
      music_list: { val: JSON.stringify(musicList), type: oracledb.CLOB },
      ai_analysis: { val: album.ai_analysis ?? null, type: oracledb.CLOB },
      created_at: new Date(album.created_at),
    }
  );
}

async function insertPhotoOracle(conn, photo, newUrl) {
  await conn.execute(
    `INSERT INTO photos (id, album_id, filename, storage_path, url, sort_order)
     VALUES (:id, :albumId, :filename, :storagePath, :url, :sortOrder)`,
    {
      id: photo.id,
      albumId: photo.album_id,
      filename: photo.filename,
      storagePath: photo.storage_path,
      url: newUrl,
      sortOrder: photo.sort_order ?? 0,
    }
  );
}

async function main() {
  console.log(DRY_RUN ? '=== DRY RUN (Oracle/OCI에 아무것도 쓰지 않음) ===' : '=== 데이터 이관 시작 ===');

  const { data: albums, error: albumsErr } = await supabase
    .from('albums')
    .select('*, photos(*)')
    .order('created_at', { ascending: true });
  if (albumsErr) throw albumsErr;

  console.log(`Supabase에서 앨범 ${albums.length}개 조회됨`);

  const pool = await oracledb.createPool({
    user: requiredEnv('ORACLE_USER'),
    password: requiredEnv('ORACLE_PASSWORD'),
    connectString: requiredEnv('ORACLE_CONNECT_STRING'),
    poolMin: 0, poolMax: 2, poolIncrement: 1,
  });
  const conn = await pool.getConnection();

  let migrated = 0, skipped = 0, failed = 0;

  try {
    for (const album of albums) {
      try {
        if (await albumExistsInOracle(conn, album.id)) {
          console.log(`⏭  [${album.name}] 이미 이관됨 — 건너뜀`);
          skipped++;
          continue;
        }

        console.log(`→ [${album.name}] 이관 중 (사진 ${album.photos?.length ?? 0}장)...`);

        // Backward compat: 레거시 필드에서 music_list 합성 (app.js의 loadAlbums()와 동일 로직)
        let musicList = Array.isArray(album.music_list) ? album.music_list : [];
        if (musicList.length === 0 && album.music_url) {
          musicList = [{
            id: album.music_id, name: album.music_name, artist: album.music_artist,
            url: album.music_url, source: album.music_id ? 'ai' : 'file',
          }];
        }
        const migratedMusicList = await migrateMusicList(musicList);

        if (!DRY_RUN) await insertAlbumOracle(conn, album, migratedMusicList);

        for (const photo of album.photos || []) {
          try {
            const newUrl = await migratePhotoFile(photo.storage_path);
            if (!DRY_RUN) await insertPhotoOracle(conn, photo, newUrl);
          } catch (e) {
            console.warn(`  ⚠ 사진 이관 실패 (${photo.filename}): ${e.message}`);
          }
        }

        migrated++;
      } catch (e) {
        console.error(`✗ [${album.name}] 이관 실패:`, e.message);
        failed++;
      }
    }
  } finally {
    await conn.close();
    await pool.close(0);
  }

  console.log('\n=== 완료 ===');
  console.log(`이관: ${migrated}, 건너뜀(이미 존재): ${skipped}, 실패: ${failed}`);
  if (failed > 0) process.exitCode = 1;
}

main().catch(e => {
  console.error('치명적 오류:', e);
  process.exit(1);
});
