'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface ExpandItem {
  id: string;
  content: string;
  source: string | null;
  translation: string | null;
}

// 음성 읽기는 항상 ko-KR 발화기로 재생하므로, 원문이 한국어가 아니면 번역을 대신 읽는다
// (번역이 없으면 원문을 그대로 읽는다 — 예전 동작과 동일).
function speechTextOf(item: ExpandItem) {
  return item.translation || item.content;
}

const VOLUME_KEY = 'good-words:tts-volume';
const RATE_KEY = 'good-words:tts-rate';
const VOICE_KEY = 'good-words:tts-voice';
const ADVANCE_INTERVAL_KEY = 'good-words:advance-interval-sec';

const RATE_OPTIONS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
const ADVANCE_INTERVAL_OPTIONS = [3, 5, 7, 10];
const DEFAULT_ADVANCE_INTERVAL_SEC = 3;

export default function ExpandViewModal({
  items, startIndex, categoryLabel, onClose,
}: {
  items: ExpandItem[];
  startIndex: number;
  categoryLabel: string;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(startIndex);
  const [playing, setPlaying] = useState(false);
  // 가운데 ▶ 버튼 전용 상태 — "음성 읽기"(checkbox)와는 완전히 별개로, 문장을 자동으로
  // 넘기기만 한다(소리 재생과 무관).
  const [autoAdvancing, setAutoAdvancing] = useState(true);
  const [advanceIntervalSec, setAdvanceIntervalSec] = useState(DEFAULT_ADVANCE_INTERVAL_SEC);
  const [ttsSupported, setTtsSupported] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceURI, setVoiceURI] = useState('');
  const [volume, setVolume] = useState(1);
  const [rate, setRate] = useState(1);

  const current = items[index];
  // onend가 자체적으로 다음 글로 넘길 때(문장이동+음성읽기 동시 사용) 세팅 — 이때는 아래
  // "글 이동은 항상 기본 상태로" 리셋 effect를 건너뛰어야 읽기가 끊기지 않는다.
  const chainedAdvanceRef = useRef(false);
  // index를 항상 최신값으로 미러링 — onend 클로저 안에서 다음 인덱스를 계산할 때 쓴다.
  const indexRef = useRef(index);
  useEffect(() => { indexRef.current = index; }, [index]);
  // playing도 최신값으로 미러링 — onend가 실행되는 시점엔 사용자가 이미 "음성 읽기"를 꺼놨을
  // 수 있어(비동기), speak() 호출 당시의 오래된 클로저 값이 아니라 이 ref로 최신 상태를 봐야
  // 체크 해제 후에도 다음 문장을 계속 읽어버리는 문제를 막을 수 있다.
  const playingRef = useRef(playing);
  useEffect(() => { playingRef.current = playing; }, [playing]);

  // 저장된 설정 복원 + TTS 지원 여부 판단(브라우저 미지원 시 텍스트만 표시하는 graceful degradation).
  useEffect(() => {
    // localStorage.getItem()이 null(첫 방문)이면 Number(null)===0이라 "0~1 범위" 체크를
    // 그대로 통과해버려 볼륨이 조용히 0%가 되던 버그가 있었다 — 값이 실제로 저장돼 있을
    // 때만 반영하도록 null 케이스를 먼저 걸러낸다.
    const storedVolumeRaw = localStorage.getItem(VOLUME_KEY);
    if (storedVolumeRaw !== null) {
      const storedVolume = Number(storedVolumeRaw);
      if (storedVolume >= 0 && storedVolume <= 1) setVolume(storedVolume);
    }
    const storedRate = Number(localStorage.getItem(RATE_KEY));
    if (RATE_OPTIONS.includes(storedRate)) setRate(storedRate);
    const storedInterval = Number(localStorage.getItem(ADVANCE_INTERVAL_KEY));
    if (ADVANCE_INTERVAL_OPTIONS.includes(storedInterval)) setAdvanceIntervalSec(storedInterval);
    setVoiceURI(localStorage.getItem(VOICE_KEY) ?? '');
    setTtsSupported(typeof window !== 'undefined' && 'speechSynthesis' in window);
  }, []);

  // 음성 목록은 비동기로 채워지는 브라우저가 많아 voiceschanged 이벤트로 동적으로 채운다.
  useEffect(() => {
    if (!ttsSupported) return;
    function loadVoices() {
      const list = window.speechSynthesis.getVoices();
      if (list.length === 0) return;
      // 한국어 음성을 우선 노출 — 목록 자체는 사용자 브라우저/OS에 설치된 것을 그대로 사용.
      const sorted = [...list].sort((a, b) => {
        const aKo = a.lang.toLowerCase().startsWith('ko') ? 0 : 1;
        const bKo = b.lang.toLowerCase().startsWith('ko') ? 0 : 1;
        return aKo - bKo;
      });
      setVoices(sorted);
      setVoiceURI((prev) => prev || sorted.find((v) => v.lang.toLowerCase().startsWith('ko'))?.voiceURI || sorted[0]?.voiceURI || '');
    }
    loadVoices();
    window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', loadVoices);
  }, [ttsSupported]);

  const speak = useCallback((text: string) => {
    if (!ttsSupported) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ko-KR';
    utterance.volume = volume;
    utterance.rate = rate;
    const voice = voices.find((v) => v.voiceURI === voiceURI);
    if (voice) utterance.voice = voice;
    utterance.onend = () => {
      // 문장이동(▶)까지 같이 켜져 있으면 읽기가 끝난 시점에 다음 글로 넘어가서 이어 읽는다
      // (이때 이동 시간 선택은 의미가 없어져 disable 처리 — 아래 렌더 부분 참고). playingRef를
      // 다시 확인하는 이유: 이 시점엔 사용자가 이미 "음성 읽기"를 껐을 수 있어(비동기 콜백) —
      // 꺼진 상태인데도 autoAdvancing만 보고 계속 이어 읽으면 체크 해제가 안 먹는 버그가 된다.
      if (autoAdvancing && playingRef.current && items.length > 1) {
        const next = (indexRef.current + 1) % items.length;
        chainedAdvanceRef.current = true;
        setIndex(next);
        speak(speechTextOf(items[next]));
      } else {
        setPlaying(false);
      }
    };
    window.speechSynthesis.speak(utterance);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ttsSupported, volume, rate, voices, voiceURI, autoAdvancing, items]);

  // "음성 읽기" 체크(또는 재생 버튼)에만 반응해서 읽는다 — 글 이동(index 변경)과는 완전히
  // 분리한다. 즉 재생 중에 이동해도 자동으로 다음 글을 이어 읽지 않는다(단, onend가 스스로
  // 다음 글로 넘기는 연쇄 재생은 예외 — 위 speak()의 onend 참고).
  useEffect(() => {
    if (playing && current) {
      speak(speechTextOf(current));
    } else if (ttsSupported) {
      // 체크 해제 시 진행 중이던 발화를 즉시 멈춘다 — 안 그러면 onend가 뒤늦게 실행되면서
      // (문장이동까지 켜져 있을 때) 이미 꺼둔 뒤에도 다음 문장을 계속 읽어버리는 문제가 있었다.
      window.speechSynthesis.cancel();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  // 글 이동은 기본적으로 읽기 상태를 리셋한다(사용자가 직접 이전/다음/점을 눌렀을 때) — 다만
  // 음성읽기가 끝나 자동으로 다음 글로 넘어간 경우(chainedAdvanceRef)는 읽기를 이어가야
  // 하므로 리셋을 건너뛴다.
  useEffect(() => {
    if (chainedAdvanceRef.current) {
      chainedAdvanceRef.current = false;
      return;
    }
    if (ttsSupported) window.speechSynthesis.cancel();
    setPlaying(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  // 가운데 ▶ 버튼 — 문장 자동 이동. 음성읽기가 켜져 있을 때는 읽기가 끝나는 시점에 맞춰
  // (위 onend) 넘어가야 하므로, 이 타이머 기반 이동은 음성읽기가 꺼져 있을 때만 동작한다.
  useEffect(() => {
    if (!autoAdvancing || playing || items.length <= 1) return;
    const timer = window.setInterval(() => {
      setIndex((i) => (i + 1) % items.length);
    }, advanceIntervalSec * 1000);
    return () => window.clearInterval(timer);
  }, [autoAdvancing, playing, advanceIntervalSec, items.length]);

  // 모달이 닫힐 때(언마운트) 진행 중인 발화를 멈춘다 — []디펜던시라 클로저가 마운트 시점의
  // ttsSupported(항상 초기값 false)를 그대로 가둬버려서 실제로는 한 번도 안 불리던 버그가
  // 있었다. state 대신 API 존재 여부를 직접 확인해서 고쳤다.
  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    };
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') { onClose(); return; }
      // 볼륨 슬라이더/음성 선택 등 폼 컨트롤에 포커스가 있을 때는 좌우 화살표가 그 컨트롤
      // 조작용이어야 한다 — 여기서 가로채면 조작할 때마다 문장이 튀는 버그가 있었다.
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'SELECT' || tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft') goPrev();
      if (e.key === 'ArrowRight') goNext();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  function goPrev() { setIndex((i) => Math.max(0, i - 1)); }
  function goNext() { setIndex((i) => Math.min(items.length - 1, i + 1)); }

  function changeVolume(v: number) {
    setVolume(v);
    localStorage.setItem(VOLUME_KEY, String(v));
  }
  function changeRate(v: number) {
    setRate(v);
    localStorage.setItem(RATE_KEY, String(v));
  }
  function changeVoice(uri: string) {
    setVoiceURI(uri);
    localStorage.setItem(VOICE_KEY, uri);
  }
  function changeAdvanceInterval(v: number) {
    setAdvanceIntervalSec(v);
    localStorage.setItem(ADVANCE_INTERVAL_KEY, String(v));
  }

  if (!current) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-[1000px] h-[800px] max-w-full max-h-[90vh] flex flex-col relative">
        <div className="shrink-0 px-6 pt-5 text-center">
          <span className="text-xs font-semibold tracking-wide text-gray-400">{categoryLabel}</span>
        </div>
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 text-xl leading-none"
          aria-label="닫기"
        >✕</button>

        <div className="flex-1 overflow-y-auto px-8 py-10 flex flex-col items-center justify-center text-center">
          <p className="leading-loose text-gray-800 whitespace-pre-wrap" style={{ fontSize: '22px' }}>{current.content}</p>
          {current.translation && (
            <p className="leading-loose text-gray-500 whitespace-pre-wrap mt-4" style={{ fontSize: '16px' }}>{current.translation}</p>
          )}
          {current.source && (
            <p className="text-sm text-gray-400 mt-6">{`< ${current.source} >`}</p>
          )}
        </div>

        <div className="shrink-0 border-t border-gray-100 px-6 py-4 space-y-3">
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={goPrev}
              disabled={index === 0}
              aria-label="이전 글"
              className="w-8 h-8 flex items-center justify-center rounded-full border border-gray-200 text-gray-500 hover:border-neutral-500 hover:text-neutral-900 disabled:opacity-30 transition-colors"
            >‹</button>

            <div className="flex items-center gap-1">
              {items.map((it, i) => (
                <button
                  key={it.id}
                  onClick={() => setIndex(i)}
                  className={`rounded-full transition-all ${i === index ? 'w-5 h-1.5 bg-neutral-900' : 'w-1.5 h-1.5 bg-gray-300 hover:bg-gray-400'}`}
                  aria-label={`${i + 1}번째 글로 이동`}
                />
              ))}
            </div>

            <button
              onClick={goNext}
              disabled={index === items.length - 1}
              aria-label="다음 글"
              className="w-8 h-8 flex items-center justify-center rounded-full border border-gray-200 text-gray-500 hover:border-neutral-500 hover:text-neutral-900 disabled:opacity-30 transition-colors"
            >›</button>

            <button
              onClick={() => setAutoAdvancing((p) => !p)}
              disabled={items.length <= 1}
              title="문장 자동 이동"
              className="w-9 h-9 flex items-center justify-center rounded-full bg-neutral-900 text-white hover:bg-neutral-700 disabled:opacity-30 transition-colors"
            >{autoAdvancing ? '❚❚' : '▶'}</button>

            <select
              value={advanceIntervalSec}
              onChange={(e) => changeAdvanceInterval(Number(e.target.value))}
              disabled={autoAdvancing && playing}
              title={autoAdvancing && playing ? '음성 읽기와 함께 사용 중에는 읽기가 끝나는 시점에 자동으로 넘어갑니다' : '이동 시간'}
              className="text-xs border border-gray-200/80 rounded-md px-2 py-1.5 bg-white/60 text-gray-600 focus:outline-none focus:border-neutral-500 disabled:opacity-40"
            >
              {ADVANCE_INTERVAL_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}초</option>
              ))}
            </select>
          </div>

          {ttsSupported ? (
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-gray-500">
              <label className="flex items-center gap-1.5">
                음성 읽기
                <input type="checkbox" checked={playing} onChange={(e) => setPlaying(e.target.checked)} />
              </label>

              <select
                value={voiceURI}
                onChange={(e) => changeVoice(e.target.value)}
                className="border border-gray-200/80 rounded-md px-2 py-1 bg-white/60 focus:outline-none focus:border-neutral-500"
              >
                {voices.map((v) => (
                  <option key={v.voiceURI} value={v.voiceURI}>{v.name}</option>
                ))}
              </select>

              <label className="flex items-center gap-1.5">
                🔊
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={volume}
                  onChange={(e) => changeVolume(Number(e.target.value))}
                  className="accent-neutral-900"
                />
                {Math.round(volume * 100)}%
              </label>

              <label className="flex items-center gap-1.5">
                속도
                <select
                  value={rate}
                  onChange={(e) => changeRate(Number(e.target.value))}
                  className="border border-gray-200/80 rounded-md px-2 py-1 bg-white/60 focus:outline-none focus:border-neutral-500"
                >
                  {RATE_OPTIONS.map((r) => (
                    <option key={r} value={r}>{r}x</option>
                  ))}
                </select>
              </label>
            </div>
          ) : (
            <p className="text-xs text-gray-400 text-center">이 브라우저는 음성 읽기를 지원하지 않습니다</p>
          )}
        </div>
      </div>
    </div>
  );
}
