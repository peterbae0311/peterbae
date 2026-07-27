import type { Metadata } from "next";
import "./globals.css";
import NavBar from "@/components/NavBar";

export const metadata: Metadata = {
  title: "경력 관리",
  description: "자기소개서 작성 및 채용공고 통합 검색",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="relative min-h-screen antialiased text-gray-800 bg-gradient-to-br from-neutral-100 via-white to-neutral-100">
        {/* 배경 장식 — 블러 처리된 그라데이션 orb */}
        <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
          <div className="absolute -top-32 -left-24 w-[28rem] h-[28rem] bg-gradient-to-br from-neutral-400/40 to-gray-300/30 rounded-full blur-3xl" />
          <div className="absolute top-1/3 -right-32 w-[32rem] h-[32rem] bg-gradient-to-br from-neutral-300/30 to-gray-200/30 rounded-full blur-3xl" />
          <div className="absolute -bottom-40 left-1/4 w-[26rem] h-[26rem] bg-gradient-to-br from-gray-200/25 to-neutral-300/25 rounded-full blur-3xl" />
        </div>
        <NavBar />
        {children}
      </body>
    </html>
  );
}
