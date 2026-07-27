"use client";

import { useState, useRef } from "react";
import type { Category, Subcategory } from "@/lib/supabase";

export type EditTarget =
  | { type: "category"; item: Category }
  | { type: "subcategory"; item: Subcategory };

interface Props {
  target: EditTarget;
  onClose: () => void;
  onSaved: () => void;
}

export default function EditModal({ target, onClose, onSaved }: Props) {
  const isSubcategory = target.type === "subcategory";
  const sub = isSubcategory ? (target.item as Subcategory) : null;

  const [name, setName] = useState(target.item.name);
  const [tags, setTags] = useState<string[]>(sub?.tags ?? []);
  const [tagInput, setTagInput] = useState("");
  const [description, setDescription] = useState(sub?.description ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const tagInputRef = useRef<HTMLInputElement>(null);

  // ── 태그 추가 ──
  const addTag = () => {
    const raw = tagInput.trim().replace(/,+$/, "");
    if (!raw) return;
    const newTags = raw
      .split(/[,\s]+/)
      .map((t) => t.trim())
      .filter((t) => t && !tags.includes(t));
    if (newTags.length) setTags([...tags, ...newTags]);
    setTagInput("");
  };

  const removeTag = (tag: string) => setTags(tags.filter((t) => t !== tag));

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag();
    } else if (e.key === "Backspace" && !tagInput && tags.length) {
      setTags(tags.slice(0, -1));
    }
  };

  // ── 저장 ──
  const handleSave = async () => {
    if (tagInput.trim()) addTag(); // 미확정 태그 자동 추가
    if (!name.trim()) { setError("이름을 입력하세요."); return; }
    setLoading(true);
    setError("");
    try {
      const endpoint = isSubcategory ? "/api/subcategories" : "/api/categories";
      const body = isSubcategory
        ? { id: target.item.id, name: name.trim(), tags, description: description.trim() || null }
        : { id: target.item.id, name: name.trim() };

      const res = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "저장 실패");
      onSaved();
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  // ── 삭제 ──
  const handleDelete = async () => {
    setDeleting(true);
    setError("");
    try {
      const res = await fetch(`/api/subcategories?id=${target.item.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "삭제 실패");
      onSaved();
      onClose();
    } catch (e) {
      setError(String(e));
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
    >
      <div
        className="bg-white rounded-xl shadow-xl flex flex-col p-8"
        style={{ width: "50vw", minHeight: "50vh", maxHeight: "80vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold mb-6">
          {isSubcategory ? "서브카테고리 수정" : "카테고리 수정"}
        </h2>

        {/* ── 폼 (스크롤 영역) ── */}
        <div className="flex-1 overflow-y-auto space-y-5 pr-1">

          {/* 이름 */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">이름</label>
            <input
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); setError(""); }}
              onKeyDown={(e) => e.key === "Enter" && !isSubcategory && handleSave()}
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-400"
              autoFocus
            />
          </div>

          {/* 태그 (서브카테고리만) */}
          {isSubcategory && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                태그
                <span className="ml-1.5 text-xs font-normal text-gray-400">
                  — 기사 수집 시 키워드 필터로 사용됩니다
                </span>
              </label>
              <div
                className="w-full border border-gray-300 rounded-lg px-3 py-2 flex flex-wrap gap-1.5 cursor-text min-h-[44px] focus-within:border-blue-400"
                onClick={() => tagInputRef.current?.focus()}
              >
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 bg-blue-100 text-blue-700 px-2.5 py-0.5 rounded-full text-xs font-medium"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); removeTag(tag); }}
                      className="text-blue-400 hover:text-blue-700 leading-none"
                    >
                      ×
                    </button>
                  </span>
                ))}
                <input
                  ref={tagInputRef}
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={handleTagKeyDown}
                  onBlur={addTag}
                  placeholder={tags.length === 0 ? "태그 입력 후 Enter (예: TSMC, 파운드리)" : ""}
                  className="flex-1 min-w-[160px] outline-none text-sm bg-transparent py-0.5"
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">Enter 또는 쉼표로 구분 · 백스페이스로 마지막 태그 삭제</p>
            </div>
          )}

          {/* 설명 (서브카테고리만) */}
          {isSubcategory && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                설명
                <span className="ml-1.5 text-xs font-normal text-gray-400">
                  — 칩 호버 시 말풍선으로 표시됩니다
                </span>
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                placeholder="이 서브카테고리에서 다루는 주제를 설명하세요."
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-400 resize-none"
              />
            </div>
          )}
        </div>

        {error && <p className="mt-3 text-sm text-red-500">{error}</p>}

        {/* ── 액션 바 ── */}
        <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-100">
          {/* 삭제 (서브카테고리만) */}
          {isSubcategory && (
            <div className="flex items-center gap-2">
              {confirmDelete ? (
                <>
                  <span className="text-xs text-red-500">정말 삭제할까요?</span>
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
                  >
                    {deleting ? "삭제 중…" : "삭제"}
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="px-3 py-1.5 rounded-lg border border-gray-300 text-xs hover:bg-gray-50 transition-colors"
                  >
                    취소
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="px-3 py-1.5 rounded-lg border border-red-200 text-red-500 text-xs hover:bg-red-50 transition-colors"
                >
                  삭제
                </button>
              )}
            </div>
          )}

          {/* 저장·취소 */}
          <div className={`flex gap-3 ${isSubcategory ? "" : "ml-auto"}`}>
            <button
              onClick={onClose}
              className="px-5 py-2 rounded-lg border border-gray-300 text-sm hover:bg-gray-50 transition-colors"
            >
              취소
            </button>
            <button
              onClick={handleSave}
              disabled={loading || !name.trim()}
              className="px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {loading ? "저장 중…" : "저장"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
