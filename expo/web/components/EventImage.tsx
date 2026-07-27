"use client";

import { useState } from "react";

/** image_url이 없거나(깨진 링크 등으로) 로드에 실패하면 귀여운 일러스트 플레이스홀더로 대체한다 */
export function EventImage({
  src,
  alt,
  imgClassName,
  fallbackClassName,
}: {
  src: string | null;
  alt: string;
  imgClassName: string;
  fallbackClassName: string;
}) {
  const [broken, setBroken] = useState(false);

  if (!src || broken) {
    return (
      <div className={`flex items-center justify-center ${fallbackClassName}`}>
        <CuteFallbackIcon />
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} className={imgClassName} onError={() => setBroken(true)} />
  );
}

/** 이미지가 없는 카드를 위한 미소 짓는 액자 아이콘. 배경색에 맞추어 currentColor로 그린다 */
function CuteFallbackIcon() {
  return (
    <svg viewBox="0 0 100 100" className="h-14 w-14 text-ink-muted/60" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="10" y="18" width="80" height="64" rx="8" stroke="currentColor" strokeWidth="4" />
      <path
        d="M18 72L40 52a6 6 0 0 1 8 0l6 6 14-14a6 6 0 0 1 8 0l14 14"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="33" cy="39" r="8" fill="currentColor" />
      <circle cx="30" cy="37.5" r="1.4" fill="var(--paper)" />
      <circle cx="36" cy="37.5" r="1.4" fill="var(--paper)" />
      <path d="M30.5 42q2.5 2 5 0" stroke="var(--paper)" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
