'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { APPS, SUPER_ADMIN_EMAIL, fullUrl } from '@/lib/apps';

export default function DashboardPage() {
  const [email, setEmail] = useState<string | null>(null);
  const [allowedKeys, setAllowedKeys] = useState<Set<string> | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const userEmail = user?.email ?? null;
      setEmail(userEmail);

      if (!userEmail) return;

      if (userEmail === SUPER_ADMIN_EMAIL) {
        setAllowedKeys(new Set(APPS.map(a => a.key)));
        return;
      }

      const { data } = await supabase
        .from('app_access')
        .select('app_key')
        .eq('email', userEmail);

      setAllowedKeys(new Set((data ?? []).map(r => r.app_key as string)));
    })();
  }, []);

  async function copyUrl(key: string, path: string) {
    await navigator.clipboard.writeText(fullUrl(path));
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(k => (k === key ? null : k)), 1500);
  }

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = '/login';
  }

  const isSuperAdmin = email === SUPER_ADMIN_EMAIL;
  const visibleApps = allowedKeys ? APPS.filter(a => allowedKeys.has(a.key)) : [];

  return (
    <div className="min-h-screen px-4 py-10">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-black tracking-tighter text-neutral-900">모노레포</h1>
            <p className="text-sm text-gray-500 mt-1">{email}로 로그인됨</p>
          </div>
          <div className="flex items-center gap-2">
            {isSuperAdmin && (
              <Link
                href="/admin"
                className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-neutral-900 to-neutral-800 rounded-lg shadow-glow-dark hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
              >
                Admin
              </Link>
            )}
            <button
              onClick={logout}
              className="text-xs text-gray-600 border border-gray-200/80 rounded-md px-3 py-2 hover:border-neutral-500 hover:text-neutral-900 hover:bg-neutral-100/60 transition-colors"
            >
              로그아웃
            </button>
          </div>
        </div>

        {allowedKeys === null ? (
          <p className="text-sm text-gray-400">불러오는 중...</p>
        ) : visibleApps.length === 0 ? (
          <div className="rounded-2xl border border-white/60 bg-white/70 backdrop-blur-xl shadow-glass p-10 text-center text-gray-400 text-sm">
            아직 접근 권한이 부여된 항목이 없습니다.<br />관리자에게 문의하세요.
          </div>
        ) : (
          <ul className="space-y-2">
            {visibleApps.map(app => (
              <li
                key={app.key}
                className="flex items-center justify-between gap-3 rounded-xl border border-white/60 bg-white/70 backdrop-blur-xl shadow-glass px-5 py-4"
              >
                <a
                  href={app.path}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 font-bold text-neutral-900 hover:underline truncate"
                >
                  {app.label}
                </a>
                <span className="text-xs text-gray-400 truncate max-w-[220px] hidden sm:inline">
                  {app.path}
                </span>
                <button
                  onClick={() => copyUrl(app.key, app.path)}
                  className="shrink-0 text-xs text-gray-600 border border-gray-200/80 rounded-md px-3 py-1.5 hover:border-neutral-500 hover:text-neutral-900 hover:bg-neutral-100/60 transition-colors"
                >
                  {copiedKey === app.key ? '복사됨' : 'URL 복사'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
