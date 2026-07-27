"use client";

import { useState } from "react";

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

export default function CreateCategoryModal({ onClose, onCreated }: Props) {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [step, setStep] = useState<"input" | "generating" | "warning">("input");
  const [warning, setWarning] = useState("");

  const handleCreate = async () => {
    if (!name.trim()) {
      setError("카테고리명을 입력하세요.");
      return;
    }
    setLoading(true);
    setError("");
    setStep("generating");

    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "생성 실패");
      }

      if (data.subWarning) {
        setWarning(data.subWarning);
        setStep("warning");
        onCreated();
        return;
      }

      onCreated();
      onClose();
    } catch (e) {
      setError(String(e));
      setStep("input");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold mb-4">새 카테고리 만들기</h2>

        {step === "generating" ? (
          <div className="py-8 text-center">
            <div className="animate-spin inline-block w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mb-4" />
            <p className="text-gray-600 font-medium">AI가 서브카테고리를 생성 중입니다…</p>
            <p className="text-sm text-gray-400 mt-1">약 10~20초 소요됩니다.</p>
          </div>
        ) : step === "warning" ? (
          <div className="py-4">
            <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-4 mb-4">
              <p className="text-sm font-medium text-yellow-800 mb-1">카테고리는 생성됐으나 서브카테고리 생성 실패</p>
              <p className="text-xs text-yellow-700 break-all">{warning}</p>
            </div>
            <p className="text-xs text-gray-500 mb-4">카테고리를 삭제 후 다시 생성하거나, 서브카테고리를 직접 추가하세요.</p>
            <div className="flex justify-end">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg bg-gray-600 text-white text-sm font-medium hover:bg-gray-700 transition-colors"
              >
                닫기
              </button>
            </div>
          </div>
        ) : (
          <>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              분야명
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); setError(""); }}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              placeholder="예: 바이오, 에너지, 양자컴퓨팅"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              autoFocus
            />
            <p className="text-xs text-gray-400 mt-1">
              AI가 관련 서브카테고리와 RSS 소스를 자동 생성합니다.
            </p>

            {error && (
              <p className="mt-2 text-sm text-red-500">{error}</p>
            )}

            <div className="flex justify-end gap-3 mt-5">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg border border-gray-300 text-sm hover:bg-gray-50 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleCreate}
                disabled={loading || !name.trim()}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                생성
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
