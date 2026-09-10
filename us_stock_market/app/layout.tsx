import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const samsungGinGothic = localFont({
  src: [
    { path: "../삼성긴고딕/삼성긴고딕 Medium.ttf", weight: "500", style: "normal" },
    // 실제 Bold 파일 사용 — font-synthesis: none 환경에서 font-bold가 가짜 볼드 없이 진짜 굵기로 렌더링되도록.
    { path: "../삼성긴고딕/삼성긴고딕 Bold.ttf", weight: "700", style: "normal" },
  ],
  display: "swap",
  variable: "--font-samsung-gin-gothic",
});

// 영문·숫자 전용 (한글 글리프 없음 — 한글은 아래 font-family 폴백에서 삼성긴고딕으로 자동 대체됨)
const interTight = localFont({
  src: "../삼성긴고딕/Inter Tight.ttf",
  display: "swap",
  variable: "--font-inter-tight",
});

export const metadata: Metadata = {
  title: "미국증시 대시보드",
  description: "미국 주식 시장 텔레그램 알림 서비스 웹 대시보드 — 업종별 등락률 및 상위 종목 확인",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${samsungGinGothic.variable} ${interTight.variable} h-full antialiased`}
    >
      <body className="min-h-full h-full flex flex-col bg-gray-950 text-gray-100">
        {children}
      </body>
    </html>
  );
}
