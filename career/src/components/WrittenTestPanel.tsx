'use client';

import { useEffect, useState } from 'react';
import { supabase, WrittenTestCategory, WrittenTestQuestion } from '@/lib/supabase';

const TYPE_LABEL: Record<WrittenTestQuestion['type'], string> = {
  choice4: '4지선다',
  choice5: '5지선다',
  short:   '단답형',
};

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, '');
}

type QuizItem = { catId: string; catName: string; q: WrittenTestQuestion };

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
  const [mode,           setMode]           = useState<'manage' | 'quiz' | 'result'>('manage');

  const [order,   setOrder]   = useState<QuizItem[]>([]);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  useEffect(() => { fetchCategories(); }, [refId]);

  async function fetchCategories() {
    const { data } = await supabase
      .from('written_test_categories').select('*').eq('ref_id', refId).order('sort_order');
    const cats = (data ?? []) as WrittenTestCategory[];
    setCategories(cats);
    setMode('manage');
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
      .insert({ ref_id: refId, name: '새 카테고리', description: '', sort_order: categories.length })
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
      .update({ name: cat.name.trim() || '새 카테고리', description: cat.description })
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

  function startQuiz() {
    const flat: QuizItem[] = [];
    categories.forEach(cat => {
      (questionsByCat[cat.id] ?? []).forEach(q => flat.push({ catId: cat.id, catName: cat.name, q }));
    });
    if (flat.length === 0) {
      alert('생성된 문제가 없습니다. 먼저 카테고리별로 문제를 생성하세요.');
      return;
    }
    setOrder(flat);
    setAnswers({});
    setCurrent(0);
    setMode('quiz');
  }

  function selectAnswer(qId: string, value: string) {
    setAnswers(prev => ({ ...prev, [qId]: value }));
  }

  function goNext() {
    if (current + 1 >= order.length) setMode('result');
    else setCurrent(c => c + 1);
  }
  function goPrev() {
    setCurrent(c => Math.max(0, c - 1));
  }

  function isCorrect(item: QuizItem): boolean {
    const userAnswer = answers[item.q.id];
    if (!userAnswer) return false;
    if (item.q.type === 'short') return normalize(userAnswer) === normalize(item.q.answer);
    return userAnswer === item.q.answer;
  }

  function downloadAll() {
    const lines: string[] = [];
    categories.forEach(cat => {
      const qs = questionsByCat[cat.id] ?? [];
      if (qs.length === 0) return;
      lines.push(`■ ${cat.name}`);
      if (cat.description?.trim()) lines.push(cat.description.trim());
      lines.push('');
      qs.forEach((q, i) => {
        lines.push(`${i + 1}. [${TYPE_LABEL[q.type]}] ${q.question}`);
        q.choices?.forEach((c, ci) => lines.push(`   ${String.fromCharCode(9312 + ci)} ${c}`));
        lines.push(`정답: ${q.answer}`);
        if (q.explanation?.trim()) lines.push(`해설: ${q.explanation.trim()}`);
        lines.push('');
      });
      lines.push('');
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${companyName || '필기예상문제'}_필기예상문제.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── 문제 풀이 화면 ─────────────────────────────────────────
  if (mode === 'quiz') {
    const item = order[current];
    const selected = answers[item.q.id] ?? '';
    return (
      <div className="flex flex-col flex-1 overflow-hidden">
        <div className="shrink-0 flex items-center justify-between px-5 py-3 border-b border-gray-100/80 bg-white/40">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-white bg-neutral-900 rounded-md px-2 py-0.5">{item.catName}</span>
            <span className="text-xs text-gray-400">{TYPE_LABEL[item.q.type]}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500">{current + 1} / {order.length}</span>
            <button
              onClick={() => { if (confirm('풀던 문제를 종료하고 카테고리 관리로 돌아갈까요?')) setMode('manage'); }}
              className="text-xs text-gray-500 hover:text-red-500 transition-colors"
            >
              종료
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-8">
          <p className="text-lg font-bold text-gray-800 leading-relaxed mb-6 whitespace-pre-wrap">{item.q.question}</p>

          {item.q.type !== 'short' ? (
            <div className="space-y-2 max-w-xl">
              {item.q.choices?.map((c, i) => (
                <button
                  key={i}
                  onClick={() => selectAnswer(item.q.id, c)}
                  className={`w-full text-left px-4 py-3 rounded-lg border text-sm transition-colors ${
                    selected === c
                      ? 'border-neutral-900 bg-neutral-100 text-neutral-900 font-semibold'
                      : 'border-gray-200/80 bg-white/60 text-gray-700 hover:border-neutral-400'
                  }`}
                >
                  <span className="inline-block w-6 text-gray-400">{String.fromCharCode(9312 + i)}</span>
                  {c}
                </button>
              ))}
            </div>
          ) : (
            <input
              value={selected}
              onChange={e => selectAnswer(item.q.id, e.target.value)}
              className="w-full max-w-xl px-4 py-3 border border-gray-200/80 bg-white/60 rounded-lg text-sm text-gray-800 focus:outline-none focus:border-neutral-500 focus:ring-1 focus:ring-neutral-500 transition-colors"
              placeholder="답을 입력하세요"
            />
          )}
        </div>

        <div className="shrink-0 flex items-center justify-between px-8 py-4 border-t border-gray-100/80">
          <button
            onClick={goPrev}
            disabled={current === 0}
            className="px-5 py-2 text-sm text-gray-600 border border-gray-200/80 rounded-lg hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            이전
          </button>
          <button
            onClick={goNext}
            className="px-6 py-2 bg-gradient-to-r from-neutral-900 to-neutral-800 text-white text-sm font-medium rounded-lg shadow-glow-dark hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
          >
            {current + 1 >= order.length ? '제출하고 결과 보기' : '다음'}
          </button>
        </div>
      </div>
    );
  }

  // ── 결과 화면 ─────────────────────────────────────────────
  if (mode === 'result') {
    const results = order.map(item => ({ ...item, correct: isCorrect(item) }));
    const correctCount = results.filter(r => r.correct).length;
    const resultsByCat = categories
      .map(cat => ({ cat, items: results.filter(r => r.catId === cat.id) }))
      .filter(g => g.items.length > 0);

    return (
      <div className="flex flex-col flex-1 overflow-hidden">
        <div className="shrink-0 flex items-center justify-between px-5 py-3 border-b border-gray-100/80 bg-white/40">
          <span className="text-sm font-bold text-gray-800">
            결과 — {correctCount} / {results.length} 정답 ({results.length ? Math.round(correctCount / results.length * 100) : 0}%)
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={downloadAll}
              className="text-xs text-gray-600 border border-gray-200/80 rounded-md px-3 py-1 hover:border-neutral-500 hover:text-neutral-900 hover:bg-neutral-100/60 transition-colors"
            >
              문제 다운로드
            </button>
            <button
              onClick={startQuiz}
              className="text-xs text-gray-600 border border-gray-200/80 rounded-md px-3 py-1 hover:border-neutral-500 hover:text-neutral-900 hover:bg-neutral-100/60 transition-colors"
            >
              다시 응시
            </button>
            <button
              onClick={() => setMode('manage')}
              className="text-xs text-white bg-neutral-900 rounded-md px-3 py-1 hover:bg-neutral-800 transition-colors"
            >
              카테고리 관리로
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {resultsByCat.map(({ cat, items }) => {
            const catCorrect = items.filter(i => i.correct).length;
            return (
              <div key={cat.id}>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-sm font-bold text-gray-800">{cat.name}</span>
                  <span className="text-xs text-gray-400">{catCorrect} / {items.length} 정답</span>
                </div>
                <div className="space-y-3">
                  {items.map((r, i) => (
                    <div
                      key={r.q.id}
                      className={`px-4 py-3 rounded-lg border text-sm ${
                        r.correct ? 'border-green-200/80 bg-green-50/50' : 'border-red-200/80 bg-red-50/50'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <span className={`shrink-0 font-bold ${r.correct ? 'text-green-600' : 'text-red-500'}`}>
                          {r.correct ? '✓' : '✗'}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-gray-800 mb-1.5">{i + 1}. {r.q.question}</p>
                          <p className="text-gray-600">내 답변: {answers[r.q.id] || <span className="text-gray-400">(미응답)</span>}</p>
                          {!r.correct && <p className="text-gray-600">정답: {r.q.answer}</p>}
                          {r.q.explanation && <p className="text-gray-500 text-xs mt-1.5">해설: {r.q.explanation}</p>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── 카테고리 관리 화면 ────────────────────────────────────
  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="shrink-0 flex items-center justify-between px-5 py-3 border-b border-gray-100/80 bg-white/40">
        <span className="text-sm font-bold text-gray-800">카테고리 관리</span>
        <div className="flex items-center gap-2">
          <button
            onClick={addCategory}
            className="text-xs text-gray-600 border border-gray-200/80 rounded-md px-3 py-1 hover:border-neutral-500 hover:text-neutral-900 hover:bg-neutral-100/60 transition-colors"
          >
            + 카테고리 추가
          </button>
          <button
            onClick={downloadAll}
            disabled={totalQuestions === 0}
            className="text-xs text-gray-600 border border-gray-200/80 rounded-md px-3 py-1 hover:border-neutral-500 hover:text-neutral-900 hover:bg-neutral-100/60 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            전체 다운로드
          </button>
          <button
            onClick={startQuiz}
            disabled={totalQuestions === 0}
            className="text-xs text-white bg-neutral-900 rounded-md px-3 py-1 hover:bg-neutral-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            시험 응시
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {categories.length === 0 && (
          <p className="text-center text-gray-400 text-sm py-10">+ 카테고리 추가 버튼으로 첫 카테고리를 등록하세요</p>
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
                  placeholder="카테고리명"
                />
                {qs.length > 0 && (
                  <span className="text-xs text-gray-400 whitespace-nowrap">문제 {qs.length}개 생성됨</span>
                )}
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
                  placeholder="카테고리 설명 — 출제 범위, 참고할 지식/맥락 등을 입력하세요 (AI가 문제 생성 시 참고합니다)"
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
