"use client";

import { useState, useEffect } from "react";
import type { Category } from "@/lib/supabase";

type SourceRow = {
  id: string;
  category_id: string | null;
  category_name: string | null;
  classification: string | null;
  name: string;
  description: string | null;
  url: string | null;
  weight: number;
  priority: number;
  created_at: string;
  categories?: { id: string; name: string } | null;
};

const EMPTY_FORM = {
  category_id: "",
  classification: "",
  name: "",
  description: "",
  url: "",
  weight: "",
  priority: "",
};

interface Props {
  categories: Category[];
  onClose: () => void;
}

const PRESET_CLASSIFICATIONS = [
  "학술 논문/연구", "보도/저널리즘", "데이터/통계", "기술/산업 리서치",
  "한국 특화", "반도체", "AI", "휴머노이드",
  "공식기관", "전문미디어", "학술", "커뮤니티", "기타",
];

export default function SourcesModal({ categories, onClose }: Props) {
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editingCatName, setEditingCatName] = useState("");
  const [editingOldCatName, setEditingOldCatName] = useState("");
  const [savingCat, setSavingCat] = useState(false);
  const [catError, setCatError] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/sources");
      const data = await res.json();
      setSources(data.sources ?? []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openAdd = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError("");
    setShowForm(true);
  };

  const openEdit = (src: SourceRow) => {
    setEditingId(src.id);
    setForm({
      category_id: src.category_id ?? "",
      classification: src.classification ?? "",
      name: src.name,
      description: src.description ?? "",
      url: src.url ?? "",
      weight: src.weight != null ? String(src.weight) : "",
      priority: src.priority != null ? String(src.priority) : "",
    });
    setError("");
    setShowForm(true);
  };

  const handleSave = async () => {
    const isAdd = !editingId;
    if ((isAdd && !form.category_id) || !form.classification.trim() || !form.name.trim() || !form.description.trim()) {
      setError(isAdd ? "카테고리, 분류, 출처명, 설명은 필수입니다." : "분류, 출처명, 설명은 필수입니다."); return;
    }
    setSaving(true); setError("");
    try {
      const selectedCatName = categories.find((c) => c.id === form.category_id)?.name ?? "";
      const body = {
        category_id: form.category_id,
        category_name: selectedCatName,
        classification: form.classification.trim(),
        name: form.name.trim(),
        description: form.description.trim(),
        url: form.url.trim() || null,
        weight: form.weight !== "" ? Number(form.weight) : 0,
        priority: form.priority !== "" ? Number(form.priority) : 0,
      };
      const res = await fetch("/api/sources", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingId ? { ...body, id: editingId } : body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "저장 실패");
      setShowForm(false);
      setEditingId(null);
      await load();
    } catch (e) { setError(String(e)); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/sources?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error);
      setConfirmDeleteId(null);
      await load();
    } catch (e) { alert(String(e)); }
  };

  // catId: 활성 카테고리 id | "__deleted__" (삭제된 카테고리)
  const startEditCat = (catId: string | null, catName: string) => {
    setEditingCatId(catId ?? "__deleted__");
    setEditingCatName(catName);
    setEditingOldCatName(catName);
    setCatError("");
  };

  const handleSaveCat = async () => {
    if (!editingCatName.trim()) { setCatError("카테고리명을 입력하세요."); return; }
    setSavingCat(true); setCatError("");
    try {
      let res: Response;
      if (editingCatId && editingCatId !== "__deleted__") {
        // 활성 카테고리 → categories 테이블 수정 (sources.category_name도 동기화됨)
        res = await fetch("/api/categories", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: editingCatId, name: editingCatName.trim() }),
        });
      } else {
        // 삭제된 카테고리 → sources.category_name만 직접 수정
        res = await fetch("/api/sources", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "rename_deleted_category",
            old_name: editingOldCatName,
            new_name: editingCatName.trim(),
          }),
        });
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "저장 실패");
      setEditingCatId(null);
      await load();
    } catch (e) { setCatError(String(e)); }
    finally { setSavingCat(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div
        className="bg-white rounded-xl shadow-xl flex flex-col"
        style={{ width: "90vw", height: "90vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="text-lg font-bold text-gray-900">출처 관리</h2>
          <div className="flex items-center gap-3">
            <button
              onClick={openAdd}
              className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              ＋ 출처 추가
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
          </div>
        </div>

        {/* 테이블 */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex justify-center py-16">
              <div className="animate-spin w-6 h-6 border-4 border-blue-500 border-t-transparent rounded-full" />
            </div>
          ) : sources.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-16">등록된 출처가 없습니다.</p>
          ) : (
            <table className="w-full text-sm border-collapse table-fixed">
              <thead className="sticky top-0 bg-gray-50 z-10">
                <tr className="border-b border-gray-200">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 w-[5%]">카테고리</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 w-[7%]">분류</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 w-[23%]">출처명</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 w-[35%]">설명</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 w-[15%]">URL</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 w-[5%]">가중치</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 w-[5%]">우선순위</th>
                  <th className="px-4 py-3 w-[5%]"></th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const getCatKey = (s: SourceRow) => s.categories?.name ?? s.category_name ?? "";

                  // 카테고리별 rowspan 계산
                  const rowSpanMap: Record<number, number> = {};
                  sources.forEach((src, i) => {
                    const thisCat = getCatKey(src);
                    const prevCat = i > 0 ? getCatKey(sources[i - 1]) : null;
                    if (thisCat !== prevCat) {
                      let count = 1;
                      for (let j = i + 1; j < sources.length; j++) {
                        if (getCatKey(sources[j]) === thisCat) count++;
                        else break;
                      }
                      rowSpanMap[i] = count;
                    }
                  });

                  return sources.map((src, i) => {
                    const thisCat = getCatKey(src);
                    const prevCat = i > 0 ? getCatKey(sources[i - 1]) : null;
                    const isNewCat = thisCat !== prevCat;
                    const rowSpan = rowSpanMap[i];
                    return (
                      <tr
                        key={src.id}
                        className={`border-b border-gray-100 hover:bg-blue-50/40 transition-colors ${isNewCat && i > 0 ? "border-t-2 border-t-gray-300" : ""}`}
                      >
                        {isNewCat && (
                          <td
                            rowSpan={rowSpan}
                            className="px-3 py-2.5 align-middle border-r border-gray-100"
                          >
                            {editingCatId !== null && editingCatId === (src.category_id ?? "__deleted__") ? (
                              <div className="flex flex-col gap-1">
                                <input
                                  autoFocus
                                  value={editingCatName}
                                  onChange={(e) => setEditingCatName(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" && !e.nativeEvent.isComposing) handleSaveCat();
                                    if (e.key === "Escape") setEditingCatId(null);
                                  }}
                                  className="w-full border border-blue-400 rounded px-2 py-1 text-xs focus:outline-none"
                                />
                                {catError && <p className="text-xs text-red-500">{catError}</p>}
                                <div className="flex gap-1">
                                  <button
                                    onClick={handleSaveCat}
                                    disabled={savingCat}
                                    className="flex-1 px-1.5 py-0.5 rounded bg-blue-600 text-white text-xs disabled:opacity-50"
                                  >{savingCat ? "…" : "저장"}</button>
                                  <button
                                    onClick={() => setEditingCatId(null)}
                                    className="flex-1 px-1.5 py-0.5 rounded border border-gray-300 text-xs hover:bg-gray-50"
                                  >취소</button>
                                </div>
                              </div>
                            ) : (
                              <div className="group/cat flex items-center gap-1">
                                <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full whitespace-nowrap">{thisCat}</span>
                                <button
                                  onClick={() => startEditCat(src.category_id, thisCat)}
                                  className="opacity-0 group-hover/cat:opacity-100 w-5 h-5 flex items-center justify-center rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-all text-xs flex-shrink-0"
                                  title="카테고리명 수정"
                                >✎</button>
                              </div>
                            )}
                          </td>
                        )}
                        <td className="px-4 py-2.5 text-xs text-gray-500">{src.classification}</td>
                        <td className="px-4 py-2.5 font-medium text-gray-900">{src.name}</td>
                        <td className="px-4 py-2.5 text-xs text-gray-500">
                          <span className="line-clamp-2">{src.description}</span>
                        </td>
                        <td className="px-4 py-2.5">
                          {src.url ? (
                            <a href={src.url} target="_blank" rel="noreferrer"
                              className="text-xs text-blue-500 hover:underline truncate block"
                              title={src.url}>
                              {src.url.replace(/^https?:\/\//, "").split("/")[0]}
                            </a>
                          ) : <span className="text-gray-300 text-xs">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                            src.weight >= 80 ? "bg-blue-100 text-blue-700"
                            : src.weight >= 50 ? "bg-gray-100 text-gray-600"
                            : "text-gray-400"
                          }`}>
                            {src.weight ?? 0}%
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-center text-xs text-gray-500">{src.priority ?? 0}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1 justify-end">
                            <button
                              onClick={() => openEdit(src)}
                              className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-all text-sm"
                              title="수정"
                            >✎</button>
                            <button
                              onClick={() => setConfirmDeleteId(src.id)}
                              className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all"
                              title="삭제"
                            >×</button>
                          </div>
                        </td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          )}
        </div>

        {/* 추가/수정 폼 오버레이 */}
        {showForm && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-xl z-20">
            <div className="bg-white rounded-xl shadow-2xl w-[480px] max-h-[85vh] flex flex-col">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <h3 className="text-base font-bold text-gray-900">{editingId ? "출처 수정" : "출처 추가"}</h3>
                <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
              </div>
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

                {/* 카테고리 */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    카테고리 {!editingId && <span className="text-red-400">*</span>}
                  </label>
                  <select
                    value={form.category_id}
                    onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                  >
                    <option value="">공통 (카테고리 없음)</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>

                {/* 분류 */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">분류 <span className="text-red-400">*</span></label>
                  {(() => {
                    const existingClassifications = Array.from(
                      new Set(sources.map((s) => s.classification).filter(Boolean))
                    ) as string[];
                    const allOptions = Array.from(
                      new Set([...existingClassifications, ...PRESET_CLASSIFICATIONS])
                    );
                    return (
                      <select
                        value={form.classification}
                        onChange={(e) => setForm({ ...form, classification: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                      >
                        <option value="">선택하세요</option>
                        {allOptions.map((v) => <option key={v} value={v}>{v}</option>)}
                      </select>
                    );
                  })()}
                </div>

                {/* 출처명 */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">출처명 <span className="text-red-400">*</span></label>
                  <input
                    type="text" value={form.name} maxLength={100}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="예: IEEE Spectrum"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                  />
                </div>

                {/* 설명 */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">설명 <span className="text-red-400">*</span></label>
                  <textarea
                    value={form.description} maxLength={2000} rows={4}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="이 출처에서 다루는 주요 내용을 설명하세요."
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400 resize-none"
                  />
                </div>

                {/* URL */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">URL</label>
                  <input
                    type="text" value={form.url} maxLength={1000}
                    onChange={(e) => setForm({ ...form, url: e.target.value })}
                    placeholder="https://spectrum.ieee.org"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                  />
                </div>

                {/* 가중치 + 우선순위 */}
                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      가중치 (%) <span className="text-gray-400 font-normal">0~100</span>
                    </label>
                    <input
                      type="number" value={form.weight} min={0} max={100}
                      onChange={(e) => setForm({ ...form, weight: e.target.value })}
                      placeholder="예: 80"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-600 mb-1">우선순위</label>
                    <input
                      type="number" value={form.priority} min={0}
                      onChange={(e) => setForm({ ...form, priority: e.target.value })}
                      placeholder="예: 1"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                    />
                  </div>
                </div>

                {error && <p className="text-xs text-red-500">{error}</p>}
              </div>

              <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100">
                <button
                  onClick={() => { setShowForm(false); setError(""); }}
                  className="px-4 py-2 rounded-lg border border-gray-300 text-sm hover:bg-gray-50 transition-colors"
                >취소</button>
                <button
                  onClick={handleSave} disabled={saving}
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >{saving ? "저장 중…" : "저장"}</button>
              </div>
            </div>
          </div>
        )}

        {/* 삭제 확인 */}
        {confirmDeleteId && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-xl z-20">
            <div className="bg-white rounded-xl shadow-lg px-6 py-5 flex flex-col items-center gap-4">
              <p className="text-sm font-medium text-gray-800">이 출처를 삭제할까요?</p>
              <div className="flex gap-3">
                <button onClick={() => setConfirmDeleteId(null)} className="px-4 py-2 rounded-lg border border-gray-300 text-sm hover:bg-gray-50">취소</button>
                <button onClick={() => handleDelete(confirmDeleteId)} className="px-4 py-2 rounded-lg bg-red-500 text-white text-sm hover:bg-red-600">삭제</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
