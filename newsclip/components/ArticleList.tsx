"use client";

import type { Article, Subcategory } from "@/lib/supabase";

interface Props {
  subcategories: Subcategory[];
  articlesBySubcategory: Record<string, Article[]>;
  onArticleClick: (article: Article) => void;
  limit?: number;
}

// 검색탭과 동일한 카드 컴포넌트
function ArticleCard({
  article,
  idx,
  onClick,
}: {
  article: Article;
  idx: number;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className="bg-white border border-gray-200 rounded-xl px-4 py-3 cursor-pointer hover:border-blue-300 hover:shadow-sm transition-all flex items-start gap-2.5"
    >
      <span className="flex-shrink-0 text-xs font-bold text-gray-300 w-5 mt-0.5">
        {idx + 1}
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
        <p className="text-xs text-gray-500 line-clamp-2 min-h-[1rem]">
          {article.summary_ko || article.summary || ""}
        </p>
      </div>
      <span className="flex-shrink-0 text-gray-300 hover:text-blue-400 text-base leading-none mt-0.5">
        ›
      </span>
    </div>
  );
}

export default function ArticleList({
  subcategories,
  articlesBySubcategory,
  onArticleClick,
  limit = 10,
}: Props) {
  if (!subcategories.length) {
    return (
      <div className="text-center text-gray-400 py-16">
        서브카테고리가 없습니다.
      </div>
    );
  }

  const hasAny = subcategories.some(
    (s) => (articlesBySubcategory[s.id] || []).length > 0
  );

  if (!hasAny) {
    return (
      <div className="text-center text-gray-400 py-16">
        기사를 불러오려면 「기사 보기」 버튼을 클릭하세요.
      </div>
    );
  }

  const subsWithArticles = subcategories.filter(
    (s) => (articlesBySubcategory[s.id] || []).length > 0
  );
  const isSingle = subsWithArticles.length === 1;
  const n = subsWithArticles.length;

  // ── 단일 서브카테고리: 검색탭과 동일한 좌45% / 우45% 2열 레이아웃 ──
  if (isSingle) {
    const sub = subsWithArticles[0];
    const articles = (articlesBySubcategory[sub.id] || []).slice(0, limit);
    const left = articles.slice(0, 15);
    const right = articles.slice(15, 30);

    return (
      <div className="w-full">
        <p className="text-xs text-gray-400 mb-3 w-full">
          <span className="font-semibold text-gray-700">{sub.name}</span>
          {" · "}
          <span className="text-blue-600 font-semibold">{articles.length}건</span>
        </p>
        <div className="flex flex-col sm:flex-row sm:justify-center gap-3 sm:gap-[5%] items-stretch">
          <div className="w-full sm:w-[45%] flex flex-col gap-2">
            {left.map((article, idx) => (
              <ArticleCard
                key={article.id}
                article={article}
                idx={idx}
                onClick={() => onArticleClick(article)}
              />
            ))}
          </div>
          <div className="w-full sm:w-[45%] flex flex-col gap-2">
            {right.map((article, idx) => (
              <ArticleCard
                key={article.id}
                article={article}
                idx={idx + 15}
                onClick={() => onArticleClick(article)}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── 전체(다중 서브카테고리): 모바일 1열, 데스크탑 N열 ──
  const colClass =
    n <= 2 ? "sm:grid-cols-2" :
    n <= 3 ? "sm:grid-cols-3" :
    n <= 4 ? "sm:grid-cols-4" : "sm:grid-cols-5";

  return (
    <div className={`grid grid-cols-1 ${colClass} gap-4 items-stretch`}>
      {subcategories.map((sub) => {
        const articles = (articlesBySubcategory[sub.id] || []).slice(0, limit);
        if (!articles.length) return null;

        return (
          <section
            key={sub.id}
            className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col"
          >
            <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2 border-b border-gray-100 pb-2.5">
              <span className="w-1 h-4 bg-blue-500 rounded-full inline-block flex-shrink-0" />
              <span className="truncate">{sub.name}</span>
            </h3>
            <ul className="space-y-1.5 flex-1">
              {articles.map((article, idx) => (
                <li key={article.id}>
                  <button
                    onClick={() => onArticleClick(article)}
                    className="w-full text-left group flex items-start gap-2.5 rounded-lg transition-all hover:bg-blue-50 px-2 py-2 border border-transparent hover:border-blue-200"
                  >
                    <span className="flex-shrink-0 text-xs font-bold text-gray-300 w-4 mt-0.5">
                      {idx + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-900 group-hover:text-blue-700 line-clamp-2 leading-snug">
                        {article.title}
                      </p>
                      {(article.summary_ko || article.summary) && (
                        <p className="mt-1 text-xs text-gray-500 line-clamp-1">
                          {article.summary_ko || article.summary}
                        </p>
                      )}
                      <div className="mt-1 flex items-center gap-1.5 text-xs text-gray-400">
                        {article.source && (
                          <span className="bg-gray-100 px-1.5 py-0.5 rounded-full truncate max-w-[6rem]">
                            {article.source}
                          </span>
                        )}
                        {article.published_at && (
                          <span className="flex-shrink-0">
                            {new Date(article.published_at).toLocaleDateString(
                              "ko-KR",
                              { month: "short", day: "numeric" }
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="flex-shrink-0 text-gray-300 group-hover:text-blue-400 text-base leading-none mt-0.5">
                      ›
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
