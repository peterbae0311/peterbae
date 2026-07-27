'use client';

import { useState, useEffect, useRef, type ReactNode, type ClipboardEvent } from 'react';
import Script from 'next/script';
import {
  supabase, ResumeEducation, ResumeCareer, ResumeProject, ResumeSkill, ResumeCompetency,
} from '@/lib/supabase';
import { DEFAULT_SELF_INTRO_PROMPT, DEFAULT_COMPETENCY_PROMPT } from '@/lib/resumePrompts';

interface DaumPostcodeResult {
  zonecode: string;
  roadAddress: string;
  jibunAddress: string;
}

declare global {
  interface Window {
    daum?: {
      Postcode: new (options: {
        oncomplete: (data: DaumPostcodeResult) => void;
        width?: string | number;
        height?: string | number;
      }) => { embed: (el: HTMLElement) => void };
    };
  }
}

const INTRO_PROMPT_KEY = 'resume_intro_prompt_v1';
const COMPETENCY_PROMPT_KEY = 'resume_competency_prompt_v1';

type ProfileForm = {
  id: string;
  name: string;
  career_type: string;
  birth_date: string;
  gender: string;
  email: string;
  phone: string;
  address: string;
  address_detail: string;
  military_service: string;
  photo_url: string;
  photo_filename: string;
  photo_size: number | null;
  self_introduction: string;
  desired_job: string;
  desired_location: string;
  desired_salary: string;
  desired_employment_type: string;
  available_start_date: string;
};

const EMPTY_PROFILE: ProfileForm = {
  id: '', name: '', career_type: '', birth_date: '', gender: '', email: '', phone: '', address: '', address_detail: '',
  military_service: '', photo_url: '', photo_filename: '', photo_size: null, self_introduction: '',
  desired_job: '', desired_location: '', desired_salary: '', desired_employment_type: '', available_start_date: '',
};

const CURRENT_YEAR = new Date().getFullYear();
const YEARS  = Array.from({ length: 72 }, (_, i) => CURRENT_YEAR + 1 - i);
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const DAYS   = Array.from({ length: 31 }, (_, i) => i + 1);

function splitYM(d: string | null): [string, string] {
  if (!d) return ['', ''];
  const [y, m] = d.split('-');
  return [y ?? '', m ? String(Number(m)) : ''];
}
function joinYM(y: string, m: string): string | null {
  return y && m ? `${y}-${m.padStart(2, '0')}-01` : null;
}
function splitYMD(d: string | null): [string, string, string] {
  if (!d) return ['', '', ''];
  const [y, m, day] = d.split('-');
  return [y ?? '', m ? String(Number(m)) : '', day ? String(Number(day)) : ''];
}
function joinYMD(y: string, m: string, day: string): string | null {
  return y && m && day ? `${y}-${m.padStart(2, '0')}-${day.padStart(2, '0')}` : null;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function formatPhoneNumber(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length < 4) return digits;
  if (digits.length < 8) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

function autoResize(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}

function fmtYMD(d: string | null): string {
  if (!d) return '-';
  const [y, m, day] = d.split('-');
  return `${y} / ${m} / ${day}`;
}
function fmtYM(d: string | null): string {
  if (!d) return '-';
  const [y, m] = d.split('-');
  return `${y}.${m}`;
}
function ViewField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-24 shrink-0 text-right text-sm font-semibold text-gray-700">{label}</span>
      <span className="text-sm text-gray-800">{value || '-'}</span>
    </div>
  );
}

function ViewTable({ columns, rows }: { columns: { label: string; cls: string }[]; rows: string[][] }) {
  return (
    <div className="border border-gray-200/80 rounded-lg text-sm overflow-hidden bg-white/50 overflow-x-auto">
      <div className="flex bg-neutral-100 border-b border-neutral-200/70">
        {columns.map((c, i) => (
          <div key={i} className={`${c.cls} px-3 py-2 text-center font-medium text-neutral-900 border-r border-neutral-200/70 last:border-r-0`}>{c.label}</div>
        ))}
      </div>
      {rows.length === 0 && (
        <div className="text-center text-gray-400 text-xs py-6">등록된 항목이 없습니다</div>
      )}
      {rows.map((row, ri) => (
        <div key={ri} className="flex items-center border-b border-gray-100 last:border-0">
          {row.map((cell, ci) => (
            <div key={ci} className={`${columns[ci].cls} px-3 py-2 text-sm text-gray-800 border-r border-gray-100 last:border-r-0 whitespace-pre-wrap`}>{cell || '-'}</div>
          ))}
        </div>
      ))}
    </div>
  );
}

function parseExcelDate(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  const m = t.match(/(\d{4})\D+(\d{1,2})/);
  if (!m) return null;
  return `${m[1]}-${m[2].padStart(2, '0')}-01`;
}

interface ExcelColumnDef {
  key: string;
  label: string;
  cls: string;
}

const CAREER_EXCEL_COLUMNS: ExcelColumnDef[] = [
  { key: 'company_name',     label: '회사',       cls: 'flex-[2]' },
  { key: 'start_date',       label: '입사 년월',  cls: 'w-28 shrink-0' },
  { key: 'end_date',         label: '퇴직 년월',  cls: 'w-28 shrink-0' },
  { key: 'department',       label: '부서',       cls: 'flex-1' },
  { key: 'position',         label: '직급',       cls: 'flex-1' },
  { key: 'responsibilities', label: '담당 직무',  cls: 'flex-[3]' },
];
const CAREER_EXCEL_SAMPLE = ['(주)LG화학', '2000.01', '2010.12', '인재개발팀', '과장', '인사기획, 임원평가'];

const PROJECT_EXCEL_COLUMNS: ExcelColumnDef[] = [
  { key: 'project_name', label: '프로젝트명',   cls: 'flex-[2]' },
  { key: 'start_date',   label: '시작 년월',    cls: 'w-28 shrink-0' },
  { key: 'end_date',     label: '종료 년월',    cls: 'w-28 shrink-0' },
  { key: 'description',  label: '프로젝트 설명', cls: 'flex-[3]' },
  { key: 'role',         label: '담당 직무',    cls: 'flex-[2]' },
  { key: 'client_name',  label: '발주처',       cls: 'flex-[2]' },
];
const PROJECT_EXCEL_SAMPLE = ['ERP 고도화', '2015.03', '2015.12', '재무회계 모듈 구축 및 데이터 마이그레이션', 'PM', '(주)한국전자'];

function sortByStartDateDesc<T extends { start_date: string | null }>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    if (!a.start_date && !b.start_date) return 0;
    if (!a.start_date) return 1;
    if (!b.start_date) return -1;
    return a.start_date < b.start_date ? 1 : a.start_date > b.start_date ? -1 : 0;
  });
}

function careerYears(careers: ResumeCareer[]): number {
  let months = 0;
  const now = new Date();
  for (const c of careers) {
    if (!c.start_date) continue;
    const start = new Date(c.start_date);
    const end = c.end_date ? new Date(c.end_date) : now;
    const diff = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
    if (diff > 0) months += diff;
  }
  return Math.floor(months / 12);
}

const selectSmCls = 'px-1.5 py-1 border border-gray-200/80 bg-white/60 rounded text-xs text-gray-700 focus:outline-none focus:border-neutral-500 focus:ring-1 focus:ring-neutral-500 transition-colors';
const inputCls    = 'w-full px-3 py-2 border border-gray-200/80 bg-white/60 rounded-lg text-sm text-gray-700 focus:outline-none focus:border-neutral-500 focus:ring-1 focus:ring-neutral-500 transition-colors';
const selectCls   = inputCls + ' appearance-none';
const cellInputCls  = 'w-full px-2 py-1.5 text-sm text-gray-700 bg-transparent border border-transparent rounded transition-colors hover:border-gray-300 hover:bg-white focus:outline-none focus:border-neutral-400 focus:bg-white focus:ring-1 focus:ring-neutral-400';
const cellSelectCls = cellInputCls;

function YearMonth({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const [y, m] = splitYM(value);
  return (
    <div className="flex items-center gap-1">
      <select className={selectSmCls} value={y} onChange={e => onChange(joinYM(e.target.value, m || String(new Date().getMonth() + 1)))}>
        <option value="">년도</option>
        {YEARS.map(yy => <option key={yy} value={yy}>{yy}</option>)}
      </select>
      <select className={selectSmCls} value={m} onChange={e => onChange(joinYM(y || String(CURRENT_YEAR), e.target.value))}>
        <option value="">월</option>
        {MONTHS.map(mm => <option key={mm} value={mm}>{mm}</option>)}
      </select>
    </div>
  );
}

function SectionHeader({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-base font-extrabold tracking-tight text-neutral-900">{title}</h2>
      {right}
    </div>
  );
}

function PromptButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-xs text-gray-600 border border-gray-200/80 rounded-md px-2 py-0.5 hover:border-neutral-500 hover:text-neutral-900 hover:bg-neutral-100/60 transition-colors"
    >
      AI 프롬프트
    </button>
  );
}

function GenerateButton({ onClick, loading, label }: { onClick: () => void; loading: boolean; label: string }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="flex items-center gap-1.5 text-xs font-bold text-white bg-gradient-to-r from-neutral-900 to-neutral-800 rounded-md px-3 py-1 shadow-glow-dark hover:shadow-lg disabled:opacity-50 transition-all duration-200"
    >
      {loading && <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />}
      {loading ? '생성 중...' : label}
    </button>
  );
}

function ExcelImportButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-xs text-gray-600 border border-gray-200/80 rounded-md px-2 py-0.5 hover:border-neutral-500 hover:text-neutral-900 hover:bg-neutral-100/60 transition-colors"
    >
      엑셀로 추가하기
    </button>
  );
}

function ExcelImportModal({
  title, columns, sampleRow, onClose, onConfirm,
}: {
  title: string;
  columns: ExcelColumnDef[];
  sampleRow: string[];
  onClose: () => void;
  onConfirm: (rows: string[][]) => Promise<void>;
}) {
  const [rows, setRows] = useState<string[][]>([]);
  const [warning, setWarning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const warningTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function flashWarning() {
    setWarning(true);
    if (warningTimer.current) clearTimeout(warningTimer.current);
    warningTimer.current = setTimeout(() => setWarning(false), 3000);
  }

  function handlePaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    if (!text.trim()) return;
    const parsed = text
      .split(/\r\n|\n|\r/)
      .filter(line => line.trim() !== '')
      .map(line => {
        const cells = line.split('\t');
        return columns.map((_, i) => (cells[i] ?? '').trim());
      });
    if (parsed.length === 0) return;
    setRows(prev => [...prev, ...parsed]);
    setWarning(false);
  }

  function handleChange() {
    // 붙여넣기는 onPaste에서 처리되어 여기까지 오지 않음 → 수기 입력만 감지됨
    flashWarning();
  }

  function addEmptyRow() {
    setRows(prev => [...prev, columns.map(() => '')]);
  }
  function removeRow(idx: number) {
    setRows(prev => prev.filter((_, i) => i !== idx));
  }
  function updateCell(rowIdx: number, colIdx: number, value: string) {
    setRows(prev => prev.map((r, i) => i === rowIdx ? r.map((c, j) => j === colIdx ? value : c) : r));
  }

  async function handleConfirm() {
    if (rows.length === 0 || submitting) return;
    setSubmitting(true);
    await onConfirm(rows);
    setSubmitting(false);
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-[980px] max-w-[95vw] max-h-[88vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="shrink-0 flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <span className="text-sm font-bold text-gray-800">엑셀로 추가하기 — {title}</span>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-lg leading-none">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <p className="text-sm font-bold text-gray-800 mb-1">엑셀 데이터로 붙여넣기</p>
          <p className="text-xs text-gray-500 mb-2">엑셀에서 아래 예시와 같이 셀을 복사한 후 붙여넣으세요.</p>

          <div className="border border-gray-200 rounded-lg overflow-hidden text-xs mb-3">
            <div className="flex bg-neutral-100 border-b border-gray-200">
              {columns.map(c => (
                <div key={c.key} className={`${c.cls} px-2 py-1.5 text-center font-medium text-neutral-800 border-r border-gray-200 last:border-r-0`}>{c.label}</div>
              ))}
            </div>
            <div className="flex bg-blue-50/60">
              {sampleRow.map((v, i) => (
                <div key={i} className={`${columns[i].cls} px-2 py-1.5 text-center text-gray-600 border-r border-gray-200 last:border-r-0`}>{v}</div>
              ))}
            </div>
          </div>

          <textarea
            value=""
            onChange={handleChange}
            onPaste={handlePaste}
            rows={3}
            placeholder="엑셀에서 복사한 데이터를 여기에 Ctrl + V 로 붙여넣으면 자동으로 아래 목록에 추가됩니다."
            className="w-full px-3 py-2 border border-dashed border-blue-300 bg-blue-50/40 rounded-lg text-xs text-gray-600 placeholder:text-gray-400 focus:outline-none focus:border-blue-400 resize-none"
          />
          {warning && (
            <p className="text-xs text-red-500 mt-1.5">
              수기 입력은 지원하지 않습니다. 엑셀에서 셀을 선택 후 복사(Ctrl+C) → 붙여넣기(Ctrl+V) 해주세요.
            </p>
          )}

          <div className="flex items-center justify-between mt-4 mb-2">
            <p className="text-sm">총 <span className="font-bold text-neutral-900">{rows.length}</span>명</p>
            <button onClick={addEmptyRow} className="text-xs text-gray-600 border border-gray-200/80 rounded-md px-2 py-1 hover:border-neutral-500 hover:text-neutral-900 hover:bg-neutral-100/60 transition-colors">행 추가</button>
          </div>

          <div className="border border-gray-200/80 rounded-lg overflow-hidden text-xs">
            <div className="flex bg-neutral-100 border-b border-gray-200/70">
              {columns.map(c => (
                <div key={c.key} className={`${c.cls} px-2 py-1.5 text-center font-medium text-neutral-800 border-r border-gray-200/70`}>{c.label}</div>
              ))}
              <div className="w-12 shrink-0 px-2 py-1.5 text-center font-medium text-neutral-800">삭제</div>
            </div>
            {rows.length === 0 && (
              <div className="text-center text-gray-400 text-xs py-6">붙여넣은 데이터가 여기에 표시됩니다</div>
            )}
            {rows.map((row, ri) => (
              <div key={ri} className="flex items-center border-b border-gray-100 last:border-0">
                {row.map((cell, ci) => (
                  <div key={ci} className={`${columns[ci].cls} px-1 py-1 border-r border-gray-200/70`}>
                    <input className={cellInputCls} value={cell} onChange={e => updateCell(ri, ci, e.target.value)} />
                  </div>
                ))}
                <div className="w-12 shrink-0 flex items-center justify-center">
                  <button onClick={() => removeRow(ri)} className="text-gray-400 hover:text-red-500 text-sm" title="삭제">✕</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="shrink-0 flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-200">
          <button onClick={onClose} className="px-4 py-1.5 text-sm text-gray-600 border border-gray-300 rounded hover:bg-gray-50 transition-colors">취소</button>
          <button onClick={handleConfirm} disabled={rows.length === 0 || submitting} className="px-4 py-1.5 text-sm text-white bg-neutral-900 rounded hover:bg-neutral-800 disabled:opacity-50 transition-colors">
            {submitting ? '추가 중...' : '추가 하기'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ResumePage() {
  const [profile,        setProfile]        = useState<ProfileForm>(EMPTY_PROFILE);
  const [savingProfile,  setSavingProfile]  = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [downloadNotice, setDownloadNotice] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  const [daumLoaded,          setDaumLoaded]          = useState(false);
  const [addressModalOpen,    setAddressModalOpen]    = useState(false);
  const [selectedBaseAddress, setSelectedBaseAddress] = useState('');
  const [addressDetailDraft,  setAddressDetailDraft]  = useState('');
  const postcodeContainerRef = useRef<HTMLDivElement>(null);

  const [careers,  setCareers]  = useState<ResumeCareer[]>([]);
  const [projects, setProjects] = useState<ResumeProject[]>([]);
  const [educations, setEducations] = useState<ResumeEducation[]>([]);
  const [excelImportKind, setExcelImportKind] = useState<'career' | 'project' | null>(null);

  const [skills,     setSkills]     = useState<ResumeSkill[]>([]);
  const [skillInput, setSkillInput] = useState('');

  const [competencies, setCompetencies] = useState<ResumeCompetency[]>([]);

  const [generatingIntro,      setGeneratingIntro]      = useState(false);
  const [generatingCompetency, setGeneratingCompetency] = useState(false);

  const [introPrompt,      setIntroPrompt]      = useState(DEFAULT_SELF_INTRO_PROMPT);
  const [competencyPrompt, setCompetencyPrompt] = useState(DEFAULT_COMPETENCY_PROMPT);
  const [promptModalKind,  setPromptModalKind]  = useState<'intro' | 'competency' | null>(null);
  const [promptDraft,      setPromptDraft]      = useState('');

  useEffect(() => {
    fetchProfile();
    fetchCareers();
    fetchProjects();
    fetchEducations();
    fetchSkills();
    fetchCompetencies();
    try {
      const savedIntro = localStorage.getItem(INTRO_PROMPT_KEY);
      if (savedIntro) setIntroPrompt(savedIntro);
      const savedCompetency = localStorage.getItem(COMPETENCY_PROMPT_KEY);
      if (savedCompetency) setCompetencyPrompt(savedCompetency);
    } catch {}
  }, []);

  // ── 기본정보 / 희망직무 / 자기소개서 (resume_profile) ──────

  async function fetchProfile() {
    const { data } = await supabase.from('resume_profile').select('*').limit(1).maybeSingle();
    if (data) {
      setProfile({
        id: data.id,
        name: data.name ?? '', career_type: data.career_type ?? '', birth_date: data.birth_date ?? '',
        gender: data.gender ?? '', email: data.email ?? '', phone: formatPhoneNumber(data.phone ?? ''),
        address: data.address ?? '', address_detail: data.address_detail ?? '', military_service: data.military_service ?? '',
        photo_url: data.photo_url ?? '', photo_filename: data.photo_filename ?? '', photo_size: data.photo_size ?? null,
        self_introduction: data.self_introduction ?? '',
        desired_job: data.desired_job ?? '', desired_location: data.desired_location ?? '',
        desired_salary: data.desired_salary ?? '', desired_employment_type: data.desired_employment_type ?? '',
        available_start_date: data.available_start_date ?? '',
      });
      setMode('view');
    } else {
      setMode('edit');
    }
  }

  async function saveProfile() {
    setSavingProfile(true);
    const payload = {
      name: profile.name || null, career_type: profile.career_type || null, birth_date: profile.birth_date || null,
      gender: profile.gender || null, email: profile.email || null, phone: profile.phone || null,
      address: profile.address || null, address_detail: profile.address_detail || null,
      military_service: profile.military_service || null, photo_url: profile.photo_url || null,
      photo_filename: profile.photo_filename || null, photo_size: profile.photo_size,
      self_introduction: profile.self_introduction || null,
      desired_job: profile.desired_job || null, desired_location: profile.desired_location || null,
      desired_salary: profile.desired_salary || null, desired_employment_type: profile.desired_employment_type || null,
      available_start_date: profile.available_start_date || null,
    };
    if (profile.id) {
      await supabase.from('resume_profile').update(payload).eq('id', profile.id);
    } else {
      const { data } = await supabase.from('resume_profile').insert(payload).select().single();
      if (data) setProfile(p => ({ ...p, id: data.id }));
    }
    setSavingProfile(false);
    setMode('view');
  }

  async function uploadPhoto(file: File) {
    setUploadingPhoto(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const path = `profile.${ext}`;
      const { error: uploadError } = await supabase.storage.from('resume-photos').upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from('resume-photos').getPublicUrl(path);
      const url = `${data.publicUrl}?v=${Date.now()}`;
      setProfile(p => ({ ...p, photo_url: url, photo_filename: file.name, photo_size: file.size }));
      if (profile.id) {
        await supabase.from('resume_profile').update({ photo_url: url, photo_filename: file.name, photo_size: file.size }).eq('id', profile.id);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : '사진 업로드 중 오류가 발생했습니다.');
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function removePhoto() {
    setProfile(p => ({ ...p, photo_url: '', photo_filename: '', photo_size: null }));
    if (profile.id) {
      await supabase.from('resume_profile').update({ photo_url: null, photo_filename: null, photo_size: null }).eq('id', profile.id);
    }
  }

  // ── 주소 검색 (Daum 우편번호 서비스) ──────────────────────

  useEffect(() => {
    if (!addressModalOpen || !daumLoaded || selectedBaseAddress) return;
    const container = postcodeContainerRef.current;
    if (!container || !window.daum) return;
    container.innerHTML = '';
    new window.daum.Postcode({
      oncomplete: (data) => {
        const base = data.roadAddress || data.jibunAddress;
        setSelectedBaseAddress(`(${data.zonecode}) ${base}`);
      },
      width: '100%',
      height: 460,
    }).embed(container);
  }, [addressModalOpen, daumLoaded, selectedBaseAddress]);

  function openAddressModal() {
    setSelectedBaseAddress('');
    setAddressDetailDraft('');
    setAddressModalOpen(true);
  }

  function closeAddressModal() {
    setAddressModalOpen(false);
    setSelectedBaseAddress('');
    setAddressDetailDraft('');
  }

  function confirmAddress() {
    const combined = `${selectedBaseAddress} ${addressDetailDraft}`.trim();
    setProfile(p => ({ ...p, address: combined }));
    setAddressModalOpen(false);
  }

  // ── 회사 경력 ──────────────────────────────────────────

  async function fetchCareers() {
    const { data } = await supabase.from('resume_careers').select('*').order('sort_order');
    setCareers(sortByStartDateDesc((data ?? []) as ResumeCareer[]));
  }

  async function addCareer() {
    const { data } = await supabase.from('resume_careers').insert({ company_name: '', sort_order: careers.length }).select().single();
    if (data) setCareers(prev => sortByStartDateDesc([...prev, data as ResumeCareer]));
  }

  function updateCareerLocal(id: string, changes: Partial<ResumeCareer>) {
    setCareers(prev => sortByStartDateDesc(prev.map(c => c.id === id ? { ...c, ...changes } : c)));
  }

  async function saveCareer(c: ResumeCareer) {
    await supabase.from('resume_careers').update({
      company_name: c.company_name, department: c.department, position: c.position,
      start_date: c.start_date, end_date: c.end_date, responsibilities: c.responsibilities,
    }).eq('id', c.id);
  }

  async function saveCareerField(id: string, changes: Partial<ResumeCareer>) {
    updateCareerLocal(id, changes);
    const cur = careers.find(c => c.id === id);
    if (cur) await saveCareer({ ...cur, ...changes });
  }

  async function deleteCareer(id: string) {
    await supabase.from('resume_careers').delete().eq('id', id);
    setCareers(prev => prev.filter(c => c.id !== id));
  }

  async function bulkAddCareers(rows: string[][]) {
    const items = rows
      .filter(r => r.some(c => c.trim() !== ''))
      .map((r, i) => ({
        company_name:     r[0]?.trim() || '',
        start_date:       parseExcelDate(r[1] ?? ''),
        end_date:         parseExcelDate(r[2] ?? ''),
        department:       r[3]?.trim() || null,
        position:         r[4]?.trim() || null,
        responsibilities: r[5]?.trim() || null,
        sort_order:       careers.length + i,
      }));
    if (items.length === 0) return;
    const { data } = await supabase.from('resume_careers').insert(items).select();
    if (data) setCareers(prev => sortByStartDateDesc([...prev, ...(data as ResumeCareer[])]));
  }

  // ── 프로젝트 이력 ──────────────────────────────────────

  async function fetchProjects() {
    const { data } = await supabase.from('resume_projects').select('*').order('sort_order');
    setProjects(sortByStartDateDesc((data ?? []) as ResumeProject[]));
  }

  async function addProject() {
    const { data } = await supabase.from('resume_projects').insert({ project_name: '', sort_order: projects.length }).select().single();
    if (data) setProjects(prev => sortByStartDateDesc([...prev, data as ResumeProject]));
  }

  function updateProjectLocal(id: string, changes: Partial<ResumeProject>) {
    setProjects(prev => sortByStartDateDesc(prev.map(p => p.id === id ? { ...p, ...changes } : p)));
  }

  async function saveProject(p: ResumeProject) {
    await supabase.from('resume_projects').update({
      project_name: p.project_name, start_date: p.start_date, end_date: p.end_date,
      description: p.description, role: p.role, client_name: p.client_name,
    }).eq('id', p.id);
  }

  async function saveProjectField(id: string, changes: Partial<ResumeProject>) {
    updateProjectLocal(id, changes);
    const cur = projects.find(p => p.id === id);
    if (cur) await saveProject({ ...cur, ...changes });
  }

  async function deleteProject(id: string) {
    await supabase.from('resume_projects').delete().eq('id', id);
    setProjects(prev => prev.filter(p => p.id !== id));
  }

  async function bulkAddProjects(rows: string[][]) {
    const items = rows
      .filter(r => r.some(c => c.trim() !== ''))
      .map((r, i) => ({
        project_name: r[0]?.trim() || '',
        start_date:   parseExcelDate(r[1] ?? ''),
        end_date:     parseExcelDate(r[2] ?? ''),
        description:  r[3]?.trim() || null,
        role:         r[4]?.trim() || null,
        client_name:  r[5]?.trim() || null,
        sort_order:   projects.length + i,
      }));
    if (items.length === 0) return;
    const { data } = await supabase.from('resume_projects').insert(items).select();
    if (data) setProjects(prev => sortByStartDateDesc([...prev, ...(data as ResumeProject[])]));
  }

  // ── 학력 ──────────────────────────────────────────────

  async function fetchEducations() {
    const { data } = await supabase.from('resume_educations').select('*').order('sort_order');
    setEducations((data ?? []) as ResumeEducation[]);
  }

  async function addEducation() {
    const { data } = await supabase.from('resume_educations').insert({ school_name: '', sort_order: educations.length }).select().single();
    if (data) setEducations(prev => [...prev, data as ResumeEducation]);
  }

  function updateEducationLocal(id: string, changes: Partial<ResumeEducation>) {
    setEducations(prev => prev.map(e => e.id === id ? { ...e, ...changes } : e));
  }

  async function saveEducation(e: ResumeEducation) {
    await supabase.from('resume_educations').update({
      school_type: e.school_type, school_name: e.school_name, department: e.department, major: e.major,
      degree: e.degree, status: e.status, start_date: e.start_date, end_date: e.end_date,
    }).eq('id', e.id);
  }

  async function saveEducationField(id: string, changes: Partial<ResumeEducation>) {
    updateEducationLocal(id, changes);
    const cur = educations.find(x => x.id === id);
    if (cur) await saveEducation({ ...cur, ...changes });
  }

  async function deleteEducation(id: string) {
    await supabase.from('resume_educations').delete().eq('id', id);
    setEducations(prev => prev.filter(e => e.id !== id));
  }

  // ── 스킬 ──────────────────────────────────────────────

  async function fetchSkills() {
    const { data } = await supabase.from('resume_skills').select('*').order('sort_order');
    setSkills((data ?? []) as ResumeSkill[]);
  }

  async function addSkillsFromInput() {
    const names = skillInput.split(/[,\n]/).map(s => s.trim()).filter(Boolean);
    if (names.length === 0) return;
    const rows = names.map((n, i) => ({ skill_name: n, sort_order: skills.length + i }));
    const { data } = await supabase.from('resume_skills').insert(rows).select();
    if (data) setSkills(prev => [...prev, ...(data as ResumeSkill[])]);
    setSkillInput('');
  }

  async function deleteSkill(id: string) {
    await supabase.from('resume_skills').delete().eq('id', id);
    setSkills(prev => prev.filter(s => s.id !== id));
  }

  // ── 핵심역량 ──────────────────────────────────────────

  async function fetchCompetencies() {
    const { data } = await supabase.from('resume_competencies').select('*').order('sort_order');
    setCompetencies((data ?? []) as ResumeCompetency[]);
  }

  async function addCompetency() {
    const { data } = await supabase.from('resume_competencies').insert({ title: '', sort_order: competencies.length }).select().single();
    if (data) setCompetencies(prev => [...prev, data as ResumeCompetency]);
  }

  function updateCompetencyLocal(id: string, changes: Partial<ResumeCompetency>) {
    setCompetencies(prev => prev.map(c => c.id === id ? { ...c, ...changes } : c));
  }

  async function saveCompetency(c: ResumeCompetency) {
    await supabase.from('resume_competencies').update({ title: c.title, description: c.description }).eq('id', c.id);
  }

  async function deleteCompetency(id: string) {
    await supabase.from('resume_competencies').delete().eq('id', id);
    setCompetencies(prev => prev.filter(c => c.id !== id));
  }

  // ── AI 생성 ───────────────────────────────────────────

  function aiPayload(prompt: string) {
    return {
      profile: { name: profile.name, career_type: profile.career_type, desired_job: profile.desired_job },
      educations: educations.map(e => ({ school_type: e.school_type, school_name: e.school_name, department: e.department, major: e.major, status: e.status })),
      careers: careers.map(c => ({ company_name: c.company_name, department: c.department, position: c.position, start_date: c.start_date, end_date: c.end_date, responsibilities: c.responsibilities })),
      projects: projects.map(p => ({ project_name: p.project_name, start_date: p.start_date, end_date: p.end_date, description: p.description, role: p.role, client_name: p.client_name })),
      skills: skills.map(s => ({ skill_name: s.skill_name })),
      prompt,
    };
  }

  async function generateSelfIntroduction() {
    setGeneratingIntro(true);
    try {
      const res = await fetch('/api/resume/self-introduction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile_id: profile.id || null, ...aiPayload(introPrompt) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setProfile(p => ({ ...p, self_introduction: data.self_introduction }));
    } catch (err) {
      alert(err instanceof Error ? err.message : '자기소개서 생성 중 오류가 발생했습니다.');
    } finally {
      setGeneratingIntro(false);
    }
  }

  async function generateCompetencies() {
    setGeneratingCompetency(true);
    try {
      const res = await fetch('/api/resume/competencies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(aiPayload(competencyPrompt)),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCompetencies(data.competencies);
    } catch (err) {
      alert(err instanceof Error ? err.message : '핵심역량 생성 중 오류가 발생했습니다.');
    } finally {
      setGeneratingCompetency(false);
    }
  }

  function openPromptModal(kind: 'intro' | 'competency') {
    setPromptDraft(kind === 'intro' ? introPrompt : competencyPrompt);
    setPromptModalKind(kind);
  }

  function savePromptDraft() {
    if (promptModalKind === 'intro') {
      setIntroPrompt(promptDraft);
      localStorage.setItem(INTRO_PROMPT_KEY, promptDraft);
    } else if (promptModalKind === 'competency') {
      setCompetencyPrompt(promptDraft);
      localStorage.setItem(COMPETENCY_PROMPT_KEY, promptDraft);
    }
    setPromptModalKind(null);
  }

  async function handleDownloadSelect(format: string) {
    if (!format) return;
    if (format === 'pdf') {
      await downloadResumePdf();
      return;
    }
    setDownloadNotice(true);
    setTimeout(() => setDownloadNotice(false), 2000);
  }

  async function downloadResumePdf() {
    setGeneratingPdf(true);
    try {
      const [{ pdf }, { ResumePdfDocument }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('@/lib/resumePdf'),
      ]);
      const blob = await pdf(
        <ResumePdfDocument
          profile={profile}
          careers={careers}
          projects={projects}
          educations={educations}
          skills={skills}
          competencies={competencies}
          years={careerYears(careers)}
        />
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `이력서_${profile.name || '이력서'}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[resume] PDF 생성 실패:', err);
      alert('PDF 생성 중 오류가 발생했습니다.');
    } finally {
      setGeneratingPdf(false);
    }
  }

  const years = careerYears(careers);
  const [by, bm, bd] = splitYMD(profile.birth_date);

  return (
    <div className="min-h-[calc(100vh-56px)] flex justify-center px-4 py-8">
      <div className="w-full" style={{ maxWidth: '1816px' }}>
        <div className="rounded-2xl border border-white/60 bg-white/70 backdrop-blur-xl shadow-glass p-8">

          {/* ── 헤더 ─────────────────────────────────────── */}
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-200/70">
            <h1 className="text-2xl font-black tracking-tighter text-neutral-900">이력서</h1>
            <div className="flex items-center gap-2">
              {mode === 'edit' ? (
                <>
                  <button
                    onClick={fetchProfile}
                    className="text-xs text-gray-600 border border-gray-200/80 rounded-md px-4 py-1.5 hover:border-neutral-500 hover:text-neutral-900 hover:bg-neutral-100/60 transition-colors"
                  >
                    취소
                  </button>
                  <button
                    onClick={saveProfile}
                    disabled={savingProfile || !profile.name.trim()}
                    className="px-5 py-1.5 bg-gradient-to-r from-neutral-900 to-neutral-800 text-white text-xs font-bold rounded-md shadow-glow-dark hover:shadow-lg disabled:opacity-50 transition-all duration-200"
                  >
                    {savingProfile ? '저장 중...' : '저장'}
                  </button>
                </>
              ) : (
                <>
                  <div className="relative">
                    <select
                      value=""
                      disabled={generatingPdf}
                      onChange={e => handleDownloadSelect(e.target.value)}
                      className="text-xs text-gray-600 border border-gray-200/80 rounded-md px-3 py-1.5 bg-white/60 hover:border-neutral-500 focus:outline-none focus:border-neutral-500 cursor-pointer disabled:opacity-50"
                    >
                      <option value="">{generatingPdf ? 'PDF 생성 중...' : '이력서 다운로드'}</option>
                      <option value="pdf">PDF</option>
                      <option value="ppt">PPT</option>
                      <option value="excel">EXCEL</option>
                      <option value="word">WORD</option>
                    </select>
                    {downloadNotice && (
                      <span className="absolute top-full right-0 mt-1.5 text-xs text-white bg-neutral-900 rounded px-2 py-1 whitespace-nowrap shadow-lg z-10">준비 중인 기능입니다</span>
                    )}
                  </div>
                  <button
                    onClick={() => setMode('edit')}
                    className="px-5 py-1.5 bg-gradient-to-r from-neutral-900 to-neutral-800 text-white text-xs font-bold rounded-md shadow-glow-dark hover:shadow-lg transition-all duration-200"
                  >
                    수정
                  </button>
                </>
              )}
            </div>
          </div>

          {mode === 'view' && (
            <>
              {/* ── 기본정보 (조회) ────────────────────────── */}
              <section className="mb-10">
                <SectionHeader title="기본정보" />
                <div className="flex gap-8">
                  {profile.photo_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={profile.photo_url} alt="프로필 사진" className="w-28 h-36 object-cover rounded-lg border border-gray-200/80 shrink-0" />
                  )}
                  <div className="grid grid-cols-2 gap-x-6 gap-y-3 flex-1">
                    <ViewField label="성명" value={profile.name} />
                    <ViewField label="신입/경력" value={`${profile.career_type}${profile.career_type === '경력' && years > 0 ? ` (${years}년차)` : ''}`} />
                    <ViewField label="생년월일" value={fmtYMD(profile.birth_date)} />
                    <ViewField label="성별" value={profile.gender} />
                    <ViewField label="이메일" value={profile.email} />
                    <ViewField label="휴대전화" value={profile.phone} />
                    <ViewField label="주소" value={profile.address} />
                    <ViewField label="병역" value={profile.military_service} />
                  </div>
                </div>
              </section>

              {/* ── 회사 경력 (조회) ──────────────────────── */}
              <section className="mb-10">
                <SectionHeader title="회사 경력" />
                <ViewTable
                  columns={[
                    { label: '회사', cls: 'flex-[2]' },
                    { label: '입사 년월', cls: 'w-28 shrink-0' },
                    { label: '퇴직 년월', cls: 'w-28 shrink-0' },
                    { label: '부서', cls: 'flex-1' },
                    { label: '직급', cls: 'flex-1' },
                    { label: '담당 직무', cls: 'flex-[3]' },
                  ]}
                  rows={careers.map(c => [
                    c.company_name, fmtYM(c.start_date), c.end_date ? fmtYM(c.end_date) : '현재',
                    c.department ?? '', c.position ?? '', c.responsibilities ?? '',
                  ])}
                />
              </section>

              {/* ── 프로젝트 이력 (조회) ──────────────────── */}
              <section className="mb-10">
                <SectionHeader title="프로젝트 이력" />
                <ViewTable
                  columns={[
                    { label: '프로젝트 명', cls: 'flex-[2]' },
                    { label: '시작 년월', cls: 'w-28 shrink-0' },
                    { label: '종료 년월', cls: 'w-28 shrink-0' },
                    { label: '프로젝트 설명', cls: 'flex-[3]' },
                    { label: '담당 직무', cls: 'flex-[2]' },
                    { label: '발주처', cls: 'flex-[2]' },
                  ]}
                  rows={projects.map(p => [
                    p.project_name, fmtYM(p.start_date), p.end_date ? fmtYM(p.end_date) : '현재',
                    p.description ?? '', p.role ?? '', p.client_name ?? '',
                  ])}
                />
              </section>

              {/* ── 학력 (조회) ───────────────────────────── */}
              <section className="mb-10">
                <SectionHeader title="학력" />
                <ViewTable
                  columns={[
                    { label: '구분', cls: 'w-24 shrink-0' },
                    { label: '학교명', cls: 'flex-1' },
                    { label: '학과', cls: 'flex-1' },
                    { label: '전공', cls: 'flex-1' },
                    { label: '입학 년월', cls: 'w-28 shrink-0' },
                    { label: '졸업 년월', cls: 'w-28 shrink-0' },
                    { label: '졸업 상태', cls: 'w-24 shrink-0' },
                  ]}
                  rows={educations.map(e => [
                    e.school_type ?? '', e.school_name, e.department ?? '', e.major ?? '',
                    fmtYM(e.start_date), fmtYM(e.end_date), e.status ?? '',
                  ])}
                />
              </section>

              {/* ── 스킬 (조회) ───────────────────────────── */}
              <section className="mb-10">
                <SectionHeader title="스킬" />
                <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 border border-gray-200/80 rounded-lg bg-white/60 min-h-[3rem]">
                  {skills.length === 0 && <span className="text-xs text-gray-400">등록된 스킬이 없습니다</span>}
                  {skills.map(s => (
                    <span key={s.id} className="inline-flex items-center px-3 py-1 rounded-full bg-neutral-100 border border-neutral-200 text-sm text-neutral-800">
                      {s.skill_name}
                    </span>
                  ))}
                </div>
              </section>

              {/* ── 자기소개서 (조회) ─────────────────────── */}
              <section className="mb-10">
                <SectionHeader title="자기소개서" />
                <div className="px-4 py-3 border border-gray-200/80 rounded-lg bg-white/50 text-sm text-gray-800 leading-relaxed whitespace-pre-wrap min-h-[4rem]">
                  {profile.self_introduction || '작성된 자기소개서가 없습니다.'}
                </div>
              </section>

              {/* ── 핵심역량 (조회) ───────────────────────── */}
              <section className="mb-2">
                <SectionHeader title="핵심역량" />
                <div className="border border-gray-200/80 rounded-lg bg-white/50 divide-y divide-gray-100">
                  {competencies.length === 0 && (
                    <div className="text-center text-gray-400 text-xs py-8">등록된 핵심역량이 없습니다</div>
                  )}
                  {competencies.map(c => (
                    <div key={c.id} className="px-4 py-3">
                      <p className="text-sm font-bold text-neutral-900 mb-1">{c.title}</p>
                      <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{c.description}</p>
                    </div>
                  ))}
                </div>
              </section>

              {/* ── 희망직무 (조회) ───────────────────────── */}
              <section className="mt-10">
                <SectionHeader title="희망직무" />
                <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                  <ViewField label="희망 직무" value={profile.desired_job} />
                  <ViewField label="희망 근무지역" value={profile.desired_location} />
                  <ViewField label="희망 연봉" value={profile.desired_salary} />
                  <ViewField label="희망 고용형태" value={profile.desired_employment_type || '무관'} />
                  <ViewField label="입사 가능일" value={profile.available_start_date} />
                </div>
              </section>
            </>
          )}

          {mode === 'edit' && (
          <>
          {/* ── 기본정보 ─────────────────────────────────── */}
          <section className="mb-10">
            <SectionHeader title="기본정보" />
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              <div className="flex items-center gap-3">
                <label className="w-24 shrink-0 text-right text-sm font-semibold text-gray-700">성명 <span className="text-red-500">*</span></label>
                <input className={inputCls} value={profile.name} onChange={e => setProfile(p => ({ ...p, name: e.target.value }))} placeholder="홍길동" />
              </div>
              <div className="flex items-center gap-3">
                <label className="w-24 shrink-0 text-right text-sm font-semibold text-gray-700">신입/경력 <span className="text-red-500">*</span></label>
                <select className={selectCls + ' flex-1'} value={profile.career_type} onChange={e => setProfile(p => ({ ...p, career_type: e.target.value }))}>
                  <option value="">경력 구분</option>
                  <option value="신입">신입</option>
                  <option value="경력">경력</option>
                </select>
                {profile.career_type === '경력' && years > 0 && (
                  <span className="text-sm text-gray-500 shrink-0">({years}년차)</span>
                )}
              </div>

              <div className="flex items-center gap-3">
                <label className="w-24 shrink-0 text-right text-sm font-semibold text-gray-700">생년월일</label>
                <div className="flex items-center gap-1">
                  <select className={selectSmCls} value={by} onChange={e => setProfile(p => ({ ...p, birth_date: joinYMD(e.target.value, bm || '1', bd || '1') ?? '' }))}>
                    <option value="">년도</option>
                    {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                  <select className={selectSmCls} value={bm} onChange={e => setProfile(p => ({ ...p, birth_date: joinYMD(by || String(CURRENT_YEAR), e.target.value, bd || '1') ?? '' }))}>
                    <option value="">월</option>
                    {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <select className={selectSmCls} value={bd} onChange={e => setProfile(p => ({ ...p, birth_date: joinYMD(by || String(CURRENT_YEAR), bm || '1', e.target.value) ?? '' }))}>
                    <option value="">일</option>
                    {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <label className="w-24 shrink-0 text-right text-sm font-semibold text-gray-700">성별</label>
                <select className={selectCls + ' flex-1'} value={profile.gender} onChange={e => setProfile(p => ({ ...p, gender: e.target.value }))}>
                  <option value="">성별 선택</option>
                  <option value="남성">남성</option>
                  <option value="여성">여성</option>
                </select>
              </div>

              <div className="flex items-center gap-3">
                <label className="w-24 shrink-0 text-right text-sm font-semibold text-gray-700">이메일</label>
                <input type="email" className={inputCls} value={profile.email} onChange={e => setProfile(p => ({ ...p, email: e.target.value }))} placeholder="example@email.com" />
              </div>
              <div className="flex items-center gap-3">
                <label className="w-24 shrink-0 text-right text-sm font-semibold text-gray-700">휴대전화 <span className="text-red-500">*</span></label>
                <input type="tel" inputMode="numeric" className={inputCls} value={profile.phone} onChange={e => setProfile(p => ({ ...p, phone: formatPhoneNumber(e.target.value) }))} placeholder="010-1234-5678" maxLength={13} />
              </div>

              <div className="flex items-center gap-3">
                <label className="w-24 shrink-0 text-right text-sm font-semibold text-gray-700">주소</label>
                <input
                  className={inputCls + ' cursor-pointer bg-white/60'}
                  value={profile.address}
                  readOnly
                  onClick={openAddressModal}
                  placeholder="클릭하여 주소 검색"
                />
              </div>
              <div className="flex items-center gap-3">
                <label className="w-24 shrink-0 text-right text-sm font-semibold text-gray-700">병역</label>
                <select className={selectCls + ' flex-1'} value={profile.military_service} onChange={e => setProfile(p => ({ ...p, military_service: e.target.value }))}>
                  <option value="">해당 없음</option>
                  <option value="군필">군필</option>
                  <option value="미필">미필</option>
                  <option value="면제">면제</option>
                </select>
              </div>
              <div className="flex items-center gap-3">
                <label className="w-24 shrink-0 text-right text-sm font-semibold text-gray-700">사진</label>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-600 border border-gray-200/80 rounded-md px-3 py-1.5 hover:border-neutral-500 hover:text-neutral-900 hover:bg-neutral-100/60 transition-colors cursor-pointer">
                    {uploadingPhoto ? '업로드 중...' : '파일 선택'}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={uploadingPhoto}
                      onChange={e => { const f = e.target.files?.[0]; if (f) uploadPhoto(f); e.target.value = ''; }}
                    />
                  </label>
                  {profile.photo_filename && (
                    <>
                      <span className="text-sm text-gray-600">
                        {profile.photo_filename}{profile.photo_size != null ? ` / ${formatFileSize(profile.photo_size)}` : ''}
                      </span>
                      <button onClick={removePhoto} className="text-gray-400 hover:text-red-500 transition-colors leading-none">×</button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* ── 회사 경력 ────────────────────────────────── */}
          <section className="mb-10">
            <SectionHeader title="회사 경력" right={<ExcelImportButton onClick={() => setExcelImportKind('career')} />} />
            <div className="border border-gray-200/80 rounded-lg text-sm overflow-hidden bg-white/50 overflow-x-auto">
              <div className="flex bg-neutral-100 border-b border-neutral-200/70 min-w-[1100px]">
                <div className="flex-[2] px-3 py-2 text-center font-medium text-neutral-900 border-r border-neutral-200/70">회사</div>
                <div className="w-40 shrink-0 px-2 py-2 text-center font-medium text-neutral-900 border-r border-neutral-200/70">입사 년월</div>
                <div className="w-40 shrink-0 px-2 py-2 text-center font-medium text-neutral-900 border-r border-neutral-200/70">퇴직 년월</div>
                <div className="flex-1 px-3 py-2 text-center font-medium text-neutral-900 border-r border-neutral-200/70">부서</div>
                <div className="flex-1 px-3 py-2 text-center font-medium text-neutral-900 border-r border-neutral-200/70">직급</div>
                <div className="flex-[3] px-3 py-2 text-center font-medium text-neutral-900 border-r border-neutral-200/70">담당 직무</div>
                <div className="w-20 shrink-0 px-2 py-2 text-center font-medium text-neutral-900 whitespace-nowrap">추가/삭제</div>
              </div>
              {careers.length === 0 && (
                <div className="text-center text-gray-400 text-xs py-8 min-w-[1100px]">+ 버튼으로 경력을 추가하세요</div>
              )}
              {careers.map(c => (
                <div key={c.id} className="flex items-center border-b border-gray-100 last:border-0 min-w-[1100px]">
                  <div className="flex-[2] px-2 py-1 border-r border-gray-200/70">
                    <input className={cellInputCls} value={c.company_name} onChange={e => updateCareerLocal(c.id, { company_name: e.target.value })} onBlur={() => saveCareer({ ...c, company_name: c.company_name })} placeholder="기업" />
                  </div>
                  <div className="w-40 shrink-0 px-2 py-1 border-r border-gray-200/70 flex items-center">
                    <YearMonth value={c.start_date} onChange={v => saveCareerField(c.id, { start_date: v })} />
                  </div>
                  <div className="w-40 shrink-0 px-2 py-1 border-r border-gray-200/70 flex items-center">
                    <YearMonth value={c.end_date} onChange={v => saveCareerField(c.id, { end_date: v })} />
                  </div>
                  <div className="flex-1 px-2 py-1 border-r border-gray-200/70">
                    <input className={cellInputCls} value={c.department ?? ''} onChange={e => updateCareerLocal(c.id, { department: e.target.value })} onBlur={() => saveCareer({ ...c, department: c.department })} />
                  </div>
                  <div className="flex-1 px-2 py-1 border-r border-gray-200/70">
                    <input className={cellInputCls} value={c.position ?? ''} onChange={e => updateCareerLocal(c.id, { position: e.target.value })} onBlur={() => saveCareer({ ...c, position: c.position })} />
                  </div>
                  <div className="flex-[3] px-2 py-1 border-r border-gray-200/70">
                    <textarea rows={1} ref={autoResize} onInput={e => autoResize(e.currentTarget)} className={cellInputCls + ' resize-none overflow-hidden block'} value={c.responsibilities ?? ''} onChange={e => updateCareerLocal(c.id, { responsibilities: e.target.value })} onBlur={() => saveCareer({ ...c, responsibilities: c.responsibilities })} placeholder="담당업무 및 성과" />
                  </div>
                  <div className="w-20 shrink-0 flex items-center justify-center gap-0.5">
                    <button onClick={addCareer} className="text-gray-500 hover:text-neutral-900 text-lg leading-none p-1 rounded hover:bg-neutral-100 transition-colors" title="행 추가">⊕</button>
                    <button onClick={() => deleteCareer(c.id)} className="text-gray-500 hover:text-red-500 text-lg leading-none p-1 rounded hover:bg-red-50 transition-colors" title="행 삭제">⊖</button>
                  </div>
                </div>
              ))}
              {careers.length === 0 && (
                <div className="flex justify-center py-2 border-t border-gray-100">
                  <button onClick={addCareer} className="text-gray-500 hover:text-neutral-900 text-lg leading-none p-1.5 rounded hover:bg-neutral-100 transition-colors" title="행 추가">⊕</button>
                </div>
              )}
            </div>
          </section>

          {/* ── 프로젝트 이력 ────────────────────────────── */}
          <section className="mb-10">
            <SectionHeader title="프로젝트 이력" right={<ExcelImportButton onClick={() => setExcelImportKind('project')} />} />
            <div className="border border-gray-200/80 rounded-lg text-sm overflow-hidden bg-white/50 overflow-x-auto">
              <div className="flex bg-neutral-100 border-b border-neutral-200/70 min-w-[1250px]">
                <div className="flex-[2] px-3 py-2 text-center font-medium text-neutral-900 border-r border-neutral-200/70">프로젝트 명</div>
                <div className="w-40 shrink-0 px-2 py-2 text-center font-medium text-neutral-900 border-r border-neutral-200/70">시작 년월</div>
                <div className="w-40 shrink-0 px-2 py-2 text-center font-medium text-neutral-900 border-r border-neutral-200/70">종료 년월</div>
                <div className="flex-[3] px-3 py-2 text-center font-medium text-neutral-900 border-r border-neutral-200/70">프로젝트 설명</div>
                <div className="flex-[2] px-3 py-2 text-center font-medium text-neutral-900 border-r border-neutral-200/70">담당 직무</div>
                <div className="flex-[2] px-3 py-2 text-center font-medium text-neutral-900 border-r border-neutral-200/70">발주처</div>
                <div className="w-20 shrink-0 px-2 py-2 text-center font-medium text-neutral-900 whitespace-nowrap">추가/삭제</div>
              </div>
              {projects.length === 0 && (
                <div className="text-center text-gray-400 text-xs py-8 min-w-[1250px]">+ 버튼으로 프로젝트를 추가하세요</div>
              )}
              {projects.map(p => (
                <div key={p.id} className="flex items-center border-b border-gray-100 last:border-0 min-w-[1250px]">
                  <div className="flex-[2] px-2 py-1 border-r border-gray-200/70">
                    <input className={cellInputCls} value={p.project_name} onChange={e => updateProjectLocal(p.id, { project_name: e.target.value })} onBlur={() => saveProject({ ...p, project_name: p.project_name })} placeholder="기업" />
                  </div>
                  <div className="w-40 shrink-0 px-2 py-1 border-r border-gray-200/70 flex items-center">
                    <YearMonth value={p.start_date} onChange={v => saveProjectField(p.id, { start_date: v })} />
                  </div>
                  <div className="w-40 shrink-0 px-2 py-1 border-r border-gray-200/70 flex items-center">
                    <YearMonth value={p.end_date} onChange={v => saveProjectField(p.id, { end_date: v })} />
                  </div>
                  <div className="flex-[3] px-2 py-1 border-r border-gray-200/70">
                    <textarea rows={1} ref={autoResize} onInput={e => autoResize(e.currentTarget)} className={cellInputCls + ' resize-none overflow-hidden block'} value={p.description ?? ''} onChange={e => updateProjectLocal(p.id, { description: e.target.value })} onBlur={() => saveProject({ ...p, description: p.description })} placeholder="프로젝트 설명" />
                  </div>
                  <div className="flex-[2] px-2 py-1 border-r border-gray-200/70">
                    <textarea rows={1} ref={autoResize} onInput={e => autoResize(e.currentTarget)} className={cellInputCls + ' resize-none overflow-hidden block'} value={p.role ?? ''} onChange={e => updateProjectLocal(p.id, { role: e.target.value })} onBlur={() => saveProject({ ...p, role: p.role })} placeholder="담당 직무" />
                  </div>
                  <div className="flex-[2] px-2 py-1 border-r border-gray-200/70">
                    <input className={cellInputCls} value={p.client_name ?? ''} onChange={e => updateProjectLocal(p.id, { client_name: e.target.value })} onBlur={() => saveProject({ ...p, client_name: p.client_name })} placeholder="발주처" />
                  </div>
                  <div className="w-20 shrink-0 flex items-center justify-center gap-0.5">
                    <button onClick={addProject} className="text-gray-500 hover:text-neutral-900 text-lg leading-none p-1 rounded hover:bg-neutral-100 transition-colors" title="행 추가">⊕</button>
                    <button onClick={() => deleteProject(p.id)} className="text-gray-500 hover:text-red-500 text-lg leading-none p-1 rounded hover:bg-red-50 transition-colors" title="행 삭제">⊖</button>
                  </div>
                </div>
              ))}
              {projects.length === 0 && (
                <div className="flex justify-center py-2 border-t border-gray-100">
                  <button onClick={addProject} className="text-gray-500 hover:text-neutral-900 text-lg leading-none p-1.5 rounded hover:bg-neutral-100 transition-colors" title="행 추가">⊕</button>
                </div>
              )}
            </div>
          </section>

          {/* ── 학력 ─────────────────────────────────────── */}
          <section className="mb-10">
            <SectionHeader title="학력" />
            <div className="border border-gray-200/80 rounded-lg text-sm overflow-hidden bg-white/50 overflow-x-auto">
              <div className="flex bg-neutral-100 border-b border-neutral-200/70 min-w-[1200px]">
                <div className="w-24 shrink-0 px-2 py-2 text-center font-medium text-neutral-900 border-r border-neutral-200/70">구분</div>
                <div className="flex-1 px-3 py-2 text-center font-medium text-neutral-900 border-r border-neutral-200/70">학교명</div>
                <div className="flex-1 px-3 py-2 text-center font-medium text-neutral-900 border-r border-neutral-200/70">학과</div>
                <div className="flex-1 px-3 py-2 text-center font-medium text-neutral-900 border-r border-neutral-200/70">전공</div>
                <div className="w-40 shrink-0 px-2 py-2 text-center font-medium text-neutral-900 border-r border-neutral-200/70">입학 년월</div>
                <div className="w-40 shrink-0 px-2 py-2 text-center font-medium text-neutral-900 border-r border-neutral-200/70">졸업 년월</div>
                <div className="w-24 shrink-0 px-2 py-2 text-center font-medium text-neutral-900 border-r border-neutral-200/70">졸업 상태</div>
                <div className="w-20 shrink-0 px-2 py-2 text-center font-medium text-neutral-900 whitespace-nowrap">추가/삭제</div>
              </div>
              {educations.length === 0 && (
                <div className="text-center text-gray-400 text-xs py-8 min-w-[1200px]">+ 버튼으로 학력을 추가하세요</div>
              )}
              {educations.map(e => (
                <div key={e.id} className="flex items-center border-b border-gray-100 last:border-0 min-w-[1200px]">
                  <div className="w-24 shrink-0 px-1 py-1 border-r border-gray-200/70">
                    <select className={cellSelectCls} value={e.school_type ?? ''} onChange={ev => saveEducationField(e.id, { school_type: ev.target.value })}>
                      <option value="">선택</option>
                      <option value="고등학교">고등학교</option>
                      <option value="전문대학">전문대학</option>
                      <option value="대학교">대학교</option>
                      <option value="대학원">대학원</option>
                      <option value="기타">기타</option>
                    </select>
                  </div>
                  <div className="flex-1 px-2 py-1 border-r border-gray-200/70">
                    <input className={cellInputCls} value={e.school_name} onChange={ev => updateEducationLocal(e.id, { school_name: ev.target.value })} onBlur={() => saveEducation({ ...e, school_name: e.school_name })} placeholder="학교명" />
                  </div>
                  <div className="flex-1 px-2 py-1 border-r border-gray-200/70">
                    <input className={cellInputCls} value={e.department ?? ''} onChange={ev => updateEducationLocal(e.id, { department: ev.target.value })} onBlur={() => saveEducation({ ...e, department: e.department })} placeholder="학과" />
                  </div>
                  <div className="flex-1 px-2 py-1 border-r border-gray-200/70">
                    <input className={cellInputCls} value={e.major ?? ''} onChange={ev => updateEducationLocal(e.id, { major: ev.target.value })} onBlur={() => saveEducation({ ...e, major: e.major })} placeholder="전공" />
                  </div>
                  <div className="w-40 shrink-0 px-2 py-1 border-r border-gray-200/70 flex items-center">
                    <YearMonth value={e.start_date} onChange={v => saveEducationField(e.id, { start_date: v })} />
                  </div>
                  <div className="w-40 shrink-0 px-2 py-1 border-r border-gray-200/70 flex items-center">
                    <YearMonth value={e.end_date} onChange={v => saveEducationField(e.id, { end_date: v })} />
                  </div>
                  <div className="w-24 shrink-0 px-1 py-1 border-r border-gray-200/70">
                    <select className={cellSelectCls} value={e.status ?? ''} onChange={ev => saveEducationField(e.id, { status: ev.target.value })}>
                      <option value="">선택</option>
                      <option value="졸업">졸업</option>
                      <option value="재학">재학</option>
                      <option value="휴학">휴학</option>
                      <option value="졸업예정">졸업예정</option>
                      <option value="수료">수료</option>
                      <option value="중퇴">중퇴</option>
                    </select>
                  </div>
                  <div className="w-20 shrink-0 flex items-center justify-center gap-0.5">
                    <button onClick={addEducation} className="text-gray-500 hover:text-neutral-900 text-lg leading-none p-1 rounded hover:bg-neutral-100 transition-colors" title="행 추가">⊕</button>
                    <button onClick={() => deleteEducation(e.id)} className="text-gray-500 hover:text-red-500 text-lg leading-none p-1 rounded hover:bg-red-50 transition-colors" title="행 삭제">⊖</button>
                  </div>
                </div>
              ))}
              {educations.length === 0 && (
                <div className="flex justify-center py-2 border-t border-gray-100">
                  <button onClick={addEducation} className="text-gray-500 hover:text-neutral-900 text-lg leading-none p-1.5 rounded hover:bg-neutral-100 transition-colors" title="행 추가">⊕</button>
                </div>
              )}
            </div>
          </section>

          {/* ── 스킬 ─────────────────────────────────────── */}
          <section className="mb-10">
            <SectionHeader title="스킬" />
            <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 border border-gray-200/80 rounded-lg bg-white/60 min-h-[3rem]">
              {skills.map(s => (
                <span key={s.id} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-neutral-100 border border-neutral-200 text-sm text-neutral-800">
                  {s.skill_name}
                  <button onClick={() => deleteSkill(s.id)} className="text-neutral-400 hover:text-red-500 transition-colors leading-none">×</button>
                </span>
              ))}
              <input
                className="flex-1 min-w-[180px] px-2 py-1 text-sm text-gray-700 bg-transparent focus:outline-none"
                value={skillInput}
                onChange={e => setSkillInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addSkillsFromInput(); } }}
                onBlur={() => { if (skillInput.trim()) addSkillsFromInput(); }}
                placeholder="스킬 입력 후 Enter 또는 쉼표(,)"
              />
            </div>
          </section>

          {/* ── 자기소개서 ───────────────────────────────── */}
          <section className="mb-10">
            <SectionHeader
              title="자기소개서"
              right={
                <div className="flex items-center gap-2">
                  <PromptButton onClick={() => openPromptModal('intro')} />
                  <GenerateButton onClick={generateSelfIntroduction} loading={generatingIntro} label="자기소개서 작성" />
                </div>
              }
            />
            <textarea
              rows={16}
              className={inputCls + ' resize-y leading-relaxed'}
              value={profile.self_introduction}
              onChange={e => setProfile(p => ({ ...p, self_introduction: e.target.value }))}
              placeholder={'AI 프롬프트 생성\n- 입력 데이터: 기본정보, 회사 경력, 프로젝트 이력, 학력, 스킬 정보\n- AI 자기소개서 생성: 50줄'}
            />
          </section>

          {/* ── 핵심역량 ─────────────────────────────────── */}
          <section className="mb-2">
            <SectionHeader
              title="핵심역량"
              right={
                <div className="flex items-center gap-2">
                  <PromptButton onClick={() => openPromptModal('competency')} />
                  <GenerateButton onClick={generateCompetencies} loading={generatingCompetency} label="핵심역량 생성" />
                </div>
              }
            />
            <div className="border border-gray-200/80 rounded-lg text-sm overflow-hidden bg-white/50">
              <div className="flex bg-neutral-100 border-b border-neutral-200/70">
                <div className="w-52 shrink-0 px-3 py-2 text-center font-medium text-neutral-900 border-r border-neutral-200/70">역량</div>
                <div className="flex-1 px-3 py-2 text-center font-medium text-neutral-900 border-r border-neutral-200/70">설명</div>
                <div className="w-20 shrink-0 px-2 py-2 text-center font-medium text-neutral-900 whitespace-nowrap">추가/삭제</div>
              </div>
              {competencies.length === 0 && (
                <div className="text-center text-gray-400 text-xs py-8">AI 생성 버튼을 누르거나 + 버튼으로 직접 추가하세요</div>
              )}
              {competencies.map(c => (
                <div key={c.id} className="flex items-center border-b border-gray-100 last:border-0">
                  <div className="w-52 shrink-0 px-2 py-1 border-r border-gray-200/70">
                    <input className={cellInputCls} value={c.title} onChange={e => updateCompetencyLocal(c.id, { title: e.target.value })} onBlur={() => saveCompetency({ ...c, title: c.title })} placeholder="역량명" />
                  </div>
                  <div className="flex-1 px-2 py-1 border-r border-gray-200/70">
                    <textarea rows={1} ref={autoResize} onInput={e => autoResize(e.currentTarget)} className={cellInputCls + ' resize-none overflow-hidden block'} value={c.description ?? ''} onChange={e => updateCompetencyLocal(c.id, { description: e.target.value })} onBlur={() => saveCompetency({ ...c, description: c.description })} placeholder="역량 설명" />
                  </div>
                  <div className="w-20 shrink-0 flex items-center justify-center gap-0.5">
                    <button onClick={addCompetency} className="text-gray-500 hover:text-neutral-900 text-lg leading-none p-1 rounded hover:bg-neutral-100 transition-colors" title="행 추가">⊕</button>
                    <button onClick={() => deleteCompetency(c.id)} className="text-gray-500 hover:text-red-500 text-lg leading-none p-1 rounded hover:bg-red-50 transition-colors" title="행 삭제">⊖</button>
                  </div>
                </div>
              ))}
              {competencies.length === 0 && (
                <div className="flex justify-center py-2 border-t border-gray-100">
                  <button onClick={addCompetency} className="text-gray-500 hover:text-neutral-900 text-lg leading-none p-1.5 rounded hover:bg-neutral-100 transition-colors" title="행 추가">⊕</button>
                </div>
              )}
            </div>
          </section>

          {/* ── 희망직무 ─────────────────────────────────── */}
          <section className="mt-10">
            <SectionHeader title="희망직무" />
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              <div className="flex items-center gap-3">
                <label className="w-24 shrink-0 text-right text-sm font-semibold text-gray-700">희망 직무</label>
                <input className={inputCls} value={profile.desired_job} onChange={e => setProfile(p => ({ ...p, desired_job: e.target.value }))} placeholder="예: 백엔드 개발자" />
              </div>
              <div className="flex items-center gap-3">
                <label className="w-24 shrink-0 text-right text-sm font-semibold text-gray-700">희망 근무지역</label>
                <input className={inputCls} value={profile.desired_location} onChange={e => setProfile(p => ({ ...p, desired_location: e.target.value }))} placeholder="예: 서울 전체" />
              </div>
              <div className="flex items-center gap-3">
                <label className="w-24 shrink-0 text-right text-sm font-semibold text-gray-700">희망 연봉</label>
                <input className={inputCls} value={profile.desired_salary} onChange={e => setProfile(p => ({ ...p, desired_salary: e.target.value }))} placeholder="예: 4,000만원 이상 또는 협의 가능" />
              </div>
              <div className="flex items-center gap-3">
                <label className="w-24 shrink-0 text-right text-sm font-semibold text-gray-700">희망 고용형태</label>
                <select className={selectCls} style={{ maxWidth: '12rem' }} value={profile.desired_employment_type} onChange={e => setProfile(p => ({ ...p, desired_employment_type: e.target.value }))}>
                  <option value="">무관</option>
                  <option value="정규직">정규직</option>
                  <option value="계약직">계약직</option>
                  <option value="인턴">인턴</option>
                  <option value="프리랜서">프리랜서</option>
                </select>
              </div>
              <div className="flex items-center gap-3">
                <label className="w-24 shrink-0 text-right text-sm font-semibold text-gray-700">입사 가능일</label>
                <input className={inputCls} value={profile.available_start_date} onChange={e => setProfile(p => ({ ...p, available_start_date: e.target.value }))} placeholder="예: 즉시입사 가능" />
              </div>
            </div>
          </section>
          </>
          )}

        </div>
      </div>

      {/* ── 엑셀로 추가하기 모달 ──────────────────────────── */}
      {excelImportKind && (
        <ExcelImportModal
          title={excelImportKind === 'career' ? '회사 경력' : '프로젝트 이력'}
          columns={excelImportKind === 'career' ? CAREER_EXCEL_COLUMNS : PROJECT_EXCEL_COLUMNS}
          sampleRow={excelImportKind === 'career' ? CAREER_EXCEL_SAMPLE : PROJECT_EXCEL_SAMPLE}
          onClose={() => setExcelImportKind(null)}
          onConfirm={async (rows) => {
            if (excelImportKind === 'career') await bulkAddCareers(rows);
            else await bulkAddProjects(rows);
            setExcelImportKind(null);
          }}
        />
      )}

      {/* ── AI 프롬프트 편집 모달 ─────────────────────────── */}
      {promptModalKind && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setPromptModalKind(null)}>
          <div className="bg-white rounded-lg shadow-xl w-[720px] max-w-[90vw] max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="shrink-0 flex items-center justify-between px-5 py-3 border-b border-gray-200">
              <span className="text-sm font-bold text-gray-800">
                AI 프롬프트 — {promptModalKind === 'intro' ? '자기소개서' : '핵심역량'}
              </span>
              <button onClick={() => setPromptModalKind(null)} className="text-gray-400 hover:text-gray-700 text-lg leading-none">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <p className="text-xs text-gray-400 mb-2 leading-relaxed">
                {'{{context}}'} 는 기본정보·경력·프로젝트·학력·스킬 요약으로 자동 치환됩니다.
              </p>
              <textarea
                value={promptDraft}
                onChange={e => setPromptDraft(e.target.value)}
                rows={20}
                className="w-full px-3 py-2 border border-gray-200 rounded text-xs font-mono text-gray-700 focus:outline-none focus:border-neutral-500 focus:ring-1 focus:ring-neutral-500 resize-y"
              />
            </div>
            <div className="shrink-0 flex items-center justify-between px-5 py-3 border-t border-gray-200">
              <button
                onClick={() => setPromptDraft(promptModalKind === 'intro' ? DEFAULT_SELF_INTRO_PROMPT : DEFAULT_COMPETENCY_PROMPT)}
                className="text-xs text-gray-500 hover:text-red-500 transition-colors"
              >
                기본값으로 초기화
              </button>
              <div className="flex items-center gap-2">
                <button onClick={() => setPromptModalKind(null)} className="px-4 py-1.5 text-sm text-gray-600 border border-gray-300 rounded hover:bg-gray-50 transition-colors">취소</button>
                <button onClick={savePromptDraft} className="px-4 py-1.5 text-sm text-white bg-neutral-900 rounded hover:bg-neutral-800 transition-colors">저장</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 주소 검색 모달 (Daum 우편번호 서비스) ────────────── */}
      <Script
        src="https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js"
        strategy="afterInteractive"
        onLoad={() => setDaumLoaded(true)}
      />
      {addressModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={closeAddressModal}>
          <div className="bg-white rounded-lg shadow-xl w-[520px] max-w-[92vw] max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="shrink-0 flex items-center justify-between px-5 py-3 border-b border-gray-200">
              <span className="text-sm font-bold text-gray-800">주소 검색</span>
              <button onClick={closeAddressModal} className="text-gray-400 hover:text-gray-700 text-lg leading-none">✕</button>
            </div>
            {!selectedBaseAddress ? (
              <div ref={postcodeContainerRef} style={{ height: 460, width: '100%', position: 'relative' }}>
                {!daumLoaded && (
                  <div className="flex items-center justify-center text-sm text-gray-400" style={{ height: 460 }}>
                    주소 검색을 불러오는 중...
                  </div>
                )}
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4" style={{ minHeight: 200 }}>
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-1">기본주소</p>
                  <p className="text-sm text-gray-800">{selectedBaseAddress}</p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">상세주소</label>
                  <input
                    autoFocus
                    className={inputCls}
                    value={addressDetailDraft}
                    onChange={e => setAddressDetailDraft(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') confirmAddress(); }}
                    placeholder="동/호수 등 상세주소를 입력하세요"
                  />
                </div>
              </div>
            )}
            <div className="shrink-0 flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-200">
              {selectedBaseAddress && (
                <button onClick={() => setSelectedBaseAddress('')} className="text-xs text-gray-500 hover:text-neutral-900 transition-colors mr-auto">
                  다시 검색
                </button>
              )}
              <button onClick={closeAddressModal} className="px-4 py-1.5 text-sm text-gray-600 border border-gray-300 rounded hover:bg-gray-50 transition-colors">취소</button>
              {selectedBaseAddress && (
                <button onClick={confirmAddress} className="px-4 py-1.5 text-sm text-white bg-neutral-900 rounded hover:bg-neutral-800 transition-colors">주소입력</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
