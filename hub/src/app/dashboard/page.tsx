'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { APPS, SUPER_ADMIN_EMAIL, fullUrl } from '@/lib/apps';
import { decodeSessionId } from '@/lib/jwt';

interface CardOverride {
  app_key: string;
  custom_label: string | null;
  custom_description: string | null;
  sort_order: number;
}

interface CardData {
  key: string;
  path: string;
  label: string;
  description: string;
  sortOrder: number;
}

export default function DashboardPage() {
  const [email, setEmail] = useState<string | null>(null);
  const [allowedKeys, setAllowedKeys] = useState<Set<string> | null>(null);
  const [overrides, setOverrides] = useState<Record<string, CardOverride>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [orderedCards, setOrderedCards] = useState<CardData[] | null>(null);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  const loadOverrides = useCallback(async (userEmail: string) => {
    const { data } = await supabase
      .from('dashboard_cards')
      .select('app_key, custom_label, custom_description, sort_order')
      .eq('email', userEmail);
    const map: Record<string, CardOverride> = {};
    (data ?? []).forEach(row => { map[row.app_key as string] = row as CardOverride; });
    setOverrides(map);
  }, []);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const userEmail = user?.email ?? null;
      setEmail(userEmail);

      if (!userEmail) return;

      if (userEmail === SUPER_ADMIN_EMAIL) {
        setAllowedKeys(new Set(APPS.map(a => a.key)));
      } else {
        const { data } = await supabase
          .from('app_access')
          .select('app_key')
          .eq('email', userEmail);
        setAllowedKeys(new Set((data ?? []).map(r => r.app_key as string)));
      }

      await loadOverrides(userEmail);
    })();
  }, [loadOverrides]);

  async function copyUrl(key: string, path: string) {
    await navigator.clipboard.writeText(fullUrl(path));
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(k => (k === key ? null : k)), 1500);
  }

  async function logout() {
    const { data: { session } } = await supabase.auth.getSession();
    const sessionId = session ? decodeSessionId(session.access_token) : null;
    if (sessionId) {
      // signOut 전에 보내야 세션 쿠키가 아직 유효 — 실패해도 로그아웃 자체는 계속 진행.
      await fetch('/api/auth/logout-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      }).catch(() => {});
    }
    await supabase.auth.signOut();
    window.location.href = '/login';
  }

  const isSuperAdmin = email === SUPER_ADMIN_EMAIL;

  const cards: CardData[] = (allowedKeys ? APPS.filter(a => allowedKeys.has(a.key)) : [])
    .map((app, i) => {
      const o = overrides[app.key];
      return {
        key: app.key,
        path: app.path,
        label: o?.custom_label || app.label,
        description: o?.custom_description || '',
        sortOrder: o?.sort_order ?? i,
      };
    })
    .sort((a, b) => a.sortOrder - b.sortOrder);

  // allowedKeys/overrides가 새로 로드될 때만 드래그 순서를 다시 씌운다 —
  // 드래그 중 리렌더로 orderedCards가 튀지 않도록 별도 state로 분리.
  useEffect(() => {
    if (allowedKeys === null) return;
    setOrderedCards(cards);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowedKeys, overrides]);

  async function persistCardOrder(next: CardData[]) {
    if (!email) return;
    const payload = next.map((c, i) => ({
      email,
      app_key: c.key,
      custom_label: c.label.trim() || null,
      custom_description: c.description.trim() || null,
      sort_order: i,
    }));
    await supabase.from('dashboard_cards').upsert(payload, { onConflict: 'email,app_key' });
    await loadOverrides(email);
  }

  function handleCardDrop(targetKey: string) {
    if (!orderedCards || !dragKey || dragKey === targetKey) return;
    const from = orderedCards.findIndex(c => c.key === dragKey);
    const to = orderedCards.findIndex(c => c.key === targetKey);
    if (from === -1 || to === -1) return;
    const next = [...orderedCards];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setOrderedCards(next);
    persistCardOrder(next);
  }

  return (
    <div className="min-h-screen px-4 py-10">
      <div className="max-w-[1500px] mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-black tracking-tighter text-neutral-900">모노레포</h1>
            <p className="text-sm text-gray-500 mt-1">{email}로 로그인됨</p>
          </div>
          <div className="flex items-center gap-2">
            {cards.length > 0 && (
              <button
                onClick={() => setSettingsOpen(true)}
                className="text-xs text-gray-600 border border-gray-200/80 rounded-lg px-3 py-2 hover:border-neutral-500 hover:text-neutral-900 hover:bg-neutral-100/60 transition-colors"
              >
                카드 설정
              </button>
            )}
            {isSuperAdmin && (
              <Link
                href="/admin"
                className="text-xs text-gray-600 border border-gray-200/80 rounded-lg px-3 py-2 hover:border-neutral-500 hover:text-neutral-900 hover:bg-neutral-100/60 transition-colors"
              >
                Admin
              </Link>
            )}
            <button
              onClick={logout}
              className="text-xs text-gray-600 border border-gray-200/80 rounded-lg px-3 py-2 hover:border-neutral-500 hover:text-neutral-900 hover:bg-neutral-100/60 transition-colors"
            >
              로그아웃
            </button>
          </div>
        </div>

        {allowedKeys === null || orderedCards === null ? (
          <p className="text-sm text-gray-400">불러오는 중...</p>
        ) : orderedCards.length === 0 ? (
          <div className="rounded-2xl border border-white/60 bg-white/70 backdrop-blur-xl shadow-glass p-10 text-center text-gray-400 text-sm">
            아직 접근 권한이 부여된 항목이 없습니다.<br />관리자에게 문의하세요.
          </div>
        ) : (
          <div
            className={
              orderedCards.length <= 3
                ? 'flex flex-wrap justify-center gap-x-[33px] gap-y-4'
                : 'grid gap-x-[33px] gap-y-4'
            }
            style={orderedCards.length <= 3 ? undefined : { gridTemplateColumns: 'repeat(4, 350px)' }}
          >
            {orderedCards.map(card => (
              <div
                key={card.key}
                draggable
                onDragStart={() => setDragKey(card.key)}
                onDragEnter={() => setDragOverKey(card.key)}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); handleCardDrop(card.key); }}
                onDragEnd={() => { setDragKey(null); setDragOverKey(null); }}
                onClick={() => window.open(card.path, '_blank', 'noopener,noreferrer')}
                className={
                  'group w-full sm:w-[350px] flex flex-col rounded-xl border bg-white/70 hover:bg-white backdrop-blur-xl shadow-glass hover:shadow-lg hover:-translate-y-1 px-5 py-4 transition-all duration-200 cursor-pointer active:cursor-grabbing '
                  + (dragKey === card.key ? 'opacity-40 border-white/60 ' : '')
                  + (dragOverKey === card.key && dragKey !== card.key ? 'border-neutral-500 ring-2 ring-neutral-300 ' : 'border-white/60 hover:border-neutral-300 ')
                }
              >
                <span className="font-bold text-neutral-900 group-hover:underline truncate">
                  {card.label}
                </span>
                <p className="text-xs text-gray-500 mt-1 line-clamp-1 min-h-[1rem]">
                  {card.description}
                </p>
                <div className="mt-3 pt-3 border-t border-gray-100/80 flex items-center justify-between gap-2">
                  <span className="text-xs text-gray-400 truncate">{card.path}</span>
                  <button
                    onClick={e => { e.stopPropagation(); copyUrl(card.key, card.path); }}
                    className="shrink-0 text-xs text-gray-600 border border-gray-200/80 rounded-lg px-3 py-2 hover:border-neutral-500 hover:text-neutral-900 hover:bg-neutral-100/60 transition-colors"
                  >
                    {copiedKey === card.key ? '복사됨' : 'URL 복사'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {settingsOpen && email && (
        <CardSettingsModal
          email={email}
          cards={orderedCards ?? cards}
          onSaved={async () => { await loadOverrides(email); setSettingsOpen(false); }}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}

function CardSettingsModal({
  email, cards, onSaved, onClose,
}: {
  email: string;
  cards: CardData[];
  onSaved: () => void;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<CardData[]>(cards.map(c => ({ ...c })));
  const [saving, setSaving] = useState(false);

  function updateRow(key: string, changes: Partial<CardData>) {
    setRows(rs => rs.map(r => r.key === key ? { ...r, ...changes } : r));
  }

  function moveRow(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= rows.length) return;
    const reordered = [...rows];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setRows(reordered);
  }

  async function save() {
    setSaving(true);
    const payload = rows.map((r, i) => ({
      email,
      app_key: r.key,
      custom_label: r.label.trim() || null,
      custom_description: r.description.trim() || null,
      sort_order: i,
    }));
    await supabase.from('dashboard_cards').upsert(payload, { onConflict: 'email,app_key' });
    setSaving(false);
    onSaved();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-[520px] max-w-[92vw] max-h-[85vh] flex flex-col">
        <div className="shrink-0 flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <span className="text-sm font-bold text-gray-800">카드 설정</span>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-lg leading-none">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {rows.map((row, i) => (
            <div key={row.key} className="flex gap-2 border border-gray-200/80 rounded-lg p-3">
              <div className="flex flex-col shrink-0 pt-1">
                <button
                  onClick={() => moveRow(i, -1)}
                  disabled={i === 0}
                  className="text-gray-400 hover:text-neutral-900 disabled:opacity-20 disabled:hover:text-gray-400 leading-none text-xs px-1"
                  title="위로"
                >▲</button>
                <button
                  onClick={() => moveRow(i, 1)}
                  disabled={i === rows.length - 1}
                  className="text-gray-400 hover:text-neutral-900 disabled:opacity-20 disabled:hover:text-gray-400 leading-none text-xs px-1"
                  title="아래로"
                >▼</button>
              </div>
              <div className="flex-1 min-w-0 space-y-1.5">
                <input
                  value={row.label}
                  onChange={e => updateRow(row.key, { label: e.target.value })}
                  placeholder="카드 이름"
                  className="w-full px-2.5 py-1.5 border border-gray-200/80 bg-white/60 rounded-md text-sm font-semibold text-gray-800 focus:outline-none focus:border-neutral-500 focus:ring-1 focus:ring-neutral-500 transition-colors"
                />
                <input
                  value={row.description}
                  onChange={e => updateRow(row.key, { description: e.target.value })}
                  placeholder="설명 (선택)"
                  className="w-full px-2.5 py-1.5 border border-gray-200/80 bg-white/60 rounded-md text-xs text-gray-600 focus:outline-none focus:border-neutral-500 focus:ring-1 focus:ring-neutral-500 transition-colors"
                />
                <p className="text-[11px] text-gray-400 truncate">{row.path}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="shrink-0 flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-200">
          <button onClick={onClose} className="px-3 py-2 text-xs text-gray-600 border border-gray-200/80 rounded-lg hover:border-neutral-500 hover:text-neutral-900 hover:bg-neutral-100/60 transition-colors">
            취소
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="px-3 py-2 text-xs text-gray-600 border border-gray-200/80 rounded-lg hover:border-neutral-500 hover:text-neutral-900 hover:bg-neutral-100/60 disabled:opacity-50 transition-colors"
          >
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}
