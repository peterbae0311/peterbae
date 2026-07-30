'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { APPS, SUPER_ADMIN_EMAIL } from '@/lib/apps';

interface AccessRow {
  email: string;
  app_key: string;
}

export default function AdminPage() {
  const [viewerEmail, setViewerEmail] = useState<string | null | undefined>(undefined);
  const [rows, setRows] = useState<AccessRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editEmail, setEditEmail] = useState('');
  const [editKeys, setEditKeys] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');

  const loadRows = useCallback(async () => {
    const { data } = await supabase.from('app_access').select('email, app_key').order('email');
    setRows((data ?? []) as AccessRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setViewerEmail(user?.email ?? null);
    })();
    loadRows();
  }, [loadRows]);

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

  if (viewerEmail === undefined || loading) {
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
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-black tracking-tighter text-neutral-900">이메일별 접근 권한 관리</h1>
          <a href="/dashboard" className="text-xs text-gray-600 border border-gray-200/80 rounded-md px-3 py-1.5 hover:border-neutral-500 hover:text-neutral-900 hover:bg-neutral-100/60 transition-colors">
            대시보드로
          </a>
        </div>

        {/* 편집 폼 */}
        <section className="rounded-2xl border border-white/60 bg-white/70 backdrop-blur-xl shadow-glass p-6">
          <label className="text-sm font-semibold text-gray-700 mb-1.5 block">이메일</label>
          <input
            type="email"
            value={editEmail}
            onChange={e => setEditEmail(e.target.value)}
            placeholder="user@example.com"
            className="w-full mb-5 px-4 py-2.5 border border-gray-200/80 bg-white/60 rounded-lg text-base text-gray-700 focus:outline-none focus:border-neutral-500 focus:ring-1 focus:ring-neutral-500 transition-colors"
          />

          <p className="text-sm font-semibold text-gray-700 mb-2">접근 허용할 모노레포</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-5">
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
            className="px-6 py-2 bg-gradient-to-r from-neutral-900 to-neutral-800 text-white text-sm font-medium rounded-lg shadow-glow-dark hover:shadow-lg disabled:opacity-50 transition-all duration-200"
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
            <ul className="space-y-2">
              {Object.entries(grouped).map(([email, keys]) => (
                <li
                  key={email}
                  className="flex items-center justify-between gap-3 rounded-xl border border-white/60 bg-white/70 backdrop-blur-xl shadow-glass px-5 py-3"
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
                      className="text-xs text-gray-600 border border-gray-200/80 rounded-md px-3 py-1.5 hover:border-neutral-500 hover:text-neutral-900 hover:bg-neutral-100/60 transition-colors"
                    >
                      수정
                    </button>
                    <button
                      onClick={() => removeEmail(email)}
                      className="text-xs text-gray-600 border border-gray-200/80 rounded-md px-3 py-1.5 hover:border-red-400 hover:text-red-500 hover:bg-red-50/60 transition-colors"
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
    </div>
  );
}
