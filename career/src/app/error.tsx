'use client';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isEnvError = error.message.includes('[env]');

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-56px)] p-8">
      <div className="max-w-lg w-full bg-white/70 backdrop-blur-xl rounded-2xl shadow-glass-lg border border-red-100/60 p-8 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-red-100/80 rounded-xl flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-base font-bold text-gray-900">
            {isEnvError ? '환경변수 설정 오류' : '페이지 오류'}
          </h1>
        </div>

        <pre className="text-sm text-red-700 bg-red-50/80 rounded-xl p-4 whitespace-pre-wrap break-words font-mono">
          {error.message}
        </pre>

        {isEnvError && (
          <div className="bg-amber-50/80 border border-amber-200/70 rounded-xl p-4 text-sm text-amber-800 space-y-1">
            <p className="font-semibold">해결 방법</p>
            <ol className="list-decimal list-inside space-y-1">
              <li><code className="bg-amber-100 px-1 rounded">.env.local</code> 파일이 프로젝트 루트에 있는지 확인</li>
              <li>dev 서버를 재시작: <code className="bg-amber-100 px-1 rounded">Ctrl+C</code> → <code className="bg-amber-100 px-1 rounded">npm run dev</code></li>
            </ol>
          </div>
        )}

        <button
          onClick={reset}
          className="w-full py-2.5 bg-gradient-to-r from-neutral-900 to-neutral-800 text-white rounded-xl text-sm font-semibold shadow-glow-dark hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
        >
          다시 시도
        </button>
      </div>
    </div>
  );
}
