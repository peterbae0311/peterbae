"use client";

import { useEffect, useCallback } from "react";
import type { Article } from "@/lib/supabase";

interface Props {
  article: Article | null;
  onClose: () => void;
}

export default function ArticlePopup({ article, onClose }: Props) {
  const stableOnClose = useCallback(() => onClose(), [onClose]);

  useEffect(() => {
    if (!article) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") stableOnClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [article, stableOnClose]);

  if (!article) return null;

  const publishedStr = article.published_at
    ? new Date(article.published_at).toLocaleDateString("ko-KR", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "날짜 미상";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        className="relative bg-white rounded-xl shadow-2xl w-[90vw] max-w-3xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-3 border-b">
          <div className="flex-1">
            <h2 className="text-lg font-bold leading-snug">{article.title}</h2>
            <p className="mt-1 text-sm text-gray-500">
              {article.source && (
                <span className="font-medium text-blue-600">{article.source}</span>
              )}
              {article.author && <span> · {article.author}</span>}
              <span> · {publishedStr}</span>
            </p>
          </div>
          <button
            onClick={stableOnClose}
            className="flex-shrink-0 text-gray-400 hover:text-gray-700 text-2xl leading-none"
            aria-label="닫기"
          >
            ×
          </button>
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {article.summary_ko ? (
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
              <p className="text-xs font-semibold text-blue-700 mb-1">📋 요약 (한국어)</p>
              <p className="text-sm leading-relaxed text-gray-800">{article.summary_ko}</p>
            </div>
          ) : article.summary ? (
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-xs font-semibold text-gray-500 mb-1">요약 (원문)</p>
              <p className="text-sm leading-relaxed">{article.summary}</p>
            </div>
          ) : null}
          {article.full_content_ko ? (
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-2">📄 전문 (한국어 번역)</p>
              <p className="text-sm leading-relaxed whitespace-pre-line">
                {article.full_content_ko}
              </p>
            </div>
          ) : article.full_content ? (
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-2">📄 원문</p>
              <p className="text-sm leading-relaxed whitespace-pre-line">
                {article.full_content}
              </p>
            </div>
          ) : null}
        </div>

        {/* 액션 바 */}
        <div className="flex items-center gap-3 px-6 py-4 border-t bg-gray-50 rounded-b-xl">
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={stableOnClose}
            className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium hover:bg-gray-100 transition-colors"
          >
            🔗 원문 보기
          </a>
          <span className="ml-auto text-xs text-gray-400">
            수집: {new Date(article.fetched_at).toLocaleDateString("ko-KR")}
          </span>
        </div>
      </div>
    </div>
  );
}
