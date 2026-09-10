import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';

const samsungGinGothic = localFont({
  src: '../../삼성긴고딕/삼성긴고딕 Medium.ttf',
  display: 'swap',
  variable: '--font-samsung-gin-gothic',
});

// 영문·숫자 전용 (한글 글리프 없음 — 한글은 아래 font-family 폴백에서 삼성긴고딕으로 자동 대체됨)
const interTight = localFont({
  src: '../../삼성긴고딕/Inter Tight.ttf',
  display: 'swap',
  variable: '--font-inter-tight',
});

export const metadata: Metadata = {
  title: '로또 번호 분석',
  description: '로또 1등 당첨 번호 분석 및 예상 번호 추출',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full">
      <body className={`${samsungGinGothic.variable} ${interTight.variable} min-h-full bg-white text-gray-900 antialiased`} style={{ fontFamily: 'var(--font-inter-tight), var(--font-samsung-gin-gothic), sans-serif' }}>
        {children}
      </body>
    </html>
  );
}
