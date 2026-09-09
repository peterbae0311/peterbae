'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface ExpandItem {
  id: string;
  content: string;
  source: string | null;
  translation: string | null;
}

const HANGUL_RE = /[ㄱ-ㆎ가-힣]/;

// 음성 읽기는 항상 ko-KR 발화기로 재생한다 — 원문 자체가 한국어면 그대로 읽고, 아니면
// 번역이 있을 때만 번역을 읽는다. 번역이 필요한(=원문이 한국어가 아닌) 글인데 번역이 없으면
// 어색한 발음으로 외국어 원문을 그대로 읽지 않도록 null을 반환해 그 글을 건너뛴다.
function speechTextOf(item: ExpandItem): string | null {
  if (HANGUL_RE.test(item.content)) return item.content;
  return item.translation || null;
}

// 저장된 content/translation은 한 줄 문단이라, 화면에서만 문장(마침표/물음표/느낌표) 단위로
// 줄바꿈해 가독성을 높인다 — DB 원문은 그대로 두고 표시할 때만 변환한다.
function splitSentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/);
}
function withSentenceBreaks(text: string): string {
  return splitSentences(text).join('\n');
}

const VOLUME_KEY = 'good-words:tts-volume';
const RATE_KEY = 'good-words:tts-rate';
const VOICE_KEY = 'good-words:tts-voice';

const RATE_OPTIONS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
// 문장 강조가 넘어가는 간격이자, 자동 넘김일 때 마지막 문장에서 다음 글로 넘어가기까지의
// 대기 시간이기도 하다 — 두 기능이 이제 하나의 타이머를 공유한다(2026-09-09, 사용자 요청으로
// 별도 "이동 시간" 설정 제거).
const SENTENCE_INTERVAL_MS = 5000;

// 글이 바뀔 때마다 은은하게 배경을 바꿔주는 자연 톤 그라데이션 — 채도를 낮은 파스텔로 눌러
// 본문 텍스트(text-gray-800) 대비를 해치지 않게 했다. 사진 대신 그라데이션을 쓴 이유: 외부
// 이미지 소스에 의존하면 네트워크 실패/저작권 문제가 생길 수 있어서.
const NATURE_BACKGROUNDS = [
  'from-sky-100 via-blue-50 to-white',       // 맑은 하늘
  'from-emerald-100 via-green-50 to-white',  // 숲
  'from-orange-100 via-amber-50 to-white',   // 노을
  'from-cyan-100 via-teal-50 to-white',      // 바다
  'from-lime-100 via-yellow-50 to-white',    // 들판
  'from-violet-100 via-purple-50 to-white',  // 라벤더
  'from-rose-100 via-pink-50 to-white',      // 벚꽃
  'from-slate-100 via-blue-50 to-white',     // 눈 덮인 산
];

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
  const [autoAdvancing, setAutoAdvancing] = useState(false);
  const [ttsSupported, setTtsSupported] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceURI, setVoiceURI] = useState('');
  const [volume, setVolume] = useState(1);
  const [rate, setRate] = useState(1);

  const current = items[index];
  // 글이 바뀔 때(index 변경)마다 자연 배경을 랜덤으로 다시 뽑는다.
  const natureBg = useMemo(
    () => NATURE_BACKGROUNDS[Math.floor(Math.random() * NATURE_BACKGROUNDS.length)],
    [index]
  );

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
  // 자동 넘김 on/off 버튼을 눌러도 진행 중인 문장 강조 위치가 리셋되지 않게 ref로 최신값을
  // 따로 미러링한다 — 이 값을 effect의 의존성 배열에 넣으면(=state 그대로 참조) 토글할 때마다
  // 아래 effect가 처음부터 다시 실행되며 activeSentenceIndex가 0으로 되돌아가버린다.
  const autoAdvancingRef = useRef(autoAdvancing);
  useEffect(() => { autoAdvancingRef.current = autoAdvancing; }, [autoAdvancing]);

  // 카드가 열리면(글이 바뀌면) 맨 위 문장부터 5초 간격으로 강조 문장을 순환시킨다 — 마지막
  // 문장 다음엔 다시 처음으로 돌아가 계속 반복한다. "자동 넘김"이 켜져 있으면(그리고 음성
  // 읽기로 넘어가는 중이 아니면) 마지막 문장에서 5초 뒤 다음 글로 넘어간다 — 별도의 "이동
  // 시간" 타이머 없이 이 문장 강조 타이머 하나를 공유한다(2026-09-09, 사용자 요청).
  // 이 effect는 오직 글(sentences)이 바뀔 때만 재시작한다 — autoAdvancing은 위 ref로만
  // 읽어서, 토글해도 진행 중인 강조 위치가 리셋되지 않는다(2026-09-10, 사용자 요청).
  const sentences = useMemo(() => splitSentences(current?.content ?? ''), [current?.content]);
  const [activeSentenceIndex, setActiveSentenceIndex] = useState(0);
  useEffect(() => {
    setActiveSentenceIndex(0);
    if (sentences.length === 0) return;
    const timer = window.setInterval(() => {
      setActiveSentenceIndex((i) => {
        if (i < sentences.length - 1) return i + 1;
        if (autoAdvancingRef.current && !playingRef.current && items.length > 1) {
          setIndex((prev) => (prev + 1) % items.length);
        }
        return 0;
      });
    }, SENTENCE_INTERVAL_MS);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sentences]);

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

  // skipCount는 "번역이 없어서 건너뛴 글"이 몇 개나 연속됐는지 세어, 모든 글이 읽을 수 없는
  // 경우(전부 외국어인데 번역이 하나도 없는 등) 무한 재귀에 빠지지 않게 막는 안전장치다.
  const speak = useCallback((item: ExpandItem, skipCount = 0) => {
    if (!ttsSupported) return;
    // 다음 글로 넘어가서 이어 읽는다(문장이동까지 같이 켜져 있을 때만) — 아니면 읽기를 멈춘다.
    // playingRef를 다시 확인하는 이유: 이 시점엔 사용자가 이미 "음성 읽기"를 껐을 수 있어(비동기
    // 콜백) — 꺼진 상태인데도 autoAdvancing만 보고 계속 이어 읽으면 체크 해제가 안 먹는 버그가 된다.
    const advanceOrStop = (nextSkipCount: number) => {
      if (autoAdvancing && playingRef.current && items.length > 1 && nextSkipCount < items.length) {
        const next = (indexRef.current + 1) % items.length;
        chainedAdvanceRef.current = true;
        setIndex(next);
        speak(items[next], nextSkipCount);
      } else {
        setPlaying(false);
      }
    };

    const text = speechTextOf(item);
    if (!text) {
      // 원문이 한국어가 아닌데 번역이 없는 글 — 어색하게 원문을 읽지 않고 소리 없이 건너뛴다.
      advanceOrStop(skipCount + 1);
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ko-KR';
    utterance.volume = volume;
    utterance.rate = rate;
    const voice = voices.find((v) => v.voiceURI === voiceURI);
    if (voice) utterance.voice = voice;
    // 문장이동(▶)까지 같이 켜져 있으면 읽기가 끝난 시점에 다음 글로 넘어가서 이어 읽는다
    // (이때 이동 시간 선택은 의미가 없어져 disable 처리 — 아래 렌더 부분 참고).
    utterance.onend = () => advanceOrStop(0);
    window.speechSynthesis.speak(utterance);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ttsSupported, volume, rate, voices, voiceURI, autoAdvancing, items]);

  // "음성 읽기" 체크(또는 재생 버튼)에만 반응해서 읽는다 — 글 이동(index 변경)과는 완전히
  // 분리한다. 즉 재생 중에 이동해도 자동으로 다음 글을 이어 읽지 않는다(단, onend가 스스로
  // 다음 글로 넘기는 연쇄 재생은 예외 — 위 speak()의 onend 참고).
  useEffect(() => {
    if (playing && current) {
      speak(current);
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
  if (!current) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
      <div className={`bg-gradient-to-br ${natureBg} rounded-2xl shadow-2xl w-full max-w-[1250px] h-[800px] max-h-[90vh] flex flex-col relative`}>
        <div className="shrink-0 px-6 pt-5 text-center">
          <span className="text-xs font-semibold tracking-wide text-amber-700/70">{categoryLabel}</span>
        </div>
        <button
          onClick={onClose}
          aria-label="닫기"
          className="absolute top-3 right-3 w-11 h-11 flex items-center justify-center rounded-full text-gray-500 hover:text-gray-700 hover:bg-gray-100 text-xl leading-none transition-colors"
        >✕</button>

        <button
          onClick={goPrev}
          disabled={index === 0}
          aria-label="이전 글"
          className="absolute left-2 sm:left-0 sm:-translate-x-1/2 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center rounded-full bg-amber-700 text-white shadow-md hover:bg-amber-600 disabled:opacity-30 transition-colors z-10"
        >
          {/* 페이지 전역에 적용된 커스텀 폰트(삼성긴고딕)에 ‹/› 글자가 없어 대체 폰트로
              렌더링되며 세로 중심이 어긋나던 문제 — 폰트와 무관하게 항상 정중앙에 오는
              SVG로 교체(2026-09-09 실측 확인). */}
          <svg width="10" height="16" viewBox="0 0 10 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 1.5 1.5 8 8 14.5" />
          </svg>
        </button>
        <button
          onClick={goNext}
          disabled={index === items.length - 1}
          aria-label="다음 글"
          className="absolute right-2 sm:right-0 sm:translate-x-1/2 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center rounded-full bg-amber-700 text-white shadow-md hover:bg-amber-600 disabled:opacity-30 transition-colors z-10"
        >
          <svg width="10" height="16" viewBox="0 0 10 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 1.5 8.5 8 2 14.5" />
          </svg>
        </button>

        <div className="flex-1 overflow-y-auto px-6 sm:px-12 md:px-20 py-6 sm:py-10 flex flex-col items-center justify-center text-center">
          <p className="leading-loose text-gray-800 break-keep" style={{ fontSize: '22px' }}>
            {sentences.map((sentence, i) => (
              <span
                key={i}
                className={`block hover:font-bold hover:text-amber-800 transition-colors cursor-default ${
                  i === activeSentenceIndex ? 'font-bold text-amber-800' : ''
                }`}
              >
                {sentence}
              </span>
            ))}
          </p>
          {current.translation && (
            <p className="leading-loose text-gray-500 whitespace-pre-wrap break-keep mt-4" style={{ fontSize: '16px' }}>{withSentenceBreaks(current.translation)}</p>
          )}
          {current.source && (
            <p className="text-sm text-gray-500 mt-6">
              <span className="text-amber-400">✦</span> {current.source}
            </p>
          )}
        </div>

        <div className="shrink-0 border-t border-gray-100 px-6 py-4 space-y-4 text-xs">
          <div>
            <p className="text-center text-[11px] text-gray-400 uppercase tracking-wide mb-2">자동 넘김</p>
            <div className="flex items-center justify-center gap-4">
              <button
                onClick={() => setAutoAdvancing((p) => !p)}
                disabled={items.length <= 1}
                title="문장 자동 이동"
                className="w-9 h-9 flex items-center justify-center rounded-full bg-amber-700 text-white hover:bg-amber-600 disabled:opacity-30 transition-colors"
              >{autoAdvancing ? '❚❚' : '▶'}</button>

              {autoAdvancing && playing && (
                <span className="text-gray-400">음성 읽기와 함께 사용 중 — 읽기가 끝나면 자동으로 넘어갑니다</span>
              )}
            </div>
          </div>

          {ttsSupported ? (
            <div className="border-t border-gray-100 pt-3">
              <p className="text-center text-[11px] text-gray-400 uppercase tracking-wide mb-2">음성 읽기</p>
              <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-gray-500">
                <label className="flex items-center gap-1.5">
                  음성 읽기
                  <input type="checkbox" checked={playing} onChange={(e) => setPlaying(e.target.checked)} className="w-4 h-4 accent-amber-700" />
                </label>

                <select
                  value={voiceURI}
                  onChange={(e) => changeVoice(e.target.value)}
                  className="border border-gray-300 rounded-md px-2 py-1 bg-gray-50 hover:bg-white hover:border-amber-400 focus:outline-none focus:border-amber-500"
                >
                  {voices.map((v) => (
                    <option key={v.voiceURI} value={v.voiceURI}>{v.name}</option>
                  ))}
                </select>

                <label className="flex items-center gap-1.5">
                  <span className="sr-only">볼륨</span>
                  🔊
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={volume}
                    onChange={(e) => changeVolume(Number(e.target.value))}
                    className="accent-amber-700"
                  />
                  {Math.round(volume * 100)}%
                </label>

                <label className="flex items-center gap-1.5">
                  속도
                  <select
                    value={rate}
                    onChange={(e) => changeRate(Number(e.target.value))}
                    className="border border-gray-300 rounded-md px-2 py-1 bg-gray-50 hover:bg-white hover:border-amber-400 focus:outline-none focus:border-amber-500"
                  >
                    {RATE_OPTIONS.map((r) => (
                      <option key={r} value={r}>{r}x</option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          ) : (
            <p className="text-gray-500 text-center">이 브라우저는 음성 읽기를 지원하지 않습니다</p>
          )}
        </div>
      </div>
    </div>
  );
}
