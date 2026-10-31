/* Suno 작곡: 만든 곡을 등록·수정·삭제하는 목록.
 * 지금은 이 브라우저(IndexedDB)에만 저장한다. 나중에 서버로 옮길 때는 songStore만 같은 모양의
 * API(list/get/getFile/save/remove)로 바꾸면 화면 코드는 그대로 쓸 수 있다. */

/* ---------------- 저장소(IndexedDB) ---------------- */
const songStore = (() => {
  const DB = 'music-songs';
  let dbP;
  const open = () => (dbP ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('songs', { keyPath: 'id' }); // 곡 정보
      req.result.createObjectStore('files');                  // 음원 파일(Blob), key = 곡 id
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { dbP = null; reject(req.error); };
  }));
  const tx = async (stores, mode, fn) => {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(stores, mode);
      const out = fn(...stores.map((s) => t.objectStore(s)));
      t.oncomplete = () => resolve(out?.result ?? out);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('저장이 취소되었습니다'));
    });
  };
  return {
    list: () => tx(['songs'], 'readonly', (s) => s.getAll()),
    getFile: (id) => tx(['files'], 'readonly', (f) => f.get(id)),
    // file: Blob(새 파일) · null(파일 삭제) · undefined(그대로 둠)
    save: (song, file) => tx(['songs', 'files'], 'readwrite', (s, f) => {
      s.put(song);
      if (file) f.put(file, song.id);
      else if (file === null) f.delete(song.id);
    }),
    remove: (id) => tx(['songs', 'files'], 'readwrite', (s, f) => { s.delete(id); f.delete(id); }),
  };
})();

/* ---------------- 항목 정의 ---------------- */
const USAGE_TYPES = ['플레이리스트', '영상 음악', '단독 음원'];
const LLM_TYPES = ['ChatGPT', 'Claude', 'Gemini', 'Etc']; // 가사·스타일 등을 만들 때 쓴 LLM
// 팝업 입력칸 이름(파일 제외). 순서는 화면 순서와 같다
const RATINGS = ['작곡 전', 'S', 'A', 'B', 'C', 'D']; // Suno 곡 평가(작곡 전 = 아직 만들지 않음)
// Suno 생성 설정의 기본값(새 곡, 그리고 이 항목이 생기기 전에 저장한 곡)
const SUNO_DEFAULTS = { maxMode: 'Off', weirdness: '20', styleInfluence: '80', variety: 'Off', personalize: 'Off' };
const SONG_FIELDS = ['rating', 'ratingNote', 'titleKo', 'titleEn', 'usage', 'sourceName', 'genre', 'bpm', 'duration', 'style',
  'vocalGender', 'maxMode', 'weirdness', 'styleInfluence', 'variety', 'personalize', 'lyricsKo', 'lyricsEn', 'sunoUrl', 'llm', 'createdOn', 'prompt'];
// 장르 선택지: 추천 조합의 세부 장르(영문) + 자주 쓰는 큰 장르
const SONG_GENRES = [...new Set([
  ...Object.values(GENRE_EN).flatMap((g) => g.split(', ')),
  'k-pop', 'pop', 'ballad', 'r&b', 'hip hop', 'jazz', 'electronic', 'ambient', 'classical', 'cinematic', 'acoustic', 'other',
])].map((g) => g.replace(/\b[a-z]/g, (c) => c.toUpperCase()).replace('Edm', 'EDM').replace('R&b', 'R&B').replace('K-Pop', 'K-pop'))
  .sort((a, b) => a.localeCompare(b));

const songEl = {
  panel: $('#panel-songs'), tbody: $('#song-rows'), empty: $('#song-empty'), count: $('#song-count'),
  dialog: $('#song-dialog'), form: $('#song-form'), player: $('#song-player'),
};
let songs = [];
let editing = null; // 수정 중인 곡(null이면 새 곡)
let pendingFile;    // 팝업에서 고른 파일: Blob · null(삭제) · undefined(그대로)
let playingId = null;

const fmtSize = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`);
const today = () => new Date().toISOString().slice(0, 10);
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `s${Date.now()}${Math.random().toString(16).slice(2)}`);

/* ---------------- 목록 ---------------- */
async function loadSongs() {
  try {
    songs = await songStore.list();
  } catch (err) {
    console.error(err);
    songs = [];
    flash('곡 목록을 불러오지 못했습니다. 브라우저의 사이트 데이터 저장이 막혀 있는지 확인해 주세요.', 'error');
  }
  // 생성일 최신순, 같으면 나중에 등록한 곡이 위로
  songs.sort((a, b) => (b.createdOn || '').localeCompare(a.createdOn || '') || b.addedAt - a.addedAt);
  renderSongs();
}

function cell(text, cls) {
  const td = document.createElement('td');
  if (cls) td.className = cls;
  td.textContent = text ?? '';
  return td;
}

function renderSongs() {
  songEl.count.textContent = `${songs.length}곡`;
  songEl.empty.hidden = songs.length > 0;
  songEl.tbody.replaceChildren(...songs.map((s) => {
    const tr = document.createElement('tr');
    tr.tabIndex = 0;
    tr.title = '더블클릭(또는 Enter)하면 수정합니다';
    const rating = document.createElement('td');
    const r = s.rating || '작곡 전';
    rating.append(Object.assign(document.createElement('span'), { className: `song-grade g-${RATINGS.indexOf(r)}`, textContent: r }));
    if (s.ratingNote) rating.title = s.ratingNote;
    const title = document.createElement('td');
    title.className = 'song-title';
    title.append(Object.assign(document.createElement('b'), { textContent: s.titleKo }));
    if (s.titleEn) title.append(Object.assign(document.createElement('small'), { textContent: s.titleEn }));
    const play = document.createElement('td');
    if (s.fileName) {
      const b = Object.assign(document.createElement('button'), { className: 'ghost song-play', textContent: playingId === s.id ? '■ 정지' : '▶ 재생' });
      b.setAttribute('aria-label', `${s.titleKo} ${playingId === s.id ? '정지' : '재생'}`);
      b.onclick = (e) => { e.stopPropagation(); togglePlay(s); };
      play.append(b);
    } else play.append(Object.assign(document.createElement('span'), { className: 'muted', textContent: '—' }));
    const link = document.createElement('td');
    if (s.sunoUrl) {
      const a = Object.assign(document.createElement('a'), { href: s.sunoUrl, target: '_blank', rel: 'noopener noreferrer', textContent: '열기 ↗' });
      a.onclick = (e) => e.stopPropagation();
      link.append(a);
    }
    const del = document.createElement('td');
    const db = Object.assign(document.createElement('button'), { className: 'ghost danger song-del', textContent: '삭제' });
    db.setAttribute('aria-label', `${s.titleKo} 삭제`);
    db.onclick = (e) => { e.stopPropagation(); deleteSong(s); };
    del.append(db);
    const usage = document.createElement('td');
    usage.className = 'song-usage';
    usage.append(Object.assign(document.createElement('span'), { textContent: s.usage }));
    if (s.sourceName) usage.append(Object.assign(document.createElement('small'), { textContent: s.sourceName }));
    tr.append(rating, title, usage, cell(s.genre), cell(s.bpm ? String(s.bpm) : '', 'num'), cell(s.duration, 'num'), cell(s.createdOn, 'num'), play, link, del);
    tr.ondblclick = () => openSong(s);
    tr.onkeydown = (e) => { if (e.key === 'Enter' && e.target === tr) openSong(s); };
    return tr;
  }));
}

async function togglePlay(s) {
  const p = songEl.player;
  if (playingId === s.id) {
    p.pause();
    playingId = null;
    return renderSongs();
  }
  const file = await songStore.getFile(s.id).catch(() => null);
  if (!file) return flash('음원 파일을 찾지 못했습니다. 곡을 수정해서 파일을 다시 올려 주세요.', 'error');
  if (p.src) URL.revokeObjectURL(p.src);
  p.src = URL.createObjectURL(file);
  stopTransport(); // 믹서와 겹쳐 들리지 않게
  playingId = s.id;
  p.play().catch(() => { playingId = null; renderSongs(); flash('이 파일은 브라우저에서 재생할 수 없습니다.', 'error'); });
  renderSongs();
}
songEl.player.onended = songEl.player.onpause = () => {
  if (!songEl.player.ended && !songEl.player.paused) return;
  playingId = null;
  renderSongs();
};

async function deleteSong(s) {
  if (!confirm(`"${s.titleKo}" 곡을 삭제할까요?\n음원 파일도 함께 지워지고 되돌릴 수 없습니다.`)) return false;
  if (playingId === s.id) { songEl.player.pause(); playingId = null; }
  try {
    await songStore.remove(s.id);
  } catch (err) {
    console.error(err);
    flash('삭제하지 못했습니다. 다시 시도해 주세요.', 'error');
    return false;
  }
  flash(`"${s.titleKo}" 곡을 삭제했습니다.`, 'ok');
  await loadSongs();
  return true;
}

/* ---------------- 등록·수정 팝업 ---------------- */
const f = (name) => songEl.form.elements[name];

function fillGenreOptions() {
  const sel = f('genre');
  sel.replaceChildren(new Option('선택 안 함', ''), ...SONG_GENRES.map((g) => new Option(g, g)));
}

function renderFileState(name, size) {
  const box = $('#song-file-state');
  box.replaceChildren();
  if (!name) return;
  box.append(Object.assign(document.createElement('span'), { textContent: `${name}${size ? ` (${fmtSize(size)})` : ''}` }));
  const rm = Object.assign(document.createElement('button'), { type: 'button', className: 'ghost', textContent: '파일 빼기' });
  rm.onclick = () => { pendingFile = null; f('file').value = ''; renderFileState(); };
  box.append(rm);
}

// draft: 새 곡을 미리 채워 열 때의 값(제목·가사 탭의 [Suno 작곡에 저장])
function openSong(s = null, draft = {}) {
  editing = s;
  pendingFile = undefined;
  songEl.form.reset();
  $('#song-dialog-title').textContent = s ? '곡 수정' : '곡 추가';
  $('#song-delete').hidden = !s;
  $('#song-error').textContent = '';
  const v = s ?? { createdOn: today(), ...draft };
  for (const k of SONG_FIELDS) f(k).value = v[k] ?? '';
  if (!RATINGS.includes(f('rating').value)) f('rating').value = '작곡 전'; // 새 곡·평가 항목이 없던 예전 곡
  for (const [k, d] of Object.entries(SUNO_DEFAULTS)) if (v[k] == null || v[k] === '') f(k).value = d;
  showRanges();
  // 예전에 고른 장르가 목록에 없으면(직접 입력 등) 선택지로 넣어 둔다
  if (v.genre && !SONG_GENRES.includes(v.genre)) f('genre').append(new Option(v.genre, v.genre, true, true));
  renderFileState(s?.fileName, s?.fileSize);
  songEl.dialog.showModal();
  f('titleKo').focus();
}

// Weirdness·Style Influence 막대 옆에 지금 값(%)을 보여 준다
function showRanges() {
  songEl.form.querySelectorAll('output[data-for]').forEach((o) => { o.value = `${f(o.dataset.for).value}%`; });
}
songEl.form.addEventListener('input', (e) => { if (e.target.type === 'range') showRanges(); });

// 음원 파일을 고르면 재생시간을 비어 있을 때 자동으로 채운다
f('file').onchange = () => {
  const file = f('file').files[0];
  if (!file) return;
  if (!/^audio\//.test(file.type) && !/\.(mp3|wav|m4a|flac|ogg|aac)$/i.test(file.name)) {
    f('file').value = '';
    return showFormError('오디오 파일(MP3, WAV 등)만 올릴 수 있습니다.');
  }
  pendingFile = file;
  renderFileState(file.name, file.size);
  const probe = new Audio();
  probe.preload = 'metadata';
  probe.src = URL.createObjectURL(file);
  probe.onloadedmetadata = () => {
    if (!f('duration').value && isFinite(probe.duration)) f('duration').value = fmtTime(probe.duration).padStart(5, '0'); // 03:45 형식
    URL.revokeObjectURL(probe.src);
  };
};

$('#song-style-import').onclick = () => {
  const text = $('#sb-style').value.trim();
  if (!text) return showFormError('Suno Style Builder에서 먼저 [생성]을 눌러 스타일을 만들어 주세요.');
  f('style').value = text;
  // Style Builder에서 고른 장르·BPM도 비어 있으면 같이 채운다
  if (!f('bpm').value && sb.bpm) f('bpm').value = sb.bpm;
  if (!f('genre').value && sb.genre) {
    const g = SONG_GENRES.find((x) => x.toLowerCase() === GENRE_EN[sb.genre].split(', ')[0]);
    if (g) f('genre').value = g;
  }
};

function showFormError(msg) {
  $('#song-error').textContent = msg;
}

songEl.form.onsubmit = async (e) => {
  e.preventDefault();
  const v = Object.fromEntries(SONG_FIELDS.map((k) => [k, f(k).value.trim()]));
  if (!v.titleKo) { f('titleKo').focus(); return showFormError('제목(KO)을 입력해 주세요.'); }
  if (!v.usage) { f('usage').focus(); return showFormError('음원 활용 유형을 골라 주세요.'); }
  if (v.bpm && !(Number(v.bpm) >= 20 && Number(v.bpm) <= 300)) { f('bpm').focus(); return showFormError('BPM은 20~300 사이 숫자로 입력해 주세요.'); }
  if (v.duration && !/^\d{1,3}:[0-5]\d$/.test(v.duration)) { f('duration').focus(); return showFormError('재생시간은 03:45처럼 분:초로 입력해 주세요.'); }
  if (v.sunoUrl && !/^https?:\/\//i.test(v.sunoUrl)) { f('sunoUrl').focus(); return showFormError('Suno 링크는 https://로 시작하는 주소를 넣어 주세요.'); }
  const song = {
    ...(editing ?? { id: newId(), addedAt: Date.now() }),
    ...v,
    bpm: v.bpm ? Math.round(Number(v.bpm)) : '',
    updatedAt: Date.now(),
  };
  if (pendingFile) Object.assign(song, { fileName: pendingFile.name, fileType: pendingFile.type, fileSize: pendingFile.size });
  if (pendingFile === null) Object.assign(song, { fileName: '', fileType: '', fileSize: 0 });
  try {
    await songStore.save(song, pendingFile);
  } catch (err) {
    console.error(err);
    return showFormError(/quota/i.test(String(err))
      ? '브라우저 저장 공간이 부족합니다. 다른 곡의 음원 파일을 빼거나 내보내기로 백업한 뒤 정리해 주세요.'
      : '저장하지 못했습니다. 다시 시도해 주세요.');
  }
  songEl.dialog.close();
  flash(`"${song.titleKo}" 곡을 ${editing ? '수정' : '추가'}했습니다.`, 'ok');
  await loadSongs();
};

// 항목 이름 옆 복사 아이콘: 그 칸에 지금 입력된 값을 복사(선택 목록은 고른 항목의 글자)
songEl.form.addEventListener('click', async (e) => {
  const btn = e.target.closest('.sd-copy');
  if (!btn) return;
  const el = f(btn.dataset.copy);
  const value = (el.tagName === 'SELECT' ? (el.value ? el.selectedOptions[0].text : '') : el.value).trim();
  const label = btn.getAttribute('aria-label').replace(/ 복사$/, '');
  if (!value) return flash(`${label}에 복사할 내용이 없습니다.`, 'warn');
  if (!(await copyText(value))) return;
  btn.classList.add('done');
  setTimeout(() => btn.classList.remove('done'), 1200);
  flash(`${label}을(를) 복사했습니다.`, 'ok');
});

$('#song-cancel').onclick = () => songEl.dialog.close();
$('#song-delete').onclick = async () => {
  if (editing && await deleteSong(editing)) songEl.dialog.close();
};
$('#song-add').onclick = () => openSong();

/* ---------------- 백업(내보내기·가져오기) ---------------- */
const blobToDataUrl = (b) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = () => reject(r.error);
  r.readAsDataURL(b);
});

$('#song-export').onclick = async () => {
  if (!songs.length) return flash('내보낼 곡이 없습니다.', 'warn');
  const items = [];
  for (const s of songs) {
    const file = s.fileName ? await songStore.getFile(s.id).catch(() => null) : null;
    items.push({ ...s, file: file ? await blobToDataUrl(file) : null });
  }
  const blob = new Blob([JSON.stringify({ app: 'music-songs', version: 1, exportedAt: new Date().toISOString(), songs: items })], { type: 'application/json' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `suno-songs-${today()}.json` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  flash(`${items.length}곡을 백업 파일로 내보냈습니다. 음원 파일도 함께 들어 있습니다.`, 'ok');
};

$('#song-import').onclick = () => $('#song-import-file').click();
$('#song-import-file').onchange = async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  let data;
  try {
    data = JSON.parse(await file.text());
    if (data.app !== 'music-songs' || !Array.isArray(data.songs)) throw new Error('형식이 다름');
  } catch {
    return flash('악기 믹서에서 내보낸 백업 파일(.json)이 아닙니다.', 'error');
  }
  let n = 0;
  for (const { file: dataUrl, ...s } of data.songs) {
    if (!s.id || !s.titleKo) continue;
    const blob = dataUrl ? await (await fetch(dataUrl)).blob() : undefined;
    await songStore.save(s, blob);
    n++;
  }
  await loadSongs();
  flash(`${n}곡을 가져왔습니다. 같은 곡이 이미 있으면 백업 내용으로 덮어썼습니다.`, 'ok');
};

fillGenreOptions();
f('usage').replaceChildren(new Option('선택해 주세요', ''), ...USAGE_TYPES.map((u) => new Option(u, u)));
f('rating').replaceChildren(...RATINGS.map((x) => new Option(x, x)));
f('llm').replaceChildren(new Option('선택 안 함', ''), ...LLM_TYPES.map((u) => new Option(u, u)));
loadSongs();
