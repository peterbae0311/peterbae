"use client";

import { useState } from "react";
import type { Subcategory } from "@/lib/supabase";

interface Props {
  subcategories: Subcategory[];
  onClose: () => void;
  onSaved: () => void;
}

export default function SubcategoryOrderModal({ subcategories, onClose, onSaved }: Props) {
  const [items, setItems] = useState<Subcategory[]>([...subcategories]);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleDragStart = (idx: number) => setDraggingIdx(idx);

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (draggingIdx === null || draggingIdx === idx) return;
    const next = [...items];
    const [moved] = next.splice(draggingIdx, 1);
    next.splice(idx, 0, moved);
    setItems(next);
    setDraggingIdx(idx);
  };

  const handleDragEnd = () => setDraggingIdx(null);

  const handleSave = async () => {
    setLoading(true);
    setError("");
    try {
      const payload = items.map((item, idx) => ({ id: item.id, order_num: idx }));
      const res = await fetch("/api/subcategories", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: payload }),
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

  const changed = items.some((item, idx) => item.id !== subcategories[idx]?.id);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold mb-1">서브카테고리 순서 변경</h2>
        <p className="text-xs text-gray-400 mb-4">드래그해서 순서를 바꾸세요.</p>

        <ul className="space-y-1.5">
          {items.map((item, idx) => (
            <li
              key={item.id}
              draggable
              onDragStart={() => handleDragStart(idx)}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDragEnd={handleDragEnd}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border select-none transition-all cursor-grab active:cursor-grabbing ${
                draggingIdx === idx
                  ? "opacity-40 border-blue-400 bg-blue-50 scale-95"
                  : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
              }`}
            >
              <span className="text-gray-300 text-base leading-none">⠿</span>
              <span className="text-sm font-medium text-gray-800 flex-1">{item.name}</span>
              <span className="text-xs text-gray-300">{idx + 1}</span>
            </li>
          ))}
        </ul>

        {error && <p className="mt-2 text-sm text-red-500">{error}</p>}

        <div className="flex justify-end gap-3 mt-5">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-gray-300 text-sm hover:bg-gray-50 transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={loading || !changed}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {loading ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
