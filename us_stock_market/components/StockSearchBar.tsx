'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

export interface StockSearchResult {
  code: string;
  name: string;
}

interface StockSearchBarProps {
  apiPath: string;
  placeholder?: string;
  onSelect: (result: StockSearchResult) => void;
}

export default function StockSearchBar({
  apiPath,
  placeholder = '종목 검색...',
  onSelect,
}: StockSearchBarProps) {
  const [query, setQuery]     = useState('');
  const [results, setResults] = useState<StockSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen]       = useState(false);
  const containerRef          = useRef<HTMLDivElement>(null);
  const timerRef              = useRef<ReturnType<typeof setTimeout> | null>(null);

  // debounced fetch
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const q = query.trim();
    if (!q) { setResults([]); setOpen(false); return; }

    timerRef.current = setTimeout(() => {
      setLoading(true);
      fetch(`${apiPath}?q=${encodeURIComponent(q)}`)
        .then(r => r.json() as Promise<{ results: StockSearchResult[] }>)
        .then(data => {
          setResults(data.results ?? []);
          setOpen(true);
        })
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 280);

    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [query, apiPath]);

  // close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = useCallback(
    (r: StockSearchResult) => {
      onSelect(r);
      setQuery('');
      setResults([]);
      setOpen(false);
    },
    [onSelect],
  );

  return (
    <div ref={containerRef} className="relative" style={{ minWidth: '170px' }}>
      {/* input */}
      <div
        className="flex items-center gap-1 px-2 py-0.5 rounded border"
        style={{ borderColor: 'var(--border-strong)', backgroundColor: 'var(--bg-card)' }}
      >
        <svg
          className="shrink-0 text-gray-500"
          width="10" height="10" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5"
        >
          <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          onKeyDown={e => e.key === 'Escape' && setOpen(false)}
          placeholder={placeholder}
          className="bg-transparent outline-none text-[10px] w-full placeholder-gray-600"
          style={{ color: 'var(--text-secondary)' }}
        />
        {loading && (
          <span className="animate-spin inline-block w-2.5 h-2.5 shrink-0 border border-gray-600 border-t-gray-300 rounded-full" />
        )}
      </div>

      {/* dropdown */}
      {open && results.length > 0 && (
        <div
          className="absolute top-full left-0 mt-0.5 rounded border shadow-xl z-[60] overflow-y-auto"
          style={{
            backgroundColor: 'var(--bg-modal, #1f2937)',
            borderColor: 'var(--border-strong)',
            minWidth: '220px',
            maxHeight: '220px',
          }}
        >
          {results.map(r => (
            <button
              key={r.code}
              className="w-full text-left px-2.5 py-1.5 flex items-center gap-2 border-b last:border-b-0 transition-colors hover:bg-white/5"
              style={{ borderColor: 'var(--border-subtle, #374151)' }}
              onClick={() => handleSelect(r)}
            >
              <span
                className="text-[10px] font-mono shrink-0 w-14"
                style={{ color: 'var(--text-muted)' }}
              >
                {r.code}
              </span>
              <span
                className="text-[11px] truncate"
                style={{ color: 'var(--text-secondary)' }}
              >
                {r.name}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
