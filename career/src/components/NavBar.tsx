'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { supabase, NavTab, NavTabBuiltinKey } from '@/lib/supabase';

const BUILTIN_ICONS: Record<NavTabBuiltinKey, React.ReactNode> = {
  resume: (
    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  ),
  coverletter: (
    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  jobs: (
    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  ),
};

const BUILTIN_HREF: Record<NavTabBuiltinKey, string> = {
  resume: '/resume',
  coverletter: '/',
  jobs: '/jobs',
};

const CUSTOM_ICON = (
  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
  </svg>
);

const DEFAULT_TABS: { kind: 'builtin'; builtin_key: NavTabBuiltinKey; label: string; sort_order: number }[] = [
  { kind: 'builtin', builtin_key: 'resume',      label: '이력서 관리',          sort_order: 0 },
  { kind: 'builtin', builtin_key: 'coverletter', label: '자기소개서 / 면접 준비', sort_order: 1 },
  { kind: 'builtin', builtin_key: 'jobs',        label: '채용 통합 검색',        sort_order: 2 },
];

function tabHref(tab: NavTab): string {
  return tab.kind === 'builtin' && tab.builtin_key ? BUILTIN_HREF[tab.builtin_key] : `/custom/${tab.id}`;
}
function tabIcon(tab: NavTab): React.ReactNode {
  return tab.kind === 'builtin' && tab.builtin_key ? BUILTIN_ICONS[tab.builtin_key] : CUSTOM_ICON;
}

export default function NavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [tabs, setTabs] = useState<NavTab[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user?.email ?? '');
      if (!session?.user) setTabs([]);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // 탭 조회는 auth 이벤트가 아니라 경로 변화에 연동 — /login에서는 비밀번호 변경 시
  // 현재 비밀번호 검증을 위해 로그인 세션이 잠깐 생겼다 사라지는데, 이를 실제 로그인으로
  // 착각해 탭을 불러오지 않도록 함.
  useEffect(() => {
    if (pathname === '/login') return;
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) fetchTabs();
    });
  }, [pathname]);

  async function fetchTabs() {
    const { data } = await supabase.from('nav_tabs').select('*').order('sort_order');
    if (data && data.length > 0) {
      setTabs(data as NavTab[]);
      return;
    }
    const { data: seeded } = await supabase.from('nav_tabs').insert(DEFAULT_TABS).select();
    if (seeded) setTabs((seeded as NavTab[]).sort((a, b) => a.sort_order - b.sort_order));
  }

  const isActive = (tab: NavTab) => {
    const href = tabHref(tab);
    return href === '/' ? pathname === '/' : pathname.startsWith(href);
  };

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace('/login');
    router.refresh();
  }

  if (pathname === '/login') return null;

  return (
    <>
    <header className="bg-white/60 backdrop-blur-xl border-b border-white/50 shadow-[0_1px_20px_rgba(0,0,0,0.08)] sticky top-0 z-20">
      <div className="flex items-center h-14">
        {/* 앱 로고 — 사이드바(20%) 너비에 맞춤 */}
        <div className="w-[20%] shrink-0 flex items-center gap-2 px-4 border-r border-white/50">
          <div className="w-8 h-8 bg-gradient-to-br from-neutral-900 to-neutral-800 rounded-lg flex items-center justify-center shadow-glow-dark">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <span className="font-black text-gray-900 tracking-tighter">경력 관리</span>
        </div>

        {/* 탭 메뉴 — 본문 영역(80%) 시작점에 맞춤 */}
        <nav className="flex items-center gap-1 px-2">
          {tabs.map(tab => (
            <Link
              key={tab.id}
              href={tabHref(tab)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-extrabold tracking-tight transition-all duration-200 ${
                isActive(tab)
                  ? 'bg-gradient-to-r from-neutral-900/10 to-neutral-800/10 text-neutral-900 shadow-sm ring-1 ring-neutral-900/10'
                  : 'text-gray-600 hover:bg-white/60 hover:text-gray-900'
              }`}
            >
              {tabIcon(tab)}
              {tab.label}
            </Link>
          ))}
          <button
            onClick={() => setSettingsOpen(true)}
            title="탭 설정"
            className="ml-1 p-2 rounded-lg text-gray-400 hover:bg-white/60 hover:text-gray-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </nav>

        {/* 로그인 계정 + 로그아웃 */}
        <div className="ml-auto flex items-center gap-3 px-4">
          {email && <span className="text-xs text-gray-500">{email}</span>}
          <button
            onClick={handleLogout}
            className="text-xs text-gray-600 border border-gray-200/80 rounded-md px-3 py-1.5 hover:border-neutral-500 hover:text-neutral-900 hover:bg-neutral-100/60 transition-colors"
          >
            로그아웃
          </button>
        </div>
      </div>
    </header>

    {settingsOpen && (
      <NavTabsSettingsModal
        tabs={tabs}
        onChange={setTabs}
        onClose={() => setSettingsOpen(false)}
      />
    )}
    </>
  );
}

function NavTabsSettingsModal({
  tabs, onChange, onClose,
}: {
  tabs: NavTab[];
  onChange: (tabs: NavTab[]) => void;
  onClose: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState('');

  async function renameTab(id: string, label: string) {
    onChange(tabs.map(t => t.id === id ? { ...t, label } : t));
  }

  async function persistLabel(id: string, label: string) {
    await supabase.from('nav_tabs').update({ label }).eq('id', id);
  }

  async function moveTab(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= tabs.length) return;
    const reordered = [...tabs];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    const updated = reordered.map((t, i) => ({ ...t, sort_order: i }));
    onChange(updated);
    await Promise.all([
      supabase.from('nav_tabs').update({ sort_order: updated[index].sort_order }).eq('id', updated[index].id),
      supabase.from('nav_tabs').update({ sort_order: updated[target].sort_order }).eq('id', updated[target].id),
    ]);
  }

  async function deleteTab(id: string) {
    await supabase.from('nav_tabs').delete().eq('id', id);
    onChange(tabs.filter(t => t.id !== id));
  }

  async function addTab() {
    const label = newLabel.trim();
    if (!label) return;
    const { data } = await supabase
      .from('nav_tabs')
      .insert({ kind: 'custom', label, sort_order: tabs.length })
      .select()
      .single();
    if (data) onChange([...tabs, data as NavTab]);
    setNewLabel('');
    setAdding(false);
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-[420px] max-w-[92vw] max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="shrink-0 flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <span className="text-sm font-bold text-gray-800">탭 설정</span>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-lg leading-none">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
          {tabs.map((tab, i) => (
            <div key={tab.id} className="flex items-center gap-2">
              <div className="flex flex-col">
                <button
                  onClick={() => moveTab(i, -1)}
                  disabled={i === 0}
                  className="text-gray-400 hover:text-neutral-900 disabled:opacity-20 disabled:hover:text-gray-400 leading-none text-xs px-1"
                  title="위로"
                >
                  ▲
                </button>
                <button
                  onClick={() => moveTab(i, 1)}
                  disabled={i === tabs.length - 1}
                  className="text-gray-400 hover:text-neutral-900 disabled:opacity-20 disabled:hover:text-gray-400 leading-none text-xs px-1"
                  title="아래로"
                >
                  ▼
                </button>
              </div>
              <input
                value={tab.label}
                onChange={e => renameTab(tab.id, e.target.value)}
                onBlur={e => persistLabel(tab.id, e.target.value)}
                className="flex-1 px-3 py-1.5 border border-gray-200/80 bg-white/60 rounded-lg text-sm text-gray-700 focus:outline-none focus:border-neutral-500 focus:ring-1 focus:ring-neutral-500 transition-colors"
              />
              {tab.kind === 'custom' ? (
                <button
                  onClick={() => deleteTab(tab.id)}
                  className="text-gray-400 hover:text-red-500 text-lg leading-none p-1 rounded hover:bg-red-50 transition-colors"
                  title="탭 삭제"
                >
                  ⊖
                </button>
              ) : (
                <span className="w-6" />
              )}
            </div>
          ))}

          {adding ? (
            <div className="flex items-center gap-2 pt-1">
              <input
                autoFocus
                value={newLabel}
                onChange={e => setNewLabel(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addTab(); if (e.key === 'Escape') { setAdding(false); setNewLabel(''); } }}
                placeholder="새 탭 이름"
                className="flex-1 px-3 py-1.5 border border-gray-200/80 bg-white/60 rounded-lg text-sm text-gray-700 focus:outline-none focus:border-neutral-500 focus:ring-1 focus:ring-neutral-500 transition-colors"
              />
              <button onClick={addTab} className="text-xs text-white bg-neutral-900 rounded-md px-3 py-1.5 hover:bg-neutral-800 transition-colors">추가</button>
            </div>
          ) : (
            <button
              onClick={() => setAdding(true)}
              className="w-full text-xs text-gray-600 border border-dashed border-gray-300 rounded-lg py-2 hover:border-neutral-500 hover:text-neutral-900 transition-colors mt-1"
            >
              + 새 탭 추가
            </button>
          )}
        </div>

        <div className="shrink-0 flex items-center justify-end px-5 py-3 border-t border-gray-200">
          <button onClick={onClose} className="px-4 py-1.5 text-sm text-white bg-neutral-900 rounded hover:bg-neutral-800 transition-colors">닫기</button>
        </div>
      </div>
    </div>
  );
}
