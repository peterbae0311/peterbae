"use client";

import { useState, useEffect, useCallback } from "react";
import type { Category, Subcategory, Article } from "@/lib/supabase";
import ArticleList from "@/components/ArticleList";
import ArticlePopup from "@/components/ArticlePopup";
import CreateCategoryModal from "@/components/CreateCategoryModal";
import EditModal, { type EditTarget } from "@/components/EditModal";
import SubcategoryOrderModal from "@/components/SubcategoryOrderModal";
import AddSubcategoryModal from "@/components/AddSubcategoryModal";
import SourcesModal from "@/components/SourcesModal";

// ── 말풍선 서브카테고리 칩 ──────────────────────────────────
function SubcategoryChip({
  sub,
  isActive,
  onClick,
  onEdit,
}: {
  sub: Subcategory;
  isActive: boolean;
  onClick: () => void;
  onEdit: () => void;
}) {
  const [show, setShow] = useState(false);

  return (
    <div className="tooltip-container group flex-shrink-0">
      <div className="relative flex items-center">
        <button
          onClick={onClick}
          onMouseEnter={() => setShow(true)}
          onMouseLeave={() => setShow(false)}
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all border pr-8 whitespace-nowrap ${
            isActive
              ? "bg-blue-600 text-white border-blue-600"
              : "bg-white text-gray-700 border-gray-300 hover:border-blue-400 hover:text-blue-600"
          }`}
        >
          {sub.name}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          title="서브카테고리 수정"
          className="absolute right-1.5 w-5 h-5 flex items-center justify-center rounded-full text-gray-400 hover:text-blue-500 hover:bg-blue-50 opacity-0 group-hover:opacity-100 transition-all text-xs"
        >
          ✎
        </button>
      </div>
      {show && sub.description && (
        <div className="tooltip-box fade-in">{sub.description}</div>
      )}
    </div>
  );
}

const SEARCH_TAB = "__search__";

// ── 메인 페이지 ──────────────────────────────────────────────
export default function HomePage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(SEARCH_TAB);
  const [activeSubcategory, setActiveSubcategory] = useState<string | null>(null);
  const [articlesBySubcategory, setArticlesBySubcategory] = useState<Record<string, Article[]>>({});
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [loadingArticles, setLoadingArticles] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [showAddSubModal, setShowAddSubModal] = useState(false);
  const [showSourcesModal, setShowSourcesModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Article[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");

  // ── 카테고리 목록 로드 ──
  const loadCategories = useCallback(async () => {
    try {
      const res = await fetch("/api/categories");
      const data = await res.json();
      const cats: Category[] = data.categories || [];
      setCategories(cats);
      setSubcategories(data.subcategories || []);

      setActiveCategory((prev) => {
        if (prev === SEARCH_TAB) return SEARCH_TAB;
        if (prev && cats.find((c) => c.id === prev)) return prev;
        return cats.length ? cats[0].id : null;
      });
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  // ── 현재 탭의 서브카테고리 ──
  const currentSubs = subcategories.filter(
    (s) => s.category_id === activeCategory
  );

  // ── 기사 로드 (DB) ──
  const loadArticles = useCallback(async (subcategoryIds: string[]) => {
    if (!subcategoryIds.length) return;
    setLoadingArticles(true);
    try {
      const newMap: Record<string, Article[]> = {};
      await Promise.all(
        subcategoryIds.map(async (subId) => {
          const res = await fetch(`/api/articles?subcategoryId=${subId}&limit=30`);
          const data = await res.json();
          newMap[subId] = data.articles || [];
        })
      );
      setArticlesBySubcategory((prev) => ({ ...prev, ...newMap }));
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingArticles(false);
    }
  }, []);

  // 탭 변경 시 기사 로드 (검색 탭 제외)
  useEffect(() => {
    if (!activeCategory || activeCategory === SEARCH_TAB) return;
    const subIds = subcategories
      .filter((s) => s.category_id === activeCategory)
      .map((s) => s.id);
    loadArticles(subIds);
  }, [activeCategory, subcategories, loadArticles]);

  // ── RSS 기사 수집 ──
  const handleFetchArticles = async () => {
    if (!activeCategory) return;
    const cat = categories.find((c) => c.id === activeCategory);
    if (!cat) return;

    setFetching(true);
    setStatus("RSS 피드에서 최신 기사를 수집 중…");
    try {
      const res = await fetch("/api/articles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId: cat.id, categoryName: cat.name }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error);

      // data.saved가 객체인지 확인 후 합산 (타입 안전 처리)
      const savedMap = data.saved as Record<string, unknown>;
      const total = Object.values(savedMap).reduce<number>(
        (a, b) => a + (typeof b === "number" ? b : 0),
        0
      );
      setStatus(`✅ ${total}개 기사 저장 완료`);

      const subIds = currentSubs.map((s) => s.id);
      await loadArticles(subIds);
    } catch (e) {
      setStatus(`❌ 오류: ${e}`);
    } finally {
      setFetching(false);
      setTimeout(() => setStatus(""), 4000);
    }
  };

  // ── 카테고리 삭제 ──
  const handleDeleteCategory = async (catId: string, catName: string) => {
    if (!confirm(`"${catName}" 카테고리와 모든 기사를 삭제할까요?`)) return;
    setDeletingId(catId);
    try {
      const res = await fetch(`/api/categories?id=${catId}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error);

      // 삭제된 카테고리가 활성인 경우 다른 탭으로 이동
      if (activeCategory === catId) {
        setActiveCategory(null);
        setActiveSubcategory(null);
      }
      await loadCategories();
    } catch (e) {
      alert(`삭제 실패: ${e}`);
    } finally {
      setDeletingId(null);
    }
  };

  // ── 검색 ──
  const handleSearch = async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) { setSearchResults(null); return; }
    setSearching(true);
    setSearchError("");
    setSearchResults(null);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "검색 오류");
      setSearchResults(data.articles ?? []);
    } catch (e) {
      setSearchResults(null);
      setSearchError(String(e));
    } finally {
      setSearching(false);
    }
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") { setSearchQuery(""); setSearchResults(null); return; }
    // IME 조합 중 Enter는 무시 (한국어 입력 확정과 검색 분리)
    if (e.key === "Enter" && !e.nativeEvent.isComposing) handleSearch(searchQuery);
  };

  const clearSearch = () => { setSearchQuery(""); setSearchResults(null); setSearchError(""); };

  // 검색 탭 외 다른 탭으로 이동 시 검색 초기화
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (activeCategory !== SEARCH_TAB) clearSearch(); }, [activeCategory]);

  // ── 표시할 서브카테고리 ──
  const displayedSubs = activeSubcategory
    ? currentSubs.filter((s) => s.id === activeSubcategory)
    : currentSubs;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── 헤더 + 탭 영역 고정 ── */}
      <div className="sticky top-0 z-30">
      {/* ── 헤더 ── */}
      <header className="bg-white border-b border-gray-200 px-3 sm:px-6 py-2.5 sm:py-3 flex items-center justify-between gap-2">
        <h1 className="text-sm sm:text-lg font-bold text-gray-900 whitespace-nowrap">📰 분야별 최신 기사</h1>
        <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
          {status && (
            <span className="hidden sm:inline text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full animate-pulse">
              {status}
            </span>
          )}
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-2 sm:px-3 py-1.5 rounded-lg border border-dashed border-gray-400 text-xs sm:text-sm text-gray-600 hover:bg-gray-50 hover:border-blue-400 hover:text-blue-600 transition-all whitespace-nowrap"
          >
            ＋ <span className="hidden sm:inline">카테고리 </span>생성
          </button>
          <button
            onClick={() => setShowSourcesModal(true)}
            className="px-2 sm:px-3 py-1.5 rounded-lg border border-gray-300 text-xs sm:text-sm text-gray-600 hover:bg-gray-50 hover:border-indigo-400 hover:text-indigo-600 transition-all whitespace-nowrap"
          >
            📋 <span className="hidden sm:inline">출처 관리</span>
          </button>
        </div>
      </header>

      {/* ── 탭 영역 ── */}
      <div className="bg-white border-b border-gray-200 px-3 sm:px-6">
        {/* 카테고리 탭 행 */}
        <div className="flex items-center gap-1 pt-2 sm:pt-3">
          <div className="flex items-center gap-1 flex-1 overflow-x-auto no-scrollbar flex-nowrap">
            {/* 기사 검색 고정 탭 */}
            <button
              onClick={() => { setActiveCategory(SEARCH_TAB); setActiveSubcategory(null); }}
              className={`px-3 sm:px-4 py-1.5 rounded-t-lg text-sm font-medium border-b-2 transition-all whitespace-nowrap flex-shrink-0 ${
                activeCategory === SEARCH_TAB
                  ? "border-blue-600 text-blue-700 bg-blue-50"
                  : "border-transparent text-gray-600 hover:text-blue-600 hover:bg-gray-50"
              }`}
            >
              🔍 기사 검색
            </button>
            {categories.map((cat) => (
              <div
                key={cat.id}
                onClick={() => { setActiveCategory(cat.id); setActiveSubcategory(null); }}
                className={`group px-3 sm:px-4 py-1.5 rounded-t-lg text-sm font-medium border-b-2 transition-all flex items-center gap-1 whitespace-nowrap flex-shrink-0 cursor-pointer ${
                  activeCategory === cat.id
                    ? "border-blue-600 text-blue-700 bg-blue-50"
                    : "border-transparent text-gray-600 hover:text-blue-600 hover:bg-gray-50"
                }`}
              >
                <span>{cat.name}</span>
                {/* 수정·삭제 — 탭 내부, 호버 시 펼침 */}
                <div className="flex items-center gap-0.5 overflow-hidden max-w-0 group-hover:max-w-[3rem] transition-[max-width] duration-150">
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditTarget({ type: "category", item: cat }); }}
                    title="카테고리 수정"
                    className="w-4 h-4 flex items-center justify-center rounded-full text-gray-400 hover:text-blue-500 hover:bg-blue-50 text-xs leading-none flex-shrink-0"
                  >
                    ✎
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteCategory(cat.id, cat.name); }}
                    disabled={deletingId === cat.id}
                    title="카테고리 삭제"
                    className="w-4 h-4 flex items-center justify-center rounded-full text-gray-400 hover:text-red-500 hover:bg-red-50 text-xs leading-none flex-shrink-0"
                  >
                    {deletingId === cat.id ? "…" : "×"}
                  </button>
                </div>
              </div>
            ))}
            {categories.length === 0 && (
              <p className="text-sm text-gray-400 py-2">
                카테고리가 없습니다. 「＋ 카테고리 생성」을 눌러 추가하세요.
              </p>
            )}
          </div>

        </div>

        {/* 서브카테고리 행 + 기사 보기 버튼 */}
        {activeCategory && activeCategory !== SEARCH_TAB && (
          <div className="flex items-center gap-2 py-2 sm:py-2.5">
            {/* 서브카테고리 칩 — 가로 스크롤 */}
            <div className="flex items-center gap-2 flex-1 overflow-x-auto no-scrollbar flex-nowrap">
              {currentSubs.length > 0 && (
                <button
                  onClick={() => setActiveSubcategory(null)}
                  className={`px-3 py-1 rounded-full text-sm transition-all border whitespace-nowrap flex-shrink-0 ${
                    !activeSubcategory
                      ? "bg-gray-800 text-white border-gray-800"
                      : "bg-white text-gray-500 border-gray-300 hover:border-gray-500"
                  }`}
                >
                  전체
                </button>
              )}
              {currentSubs.map((sub) => (
                <SubcategoryChip
                  key={sub.id}
                  sub={sub}
                  isActive={activeSubcategory === sub.id}
                  onClick={() =>
                    setActiveSubcategory(
                      activeSubcategory === sub.id ? null : sub.id
                    )
                  }
                  onEdit={() => setEditTarget({ type: "subcategory", item: sub })}
                />
              ))}
              {currentSubs.length > 1 && (
                <button
                  onClick={() => setShowOrderModal(true)}
                  title="순서 변경"
                  className="ml-1 px-2.5 py-1 rounded-lg border border-gray-300 text-xs text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-all whitespace-nowrap flex-shrink-0"
                >
                  ⇅ 순서
                </button>
              )}
              <button
                onClick={() => setShowAddSubModal(true)}
                title="서브카테고리 추가"
                className="ml-1 px-2.5 py-1 rounded-lg border border-dashed border-gray-400 text-xs text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-all whitespace-nowrap flex-shrink-0"
              >
                ＋ 추가
              </button>
            </div>

            {/* 기사 보기 버튼 — 항상 오른쪽 고정 */}
            <button
              onClick={handleFetchArticles}
              disabled={fetching}
              className="flex-shrink-0 px-3 sm:px-4 py-1.5 rounded-lg bg-blue-600 text-white text-xs sm:text-sm font-medium hover:bg-blue-700 disabled:opacity-60 transition-colors flex items-center gap-1"
            >
              {fetching ? (
                <>
                  <span className="animate-spin inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full" />
                  <span className="hidden sm:inline">수집 중…</span>
                </>
              ) : (
                <>
                  <span>📥</span>
                  <span className="hidden sm:inline">기사 보기</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
      </div>{/* ── sticky 끝 ── */}

      {/* ── 기사 목록 ── */}
      <main className="mx-auto px-3 sm:px-6 py-4 sm:py-6 w-full">
        {activeCategory === SEARCH_TAB ? (
          /* ── 기사 검색 탭 ── */
          <div className="w-full">
            {/* 검색 입력 */}
            <div className="flex items-center gap-2 mb-6 w-full sm:w-1/2 mx-auto">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onCompositionEnd={(e) => setSearchQuery((e.target as HTMLInputElement).value)}
                  onKeyDown={handleSearchKeyDown}
                  placeholder="키워드를 입력하세요 (예: 마이크론, HBM)"
                  autoFocus
                  className="w-full pl-4 pr-9 py-3 rounded-xl border border-gray-300 text-sm focus:outline-none focus:border-blue-400 bg-white shadow-sm"
                />
                {searchQuery && (
                  <button
                    onClick={clearSearch}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg leading-none"
                  >
                    ×
                  </button>
                )}
              </div>
              <button
                onClick={() => handleSearch(searchQuery)}
                disabled={searching}
                className="px-5 py-3 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-40 transition-colors flex items-center gap-1.5 flex-shrink-0"
              >
                {searching ? (
                  <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin inline-block" />
                ) : "검색"}
              </button>
            </div>

            {/* 검색 결과 */}
            {searching ? (
              <div className="flex flex-col items-center gap-3 py-12 text-gray-500">
                <div className="animate-spin w-6 h-6 border-4 border-blue-500 border-t-transparent rounded-full" />
                <p className="text-sm">검색 중…</p>
              </div>
            ) : searchError ? (
              <p className="text-sm text-red-500 text-center py-12">{searchError}</p>
            ) : searchResults === null ? (
              <p className="text-sm text-gray-400 text-center py-12">검색어를 입력하세요.</p>
            ) : searchResults.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-12">검색 결과가 없습니다.</p>
            ) : (
              <>
                <p className="text-xs text-gray-400 mb-3 w-full sm:w-1/2 mx-auto">
                  검색 결과 <span className="text-blue-600 font-semibold">{searchResults.length}건</span>
                </p>
                {/* 모바일: 1열, 데스크탑: 좌 45% / 우 45% */}
                <div className="flex flex-col sm:flex-row sm:justify-center gap-3 sm:gap-[5%] items-stretch">
                  {[searchResults.slice(0, 15), searchResults.slice(15, 30)].map((col, ci) => (
                    <div key={ci} className="w-full sm:w-[45%] flex flex-col gap-2">
                      {col.map((article, idx) => (
                        <div
                          key={article.id}
                          onClick={() => setSelectedArticle(article)}
                          className="bg-white border border-gray-200 rounded-xl px-4 py-3 cursor-pointer hover:border-blue-300 hover:shadow-sm transition-all flex items-start gap-2.5"
                        >
                          <span className="flex-shrink-0 text-xs font-bold text-gray-300 w-5 mt-0.5">
                            {ci * 15 + idx + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-gray-400 mb-0.5">
                              {article.source}
                              {article.published_at
                                ? ` · ${new Date(article.published_at).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })}`
                                : ""}
                            </p>
                            <p className="text-sm font-semibold text-gray-900 leading-snug line-clamp-2 mb-0.5">
                              {article.title}
                            </p>
                            {/* 요약 있을 때만 표시, 없으면 공백 */}
                            <p className="text-xs text-gray-500 line-clamp-2 min-h-[1rem]">
                              {article.summary_ko || article.summary || ""}
                            </p>
                          </div>
                          <span className="flex-shrink-0 text-gray-300 hover:text-blue-400 text-base leading-none mt-0.5">›</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        ) : loadingArticles ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
          </div>
        ) : (
          <ArticleList
            subcategories={displayedSubs}
            articlesBySubcategory={articlesBySubcategory}
            onArticleClick={setSelectedArticle}
            limit={activeSubcategory ? 30 : 10}
          />
        )}
      </main>

      {/* ── 팝업 ── */}
      <ArticlePopup
        article={selectedArticle}
        onClose={() => setSelectedArticle(null)}
      />

      {/* ── 카테고리 생성 모달 ── */}
      {showCreateModal && (
        <CreateCategoryModal
          onClose={() => setShowCreateModal(false)}
          onCreated={loadCategories}
        />
      )}

      {/* ── 수정 모달 ── */}
      {editTarget && (
        <EditModal
          target={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            if (editTarget.type === "subcategory") setActiveSubcategory(null);
            loadCategories();
          }}
        />
      )}

      {/* ── 서브카테고리 추가 모달 ── */}
      {showAddSubModal && activeCategory && (
        <AddSubcategoryModal
          categoryId={activeCategory}
          onClose={() => setShowAddSubModal(false)}
          onSaved={loadCategories}
        />
      )}

      {/* ── 출처 관리 모달 ── */}
      {showSourcesModal && (
        <SourcesModal
          categories={categories}
          onClose={() => setShowSourcesModal(false)}
        />
      )}

      {/* ── 서브카테고리 순서 변경 모달 ── */}
      {showOrderModal && (
        <SubcategoryOrderModal
          subcategories={currentSubs}
          onClose={() => setShowOrderModal(false)}
          onSaved={() => {
            setShowOrderModal(false);
            loadCategories();
          }}
        />
      )}
    </div>
  );
}
