'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { APPS, SUPER_ADMIN_EMAIL } from '@/lib/apps';

interface Account {
  id: string;
  email: string;
  name: string;
  note: string;
  createdAt: string;
  appKeys: string[];
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

const PAGE_SIZE = 15;

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
    <div className="min-h-screen px-[10px] py-10">
      <div className="space-y-6">
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
            시스템 접속 가능 계정 관리
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

        {tab === 'access' ? <AccountsTab /> : <LoginHistoryTab />}
      </div>
    </div>
  );
}

const emptyForm = { id: '', name: '', email: '', note: '' };

function AccountsTab() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [editKeys, setEditKeys] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [noticeIsError, setNoticeIsError] = useState(false);

  const isEditing = !!form.id;

  const loadAccounts = useCallback(async () => {
    const res = await fetch('/api/admin/accounts');
    const data = await res.json();
    if (!res.ok) {
      setLoadError(data.error ?? '계정 목록을 불러오지 못했습니다.');
      setLoading(false);
      return;
    }
    setAccounts(data.accounts as Account[]);
    setLoadError('');
    setLoading(false);
  }, []);

  useEffect(() => { loadAccounts(); }, [loadAccounts]);

  function resetForm() {
    setForm(emptyForm);
    setEditKeys(new Set());
    setNotice('');
  }

  function loadAccountIntoForm(account: Account) {
    setForm({ id: account.id, name: account.name, email: account.email, note: account.note });
    setEditKeys(new Set(account.appKeys));
    setNotice('');
  }

  function toggleKey(key: string) {
    setEditKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  async function saveAccount() {
    const email = form.email.trim().toLowerCase();
    if (!email) return;
    setSaving(true);
    setNotice('');

    const payload = {
      id: form.id || undefined,
      name: form.name.trim(),
      email,
      note: form.note.trim(),
      appKeys: Array.from(editKeys),
    };

    const res = await fetch('/api/admin/accounts', {
      method: isEditing ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setSaving(false);

    if (!res.ok) {
      setNoticeIsError(true);
      setNotice(data.error ?? '저장에 실패했습니다.');
      return;
    }

    setNoticeIsError(false);
    setNotice(`${email} 저장 완료.`);
    resetForm();
    await loadAccounts();
  }

  async function deleteAccount(account: Account) {
    if (!confirm(`${account.email} 계정을 삭제하시겠습니까?\n부여된 모노레포 접근 권한도 모두 함께 삭제됩니다.`)) return;
    const res = await fetch(`/api/admin/accounts?id=${encodeURIComponent(account.id)}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error ?? '삭제에 실패했습니다.');
      return;
    }
    if (form.id === account.id) resetForm();
    await loadAccounts();
  }

  if (loading) {
    return <p className="text-sm text-gray-400 py-6">불러오는 중...</p>;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[500px_1fr] gap-6 items-start">
      {/* 생성/수정 폼 */}
      <section className="rounded-2xl border border-white/60 bg-white/70 backdrop-blur-xl shadow-glass p-6">
        {isEditing ? (
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
            지금 수정 중: {form.email}
          </div>
        ) : (
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-neutral-700 bg-neutral-100 border border-gray-200 rounded-lg px-3 py-2">
            새 계정 생성
          </div>
        )}

        <label className="text-sm font-semibold text-gray-700 mb-1.5 block">성명</label>
        <input
          type="text"
          value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          placeholder="이름을 입력하세요"
          className="w-full mb-4 px-4 py-2.5 border border-gray-200/80 bg-white/60 rounded-lg text-base text-gray-700 focus:outline-none focus:border-neutral-500 focus:ring-1 focus:ring-neutral-500 transition-colors"
        />

        <label className="text-sm font-semibold text-gray-700 mb-1.5 block">이메일</label>
        <input
          type="email"
          value={form.email}
          onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
          placeholder="email@example.com"
          className="w-full mb-4 px-4 py-2.5 border border-gray-200/80 bg-white/60 rounded-lg text-base text-gray-700 focus:outline-none focus:border-neutral-500 focus:ring-1 focus:ring-neutral-500 transition-colors"
        />

        <label className="text-sm font-semibold text-gray-700 mb-1.5 block">비고</label>
        <input
          type="text"
          value={form.note}
          onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
          placeholder="비고 (선택)"
          className="w-full mb-5 px-4 py-2.5 border border-gray-200/80 bg-white/60 rounded-lg text-base text-gray-700 focus:outline-none focus:border-neutral-500 focus:ring-1 focus:ring-neutral-500 transition-colors"
        />

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

        {notice && (
          <p className={`text-sm mb-3 ${noticeIsError ? 'text-red-500' : 'text-green-600'}`}>{notice}</p>
        )}

        <div className="flex items-center gap-2">
          <button
            onClick={saveAccount}
            disabled={saving || !form.email.trim()}
            className="px-3 py-2 text-xs text-gray-600 border border-gray-200/80 rounded-lg hover:border-neutral-500 hover:text-neutral-900 hover:bg-neutral-100/60 disabled:opacity-50 transition-colors"
          >
            {saving ? '저장 중...' : isEditing ? '수정 저장' : '계정 생성'}
          </button>
          {isEditing && (
            <button
              onClick={resetForm}
              className="px-3 py-2 text-xs text-gray-600 border border-gray-200/80 rounded-lg hover:border-neutral-500 hover:text-neutral-900 hover:bg-neutral-100/60 transition-colors"
            >
              취소 (새 계정 생성으로)
            </button>
          )}
        </div>
      </section>

      {/* 계정 목록 */}
      <section>
        <h2 className="text-sm font-bold text-gray-700 mb-3">등록된 계정 ({accounts.length})</h2>
        {loadError && <p className="text-sm text-red-500 mb-3">{loadError}</p>}
        {accounts.length === 0 ? (
          <p className="text-sm text-gray-400">
            {SUPER_ADMIN_EMAIL} 외에는 아직 등록된 계정이 없습니다.
          </p>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {accounts.map(account => (
              <li
                key={account.id}
                className={`flex items-center justify-between gap-3 rounded-xl border backdrop-blur-xl shadow-glass px-5 py-3 transition-colors ${
                  account.id === form.id
                    ? 'border-amber-300 bg-amber-50/80 ring-1 ring-amber-300'
                    : 'border-white/60 bg-white/70'
                }`}
              >
                <div className="min-w-0">
                  <p className="font-bold text-neutral-900 truncate">
                    {account.name || '(성명 없음)'} <span className="font-normal text-gray-500">· {account.email}</span>
                  </p>
                  {account.note && <p className="text-xs text-gray-500 truncate">{account.note}</p>}
                  <p className="text-xs text-gray-500 truncate">
                    {account.appKeys.length > 0
                      ? account.appKeys.map(k => APPS.find(a => a.key === k)?.label ?? k).join(', ')
                      : '접근 권한 없음'}
                  </p>
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  <button
                    onClick={() => loadAccountIntoForm(account)}
                    className="text-xs text-gray-600 border border-gray-200/80 rounded-lg px-3 py-2 hover:border-neutral-500 hover:text-neutral-900 hover:bg-neutral-100/60 transition-colors"
                  >
                    수정
                  </button>
                  <button
                    onClick={() => deleteAccount(account)}
                    className="text-xs text-gray-600 border border-gray-200/80 rounded-lg px-3 py-2 hover:border-red-400 hover:text-red-500 hover:bg-red-50/60 transition-colors"
                  >
                    삭제
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
              <th className="sticky top-0 z-10 bg-white px-4 py-3 font-semibold">접속 ID</th>
              <th className="sticky top-0 z-10 bg-white px-4 py-3 font-semibold">로그인 일시</th>
              <th className="sticky top-0 z-10 bg-white px-4 py-3 font-semibold">로그아웃 일시</th>
              <th className="sticky top-0 z-10 bg-white px-4 py-3 font-semibold">접속결과</th>
              <th className="sticky top-0 z-10 bg-white px-4 py-3 font-semibold">실패사유</th>
              <th className="sticky top-0 z-10 bg-white px-4 py-3 font-semibold">IP주소</th>
              <th className="sticky top-0 z-10 bg-white px-4 py-3 font-semibold">접속지역/국가</th>
              <th className="sticky top-0 z-10 bg-white px-4 py-3 font-semibold">OS</th>
              <th className="sticky top-0 z-10 bg-white px-4 py-3 font-semibold">브라우저</th>
              <th className="sticky top-0 z-10 bg-white px-4 py-3 font-semibold">디바이스</th>
              <th className="sticky top-0 z-10 bg-white px-4 py-3 font-semibold">생성일시</th>
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
