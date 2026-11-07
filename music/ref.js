/* 인기곡: 세부 장르별 인기곡 Top 20(hub /api/music/toptracks → Last.fm tag.getTopTracks, 그 태그를 붙인 청취자가 많은 순).
 * 장르·세부 장르는 추천 조합과 같은 목록(GENRES + 곡 분석으로 자동 추가한 장르 ✦)을 쓴다.
 * 곡마다 유튜브·스포티파이 검색 링크와 [원곡 정보 찾기](곡으로 조합 만들기 ②로 제목·가수를 넘겨 웹 정보 검색)를 둔다.
 * 결과는 하루 동안 이 브라우저에 기억해 같은 장르를 다시 열 때 서버를 부르지 않는다. */

// 세부 장르 → Last.fm 태그. 앱의 영어 장르명이 Last.fm에서 잘 안 쓰이는 이름이면 실제로 많이 쓰는 태그로 바꾼다
const REF_TAGS = {
  '재즈 발라드': ['jazz ballad', 'vocal jazz'], '스윙 재즈': ['swing'], '보사노바 재즈': ['bossa nova'],
  '컨템포러리 재즈': ['smooth jazz', 'contemporary jazz'], '재즈 팝': ['jazz pop'],
  '팝 발라드': ['ballad'], '어쿠스틱 발라드': ['acoustic'], 'R&B 발라드': ['slow jams', 'rnb'],
  '록 발라드': ['power ballad', 'rock ballad'], '시네마틱 발라드': ['cinematic'],
  '어쿠스틱 팝': ['acoustic pop'], '신스 팝': ['synthpop'], '인디 팝': ['indie pop'], '드림 팝': ['dream pop'], '시티 팝': ['city pop'],
  '로파이 힙합': ['lo-fi', 'lofi hip hop'], '재즈 힙합': ['jazz hop', 'jazz rap'], '붐뱁 힙합': ['boom bap'],
  '멜로딕 힙합': ['melodic rap'], '칠 힙합': ['chillhop'],
  '트랩': ['trap'], '하우스·EDM': ['house', 'edm'], '펑크': ['funk'], '록': ['rock'],
};
// 20곡이 안 될 때 채울 넓은 장르 태그(세부 장르별 → 없으면 장르 탭별)
const REF_FALLBACK_SUB = { '트랩': 'hip-hop', '펑크': 'soul', 'R&B 발라드': 'rnb', '시네마틱 발라드': 'soundtrack' };
const REF_FALLBACK_TAB = { 재즈: 'jazz', 발라드: 'ballad', 팝: 'pop', 힙합: 'hip-hop', '일렉트로닉·밴드': 'electronic' };
const REF_CACHE_KEY = 'music.ref.cache.v1';
const REF_SEL_KEY = 'music.ref.sel';
const REF_TTL = 24 * 60 * 60 * 1000;

const ref = { tabs: $('#ref-tabs'), subs: $('#ref-subs'), out: $('#ref-out') };
let refSel = { tab: 0, sub: '' };
try { Object.assign(refSel, JSON.parse(localStorage.getItem(REF_SEL_KEY) || '{}')); } catch {}
let refCache = {};
try { refCache = JSON.parse(localStorage.getItem(REF_CACHE_KEY) || '{}'); } catch {}
const saveRef = () => {
  try { localStorage.setItem(REF_SEL_KEY, JSON.stringify(refSel)); localStorage.setItem(REF_CACHE_KEY, JSON.stringify(refCache)); } catch {}
};

// 고른 세부 장르의 태그·넓은 장르. 자동 추가 장르(✦)는 영어 장르명을 태그로 쓴다
function refTagsFor(name) {
  const cg = customGenre(name);
  const tab = cg?.cat ?? GENRES.find((g) => g.items.some((it) => it.name === name))?.name;
  const tags = REF_TAGS[name] ?? (cg ? [cg.en] : (GENRE_EN[name] ?? name).split(', '));
  return { tags, fallback: REF_FALLBACK_SUB[name] ?? REF_FALLBACK_TAB[tab] ?? 'pop' };
}

function renderRefTabs() {
  refSel.tab = Math.min(Math.max(0, refSel.tab), GENRES.length - 1);
  ref.tabs.replaceChildren(...GENRES.map((g, i) => {
    const t = Object.assign(document.createElement('button'), { type: 'button', className: 'gtab', textContent: g.name });
    t.setAttribute('role', 'tab');
    t.setAttribute('aria-selected', String(i === refSel.tab));
    t.onclick = () => { refSel.tab = i; saveRef(); renderRefTabs(); };
    return t;
  }));
  const g = GENRES[refSel.tab];
  const names = [...g.items.map((it) => it.name), ...customGenres.filter((c) => c.cat === g.name).map((c) => c.name)];
  ref.subs.replaceChildren(...names.map((name) => {
    const c = Object.assign(document.createElement('button'), { type: 'button', className: 'sb-chip', textContent: customGenre(name) ? `${name} ✦` : name });
    c.setAttribute('aria-pressed', String(refSel.sub === name));
    c.onclick = () => { refSel.sub = name; saveRef(); renderRefTabs(); loadRef(name); };
    return c;
  }));
}

async function loadRef(name, force = false) {
  const hit = refCache[name];
  if (!force && hit && Date.now() - hit.at < REF_TTL) return renderRef(name, hit.data);
  ref.out.innerHTML = `<p class="ref-empty">${esc(name)} 인기곡을 가져오는 중…</p>`;
  try {
    const r = await fetch('/api/music/toptracks', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...refTagsFor(name), limit: 20 }),
    });
    const d = await r.json().catch(() => null);
    if (!r.ok || !d) throw new Error(d?.error || ([404, 405, 501].includes(r.status) ? 'NO_SERVER' : `HTTP ${r.status}`));
    refCache[name] = { at: Date.now(), data: d };
    saveRef();
    if (refSel.sub === name) renderRef(name, d);
  } catch (e) {
    if (refSel.sub !== name) return;
    ref.out.innerHTML = `<p class="ref-empty">${e.message === 'NO_SERVER' ? '인기곡은 허브가 있는 배포 사이트에서만 볼 수 있습니다.' : `인기곡을 가져오지 못했습니다: ${esc(e.message)}`}</p>`;
  }
}

function renderRef(name, d) {
  const q = (t) => encodeURIComponent(`${t.artist} ${t.name}`);
  const head = `<div class="ref-head"><h3>${esc(name)} 인기곡 Top ${d.tracks.length}</h3>
    <small>Last.fm '${esc(d.tags.join("', '"))}' 태그 · 청취자 순${d.fallback ? ` · 모자란 곡은 '${esc(d.fallback)}'에서 채움` : ''}</small>
    <button type="button" class="ghost" id="ref-reload" title="하루 동안 기억한 목록 대신 지금 다시 가져옵니다">새로고침</button></div>`;
  if (!d.tracks.length) {
    ref.out.innerHTML = `${head}<p class="ref-empty">이 장르 태그가 붙은 곡을 찾지 못했습니다.</p>`;
  } else {
    ref.out.innerHTML = `${head}<ol class="ref-list">${d.tracks.map((t, i) => `<li>
      <span class="ref-rank">${i + 1}</span>
      <span class="ref-song"><b title="${esc(t.name)}">${esc(t.name)}</b><small>${esc(t.artist)}${t.from ? ` <span class="ref-from">· '${esc(t.from)}'에서</span>` : ''}</small></span>
      <span class="ref-acts">
        <a class="ghost" href="https://www.youtube.com/results?search_query=${q(t)}" target="_blank" rel="noopener noreferrer">▶ 유튜브</a>
        <a class="ghost" href="https://open.spotify.com/search/${q(t)}" target="_blank" rel="noopener noreferrer">스포티파이</a>
        <button type="button" class="ghost" data-ref="${i}">원곡 정보 찾기</button>
      </span></li>`).join('')}</ol>`;
    ref.out.querySelectorAll('[data-ref]').forEach((b) => { b.onclick = () => refFindInfo(d.tracks[+b.dataset.ref]); });
  }
  $('#ref-reload').onclick = () => loadRef(name, true);
}

// 곡으로 조합 만들기의 ② 원곡 정보 확인으로 제목·가수를 넘기고 웹 정보를 찾는다(소리 분석 없이도 확인할 수 있게 ②를 연다)
function refFindInfo(t) {
  $('#tab-upload').click();
  const btn = $('#panel-upload .pdesc');
  if (btn && btn.getAttribute('aria-expanded') !== 'true') setPanelOpen(btn, true);
  $('#song-step').hidden = false;
  songInfoSeq++; // 진행 중이던 링크 제목 조회가 덮어쓰지 않게
  setSongInfo(t.name, t.artist, '인기곡 탭에서 가져왔습니다. 소리까지 분석하려면 위 ①에서 곡을 가져오세요.');
  $('#song-step').scrollIntoView({ behavior: 'smooth', block: 'start' });
  si.find.click();
}

$('#tab-ref').addEventListener('click', () => {
  renderRefTabs(); // 그사이 자동 추가된 장르(✦)도 보이게
  if (refSel.sub && !ref.out.children.length) loadRef(refSel.sub);
});
renderRefTabs();
