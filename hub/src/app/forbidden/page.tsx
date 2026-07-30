'use client';

export default function ForbiddenPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-[420px] bg-white/70 backdrop-blur-xl border border-white/50 rounded-2xl shadow-[0_1px_20px_rgba(0,0,0,0.08)] p-10 text-center">
        <h1 className="text-xl font-extrabold tracking-tight text-neutral-900 mb-2">접근 권한이 없습니다</h1>
        <p className="text-sm text-gray-500 mb-7">이 서비스에 대한 접근 권한이 없습니다. 관리자에게 문의하세요.</p>
        <a
          href="/dashboard"
          className="inline-block px-5 py-2.5 bg-gradient-to-r from-neutral-900 to-neutral-800 text-white text-sm font-bold rounded-lg shadow-glow-dark hover:shadow-lg transition-all duration-200"
        >
          대시보드로 이동
        </a>
      </div>
    </div>
  );
}
