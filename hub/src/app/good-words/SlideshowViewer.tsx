'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface SlideshowItem {
  id: string;
  category: string;
  content: string;
  source: string | null;
}

interface SlideshowCategory {
  id: string;
  label: string;
}

const INTERVAL_STORAGE_KEY = 'good-words:slideshow-interval-sec';
const MUTED_STORAGE_KEY = 'good-words:slideshow-muted';
const DEFAULT_INTERVAL_SEC = 8;
const MIN_INTERVAL_SEC = 3;
const MAX_INTERVAL_SEC = 30;

export default function SlideshowViewer({
  items, categories, onClose,
}: {
  items: SlideshowItem[];
  categories: SlideshowCategory[];
  onClose: () => void;
}) {
  function categoryLabel(id: string): string {
    return categories.find((c) => c.id === id)?.label ?? id;
  }

  const [index, setIndex] = useState(0);
  const [intervalSec, setIntervalSec] = useState(DEFAULT_INTERVAL_SEC);
  const [muted, setMuted] = useState(false);
  const [ttsSupported, setTtsSupported] = useState(false);
  const timerRef = useRef<number | null>(null);

  // 저장된 설정 복원 + TTS 지원 여부 판단(브라우저 미지원 시 텍스트만 표시하는 graceful degradation).
  useEffect(() => {
    const storedInterval = Number(localStorage.getItem(INTERVAL_STORAGE_KEY));
    if (storedInterval >= MIN_INTERVAL_SEC && storedInterval <= MAX_INTERVAL_SEC) {
      setIntervalSec(storedInterval);
    }
    setMuted(localStorage.getItem(MUTED_STORAGE_KEY) === '1');
    setTtsSupported(typeof window !== 'undefined' && 'speechSynthesis' in window);
  }, []);

  const current = items[index];

  const speak = useCallback((text: string) => {
    if (!ttsSupported || muted) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ko-KR';
    window.speechSynthesis.speak(utterance);
  }, [ttsSupported, muted]);

  useEffect(() => {
    if (current) speak(current.content);
    return () => {
      if (ttsSupported) window.speechSynthesis.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, muted]);

  useEffect(() => {
    if (items.length <= 1) return;
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = window.setInterval(() => {
      setIndex((i) => (i + 1) % items.length);
    }, intervalSec * 1000);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [intervalSec, items.length]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  function toggleMute() {
    setMuted((m) => {
      const next = !m;
      localStorage.setItem(MUTED_STORAGE_KEY, next ? '1' : '0');
      if (next && ttsSupported) window.speechSynthesis.cancel();
      return next;
    });
  }

  function changeInterval(v: number) {
    setIntervalSec(v);
    localStorage.setItem(INTERVAL_STORAGE_KEY, String(v));
  }

  if (!current) {
    return (
      <div className="fixed inset-0 bg-neutral-950 flex items-center justify-center z-50">
        <p className="text-white/70 text-sm">보관함에 표시할 글이 없습니다.</p>
        <button
          onClick={onClose}
          className="absolute top-6 right-6 text-white/60 hover:text-white text-2xl leading-none"
          aria-label="닫기"
        >✕</button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-neutral-950 flex items-center justify-center z-50 px-6">
      <button
        onClick={onClose}
        className="absolute top-6 right-6 text-white/60 hover:text-white text-2xl leading-none"
        aria-label="닫기"
      >✕</button>

      <div className="max-w-[720px] w-full text-center">
        <p className="text-xs tracking-[0.2em] text-white/40 uppercase mb-6">{categoryLabel(current.category)}</p>
        <p className="text-2xl sm:text-3xl leading-relaxed font-medium text-white whitespace-pre-wrap">
          {current.content}
        </p>
        {current.source && (
          <p className="text-xs text-white/40 mt-6">{`< 출처 : ${current.source} >`}</p>
        )}
      </div>

      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-wrap items-center justify-center gap-4 text-white/70 text-xs">
        <span>{index + 1} / {items.length}</span>

        <label className="flex items-center gap-2">
          넘김 간격
          <input
            type="range"
            min={MIN_INTERVAL_SEC}
            max={MAX_INTERVAL_SEC}
            value={intervalSec}
            onChange={(e) => changeInterval(Number(e.target.value))}
            className="accent-white"
          />
          {intervalSec}초
        </label>

        {ttsSupported ? (
          <button
            onClick={toggleMute}
            className="border border-white/30 rounded-full px-3 py-1 hover:border-white/60 transition-colors"
          >
            {muted ? '음소거 해제' : '음소거'}
          </button>
        ) : (
          <span className="text-white/40">이 브라우저는 음성 읽기를 지원하지 않습니다</span>
        )}
      </div>
    </div>
  );
}
