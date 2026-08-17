'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { SUPER_ADMIN_EMAIL } from '@/lib/apps';
import ExpandViewModal from './ExpandViewModal';

export interface GoodWordsCategory {
  id: string;
  label: string;
  classification: string | null;
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
      setArchiveItems(data.items);
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
    <div className="min-h-screen px-6 py-8">
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
                  <span className="hidden group-hover:inline-flex items-center gap-1 pr-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); openEditModal(c); }}
                      className="text-gray-400 hover:text-neutral-900 text-xs"
                      title="수정"
                    >✎</button>
                    <button
                      onClick={(e) => { e.stopPropagation(); moveCategory(c.id, -1); }}
                      disabled={i === 0}
                      aria-label={`${c.label} 카테고리를 왼쪽으로 이동`}
                      className="text-gray-400 hover:text-neutral-900 text-xs disabled:opacity-30"
                    >◀</button>
                    <button
                      onClick={(e) => { e.stopPropagation(); moveCategory(c.id, 1); }}
                      disabled={i === categories.length - 1}
                      aria-label={`${c.label} 카테고리를 오른쪽으로 이동`}
                      className="text-gray-400 hover:text-neutral-900 text-xs disabled:opacity-30"
                    >▶</button>
                    <span className="text-gray-300 text-xs cursor-grab" title="드래그로 순서 이동">⠿</span>
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
                  className="rounded-xl border border-gray-200/80 bg-white/70 p-4 cursor-pointer hover:border-neutral-400 hover:shadow-sm transition-all"
                >
                  {isSuperAdmin && (
                    <div className="flex justify-end gap-2 mb-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditItem(item); }}
                        className="text-xs text-gray-500 hover:text-neutral-900"
                      >
                        수정
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }}
                        disabled={deletingId === item.id}
                        className="text-xs text-red-500 hover:text-red-700 disabled:opacity-40"
                      >
                        {deletingId === item.id ? '삭제 중...' : '삭제'}
                      </button>
                    </div>
                  )}
                  <p className="text-sm text-gray-700 leading-relaxed line-clamp-6 whitespace-pre-wrap">{item.content}</p>
                  {item.translation && (
                    <p className="text-xs text-gray-500 leading-relaxed line-clamp-3 whitespace-pre-wrap mt-2 italic">{item.translation}</p>
                  )}
                  {item.source && (
                    <p className="text-xs text-gray-400 mt-3">{`< ${item.source} >`}</p>
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
        body: JSON.stringify({ label, classification, maxLength, generateCount, prompt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '저장에 실패했습니다.');
      const saved = category
        ? { ...category, label, classification: classification || null, maxLength, generateCount, prompt }
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
        body: JSON.stringify({ prompt, maxLength, generateCount }),
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
            <label className="w-28 shrink-0 text-xs font-semibold text-gray-600">최대 글자수</label>
            <input
              type="number"
              value={maxLength}
              onChange={(e) => setMaxLength(Number(e.target.value))}
              min={10}
              max={4000}
              className="flex-1 px-3 py-2 border border-gray-200/80 bg-white/60 rounded-md text-sm text-gray-800 focus:outline-none focus:border-neutral-500 focus:ring-1 focus:ring-neutral-500 transition-colors"
            />
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
