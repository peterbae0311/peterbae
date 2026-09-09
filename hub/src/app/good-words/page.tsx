'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import localFont from 'next/font/local';
import { supabase } from '@/lib/supabase';
import { SUPER_ADMIN_EMAIL } from '@/lib/apps';
import ExpandViewModal from './ExpandViewModal';

// 보관함 카드 본문용 폰트 — 삼성긴고딕(사용자 제공 로컬 파일). 원본 파일명(한글+공백)이
// 번들러 경로 해석에서 말썽을 일으킬 수 있어 ./fonts/에 ASCII 파일명으로 복사해 참조한다.
// Bold도 같이 등록해두는 이유: Medium 하나만 있으면 hover:font-bold 같은 굵기 변화를 줄 때
// 브라우저가 합성(faux) 볼드로 뭉개 그려서 — 진짜 Bold 글리프를 매칭시키기 위함.
const samsungGothic = localFont({
  src: [
    { path: './fonts/samsung-gothic-medium.ttf', weight: '500', style: 'normal' },
    { path: './fonts/samsung-gothic-bold.ttf', weight: '700', style: 'normal' },
  ],
  display: 'swap',
});

// 화면 로드/새로고침·카테고리 전환마다 카드 배열 순서를 섞어 매번 다르게 보이게 한다 —
// 정렬 자체를 바꾸는 게 아니라 화면에 뿌리기 직전에만 섞으므로 DB/정렬 로직은 그대로 둔다.
function shuffle<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export interface GoodWordsCategory {
  id: string;
  label: string;
  classification: string | null;
  minLength: number;
  maxLength: number;
  generateCount: number;
  prompt: string;
  sortOrder: number;
}

export interface ArchiveItem {
  id: string;
  category: string;
  content: string;
  source: string | null;
  translation: string | null;
  created_at: string | null;
  created_by: string;
}

type CategoryModalState = { mode: 'create' } | { mode: 'edit'; category: GoodWordsCategory };

export default function GoodWordsPage() {
  const [email, setEmail] = useState<string | null | undefined>(undefined);

  const [categories, setCategories] = useState<GoodWordsCategory[] | null>(null);
  const [activeCategoryId, setActiveCategoryId] = useState('');

  const [archiveItems, setArchiveItems] = useState<ArchiveItem[]>([]);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [categoryModal, setCategoryModal] = useState<CategoryModalState | null>(null);
  const [expandModal, setExpandModal] = useState<{ index: number } | null>(null);
  const [editItem, setEditItem] = useState<ArchiveItem | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);

  // 카테고리 탭 드래그 순서 변경(SUPER_ADMIN 전용) — 대시보드 카드 드래그와 동일한 패턴.
  const [dragCategoryId, setDragCategoryId] = useState<string | null>(null);
  const [dragOverCategoryId, setDragOverCategoryId] = useState<string | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const draggedCategoryRef = useRef<GoodWordsCategory | null>(null);
  const blankDragImageRef = useRef<HTMLImageElement | null>(null);
  useEffect(() => {
    const img = new Image();
    img.src = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
    blankDragImageRef.current = img;
  }, []);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setEmail(user?.email ?? null);
    })();
  }, []);

  const loadCategories = useCallback(async () => {
    try {
      const res = await fetch('/api/good-words/categories');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '카테고리를 불러오지 못했습니다.');
      const list: GoodWordsCategory[] = data.categories;
      setCategories(list);
      setActiveCategoryId((prev) => (prev && list.some((c) => c.id === prev) ? prev : (list[0]?.id ?? '')));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '카테고리를 불러오지 못했습니다.');
    }
  }, []);

  useEffect(() => { loadCategories(); }, [loadCategories]);

  const loadArchive = useCallback(async () => {
    if (!activeCategoryId) { setArchiveItems([]); return; }
    setArchiveLoading(true);
    try {
      const res = await fetch(`/api/good-words?category=${encodeURIComponent(activeCategoryId)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '목록을 불러오지 못했습니다.');
      setArchiveItems(shuffle(data.items));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '목록을 불러오지 못했습니다.');
    } finally {
      setArchiveLoading(false);
    }
  }, [activeCategoryId]);

  useEffect(() => { loadArchive(); }, [loadArchive]);

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/good-words/${id}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 204) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? '삭제에 실패했습니다.');
      }
      setArchiveItems((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '삭제에 실패했습니다.');
    } finally {
      setDeletingId(null);
    }
  }

  async function handleAddItem(content: string, source: string | null, translation: string | null) {
    const res = await fetch('/api/good-words', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [{ category: activeCategoryId, content, source, translation }] }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? '추가에 실패했습니다.');
    if (data.saved === 0) throw new Error(data.rejected?.[0]?.reason ?? '추가에 실패했습니다.');
    await loadArchive();
  }

  async function handleUpdateItem(id: string, content: string, source: string | null, translation: string | null) {
    const res = await fetch(`/api/good-words/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, source, translation }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? '수정에 실패했습니다.');
    setArchiveItems((prev) => prev.map((item) => (item.id === id ? { ...item, content, source, translation } : item)));
  }

  function handleClose() {
    window.close();
    setTimeout(() => { window.location.href = '/dashboard'; }, 300);
  }

  function openEditModal(cat: GoodWordsCategory) {
    setActiveCategoryId(cat.id);
    setCategoryModal({ mode: 'edit', category: cat });
  }

  async function handleDeleteCategory(cat: GoodWordsCategory) {
    if (!window.confirm(`"${cat.label}" 카테고리를 삭제하면 관련된 좋은글이 모두 함께 삭제됩니다. 계속할까요?`)) return;
    try {
      const res = await fetch(`/api/good-words/categories/${cat.id}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 204) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? '삭제에 실패했습니다.');
      }
      setCategories((prev) => {
        const next = (prev ?? []).filter((c) => c.id !== cat.id);
        if (activeCategoryId === cat.id) setActiveCategoryId(next[0]?.id ?? '');
        return next;
      });
      setCategoryModal(null);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '삭제에 실패했습니다.');
    }
  }

  async function persistCategoryOrder(next: GoodWordsCategory[]) {
    try {
      const res = await fetch('/api/good-words/categories/reorder', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: next.map((c) => c.id) }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? '순서 저장에 실패했습니다.');
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '순서 저장에 실패했습니다.');
    }
  }

  function handleCategoryDrop(targetId: string) {
    if (!categories || !dragCategoryId || dragCategoryId === targetId) return;
    const from = categories.findIndex((c) => c.id === dragCategoryId);
    const to = categories.findIndex((c) => c.id === targetId);
    if (from === -1 || to === -1) return;
    const next = [...categories];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setCategories(next);
    persistCategoryOrder(next);
  }

  // 드래그 없이도(키보드/스크린리더 사용자) 순서를 바꿀 수 있는 대체 수단 — 인접한 항목과 자리만 바꾼다.
  function moveCategory(id: string, direction: -1 | 1) {
    if (!categories) return;
    const from = categories.findIndex((c) => c.id === id);
    const to = from + direction;
    if (from === -1 || to < 0 || to >= categories.length) return;
    const next = [...categories];
    [next[from], next[to]] = [next[to], next[from]];
    setCategories(next);
    persistCategoryOrder(next);
  }

  const isSuperAdmin = email === SUPER_ADMIN_EMAIL;

  if (email === undefined) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-gray-400">불러오는 중...</div>;
  }

  return (
    <div className={`min-h-screen px-6 py-8 ${samsungGothic.className}`}>
      <div className="w-full space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-black tracking-tighter text-neutral-900">좋은글</h1>
          <div className="flex items-center gap-2">
            {isSuperAdmin && (
              <button
                onClick={() => setCategoryModal({ mode: 'create' })}
                className="text-xs text-gray-600 border border-gray-200/80 rounded-lg px-3 py-2 hover:border-neutral-500 hover:text-neutral-900 hover:bg-neutral-100/60 transition-colors"
              >
                + 카테고리
              </button>
            )}
            <a
              href="/dashboard"
              className="text-xs text-gray-600 border border-gray-200/80 rounded-lg px-3 py-2 hover:border-neutral-500 hover:text-neutral-900 hover:bg-neutral-100/60 transition-colors"
            >
              대시보드
            </a>
            <button
              onClick={handleClose}
              className="text-xs text-gray-600 border border-gray-200/80 rounded-lg px-3 py-2 hover:border-neutral-500 hover:text-neutral-900 hover:bg-neutral-100/60 transition-colors"
            >
              닫기
            </button>
          </div>
        </div>

        {/* 카테고리 탭 */}
        <div className="flex items-center gap-1 border-b border-gray-200 overflow-x-auto">
          {categories === null ? (
            <p className="text-xs text-gray-400 py-3">불러오는 중...</p>
          ) : (
            categories.map((c, i) => (
              <div
                key={c.id}
                draggable={isSuperAdmin}
                onDragStart={(e) => {
                  if (!isSuperAdmin) return;
                  if (blankDragImageRef.current) e.dataTransfer.setDragImage(blankDragImageRef.current, 0, 0);
                  draggedCategoryRef.current = c;
                  setDragCategoryId(c.id);
                  setDragPos({ x: e.clientX, y: e.clientY });
                }}
                onDrag={(e) => { if (isSuperAdmin) setDragPos({ x: e.clientX, y: e.clientY }); }}
                onDragEnter={() => { if (isSuperAdmin) setDragOverCategoryId(c.id); }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); handleCategoryDrop(c.id); }}
                onDragEnd={() => { setDragCategoryId(null); setDragOverCategoryId(null); setDragPos(null); draggedCategoryRef.current = null; }}
                className={
                  'group relative flex items-center gap-1.5 shrink-0 '
                  + (isSuperAdmin ? 'cursor-grab active:cursor-grabbing ' : '')
                  + (dragCategoryId === c.id ? 'opacity-40 ' : dragOverCategoryId === c.id ? 'bg-neutral-100/60 ' : '')
                }
              >
                <button
                  onClick={() => setActiveCategoryId(c.id)}
                  className={`text-sm px-4 py-3 border-b-2 transition-colors whitespace-nowrap ${
                    activeCategoryId === c.id
                      ? 'border-neutral-900 text-neutral-900 font-bold'
                      : 'border-transparent text-gray-500 hover:text-neutral-900'
                  }`}
                >
                  {c.label}
                </button>
                {isSuperAdmin && (
                  <span className="inline-flex items-center gap-1.5 mr-2 px-1.5 py-1 rounded-md border border-gray-200 bg-white opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity">
                    <button
                      onClick={(e) => { e.stopPropagation(); openEditModal(c); }}
                      className="text-neutral-600 hover:text-neutral-900 text-base leading-none"
                      title="수정"
                    >✎</button>
                    <button
                      onClick={(e) => { e.stopPropagation(); moveCategory(c.id, -1); }}
                      disabled={i === 0}
                      aria-label={`${c.label} 카테고리를 왼쪽으로 이동`}
                      className="text-neutral-600 hover:text-neutral-900 text-base leading-none disabled:opacity-30"
                    >◀</button>
                    <button
                      onClick={(e) => { e.stopPropagation(); moveCategory(c.id, 1); }}
                      disabled={i === categories.length - 1}
                      aria-label={`${c.label} 카테고리를 오른쪽으로 이동`}
                      className="text-neutral-600 hover:text-neutral-900 text-base leading-none disabled:opacity-30"
                    >▶</button>
                    <span className="text-neutral-500 cursor-grab" title="드래그로 순서 이동">
                      <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor">
                        <circle cx="2" cy="2" r="1.4" />
                        <circle cx="8" cy="2" r="1.4" />
                        <circle cx="2" cy="7" r="1.4" />
                        <circle cx="8" cy="7" r="1.4" />
                        <circle cx="2" cy="12" r="1.4" />
                        <circle cx="8" cy="12" r="1.4" />
                      </svg>
                    </span>
                  </span>
                )}
              </div>
            ))
          )}
        </div>

        {message && <p className="text-xs text-red-500">{message}</p>}

        {/* 콘텐츠 영역 */}
        <div>
          <div className="flex justify-end gap-2 mb-4">
            {isSuperAdmin && (
              <button
                onClick={() => setAddModalOpen(true)}
                disabled={!activeCategoryId}
                className="text-xs rounded-lg px-3 py-2 border border-gray-200/80 text-gray-700 hover:border-neutral-500 hover:bg-neutral-100/60 disabled:opacity-40 transition-colors"
              >
                + 추가
              </button>
            )}
            <button
              onClick={() => setExpandModal({ index: 0 })}
              disabled={archiveItems.length === 0}
              className="text-xs rounded-lg px-3 py-2 border border-gray-200/80 text-gray-700 hover:border-neutral-500 hover:bg-neutral-100/60 disabled:opacity-40 transition-colors"
            >
              ⤢ 확대 보기
            </button>
          </div>

          {archiveLoading ? (
            <p className="text-sm text-gray-400 text-center py-16">불러오는 중...</p>
          ) : archiveItems.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-16">
              {isSuperAdmin
                ? '아직 저장된 글이 없습니다. 위 탭의 ✎ 버튼에서 카테고리를 열어 "좋은글 생성"을 눌러주세요.'
                : '아직 저장된 글이 없습니다.'}
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {archiveItems.map((item, i) => (
                <div
                  key={item.id}
                  onClick={() => setExpandModal({ index: i })}
                  className="group relative overflow-hidden rounded-2xl border border-amber-100 bg-gradient-to-b from-amber-50/70 to-white p-5 pt-6 cursor-pointer hover:border-amber-300 hover:shadow-lg hover:-translate-y-0.5 transition-all"
                >
                  {/* 장식용 인용부호 — 텍스트만 있어 삭막해 보이는 카드에 따뜻한 포인트를 주는
                      배경 장식일 뿐, 스크린리더에는 노출하지 않는다. */}
                  <span
                    aria-hidden
                    className="absolute -top-3 left-3 text-7xl text-amber-200/70 select-none pointer-events-none"
                  >“</span>

                  {isSuperAdmin && (
                    <div className="relative flex justify-end gap-1 mb-1 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity">
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditItem(item); }}
                        title="수정"
                        aria-label="수정"
                        className="w-7 h-7 flex items-center justify-center rounded-full text-gray-500 hover:text-amber-700 hover:bg-amber-100/60 transition-colors"
                      >✎</button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }}
                        disabled={deletingId === item.id}
                        title="삭제"
                        aria-label="삭제"
                        className="w-7 h-7 flex items-center justify-center rounded-full text-red-500 hover:text-red-700 hover:bg-red-50 disabled:opacity-40 transition-colors"
                      >
                        {deletingId === item.id ? (
                          <span className="w-3 h-3 border-2 border-red-300 border-t-red-600 rounded-full animate-spin" />
                        ) : (
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M2.5 4h11M5.5 4V2.5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V4m2 0-.6 9.4a1 1 0 0 1-1 .9H5.1a1 1 0 0 1-1-.9L3.5 4" />
                          </svg>
                        )}
                      </button>
                    </div>
                  )}
                  <p
                    className="relative text-sm text-stone-700 leading-relaxed line-clamp-6 whitespace-pre-wrap break-keep"
                  >{item.content}</p>
                  {item.translation && (
                    <p className="relative text-xs text-stone-400 leading-relaxed line-clamp-3 whitespace-pre-wrap mt-2 italic">{item.translation}</p>
                  )}
                  {item.source && (
                    <div className="relative mt-3">
                      <span className="inline-flex items-center gap-1.5 text-xs text-amber-700 bg-amber-100/60 border border-amber-200/70 rounded-full px-2.5 py-1">
                        <span className="text-amber-400">✦</span>{item.source}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {expandModal && archiveItems.length > 0 && (
        <ExpandViewModal
          items={archiveItems}
          startIndex={expandModal.index}
          categoryLabel={categories?.find((c) => c.id === activeCategoryId)?.label ?? ''}
          onClose={() => setExpandModal(null)}
        />
      )}

      {categoryModal && (
        <CategoryModal
          state={categoryModal}
          onClose={() => setCategoryModal(null)}
          onSaved={async (saved) => {
            await loadCategories();
            setActiveCategoryId(saved.id);
            setCategoryModal({ mode: 'edit', category: saved });
          }}
          onDeleted={() => setCategoryModal(null)}
          onDeleteCategory={handleDeleteCategory}
          onGenerated={async () => {
            await loadArchive();
          }}
        />
      )}

      {editItem && (
        <EditItemModal
          item={editItem}
          onClose={() => setEditItem(null)}
          onSave={async (content, source, translation) => {
            await handleUpdateItem(editItem.id, content, source, translation);
            setEditItem(null);
          }}
        />
      )}

      {addModalOpen && (
        <EditItemModal
          item={null}
          onClose={() => setAddModalOpen(false)}
          onSave={async (content, source, translation) => {
            await handleAddItem(content, source, translation);
            setAddModalOpen(false);
          }}
        />
      )}

      {dragCategoryId && dragPos && draggedCategoryRef.current && (
        <div
          className="fixed z-[999] pointer-events-none rounded-lg border-2 border-neutral-900 bg-white shadow-2xl px-3 py-2 text-sm font-semibold text-neutral-900"
          style={{ left: dragPos.x + 16, top: dragPos.y + 16 }}
        >
          {draggedCategoryRef.current.label}
        </div>
      )}
    </div>
  );
}

interface GeneratedItem { content: string; source: string; translation: string; }

function CategoryModal({
  state, onClose, onSaved, onDeleteCategory, onGenerated,
}: {
  state: CategoryModalState;
  onClose: () => void;
  onSaved: (saved: GoodWordsCategory) => void;
  onDeleted: () => void;
  onDeleteCategory: (cat: GoodWordsCategory) => void;
  onGenerated: () => void;
}) {
  const [category, setCategory] = useState<GoodWordsCategory | null>(state.mode === 'edit' ? state.category : null);
  const [label, setLabel] = useState(category?.label ?? '');
  const [classification, setClassification] = useState(category?.classification ?? '');
  const [minLength, setMinLength] = useState(category?.minLength ?? 10);
  const [maxLength, setMaxLength] = useState(category?.maxLength ?? 400);
  const [generateCount, setGenerateCount] = useState(category?.generateCount ?? 20);
  const [prompt, setPrompt] = useState(category?.prompt ?? '');
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  // "좋은글 생성" 완료 결과("groq 제공자로 8개 생성, 8개 저장됨") — 메인 화면에는 안 보이고
  // 이 모달 상단 제목 옆에만 표시한다(요청사항).
  const [generateResult, setGenerateResult] = useState<string | null>(null);
  // 카테고리를 아직 저장하지 않은 생성 화면(신규)에서는 저장할 카테고리 id가 없어 자동
  // 저장이 불가능하다 — 대신 결과를 미리보기로만 보여준다("저장 전 프롬프트 테스트").
  const [previewItems, setPreviewItems] = useState<GeneratedItem[] | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setInfo(null);
    try {
      const url = category ? `/api/good-words/categories/${category.id}` : '/api/good-words/categories';
      const method = category ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, classification, minLength, maxLength, generateCount, prompt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '저장에 실패했습니다.');
      const saved = category
        ? { ...category, label, classification: classification || null, minLength, maxLength, generateCount, prompt }
        : (data.category as GoodWordsCategory);
      setCategory(saved);
      setInfo('저장되었습니다.');
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  }

  async function handleGenerate() {
    if (!prompt.trim()) { setError('AI 프롬프트를 입력해주세요.'); return; }
    setGenerating(true);
    setError(null);
    setInfo(null);
    setGenerateResult(null);
    setPreviewItems(null);
    try {
      const genRes = await fetch('/api/good-words/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, minLength, maxLength, generateCount }),
      });
      const genData = await genRes.json();
      if (!genRes.ok) throw new Error(genData.error ?? '생성에 실패했습니다.');

      const items: GeneratedItem[] = genData.items;
      if (items.length === 0) {
        setInfo(`${genData.provider} 제공자로 생성된 항목이 없습니다.`);
        return;
      }

      // 아직 저장 안 한 새 카테고리는 저장할 category id가 없다 — 미리보기만 보여주고,
      // "저장" 눌러서 카테고리를 만든 뒤 다시 생성하면 그때 자동 저장된다.
      if (!category) {
        setPreviewItems(items);
        setInfo(`${genData.provider} 제공자로 ${items.length}개 생성됨 (미리보기 — 저장하려면 먼저 카테고리를 저장하세요)`);
        return;
      }

      const saveRes = await fetch('/api/good-words', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map((it) => ({ category: category.id, content: it.content, source: it.source, translation: it.translation || null })),
        }),
      });
      const saveData = await saveRes.json();
      if (!saveRes.ok) throw new Error(saveData.error ?? '저장에 실패했습니다.');

      setGenerateResult(`${genData.provider} 제공자로 ${items.length}개 생성, ${saveData.saved}개 저장됨`);
      onGenerated();
    } catch (err) {
      setError(err instanceof Error ? err.message : '생성에 실패했습니다.');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-lg shadow-xl w-[1000px] h-[88vh] max-w-full flex flex-col relative">
        {generating && (
          <div className="absolute inset-0 bg-white/95 rounded-lg z-10 flex flex-col items-center justify-center gap-3">
            <div className="w-8 h-8 border-2 border-gray-200 border-t-neutral-900 rounded-full animate-spin" />
            <p className="text-sm text-gray-600">좋은글을 생성하고 있습니다...</p>
            <p className="text-xs text-gray-400">최대 1~2분 정도 걸릴 수 있어요.</p>
          </div>
        )}

        <div className="shrink-0 flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold text-gray-800">카테고리 {category ? '수정' : '생성'}</span>
            {generateResult && <span className="text-xs text-gray-500">{generateResult}</span>}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-lg leading-none">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="flex items-center gap-3">
            <label className="w-28 shrink-0 text-xs font-semibold text-gray-600">제목 <span className="text-red-500">*</span></label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="카테고리의 제목을 입력하세요."
              maxLength={30}
              className="flex-1 px-3 py-2 border border-gray-200/80 bg-white/60 rounded-md text-sm text-gray-800 focus:outline-none focus:border-neutral-500 focus:ring-1 focus:ring-neutral-500 transition-colors"
            />
          </div>
          <div className="flex items-center gap-3">
            <label className="w-28 shrink-0 text-xs font-semibold text-gray-600">분류</label>
            <input
              value={classification}
              onChange={(e) => setClassification(e.target.value)}
              placeholder="카테고리의 분류를 입력하세요."
              maxLength={50}
              className="flex-1 px-3 py-2 border border-gray-200/80 bg-white/60 rounded-md text-sm text-gray-800 focus:outline-none focus:border-neutral-500 focus:ring-1 focus:ring-neutral-500 transition-colors"
            />
          </div>
          <div className="flex items-center gap-3">
            <label className="w-28 shrink-0 text-xs font-semibold text-gray-600">글자수</label>
            <div className="flex-1 flex items-center gap-2">
              <input
                type="number"
                value={minLength}
                onChange={(e) => setMinLength(Number(e.target.value))}
                min={10}
                max={4000}
                aria-label="글자수 최소"
                className="flex-1 px-3 py-2 border border-gray-200/80 bg-white/60 rounded-md text-sm text-gray-800 focus:outline-none focus:border-neutral-500 focus:ring-1 focus:ring-neutral-500 transition-colors"
              />
              <span className="text-xs text-gray-400 shrink-0">~</span>
              <input
                type="number"
                value={maxLength}
                onChange={(e) => setMaxLength(Number(e.target.value))}
                min={10}
                max={4000}
                aria-label="글자수 최대"
                className="flex-1 px-3 py-2 border border-gray-200/80 bg-white/60 rounded-md text-sm text-gray-800 focus:outline-none focus:border-neutral-500 focus:ring-1 focus:ring-neutral-500 transition-colors"
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <label className="w-28 shrink-0 text-xs font-semibold text-gray-600">문장 개수</label>
            <input
              type="number"
              value={generateCount}
              onChange={(e) => setGenerateCount(Number(e.target.value))}
              min={1}
              max={50}
              className="flex-1 px-3 py-2 border border-gray-200/80 bg-white/60 rounded-md text-sm text-gray-800 focus:outline-none focus:border-neutral-500 focus:ring-1 focus:ring-neutral-500 transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">프롬프트 <span className="text-red-500">*</span></label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="AI 프롬프트를 입력하세요."
              style={{ height: '419px' }}
              className="w-full px-3 py-2 border border-gray-200/80 bg-white/60 rounded-md text-sm text-gray-800 leading-relaxed focus:outline-none focus:border-neutral-500 focus:ring-1 focus:ring-neutral-500 transition-colors"
            />
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}
          {info && <p className="text-xs text-gray-500">{info}</p>}

          {previewItems && (
            <div className="border border-dashed border-gray-300 rounded-lg p-3 space-y-2 max-h-48 overflow-y-auto">
              {previewItems.map((it, i) => (
                <div key={i} className="text-xs text-gray-600 border-b border-gray-100 pb-2 last:border-0">
                  <p>{it.content}</p>
                  {it.translation && <p className="text-gray-500 italic mt-1">{it.translation}</p>}
                  <p className="text-gray-400 mt-1">{`< ${it.source} >`}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="shrink-0 flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-200">
          {category && (
            <button
              onClick={() => onDeleteCategory(category)}
              className="px-3 py-2 text-xs text-red-500 border border-gray-200/80 rounded-lg hover:border-red-400 hover:bg-red-50 transition-colors mr-auto"
            >
              삭제
            </button>
          )}
          <button onClick={onClose} className="px-3 py-2 text-xs text-gray-600 border border-gray-200/80 rounded-lg hover:border-neutral-500 hover:text-neutral-900 hover:bg-neutral-100/60 transition-colors">
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-2 text-xs font-semibold rounded-lg bg-neutral-900 text-white hover:bg-neutral-700 disabled:opacity-50 transition-colors"
          >
            {saving ? '저장 중...' : '저장'}
          </button>
          <button
            onClick={handleGenerate}
            disabled={generating}
            title={category ? undefined : '생성 결과를 미리보기만 하고, 저장하려면 먼저 "저장"을 눌러 카테고리를 만드세요.'}
            className="px-3 py-2 text-xs rounded-lg border border-gray-200/80 text-gray-700 hover:border-neutral-500 hover:bg-neutral-100/60 disabled:opacity-50 transition-colors"
          >
            좋은글 생성{category ? '' : ' (미리보기)'}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditItemModal({
  item, onClose, onSave,
}: {
  item: ArchiveItem | null;
  onClose: () => void;
  onSave: (content: string, source: string | null, translation: string | null) => Promise<void>;
}) {
  const [content, setContent] = useState(item?.content ?? '');
  const [source, setSource] = useState(item?.source ?? '');
  const [translation, setTranslation] = useState(item?.translation ?? '');
  const [saving, setSaving] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!content.trim()) { setError('내용을 입력해주세요.'); return; }
    setSaving(true);
    setError(null);
    try {
      await onSave(content.trim(), source.trim() || null, translation.trim() || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : (item ? '수정에 실패했습니다.' : '추가에 실패했습니다.'));
    } finally {
      setSaving(false);
    }
  }

  async function handleTranslate() {
    if (!content.trim()) { setError('먼저 내용을 입력해주세요.'); return; }
    setTranslating(true);
    setError(null);
    try {
      const res = await fetch('/api/good-words/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: content.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '번역 생성에 실패했습니다.');
      setTranslation(data.translation);
    } catch (err) {
      setError(err instanceof Error ? err.message : '번역 생성에 실패했습니다.');
    } finally {
      setTranslating(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-lg shadow-xl w-[1000px] max-w-full max-h-[85vh] flex flex-col">
        <div className="shrink-0 flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <span className="text-sm font-bold text-gray-800">좋은글 {item ? '수정' : '추가'}</span>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-lg leading-none">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">내용</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={10}
              className="w-full px-3 py-2 border border-gray-200/80 bg-white/60 rounded-md text-sm text-gray-800 leading-relaxed focus:outline-none focus:border-neutral-500 focus:ring-1 focus:ring-neutral-500 transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">출처</label>
            <input
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="예: 이효석 · 낙엽을 태우면서"
              className="w-full px-3 py-2 border border-gray-200/80 bg-white/60 rounded-md text-sm text-gray-800 focus:outline-none focus:border-neutral-500 focus:ring-1 focus:ring-neutral-500 transition-colors"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-gray-600">한국어 번역 (원문이 한국어가 아닐 경우)</label>
              <button
                onClick={handleTranslate}
                disabled={translating}
                className="text-xs text-gray-500 hover:text-neutral-900 disabled:opacity-40"
              >
                {translating ? '번역 중...' : '번역 생성'}
              </button>
            </div>
            <textarea
              value={translation}
              onChange={(e) => setTranslation(e.target.value)}
              rows={6}
              placeholder="원문이 한국어가 아니면 번역을 입력하거나 '번역 생성' 버튼을 눌러주세요."
              className="w-full px-3 py-2 border border-gray-200/80 bg-white/60 rounded-md text-sm text-gray-800 leading-relaxed focus:outline-none focus:border-neutral-500 focus:ring-1 focus:ring-neutral-500 transition-colors"
            />
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>

        <div className="shrink-0 flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-200">
          <button onClick={onClose} className="px-3 py-2 text-xs text-gray-600 border border-gray-200/80 rounded-lg hover:border-neutral-500 hover:text-neutral-900 hover:bg-neutral-100/60 transition-colors">
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-2 text-xs font-semibold rounded-lg bg-neutral-900 text-white hover:bg-neutral-700 disabled:opacity-50 transition-colors"
          >
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}
