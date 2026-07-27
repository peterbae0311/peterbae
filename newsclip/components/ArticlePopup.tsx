"use client";

import { useState, useEffect, useCallback } from "react";
import type { Article } from "@/lib/supabase";

interface Props {
  article: Article | null;
  onClose: () => void;
}

export default function ArticlePopup({ article, onClose }: Props) {
  const [translating, setTranslating] = useState(false);
  const [fullKo, setFullKo] = useState<string | null>(null);
  const [summaryKo, setSummaryKo] = useState<string | null>(null);
  const [translatingSummary, setTranslatingSummary] = useState(false);

  const stableOnClose = useCallback(() => onClose(), [onClose]);

  useEffect(() => {
    setFullKo(null);
    setSummaryKo(null);
    if (!article) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") stableOnClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [article, stableOnClose]);

  if (!article) return null;

  const handleTranslateSummary = async () => {
    if (!article?.summary) return;
    setTranslatingSummary(true);
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: article.summary }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
      setSummaryKo((data as { translated?: string }).translated ?? "");
    } catch (e) {
      alert(`번역 오류: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setTranslatingSummary(false);
    }
  };

  const handleTranslateFull = async () => {
    if (!article.full_content) return;
    setTranslating(true);
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: article.full_content }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      setFullKo((data as { translated?: string }).translated ?? "");
    } catch (e) {
      alert(`번역 중 오류가 발생했습니다: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setTranslating(false);
    }
  };

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
          {(article.summary_ko || summaryKo) ? (
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
              <p className="text-xs font-semibold text-blue-700 mb-1">📋 요약 (한국어)</p>
              <p className="text-sm leading-relaxed text-gray-800">{summaryKo ?? article.summary_ko}</p>
            </div>
          ) : article.summary ? (
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-semibold text-gray-500">요약 (원문)</p>
                <button
                  onClick={handleTranslateSummary}
                  disabled={translatingSummary}
                  className="text-xs text-blue-600 hover:text-blue-800 disabled:opacity-50 flex items-center gap-1"
                >
                  {translatingSummary ? (
                    <><span className="w-3 h-3 rounded-full border-2 border-blue-500 border-t-transparent animate-spin inline-block" /> 번역 중…</>
                  ) : "🌐 한국어로 번역"}
                </button>
              </div>
              <p className="text-sm leading-relaxed">{article.summary}</p>
            </div>
          ) : null}
          {(fullKo || article.full_content_ko) && (
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-2">📄 전문 (한국어 번역)</p>
              <p className="text-sm leading-relaxed whitespace-pre-line">
                {fullKo ?? article.full_content_ko}
              </p>
            </div>
          )}
          {article.full_content && !fullKo && !article.full_content_ko && (
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-2">📄 원문</p>
              <p className="text-sm leading-relaxed whitespace-pre-line">
                {article.full_content}
              </p>
            </div>
          )}
        </div>

        {/* 액션 바 */}
        <div className="flex items-center gap-3 px-6 py-4 border-t bg-gray-50 rounded-b-xl">
          {article.full_content && !fullKo && !article.full_content_ko && (
            <button
              onClick={handleTranslateFull}
              disabled={translating}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {translating ? "번역 중…" : "🌐 한국어 번역"}
            </button>
          )}
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
