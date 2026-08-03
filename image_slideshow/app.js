/* ============================================================
   PANORAMA PHOTO ALBUM - app.js
   ============================================================ */

'use strict';

// ============================================================
// 1. STATE
// ============================================================
const API_BASE     = '/api/image-slideshow';
let config         = {};
let albums         = [];
let selectedAlbum  = null;
let pendingPhotos    = [];    // File[] in add modal (new uploads)
let pendingMusicList = [];   // [{id,name,artist,url,source,_file?}] in add/edit modal
let musicPickerMode  = 'file'; // 'file' | 'ai'
let editingAlbumId   = null; // null = create mode, uuid = edit mode
let removedPhotoIds  = [];   // existing photo IDs marked for deletion
// 대표 이미지로 선택된 사진 — {type:'pending', file} | {type:'existing', id} | null.
// 인덱스가 아니라 참조로 저장: pendingPhotos는 splice가 아니라 .filter(f => f !== file)로
// 제거되므로, 다른 사진이 먼저 삭제되면 인덱스는 어긋나지만 참조는 안전하게 유지된다.
let coverPhotoRef    = null;
let previewAudio   = null;
let previewTimer   = null;
let previewingAlbumId = null; // 앨범 카드에서 미리듣기 중인 앨범 id (music-picker의 previewAudio와 공유)
let bgAudio        = null;
let panoScrollAnim   = null; // legacy, unused
let isDragging       = false;
let dragStartX       = 0;
let dragScrollLeft   = 0;
// Slideshow state
let slideshowPhotos  = [];
let currentSlideIdx  = 0;
let slideshowTimer   = null;
let slideshowPlaying = true;
let slideshowSpeed   = 3000;
let slideshowEffect  = 'fade';
let activeLayer      = 'a'; // 'a' or 'b'
let slideTransitionMs = 600;
let slideCleanupTimer = null; // 이전 전환 cleanup 타이머

// ============================================================
// 2. MUSIC CATALOG
// ============================================================
const MUSIC_DATA = {
  '클래식': [
    { id:'c1', name:'봄의 왈츠',      artist:'Classic Orchestra', url:'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3' },
    { id:'c2', name:'달빛 소나타',     artist:'Piano Works',       url:'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3' },
    { id:'c3', name:'현악 4중주',      artist:'String Quartet',    url:'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3' },
  ],
  '재즈': [
    { id:'j1', name:'밤의 재즈 클럽', artist:'Jazz Trio',    url:'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3' },
    { id:'j2', name:'카페 스윙',       artist:'Smooth Jazz',  url:'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3' },
    { id:'j3', name:'블루 노트',       artist:'Blue Jazz Band',url:'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3' },
  ],
  '자연/힐링': [
    { id:'n1', name:'숲속의 아침', artist:'Nature Ambient', url:'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3' },
    { id:'n2', name:'빗소리 명상', artist:'Rain Ambient',   url:'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3' },
    { id:'n3', name:'파도와 바람', artist:'Ocean Waves',    url:'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-9.mp3' },
  ],
  '팝': [
    { id:'p1', name:'여름 드라이브',   artist:'Summer Pop',   url:'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-10.mp3' },
    { id:'p2', name:'인디 팝 컬렉션', artist:'Indie Artists', url:'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-11.mp3' },
    { id:'p3', name:'팝 앤 소울',      artist:'Pop Soul',     url:'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-12.mp3' },
  ],
  '명상': [
    { id:'m1', name:'마음의 고요', artist:'Meditation',    url:'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-13.mp3' },
    { id:'m2', name:'깊은 호흡',   artist:'Breathe Deep',  url:'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-14.mp3' },
    { id:'m3', name:'새벽 명상',   artist:'Dawn Meditation',url:'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-15.mp3' },
  ],
};

// ============================================================
// 3. CONFIG / SETTINGS
// ============================================================
const CFG_KEY = 'panorama_cfg_v1';

function loadConfig() {
  try { return JSON.parse(localStorage.getItem(CFG_KEY) || '{}'); }
  catch { return {}; }
}
function saveConfig(obj) {
  localStorage.setItem(CFG_KEY, JSON.stringify(obj));
}

/** 전환시간/효과 — 전체 공통, 앨범 카드의 인라인 셀렉트에서 변경 즉시 자동 저장 */
function persistAppSettings(patch) {
  saveConfig({ ...loadConfig(), ...patch });
}

// ============================================================
// 5. API CLIENT (hub의 /api/image-slideshow/* — Oracle DB + OCI Storage)
// ============================================================
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function apiHeaders() {
  const client = window._authSupabase;
  if (!client) return {};
  const { data } = await client.auth.getSession();
  const token = data?.session?.access_token;
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

async function apiFetch(path, options = {}) {
  const headers = { ...(await apiHeaders()), ...(options.headers || {}) };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(API_BASE + path, { ...options, headers });
  } catch (e) {
    const err = new Error('네트워크 오류로 서버에 연결할 수 없습니다.');
    err.transient = true;
    throw err;
  }

  if (!res.ok) {
    let message = `요청 실패 (${res.status})`;
    try { const body = await res.json(); if (body?.error) message = body.error; } catch {}
    const err = new Error(message);
    err.status = res.status;
    // Oracle Autonomous DB Always Free는 유휴 시 자동 정지되어 첫 요청이 502/503/504로 실패할 수 있음 → 재시도 대상
    err.transient = [502, 503, 504].includes(res.status);
    throw err;
  }

  if (res.status === 204) return null;
  return res.json();
}

function isTransientApiError(e) {
  return !!e?.transient;
}

function showRetryBanner(attempt, max) {
  let banner = document.getElementById('db-missing-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'db-missing-banner';
    banner.style.cssText = `
      position:fixed; top:0; left:0; right:0; z-index:2000;
      background:#fffbeb; border-bottom:2px solid #fcd34d;
      padding:12px 20px; display:flex; align-items:center; gap:12px;
      font-size:13px; color:#92400e;
    `;
    document.body.prepend(banner);
  }
  banner.innerHTML = `
    <span style="font-size:18px">⏳</span>
    <div style="flex:1">
      <strong>서버 준비 중...</strong>
      DB가 깨어나는 중입니다. 잠시만 기다려주세요.
      (${attempt}/${max} 재시도)
    </div>
    <div style="width:120px;height:4px;background:#fde68a;border-radius:4px;overflow:hidden">
      <div style="height:100%;width:${Math.round((attempt/max)*100)}%;
                  background:#f59e0b;border-radius:4px;transition:width .3s"></div>
    </div>
  `;
}

function showDbMissingBanner(detail = '') {
  let banner = document.getElementById('db-missing-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'db-missing-banner';
    banner.style.cssText = `
      position:fixed; top:0; left:0; right:0; z-index:2000;
      background:#fef2f2; border-bottom:2px solid #fca5a5;
      padding:12px 20px; display:flex; align-items:center; gap:12px;
      font-size:13px; color:#991b1b;
    `;
    banner.innerHTML = `
      <span style="font-size:18px">⚠️</span>
      <div style="flex:1">
        <strong>서버 연결 오류:</strong> ${escHtml(detail)}
        — 잠시 후 새로고침 해주세요.
      </div>
      <button onclick="location.reload();"
        style="background:#ef4444;color:#fff;padding:6px 14px;border-radius:8px;
               font-weight:600;font-size:12px;border:none;cursor:pointer;">
        새로고침
      </button>
    `;
    document.body.prepend(banner);
  }
}

function hideDbMissingBanner() {
  const b = document.getElementById('db-missing-banner');
  if (b) b.remove();
}

async function loadAlbums() {
  const MAX_RETRY = 30;   // 최대 120초 대기 (Always Free DB 재기동 시간 감안)
  const DELAY_MS  = 4000;

  for (let i = 1; i <= MAX_RETRY; i++) {
    try {
      const { albums: rows } = await apiFetch('/albums');
      hideDbMissingBanner();
      albums = (rows || []).map(a => {
        // Backward compat: synthesize music_list from legacy fields
        let ml = Array.isArray(a.music_list) ? a.music_list : [];
        if (ml.length === 0 && a.music_url) {
          ml = [{ id: a.music_id || null, name: a.music_name || '음악', artist: a.music_artist || '', url: a.music_url, source: a.music_id ? 'ai' : 'file' }];
        }
        return { ...a, music_list: ml, photos: (a.photos || []).sort((x, y) => x.sort_order - y.sort_order) };
      });
      renderAlbumList();
      return;
    } catch (e) {
      console.warn(`loadAlbums 재시도 ${i}/${MAX_RETRY}:`, e.message);
      if (isTransientApiError(e) && i < MAX_RETRY) {
        showRetryBanner(i, MAX_RETRY);
        await sleep(DELAY_MS);
        continue;
      }
      showDbMissingBanner(e.message);
      console.error('loadAlbums 오류:', e.message);
      return;
    }
  }
}

async function uploadToStorage(objectPath, file) {
  const { uploadUrl, publicUrl } = await apiFetch('/upload-url', {
    method: 'POST',
    body: JSON.stringify({ path: objectPath }),
  });
  const putRes = await fetch(uploadUrl, { method: 'PUT', body: file });
  if (!putRes.ok) throw new Error('파일 업로드 실패');
  return publicUrl;
}

async function uploadMusicFile(albumId, file) {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `music/${albumId}/${Date.now()}_${safeName}`;
  const url = await uploadToStorage(path, file);
  return { url, name: file.name.replace(/\.[^.]+$/, '') };
}

async function uploadMusicItems(albumId, musicList) {
  const result = [];
  for (const item of musicList) {
    if (item._file) {
      const { url, name: trackName } = await uploadMusicFile(albumId, item._file);
      result.push({ id: null, name: trackName, artist: '음악 파일', url, source: 'file' });
    } else {
      result.push({ id: item.id || null, name: item.name, artist: item.artist, url: item.url, source: item.source || 'ai' });
    }
  }
  return result;
}

async function createAlbum(name, albumDate, musicList, photoFiles) {
  // 1. Upload any local music files first
  const finalMusicList = await uploadMusicItems('tmp', musicList); // tmp id, fix after insert
  const first = finalMusicList[0] || null;

  // 2. Insert album with legacy fields from first track + music_list
  const { id: albumId } = await apiFetch('/albums', {
    method: 'POST',
    body: JSON.stringify({
      name,
      album_date:   albumDate || null,
      music_id:     first?.id     || null,
      music_name:   first?.name   || null,
      music_url:    first?.url    || null,
      music_artist: first?.artist || null,
      music_list:   finalMusicList,
    }),
  });

  // 3. Re-upload any file-based music with real albumId
  const reUpload = musicList.filter(m => m._file);
  if (reUpload.length > 0) {
    const reFixed = await uploadMusicItems(albumId, reUpload);
    // Merge back into finalMusicList (replace tmp urls)
    let fi = 0;
    for (let i = 0; i < finalMusicList.length; i++) {
      if (musicList[i]?._file) { finalMusicList[i] = reFixed[fi++]; }
    }
    const f0 = finalMusicList[0] || null;
    await apiFetch(`/albums/${albumId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        name,
        album_date:   albumDate || null,
        music_id:     f0?.id     || null,
        music_name:   f0?.name   || null,
        music_url:    f0?.url    || null,
        music_artist: f0?.artist || null,
        music_list:   finalMusicList,
      }),
    });
  }

  // 4. Upload photos
  const photos = [];
  for (let i = 0; i < photoFiles.length; i++) {
    const file = photoFiles[i];
    const path = `${albumId}/${Date.now()}_${i}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    try {
      const url = await uploadToStorage(path, file);
      photos.push({ filename: file.name, storagePath: path, url, sortOrder: i, _sourceFile: file });
    } catch (e) { console.warn('Upload error:', e); }
  }
  if (photos.length > 0) {
    const { ids } = await apiFetch('/photos', {
      method: 'POST',
      body: JSON.stringify({ albumId, photos: photos.map(({ _sourceFile, ...p }) => p) }),
    });
    // 대표 이미지로 방금 업로드한 사진을 골랐다면, 실제 id를 알게 된 지금 별도 PATCH로 반영
    if (coverPhotoRef?.type === 'pending') {
      const idx = photos.findIndex(p => p._sourceFile === coverPhotoRef.file);
      if (idx >= 0) {
        const f0 = finalMusicList[0] || null;
        await apiFetch(`/albums/${albumId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name,
            album_date:   albumDate || null,
            music_id:     f0?.id     || null,
            music_name:   f0?.name   || null,
            music_url:    f0?.url    || null,
            music_artist: f0?.artist || null,
            music_list:   finalMusicList,
            cover_photo_id: ids[idx],
          }),
        });
      }
    }
  }
  return { id: albumId };
}

async function updateAlbum(albumId, name, albumDate, musicList, newPhotoFiles, removedIds) {
  // 1. Upload any new local music files
  const finalMusicList = await uploadMusicItems(albumId, musicList);
  const first = finalMusicList[0] || null;

  // 2. albums 메타데이터 업데이트. 대표 이미지가 이미 존재하는 사진이면 여기서 바로 반영되고,
  //    방금 추가한 새 사진을 대표로 골랐다면(coverPhotoRef.type==='pending') 아직 실제 id를
  //    모르므로 일단 null로 두고 4단계 업로드 후 다시 PATCH한다.
  await apiFetch(`/albums/${albumId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      name,
      album_date:   albumDate || null,
      music_id:     first?.id     || null,
      music_name:   first?.name   || null,
      music_url:    first?.url    || null,
      music_artist: first?.artist || null,
      music_list:   finalMusicList,
      cover_photo_id: coverPhotoRef?.type === 'existing' ? coverPhotoRef.id : null,
    }),
  });

  // 3. 삭제 표시된 기존 사진 제거 (서버가 OCI 오브젝트도 함께 정리)
  if (removedIds.length > 0) {
    await apiFetch('/photos', { method: 'DELETE', body: JSON.stringify({ ids: removedIds }) });
  }

  // 4. 새 사진 업로드
  if (newPhotoFiles.length > 0) {
    const existingCount = (albums.find(a => a.id === albumId)?.photos || []).length - removedIds.length;
    const photos = [];
    for (let i = 0; i < newPhotoFiles.length; i++) {
      const file = newPhotoFiles[i];
      const path = `${albumId}/${Date.now()}_${i}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      try {
        const url = await uploadToStorage(path, file);
        photos.push({ filename: file.name, storagePath: path, url, sortOrder: existingCount + i, _sourceFile: file });
      } catch (e) { console.warn('Upload error:', e); }
    }
    if (photos.length > 0) {
      const { ids } = await apiFetch('/photos', {
        method: 'POST',
        body: JSON.stringify({ albumId, photos: photos.map(({ _sourceFile, ...p }) => p) }),
      });
      if (coverPhotoRef?.type === 'pending') {
        const idx = photos.findIndex(p => p._sourceFile === coverPhotoRef.file);
        if (idx >= 0) {
          await apiFetch(`/albums/${albumId}`, {
            method: 'PATCH',
            body: JSON.stringify({
              name,
              album_date:   albumDate || null,
              music_id:     first?.id     || null,
              music_name:   first?.name   || null,
              music_url:    first?.url    || null,
              music_artist: first?.artist || null,
              music_list:   finalMusicList,
              cover_photo_id: ids[idx],
            }),
          });
        }
      }
    }
  }
}

async function deleteAlbum(albumId) {
  // 서버가 OCI 오브젝트 정리 + 행 삭제(photos는 FK cascade)를 모두 처리
  await apiFetch(`/albums/${albumId}`, { method: 'DELETE' });
}

// ============================================================
// 6. ALBUM LIST RENDERING
// ============================================================
const EFFECT_LABELS = {
  fade: '페이드', slide: '슬라이드', push: '푸시', zoom: '줌', zoomout: '줌아웃',
  kenburns: '켄번즈', rotate: '회전', flip: '플립', swing: '스윙', wipe: '와이프',
  blur: '블러', glitch: '글리치',
};
const SPEED_OPTIONS = [2000, 3000, 5000, 8000, 10000];

/** 앨범 카드에 매번 새로 그려지는 전환시간/효과 인라인 셀렉트 — 전체 공통값을 반영 */
function renderInlineSpeedSelect() {
  const opts = SPEED_OPTIONS.map(v =>
    `<option value="${v}"${slideshowSpeed === v ? ' selected' : ''}>${v / 1000}초</option>`
  ).join('');
  return `<select class="record-card-select" onclick="event.stopPropagation()" onchange="handleCardSpeedChange(event, this.value)">${opts}</select>`;
}
function renderInlineEffectSelect() {
  const opts = Object.entries(EFFECT_LABELS).map(([k, label]) =>
    `<option value="${k}"${slideshowEffect === k ? ' selected' : ''}>${label}</option>`
  ).join('');
  return `<select class="record-card-select" onclick="event.stopPropagation()" onchange="handleCardEffectChange(event, this.value)">${opts}</select>`;
}

function handleCardSpeedChange(event, value) {
  event.stopPropagation();
  slideshowSpeed = parseInt(value, 10);
  if (slideshowPlaying) { stopSlideshow(); startSlideshow(); }
  persistAppSettings({ slideSpeed: slideshowSpeed });
  renderAlbumList();
}
function handleCardEffectChange(event, value) {
  event.stopPropagation();
  slideshowEffect = value;
  persistAppSettings({ slideEffect: slideshowEffect });
  renderAlbumList();
}

function renderAlbumList() {
  const list = document.getElementById('record-list');
  document.getElementById('record-count').textContent = `${albums.length}개`;

  if (albums.length === 0) {
    list.innerHTML = `<div class="list-empty">
      <div class="list-empty-icon">🗂️</div>
      <p>앨범이 없습니다</p>
      <p class="list-empty-sub">+ 추가 버튼으로 시작하세요</p>
    </div>`;
    return;
  }

  list.innerHTML = albums.map(album => {
    const cover = album.photos.find(p => p.id === album.cover_photo_id) || album.photos[0] || null;
    const coverHtml = cover
      ? `<img class="record-card-thumb" src="${escHtml(cover.url)}" alt="${escHtml(cover.filename)}">`
      : '';

    const datePfx = album.album_date ? album.album_date + ' / ' : '';
    const trackHtml = album.music_list?.length > 0 ? (() => {
      const names = album.music_list.map(m => m.name || '제목 없음');
      const label = names.length === 1 ? names[0] : `${names[0]} 외 ${names.length - 1}곡`;
      const full  = names.join(', ');
      const disp  = label.length > 18 ? label.slice(0, 18) + '…' : label;
      const isSelected = selectedAlbum?.id === album.id;
      const isSelectedPlaying = isSelected && !!bgAudio && !bgAudio.paused;
      const isPlaying = isSelectedPlaying || previewingAlbumId === album.id;
      const btnTitle = isSelected ? (isPlaying ? '정지' : '재생') : '미리듣기';
      const multi = isSelected && album.music_list.length > 1;
      const ICONS = {
        prev: '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="5" width="2.5" height="14"/><polygon points="20 19 9 12 20 5"/></svg>',
        next: '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="17.5" y="5" width="2.5" height="14"/><polygon points="4 5 15 12 4 19"/></svg>',
        play: '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20"/></svg>',
        pause: '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="4" width="4.5" height="16"/><rect x="14.5" y="4" width="4.5" height="16"/></svg>',
        shuffle: '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>',
      };
      return `<div class="record-card-row record-card-track-row">
        <div class="record-card-track-controls">
          ${multi ? `<button class="record-card-track-nav" onclick="prevBgTrack(event)" title="이전 곡">${ICONS.prev}</button>` : ''}
          <button class="record-card-track-play${isPlaying ? ' playing' : ''}" data-album-id="${album.id}"
                  onclick="previewAlbumTrack(event,'${album.id}')" title="${btnTitle}">${isPlaying ? ICONS.pause : ICONS.play}</button>
          ${multi ? `<button class="record-card-track-nav" onclick="nextBgTrack(event)" title="다음 곡">${ICONS.next}</button>` : ''}
          ${multi ? `<button class="record-card-track-nav${bgShuffleOn ? ' active' : ''}" onclick="toggleBgShuffle(event)" title="셔플">${ICONS.shuffle}</button>` : ''}
        </div>
        <span class="record-card-track-name" title="${escHtml(full)}">${escHtml(disp)}</span>
      </div>`;
    })() : '';

    return `<div class="record-card${selectedAlbum?.id === album.id ? ' active' : ''}"
                 data-id="${album.id}" onclick="selectAlbum('${album.id}')">
      <div class="record-card-head">
        <div class="record-card-name">${escHtml(album.name)}</div>
        <div class="record-card-actions">
          <button class="record-card-edit"   onclick="handleEditAlbum(event,'${album.id}')"   title="수정">✏️</button>
          <button class="record-card-delete" onclick="handleDeleteAlbum(event,'${album.id}')" title="삭제">✕</button>
        </div>
      </div>
      <div class="record-card-main">
        <div class="record-card-thumb-wrap">${coverHtml}</div>
        <div class="record-card-body">
          <div class="record-card-row">${datePfx}${album.photos.length}장</div>
          <div class="record-card-row">
            <span class="record-card-row-label">전환 시간</span>
            ${renderInlineSpeedSelect()}
          </div>
          <div class="record-card-row">
            <span class="record-card-row-label">전환 효과</span>
            ${renderInlineEffectSelect()}
          </div>
          ${trackHtml}
        </div>
      </div>
    </div>`;
  }).join('');
}

function handleEditAlbum(event, albumId) {
  event.stopPropagation();
  const album = albums.find(a => a.id === albumId);
  if (!album) return;
  openEditModal(album);
}

async function handleDeleteAlbum(event, albumId) {
  event.stopPropagation();
  if (!confirm('앨범을 삭제하시겠습니까?')) return;
  try {
    await deleteAlbum(albumId);
    if (selectedAlbum?.id === albumId) {
      selectedAlbum = null;
      showEmptyRight();
    }
    await loadAlbums();
    showToast('앨범이 삭제되었습니다');
  } catch (e) {
    showToast('삭제 실패: ' + e.message, 'error');
  }
}

// ============================================================
// 7. SELECT ALBUM → SHOW PANORAMA
// ============================================================
function selectAlbum(albumId) {
  selectedAlbum = albums.find(a => a.id === albumId) || null;

  if (!selectedAlbum) { renderAlbumList(); showEmptyRight(); return; }
  renderPanoramaView();
  // startBgMusic()가 위에서 이미 끝난 뒤 그려야 카드의 재생 아이콘이 실제 상태와 맞음
  renderAlbumList();
}

function showEmptyRight() {
  stopSlideshow();
  document.getElementById('empty-right').style.display = 'flex';
  document.getElementById('panorama-view').style.display = 'none';
  stopBgMusic();
}

function renderPanoramaView() {
  document.getElementById('empty-right').style.display = 'none';
  document.getElementById('panorama-view').style.display = 'flex';

  const album = selectedAlbum;

  // Build panorama strip
  buildPanoramaStrip(album.photos);

  // Music
  if (album.music_list?.length > 0) {
    startBgMusic(album);
  } else {
    stopBgMusic();
  }
}

// ============================================================
// 8. SLIDESHOW ENGINE
// ============================================================
const _imgSizeCache = {}; // url → {w, h} natural dimensions

function preloadSlideImages(photos) {
  photos.forEach(photo => {
    if (_imgSizeCache[photo.url]) return;
    const img = new Image();
    img.onload = () => { _imgSizeCache[photo.url] = { w: img.naturalWidth, h: img.naturalHeight }; };
    img.src = photo.url;
  });
}

function _sizeSlideImg(img) {
  const dims = _imgSizeCache[img.src];
  if (!dims) return;
  const wrap = document.getElementById('pano-strip-wrap');
  if (!wrap) return;
  if (!wrap.clientWidth || !wrap.clientHeight) {
    requestAnimationFrame(() => _sizeSlideImg(img));
    return;
  }
  const maxW = wrap.clientWidth  * 0.98;
  const maxH = wrap.clientHeight * 0.98;
  const ratio = dims.w / dims.h;
  let w, h;
  if (dims.w / maxW >= dims.h / maxH) {
    w = Math.min(dims.w, maxW); h = w / ratio;
  } else {
    h = Math.min(dims.h, maxH); w = h * ratio;
  }
  img.style.width  = Math.round(w) + 'px';
  img.style.height = Math.round(h) + 'px';

  // Self-clip: clip the layer to only its own image bounds.
  // Prevents ghosting when adjacent slides have different orientations (portrait/landscape).
  const layer = img.parentElement;
  if (layer) {
    const lr = layer.getBoundingClientRect();
    const ir = img.getBoundingClientRect();
    if (lr.width && lr.height) {
      const t = Math.max(0, (ir.top    - lr.top)    / lr.height * 100).toFixed(2);
      const r = Math.max(0, (lr.right  - ir.right)  / lr.width  * 100).toFixed(2);
      const b = Math.max(0, (lr.bottom - ir.bottom) / lr.height * 100).toFixed(2);
      const l = Math.max(0, (ir.left   - lr.left)   / lr.width  * 100).toFixed(2);
      const clip = `inset(${t}% ${r}% ${b}% ${l}%)`;
      layer.dataset.imgClip = clip;
      layer.style.clipPath  = clip;
    }
  }
}

function setLayerImage(layerEl, url) {
  let img = layerEl.querySelector('.pano-slide-img');
  if (!img) {
    img = document.createElement('img');
    img.className = 'pano-slide-img';
    layerEl.appendChild(img);
  }
  img.style.width  = '';
  img.style.height = '';
  img.onload = () => {
    _imgSizeCache[url] = { w: img.naturalWidth, h: img.naturalHeight };
    _sizeSlideImg(img);
  };
  img.src = url;
  if (_imgSizeCache[url]) _sizeSlideImg(img);
  else if (img.complete && img.naturalWidth) {
    _imgSizeCache[url] = { w: img.naturalWidth, h: img.naturalHeight };
    _sizeSlideImg(img);
  }
}

function buildPanoramaStrip(photos) {
  clearInterval(slideshowTimer);
  slideshowTimer   = null;
  slideshowPhotos  = photos;
  currentSlideIdx  = 0;
  activeLayer      = 'a';
  slideshowPlaying = true;

  const layerA = document.getElementById('pano-layer-a');
  const layerB = document.getElementById('pano-layer-b');

  // Reset layers
  layerA.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;will-change:opacity,transform;z-index:2;opacity:1;transform:none;transition:none;animation:none;';
  layerB.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;will-change:opacity,transform;z-index:1;opacity:0;transform:none;transition:none;animation:none;';

  if (photos.length === 0) {
    layerA.innerHTML = `<div style="text-align:center;color:rgba(255,255,255,.5)">
      <div style="font-size:48px;margin-bottom:12px">📷</div>
      <p style="font-size:14px">이 앨범에 사진이 없습니다</p></div>`;
    return;
  }
  layerA.innerHTML = '';
  layerB.innerHTML = '';
  layerA.style.display = '';

  // Preload all images into cache so transitions are always smooth
  preloadSlideImages(photos);

  // Init first slide on layer A
  setLayerImage(layerA, photos[0].url);

  // Auto-play
  if (photos.length > 1) startSlideshow();
}

function startSlideshow() {
  clearInterval(slideshowTimer);
  slideshowTimer = setInterval(() => goToSlide(currentSlideIdx + 1, 'next'), slideshowSpeed);
}

function stopSlideshow() {
  clearInterval(slideshowTimer);
  slideshowTimer = null;
}

function goToSlide(rawIdx, direction = 'next') {
  const n = slideshowPhotos.length;
  if (n < 2) return;
  const newIdx = ((rawIdx % n) + n) % n;
  if (newIdx === currentSlideIdx) return;

  const inId  = activeLayer === 'a' ? 'b' : 'a';
  const outId = activeLayer;
  const inEl  = document.getElementById(`pano-layer-${inId}`);
  const outEl = document.getElementById(`pano-layer-${outId}`);

  currentSlideIdx = newIdx;
  activeLayer = inId;

  // Fully reset inEl before sizing so _sizeSlideImg's getBoundingClientRect() is correct.
  // If a previous slide/push left a transform on this layer, the clip would be computed
  // from the off-screen position and ghosting would occur on the next transition.
  inEl.style.transition  = 'none';
  inEl.style.animation   = 'none';
  inEl.style.transform   = 'none';
  inEl.style.opacity     = '0';
  inEl.style.filter      = '';
  inEl.style.clipPath    = '';
  inEl.getBoundingClientRect(); // force reflow so transform:none is applied before sizing

  const url = slideshowPhotos[newIdx].url;
  setLayerImage(inEl, url);

  // Double-RAF: ensures _sizeSlideImg has run and layout is painted before transition starts
  const doTransition = () =>
    requestAnimationFrame(() => requestAnimationFrame(() => applySlideTransition(inEl, outEl, direction)));

  if (_imgSizeCache[url]) {
    doTransition();
  } else {
    const img = inEl.querySelector('.pano-slide-img');
    if (img && img.complete && img.naturalWidth) {
      _imgSizeCache[url] = { w: img.naturalWidth, h: img.naturalHeight };
      doTransition();
    } else {
      img?.addEventListener('load', doTransition, { once: true });
    }
  }
}

function applySlideTransition(inEl, outEl, direction) {
  const dur = slideTransitionMs;
  const ease = 'cubic-bezier(.4,0,.2,1)';

  // 이전 cleanup 타이머 취소 (겹침 방지)
  if (slideCleanupTimer) { clearTimeout(slideCleanupTimer); slideCleanupTimer = null; }

  // Clear old transitions/animations on BOTH layers immediately
  [inEl, outEl].forEach(el => {
    el.style.transition = 'none';
    el.style.animation  = 'none';
    el.style.filter     = '';
    el.style.transformOrigin = '';
  });
  // Restore self-clips on BOTH layers (cleanup timer clears outEl's clip each transition)
  inEl.style.clipPath  = inEl.dataset.imgClip  || '';
  outEl.style.clipPath = outEl.dataset.imgClip || '';
  // Force reflow so CSS transitions animate from the set state
  inEl.getBoundingClientRect();

  switch (slideshowEffect) {
    case 'fade':
      inEl.style.opacity = '0';
      inEl.style.transform = 'none';
      inEl.style.zIndex = '2';
      outEl.style.zIndex = '1';
      inEl.getBoundingClientRect();
      inEl.style.transition  = `opacity ${dur}ms ${ease}`;
      outEl.style.transition = `opacity ${dur}ms ${ease}`;
      inEl.style.opacity  = '1';
      outEl.style.opacity = '0';
      break;

    case 'slide': {
      const sign = direction === 'next' ? 1 : -1;
      inEl.style.transform = `translateX(${sign * 100}%)`;
      inEl.style.opacity = '1';
      outEl.style.transform = 'translateX(0)';
      inEl.style.zIndex = '2';
      outEl.style.zIndex = '1';
      inEl.getBoundingClientRect();
      inEl.style.transition  = `transform ${dur}ms ${ease}`;
      outEl.style.transition = `transform ${dur}ms ${ease}`;
      inEl.style.transform  = 'translateX(0)';
      outEl.style.transform = `translateX(${-sign * 100}%)`;
      break;
    }

    case 'zoom':
      inEl.style.opacity = '0';
      inEl.style.transform = 'scale(1.1)';
      outEl.style.opacity = '1';
      outEl.style.transform = 'scale(1)';
      inEl.style.zIndex = '2';
      outEl.style.zIndex = '1';
      inEl.getBoundingClientRect();
      inEl.style.transition  = `opacity ${dur}ms ${ease}, transform ${dur}ms ${ease}`;
      outEl.style.transition = `opacity ${dur}ms ${ease}, transform ${dur}ms ${ease}`;
      inEl.style.opacity = '1';
      inEl.style.transform = 'scale(1)';
      outEl.style.opacity = '0';
      outEl.style.transform = 'scale(.93)';
      break;

    case 'kenburns':
      inEl.style.opacity = '0';
      inEl.style.transform = 'scale(1.04)';
      inEl.style.zIndex = '2';
      outEl.style.zIndex = '1';
      inEl.getBoundingClientRect();
      inEl.style.transition = `opacity ${dur}ms ${ease}`;
      inEl.style.opacity = '1';
      outEl.style.transition = `opacity ${dur}ms ${ease}`;
      outEl.style.opacity = '0';
      setTimeout(() => {
        inEl.style.transition = 'none';
        inEl.style.animation  = `kenBurns ${slideshowSpeed * 3}ms ease-in-out infinite`;
      }, dur + 50);
      break;

    case 'push': {
      const pushSign = direction === 'next' ? 1 : -1;
      inEl.style.opacity = '1';
      inEl.style.transform = `translateX(${pushSign * 100}%)`;
      inEl.style.zIndex = '2';
      outEl.style.zIndex = '1';
      inEl.getBoundingClientRect();
      inEl.style.transition  = `transform ${dur}ms ${ease}`;
      outEl.style.transition = `transform ${dur}ms ${ease}`;
      inEl.style.transform  = 'translateX(0)';
      outEl.style.transform = `translateX(${-pushSign * 100}%)`;
      break;
    }

    case 'zoomout':
      inEl.style.opacity = '0';
      inEl.style.transform = 'scale(1.18)';
      inEl.style.zIndex = '2';
      outEl.style.zIndex = '1';
      inEl.getBoundingClientRect();
      inEl.style.transition  = `opacity ${dur}ms ${ease}, transform ${dur}ms ${ease}`;
      outEl.style.transition = `opacity ${dur}ms ${ease}, transform ${dur}ms ${ease}`;
      inEl.style.opacity = '1';
      inEl.style.transform = 'scale(1)';
      outEl.style.opacity = '0';
      outEl.style.transform = 'scale(0.8)';
      break;

    case 'rotate': {
      const rotSign = direction === 'next' ? 1 : -1;
      inEl.style.opacity = '0';
      inEl.style.transform = `rotate(${-8 * rotSign}deg) scale(0.85)`;
      inEl.style.zIndex = '2';
      outEl.style.zIndex = '1';
      inEl.getBoundingClientRect();
      inEl.style.transition  = `opacity ${dur}ms ${ease}, transform ${dur}ms ${ease}`;
      outEl.style.transition = `opacity ${dur}ms ${ease}, transform ${dur}ms ${ease}`;
      inEl.style.opacity = '1';
      inEl.style.transform = 'rotate(0deg) scale(1)';
      outEl.style.opacity = '0';
      outEl.style.transform = `rotate(${8 * rotSign}deg) scale(0.85)`;
      break;
    }

    case 'flip':
      inEl.style.opacity = '1';
      inEl.style.transform = 'perspective(1400px) rotateY(90deg)';
      inEl.style.zIndex = '2';
      outEl.style.zIndex = '1';
      outEl.style.transition = `transform ${dur / 2}ms ${ease}, opacity ${dur / 2}ms ${ease}`;
      outEl.style.transform = 'perspective(1400px) rotateY(-90deg)';
      outEl.style.opacity = '0';
      setTimeout(() => {
        inEl.getBoundingClientRect();
        inEl.style.transition = `transform ${dur / 2}ms ${ease}`;
        inEl.style.transform = 'perspective(1400px) rotateY(0deg)';
      }, dur / 2);
      break;

    case 'swing':
      inEl.style.opacity = '0';
      inEl.style.transform = 'perspective(1400px) rotateX(28deg) translateY(-8%)';
      inEl.style.transformOrigin = 'top center';
      inEl.style.zIndex = '2';
      outEl.style.zIndex = '1';
      inEl.getBoundingClientRect();
      inEl.style.transition = `opacity ${dur}ms ${ease}, transform ${dur}ms cubic-bezier(.34,1.56,.64,1)`;
      outEl.style.transition = `opacity ${dur}ms ${ease}`;
      inEl.style.opacity = '1';
      inEl.style.transform = 'perspective(1400px) rotateX(0deg) translateY(0)';
      outEl.style.opacity = '0';
      break;

    case 'wipe': {
      const wipeStart = direction === 'next' ? 'inset(0 100% 0 0)' : 'inset(0 0 0 100%)';
      inEl.style.opacity = '1';
      inEl.style.clipPath = wipeStart;
      inEl.style.zIndex = '2';
      outEl.style.zIndex = '1';
      inEl.getBoundingClientRect();
      inEl.style.transition = `clip-path ${dur}ms ${ease}`;
      inEl.style.clipPath = 'inset(0 0% 0 0%)';
      break;
    }

    case 'blur':
      inEl.style.opacity = '0';
      inEl.style.filter = 'blur(28px)';
      inEl.style.transform = 'scale(1.04)';
      inEl.style.zIndex = '2';
      outEl.style.zIndex = '1';
      inEl.getBoundingClientRect();
      inEl.style.transition  = `opacity ${dur}ms ${ease}, filter ${dur}ms ${ease}, transform ${dur}ms ${ease}`;
      outEl.style.transition = `opacity ${dur}ms ${ease}, filter ${dur * 0.6}ms ${ease}`;
      inEl.style.opacity = '1';
      inEl.style.filter = 'blur(0px)';
      inEl.style.transform = 'scale(1)';
      outEl.style.opacity = '0';
      outEl.style.filter = 'blur(20px)';
      break;

    case 'glitch':
      inEl.style.opacity = '0';
      inEl.style.zIndex = '2';
      outEl.style.zIndex = '1';
      outEl.style.animation = `glitchShake ${Math.round(dur * 0.55)}ms steps(1) forwards`;
      setTimeout(() => {
        outEl.style.animation = 'none';
        inEl.getBoundingClientRect();
        inEl.style.transition  = `opacity ${Math.round(dur * 0.45)}ms linear`;
        outEl.style.transition = `opacity ${Math.round(dur * 0.45)}ms linear`;
        inEl.style.opacity = '1';
        outEl.style.opacity = '0';
      }, dur * 0.55);
      break;
  }

  // Cleanup outgoing layer after transition (타이머 참조 저장으로 충돌 방지)
  slideCleanupTimer = setTimeout(() => {
    slideCleanupTimer = null;
    outEl.style.transition      = 'none';
    outEl.style.animation       = 'none';
    outEl.style.opacity         = '0';
    outEl.style.transform       = 'none';
    outEl.style.filter          = '';
    outEl.style.clipPath        = '';
    outEl.style.transformOrigin = '';
    outEl.style.zIndex          = '1';
    // Restore inEl self-clip (wipe effect leaves a full-reveal clip with no rounding)
    if (inEl.dataset.imgClip) inEl.style.clipPath = inEl.dataset.imgClip;
  }, dur + 80);
}

// Swipe/drag to navigate slides
function initPanoDrag() {
  const wrap = document.getElementById('pano-strip-wrap');
  let startX = 0;

  wrap.addEventListener('mousedown', e => { isDragging = true; startX = e.pageX; });
  wrap.addEventListener('touchstart', e => { isDragging = true; startX = e.touches[0].pageX; }, { passive: true });

  document.addEventListener('mouseup', e => {
    if (!isDragging) return;
    isDragging = false;
    const diff = e.pageX - startX;
    if (Math.abs(diff) > 40) goToSlide(currentSlideIdx + (diff < 0 ? 1 : -1), diff < 0 ? 'next' : 'prev');
  });
  wrap.addEventListener('touchend', e => {
    if (!isDragging) return;
    isDragging = false;
    const diff = e.changedTouches[0].pageX - startX;
    if (Math.abs(diff) > 40) goToSlide(currentSlideIdx + (diff < 0 ? 1 : -1), diff < 0 ? 'next' : 'prev');
  });
  wrap.addEventListener('touchstart', e => {
    isDragging = true; dragStartX = e.touches[0].pageX; dragScrollLeft = wrap.scrollLeft;
  }, { passive: true });
  wrap.addEventListener('touchmove', e => {
    if (!isDragging) return;
    wrap.scrollLeft = dragScrollLeft - (e.touches[0].pageX - dragStartX);
  }, { passive: true });
  wrap.addEventListener('touchend', () => { isDragging = false; });
}

// ============================================================
// 9. MUSIC PLAYER
// ============================================================
let bgTrackList    = [];
let bgTrackIdx     = 0;
let bgShuffleOn    = true; // 기본 셔플 켬 — 화면 로드/앨범 선택 시 곡을 랜덤하게 재생
let bgShuffleQueue = []; // 셔플 사이클 동안 아직 안 튼 인덱스들
let musicVolume    = 0.7; // 설정 팝업 제거 후 UI 없이 저장된 값만 사용

function _nextShuffleIdx() {
  if (bgShuffleQueue.length === 0) {
    bgShuffleQueue = Array.from({ length: bgTrackList.length }, (_, i) => i)
      .filter(i => i !== bgTrackIdx);
    for (let i = bgShuffleQueue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bgShuffleQueue[i], bgShuffleQueue[j]] = [bgShuffleQueue[j], bgShuffleQueue[i]];
    }
    if (bgShuffleQueue.length === 0) bgShuffleQueue = [bgTrackIdx];
  }
  return bgShuffleQueue.shift();
}

function _prevShuffleIdx() {
  const others = Array.from({ length: bgTrackList.length }, (_, i) => i).filter(i => i !== bgTrackIdx);
  if (others.length === 0) return bgTrackIdx;
  return others[Math.floor(Math.random() * others.length)];
}

function startBgMusic(album) {
  stopBgMusic();
  bgTrackList    = album.music_list || [];
  bgShuffleQueue = [];
  if (bgTrackList.length === 0) return;
  bgTrackIdx = bgShuffleOn && bgTrackList.length > 1
    ? Math.floor(Math.random() * bgTrackList.length)
    : 0;
  playBgTrack(bgTrackIdx);
}

function playBgTrack(idx) {
  if (bgAudio) { bgAudio.pause(); bgAudio = null; }
  const track = bgTrackList[idx];
  if (!track?.url) return;

  bgAudio = new Audio(track.url);
  bgAudio.volume = musicVolume;
  bgAudio.play().catch(() => {});

  bgAudio.addEventListener('ended', () => {
    bgTrackIdx = bgShuffleOn && bgTrackList.length > 1
      ? _nextShuffleIdx()
      : (bgTrackIdx + 1) % bgTrackList.length;
    playBgTrack(bgTrackIdx);
    renderAlbumList();
  });
}

function stopBgMusic() {
  if (bgAudio) { bgAudio.pause(); bgAudio = null; }
}

function prevBgTrack(event) {
  event.stopPropagation();
  if (bgTrackList.length < 2) return;
  bgTrackIdx = bgShuffleOn ? _prevShuffleIdx() : (bgTrackIdx - 1 + bgTrackList.length) % bgTrackList.length;
  playBgTrack(bgTrackIdx);
  renderAlbumList();
}

function nextBgTrack(event) {
  event.stopPropagation();
  if (bgTrackList.length < 2) return;
  bgTrackIdx = bgShuffleOn ? _nextShuffleIdx() : (bgTrackIdx + 1) % bgTrackList.length;
  playBgTrack(bgTrackIdx);
  renderAlbumList();
}

function toggleBgShuffle(event) {
  event.stopPropagation();
  bgShuffleOn = !bgShuffleOn;
  bgShuffleQueue = [];
  renderAlbumList();
}

// ============================================================
// 10. MUSIC PREVIEW (10s)
// ============================================================
function previewMusicTrack(track) {
  stopMusicPreview();
  const btn = document.querySelector(`.btn-preview[data-id="${track.id}"]`);
  previewAudio = new Audio(track.url);
  previewAudio.volume = 0.5;
  previewAudio.play().catch(() => {});
  if (btn) btn.classList.add('playing');
  if (btn) btn.textContent = '⏹ 정지';

  previewTimer = setTimeout(() => stopMusicPreview(), 10000);

  previewAudio.onended = stopMusicPreview;
}

function stopMusicPreview() {
  clearTimeout(previewTimer);
  if (previewAudio) { previewAudio.pause(); previewAudio = null; }
  previewingAlbumId = null;
  document.querySelectorAll('.btn-preview').forEach(b => {
    b.classList.remove('playing');
    b.textContent = '▶ 미리 듣기';
  });
  document.querySelectorAll('.record-card-track-play').forEach(b => {
    b.classList.remove('playing');
    b.textContent = '▶';
  });
}

/** 앨범 목록 카드의 "▶ 곡 명칭" 클릭 — 그 자리에서 미리듣기 재생/정지(10초 자동 정지) */
function previewAlbumTrack(event, albumId) {
  event.stopPropagation();
  // 현재 선택되어 실제로 배경 재생 중인 앨범이면, 별도 미리듣기를 새로 틀지 않고
  // 이미 흐르는 배경음악(bgAudio) 자체를 재생/정지 — 안 그러면 같은 곡이 두 번 겹쳐 들림
  if (selectedAlbum?.id === albumId && bgAudio) {
    if (bgAudio.paused) bgAudio.play(); else bgAudio.pause();
    renderAlbumList();
    return;
  }
  if (previewingAlbumId === albumId) { stopMusicPreview(); return; }
  const track = albums.find(a => a.id === albumId)?.music_list?.[0];
  if (!track?.url) return;
  stopMusicPreview();
  previewingAlbumId = albumId;
  const btn = document.querySelector(`.record-card-track-play[data-album-id="${albumId}"]`);
  previewAudio = new Audio(track.url);
  previewAudio.volume = 0.5;
  previewAudio.play().catch(() => {});
  if (btn) { btn.classList.add('playing'); btn.textContent = '⏹'; }

  previewTimer = setTimeout(() => stopMusicPreview(), 10000);
  previewAudio.onended = stopMusicPreview;
}

// ============================================================
// 11. ADD MODAL
// ============================================================

function resetAddModal() {
  pendingPhotos    = [];
  pendingMusicList = [];
  musicPickerMode  = 'file';
  editingAlbumId   = null;
  removedPhotoIds  = [];
  coverPhotoRef    = null;
  document.getElementById('input-album-name').value       = '';
  document.getElementById('input-album-date').value       = '';
  document.getElementById('name-char-count').textContent  = '0';
  document.getElementById('photo-preview-grid').innerHTML = '';
  renderModalMusicList();
}

function setModalMode(mode) {
  const isEdit = mode === 'edit';
  document.getElementById('add-modal-emoji').textContent    = isEdit ? '✏️' : '📁';
  document.getElementById('add-modal-title').textContent    = isEdit ? '앨범 수정' : '새 앨범 추가';
  document.getElementById('add-modal-subtitle').textContent = isEdit ? '내용을 수정한 후 저장하세요' : '사진과 배경 음악을 선택해주세요';
  document.getElementById('save-btn-label').textContent     = '저장';
}

function openAddModal() {
  resetAddModal();
  setModalMode('add');
  document.getElementById('add-modal').style.display = 'flex';
}

function openEditModal(album) {
  resetAddModal();
  setModalMode('edit');
  editingAlbumId = album.id;

  // 앨범 이름 + 일자 pre-fill
  const nameInput = document.getElementById('input-album-name');
  nameInput.value = album.name;
  document.getElementById('name-char-count').textContent = album.name.length;
  document.getElementById('input-album-date').value = album.album_date || '';

  // 대표 이미지 참조 (썸네일 렌더링보다 먼저 설정해야 .is-cover 초기 표시가 맞음)
  coverPhotoRef = album.cover_photo_id ? { type: 'existing', id: album.cover_photo_id } : null;

  // 기존 사진 썸네일 표시
  album.photos.forEach(photo => renderExistingPhotoThumb(photo));

  // 음악 목록 pre-fill
  pendingMusicList = (album.music_list || []).map(m => ({ ...m }));
  renderModalMusicList();

  document.getElementById('add-modal').style.display = 'flex';
}

function closeAddModal() {
  stopMusicPreview();
  editingAlbumId  = null;
  removedPhotoIds = [];
  document.getElementById('add-modal').style.display = 'none';
}

async function saveAlbum() {
  const name = document.getElementById('input-album-name').value.trim();
  if (!name) { showToast('앨범 명칭을 입력해주세요', 'error'); return; }
  const albumDate = document.getElementById('input-album-date').value || null;

  const saveBtn    = document.getElementById('btn-save-album');
  const saveLabel  = document.getElementById('save-btn-label');
  const saveSpinner= document.getElementById('save-spinner');
  saveBtn.disabled = true;
  saveLabel.style.display  = 'none';
  saveSpinner.style.display = 'block';

  try {
    if (editingAlbumId) {
      // ── 수정 모드 ──
      await updateAlbum(editingAlbumId, name, albumDate, pendingMusicList, pendingPhotos, removedPhotoIds);
      await loadAlbums();
      // 수정한 앨범이 선택 중이었으면 갱신
      if (selectedAlbum?.id === editingAlbumId) {
        selectedAlbum = albums.find(a => a.id === editingAlbumId) || null;
        if (selectedAlbum) renderPanoramaView();
      }
      closeAddModal();
      showToast('앨범이 수정되었습니다 ✨', 'success');
    } else {
      // ── 생성 모드 ──
      for (let attempt = 1; attempt <= 5; attempt++) {
        try {
          await createAlbum(name, albumDate, pendingMusicList, pendingPhotos);
          break;
        } catch (e) {
          if (isTransientApiError(e) && attempt < 5) {
            showToast(`서버 준비 중... 재시도 중 (${attempt}/5)`, 'info');
            await sleep(4000);
            continue;
          }
          throw e;
        }
      }
      await loadAlbums();
      closeAddModal();
      showToast('앨범이 저장되었습니다 ✨', 'success');
    }
  } catch (e) {
    const msg = isTransientApiError(e)
      ? '서버가 준비 중입니다. 잠시 후 다시 시도해주세요.'
      : '저장 실패: ' + e.message;
    showToast(msg, 'error');
    console.error(e);
  } finally {
    saveBtn.disabled = false;
    saveLabel.style.display  = 'block';
    saveSpinner.style.display = 'none';
  }
}

// ============================================================
// 12. PHOTO UPLOAD
// ============================================================
function initDropZone() {
  const zone  = document.getElementById('drop-zone');
  const input = document.getElementById('file-input');

  zone.addEventListener('click', () => input.click());
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', e => {
    e.preventDefault(); zone.classList.remove('dragover');
    addPhotos([...e.dataTransfer.files].filter(f => f.type.startsWith('image/')));
  });
  input.addEventListener('change', () => {
    addPhotos([...input.files]);
    input.value = '';
  });
}

function addPhotos(files) {
  files.forEach(file => {
    pendingPhotos.push(file);
    const reader = new FileReader();
    reader.onload = e => renderPhotoThumb(file, e.target.result);
    reader.readAsDataURL(file);
  });
}

/** 썸네일 wrap에 "대표로 지정" 버튼을 추가하고, 선택 시 다른 썸네일의 .is-cover를 정리한다 */
/** 사진 클릭 → 대표 이미지로 지정(별 아이콘 표시). 이미 대표였던 사진을 다시 클릭하면 해제. */
function toggleThumbCover(wrap, ref) {
  const wasCover = wrap.classList.contains('is-cover');
  document.querySelectorAll('.photo-thumb-wrap.is-cover').forEach(w => w.classList.remove('is-cover'));
  if (wasCover) {
    coverPhotoRef = null;
  } else {
    wrap.classList.add('is-cover');
    coverPhotoRef = ref;
  }
}

function renderExistingPhotoThumb(photo) {
  const grid = document.getElementById('photo-preview-grid');
  const wrap = document.createElement('div');
  wrap.className = 'photo-thumb-wrap';
  wrap.dataset.photoId = photo.id;
  wrap.innerHTML = `<img class="photo-thumb" src="${escHtml(photo.url)}" alt="${escHtml(photo.filename)}" title="클릭하여 대표 이미지로 지정">
    <span class="photo-thumb-star">★</span>
    <button class="photo-thumb-del" title="삭제">✕</button>`;
  wrap.querySelector('.photo-thumb-del').addEventListener('click', () => {
    removedPhotoIds.push(photo.id);
    if (coverPhotoRef?.type === 'existing' && coverPhotoRef.id === photo.id) coverPhotoRef = null;
    wrap.remove();
  });
  const ref = { type: 'existing', id: photo.id };
  if (coverPhotoRef?.type === 'existing' && coverPhotoRef.id === photo.id) wrap.classList.add('is-cover');
  wrap.querySelector('.photo-thumb').addEventListener('click', () => toggleThumbCover(wrap, ref));
  grid.appendChild(wrap);
}

function renderPhotoThumb(file, dataUrl) {
  const grid = document.getElementById('photo-preview-grid');
  const wrap = document.createElement('div');
  wrap.className = 'photo-thumb-wrap';
  wrap.innerHTML = `<img class="photo-thumb" src="${dataUrl}" alt="${escHtml(file.name)}" title="클릭하여 대표 이미지로 지정">
    <span class="photo-thumb-star">★</span>
    <button class="photo-thumb-del" title="삭제">✕</button>`;
  wrap.querySelector('.photo-thumb-del').addEventListener('click', () => {
    pendingPhotos = pendingPhotos.filter(f => f !== file);
    if (coverPhotoRef?.type === 'pending' && coverPhotoRef.file === file) coverPhotoRef = null;
    wrap.remove();
  });
  wrap.querySelector('.photo-thumb').addEventListener('click', () => toggleThumbCover(wrap, { type: 'pending', file }));
  grid.appendChild(wrap);
}

// ============================================================
// 13. MUSIC SELECTION — MODAL LIST + PICKER SUB-MODAL
// ============================================================

/* ── 메인 모달의 음악 목록 렌더링 ── */
function renderModalMusicList() {
  const el = document.getElementById('modal-music-list');
  if (!el) return;
  if (pendingMusicList.length === 0) { el.innerHTML = ''; return; }
  el.innerHTML = pendingMusicList.map((item, idx) => {
    const name = item.name || '제목 없음';
    const displayName = name.length > 20 ? name.slice(0, 20) + '…' : name;
    return `<div class="modal-music-item">
      <span class="modal-music-item-icon">🎵</span>
      <div class="modal-music-item-info">
        <div class="modal-music-item-name" title="${escHtml(name)}">${escHtml(displayName)}</div>
        <div class="modal-music-item-artist">${escHtml(item.artist || '')}</div>
      </div>
      <button class="modal-music-item-del" onclick="removeMusicFromList(${idx})" title="삭제">✕</button>
    </div>`;
  }).join('');
}

function removeMusicFromList(idx) {
  pendingMusicList.splice(idx, 1);
  renderModalMusicList();
}

function addMusicToList(item) {
  pendingMusicList.push(item);
  renderModalMusicList();
  closeMusicPicker();
}

/* ── 음악 선택 서브 팝업 ── */
function openMusicPicker() {
  musicPickerMode = 'file';
  switchMusicPickerTab('file');
  document.getElementById('mp-file-input').value = '';
  document.getElementById('mp-category-select').value = '';
  document.getElementById('mp-music-list').style.display = 'none';
  document.getElementById('mp-music-items').innerHTML = '';
  document.getElementById('music-picker-modal').style.display = 'flex';
}

function closeMusicPicker() {
  stopMusicPreview();
  document.getElementById('music-picker-modal').style.display = 'none';
}

function switchMusicPickerTab(mode) {
  musicPickerMode = mode;
  const isFile = mode === 'file';
  document.getElementById('mptab-file').classList.toggle('active', isFile);
  document.getElementById('mptab-ai').classList.toggle('active', !isFile);
  document.getElementById('mp-file-section').style.display = isFile ? '' : 'none';
  document.getElementById('mp-ai-section').style.display   = isFile ? 'none' : '';
}

function renderPickerAiList(category) {
  const tracks = MUSIC_DATA[category] || [];
  const listWrap = document.getElementById('mp-music-list');
  const items    = document.getElementById('mp-music-items');
  if (tracks.length === 0) { listWrap.style.display = 'none'; return; }
  items.innerHTML = tracks.map(t => `
    <div class="music-item" data-id="${t.id}"
         onclick="pickerSelectAiTrack('${t.id}','${escHtml(category)}')">
      <div class="music-item-info">
        <div class="music-item-name">${escHtml(t.name)}</div>
        <div class="music-item-artist">${escHtml(t.artist)}</div>
      </div>
      <button class="btn-preview" data-id="${t.id}"
              onclick="event.stopPropagation(); handlePickerPreview('${t.id}','${escHtml(category)}')">
        ▶ 미리 듣기
      </button>
    </div>`).join('');
  listWrap.style.display = 'block';
}

function handlePickerPreview(trackId, category) {
  const track = MUSIC_DATA[category]?.find(t => t.id === trackId);
  if (!track) return;
  if (previewAudio && !previewAudio.paused) { stopMusicPreview(); return; }
  previewMusicTrack(track);
}

function pickerSelectAiTrack(trackId, category) {
  const track = MUSIC_DATA[category]?.find(t => t.id === trackId);
  if (!track) return;
  stopMusicPreview();
  addMusicToList({ id: track.id, name: track.name, artist: track.artist, url: track.url, source: 'ai' });
}

function initMusicPickerModal() {
  document.getElementById('btn-add-music').addEventListener('click', openMusicPicker);
  document.getElementById('btn-close-music-picker').addEventListener('click', closeMusicPicker);

  document.getElementById('mptab-file').addEventListener('click', () => switchMusicPickerTab('file'));
  document.getElementById('mptab-ai').addEventListener('click',   () => switchMusicPickerTab('ai'));

  // 음악 파일 선택 → 즉시 추가 후 닫기
  const mpFileInput = document.getElementById('mp-file-input');
  document.getElementById('btn-mp-file').addEventListener('click', () => mpFileInput.click());
  mpFileInput.addEventListener('change', function () {
    Array.from(this.files).forEach(file => {
      const name = file.name.replace(/\.[^.]+$/, '');
      pendingMusicList.push({ id: null, name, artist: '음악 파일', url: null, source: 'file', _file: file });
    });
    renderModalMusicList();
    closeMusicPicker();
    this.value = '';
  });

  // AI 제공 카테고리 선택
  document.getElementById('mp-category-select').addEventListener('change', function () {
    stopMusicPreview();
    if (this.value) renderPickerAiList(this.value);
    else document.getElementById('mp-music-list').style.display = 'none';
  });

  // 피커 오버레이 클릭 → 닫기
  document.getElementById('music-picker-modal').addEventListener('click', function (e) {
    if (e.target === this) closeMusicPicker();
  });
}

// ============================================================
// 14. TOAST
// ============================================================
let toastTimer = null;
function showToast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, 3000);
}

// ============================================================
// 18. UTILITY
// ============================================================
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ============================================================
// 19. EVENT BINDING
// ============================================================
function bindEvents() {
  // Add album modal
  document.getElementById('btn-add').addEventListener('click', openAddModal);
  document.getElementById('btn-close-add').addEventListener('click', closeAddModal);
  document.getElementById('btn-cancel-add').addEventListener('click', closeAddModal);
  document.getElementById('btn-save-album').addEventListener('click', saveAlbum);

  // Char counter
  document.getElementById('input-album-name').addEventListener('input', function () {
    document.getElementById('name-char-count').textContent = this.value.length;
  });

  // Slideshow controls
  document.getElementById('btn-slide-prev').addEventListener('click', () => {
    goToSlide(currentSlideIdx - 1, 'prev');
    if (slideshowPlaying) { stopSlideshow(); startSlideshow(); } // reset timer
  });
  document.getElementById('btn-slide-next').addEventListener('click', () => {
    goToSlide(currentSlideIdx + 1, 'next');
    if (slideshowPlaying) { stopSlideshow(); startSlideshow(); }
  });
  // 전체화면 — #pano-strip-wrap 자체를 fullscreen 요소로 삼아 슬라이드/화살표/드래그 로직을 그대로 재사용
  const stageWrap = document.getElementById('pano-strip-wrap');
  document.getElementById('btn-pano-fullscreen').addEventListener('click', () => {
    if (!document.fullscreenElement) stageWrap.requestFullscreen?.();
    else document.exitFullscreen?.();
  });
  document.addEventListener('fullscreenchange', () => {
    const isFs = document.fullscreenElement === stageWrap;
    const btn = document.getElementById('btn-pano-fullscreen');
    btn.title = isFs ? '전체화면 종료' : '전체화면';
    // 브라우저가 요소 크기를 바꿔도 load 이벤트가 다시 안 뜨므로, 현재 보이는 이미지를 직접 재계산
    ['pano-layer-a', 'pano-layer-b'].forEach(id => {
      const img = document.getElementById(id)?.querySelector('.pano-slide-img');
      if (img) requestAnimationFrame(() => _sizeSlideImg(img));
    });
  });

  // Left panel collapse toggle
  const leftPanel   = document.querySelector('.left-panel');
  const floatBtn    = document.getElementById('panel-float-btn');

  function collapsePanel() {
    leftPanel.classList.add('collapsed');
    // 트랜지션 끝난 뒤 플로팅 버튼 표시 (width 트랜지션 시간과 맞춤)
    setTimeout(() => floatBtn.classList.add('visible'), 300);
  }
  function expandPanel() {
    floatBtn.classList.remove('visible');
    leftPanel.classList.remove('collapsed');
  }

  document.getElementById('btn-collapse-panel').addEventListener('click', collapsePanel);
  floatBtn.addEventListener('click', expandPanel);

  // Music picker sub-modal
  initMusicPickerModal();

  // add-modal: 드래그 중이거나 드래그 직후 클릭은 닫기 무시
  let _addModalDragActive = false;
  const addModal = document.getElementById('add-modal');
  addModal.addEventListener('dragenter', e => { e.preventDefault(); _addModalDragActive = true; });
  addModal.addEventListener('dragover',  e => { e.preventDefault(); _addModalDragActive = true; });
  addModal.addEventListener('dragleave', e => {
    // relatedTarget 이 null 이면 화면 밖으로 나간 것
    if (!e.relatedTarget || !addModal.contains(e.relatedTarget)) _addModalDragActive = false;
  });
  addModal.addEventListener('drop', e => {
    e.preventDefault();
    _addModalDragActive = false;
  });
  addModal.addEventListener('click', function (e) {
    if (_addModalDragActive) return;
    if (e.target === this) closeAddModal();
  });
}

// ============================================================
// 20. INIT
// ============================================================
function init() {
  bindEvents();
  initDropZone();
  initPanoDrag();
}

// auth/auth.js의 onLogin 콜백에서 호출됨 — 로그인 성공 후에만 DB/Storage 접근 시작
async function initApp() {
  const saved = loadConfig();
  slideshowSpeed  = saved.slideSpeed  || 3000;
  slideshowEffect = saved.slideEffect || 'fade';
  musicVolume     = saved.musicVolume ?? 0.7;
  await loadAlbums();
  // 화면 로드 시 오른쪽 영역에 첫 앨범(가장 최근 등록) 대표 이미지를 바로 표시
  if (!selectedAlbum && albums.length > 0) selectAlbum(albums[0].id);
}
window.initApp = initApp;

document.addEventListener('DOMContentLoaded', init);
