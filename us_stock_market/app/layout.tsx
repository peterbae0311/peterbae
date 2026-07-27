import type { Metadata } from "next";
import { Noto_Sans_KR } from "next/font/google";
import "./globals.css";

const notoSansKr = Noto_Sans_KR({
  variable: "--font-noto-sans-kr",
  subsets: ["latin"],
  /* 600(semibold) 추가: 종목 코드 font-semibold 렌더링에 필요.
     400(body) / 500(medium) / 600(semibold) / 700(bold) 4단계 weight 확보. */
  weight: ["400", "500", "600", "700"],
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
      className={`${notoSansKr.variable} h-full antialiased`}
    >
      <body className="min-h-full h-full flex flex-col bg-gray-950 text-gray-100">
        {children}
      </body>
    </html>
  );
}
