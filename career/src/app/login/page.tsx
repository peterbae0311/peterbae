'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const PASSWORD_RULE_TEXT = '최소 8자 이상이며 숫자, 특수문자 포함';

function validatePassword(pw: string): string | null {
  if (pw.length < 8) return `비밀번호 설정 조건을 확인해주세요. (${PASSWORD_RULE_TEXT})`;
  if (!/\d/.test(pw)) return `비밀번호 설정 조건을 확인해주세요. (${PASSWORD_RULE_TEXT})`;
  if (!/[!@#$%^&*(),.?":{}|<>_\-+=~`[\]\\/;']/.test(pw)) return `비밀번호 설정 조건을 확인해주세요. (${PASSWORD_RULE_TEXT})`;
  return null;
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'change'>('login');

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [notice,   setNotice]   = useState('');

  const [changeEmail,           setChangeEmail]           = useState('');
  const [currentPassword,       setCurrentPassword]       = useState('');
  const [newPassword,           setNewPassword]           = useState('');
  const [newPasswordConfirm,    setNewPasswordConfirm]    = useState('');
  const [changeError,           setChangeError]           = useState('');
  const [changing,              setChanging]              = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError) {
      setError('이메일 또는 비밀번호가 올바르지 않습니다.');
      setLoading(false);
      return;
    }

    router.replace('/resume');
    router.refresh();
  }

  function openChangePassword() {
    setChangeEmail(email);
    setCurrentPassword('');
    setNewPassword('');
    setNewPasswordConfirm('');
    setChangeError('');
    setMode('change');
  }

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault();
    setChangeError('');

    if (newPassword !== newPasswordConfirm) {
      setChangeError('새 비밀번호가 일치하지 않습니다.');
      return;
    }
    const ruleError = validatePassword(newPassword);
    if (ruleError) {
      setChangeError(ruleError);
      return;
    }

    setChanging(true);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: changeEmail,
      password: currentPassword,
    });

    if (signInError) {
      setChangeError('현재 비밀번호가 올바르지 않습니다.');
      setChanging(false);
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });

    if (updateError) {
      setChangeError('비밀번호 변경 중 오류가 발생했습니다.');
      setChanging(false);
      await supabase.auth.signOut();
      return;
    }

    await supabase.auth.signOut();

    setChanging(false);
    setEmail(changeEmail);
    setPassword('');
    setNotice('비밀번호가 변경되었습니다. 새 비밀번호로 로그인해주세요.');
    setMode('login');
  }

  if (mode === 'change') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-[450px] bg-white/70 backdrop-blur-xl border border-white/50 rounded-2xl shadow-[0_1px_20px_rgba(0,0,0,0.08)] p-10">
          <h1 className="text-xl font-extrabold tracking-tight text-neutral-900 mb-2">비밀번호를 변경해 주세요.</h1>
          <p className="text-sm text-gray-500 mb-7">새 비밀번호를 설정해 주세요.</p>

          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <label className="text-sm font-semibold text-gray-700 mb-1.5 block">이메일</label>
              <input
                type="email"
                required
                autoFocus
                value={changeEmail}
                onChange={e => setChangeEmail(e.target.value)}
                placeholder="이메일을 입력하세요."
                className="w-full px-4 py-2.5 border border-gray-200/80 bg-white/60 rounded-lg text-base text-gray-700 focus:outline-none focus:border-neutral-500 focus:ring-1 focus:ring-neutral-500 transition-colors"
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-gray-700 mb-1.5 block">현재 비밀번호</label>
              <input
                type="password"
                required
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-200/80 bg-white/60 rounded-lg text-base text-gray-700 focus:outline-none focus:border-neutral-500 focus:ring-1 focus:ring-neutral-500 transition-colors"
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-gray-700 mb-1.5 block">새 비밀번호</label>
              <input
                type="password"
                required
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-200/80 bg-white/60 rounded-lg text-base text-gray-700 focus:outline-none focus:border-neutral-500 focus:ring-1 focus:ring-neutral-500 transition-colors"
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-gray-700 mb-1.5 block">새 비밀번호 확인</label>
              <input
                type="password"
                required
                value={newPasswordConfirm}
                onChange={e => setNewPasswordConfirm(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-200/80 bg-white/60 rounded-lg text-base text-gray-700 focus:outline-none focus:border-neutral-500 focus:ring-1 focus:ring-neutral-500 transition-colors"
              />
            </div>

            <p className="text-xs text-gray-500 bg-neutral-50 border border-gray-200/80 rounded-lg px-3 py-2 leading-relaxed">
              ※ 비밀번호 설정 조건<br />
              &nbsp;&nbsp;- {PASSWORD_RULE_TEXT}
            </p>

            {changeError && <p className="text-sm text-red-500">{changeError}</p>}

            <button
              type="submit"
              disabled={changing}
              className="w-full py-2.5 bg-gradient-to-r from-neutral-900 to-neutral-800 text-white text-base font-bold rounded-lg shadow-glow-dark hover:shadow-lg disabled:opacity-50 transition-all duration-200 mt-3"
            >
              {changing ? '변경 중...' : '확인'}
            </button>
            <button
              type="button"
              onClick={() => { setMode('login'); setChangeError(''); }}
              className="w-full text-xs text-gray-500 hover:text-neutral-900 transition-colors"
            >
              로그인으로 돌아가기
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-[450px] bg-white/70 backdrop-blur-xl border border-white/50 rounded-2xl shadow-[0_1px_20px_rgba(0,0,0,0.08)] p-10">
        <h1 className="text-xl font-extrabold tracking-tight text-neutral-900 mb-2">경력 관리 시스템에 로그인하세요.</h1>
        <p className="text-sm text-gray-500 mb-7">서비스를 이용하려면 로그인이 필요합니다.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
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
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm font-semibold text-gray-700">비밀번호</label>
              <button
                type="button"
                onClick={openChangePassword}
                className="text-xs text-neutral-600 hover:text-neutral-900 underline transition-colors"
              >
                비밀번호를 잊으셨나요?
              </button>
            </div>
            <input
              type="password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="비밀번호를 입력하세요."
              className="w-full px-4 py-2.5 border border-gray-200/80 bg-white/60 rounded-lg text-base text-gray-700 focus:outline-none focus:border-neutral-500 focus:ring-1 focus:ring-neutral-500 transition-colors"
            />
          </div>

          {notice && !error && <p className="text-sm text-green-600">{notice}</p>}
          {error && <p className="text-sm text-red-500">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-gradient-to-r from-neutral-900 to-neutral-800 text-white text-base font-bold rounded-lg shadow-glow-dark hover:shadow-lg disabled:opacity-50 transition-all duration-200 mt-3"
          >
            {loading ? '로그인 중...' : '로그인'}
          </button>
        </form>
      </div>
    </div>
  );
}
