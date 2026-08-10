'use client';

import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { decodeSessionId } from '@/lib/jwt';

function logLoginEvent(payload: { email: string; result: 'success' | 'fail'; failReason?: string; sessionId?: string | null }) {
  // 이력 기록 실패가 로그인 흐름을 막으면 안 되므로 fire-and-forget.
  fetch('/api/auth/login-event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => {});
}

// 도메인 전체 SSO 게이트(nginx)가 붙인 redirect 쿼리로 로그인 후 원래 경로로 돌아가기 위함.
// '/'로 시작하지 않거나 '//'·':'를 포함하면(오픈 리다이렉트 방지) 기본 경로로 폴백.
function safeRedirectTarget(raw: string | null): string {
  if (!raw) return '/dashboard';
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes(':')) return '/dashboard';
  return raw;
}

// Supabase 이메일 템플릿의 인증코드 자릿수(8자리)와 맞춤. 실제 만료 시간(60초)은
// Supabase Dashboard의 Auth > Emails > Email OTP Expiration 설정값이 기준이다 —
// 여기 카운트다운은 재전송 스팸을 막기 위한 UI 안내일 뿐, 서버 측 검증과는 별개.
const CODE_LENGTH = 8;
const RESEND_COOLDOWN_SEC = 60;

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner() {
  const searchParams = useSearchParams();
  const redirectTarget = safeRedirectTarget(searchParams.get('redirect'));

  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown(c => Math.max(0, c - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  async function sendCode(targetEmail: string) {
    setError('');
    setSending(true);

    // 등록되지 않은 이메일로는 계정이 새로 만들어지지 않도록 차단 — 오픈 셀프가입 방지.
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: targetEmail,
      options: { shouldCreateUser: false },
    });

    setSending(false);

    if (otpError) {
      setError('인증코드 발송에 실패했습니다. 등록된 이메일인지 확인해주세요.');
      return;
    }

    setCode('');
    setNotice(`${targetEmail}로 인증코드를 보냈습니다. 60초 이내에 입력해주세요.`);
    setCooldown(RESEND_COOLDOWN_SEC);
    setStep('code');
  }

  async function handleEmailSubmit(e: FormEvent) {
    e.preventDefault();
    await sendCode(email);
  }

  async function handleResend() {
    if (cooldown > 0 || sending) return;
    await sendCode(email);
  }

  async function handleCodeSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setVerifying(true);

    const { data, error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: 'email',
    });

    if (verifyError) {
      logLoginEvent({ email, result: 'fail', failReason: verifyError.message });
      setError('인증코드가 올바르지 않거나 만료되었습니다. 다시 시도해주세요.');
      setVerifying(false);
      return;
    }

    const sessionId = data.session ? decodeSessionId(data.session.access_token) : null;
    logLoginEvent({ email, result: 'success', sessionId });

    // redirect는 hub 바깥의 다른 서비스 경로(예: /lottery)일 수 있어, basePath를 자동으로
    // 붙이는 next/navigation 라우터 대신 실제 브라우저 이동을 사용한다.
    window.location.href = redirectTarget;
  }

  function backToEmail() {
    setStep('email');
    setCode('');
    setError('');
    setNotice('');
    setCooldown(0);
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-[450px] bg-white/70 backdrop-blur-xl border border-white/50 rounded-2xl shadow-[0_1px_20px_rgba(0,0,0,0.08)] p-10">
        <h1 className="text-xl font-extrabold tracking-tight text-neutral-900 mb-2">Paul&apos;s 시스템에 로그인하세요.</h1>
        <p className="text-sm text-gray-500 mb-7">이메일로 받은 인증코드로 로그인합니다.</p>

        {step === 'email' ? (
          <form onSubmit={handleEmailSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-semibold text-gray-700 mb-1.5 block">이메일</label>
              <input
                type="email"
                required
                autoFocus
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="이메일을 입력하세요."
                className="w-full px-4 py-2.5 border border-gray-200/80 bg-white/60 rounded-lg text-base text-gray-700 focus:outline-none focus:border-neutral-500 focus:ring-1 focus:ring-neutral-500 transition-colors"
              />
            </div>

            {error && <p className="text-sm text-red-500">{error}</p>}

            <button
              type="submit"
              disabled={sending}
              className="w-full py-2.5 bg-gradient-to-r from-neutral-900 to-neutral-800 text-white text-base font-bold rounded-lg shadow-glow-dark hover:shadow-lg disabled:opacity-50 transition-all duration-200 mt-3"
            >
              {sending ? '발송 중...' : '인증코드 받기'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleCodeSubmit} className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-semibold text-gray-700">인증코드</label>
                <button
                  type="button"
                  onClick={backToEmail}
                  className="text-xs text-neutral-600 hover:text-neutral-900 underline transition-colors"
                >
                  다른 이메일로 받기
                </button>
              </div>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                autoFocus
                maxLength={CODE_LENGTH}
                value={code}
                onChange={e => setCode(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder={`${CODE_LENGTH}자리 인증코드`}
                className="w-full px-4 py-2.5 border border-gray-200/80 bg-white/60 rounded-lg text-base text-gray-700 tracking-[0.3em] text-center focus:outline-none focus:border-neutral-500 focus:ring-1 focus:ring-neutral-500 transition-colors"
              />
              <p className="text-xs text-gray-500 mt-1.5">{email}로 발송됨</p>
            </div>

            {notice && !error && <p className="text-sm text-green-600">{notice}</p>}
            {error && <p className="text-sm text-red-500">{error}</p>}

            <button
              type="submit"
              disabled={verifying || code.length !== CODE_LENGTH}
              className="w-full py-2.5 bg-gradient-to-r from-neutral-900 to-neutral-800 text-white text-base font-bold rounded-lg shadow-glow-dark hover:shadow-lg disabled:opacity-50 transition-all duration-200 mt-3"
            >
              {verifying ? '확인 중...' : '로그인'}
            </button>

            <button
              type="button"
              onClick={handleResend}
              disabled={cooldown > 0 || sending}
              className="w-full text-xs text-gray-500 hover:text-neutral-900 disabled:opacity-50 disabled:hover:text-gray-500 transition-colors"
            >
              {cooldown > 0 ? `인증코드 다시 받기 (${cooldown}초 후 가능)` : sending ? '발송 중...' : '인증코드 다시 받기'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
