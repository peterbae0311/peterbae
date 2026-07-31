'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { APPS, SUPER_ADMIN_EMAIL } from '@/lib/apps';

interface AccessRow {
  email: string;
  app_key: string;
}

interface LoginHistoryRow {
  id: string;
  login_id: string;
  login_at: string;
  logout_at: string | null;
  result: 'success' | 'fail';
  fail_reason: string | null;
  ip_address: string | null;
  region_country: string | null;
  os: string | null;
  browser: string | null;
  device: string | null;
  created_at: string;
}

const PAGE_SIZE = 50;

function formatDateTime(value: string | null): string {
  if (!value) return '-';
  return new Date(value).toLocaleString('ko-KR', { hour12: false });
}

export default function AdminPage() {
  const [viewerEmail, setViewerEmail] = useState<string | null | undefined>(undefined);
  const [tab, setTab] = useState<'access' | 'history'>('access');

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setViewerEmail(user?.email ?? null);
    })();
  }, []);

  if (viewerEmail === undefined) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-gray-400">불러오는 중...</div>;
  }

  if (viewerEmail !== SUPER_ADMIN_EMAIL) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-[420px] bg-white/70 backdrop-blur-xl border border-white/50 rounded-2xl shadow-[0_1px_20px_rgba(0,0,0,0.08)] p-10 text-center">
          <h1 className="text-xl font-extrabold tracking-tight text-neutral-900 mb-2">접근 권한이 없습니다</h1>
          <p className="text-sm text-gray-500">Admin 기능은 최고관리자 계정만 사용할 수 있습니다.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-10">
      <div className="max-w-[1500px] mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-black tracking-tighter text-neutral-900">Admin</h1>
          <a href="/dashboard" className="text-xs text-gray-600 border border-gray-200/80 rounded-lg px-3 py-2 hover:border-neutral-500 hover:text-neutral-900 hover:bg-neutral-100/60 transition-colors">
            대시보드로
          </a>
        </div>

        <div className="flex items-center gap-1 border-b border-gray-200">
          <button
            onClick={() => setTab('access')}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
              tab === 'access' ? 'border-neutral-900 text-neutral-900' : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            이메일별 접근 권한 관리
          </button>
          <button
            onClick={() => setTab('history')}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
              tab === 'history' ? 'border-neutral-900 text-neutral-900' : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            로그인 이력 관리
          </button>
        </div>

        {tab === 'access' ? <AccessTab /> : <LoginHistoryTab />}
      </div>
    </div>
  );
}

function AccessTab() {
  const [rows, setRows] = useState<AccessRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [registeredEmails, setRegisteredEmails] = useState<string[]>([]);
  const [emailsError, setEmailsError] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editKeys, setEditKeys] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');

  const loadRows = useCallback(async () => {
    const { data } = await supabase.from('app_access').select('email, app_key').order('email');
    setRows((data ?? []) as AccessRow[]);
    setLoading(false);
  }, []);

  const loadRegisteredEmails = useCallback(async () => {
    const res = await fetch('/api/admin/users');
    const data = await res.json();
    if (!res.ok) {
      setEmailsError(data.error ?? '이메일 목록을 불러오지 못했습니다.');
      return;
    }
    setRegisteredEmails(data.emails as string[]);
  }, []);

  useEffect(() => {
    loadRows();
    loadRegisteredEmails();
  }, [loadRows, loadRegisteredEmails]);

  const grouped = rows.reduce<Record<string, string[]>>((acc, r) => {
    (acc[r.email] ??= []).push(r.app_key);
    return acc;
  }, {});

  function loadEmailIntoForm(email: string, keys: string[]) {
    setEditEmail(email);
    setEditKeys(new Set(keys));
    setNotice('');
  }

  function toggleKey(key: string) {
    setEditKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  async function saveGrants() {
    const email = editEmail.trim().toLowerCase();
    if (!email) return;
    setSaving(true);
    setNotice('');

    await supabase.from('app_access').delete().eq('email', email);

    if (editKeys.size > 0) {
      const { error } = await supabase
        .from('app_access')
        .insert(Array.from(editKeys).map(app_key => ({ email, app_key })));
      if (error) {
        setNotice(`저장 실패: ${error.message}`);
        setSaving(false);
        return;
      }
    }

    setNotice(`${email} 저장 완료.`);
    setSaving(false);
    await loadRows();
  }

  async function removeEmail(email: string) {
    if (!confirm(`${email}의 접근 권한을 전부 제거하시겠습니까?`)) return;
    await supabase.from('app_access').delete().eq('email', email);
    if (editEmail === email) { setEditEmail(''); setEditKeys(new Set()); }
    await loadRows();
  }

  if (loading) {
    return <p className="text-sm text-gray-400 py-6">불러오는 중...</p>;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[500px_1fr] gap-6 items-start">
      {/* 편집 폼 */}
      <section className="rounded-2xl border border-white/60 bg-white/70 backdrop-blur-xl shadow-glass p-6">
        {editEmail && (
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
            지금 수정 중: {editEmail}
          </div>
        )}
        <label className="text-sm font-semibold text-gray-700 mb-1.5 block">이메일</label>
        <select
          value={editEmail}
          onChange={e => { setEditEmail(e.target.value); setNotice(''); }}
          className="w-full mb-5 px-4 py-2.5 border border-gray-200/80 bg-white/60 rounded-lg text-base text-gray-700 focus:outline-none focus:border-neutral-500 focus:ring-1 focus:ring-neutral-500 transition-colors"
        >
          <option value="">이메일 선택...</option>
          {registeredEmails.map(email => (
            <option key={email} value={email}>{email}</option>
          ))}
        </select>
        {emailsError && <p className="text-sm text-red-500 -mt-3 mb-5">{emailsError}</p>}
        {!emailsError && registeredEmails.length === 0 && (
          <p className="text-sm text-gray-400 -mt-3 mb-5">
            {SUPER_ADMIN_EMAIL} 외에 등록된 계정이 아직 없습니다. Supabase에서 계정을 먼저 생성해주세요.
          </p>
        )}

        <p className="text-sm font-semibold text-gray-700 mb-2">접근 허용할 모노레포</p>
        <div className="grid grid-cols-2 gap-2 mb-5">
          {APPS.map(app => (
            <label
              key={app.key}
              className="flex items-center gap-2 text-sm text-gray-700 border border-gray-200/70 rounded-lg px-3 py-2 cursor-pointer hover:bg-neutral-50"
            >
              <input
                type="checkbox"
                checked={editKeys.has(app.key)}
                onChange={() => toggleKey(app.key)}
                className="w-4 h-4 accent-neutral-900"
              />
              {app.label}
            </label>
          ))}
        </div>

        {notice && <p className="text-sm text-green-600 mb-3">{notice}</p>}

        <button
          onClick={saveGrants}
          disabled={saving || !editEmail.trim()}
          className="px-4 py-2 bg-gradient-to-r from-neutral-900 to-neutral-800 text-white text-sm font-medium rounded-lg shadow-glow-dark hover:shadow-lg hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:shadow-glow-dark disabled:hover:translate-y-0 transition-all duration-200"
        >
          {saving ? '저장 중...' : '저장'}
        </button>
      </section>

      {/* 현재 권한 목록 */}
      <section>
        <h2 className="text-sm font-bold text-gray-700 mb-3">현재 권한 부여 현황</h2>
        {Object.keys(grouped).length === 0 ? (
          <p className="text-sm text-gray-400">
            {SUPER_ADMIN_EMAIL} 외에는 아직 권한이 부여된 계정이 없습니다.
          </p>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {Object.entries(grouped).map(([email, keys]) => (
              <li
                key={email}
                className={`flex items-center justify-between gap-3 rounded-xl border backdrop-blur-xl shadow-glass px-5 py-3 transition-colors ${
                  email === editEmail
                    ? 'border-amber-300 bg-amber-50/80 ring-1 ring-amber-300'
                    : 'border-white/60 bg-white/70'
                }`}
              >
                <div className="min-w-0">
                  <p className="font-bold text-neutral-900 truncate">{email}</p>
                  <p className="text-xs text-gray-500 truncate">
                    {keys.map(k => APPS.find(a => a.key === k)?.label ?? k).join(', ')}
                  </p>
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  <button
                    onClick={() => loadEmailIntoForm(email, keys)}
                    className="text-xs text-gray-600 border border-gray-200/80 rounded-lg px-3 py-2 hover:border-neutral-500 hover:text-neutral-900 hover:bg-neutral-100/60 transition-colors"
                  >
                    수정
                  </button>
                  <button
                    onClick={() => removeEmail(email)}
                    className="text-xs text-gray-600 border border-gray-200/80 rounded-lg px-3 py-2 hover:border-red-400 hover:text-red-500 hover:bg-red-50/60 transition-colors"
                  >
                    전체 제거
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function LoginHistoryTab() {
  const [rows, setRows] = useState<LoginHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  const load = useCallback(async (p: number) => {
    setLoading(true);
    const from = p * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data, count } = await supabase
      .from('login_history')
      .select('*', { count: 'exact' })
      .order('login_at', { ascending: false })
      .range(from, to);
    setRows((data ?? []) as LoginHistoryRow[]);
    setTotalCount(count ?? 0);
    setLoading(false);
  }, []);

  useEffect(() => { load(page); }, [load, page]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <section className="rounded-2xl border border-white/60 bg-white/70 backdrop-blur-xl shadow-glass overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
              <th className="px-4 py-3 font-semibold">접속 ID</th>
              <th className="px-4 py-3 font-semibold">로그인 일시</th>
              <th className="px-4 py-3 font-semibold">로그아웃 일시</th>
              <th className="px-4 py-3 font-semibold">접속결과</th>
              <th className="px-4 py-3 font-semibold">실패사유</th>
              <th className="px-4 py-3 font-semibold">IP주소</th>
              <th className="px-4 py-3 font-semibold">접속지역/국가</th>
              <th className="px-4 py-3 font-semibold">OS</th>
              <th className="px-4 py-3 font-semibold">브라우저</th>
              <th className="px-4 py-3 font-semibold">디바이스</th>
              <th className="px-4 py-3 font-semibold">생성일시</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={11} className="px-4 py-8 text-center text-gray-400">불러오는 중...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={11} className="px-4 py-8 text-center text-gray-400">로그인 이력이 없습니다.</td></tr>
            ) : (
              rows.map(row => (
                <tr key={row.id} className="border-b border-gray-100 last:border-0 hover:bg-neutral-50/60">
                  <td className="px-4 py-2.5 font-medium text-neutral-900">{row.login_id}</td>
                  <td className="px-4 py-2.5 text-gray-600">{formatDateTime(row.login_at)}</td>
                  <td className="px-4 py-2.5 text-gray-600">{formatDateTime(row.logout_at)}</td>
                  <td className="px-4 py-2.5">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                      row.result === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {row.result === 'success' ? '성공' : '실패'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-500">{row.fail_reason ?? '-'}</td>
                  <td className="px-4 py-2.5 text-gray-600">{row.ip_address ?? '-'}</td>
                  <td className="px-4 py-2.5 text-gray-600">{row.region_country ?? '-'}</td>
                  <td className="px-4 py-2.5 text-gray-600">{row.os ?? '-'}</td>
                  <td className="px-4 py-2.5 text-gray-600">{row.browser ?? '-'}</td>
                  <td className="px-4 py-2.5 text-gray-600">{row.device ?? '-'}</td>
                  <td className="px-4 py-2.5 text-gray-500">{formatDateTime(row.created_at)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 text-xs text-gray-500">
        <span>전체 {totalCount}건</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-3 py-2 border border-gray-200/80 rounded-lg hover:border-neutral-500 hover:text-neutral-900 disabled:opacity-30 transition-colors"
          >
            이전
          </button>
          <span>{page + 1} / {totalPages}</span>
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="px-3 py-2 border border-gray-200/80 rounded-lg hover:border-neutral-500 hover:text-neutral-900 disabled:opacity-30 transition-colors"
          >
            다음
          </button>
        </div>
      </div>
    </section>
  );
}
