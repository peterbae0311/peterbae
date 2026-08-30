'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase, WrittenTestCategory, WrittenTestQuestion } from '@/lib/supabase';

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, '');
}

function isCorrect(q: WrittenTestQuestion, userAnswer: string | undefined): boolean {
  if (!userAnswer) return false;
  if (q.type === 'short') return normalize(userAnswer) === normalize(q.answer);
  return userAnswer === q.answer;
}

export default function WrittenTestPanel({
  refId, companyName, recruitmentNotice, notes,
}: {
  refId: string;
  companyName: string;
  recruitmentNotice: string;
  notes: string;
}) {
  const [categories,     setCategories]     = useState<WrittenTestCategory[]>([]);
  const [questionsByCat, setQuestionsByCat] = useState<Record<string, WrittenTestQuestion[]>>({});
  const [generatingId,   setGeneratingId]   = useState<string | null>(null);
  const [showManage,     setShowManage]     = useState(false);
  const backdropMouseDownRef = useRef(false);
  const [generatingPdf,  setGeneratingPdf]  = useState(false);

  const [activeCatId, setActiveCatId] = useState<string | null>(null);
  const [answers,     setAnswers]     = useState<Record<string, string>>({});
  const [graded,      setGraded]      = useState(false);

  useEffect(() => { fetchCategories(); }, [refId]);

  const catsWithQuestions = categories.filter(c => (questionsByCat[c.id]?.length ?? 0) > 0);

  useEffect(() => {
    if (catsWithQuestions.length === 0) { setActiveCatId(null); return; }
    if (!activeCatId || !catsWithQuestions.some(c => c.id === activeCatId)) {
      setActiveCatId(catsWithQuestions[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories, questionsByCat]);

  async function fetchCategories() {
    const { data } = await supabase
      .from('written_test_categories').select('*').eq('ref_id', refId).order('sort_order');
    const cats = (data ?? []) as WrittenTestCategory[];
    setCategories(cats);
    if (cats.length > 0) fetchQuestions(cats.map(c => c.id));
    else setQuestionsByCat({});
  }

  async function fetchQuestions(categoryIds: string[]) {
    const { data } = await supabase
      .from('written_test_questions').select('*').in('category_id', categoryIds).order('sort_order');
    const grouped: Record<string, WrittenTestQuestion[]> = {};
    (data ?? []).forEach(row => {
      const q = row as WrittenTestQuestion;
      (grouped[q.category_id] ??= []).push(q);
    });
    setQuestionsByCat(grouped);
  }

  async function addCategory() {
    const { data } = await supabase
      .from('written_test_categories')
      .insert({ ref_id: refId, name: '', description: '', sort_order: categories.length })
      .select().single();
    if (data) setCategories(prev => [...prev, data as WrittenTestCategory]);
  }

  function updateCategoryLocal(id: string, changes: Partial<WrittenTestCategory>) {
    setCategories(cats => cats.map(c => c.id === id ? { ...c, ...changes } : c));
  }

  async function saveCategory(id: string) {
    const cat = categories.find(c => c.id === id);
    if (!cat) return;
    await supabase.from('written_test_categories')
      .update({ name: cat.name, description: cat.description, question_count: cat.question_count })
      .eq('id', id);
  }

  async function deleteCategory(id: string) {
    if (!confirm('이 카테고리와 생성된 문제를 모두 삭제하시겠습니까?')) return;
    await supabase.from('written_test_categories').delete().eq('id', id);
    setCategories(cats => cats.filter(c => c.id !== id));
    setQuestionsByCat(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  async function generateQuestions(cat: WrittenTestCategory) {
    setGeneratingId(cat.id);
    try {
      const res = await fetch('/career/api/cover-letter/written-test/generate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category_id:           cat.id,
          category_name:         cat.name,
          category_description:  cat.description,
          company_name:          companyName,
          recruitment_notice:    recruitmentNotice,
          notes:                 notes,
          question_count:        cat.question_count,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.questions || data.questions.length === 0) {
        throw new Error(data.error || '문제 생성에 실패했습니다.');
      }
      setQuestionsByCat(prev => ({ ...prev, [cat.id]: data.questions as WrittenTestQuestion[] }));
    } catch (err) {
      alert(err instanceof Error ? err.message : '문제 생성 중 오류가 발생했습니다.');
    } finally {
      setGeneratingId(null);
    }
  }

  const totalQuestions = Object.values(questionsByCat).reduce((sum, qs) => sum + qs.length, 0);
  const activeIndex = catsWithQuestions.findIndex(c => c.id === activeCatId);
  const activeCat   = catsWithQuestions[activeIndex] ?? null;
  const activeQs    = activeCat ? (questionsByCat[activeCat.id] ?? []) : [];
  const isFirstCat  = activeIndex <= 0;
  const isLastCat   = activeIndex === catsWithQuestions.length - 1;

  function selectAnswer(qId: string, value: string) {
    if (graded) return;
    setAnswers(prev => ({ ...prev, [qId]: value }));
  }

  function goPrev() {
    if (isFirstCat) return;
    setActiveCatId(catsWithQuestions[activeIndex - 1].id);
  }
  function goNext() {
    if (isLastCat) { setGraded(true); return; }
    setActiveCatId(catsWithQuestions[activeIndex + 1].id);
  }

  function retake() {
    setAnswers({});
    setGraded(false);
    if (catsWithQuestions.length > 0) setActiveCatId(catsWithQuestions[0].id);
  }

  async function downloadPdf() {
    setGeneratingPdf(true);
    try {
      const [{ pdf }, { WrittenTestPdfDocument }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('@/lib/writtenTestPdf'),
      ]);
      const blob = await pdf(
        <WrittenTestPdfDocument
          companyName={companyName}
          categories={categories}
          questionsByCat={questionsByCat}
          answers={answers}
          graded={graded}
        />
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${companyName || '필기예상문제'}_필기예상문제.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[written-test] PDF 생성 실패:', err);
      alert('PDF 생성 중 오류가 발생했습니다.');
    } finally {
      setGeneratingPdf(false);
    }
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">

      {/* ── 상단: 카테고리 탭 + 관리/다운로드 버튼 ──────────────── */}
      <div className="shrink-0 flex items-center justify-between px-4 py-2 border-b border-gray-100/80 bg-white/40">
        <div className="flex items-center gap-1 overflow-x-auto">
          {catsWithQuestions.map(cat => (
            <button
              key={cat.id}
              onClick={() => setActiveCatId(cat.id)}
              className={`shrink-0 px-4 py-2 text-sm font-bold rounded-t-lg border-b-2 transition-all duration-200 ${
                activeCatId === cat.id
                  ? 'border-neutral-900 text-neutral-900'
                  : 'border-transparent text-gray-400 hover:text-gray-700'
              }`}
            >
              {cat.name || '(제목 없음)'}
            </button>
          ))}
          {catsWithQuestions.length === 0 && (
            <span className="text-sm text-gray-400">카테고리 관리에서 카테고리를 만들고 문제를 생성하세요</span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {graded && (
            <button
              onClick={retake}
              className="text-xs text-gray-600 border border-gray-200/80 rounded-md px-3 py-1.5 hover:border-neutral-500 hover:text-neutral-900 hover:bg-neutral-100/60 transition-colors"
            >
              다시 응시
            </button>
          )}
          <button
            onClick={() => setShowManage(true)}
            className="text-xs text-gray-600 border border-gray-200/80 rounded-md px-3 py-1.5 hover:border-neutral-500 hover:text-neutral-900 hover:bg-neutral-100/60 transition-colors"
          >
            카테고리 관리
          </button>
          <button
            onClick={downloadPdf}
            disabled={totalQuestions === 0 || generatingPdf}
            className="text-xs text-white bg-neutral-900 rounded-md px-3 py-1.5 hover:bg-neutral-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            {generatingPdf ? 'PDF 생성 중...' : '문제 및 결과 PDF 다운로드'}
          </button>
        </div>
      </div>

      {/* ── 본문: 선택된 카테고리의 전체 문제 ────────────────────── */}
      <div className="flex-1 min-h-0 overflow-y-auto px-8 py-6">
        {!activeCat ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-3">
            <p className="text-sm">생성된 문제가 없습니다. 카테고리 관리에서 문제를 생성하세요.</p>
            <button
              onClick={() => setShowManage(true)}
              className="text-sm text-white bg-neutral-900 rounded-lg px-4 py-2 hover:bg-neutral-800 transition-colors"
            >
              카테고리 관리 열기
            </button>
          </div>
        ) : (
          <div className="space-y-8 max-w-3xl">
            {graded && (
              <p className="text-sm font-bold text-gray-700">
                {activeCat.name} — {activeQs.filter(q => isCorrect(q, answers[q.id])).length} / {activeQs.length} 정답
              </p>
            )}
            {activeQs.map((q, i) => {
              const userAnswer = answers[q.id] ?? '';
              const correct = graded ? isCorrect(q, userAnswer) : null;
              return (
                <div key={q.id}>
                  <p className="font-bold text-gray-800 mb-2 leading-relaxed">
                    {i + 1}. {q.question}
                    {graded && (
                      <span className={correct ? 'text-green-600 ml-2' : 'text-red-500 ml-2'}>
                        {correct ? '✓' : '✗'}
                      </span>
                    )}
                  </p>

                  {q.type !== 'short' ? (
                    <div className="space-y-1.5">
                      {q.choices?.map((c, ci) => {
                        const isSelected = userAnswer === c;
                        const isAnswer   = graded && c === q.answer;
                        const isWrongPick = graded && isSelected && !isAnswer;
                        return (
                          <button
                            key={ci}
                            onClick={() => selectAnswer(q.id, c)}
                            disabled={graded}
                            className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition-colors ${
                              isAnswer
                                ? 'border-green-400 bg-green-50 text-green-800 font-semibold'
                                : isWrongPick
                                ? 'border-red-300 bg-red-50 text-red-700 font-semibold'
                                : isSelected
                                ? 'border-neutral-900 bg-neutral-100 text-neutral-900 font-semibold'
                                : 'border-gray-200/80 bg-white/60 text-gray-700 hover:border-neutral-400 disabled:hover:border-gray-200/80'
                            }`}
                          >
                            <span className="inline-block w-6 text-gray-400">{String.fromCharCode(9312 + ci)}</span>
                            {c}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <input
                      value={userAnswer}
                      onChange={e => selectAnswer(q.id, e.target.value)}
                      disabled={graded}
                      className="w-full max-w-md px-3 py-2 border border-gray-200/80 bg-white/60 rounded-lg text-sm text-gray-800 focus:outline-none focus:border-neutral-500 focus:ring-1 focus:ring-neutral-500 disabled:bg-gray-50 transition-colors"
                      placeholder="답을 입력하세요"
                    />
                  )}

                  {graded && (
                    <div className="mt-2 text-xs text-gray-500 space-y-0.5">
                      <p>내 답변: {userAnswer || '(미응답)'}{q.type === 'short' && !correct && ` (정답: ${q.answer})`}</p>
                      {q.explanation && <p>해설: {q.explanation}</p>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── 하단: 카테고리 이동 ──────────────────────────────────── */}
      {activeCat && (
        <div className="shrink-0 flex items-center justify-between px-8 py-4 border-t border-gray-100/80">
          <button
            onClick={goPrev}
            disabled={isFirstCat}
            className="px-5 py-2 text-sm text-gray-600 border border-gray-200/80 rounded-lg hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            이전
          </button>
          {!graded && (
            <button
              onClick={goNext}
              className="px-6 py-2 bg-gradient-to-r from-neutral-900 to-neutral-800 text-white text-sm font-medium rounded-lg shadow-glow-dark hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
            >
              {isLastCat ? '제출하고 결과 보기' : '다음'}
            </button>
          )}
          {graded && !isLastCat && (
            <button
              onClick={goNext}
              className="px-6 py-2 bg-gradient-to-r from-neutral-900 to-neutral-800 text-white text-sm font-medium rounded-lg shadow-glow-dark hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
            >
              다음
            </button>
          )}
        </div>
      )}

      {/* ── 카테고리 관리 모달 ───────────────────────────────────────
          backdrop-blur가 걸린 조상(section 등) 아래에서 position:fixed를
          쓰면 그 조상이 fixed의 containing block이 되어버려(backdrop-filter는
          transform/filter처럼 새 containing block을 만듦) 뷰포트 전체가 아닌
          조상 박스 안에 갇힌다. document.body로 포탈링해 이를 피한다. */}
      {showManage && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 bg-neutral-950/30 backdrop-blur-sm flex items-center justify-center z-50"
          onMouseDown={e => { backdropMouseDownRef.current = e.target === e.currentTarget; }}
          onClick={e => {
            if (e.target === e.currentTarget && backdropMouseDownRef.current) setShowManage(false);
          }}
        >
          <div
            className="bg-white/90 backdrop-blur-2xl rounded-2xl border border-white/60 shadow-glass-lg w-[720px] max-w-[90vw] max-h-[85vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="shrink-0 flex items-center justify-between px-5 py-3 border-b border-gray-100/80">
              <span className="text-sm font-bold text-gray-800">카테고리 관리</span>
              <button
                onClick={() => setShowManage(false)}
                className="text-gray-400 hover:text-gray-700 text-lg leading-none transition-colors"
              >✕</button>
            </div>

            <div className="shrink-0 flex justify-end px-5 pt-4">
              <button
                onClick={addCategory}
                className="text-xs text-white bg-neutral-900 rounded-md px-3 py-1.5 hover:bg-neutral-800 transition-colors"
              >
                카테고리 추가
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {categories.length === 0 && (
                <p className="text-center text-gray-400 text-sm py-10">카테고리 추가 버튼으로 첫 카테고리를 등록하세요</p>
              )}
              {categories.map(cat => {
                const qs = questionsByCat[cat.id] ?? [];
                const isGenerating = generatingId === cat.id;
                return (
                  <div key={cat.id} className="border border-gray-200/80 rounded-xl bg-white/60 overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-2.5 bg-neutral-50/80 border-b border-gray-100/80">
                      <input
                        value={cat.name}
                        onChange={e => updateCategoryLocal(cat.id, { name: e.target.value })}
                        onBlur={() => saveCategory(cat.id)}
                        className="flex-1 bg-transparent text-sm font-bold text-gray-800 focus:outline-none"
                        placeholder="카테고리 제목을 입력하세요."
                      />
                      {qs.length > 0 && (
                        <span className="text-xs text-gray-400 whitespace-nowrap">문제 {qs.length}개 생성됨</span>
                      )}
                      <input
                        type="number"
                        value={cat.question_count}
                        onChange={e => updateCategoryLocal(cat.id, { question_count: Number(e.target.value) })}
                        onBlur={() => saveCategory(cat.id)}
                        min={4}
                        max={60}
                        step={1}
                        title="생성할 문제 개수"
                        className="shrink-0 w-14 px-2 py-1 border border-gray-200/80 rounded-md text-xs text-center text-gray-700 focus:outline-none focus:border-neutral-500 focus:ring-1 focus:ring-neutral-500 transition-colors"
                      />
                      <button
                        onClick={() => generateQuestions(cat)}
                        disabled={generatingId !== null || !cat.name.trim()}
                        className="flex items-center gap-1 shrink-0 text-xs text-gray-600 border border-gray-200/80 rounded-md px-2 py-1 hover:border-neutral-500 hover:text-neutral-900 hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {isGenerating && <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />}
                        {isGenerating ? '생성 중...' : qs.length > 0 ? '문제 재생성' : '문제 생성'}
                      </button>
                      <button
                        onClick={() => deleteCategory(cat.id)}
                        className="shrink-0 text-gray-400 hover:text-red-500 text-lg leading-none p-1 rounded hover:bg-red-50 transition-colors"
                        title="카테고리 삭제"
                      >
                        ⊖
                      </button>
                    </div>
                    <div className="px-4 py-3">
                      <textarea
                        value={cat.description ?? ''}
                        onChange={e => updateCategoryLocal(cat.id, { description: e.target.value })}
                        onBlur={() => saveCategory(cat.id)}
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-200/80 bg-white/60 rounded-lg text-sm text-gray-700 focus:outline-none focus:border-neutral-500 focus:ring-1 focus:ring-neutral-500 resize-y transition-colors"
                        placeholder="카테고리 설명을 입력하세요."
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
