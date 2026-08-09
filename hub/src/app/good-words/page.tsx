'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { SUPER_ADMIN_EMAIL } from '@/lib/apps';
import { GOOD_WORDS_CATEGORIES, categoryLabel } from '@/lib/goodWords/categories';
import SlideshowViewer, { SlideshowItem } from './SlideshowViewer';

interface ArchiveItem {
  id: string;
  category: string;
  content: string;
  created_at: string | null;
  created_by: string;
}

export default function GoodWordsPage() {
  const [email, setEmail] = useState<string | null | undefined>(undefined);
  const [selectedCategory, setSelectedCategory] = useState(GOOD_WORDS_CATEGORIES[0].key);
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [rightView, setRightView] = useState<'generate' | 'archive'>('archive');

  const [candidates, setCandidates] = useState<string[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [generateInfo, setGenerateInfo] = useState<string | null>(null);

  const [archiveItems, setArchiveItems] = useState<ArchiveItem[]>([]);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [slideshowItems, setSlideshowItems] = useState<SlideshowItem[] | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setEmail(user?.email ?? null);
    })();
  }, []);

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

  useEffect(() => {
    if (rightView === 'archive') loadArchive();
  }, [rightView, loadArchive]);

  async function handleGenerate() {
    setGenerating(true);
    setGenerateError(null);
    setGenerateInfo(null);
    setCandidates([]);
    setSelectedIndices(new Set());
    setRightView('generate');
    try {
      const res = await fetch('/api/good-words/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: selectedCategory }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '생성에 실패했습니다.');
      setCandidates(data.texts);
      setGenerateInfo(
        `${data.provider} 제공자로 ${data.texts.length}개 생성됨` +
        (data.rejectedCount > 0 ? ` (가드레일 반려 ${data.rejectedCount}개 제외)` : '')
      );
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : '생성에 실패했습니다.');
    } finally {
      setGenerating(false);
    }
  }

  function toggleCandidate(i: number) {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  }

  async function handleSaveSelected() {
    if (selectedIndices.size === 0) return;
    setSaving(true);
    setSaveMessage(null);
    try {
      const items = Array.from(selectedIndices).map((i) => ({ category: selectedCategory, content: candidates[i] }));
      const res = await fetch('/api/good-words', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '저장에 실패했습니다.');

      setCandidates((prev) => prev.filter((_, i) => !selectedIndices.has(i)));
      setSelectedIndices(new Set());
      setSaveMessage(
        `${data.saved}개 저장됨` + (data.rejected.length > 0 ? ` (${data.rejected.length}개는 검증에 걸려 저장되지 않음)` : '')
      );
      setRightView('archive');
    } catch (err) {
      setSaveMessage(err instanceof Error ? err.message : '저장에 실패했습니다.');
    } finally {
      setSaving(false);
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

  async function handleStartSlideshow() {
    const items = rightView === 'archive' ? archiveItems : await loadArchive();
    if (items.length === 0) {
      setSaveMessage('슬라이드쇼로 재생할 글이 보관함에 없습니다.');
      return;
    }
    setSlideshowItems(items.map((item) => ({ id: item.id, category: item.category, content: item.content })));
  }

  const isSuperAdmin = email === SUPER_ADMIN_EMAIL;

  if (email === undefined) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-gray-400">불러오는 중...</div>;
  }

  return (
    <div className="min-h-screen px-4 py-10">
      <div className="max-w-[1400px] mx-auto space-y-6">
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
          {/* 좌측 40%: 카테고리 선택 + 생성/슬라이드쇼 컨트롤 */}
          <div className="lg:w-[40%] shrink-0 space-y-4">
            <div className="rounded-2xl border border-white/60 bg-white/70 backdrop-blur-xl shadow-glass p-5">
              <h2 className="text-sm font-bold text-neutral-900 mb-3">카테고리</h2>
              <div className="grid grid-cols-2 gap-2">
                {GOOD_WORDS_CATEGORIES.map((c) => (
                  <button
                    key={c.key}
                    onClick={() => setSelectedCategory(c.key)}
                    className={`text-sm rounded-lg px-3 py-2 border transition-colors ${
                      selectedCategory === c.key
                        ? 'bg-neutral-900 text-white border-neutral-900'
                        : 'border-gray-200/80 text-gray-600 hover:border-neutral-500 hover:text-neutral-900'
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
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
                disabled={generating}
                className="w-full text-sm font-semibold rounded-lg px-3 py-2.5 bg-neutral-900 text-white hover:bg-neutral-700 disabled:opacity-50 transition-colors"
              >
                {generating ? '생성 중...' : `"${categoryLabel(selectedCategory)}" 좋은글 생성`}
              </button>

              <div className="flex gap-2">
                <button
                  onClick={() => setRightView('generate')}
                  className={`flex-1 text-xs rounded-lg px-3 py-2 border transition-colors ${
                    rightView === 'generate' ? 'border-neutral-900 text-neutral-900' : 'border-gray-200/80 text-gray-500'
                  }`}
                >
                  생성 결과
                </button>
                <button
                  onClick={() => setRightView('archive')}
                  className={`flex-1 text-xs rounded-lg px-3 py-2 border transition-colors ${
                    rightView === 'archive' ? 'border-neutral-900 text-neutral-900' : 'border-gray-200/80 text-gray-500'
                  }`}
                >
                  보관함
                </button>
              </div>

              <button
                onClick={handleStartSlideshow}
                className="w-full text-sm rounded-lg px-3 py-2.5 border border-gray-200/80 text-gray-700 hover:border-neutral-500 hover:bg-neutral-100/60 transition-colors"
              >
                슬라이드쇼 시작
              </button>

              {saveMessage && <p className="text-xs text-gray-500">{saveMessage}</p>}
            </div>
          </div>

          {/* 우측 60%: 생성 결과 또는 보관함 */}
          <div className="flex-1 rounded-2xl border border-white/60 bg-white/70 backdrop-blur-xl shadow-glass p-5 min-h-[400px]">
            {rightView === 'generate' ? (
              <div className="space-y-3">
                {generateError && <p className="text-sm text-red-500">{generateError}</p>}
                {generateInfo && <p className="text-xs text-gray-400">{generateInfo}</p>}

                {candidates.length > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">{selectedIndices.size}개 선택됨</span>
                    <button
                      onClick={handleSaveSelected}
                      disabled={saving || selectedIndices.size === 0}
                      className="text-xs font-semibold rounded-lg px-3 py-2 bg-neutral-900 text-white hover:bg-neutral-700 disabled:opacity-40 transition-colors"
                    >
                      {saving ? '저장 중...' : '선택 저장'}
                    </button>
                  </div>
                )}

                <div className="grid sm:grid-cols-2 gap-3">
                  {candidates.map((text, i) => (
                    <label
                      key={i}
                      className={`flex gap-2 items-start rounded-xl border p-3 text-sm cursor-pointer transition-colors ${
                        selectedIndices.has(i) ? 'border-neutral-900 bg-neutral-50' : 'border-gray-200/80 hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="mt-1 shrink-0"
                        checked={selectedIndices.has(i)}
                        onChange={() => toggleCandidate(i)}
                      />
                      <span className="text-gray-700 leading-relaxed">{text}</span>
                    </label>
                  ))}
                </div>

                {!generating && candidates.length === 0 && !generateError && (
                  <p className="text-sm text-gray-400 text-center py-16">
                    왼쪽에서 카테고리를 고르고 &quot;좋은글 생성&quot;을 눌러주세요.
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {archiveLoading ? (
                  <p className="text-sm text-gray-400 text-center py-16">불러오는 중...</p>
                ) : archiveItems.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-16">아직 저장된 글이 없습니다.</p>
                ) : (
                  archiveItems.map((item) => (
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
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {slideshowItems && (
        <SlideshowViewer items={slideshowItems} onClose={() => setSlideshowItems(null)} />
      )}
    </div>
  );
}
