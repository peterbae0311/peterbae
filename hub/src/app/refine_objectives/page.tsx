'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { DEFAULT_REFINE_PROMPT } from '@/lib/refineObjectives/prompt';

interface LearningObjective {
  id: string;
  subject_id: string;
  confirmed_text: string;
  refined_text: string | null;
  status: 'confirmed' | 'reviewing';
  sort_order: number;
}

interface Subject {
  id: string;
  course_id: string;
  name: string;
  sort_order: number;
  objectives: LearningObjective[];
}

interface Course {
  id: string;
  name: string;
  prompt: string | null;
  sort_order: number;
  subjects: Subject[];
}

async function jsonOrThrow(res: Response, fallback: string) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? fallback);
  return data;
}

export default function RefineObjectivesPage() {
  const [email, setEmail] = useState<string | null | undefined>(undefined);
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [expandedCourseIds, setExpandedCourseIds] = useState<Set<string>>(new Set());
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [checkedIds, setCheckedIds] = useState<Record<string, boolean>>({});
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [bulkProgress, setBulkProgress] = useState<Record<string, { done: number; total: number }>>({});

  const [bulkCreateOpen, setBulkCreateOpen] = useState(false);
  const [editCourseTarget, setEditCourseTarget] = useState<Course | null>(null);
  const [promptCourseTarget, setPromptCourseTarget] = useState<Course | null>(null);
  const [editObjectivesTarget, setEditObjectivesTarget] = useState<Course | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setEmail(user?.email ?? null);
    })();
  }, []);

  const loadTree = useCallback(async () => {
    setMessage(null);
    try {
      const res = await fetch('/api/refine_objectives');
      const data = await jsonOrThrow(res, '학습목표를 불러오지 못했습니다.');
      setCourses(data.courses);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '학습목표를 불러오지 못했습니다.');
    }
  }, []);

  useEffect(() => { loadTree(); }, [loadTree]);

  function withBusy<T>(id: string, fn: () => Promise<T>): Promise<T> {
    setBusyIds((prev) => new Set(prev).add(id));
    return fn().finally(() => {
      setBusyIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
    });
  }

  function toggleCourseExpand(courseId: string) {
    setExpandedCourseIds((prev) => {
      const next = new Set(prev);
      if (next.has(courseId)) next.delete(courseId); else next.add(courseId);
      return next;
    });
  }

  /** '학습목표 개선' — 과정 안의 모든 학습목표를 상태와 무관하게 개별 단위로 순서대로 AI 요청한다(몇 번이든 다시 실행 가능). */
  async function handleBulkRefineCourse(course: Course) {
    const targets = course.subjects.flatMap((s) => s.objectives);
    if (targets.length === 0) {
      setInfo(`"${course.name}" 과정에 학습목표가 없습니다.`);
      return;
    }
    setMessage(null);
    setInfo(null);
    let success = 0;
    let fail = 0;
    setBulkProgress((prev) => ({ ...prev, [course.id]: { done: 0, total: targets.length } }));
    await withBusy(`bulk-refine-${course.id}`, async () => {
      for (const objective of targets) {
        try {
          const res = await fetch(`/api/refine_objectives/objectives/${objective.id}/refine`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: course.prompt ?? '' }),
          });
          await jsonOrThrow(res, '문장 다듬기에 실패했습니다.');
          success++;
        } catch {
          fail++;
        } finally {
          setBulkProgress((prev) => ({ ...prev, [course.id]: { done: (prev[course.id]?.done ?? 0) + 1, total: targets.length } }));
        }
      }
    });
    setBulkProgress((prev) => { const next = { ...prev }; delete next[course.id]; return next; });
    setInfo(`"${course.name}" AI 다듬기 완료 — 성공 ${success}건${fail > 0 ? `, 실패 ${fail}건` : ''}`);
    await loadTree();
  }

  /** '일괄 확정' — 과정 안의 모든 학습목표의 확정 체크를 한 번에 전체 체크/전체 해제로 토글한다. */
  function handleToggleCheckAll(course: Course) {
    const objectives = course.subjects.flatMap((s) => s.objectives);
    if (objectives.length === 0) return;
    const allChecked = objectives.every((o) => checkedIds[o.id]);
    setCheckedIds((prev) => {
      const next = { ...prev };
      for (const o of objectives) next[o.id] = !allChecked;
      return next;
    });
  }

  /**
   * '학습목표 업데이트' — 과정 안의 모든 학습목표가 '확정' 체크된 경우에만, 학습목표(AI 보정)
   * 내용으로 원본(학습목표)을 일괄 교체한다. 하나라도 체크가 안 되어 있으면 진행하지 않는다.
   * 완료 후에는 AI 보정 초안/체크 상태를 모두 비워 다음 검토 주기를 새로 시작할 수 있게 한다.
   */
  async function handleUpdateCourse(course: Course) {
    const objectives = course.subjects.flatMap((s) => s.objectives);
    if (objectives.length === 0) {
      setInfo(`"${course.name}" 과정에 학습목표가 없습니다.`);
      return;
    }
    const allChecked = objectives.every((o) => checkedIds[o.id]);
    if (!allChecked) {
      setMessage(`"${course.name}" 과정의 모든 학습목표를 확정 체크한 후 업데이트할 수 있습니다.`);
      return;
    }

    setMessage(null);
    setInfo(null);
    let updated = 0;
    let failed = 0;
    await withBusy(`update-${course.id}`, async () => {
      for (const objective of objectives) {
        const text = (drafts[objective.id] ?? objective.refined_text ?? '').trim();
        if (!text) continue;
        try {
          const res = await fetch(`/api/refine_objectives/objectives/${objective.id}/confirm`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text }),
          });
          await jsonOrThrow(res, '업데이트에 실패했습니다.');
          updated++;
        } catch {
          failed++;
        }
      }
    });

    const ids = new Set(objectives.map((o) => o.id));
    setDrafts((prev) => {
      const next = { ...prev };
      for (const id of ids) delete next[id];
      return next;
    });
    setCheckedIds((prev) => {
      const next = { ...prev };
      for (const id of ids) delete next[id];
      return next;
    });

    setInfo(`"${course.name}" 업데이트 완료 — ${updated}건 반영${failed > 0 ? `, 실패 ${failed}건` : ''}`);
    await loadTree();
  }

  function handleClose() {
    window.close();
    setTimeout(() => { window.location.href = '/dashboard'; }, 300);
  }

  if (email === undefined) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-gray-400">불러오는 중...</div>;
  }

  return (
    <div className="min-h-screen px-6 py-8">
      <div className="w-full max-w-[1600px] mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-black tracking-tighter text-neutral-900">학습목표 개선</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setBulkCreateOpen(true)}
              className="text-xs text-gray-600 border border-gray-200/80 rounded-lg px-3 py-2 hover:border-neutral-500 hover:text-neutral-900 hover:bg-neutral-100/60 transition-colors"
            >
              학습목표 생성
            </button>
            <a
              href="/dashboard"
              className="text-xs text-gray-600 border border-gray-200/80 rounded-lg px-3 py-2 hover:border-neutral-500 hover:text-neutral-900 hover:bg-neutral-100/60 transition-colors"
            >
              대시보드
            </a>
            <button
              onClick={handleClose}
              className="text-xs text-gray-600 border border-gray-200/80 rounded-lg px-3 py-2 hover:border-neutral-500 hover:text-neutral-900 hover:bg-neutral-100/60 transition-colors"
            >
              닫기
            </button>
          </div>
        </div>

        {message && <p className="text-xs text-red-500">{message}</p>}
        {info && <p className="text-xs text-gray-500">{info}</p>}

        {courses === null ? (
          <p className="text-xs text-gray-400 py-3">불러오는 중...</p>
        ) : courses.length === 0 ? (
          <p className="text-xs text-gray-400 py-3">등록된 과정이 없습니다. "학습목표 생성" 버튼으로 과정을 추가하세요.</p>
        ) : (
          <div className="space-y-3">
            {courses.map((course) => {
              const expanded = expandedCourseIds.has(course.id);
              const objectiveCount = course.subjects.reduce((n, s) => n + s.objectives.length, 0);
              const bulkBusy = busyIds.has(`bulk-refine-${course.id}`);
              const updateBusy = busyIds.has(`update-${course.id}`);
              const progress = bulkProgress[course.id];
              const courseObjectives = course.subjects.flatMap((s) => s.objectives);
              const allChecked = courseObjectives.length > 0 && courseObjectives.every((o) => checkedIds[o.id]);
              return (
                <div key={course.id} className="border border-gray-200/80 rounded-xl overflow-hidden">
                  <div
                    onClick={() => toggleCourseExpand(course.id)}
                    onDoubleClick={(e) => { e.stopPropagation(); setEditCourseTarget(course); }}
                    className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-neutral-50 transition-colors"
                    title="클릭하면 펼침/접힘, 더블클릭하면 과정명 수정"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-gray-400 text-xs shrink-0">{expanded ? '▼' : '▶'}</span>
                      <span className="text-sm font-bold text-neutral-900 truncate">{course.name}</span>
                      <span className="text-xs text-gray-400 shrink-0">
                        ({course.subjects.length}과목 · {objectiveCount}학습목표)
                      </span>
                      {bulkBusy && (
                        <span className="flex items-center gap-1.5 text-xs text-neutral-600 shrink-0">
                          <span className="w-3 h-3 border-2 border-gray-300 border-t-neutral-700 rounded-full animate-spin" />
                          AI 개선 진행 중{progress ? ` (${progress.done}/${progress.total})` : ''}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => setEditObjectivesTarget(course)}
                        className="text-xs text-gray-600 border border-gray-200/80 rounded-lg px-2.5 py-1.5 hover:border-neutral-500 hover:bg-neutral-100/60 transition-colors"
                      >
                        학습목표 수정
                      </button>
                      <button
                        onClick={() => setPromptCourseTarget(course)}
                        className="text-xs text-gray-600 border border-gray-200/80 rounded-lg px-2.5 py-1.5 hover:border-neutral-500 hover:bg-neutral-100/60 transition-colors"
                      >
                        학습목표 프롬프트
                      </button>
                      <button
                        onClick={() => handleBulkRefineCourse(course)}
                        disabled={bulkBusy}
                        className="text-xs text-gray-600 border border-gray-200/80 rounded-lg px-2.5 py-1.5 hover:border-neutral-500 hover:bg-neutral-100/60 disabled:opacity-50 transition-colors"
                      >
                        {bulkBusy ? `개선하는 중...${progress ? ` (${progress.done}/${progress.total})` : ''}` : '학습목표 개선'}
                      </button>
                      <button
                        onClick={() => handleUpdateCourse(course)}
                        disabled={updateBusy || bulkBusy}
                        className="text-xs text-gray-600 border border-gray-200/80 rounded-lg px-2.5 py-1.5 hover:border-neutral-500 hover:bg-neutral-100/60 disabled:opacity-50 transition-colors"
                      >
                        {updateBusy ? '업데이트 중...' : '학습목표 업데이트'}
                      </button>
                    </div>
                  </div>

                  {expanded && (
                    <div className="border-t border-gray-200/80 px-4 py-3 bg-white/40 overflow-x-auto">
                      {objectiveCount === 0 ? (
                        <p className="text-xs text-gray-400 py-4 text-center">등록된 학습목표가 없습니다. &quot;학습목표 수정&quot;에서 추가하세요.</p>
                      ) : (
                        <table className="w-full text-sm border-collapse table-fixed">
                          <thead>
                            <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                              <th className="py-2 pr-3 font-semibold w-[200px]">과목</th>
                              <th className="py-2 pr-3 font-semibold w-[630px]">학습목표</th>
                              <th className="py-2 pr-3 font-semibold w-[630px]">학습목표 (AI 보정)</th>
                              <th className="py-2 pl-3 font-semibold w-[100px] text-center">
                                <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={allChecked}
                                    disabled={updateBusy || bulkBusy}
                                    onChange={() => handleToggleCheckAll(course)}
                                    title="일괄 확정/해제"
                                    className="w-3.5 h-3.5 accent-neutral-900"
                                  />
                                  확정
                                </label>
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {course.subjects.map((subject) => (
                              subject.objectives.length === 0 ? (
                                <tr key={subject.id} className="border-b border-gray-100">
                                  <td className="py-2 pr-3 align-top font-semibold text-gray-800">{subject.name}</td>
                                  <td colSpan={3} className="py-2 text-xs text-gray-400">등록된 학습목표가 없습니다.</td>
                                </tr>
                              ) : subject.objectives.map((objective, oi) => {
                                const draft = drafts[objective.id] ?? objective.refined_text ?? '';
                                const checked = checkedIds[objective.id] ?? false;
                                return (
                                  <tr key={objective.id} className="border-b border-gray-100 align-top">
                                    {oi === 0 && (
                                      <td rowSpan={subject.objectives.length} className="py-2 pr-3 font-semibold text-gray-800 align-top">
                                        {subject.name}
                                      </td>
                                    )}
                                    <td className="py-2 pr-3 text-gray-700 whitespace-pre-wrap">{objective.confirmed_text}</td>
                                    <td className="py-2 pr-3">
                                      <textarea
                                        value={draft}
                                        onChange={(e) => setDrafts((prev) => ({ ...prev, [objective.id]: e.target.value }))}
                                        disabled={updateBusy || bulkBusy}
                                        placeholder="AI 다듬기를 실행하거나 직접 보정 내용을 입력하세요."
                                        rows={2}
                                        maxLength={1000}
                                        className="w-full px-2 py-1.5 border border-gray-200/80 bg-white/60 rounded-md text-sm text-gray-800 leading-relaxed focus:outline-none focus:border-neutral-500 focus:ring-1 focus:ring-neutral-500 disabled:bg-gray-50 disabled:text-gray-400 transition-colors"
                                      />
                                    </td>
                                    <td className="py-2 pl-3 text-center align-middle">
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        disabled={updateBusy || bulkBusy}
                                        onChange={() => setCheckedIds((prev) => ({ ...prev, [objective.id]: !checked }))}
                                        title="담당자 최종 확정"
                                        className="w-4 h-4 accent-neutral-900"
                                      />
                                    </td>
                                  </tr>
                                );
                              })
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {bulkCreateOpen && (
        <BulkCreateModal
          onClose={() => setBulkCreateOpen(false)}
          onCreated={async (courseId) => {
            setBulkCreateOpen(false);
            await loadTree();
            setExpandedCourseIds((prev) => new Set(prev).add(courseId));
          }}
        />
      )}

      {editCourseTarget && (
        <EditCourseModal
          course={editCourseTarget}
          onClose={() => setEditCourseTarget(null)}
          onSaved={async () => { setEditCourseTarget(null); await loadTree(); }}
          onDeleted={async () => { setEditCourseTarget(null); await loadTree(); }}
        />
      )}

      {promptCourseTarget && (
        <PromptModal
          course={promptCourseTarget}
          onClose={() => setPromptCourseTarget(null)}
          onSaved={async () => { setPromptCourseTarget(null); await loadTree(); }}
        />
      )}

      {editObjectivesTarget && (
        <EditObjectivesModal
          course={editObjectivesTarget}
          onClose={() => setEditObjectivesTarget(null)}
          onSaved={async () => { setEditObjectivesTarget(null); await loadTree(); }}
        />
      )}
    </div>
  );
}

/** '학습목표 생성' 팝업 — 과정 하나 + 과목 여러 개 + 과목별 학습목표 여러 개를 한 번에 등록한다. */
function BulkCreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: (courseId: string) => void }) {
  const nextKey = () => crypto.randomUUID();

  interface DraftObjective { key: string; text: string; }
  interface DraftSubject { key: string; name: string; objectives: DraftObjective[]; }

  const makeObjective = (): DraftObjective => ({ key: nextKey(), text: '' });
  const makeSubject = (): DraftSubject => ({ key: nextKey(), name: '', objectives: [makeObjective(), makeObjective(), makeObjective()] });

  const [courseName, setCourseName] = useState('');
  const [subjects, setSubjects] = useState<DraftSubject[]>([makeSubject(), makeSubject(), makeSubject()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateSubjectName(key: string, name: string) {
    setSubjects((prev) => prev.map((s) => (s.key === key ? { ...s, name } : s)));
  }
  function updateObjectiveText(subjectKey: string, key: string, text: string) {
    setSubjects((prev) => prev.map((s) => (s.key !== subjectKey ? s : { ...s, objectives: s.objectives.map((o) => (o.key === key ? { ...o, text } : o)) })));
  }
  function addSubject() {
    setSubjects((prev) => [...prev, makeSubject()]);
  }
  function removeSubject(key: string) {
    setSubjects((prev) => prev.filter((s) => s.key !== key));
  }
  function addObjective(subjectKey: string) {
    setSubjects((prev) => prev.map((s) => (s.key !== subjectKey ? s : { ...s, objectives: [...s.objectives, makeObjective()] })));
  }
  function removeObjective(subjectKey: string, key: string) {
    setSubjects((prev) => prev.map((s) => (s.key !== subjectKey ? s : { ...s, objectives: s.objectives.filter((o) => o.key !== key) })));
  }

  async function handleSubmit() {
    const name = courseName.trim();
    if (!name) { setError('과정명을 입력해주세요.'); return; }

    const cleanedSubjects = subjects
      .map((s) => ({ name: s.name.trim(), objectives: s.objectives.map((o) => o.text.trim()).filter(Boolean) }))
      .filter((s) => s.name);

    if (cleanedSubjects.length === 0) {
      setError('과목명을 1개 이상 입력해주세요.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const courseRes = await fetch('/api/refine_objectives/courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const courseData = await jsonOrThrow(courseRes, '과정 생성에 실패했습니다.');
      const courseId: string = courseData.course.id;

      for (const subject of cleanedSubjects) {
        const subjectRes = await fetch('/api/refine_objectives/subjects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ course_id: courseId, name: subject.name }),
        });
        const subjectData = await jsonOrThrow(subjectRes, `"${subject.name}" 과목 생성에 실패했습니다.`);
        const subjectId: string = subjectData.subject.id;

        for (const text of subject.objectives) {
          const objectiveRes = await fetch('/api/refine_objectives/objectives', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subject_id: subjectId, text }),
          });
          await jsonOrThrow(objectiveRes, '학습목표 생성에 실패했습니다.');
        }
      }

      onCreated(courseId);
    } catch (err) {
      setError(err instanceof Error ? err.message : '생성 중 일부가 실패했습니다. 화면을 새로고침해 어디까지 만들어졌는지 확인해주세요.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-lg shadow-xl w-[720px] max-w-full max-h-[85vh] flex flex-col relative">
        {saving && (
          <div className="absolute inset-0 bg-white/95 rounded-lg z-10 flex flex-col items-center justify-center gap-3">
            <div className="w-8 h-8 border-2 border-gray-200 border-t-neutral-900 rounded-full animate-spin" />
            <p className="text-sm text-gray-600">생성하고 있습니다...</p>
          </div>
        )}

        <div className="shrink-0 flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <span className="text-sm font-bold text-gray-800">학습목표 생성</span>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-lg leading-none">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">과정명 <span className="text-red-500">*</span></label>
            <input
              value={courseName}
              onChange={(e) => setCourseName(e.target.value)}
              placeholder="예: 클라우드 기초"
              maxLength={100}
              className="w-full px-3 py-2 border border-gray-200/80 bg-white/60 rounded-md text-sm text-gray-800 focus:outline-none focus:border-neutral-500 focus:ring-1 focus:ring-neutral-500 transition-colors"
            />
          </div>

          <div className="space-y-4">
            {subjects.map((subject, si) => (
              <div key={subject.key} className="border border-gray-200/80 rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 shrink-0">과목{si + 1}</span>
                  <input
                    value={subject.name}
                    onChange={(e) => updateSubjectName(subject.key, e.target.value)}
                    placeholder="과목명"
                    maxLength={100}
                    className="flex-1 px-2 py-1.5 border border-gray-200/80 bg-white/60 rounded-md text-sm text-gray-800 focus:outline-none focus:border-neutral-500 focus:ring-1 focus:ring-neutral-500 transition-colors"
                  />
                  <button onClick={() => removeSubject(subject.key)} className="text-xs text-red-400 hover:text-red-600 shrink-0">과목 삭제</button>
                </div>

                <div className="pl-4 space-y-1.5">
                  {subject.objectives.map((objective, oi) => (
                    <div key={objective.key} className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 shrink-0 w-14">학습목표{oi + 1}</span>
                      <input
                        value={objective.text}
                        onChange={(e) => updateObjectiveText(subject.key, objective.key, e.target.value)}
                        placeholder="학습목표 내용"
                        maxLength={1000}
                        className="flex-1 px-2 py-1.5 border border-gray-200/80 bg-white/60 rounded-md text-sm text-gray-800 focus:outline-none focus:border-neutral-500 focus:ring-1 focus:ring-neutral-500 transition-colors"
                      />
                      <button onClick={() => removeObjective(subject.key, objective.key)} className="text-xs text-gray-400 hover:text-red-600 shrink-0">✕</button>
                    </div>
                  ))}
                  <button onClick={() => addObjective(subject.key)} className="text-xs text-gray-500 hover:text-neutral-900 pl-16">+ 학습목표</button>
                </div>
              </div>
            ))}
            <button
              onClick={addSubject}
              className="text-xs px-3 py-2 rounded-md border border-gray-200/80 text-gray-700 hover:border-neutral-500 hover:bg-neutral-100/60 transition-colors"
            >
              + 과목
            </button>
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>

        <div className="shrink-0 flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-200">
          <button onClick={onClose} className="px-3 py-2 text-xs text-gray-600 border border-gray-200/80 rounded-lg hover:border-neutral-500 hover:text-neutral-900 hover:bg-neutral-100/60 transition-colors">
            취소
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-3 py-2 text-xs font-semibold rounded-lg bg-neutral-900 text-white hover:bg-neutral-700 disabled:opacity-50 transition-colors"
          >
            {saving ? '생성 중...' : '생성'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** 과정명 더블클릭 팝업 — 과정명 수정/삭제. */
function EditCourseModal({
  course, onClose, onSaved, onDeleted,
}: {
  course: Course;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [name, setName] = useState(course.name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) { setError('과정명을 입력해주세요.'); return; }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/refine_objectives/courses/${course.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      await jsonOrThrow(res, '수정에 실패했습니다.');
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : '수정에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm(`"${course.name}" 과정을 삭제하면 안의 모든 과목/학습목표가 함께 삭제됩니다. 계속할까요?`)) return;
    try {
      const res = await fetch(`/api/refine_objectives/courses/${course.id}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 204) await jsonOrThrow(res, '삭제에 실패했습니다.');
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : '삭제에 실패했습니다.');
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-lg shadow-xl w-[420px] max-w-full flex flex-col">
        <div className="shrink-0 flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <span className="text-sm font-bold text-gray-800">과정 수정</span>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-lg leading-none">✕</button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            className="w-full px-3 py-2 border border-gray-200/80 bg-white/60 rounded-md text-sm text-gray-800 focus:outline-none focus:border-neutral-500 focus:ring-1 focus:ring-neutral-500 transition-colors"
          />
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
        <div className="shrink-0 flex items-center justify-between gap-2 px-5 py-3 border-t border-gray-200">
          <button onClick={handleDelete} className="px-3 py-2 text-xs text-red-500 border border-gray-200/80 rounded-lg hover:border-red-400 hover:bg-red-50 transition-colors">
            삭제
          </button>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-3 py-2 text-xs text-gray-600 border border-gray-200/80 rounded-lg hover:border-neutral-500 hover:text-neutral-900 hover:bg-neutral-100/60 transition-colors">
              취소
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-3 py-2 text-xs font-semibold rounded-lg bg-neutral-900 text-white hover:bg-neutral-700 disabled:opacity-50 transition-colors"
            >
              {saving ? '저장 중...' : '저장'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface EditDraftObjective { key: string; id?: string; text: string; }
interface EditDraftSubject { key: string; id?: string; name: string; objectives: EditDraftObjective[]; }

/**
 * '학습목표 수정' 팝업 — '학습목표 생성'과 같은 화면 구성으로, 이 과정의 기존 과목/학습목표를
 * 불러와 수정/추가/삭제한다. 저장 시 원본(course.subjects) 스냅샷과 비교해 사라진 항목은
 * DELETE, id 없는 새 항목은 POST, 내용이 바뀐 기존 항목은 PATCH한다.
 */
function EditObjectivesModal({
  course, onClose, onSaved,
}: {
  course: Course;
  onClose: () => void;
  onSaved: () => void;
}) {
  const nextKey = () => crypto.randomUUID();
  const makeSubject = (): EditDraftSubject => ({ key: nextKey(), name: '', objectives: [{ key: nextKey(), text: '' }] });

  const [subjects, setSubjects] = useState<EditDraftSubject[]>(() =>
    course.subjects.length > 0
      ? course.subjects.map((s) => ({
          key: nextKey(),
          id: s.id,
          name: s.name,
          objectives: s.objectives.length > 0
            ? s.objectives.map((o) => ({ key: nextKey(), id: o.id, text: o.confirmed_text }))
            : [{ key: nextKey(), text: '' }],
        }))
      : [makeSubject()]
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateSubjectName(key: string, name: string) {
    setSubjects((prev) => prev.map((s) => (s.key === key ? { ...s, name } : s)));
  }
  function updateObjectiveText(subjectKey: string, key: string, text: string) {
    setSubjects((prev) => prev.map((s) => (s.key !== subjectKey ? s : { ...s, objectives: s.objectives.map((o) => (o.key === key ? { ...o, text } : o)) })));
  }
  function addSubject() {
    setSubjects((prev) => [...prev, makeSubject()]);
  }
  function removeSubject(key: string) {
    setSubjects((prev) => prev.filter((s) => s.key !== key));
  }
  function addObjective(subjectKey: string) {
    setSubjects((prev) => prev.map((s) => (s.key !== subjectKey ? s : { ...s, objectives: [...s.objectives, { key: nextKey(), text: '' }] })));
  }
  function removeObjective(subjectKey: string, key: string) {
    setSubjects((prev) => prev.map((s) => (s.key !== subjectKey ? s : { ...s, objectives: s.objectives.filter((o) => o.key !== key) })));
  }

  async function handleSubmit() {
    for (const s of subjects) {
      if (!s.name.trim()) { setError('모든 과목에 과목명을 입력하거나 "과목 삭제" 버튼으로 제거해주세요.'); return; }
      for (const o of s.objectives) {
        if (!o.text.trim()) { setError('모든 학습목표에 내용을 입력하거나 ✕ 버튼으로 제거해주세요.'); return; }
      }
    }

    setSaving(true);
    setError(null);
    try {
      const keptSubjectIds = new Set(subjects.filter((s) => s.id).map((s) => s.id!));
      for (const original of course.subjects) {
        if (!keptSubjectIds.has(original.id)) {
          const res = await fetch(`/api/refine_objectives/subjects/${original.id}`, { method: 'DELETE' });
          if (!res.ok && res.status !== 204) await jsonOrThrow(res, `"${original.name}" 과목 삭제에 실패했습니다.`);
        }
      }

      for (const subject of subjects) {
        const name = subject.name.trim();
        const originalSubject = course.subjects.find((s) => s.id === subject.id);
        let subjectId = subject.id;

        if (!subjectId) {
          const res = await fetch('/api/refine_objectives/subjects', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ course_id: course.id, name }),
          });
          const data = await jsonOrThrow(res, `"${name}" 과목 생성에 실패했습니다.`);
          subjectId = data.subject.id;
        } else if (originalSubject && originalSubject.name !== name) {
          const res = await fetch(`/api/refine_objectives/subjects/${subjectId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name }),
          });
          await jsonOrThrow(res, `"${name}" 과목 수정에 실패했습니다.`);
        }

        const keptObjectiveIds = new Set(subject.objectives.filter((o) => o.id).map((o) => o.id!));
        for (const originalObjective of originalSubject?.objectives ?? []) {
          if (!keptObjectiveIds.has(originalObjective.id)) {
            const res = await fetch(`/api/refine_objectives/objectives/${originalObjective.id}`, { method: 'DELETE' });
            if (!res.ok && res.status !== 204) await jsonOrThrow(res, '학습목표 삭제에 실패했습니다.');
          }
        }

        for (const objective of subject.objectives) {
          const text = objective.text.trim();
          const originalObjective = originalSubject?.objectives.find((o) => o.id === objective.id);
          if (!objective.id) {
            const res = await fetch('/api/refine_objectives/objectives', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ subject_id: subjectId, text }),
            });
            await jsonOrThrow(res, '학습목표 생성에 실패했습니다.');
          } else if (originalObjective && originalObjective.confirmed_text !== text) {
            const res = await fetch(`/api/refine_objectives/objectives/${objective.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text }),
            });
            await jsonOrThrow(res, '학습목표 수정에 실패했습니다.');
          }
        }
      }

      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장 중 일부가 실패했습니다. 화면을 새로고침해 어디까지 반영됐는지 확인해주세요.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-lg shadow-xl w-[720px] max-w-full max-h-[85vh] flex flex-col relative">
        {saving && (
          <div className="absolute inset-0 bg-white/95 rounded-lg z-10 flex flex-col items-center justify-center gap-3">
            <div className="w-8 h-8 border-2 border-gray-200 border-t-neutral-900 rounded-full animate-spin" />
            <p className="text-sm text-gray-600">저장하고 있습니다...</p>
          </div>
        )}

        <div className="shrink-0 flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <span className="text-sm font-bold text-gray-800">학습목표 수정 — &quot;{course.name}&quot;</span>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-lg leading-none">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="space-y-4">
            {subjects.map((subject, si) => (
              <div key={subject.key} className="border border-gray-200/80 rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 shrink-0">과목{si + 1}</span>
                  <input
                    value={subject.name}
                    onChange={(e) => updateSubjectName(subject.key, e.target.value)}
                    placeholder="과목명"
                    maxLength={100}
                    className="flex-1 px-2 py-1.5 border border-gray-200/80 bg-white/60 rounded-md text-sm text-gray-800 focus:outline-none focus:border-neutral-500 focus:ring-1 focus:ring-neutral-500 transition-colors"
                  />
                  <button onClick={() => removeSubject(subject.key)} className="text-xs text-red-400 hover:text-red-600 shrink-0">과목 삭제</button>
                </div>

                <div className="pl-4 space-y-1.5">
                  {subject.objectives.map((objective, oi) => (
                    <div key={objective.key} className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 shrink-0 w-14">학습목표{oi + 1}</span>
                      <input
                        value={objective.text}
                        onChange={(e) => updateObjectiveText(subject.key, objective.key, e.target.value)}
                        placeholder="학습목표 내용"
                        maxLength={1000}
                        className="flex-1 px-2 py-1.5 border border-gray-200/80 bg-white/60 rounded-md text-sm text-gray-800 focus:outline-none focus:border-neutral-500 focus:ring-1 focus:ring-neutral-500 transition-colors"
                      />
                      <button onClick={() => removeObjective(subject.key, objective.key)} className="text-xs text-gray-400 hover:text-red-600 shrink-0">✕</button>
                    </div>
                  ))}
                  <button onClick={() => addObjective(subject.key)} className="text-xs text-gray-500 hover:text-neutral-900 pl-16">+ 학습목표</button>
                </div>
              </div>
            ))}
            <button
              onClick={addSubject}
              className="text-xs px-3 py-2 rounded-md border border-gray-200/80 text-gray-700 hover:border-neutral-500 hover:bg-neutral-100/60 transition-colors"
            >
              + 과목
            </button>
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>

        <div className="shrink-0 flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-200">
          <button onClick={onClose} className="px-3 py-2 text-xs text-gray-600 border border-gray-200/80 rounded-lg hover:border-neutral-500 hover:text-neutral-900 hover:bg-neutral-100/60 transition-colors">
            취소
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-3 py-2 text-xs font-semibold rounded-lg bg-neutral-900 text-white hover:bg-neutral-700 disabled:opacity-50 transition-colors"
          >
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** '학습목표 프롬프트' 팝업 — 과정별 AI 다듬기 프롬프트를 보고 수정한다. */
function PromptModal({
  course, onClose, onSaved,
}: {
  course: Course;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [prompt, setPrompt] = useState(course.prompt ?? DEFAULT_REFINE_PROMPT);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/refine_objectives/courses/${course.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      await jsonOrThrow(res, '저장에 실패했습니다.');
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-lg shadow-xl w-[1000px] h-[800px] max-w-full max-h-[90vh] flex flex-col">
        <div className="shrink-0 flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <span className="text-sm font-bold text-gray-800">"{course.name}" 학습목표 프롬프트</span>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-lg leading-none">✕</button>
        </div>
        <div className="flex-1 min-h-0 px-5 py-4 flex flex-col space-y-2">
          <p className="shrink-0 text-xs text-gray-500">이 과정의 학습목표를 AI로 다듬을 때 사용할 프롬프트입니다. 필요에 맞게 수정하세요.</p>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            maxLength={4000}
            className="flex-1 w-full px-3 py-2 border border-gray-200/80 bg-white/60 rounded-md text-sm text-gray-800 leading-relaxed focus:outline-none focus:border-neutral-500 focus:ring-1 focus:ring-neutral-500 transition-colors resize-none"
          />
          {error && <p className="shrink-0 text-xs text-red-500">{error}</p>}
        </div>
        <div className="shrink-0 flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-200">
          <button onClick={onClose} className="px-3 py-2 text-xs text-gray-600 border border-gray-200/80 rounded-lg hover:border-neutral-500 hover:text-neutral-900 hover:bg-neutral-100/60 transition-colors">
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-2 text-xs font-semibold rounded-lg bg-neutral-900 text-white hover:bg-neutral-700 disabled:opacity-50 transition-colors"
          >
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}
