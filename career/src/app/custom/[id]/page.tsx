'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { supabase, NavTab } from '@/lib/supabase';

export default function CustomTabPage() {
  const params = useParams<{ id: string }>();
  const [tab, setTab] = useState<NavTab | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    supabase.from('nav_tabs').select('*').eq('id', params.id).maybeSingle().then(({ data }) => {
      if (data) setTab(data as NavTab);
      else setNotFound(true);
    });
  }, [params.id]);

  return (
    <div className="min-h-[calc(100vh-56px)] flex justify-center px-4 py-8">
      <div className="w-full" style={{ maxWidth: '1816px' }}>
        <div className="rounded-2xl border border-white/60 bg-white/70 backdrop-blur-xl shadow-glass p-8">
          <h1 className="text-2xl font-black tracking-tighter text-neutral-900 mb-6 pb-4 border-b border-gray-200/70">
            {notFound ? '탭을 찾을 수 없습니다' : (tab?.label ?? ' ')}
          </h1>
          <p className="text-sm text-gray-500 text-center py-16">
            {notFound ? '삭제되었거나 존재하지 않는 탭입니다.' : '준비 중인 페이지입니다.'}
          </p>
        </div>
      </div>
    </div>
  );
}
