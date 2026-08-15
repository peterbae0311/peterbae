'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { SUPER_ADMIN_EMAIL } from '@/lib/apps';
import SlideshowViewer, { SlideshowItem } from './SlideshowViewer';

interface GoodWordsCategory {
  id: string;
  label: string;
  sortOrder: number;
}

interface ArchiveItem {
  id: string;
  category: string;
  content: string;
  source: string | null;
  created_at: string | null;
  created_by: string;
}

export default function GoodWordsPage() {
  const [email, setEmail] = useState<string | null | undefined>(undefined);

  const [categories, setCategories] = useState<GoodWordsCategory[] | null>(null);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [showAllCategories, setShowAllCategories] = useState(false);

  // 카테고리 관리(SUPER_ADMIN 전용) — 이름 변경/추가/드래그 순서 변경
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState('');
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategoryLabel, setNewCategoryLabel] = useState('');
  const [deletingCategoryId, setDeletingCategoryId] = useState<string | null>(null);
  const [dragCategoryId, setDragCategoryId] = useState<string | null>(null);
  const [dragOverCategoryId, setDragOverCategoryId] = useState<string | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const draggedCategoryRef = useRef<GoodWordsCategory | null>(null);
  // 브라우저 기본 드래그 고스트 이미지를 숨기기 위한 투명 1x1 이미지(대시보드 카드 드래그와 동일한 패턴).
  const blankDragImageRef = useRef<HTMLImageElement | null>(null);
  useEffect(() => {
    const img = new Image();
    img.src = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
    blankDragImageRef.current = img;
  }, []);

  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [generateInfo, setGenerateInfo] = useState<string | null>(null);

  const [archiveItems, setArchiveItems] = useState<ArchiveItem[]>([]);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [slideshowItems, setSlideshowItems] = useState<SlideshowItem[] | null>(null);

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
      setSelectedCategory((prev) => (prev && list.some((c) => c.id === prev) ? prev : (list[0]?.id ?? '')));
    } catch (err) {
      setSaveMessage(err instanceof Error ? err.message : '카테고리를 불러오지 못했습니다.');
    }
  }, []);

  useEffect(() => { loadCategories(); }, [loadCategories]);

  function categoryLabel(id: string): string {
    return categories?.find((c) => c.id === id)?.label ?? id;
  }

  const loadArchive = useCallback(async (): Promise<ArchiveItem[]> => {
    setArchiveLoading(true);
    try {
      const url = showAllCategories
        ? '/api/good-words'
        : `/api/good-words?category=${encodeURIComponent(selectedCategory)}`;
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '보관함을 불러오지 못했습니다.');
      setArchiveItems(data.items);
      return data.items as ArchiveItem[];
    } catch (err) {
      setSaveMessage(err instanceof Error ? err.message : '보관함을 불러오지 못했습니다.');
      return [];
    } finally {
      setArchiveLoading(false);
    }
  }, [selectedCategory, showAllCategories]);

  useEffect(() => { loadArchive(); }, [loadArchive]);

  /** 생성 즉시 가드레일을 통과한 글을 전부 DB에 저장하고, 보관함 목록을 새로고침한다. */
  async function handleGenerate() {
    if (!selectedCategory) return;
    setGenerating(true);
    setGenerateError(null);
    setGenerateInfo(null);
    try {
      const res = await fetch('/api/good-words/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: selectedCategory }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '생성에 실패했습니다.');

      if (data.texts.length === 0) {
        setGenerateInfo(`${data.provider} 제공자로 생성된 글이 없습니다.`);
        return;
      }

      const items = data.texts.map((content: string) => ({ category: selectedCategory, content, source: 'AI' }));
      const saveRes = await fetch('/api/good-words', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });
      const saveData = await saveRes.json();
      if (!saveRes.ok) throw new Error(saveData.error ?? '저장에 실패했습니다.');

      setGenerateInfo(
        `${data.provider} 제공자로 ${data.texts.length}개 생성, ${saveData.saved}개 저장됨` +
        (data.rejectedCount > 0 ? ` (생성 직후 가드레일 반려 ${data.rejectedCount}개)` : '') +
        (saveData.rejected.length > 0 ? ` (저장 시 가드레일 반려 ${saveData.rejected.length}개)` : '')
      );
      await loadArchive();
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : '생성에 실패했습니다.');
    } finally {
      setGenerating(false);
    }
  }

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
      setSaveMessage(err instanceof Error ? err.message : '삭제에 실패했습니다.');
    } finally {
      setDeletingId(null);
    }
  }

  function handleStartSlideshow() {
    if (archiveItems.length === 0) {
      setSaveMessage('슬라이드쇼로 재생할 글이 보관함에 없습니다.');
      return;
    }
    setSlideshowItems(archiveItems.map((item) => ({ id: item.id, category: item.category, content: item.content, source: item.source })));
  }

  function startRenameCategory(cat: GoodWordsCategory) {
    setEditingId(cat.id);
    setEditingLabel(cat.label);
  }

  async function commitRenameCategory() {
    const id = editingId;
    const label = editingLabel.trim();
    setEditingId(null);
    if (!id || !label) return;

    const prevCategories = categories;
    setCategories((prev) => prev?.map((c) => (c.id === id ? { ...c, label } : c)) ?? prev);
    try {
      const res = await fetch(`/api/good-words/categories/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '이름 변경에 실패했습니다.');
    } catch (err) {
      setCategories(prevCategories);
      setSaveMessage(err instanceof Error ? err.message : '이름 변경에 실패했습니다.');
    }
  }

  async function handleCreateCategory() {
    const label = newCategoryLabel.trim();
    setAddingCategory(false);
    setNewCategoryLabel('');
    if (!label) return;
    try {
      const res = await fetch('/api/good-words/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '카테고리 생성에 실패했습니다.');
      setCategories((prev) => [...(prev ?? []), data.category]);
    } catch (err) {
      setSaveMessage(err instanceof Error ? err.message : '카테고리 생성에 실패했습니다.');
    }
  }

  async function handleDeleteCategory(cat: GoodWordsCategory) {
    if (!window.confirm(`"${cat.label}" 카테고리를 삭제하면 관련된 좋은글이 모두 함께 삭제됩니다. 계속할까요?`)) return;
    setDeletingCategoryId(cat.id);
    try {
      const res = await fetch(`/api/good-words/categories/${cat.id}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 204) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? '삭제에 실패했습니다.');
      }
      setCategories((prev) => {
        const next = (prev ?? []).filter((c) => c.id !== cat.id);
        if (selectedCategory === cat.id) setSelectedCategory(next[0]?.id ?? '');
        return next;
      });
      loadArchive();
    } catch (err) {
      setSaveMessage(err instanceof Error ? err.message : '삭제에 실패했습니다.');
    } finally {
      setDeletingCategoryId(null);
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
      setSaveMessage(err instanceof Error ? err.message : '순서 저장에 실패했습니다.');
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

  const isSuperAdmin = email === SUPER_ADMIN_EMAIL;

  if (email === undefined) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-gray-400">불러오는 중...</div>;
  }

  return (
    <div className="min-h-screen px-6 py-8">
      <div className="w-full space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-black tracking-tighter text-neutral-900">좋은글</h1>
          <a
            href="/dashboard"
            className="text-xs text-gray-600 border border-gray-200/80 rounded-lg px-3 py-2 hover:border-neutral-500 hover:text-neutral-900 hover:bg-neutral-100/60 transition-colors"
          >
            대시보드로
          </a>
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* 좌측 30%: 카테고리 선택 + 생성/슬라이드쇼 컨트롤 */}
          <div className="lg:w-[30%] shrink-0 space-y-4">
            <div className="rounded-2xl border border-white/60 bg-white/70 backdrop-blur-xl shadow-glass p-5">
              <h2 className="text-sm font-bold text-neutral-900 mb-3">카테고리</h2>
              <div className="grid grid-cols-2 gap-2">
                {categories === null ? (
                  <p className="col-span-2 text-xs text-gray-400">불러오는 중...</p>
                ) : (
                  categories.map((c) => (
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
                        'relative group rounded-lg transition-colors '
                        + (isSuperAdmin ? 'cursor-grab active:cursor-grabbing ' : '')
                        + (dragCategoryId === c.id
                          ? 'opacity-40'
                          : dragOverCategoryId === c.id
                            ? 'ring-2 ring-neutral-400'
                            : '')
                      }
                    >
                      {editingId === c.id ? (
                        <input
                          autoFocus
                          value={editingLabel}
                          maxLength={20}
                          onChange={(e) => setEditingLabel(e.target.value)}
                          onBlur={commitRenameCategory}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') { e.preventDefault(); commitRenameCategory(); }
                            if (e.key === 'Escape') setEditingId(null);
                          }}
                          className="w-full text-sm rounded-lg px-3 py-2 border border-neutral-500 focus:outline-none"
                        />
                      ) : (
                        <button
                          onClick={() => setSelectedCategory(c.id)}
                          className={`w-full text-sm rounded-lg px-3 py-2 border transition-colors ${
                            selectedCategory === c.id
                              ? 'bg-neutral-900 text-white border-neutral-900'
                              : 'border-gray-200/80 text-gray-600 hover:border-neutral-500 hover:text-neutral-900'
                          }`}
                        >
                          {c.label}
                        </button>
                      )}

                      {isSuperAdmin && editingId !== c.id && (
                        <div className="absolute -top-1.5 -right-1.5 hidden group-hover:flex gap-0.5">
                          <button
                            onClick={(e) => { e.stopPropagation(); startRenameCategory(c); }}
                            className="w-5 h-5 flex items-center justify-center rounded-full bg-white border border-gray-300 text-gray-500 hover:text-neutral-900 hover:border-neutral-500 text-[10px] shadow-sm"
                            title="이름 변경"
                          >✎</button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteCategory(c); }}
                            disabled={deletingCategoryId === c.id}
                            className="w-5 h-5 flex items-center justify-center rounded-full bg-white border border-gray-300 text-red-500 hover:text-red-700 hover:border-red-400 text-[10px] shadow-sm disabled:opacity-40"
                            title="삭제"
                          >✕</button>
                        </div>
                      )}
                    </div>
                  ))
                )}

                {isSuperAdmin && (
                  addingCategory ? (
                    <input
                      autoFocus
                      value={newCategoryLabel}
                      maxLength={20}
                      placeholder="카테고리 이름"
                      onChange={(e) => setNewCategoryLabel(e.target.value)}
                      onBlur={handleCreateCategory}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); handleCreateCategory(); }
                        if (e.key === 'Escape') { setAddingCategory(false); setNewCategoryLabel(''); }
                      }}
                      className="text-sm rounded-lg px-3 py-2 border border-dashed border-neutral-400 focus:outline-none"
                    />
                  ) : (
                    <button
                      onClick={() => setAddingCategory(true)}
                      className="text-sm rounded-lg px-3 py-2 border border-dashed border-gray-300 text-gray-400 hover:border-neutral-500 hover:text-neutral-900 transition-colors"
                    >
                      + 추가
                    </button>
                  )
                )}
              </div>

              <label className="mt-3 flex items-center gap-2 text-xs text-gray-500">
                <input
                  type="checkbox"
                  checked={showAllCategories}
                  onChange={(e) => setShowAllCategories(e.target.checked)}
                />
                보관함/슬라이드쇼에서 모든 카테고리 보기
              </label>
            </div>

            <div className="rounded-2xl border border-white/60 bg-white/70 backdrop-blur-xl shadow-glass p-5 space-y-3">
              <button
                onClick={handleGenerate}
                disabled={generating || !selectedCategory}
                className="w-full text-sm font-semibold rounded-lg px-3 py-2.5 bg-neutral-900 text-white hover:bg-neutral-700 disabled:opacity-50 transition-colors"
              >
                {generating ? '생성 중...' : `"${categoryLabel(selectedCategory)}" 좋은글 생성`}
              </button>

              <button
                onClick={handleStartSlideshow}
                className="w-full text-sm rounded-lg px-3 py-2.5 border border-gray-200/80 text-gray-700 hover:border-neutral-500 hover:bg-neutral-100/60 transition-colors"
              >
                슬라이드쇼 시작
              </button>

              {saveMessage && <p className="text-xs text-gray-500">{saveMessage}</p>}
            </div>
          </div>

          {/* 우측 70%: 생성 결과 또는 보관함 */}
          <div className="flex-1 rounded-2xl border border-white/60 bg-white/70 backdrop-blur-xl shadow-glass p-5 min-h-[400px]">
            <div className="space-y-3">
              {generateError && <p className="text-sm text-red-500">{generateError}</p>}
              {generateInfo && <p className="text-xs text-gray-400">{generateInfo}</p>}

              {archiveLoading ? (
                <p className="text-sm text-gray-400 text-center py-16">불러오는 중...</p>
              ) : archiveItems.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-16">
                  {generating ? '생성 중...' : '아직 저장된 글이 없습니다. 왼쪽에서 카테고리를 고르고 "좋은글 생성"을 눌러주세요.'}
                </p>
              ) : (
                <div className="grid sm:grid-cols-2 gap-3">
                  {archiveItems.map((item) => (
                    <div key={item.id} className="rounded-xl border border-gray-200/80 p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-gray-500">{categoryLabel(item.category)}</span>
                        {isSuperAdmin && (
                          <button
                            onClick={() => handleDelete(item.id)}
                            disabled={deletingId === item.id}
                            className="text-xs text-red-500 hover:text-red-700 disabled:opacity-40"
                          >
                            {deletingId === item.id ? '삭제 중...' : '삭제'}
                          </button>
                        )}
                      </div>
                      <p className="text-sm text-gray-700 leading-relaxed">{item.content}</p>
                      {item.source && (
                        <p className="text-xs text-gray-400 mt-2">{`< 출처 : ${item.source} >`}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {slideshowItems && (
        <SlideshowViewer items={slideshowItems} categories={categories ?? []} onClose={() => setSlideshowItems(null)} />
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
