'use client';

import { useState, useEffect, startTransition } from 'react';
import { supabase, CoverLetterRef, CoverLetterQuestion } from '@/lib/supabase';
import { Difficulty, DEFAULT_INTERVIEW_PROMPTS, DEFAULT_REGEN_PROMPT } from '@/lib/interviewPrompts';

type DraftUrl = { id?: string; title: string; url: string; sort_order: number };

const PROMPT_STORAGE_KEY = 'interview_prompts_v1';
const REGEN_PROMPT_STORAGE_KEY = 'interview_regen_prompt_v1';
type PromptModalKind = Difficulty | 'regen';

interface InterviewQ {
  id:            string;
  difficulty:    Difficulty;
  question:      string;
  follow_ups:    string[];
  purpose:       string;
  competency:    string;
  intent:        string;
  good_points:   string[];
  avoid:         string[];
  mistakes:      string[];
  sample_answer: string;
}
const DIFF_KO: Record<Difficulty, string> = {
  high:   '심층 직무·기술·전략 질문',
  medium: '경험·역량·직무이해 질문',
  low:    '자기소개·지원동기·기본인성 질문',
};

const NAV_H = 'h-[calc(100vh-56px)]';

function Icon({ d, className = 'w-5 h-5' }: { d: string; className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={d} />
    </svg>
  );
}

export default function CoverLetterPage() {
  const [refs,       setRefs]       = useState<CoverLetterRef[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab,        setTab]        = useState<'ref' | 'questions' | 'interview'>('ref');

  const [refForm, setRefForm] = useState({ company_name: '', recruitment_notice: '', notes: '' });
  const [urls,    setUrls]    = useState<DraftUrl[]>([]);

  const [questions,     setQuestions]     = useState<CoverLetterQuestion[]>([]);
  const [selectedQId,   setSelectedQId]   = useState<string | null>(null);
  const [savingRef,     setSavingRef]     = useState(false);
  const [savingQId,     setSavingQId]     = useState<string | null>(null);
  const [generatingQId, setGeneratingQId] = useState<string | null>(null);

  const [interviewQs,         setInterviewQs]         = useState<InterviewQ[]>([]);
  const [selectedIQId,        setSelectedIQId]        = useState<string | null>(null);
  const [generatingInterview, setGeneratingInterview] = useState<'all' | Difficulty | null>(null);
  const [regeneratingAnswer,  setRegeneratingAnswer]  = useState(false);

  const [interviewPrompts, setInterviewPrompts] = useState<Record<Difficulty, string>>(DEFAULT_INTERVIEW_PROMPTS);
  const [regenPrompt,      setRegenPrompt]      = useState(DEFAULT_REGEN_PROMPT);
  const [promptModalKind,  setPromptModalKind]  = useState<PromptModalKind | null>(null);
  const [promptDraft,      setPromptDraft]      = useState('');

  useEffect(() => {
    try {
      const saved = localStorage.getItem(PROMPT_STORAGE_KEY);
      if (saved) setInterviewPrompts({ ...DEFAULT_INTERVIEW_PROMPTS, ...JSON.parse(saved) });
      const savedRegen = localStorage.getItem(REGEN_PROMPT_STORAGE_KEY);
      if (savedRegen) setRegenPrompt(savedRegen);
    } catch {}
  }, []);

  function openPromptModal(kind: PromptModalKind) {
    setPromptDraft(kind === 'regen' ? regenPrompt : interviewPrompts[kind]);
    setPromptModalKind(kind);
  }

  function savePromptDraft() {
    if (!promptModalKind) return;
    if (promptModalKind === 'regen') {
      setRegenPrompt(promptDraft);
      localStorage.setItem(REGEN_PROMPT_STORAGE_KEY, promptDraft);
    } else {
      const next = { ...interviewPrompts, [promptModalKind]: promptDraft };
      setInterviewPrompts(next);
      localStorage.setItem(PROMPT_STORAGE_KEY, JSON.stringify(next));
    }
    setPromptModalKind(null);
  }

  const selectedRef = refs.find(r => r.id === selectedId) ?? null;
  const selectedQ   = questions.find(q => q.id === selectedQId) ?? null;

  useEffect(() => { fetchRefs(); }, []);

  useEffect(() => {
    if (!selectedId) return;
    fetchUrls(selectedId);
    fetchQuestions(selectedId);
    fetchInterviewQs(selectedId);
    setSelectedQId(null);
    setSelectedIQId(null);
    setInterviewQs([]);
  }, [selectedId]);

  useEffect(() => {
    if (selectedRef) {
      setRefForm({
        company_name:       selectedRef.company_name,
        recruitment_notice: selectedRef.recruitment_notice ?? '',
        notes:              selectedRef.notes ?? '',
      });
    }
  }, [selectedRef]);

  async function fetchRefs() {
    const { data } = await supabase.from('cover_letter_refs').select('*').order('created_at', { ascending: false });
    if (data) {
      setRefs(data as CoverLetterRef[]);
      if (data.length > 0) setSelectedId(data[0].id);
    }
  }

  async function fetchUrls(refId: string) {
    const { data } = await supabase.from('cover_letter_ref_urls').select('*').eq('ref_id', refId).order('sort_order');
    setUrls((data ?? []) as DraftUrl[]);
  }

  async function createRef() {
    const { data } = await supabase.from('cover_letter_refs').insert({ company_name: '새 회사' }).select().single();
    if (data) {
      setRefs([data as CoverLetterRef, ...refs]);
      setSelectedId(data.id);
      setTab('ref');
      setUrls([]);
      setQuestions([]);
    }
  }

  async function saveRef() {
    if (!selectedId || !refForm.company_name.trim()) return;
    setSavingRef(true);
    const { data: updated } = await supabase
      .from('cover_letter_refs')
      .update({ company_name: refForm.company_name.trim(), recruitment_notice: refForm.recruitment_notice || null, notes: refForm.notes || null })
      .eq('id', selectedId).select().single();
    if (updated) setRefs(refs.map(r => r.id === selectedId ? updated as CoverLetterRef : r));

    await supabase.from('cover_letter_ref_urls').delete().eq('ref_id', selectedId);
    const validUrls = urls.filter(u => u.title.trim() || u.url.trim());
    if (validUrls.length > 0) {
      const { data: savedUrls } = await supabase
        .from('cover_letter_ref_urls')
        .insert(validUrls.map((u, i) => ({ ref_id: selectedId, title: u.title, url: u.url, sort_order: i })))
        .select();
      setUrls((savedUrls ?? []) as DraftUrl[]);
    } else {
      setUrls([]);
    }
    setSavingRef(false);
  }

  async function deleteRef() {
    if (!selectedId) return;
    if (!confirm(`"${selectedRef?.company_name}" 자기소개서를 삭제하시겠습니까?\n(참고 URL, 문항 답변 모두 삭제됩니다)`)) return;
    await supabase.from('cover_letter_refs').delete().eq('id', selectedId);
    setRefs(refs.filter(r => r.id !== selectedId));
    setSelectedId(null);
    setUrls([]);
    setQuestions([]);
  }

  async function fetchQuestions(refId: string) {
    const { data } = await supabase.from('cover_letter_questions').select('*').eq('ref_id', refId).order('sort_order');
    setQuestions((data ?? []) as CoverLetterQuestion[]);
  }

  async function fetchInterviewQs(refId: string) {
    const { data } = await supabase
      .from('interview_questions')
      .select('*')
      .eq('ref_id', refId)
      .order('sort_order');
    if (data && data.length > 0) {
      const mapped = data.map(r => ({
        id:            r.id as string,
        difficulty:    r.difficulty as Difficulty,
        question:      r.question as string,
        follow_ups:    (r.follow_ups as string[]) ?? [],
        purpose:       r.purpose as string,
        competency:    r.competency as string,
        intent:        r.intent as string,
        good_points:   (r.good_points as string[]) ?? [],
        avoid:         (r.avoid as string[]) ?? [],
        mistakes:      (r.mistakes as string[]) ?? [],
        sample_answer: r.sample_answer as string,
      }));
      setInterviewQs(mapped);
      setSelectedIQId(mapped[0].id);
    }
  }

  async function addQuestion() {
    if (!selectedId) return;
    const { data } = await supabase
      .from('cover_letter_questions')
      .insert({ ref_id: selectedId, question: '', char_limit: null, answer: null, sort_order: questions.length })
      .select().single();
    if (data) {
      const newQ = data as CoverLetterQuestion;
      setQuestions(prev => [...prev, newQ]);
      setSelectedQId(newQ.id);
    }
  }

  function updateQuestionLocal(id: string, changes: Partial<CoverLetterQuestion>) {
    setQuestions(qs => qs.map(q => q.id === id ? { ...q, ...changes } : q));
  }

  async function saveQuestion(q: CoverLetterQuestion) {
    setSavingQId(q.id);
    await supabase.from('cover_letter_questions')
      .update({ question: q.question, char_limit: q.char_limit, answer: q.answer })
      .eq('id', q.id);
    setSavingQId(null);
  }

  async function deleteQuestion(id: string) {
    if (!confirm('이 문항을 삭제하시겠습니까?')) return;
    await supabase.from('cover_letter_questions').delete().eq('id', id);
    setQuestions(qs => qs.filter(q => q.id !== id));
    if (selectedQId === id) setSelectedQId(null);
  }

  async function generateAnswer() {
    if (!selectedQ) { alert('문항을 선택해주세요.'); return; }
    if (!selectedQ.question.trim()) { alert('문항을 먼저 입력해주세요.'); return; }
    setGeneratingQId(selectedQ.id);
    try {
      const res = await fetch('/api/cover-letter/generate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_name:       selectedRef?.company_name,
          recruitment_notice: selectedRef?.recruitment_notice,
          notes:              selectedRef?.notes,
          urls:               urls.map(u => ({ title: u.title, url: u.url })),
          question:           selectedQ.question,
          char_limit:         selectedQ.char_limit,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const updated = { ...selectedQ, answer: data.answer };
      updateQuestionLocal(selectedQ.id, { answer: data.answer });
      await saveQuestion(updated);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'AI 생성 중 오류가 발생했습니다.');
    } finally {
      setGeneratingQId(null);
    }
  }

  async function generateInterviewQs(difficulty: 'all' | Difficulty) {
    if (!selectedId) return;
    setGeneratingInterview(difficulty);
    try {
      const res = await fetch('/api/cover-letter/interview', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ref_id:                 selectedId,
          company_name:           selectedRef?.company_name,
          recruitment_notice:     selectedRef?.recruitment_notice,
          notes:                  selectedRef?.notes,
          urls:                   urls.map(u => ({ title: u.title, url: u.url })),
          cover_letter_questions: questions.map(q => q.question).filter(Boolean),
          difficulty,
          prompts: difficulty === 'all'
            ? interviewPrompts
            : { [difficulty]: interviewPrompts[difficulty] },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (difficulty === 'all') {
        setInterviewQs(data.questions);
        setSelectedIQId(data.questions[0]?.id ?? null);
      } else {
        setInterviewQs(prev => {
          const merged = [
            ...prev.filter(q => q.difficulty !== difficulty),
            ...data.questions,
          ].sort((a, b) => a.sort_order - b.sort_order);
          setSelectedIQId(merged[0]?.id ?? null);
          return merged;
        });
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : '면접 질문 생성 중 오류가 발생했습니다.');
    } finally {
      setGeneratingInterview(null);
    }
  }

  const selectedIQ = interviewQs.find(q => q.id === selectedIQId) ?? null;

  function updateInterviewQLocal(id: string, question: string) {
    setInterviewQs(prev => prev.map(q => q.id === id ? { ...q, question } : q));
  }

  async function saveInterviewQuestion(id: string, question: string) {
    if (id.startsWith('tmp-')) return;
    await supabase.from('interview_questions').update({ question }).eq('id', id);
  }

  async function regenAnswer() {
    if (!selectedIQ) return;
    setRegeneratingAnswer(true);
    try {
      const res = await fetch('/api/cover-letter/interview/regen', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question_id:        selectedIQ.id,
          question:           selectedIQ.question,
          company_name:       selectedRef?.company_name,
          recruitment_notice: selectedRef?.recruitment_notice,
          notes:              selectedRef?.notes,
          urls:               urls.map(u => ({ title: u.title, url: u.url })),
          prompt:             regenPrompt,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setInterviewQs(prev => prev.map(q =>
        q.id === selectedIQ.id ? { ...q, sample_answer: data.sample_answer } : q
      ));
    } catch (err) {
      alert(err instanceof Error ? err.message : '답변 생성 중 오류가 발생했습니다.');
    } finally {
      setRegeneratingAnswer(false);
    }
  }

  const answerLen  = (selectedQ?.answer?.split('\n\n\n[SAP 용어 참고]')[0] ?? '').length;
  const answerOver = !!(selectedQ?.char_limit && answerLen > selectedQ.char_limit);

  return (
    <div className={`flex ${NAV_H}`}>

      {/* ── 왼쪽: 회사 목록 ──────────────────────────────────────── */}
      <aside className="w-[20%] shrink-0 border-r border-gray-200 bg-white flex flex-col">
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-800">회사</span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={createRef}
              className="text-xs text-gray-600 border border-gray-300 rounded px-2 py-0.5 hover:border-blue-400 hover:text-blue-600 transition-colors"
            >
              + 추가
            </button>
            <button
              onClick={deleteRef}
              disabled={!selectedId}
              className="text-xs text-gray-600 border border-gray-300 rounded px-2 py-0.5 hover:border-red-400 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              삭제
            </button>
          </div>
        </div>
        <ul className="flex-1 overflow-y-auto">
          {refs.length === 0 && (
            <li className="text-center text-gray-400 text-xs py-10 px-4">
              + 추가 버튼으로<br />첫 회사를 등록하세요
            </li>
          )}
          {refs.map(ref => (
            <li key={ref.id}>
              <button
                onClick={() => { setSelectedId(ref.id); setTab('ref'); }}
                className={`w-full text-left pr-4 pl-3 py-2.5 border-b border-gray-100 border-l-4 text-sm font-bold truncate transition-colors ${
                  selectedId === ref.id
                    ? 'bg-blue-100 border-l-blue-500 text-blue-700'
                    : 'text-gray-700 hover:bg-gray-50 border-l-transparent'
                }`}
              >
                {ref.company_name}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {/* ── 오른쪽: 상세 영역 ─────────────────────────────────────── */}
      <section className="flex-1 flex flex-col overflow-hidden bg-white">
        {!selectedId ? (
          <div className="flex flex-col items-center justify-center flex-1 text-gray-400 gap-3">
            <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center">
              <Icon d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" className="w-8 h-8 text-gray-300" />
            </div>
            <p className="text-sm">왼쪽에서 회사를 선택하거나 추가하세요</p>
          </div>
        ) : (
          <div className="flex flex-col flex-1 overflow-hidden">

            {/* ── 탭 헤더 ────────────────────────────────────────── */}
            <div className="shrink-0 border-b border-gray-200 flex">
              {([['ref', '기본 정보'], ['questions', '자기소개서 질문'], ['interview', '면접 예상 질문']] as const).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className={`px-12 py-3 text-sm font-bold border-b-2 transition-colors ${
                    tab === id
                      ? 'border-blue-500 text-blue-700'
                      : 'border-transparent text-gray-400 hover:text-gray-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* ── 탭: 기본 정보 ──────────────────────────────────── */}
            {tab === 'ref' && (
              <div className="flex-1 overflow-y-auto">
                <table className="w-full border-collapse text-sm">
                  <colgroup>
                    <col style={{ width: '7rem' }} />
                    <col />
                  </colgroup>
                  <tbody>
                    {/* 모집 요강 */}
                    <tr className="bg-white">
                      <td className="pl-4 pr-3 py-4 text-right text-sm font-semibold text-gray-700 whitespace-nowrap align-top pt-5">
                        모집 요강 <span className="text-red-500">*</span>
                      </td>
                      <td className="pl-3 py-4 pr-8">
                        <textarea
                          value={refForm.recruitment_notice}
                          onChange={e => setRefForm(f => ({ ...f, recruitment_notice: e.target.value }))}
                          rows={17}
                          className="w-full px-3 py-2 border border-gray-200 rounded text-sm text-gray-700 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 resize-y"
                          placeholder="모집 직무, 자격 요건, 우대 사항 등을 입력하세요"
                        />
                      </td>
                    </tr>

                    {/* 참고 URL */}
                    <tr className="bg-gray-50">
                      <td className="pl-4 pr-3 py-4 text-right text-sm font-semibold text-gray-700 whitespace-nowrap align-top pt-5">
                        참고 URL
                      </td>
                      <td className="pl-3 py-4 pr-8">
                        <div className="border border-gray-200 rounded text-sm">
                          {/* 헤더 */}
                          <div className="flex bg-blue-50 border-b border-blue-100 rounded-t">
                            <div className="w-44 shrink-0 px-4 py-2 text-center font-medium text-blue-700 border-r border-blue-100">명칭</div>
                            <div className="flex-1 px-4 py-2 text-center font-medium text-blue-700 border-r border-blue-100">URL</div>
                            <div className="w-20 shrink-0 px-3 py-2 text-center font-medium text-blue-700 whitespace-nowrap">추가/삭제</div>
                          </div>
                          {/* 행 목록 — 3행 초과 시 스크롤 */}
                          <div className="overflow-y-auto" style={{ maxHeight: '108px' }}>
                            {urls.map((u, i) => (
                              <div key={i} className="flex border-b border-gray-100 last:border-0">
                                <div className="w-44 shrink-0 px-2 py-1 border-r border-gray-200">
                                  <input
                                    value={u.title}
                                    onChange={e => setUrls(us => us.map((x, j) => j === i ? { ...x, title: e.target.value } : x))}
                                    className="w-full px-2 py-1 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400 rounded"
                                    placeholder="명칭"
                                  />
                                </div>
                                <div className="flex-1 px-2 py-1 border-r border-gray-200 flex items-center gap-1">
                                  <input
                                    value={u.url}
                                    onChange={e => setUrls(us => us.map((x, j) => j === i ? { ...x, url: e.target.value } : x))}
                                    className="flex-1 px-2 py-1 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400 rounded"
                                    placeholder="https://..."
                                  />
                                  {u.url && (
                                    <a
                                      href={u.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="shrink-0 text-gray-400 hover:text-blue-500 transition-colors"
                                      title="새 탭에서 열기"
                                      onClick={e => e.stopPropagation()}
                                    >
                                      <Icon d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" className="w-3.5 h-3.5" />
                                    </a>
                                  )}
                                </div>
                                <div className="w-20 shrink-0 px-2 py-1 text-center whitespace-nowrap flex items-center justify-center gap-0.5">
                                  <button
                                    onClick={() => setUrls(us => [...us, { title: '', url: '', sort_order: us.length }])}
                                    className="text-gray-500 hover:text-blue-600 text-lg leading-none p-1.5 rounded hover:bg-blue-50 transition-colors"
                                    title="행 추가"
                                  >⊕</button>
                                  <button
                                    onClick={() => setUrls(us => us.filter((_, j) => j !== i))}
                                    className="text-gray-500 hover:text-red-500 text-lg leading-none p-1.5 rounded hover:bg-red-50 transition-colors"
                                    title="행 삭제"
                                  >⊖</button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </td>
                    </tr>

                    {/* 특이 사항 */}
                    <tr className="bg-white">
                      <td className="pl-4 pr-3 py-4 text-right text-sm font-semibold text-gray-700 whitespace-nowrap align-top pt-5">
                        특이 사항
                      </td>
                      <td className="pl-3 py-4 pr-8">
                        <textarea
                          value={refForm.notes}
                          onChange={e => setRefForm(f => ({ ...f, notes: e.target.value }))}
                          rows={5}
                          className="w-full px-3 py-2 border border-gray-200 rounded text-sm text-gray-700 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 resize-y"
                          placeholder="지원 동기, 추가 메모 등"
                        />
                      </td>
                    </tr>
                  </tbody>
                </table>

                {/* 저장 버튼 */}
                <div className="flex justify-end px-8 py-5 border-t border-gray-200">
                  <button
                    onClick={saveRef}
                    disabled={savingRef || !refForm.company_name.trim()}
                    className="px-6 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {savingRef ? '저장 중...' : '저장'}
                  </button>
                </div>
              </div>
            )}

            {/* ── 탭: 질의 문항 ──────────────────────────────────── */}
            {tab === 'questions' && (
              <div className="flex flex-col flex-1 overflow-hidden">

                {/* AI 작성 버튼 */}
                <div className="shrink-0 flex items-center gap-3 px-4 py-2.5 border-b border-gray-200 bg-gray-50">
                  <button
                    onClick={generateAnswer}
                    disabled={!selectedQId || generatingQId !== null}
                    className="shrink-0 flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {generatingQId ? (
                      <><span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />AI 작성 중...</>
                    ) : 'AI 작성'}
                  </button>
                  <p className="text-xs text-gray-400 leading-relaxed">
                    기본 정보(모집 요강·특이사항·참고 URL)와 문항을 바탕으로 AI가 한국어 답변을 생성합니다.
                    <br />글자수 제한이 있으면 98% 이상 채우며, 미달 시 자동으로 보완 재생성합니다.
                  </p>
                </div>

                {/* 문항 테이블 */}
                <div className="shrink-0 overflow-y-auto" style={{ maxHeight: '45%' }}>
                  <table className="w-full border-collapse text-sm">
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-blue-50 border-b border-blue-100">
                        <th className="w-10 px-3 py-2 border-r border-blue-100">
                          <span className="sr-only">선택</span>
                        </th>
                        <th className="px-4 py-2 text-center font-medium text-blue-700 border-r border-blue-100">
                          질문
                        </th>
                        <th className="w-28 px-3 py-2 text-center font-medium text-blue-700 border-r border-blue-100">
                          글자수 제한
                        </th>
                        <th className="w-24 px-3 py-2 text-center font-medium text-blue-700 whitespace-nowrap">
                          추가/삭제
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {questions.map((q) => (
                        <tr
                          key={q.id}
                          onClick={() => setSelectedQId(q.id)}
                          className={`border-b border-gray-200 cursor-pointer transition-colors ${
                            selectedQId === q.id ? 'bg-yellow-50' : 'hover:bg-gray-50'
                          }`}
                        >
                          <td className="px-3 py-2 text-center border-r border-gray-200" onClick={e => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selectedQId === q.id}
                              onChange={() => setSelectedQId(selectedQId === q.id ? null : q.id)}
                              className="w-4 h-4 accent-blue-600"
                            />
                          </td>
                          <td className="px-4 py-2 border-r border-gray-200" onClick={() => setSelectedQId(q.id)}>
                            <input
                              value={q.question}
                              onChange={e => updateQuestionLocal(q.id, { question: e.target.value })}
                              onBlur={() => {
                                const latest = questions.find(x => x.id === q.id);
                                if (latest) saveQuestion(latest);
                              }}
                              className="w-full bg-transparent text-sm text-gray-700 focus:outline-none"
                              placeholder="자기소개서 문항을 입력하세요"
                            />
                          </td>
                          <td className="px-3 py-2 text-center border-r border-gray-200" onClick={() => setSelectedQId(q.id)}>
                            <input
                              type="number"
                              value={q.char_limit ?? ''}
                              onChange={e => updateQuestionLocal(q.id, { char_limit: e.target.value ? Number(e.target.value) : null })}
                              onBlur={() => {
                                const latest = questions.find(x => x.id === q.id);
                                if (latest) saveQuestion(latest);
                              }}
                              min={0}
                              className="w-16 px-2 py-0.5 border border-gray-200 rounded text-sm text-center text-gray-700 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
                              placeholder="없음"
                            />
                          </td>
                          <td className="px-3 py-2 text-center" onClick={e => e.stopPropagation()}>
                            <button onClick={addQuestion} className="text-gray-500 hover:text-blue-600 text-lg leading-none p-1.5 rounded hover:bg-blue-50 transition-colors" title="행 추가">⊕</button>
                            <button onClick={() => deleteQuestion(q.id)} className="text-gray-500 hover:text-red-500 text-lg leading-none p-1.5 rounded hover:bg-red-50 transition-colors" title="삭제">⊖</button>
                          </td>
                        </tr>
                      ))}
                      {/* 하단 빈 행 */}
                      <tr className="border-b border-gray-100">
                        <td className="px-3 py-2 border-r border-gray-200" />
                        <td className="px-4 py-2 border-r border-gray-200 text-gray-400 text-xs">
                          {questions.length === 0 && '오른쪽 ⊕ 버튼으로 문항을 추가하세요'}
                        </td>
                        <td className="px-3 py-2 border-r border-gray-200" />
                        <td className="px-3 py-2 text-center">
                          <button onClick={addQuestion} className="text-gray-500 hover:text-blue-600 text-lg leading-none p-1.5 rounded hover:bg-blue-50 transition-colors" title="행 추가">⊕</button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* 구분선 */}
                <div className="shrink-0 border-t border-gray-200" />

                {/* 질의 답변 패널 */}
                <div className="flex-1 flex flex-col px-6 py-4 overflow-hidden min-h-0">
                  <div className="shrink-0 flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold text-gray-700">답변 내용</span>
                    <button
                      onClick={async () => {
                        if (selectedQ?.answer) await navigator.clipboard.writeText(selectedQ.answer);
                      }}
                      disabled={!selectedQ?.answer}
                      className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30 transition-colors rounded"
                      title="복사"
                    >
                      <Icon d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" className="w-4 h-4" />
                    </button>
                  </div>

                  {selectedQ ? (
                    <div className="flex flex-col flex-1 min-h-0">
                      <textarea
                        value={selectedQ.answer ?? ''}
                        onChange={e => updateQuestionLocal(selectedQ.id, { answer: e.target.value })}
                        onBlur={() => {
                          const latest = questions.find(x => x.id === selectedQ.id);
                          if (latest) saveQuestion(latest);
                        }}
                        className={`flex-1 w-full px-4 py-3 border rounded text-base text-gray-800 focus:outline-none focus:ring-1 resize-none ${
                          answerOver
                            ? 'border-red-300 focus:ring-red-400 bg-red-50'
                            : 'border-gray-200 focus:border-blue-400 focus:ring-blue-400 bg-blue-50/30'
                        }`}
                        placeholder="답변을 직접 입력하거나 위 AI 작성 버튼을 클릭하세요"
                      />
                      {selectedQ.char_limit && (
                        <div className={`shrink-0 text-right text-xs mt-1.5 ${answerOver ? 'text-red-500' : 'text-gray-400'}`}>
                          {answerLen.toLocaleString()} / {selectedQ.char_limit.toLocaleString()}자
                          {answerOver && ' (초과)'}
                          {savingQId === selectedQ.id && <span className="ml-2 text-gray-300">저장 중...</span>}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="min-h-[100px] border border-gray-200 rounded flex items-center justify-center text-gray-400 text-sm">
                      위 목록에서 문항을 선택하세요
                    </div>
                  )}
                </div>

              </div>
            )}

            {/* ── 탭: 면접 예상 질문 ─────────────────────────────── */}
            {tab === 'interview' && (
              <div className="flex flex-1 overflow-hidden">

                {/* 왼쪽: 난이도별 섹션 */}
                <div className="flex flex-col overflow-hidden" style={{ width: '58%' }}>
                  <div className="flex-1 overflow-y-auto">
                    {(['high', 'medium', 'low'] as const).map(diff => {
                      const dqs = interviewQs.filter(q => q.difficulty === diff);
                      const isRunning = generatingInterview === diff;
                      return (
                        <div key={diff} className="border-b-2 border-gray-300">

                          {/* 섹션 헤더 */}
                          <div className="flex items-center justify-between px-4 py-2.5 bg-white">
                            <span className="text-sm font-bold text-gray-800">{DIFF_KO[diff]}</span>
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => openPromptModal(diff)}
                                className="flex items-center gap-1.5 px-3 py-1 text-sm font-bold border border-gray-300 rounded bg-white hover:border-blue-400 hover:text-blue-600 transition-colors"
                              >
                                AI 프롬프트
                              </button>
                              <button
                                onClick={() => generateInterviewQs(diff)}
                                disabled={generatingInterview !== null}
                                className="flex items-center gap-1.5 px-3 py-1 text-sm font-bold border border-gray-300 rounded bg-white hover:border-blue-400 hover:text-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                              >
                                {isRunning && <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />}
                                {isRunning ? '생성 중...' : '질문 생성'}
                              </button>
                            </div>
                          </div>

                          {/* 질문 테이블 */}
                          <table className="w-full border-collapse text-sm">
                            <thead>
                              <tr className="bg-gray-100 border-y border-gray-200">
                                <th className="w-12 px-3 py-1.5 text-center font-medium text-gray-600 border-r border-gray-200">NO</th>
                                <th className="px-4 py-1.5 text-center font-medium text-gray-600">예상 질문</th>
                              </tr>
                            </thead>
                            <tbody>
                              {Array.from({ length: 10 }).map((_, i) => {
                                const q = dqs[i];
                                return (
                                  <tr
                                    key={q?.id ?? `empty-${diff}-${i}`}
                                    className={`border-b border-gray-100 transition-colors ${
                                      selectedIQId === q?.id ? 'bg-yellow-50' : q ? 'hover:bg-gray-50' : ''
                                    }`}
                                  >
                                    <td
                                      className="px-3 py-2 text-center text-gray-400 border-r border-gray-100 whitespace-nowrap cursor-pointer"
                                      onClick={() => q && setSelectedIQId(q.id)}
                                    >{i + 1}</td>
                                    <td className="px-4 py-1.5 text-gray-700">
                                      {q ? (
                                        <input
                                          key={q.id}
                                          defaultValue={q.question}
                                          onFocus={() => startTransition(() => setSelectedIQId(q.id))}
                                          onBlur={e => {
                                            const val = e.currentTarget.value;
                                            if (val !== q.question) {
                                              updateInterviewQLocal(q.id, val);
                                              saveInterviewQuestion(q.id, val);
                                            }
                                          }}
                                          className="w-full bg-transparent text-sm text-gray-700 focus:outline-none leading-relaxed cursor-text"
                                          placeholder="질문을 입력하세요"
                                        />
                                      ) : isRunning ? (
                                        <span className="text-gray-300 text-xs">생성 중...</span>
                                      ) : null}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>

                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 구분선 */}
                <div className="w-px bg-gray-200 shrink-0" />

                {/* 오른쪽: 답변 보기 */}
                <div className="flex flex-col flex-1 overflow-hidden">

                  {/* 헤더 */}
                  <div className="shrink-0 px-4 py-2.5 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
                    <span className="text-sm font-bold text-gray-700">답변 보기</span>
                    {selectedIQ && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openPromptModal('regen')}
                          className="flex items-center gap-1.5 px-3 py-1 text-sm font-bold border border-gray-300 rounded bg-white hover:border-blue-400 hover:text-blue-600 transition-colors"
                        >
                          AI 프롬프트
                        </button>
                        <button
                          onClick={regenAnswer}
                          disabled={regeneratingAnswer}
                          className="flex items-center gap-1.5 px-3 py-1 text-sm font-bold border border-gray-300 rounded bg-white hover:border-blue-400 hover:text-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          {regeneratingAnswer
                            ? <><span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />생성 중...</>
                            : '답변 다시생성'}
                        </button>
                        <button
                          onClick={() => {
                            const text = [
                              `[질문] ${selectedIQ.question}`,
                              '',
                              `[모범 답변]\n${selectedIQ.sample_answer}`,
                              '',
                              selectedIQ.follow_ups.length > 0
                                ? `[꼬리 질문]\n${selectedIQ.follow_ups.map(f => `• ${f}`).join('\n')}`
                                : '',
                              `[평가 의도]\n목적: ${selectedIQ.purpose}\n역량: ${selectedIQ.competency}\n의도: ${selectedIQ.intent}`,
                            ].filter(Boolean).join('\n');
                            navigator.clipboard.writeText(text);
                          }}
                          className="p-1 text-gray-400 hover:text-gray-700 transition-colors rounded"
                          title="클립보드 복사"
                        >
                          <Icon d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* 답변 내용 */}
                  <div className="flex-1 overflow-y-auto px-5 py-4">
                    {selectedIQ ? (
                      <div className="space-y-5 text-sm">
                        <div>
                          <p className="font-bold text-gray-800 mb-2">모범 답변</p>
                          <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">{selectedIQ.sample_answer}</p>
                        </div>
                        {selectedIQ.follow_ups.length > 0 && (
                          <>
                            <hr className="border-gray-300" />
                            <div>
                              <p className="font-bold text-gray-800 mb-2">꼬리 질문</p>
                              <ul className="space-y-1">
                                {selectedIQ.follow_ups.map((f, i) => (
                                  <li key={i} className="text-gray-600">• {f}</li>
                                ))}
                              </ul>
                            </div>
                          </>
                        )}
                        <div>
                          <p className="font-bold text-gray-800 mb-2">평가 의도</p>
                          <div className="space-y-1 text-gray-600">
                            <p><span className="font-medium text-gray-700">목적: </span>{selectedIQ.purpose}</p>
                            <p><span className="font-medium text-gray-700">역량: </span>{selectedIQ.competency}</p>
                            <p><span className="font-medium text-gray-700">의도: </span>{selectedIQ.intent}</p>
                          </div>
                        </div>
                        <div>
                          <p className="font-bold text-gray-800 mb-2">답변 가이드</p>
                          <div className="space-y-2">
                            {selectedIQ.good_points.length > 0 && (
                              <div>
                                <p className="text-xs font-bold text-green-700 mb-1">✓ 좋은 답변 포인트</p>
                                {selectedIQ.good_points.map((p, i) => <p key={i} className="text-xs text-gray-600 ml-2">• {p}</p>)}
                              </div>
                            )}
                            {selectedIQ.avoid.length > 0 && (
                              <div>
                                <p className="text-xs font-bold text-red-600 mb-1">✗ 피해야 할 답변</p>
                                {selectedIQ.avoid.map((p, i) => <p key={i} className="text-xs text-gray-600 ml-2">• {p}</p>)}
                              </div>
                            )}
                            {selectedIQ.mistakes.length > 0 && (
                              <div>
                                <p className="text-xs font-bold text-orange-600 mb-1">⚠ 자주 하는 실수</p>
                                {selectedIQ.mistakes.map((p, i) => <p key={i} className="text-xs text-gray-600 ml-2">• {p}</p>)}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                        왼쪽 질문을 클릭하면 답변이 표시됩니다
                      </div>
                    )}
                  </div>
                </div>

              </div>
            )}

          </div>
        )}
      </section>

      {/* ── AI 프롬프트 편집 모달 ─────────────────────────────── */}
      {promptModalKind && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
          onClick={() => setPromptModalKind(null)}
        >
          <div
            className="bg-white rounded-lg shadow-xl w-[720px] max-w-[90vw] max-h-[85vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="shrink-0 flex items-center justify-between px-5 py-3 border-b border-gray-200">
              <span className="text-sm font-bold text-gray-800">
                AI 프롬프트 — {promptModalKind === 'regen' ? '답변 다시생성' : DIFF_KO[promptModalKind]}
              </span>
              <button
                onClick={() => setPromptModalKind(null)}
                className="text-gray-400 hover:text-gray-700 text-lg leading-none"
              >✕</button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              <p className="text-xs text-gray-400 mb-2 leading-relaxed">
                {promptModalKind === 'regen'
                  ? <>{'{{context}}'} 는 회사/기관 정보로, {'{{question}}'} 는 선택한 면접 질문으로 자동 치환됩니다.</>
                  : <>{'{{context}}'} 는 회사/기관 정보로, {'{{difficulty}}'} 는 난이도 설명으로 자동 치환됩니다.</>}
              </p>
              <textarea
                value={promptDraft}
                onChange={e => setPromptDraft(e.target.value)}
                rows={20}
                className="w-full px-3 py-2 border border-gray-200 rounded text-xs font-mono text-gray-700 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 resize-y"
              />
            </div>

            <div className="shrink-0 flex items-center justify-between px-5 py-3 border-t border-gray-200">
              <button
                onClick={() => setPromptDraft(promptModalKind === 'regen' ? DEFAULT_REGEN_PROMPT : DEFAULT_INTERVIEW_PROMPTS[promptModalKind])}
                className="text-xs text-gray-500 hover:text-red-500 transition-colors"
              >
                기본값으로 초기화
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPromptModalKind(null)}
                  className="px-4 py-1.5 text-sm text-gray-600 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={savePromptDraft}
                  className="px-4 py-1.5 text-sm text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors"
                >
                  저장
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
