'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { APPS, SUPER_ADMIN_EMAIL, fullUrl } from '@/lib/apps';
import { decodeSessionId } from '@/lib/jwt';

interface CardOverride {
  app_key: string;
  custom_label: string | null;
  custom_description: string | null;
  custom_image: string | null;
  sort_order: number;
}

interface CardData {
  key: string;
  path: string;
  label: string;
  description: string;
  image: string | null;
  sortOrder: number;
}

const CARD_IMAGE_WIDTH = 560;
const CARD_IMAGE_HEIGHT = 374;

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('이미지를 불러오지 못했습니다.'));
    img.src = src;
  });
}

// 원본 비율과 무관하게 3:2(560x374) 프레임에 cover 방식으로 중앙을 잘라 webp로 인코딩한다
// — 로컬 선택 이미지뿐 아니라 AI 생성 이미지(정사각형으로 생성 — generate-image/route.ts 참고)도
// 동일하게 통과시켜 항상 같은 규격/포맷으로 저장한다. 7:3(560x240)이었을 때는 정사각형
// 생성본에서 57%를 잘라내 피사체가 과도하게 잘린 느낌이 있어 3:2(33% crop)로 완화했다.
async function cropToCardWebp(src: string): Promise<string> {
  const img = await loadImageElement(src);
  const canvas = document.createElement('canvas');
  canvas.width = CARD_IMAGE_WIDTH;
  canvas.height = CARD_IMAGE_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('이미지 처리를 지원하지 않는 브라우저입니다.');
  const targetRatio = CARD_IMAGE_WIDTH / CARD_IMAGE_HEIGHT;
  const srcRatio = img.width / img.height;
  let sx = 0, sy = 0, sw = img.width, sh = img.height;
  if (srcRatio > targetRatio) {
    sw = img.height * targetRatio;
    sx = (img.width - sw) / 2;
  } else {
    sh = img.width / targetRatio;
    sy = (img.height - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, CARD_IMAGE_WIDTH, CARD_IMAGE_HEIGHT);
  return canvas.toDataURL('image/webp', 0.85);
}

// 등록된 이미지가 없을 때의 기본 표시 — 사진 대신 아이콘으로 (사진을 넓고 낮은 배너에
// 채우면 피사체 비율에 따라 과도하게 눌려 보이는 문제가 있어, 이미지가 아예 없는 경우는
// 왜곡 걱정 없는 아이콘 플레이스홀더로 대체한다).
function AppIconPlaceholder() {
  return (
    <div className="w-full h-[187px] shrink-0 flex items-center justify-center bg-gradient-to-br from-neutral-100 to-neutral-200">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-400">
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </svg>
    </div>
  );
}

function formatRelativeTime(iso: string): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (diffSec < 60) return '방금 전';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}시간 전`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 30) return `${diffDay}일 전`;
  const diffMonth = Math.floor(diffDay / 30);
  if (diffMonth < 12) return `${diffMonth}개월 전`;
  return `${Math.floor(diffMonth / 12)}년 전`;
}

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export default function DashboardPage() {
  const [email, setEmail] = useState<string | null>(null);
  const [allowedKeys, setAllowedKeys] = useState<Set<string> | null>(null);
  const [overrides, setOverrides] = useState<Record<string, CardOverride>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [orderedCards, setOrderedCards] = useState<CardData[] | null>(null);
  const [deployTimes, setDeployTimes] = useState<Record<string, string>>({});
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const draggedCardRef = useRef<CardData | null>(null);
  // 브라우저 기본 드래그 고스트 이미지를 완전히 숨기기 위한 투명 1x1 이미지
  // (기본 고스트는 브라우저가 반투명하게 렌더링해서 잘 안 보이므로, 아래 커스텀
  // 미리보기 div로 대체한다).
  const blankDragImageRef = useRef<HTMLImageElement | null>(null);
  useEffect(() => {
    const img = new Image();
    img.src = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
    blankDragImageRef.current = img;
  }, []);

  // 관리자가 등록한 값(이미지 등)을 전 계정 공통 기본값으로 쓰고, 각자 자신의 행이
  // 있으면(개인화) 그게 우선한다 — RLS는 본인 행 + 관리자 행만 읽을 수 있게 열려 있음.
  const loadOverrides = useCallback(async (userEmail: string) => {
    const emails = userEmail === SUPER_ADMIN_EMAIL ? [userEmail] : [userEmail, SUPER_ADMIN_EMAIL];
    const { data } = await supabase
      .from('dashboard_cards')
      .select('email, app_key, custom_label, custom_description, custom_image, sort_order')
      .in('email', emails);
    const map: Record<string, CardOverride> = {};
    // 관리자 행 먼저 채우고, 본인 행으로 덮어써서 개인화가 우선하도록 한다.
    (data ?? [])
      .filter(row => row.email === SUPER_ADMIN_EMAIL)
      .forEach(row => { map[row.app_key as string] = row as CardOverride; });
    (data ?? [])
      .filter(row => row.email === userEmail)
      .forEach(row => { map[row.app_key as string] = row as CardOverride; });
    setOverrides(map);
  }, []);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const userEmail = user?.email ?? null;
      setEmail(userEmail);

      if (!userEmail) return;

      if (userEmail === SUPER_ADMIN_EMAIL) {
        setAllowedKeys(new Set(APPS.map(a => a.key)));
      } else {
        const { data } = await supabase
          .from('app_access')
          .select('app_key')
          .eq('email', userEmail);
        setAllowedKeys(new Set((data ?? []).map(r => r.app_key as string)));
      }

      await loadOverrides(userEmail);
    })();
  }, [loadOverrides]);

  // 배포 시각은 GitHub 커밋 히스토리에서 직접 조회한다(/api/dashboard/deploy-times 참고 —
  // 원래 계획이던 CI 웹훅 방식은 nginx SSO 게이트에 막혀서 이 방식으로 교체했다).
  useEffect(() => {
    (async () => {
      const res = await fetch('/api/dashboard/deploy-times');
      if (!res.ok) return;
      const data = await res.json();
      setDeployTimes(data.deployTimes ?? {});
    })();
  }, []);

  async function copyUrl(key: string, path: string) {
    await navigator.clipboard.writeText(fullUrl(path));
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(k => (k === key ? null : k)), 1500);
  }

  async function logout() {
    const { data: { session } } = await supabase.auth.getSession();
    const sessionId = session ? decodeSessionId(session.access_token) : null;
    if (sessionId) {
      // signOut 전에 보내야 세션 쿠키가 아직 유효 — 실패해도 로그아웃 자체는 계속 진행.
      await fetch('/api/auth/logout-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      }).catch(() => {});
    }
    await supabase.auth.signOut();
    window.location.href = '/login';
  }

  const isSuperAdmin = email === SUPER_ADMIN_EMAIL;

  const cards: CardData[] = (allowedKeys ? APPS.filter(a => allowedKeys.has(a.key)) : [])
    .map((app, i) => {
      const o = overrides[app.key];
      return {
        key: app.key,
        path: app.path,
        label: o?.custom_label || app.label,
        description: o?.custom_description || '',
        image: o?.custom_image || null,
        sortOrder: o?.sort_order ?? i,
      };
    })
    .sort((a, b) => a.sortOrder - b.sortOrder);

  // allowedKeys/overrides가 새로 로드될 때만 드래그 순서를 다시 씌운다 —
  // 드래그 중 리렌더로 orderedCards가 튀지 않도록 별도 state로 분리.
  useEffect(() => {
    if (allowedKeys === null) return;
    setOrderedCards(cards);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowedKeys, overrides]);

  async function persistCardOrder(next: CardData[]) {
    if (!email) return;
    const payload = next.map((c, i) => ({
      email,
      app_key: c.key,
      custom_label: c.label.trim() || null,
      custom_description: c.description.trim() || null,
      sort_order: i,
    }));
    await supabase.from('dashboard_cards').upsert(payload, { onConflict: 'email,app_key' });
    await loadOverrides(email);
  }

  function handleCardDrop(targetKey: string) {
    if (!orderedCards || !dragKey || dragKey === targetKey) return;
    const from = orderedCards.findIndex(c => c.key === dragKey);
    const to = orderedCards.findIndex(c => c.key === targetKey);
    if (from === -1 || to === -1) return;
    const next = [...orderedCards];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setOrderedCards(next);
    persistCardOrder(next);
  }

  return (
    <div className="min-h-screen px-4 py-10">
      <div className="max-w-[1500px] mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-black tracking-tighter text-neutral-900">앱 대시보드</h1>
            <p className="text-sm text-gray-500 mt-1">{email}로 로그인됨</p>
          </div>
          <div className="flex items-center gap-2">
            {cards.length > 0 && (
              <button
                onClick={() => setSettingsOpen(true)}
                className="text-xs text-gray-600 border border-gray-200/80 rounded-lg px-3 py-2 hover:border-neutral-500 hover:text-neutral-900 hover:bg-neutral-100/60 transition-colors"
              >
                카드 설정
              </button>
            )}
            {isSuperAdmin && (
              <Link
                href="/admin"
                className="text-xs text-gray-600 border border-gray-200/80 rounded-lg px-3 py-2 hover:border-neutral-500 hover:text-neutral-900 hover:bg-neutral-100/60 transition-colors"
              >
                Admin
              </Link>
            )}
            <button
              onClick={logout}
              className="text-xs text-gray-600 border border-gray-200/80 rounded-lg px-3 py-2 hover:border-neutral-500 hover:text-neutral-900 hover:bg-neutral-100/60 transition-colors"
            >
              로그아웃
            </button>
          </div>
        </div>

        {allowedKeys === null || orderedCards === null ? (
          <p className="text-sm text-gray-400">불러오는 중...</p>
        ) : orderedCards.length === 0 ? (
          <div className="rounded-2xl border border-white/60 bg-white/70 backdrop-blur-xl shadow-glass p-10 text-center text-gray-400 text-sm">
            아직 접근 권한이 부여된 항목이 없습니다.<br />관리자에게 문의하세요.
          </div>
        ) : (
          <div
            className={
              orderedCards.length <= 3
                ? 'flex flex-wrap justify-center gap-x-[25px] gap-y-6'
                : 'grid gap-x-[25px] gap-y-6'
            }
            style={orderedCards.length <= 3 ? undefined : { gridTemplateColumns: 'repeat(5, 280px)' }}
          >
            {orderedCards.map(card => (
              <div
                key={card.key}
                draggable
                onDragStart={e => {
                  if (blankDragImageRef.current) e.dataTransfer.setDragImage(blankDragImageRef.current, 0, 0);
                  draggedCardRef.current = card;
                  setDragKey(card.key);
                  setDragPos({ x: e.clientX, y: e.clientY });
                }}
                onDrag={e => setDragPos({ x: e.clientX, y: e.clientY })}
                onDragEnter={() => setDragOverKey(card.key)}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); handleCardDrop(card.key); }}
                onDragEnd={() => { setDragKey(null); setDragOverKey(null); setDragPos(null); draggedCardRef.current = null; }}
                onClick={() => window.open(card.path, '_blank', 'noopener,noreferrer')}
                className={
                  'group w-full sm:w-[280px] flex flex-col rounded-xl border overflow-hidden transition-all duration-200 cursor-pointer active:cursor-grabbing '
                  + (dragKey === card.key
                    ? 'bg-neutral-100/70 border-dashed border-neutral-400 '
                    : dragOverKey === card.key
                      ? 'bg-white/70 backdrop-blur-xl shadow-glass border-neutral-500 ring-2 ring-neutral-300 '
                      : 'bg-white/70 hover:bg-white backdrop-blur-xl shadow-glass hover:shadow-lg hover:-translate-y-1 border-white/60 hover:border-neutral-300 ')
                }
              >
                {card.image ? (
                  <img src={card.image} alt="" className="w-full h-[187px] object-cover shrink-0" />
                ) : (
                  <AppIconPlaceholder />
                )}
                <div className="flex-1 flex flex-col min-w-0 px-4 py-3">
                  <span className="font-bold text-neutral-900 truncate" title={card.label}>
                    {card.label}
                  </span>
                  <p
                    className="text-xs text-gray-500 mt-1 line-clamp-2 min-h-[2.25rem]"
                    title={card.description || undefined}
                  >
                    {card.description}
                  </p>
                  <div className="mt-2 pt-2 border-t border-gray-100/80 flex items-center justify-between gap-2">
                    <span
                      className="text-xs text-gray-400 truncate"
                      title={deployTimes[card.key] ? `최종 배포: ${new Date(deployTimes[card.key]).toLocaleString('ko-KR')}` : undefined}
                    >
                      {deployTimes[card.key] ? formatRelativeTime(deployTimes[card.key]) : '배포 정보 없음'}
                    </span>
                    <button
                      onClick={e => { e.stopPropagation(); copyUrl(card.key, card.path); }}
                      title="URL 복사"
                      className={
                        'shrink-0 p-1.5 rounded-lg border border-gray-200/80 text-gray-600 hover:border-neutral-500 hover:bg-neutral-100/60 transition-opacity '
                        + (copiedKey === card.key ? 'opacity-100' : 'opacity-40 group-hover:opacity-100 group-focus-within:opacity-100')
                      }
                    >
                      {copiedKey === card.key ? <CheckIcon /> : <CopyIcon />}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {settingsOpen && email && (
        <CardSettingsModal
          email={email}
          cards={orderedCards ?? cards}
          onSaved={async () => { await loadOverrides(email); setSettingsOpen(false); }}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {dragKey && dragPos && draggedCardRef.current && (
        <div
          className="fixed z-[999] pointer-events-none w-[280px] rounded-xl border-2 border-neutral-900 bg-white shadow-2xl px-4 py-3"
          style={{ left: dragPos.x + 16, top: dragPos.y + 16 }}
        >
          <span className="font-bold text-neutral-900 truncate block">
            {draggedCardRef.current.label}
          </span>
          <p className="text-xs text-gray-500 mt-1 line-clamp-1">
            {draggedCardRef.current.description}
          </p>
        </div>
      )}
    </div>
  );
}

function CardSettingsModal({
  email, cards, onSaved, onClose,
}: {
  email: string;
  cards: CardData[];
  onSaved: () => void;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<CardData[]>(cards.map(c => ({ ...c })));
  const [saving, setSaving] = useState(false);
  const [imageStatus, setImageStatus] = useState<Record<string, { busy: boolean; error: string | null }>>({});
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  function updateRow(key: string, changes: Partial<CardData>) {
    setRows(rs => rs.map(r => r.key === key ? { ...r, ...changes } : r));
  }

  function pickLocalImage(key: string) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setImageStatus(s => ({ ...s, [key]: { busy: true, error: null } }));
      try {
        const reader = new FileReader();
        const dataUrl = await new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error('파일을 읽지 못했습니다.'));
          reader.readAsDataURL(file);
        });
        const webp = await cropToCardWebp(dataUrl);
        updateRow(key, { image: webp });
        setImageStatus(s => ({ ...s, [key]: { busy: false, error: null } }));
      } catch (err) {
        setImageStatus(s => ({ ...s, [key]: { busy: false, error: err instanceof Error ? err.message : '이미지 처리에 실패했습니다.' } }));
      }
    };
    input.click();
  }

  async function generateImage(row: CardData) {
    if (!row.label.trim()) {
      setImageStatus(s => ({ ...s, [row.key]: { busy: false, error: '카드 제목을 먼저 입력해주세요.' } }));
      return;
    }
    setImageStatus(s => ({ ...s, [row.key]: { busy: true, error: null } }));
    try {
      const res = await fetch('/api/dashboard/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: row.label, description: row.description }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '이미지 생성에 실패했습니다.');
      // provider(HF/Pollinations)가 반환한 포맷/크기와 무관하게 규격을 통일한다.
      const webp = await cropToCardWebp(data.dataUrl);
      updateRow(row.key, { image: webp });
      setImageStatus(s => ({ ...s, [row.key]: { busy: false, error: null } }));
    } catch (err) {
      setImageStatus(s => ({ ...s, [row.key]: { busy: false, error: err instanceof Error ? err.message : '이미지 생성에 실패했습니다.' } }));
    }
  }

  function moveRow(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= rows.length) return;
    const reordered = [...rows];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setRows(reordered);
  }

  async function save() {
    setSaving(true);
    const payload = rows.map((r, i) => ({
      email,
      app_key: r.key,
      custom_label: r.label.trim() || null,
      custom_description: r.description.trim() || null,
      custom_image: r.image,
      sort_order: i,
    }));
    await supabase.from('dashboard_cards').upsert(payload, { onConflict: 'email,app_key' });
    setSaving(false);
    onSaved();
  }

  return (
    <>
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-[520px] max-w-[92vw] max-h-[85vh] flex flex-col">
        <div className="shrink-0 flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <span className="text-sm font-bold text-gray-800">카드 설정</span>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-lg leading-none">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {rows.map((row, i) => (
            <div key={row.key} className="flex gap-2 border border-gray-200/80 rounded-lg p-3">
              <div className="flex flex-col shrink-0 pt-1">
                <button
                  onClick={() => moveRow(i, -1)}
                  disabled={i === 0}
                  className="text-gray-400 hover:text-neutral-900 disabled:opacity-20 disabled:hover:text-gray-400 leading-none text-xs px-1"
                  title="위로"
                >▲</button>
                <button
                  onClick={() => moveRow(i, 1)}
                  disabled={i === rows.length - 1}
                  className="text-gray-400 hover:text-neutral-900 disabled:opacity-20 disabled:hover:text-gray-400 leading-none text-xs px-1"
                  title="아래로"
                >▼</button>
              </div>
              <div className="flex-1 min-w-0 space-y-1.5">
                <input
                  value={row.label}
                  onChange={e => updateRow(row.key, { label: e.target.value })}
                  placeholder="카드 이름"
                  className="w-full px-2.5 py-1.5 border border-gray-200/80 bg-white/60 rounded-md text-sm font-semibold text-gray-800 focus:outline-none focus:border-neutral-500 focus:ring-1 focus:ring-neutral-500 transition-colors"
                />
                <input
                  value={row.description}
                  onChange={e => updateRow(row.key, { description: e.target.value })}
                  placeholder="설명 (선택)"
                  className="w-full px-2.5 py-1.5 border border-gray-200/80 bg-white/60 rounded-md text-xs text-gray-600 focus:outline-none focus:border-neutral-500 focus:ring-1 focus:ring-neutral-500 transition-colors"
                />
                <div className="flex items-center gap-2">
                  {row.image ? (
                    <img
                      src={row.image}
                      alt=""
                      onClick={() => setPreviewImage(row.image)}
                      className="w-20 h-[53px] object-cover rounded border border-gray-200/80 shrink-0 cursor-zoom-in hover:opacity-80 transition-opacity"
                    />
                  ) : (
                    <div className="w-20 h-[53px] shrink-0 rounded border border-dashed border-gray-200 flex items-center justify-center text-[10px] text-gray-400">
                      없음
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => pickLocalImage(row.key)}
                    disabled={imageStatus[row.key]?.busy}
                    className="shrink-0 text-[11px] text-gray-600 border border-gray-200/80 rounded-md px-2 py-1.5 hover:border-neutral-500 hover:bg-neutral-100/60 disabled:opacity-50 transition-colors"
                  >
                    이미지 선택
                  </button>
                  <button
                    type="button"
                    onClick={() => generateImage(row)}
                    disabled={imageStatus[row.key]?.busy}
                    className="shrink-0 text-[11px] text-gray-600 border border-gray-200/80 rounded-md px-2 py-1.5 hover:border-neutral-500 hover:bg-neutral-100/60 disabled:opacity-50 transition-colors"
                  >
                    {imageStatus[row.key]?.busy ? '생성 중...' : '이미지 생성'}
                  </button>
                  {row.image && !imageStatus[row.key]?.busy && (
                    <button
                      type="button"
                      onClick={() => updateRow(row.key, { image: null })}
                      className="shrink-0 text-[11px] text-gray-400 hover:text-red-500 transition-colors"
                    >
                      제거
                    </button>
                  )}
                </div>
                {imageStatus[row.key]?.error && (
                  <p className="text-[11px] text-red-500">{imageStatus[row.key]?.error}</p>
                )}
                <p className="text-[11px] text-gray-400 truncate">{row.path}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="shrink-0 flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-200">
          <button onClick={onClose} className="px-3 py-2 text-xs text-gray-600 border border-gray-200/80 rounded-lg hover:border-neutral-500 hover:text-neutral-900 hover:bg-neutral-100/60 transition-colors">
            취소
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="px-3 py-2 text-xs text-gray-600 border border-gray-200/80 rounded-lg hover:border-neutral-500 hover:text-neutral-900 hover:bg-neutral-100/60 disabled:opacity-50 transition-colors"
          >
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>

    {previewImage && (
      <div
        className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] cursor-zoom-out"
        onClick={() => setPreviewImage(null)}
      >
        <img
          src={previewImage}
          alt=""
          className="rounded-lg shadow-2xl"
          style={{ width: CARD_IMAGE_WIDTH, height: CARD_IMAGE_HEIGHT, maxWidth: '90vw', maxHeight: '90vh' }}
        />
        <button
          onClick={() => setPreviewImage(null)}
          className="absolute top-4 right-4 text-white/80 hover:text-white text-2xl leading-none"
        >
          ✕
        </button>
      </div>
    )}
    </>
  );
}
