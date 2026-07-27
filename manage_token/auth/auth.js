window.initAuth = async function initAuth({ supabaseUrl, supabaseKey, onLogin, onLogout }) {
  // Inject HTML
  window.injectAuthUI();

  // Init Supabase client
  const _supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

  /* ── Screen management ── */
  const SCREENS = [
    'screen-login', 'screen-register', 'screen-register-confirm',
    'screen-forgot', 'screen-forgot-confirm', 'screen-new-password',
  ];

  function showScreen(id) {
    SCREENS.forEach(s => {
      const el = document.getElementById(s);
      if (el) el.classList.toggle('active', s === id);
    });
    clearAllErrors();
  }

  function clearAllErrors() {
    ['login-error', 'register-error', 'forgot-error', 'new-password-error', 'login-success'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = '';
    });
  }

  function showError(id, msg) {
    const el = document.getElementById(id);
    if (el) el.textContent = msg;
  }

  function setButtonLoading(btn, loading) {
    btn.disabled = loading;
    btn.dataset.originalText = btn.dataset.originalText || btn.textContent;
    btn.textContent = loading ? '처리 중...' : btn.dataset.originalText;
  }

  function showAuthUI() {
    const el = document.getElementById('auth-container');
    if (el) el.style.display = 'flex';
    if (onLogout) onLogout();
  }

  function hideAuthUI() {
    const el = document.getElementById('auth-container');
    if (el) el.style.display = 'none';
  }

  /* ── Utility ── */
  // M-3: null 체크 추가
  function clearField(id) {
    const input = document.getElementById(id);
    if (!input) return;
    input.value = '';
    input.focus();
    toggleClear(id);
  }

  function toggleClear(id) {
    const input = document.getElementById(id);
    const btn = document.getElementById('clear-' + id);
    if (btn) btn.style.display = input?.value ? 'block' : 'none';
  }

  // U-2: 이메일 형식 검증 추가
  function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function validatePassword(pw) {
    if (pw.length < 8)            return '비밀번호는 8자 이상이어야 합니다.';
    if (!/\d/.test(pw))           return '숫자를 포함해야 합니다.';
    if (!/[^A-Za-z0-9]/.test(pw)) return '특수문자를 포함해야 합니다.';
    return null;
  }

  function clearLoginForm() {
    ['login-email', 'login-password'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.value = ''; toggleClear(id); }
    });
    const s = document.getElementById('login-success');
    const e = document.getElementById('login-error');
    if (s) s.textContent = '';
    if (e) e.textContent = '';
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  // D-2: INSERT 실패 여부 로그 추가
  async function ensureProfile(user) {
    try {
      const result = await _supabase.from('profiles').select('id').eq('id', user.id).maybeSingle();
      if (result.error) return;
      if (!result.data) {
        const insertRes = await _supabase.from('profiles').insert({
          id: user.id,
          name: user.user_metadata?.name || '',
        });
        if (insertRes.error) console.warn('Profile insert failed:', insertRes.error);
      }
    } catch (e) {
      console.warn('ensureProfile error:', e);
    }
  }

  /* ── Email redirect detection ── */
  let _isEmailConfirmRedirect = (() => {
    const hash  = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const query = new URLSearchParams(window.location.search);
    const type  = hash.get('type') || query.get('type') || '';
    return type === 'signup' || type === 'email';
  })();

  let _signupSuccess    = false;
  let _recoveryEmail    = null;
  let _isChangingPassword = false; // M-1: 비밀번호 변경 중 플래그

  let _isPasswordRecovery = (() => {
    const hash  = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const query = new URLSearchParams(window.location.search);
    const type  = hash.get('type') || query.get('type') || '';
    return type === 'recovery';
  })();

  /* ── Auth state listener ── */
  _supabase.auth.onAuthStateChange(async (event, session) => {
    // Supabase v2: 페이지 로드 시 SIGNED_IN 대신 INITIAL_SESSION 발생
    if (event === 'INITIAL_SESSION') {
      if (session) {
        if (_isEmailConfirmRedirect || _isPasswordRecovery || _isChangingPassword) return;
        hideAuthUI();
        if (onLogin) onLogin(session.user);
        ensureProfile(session.user); // 화면 표시 후 백그라운드 실행
      } else {
        if (!_isEmailConfirmRedirect && !_isPasswordRecovery) {
          showAuthUI();
          showScreen('screen-login');
        }
      }
      return;
    }

    if (event === 'PASSWORD_RECOVERY') {
      _recoveryEmail      = session?.user.email ?? null;
      _isPasswordRecovery = false;
      history.replaceState(null, '', window.location.pathname);
      showAuthUI();
      showScreen('screen-new-password');
      return;
    }

    if (event === 'SIGNED_IN' && session) {
      // M-1: 비밀번호 변경 중 signInWithPassword 호출이 유발하는 SIGNED_IN 이벤트 무시
      if (_isEmailConfirmRedirect || _isPasswordRecovery || _isChangingPassword) return;
      hideAuthUI();
      if (onLogin) onLogin(session.user);
      ensureProfile(session.user); // 화면 표시 후 백그라운드 실행
      return;
    }

    if (event === 'SIGNED_OUT') {
      if (_isEmailConfirmRedirect) return;
      clearLoginForm();
      showAuthUI();
      showScreen('screen-login');
      if (_signupSuccess) {
        _signupSuccess = false;
        const el = document.getElementById('login-success');
        if (el) el.textContent = '가입이 완료됐습니다. 로그인해주세요.';
      }
    }
  });

  /* ── Navigation links ── */
  const nav = {
    'link-register':                    'screen-register',
    'link-forgot':                      'screen-forgot',
    'link-login-from-register':         'screen-login',
    'link-login-from-register-confirm': 'screen-login',
    'link-login-from-forgot':           'screen-login',
    'link-login-from-forgot-confirm':   'screen-login',
    'link-login-from-new-password':     'screen-login',
  };
  Object.entries(nav).forEach(([id, screen]) => {
    document.getElementById(id)?.addEventListener('click', () => showScreen(screen));
  });

  /* ── Input clear buttons ── */
  ['login-email', 'login-password'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', () => toggleClear(id));
    document.getElementById('clear-' + id)?.addEventListener('click', () => clearField(id));
  });

  /* ── Enter key → button click ── */
  [
    ['form-login',        'btn-login-submit'],
    ['form-register',     'btn-register-submit'],
    ['form-forgot',       'btn-forgot-submit'],
    ['form-new-password', 'btn-new-password-submit'],
  ].forEach(([formId, btnId]) => {
    document.getElementById(formId)?.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        document.getElementById(btnId)?.click();
      }
    });
  });

  /* ── Form: Login ── */
  document.getElementById('btn-login-submit').addEventListener('click', async function () {
    const email    = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const btn      = this;

    // U-5: 제출 시 성공 메시지도 초기화
    showError('login-error', '');
    const successEl = document.getElementById('login-success');
    if (successEl) successEl.textContent = '';

    if (!email || !password) { showError('login-error', '이메일과 비밀번호를 입력해주세요.'); return; }
    // U-2: 이메일 형식 검증
    if (!validateEmail(email)) { showError('login-error', '올바른 이메일 형식을 입력해주세요.'); return; }

    setButtonLoading(btn, true);
    try {
      const result = await _supabase.auth.signInWithPassword({ email, password });
      if (result.error) {
        const msg = result.error.message || '';
        if (msg.includes('Email not confirmed')) {
          showError('login-error', '이메일 인증을 완료해주세요. 메일함을 확인하세요.');
        } else if (msg.includes('Invalid login credentials') || msg.includes('invalid_credentials')) {
          showError('login-error', '이메일 또는 비밀번호가 올바르지 않습니다.');
        } else {
          showError('login-error', msg);
        }
      }
    } catch (err) {
      showError('login-error', '오류가 발생했습니다. 다시 시도해주세요.');
      console.error('login error:', err);
    } finally {
      setButtonLoading(btn, false);
    }
  });

  /* ── Form: Register ── */
  document.getElementById('btn-register-submit').addEventListener('click', async function () {
    const name     = document.getElementById('reg-name').value.trim();
    const email    = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const btn      = this;

    showError('register-error', '');
    if (!name || !email || !password) { showError('register-error', '모든 항목을 입력해주세요.'); return; }
    // U-2: 이메일 형식 검증
    if (!validateEmail(email)) { showError('register-error', '올바른 이메일 형식을 입력해주세요.'); return; }

    const pwErr = validatePassword(password);
    if (pwErr) { showError('register-error', pwErr); return; }

    setButtonLoading(btn, true);
    try {
      const result = await _supabase.auth.signUp({
        email, password,
        options: {
          data: { name },
          emailRedirectTo: window.location.origin + window.location.pathname,
        },
      });

      if (result.error) {
        const msg = result.error.message || '';
        if (msg.includes('rate limit') || msg.includes('email rate')) {
          showError('register-error', '이메일 발송 한도를 초과했습니다. 잠시 후 다시 시도해주세요.');
        } else {
          showError('register-error', msg || '회원가입 중 오류가 발생했습니다.');
        }
        return;
      }

      if (result.data?.session) {
        _signupSuccess = true;
        await _supabase.auth.signOut();
        return;
      }

      document.getElementById('register-confirm-text').innerHTML =
        '계정 생성을 완료하기 위해\n<span class="highlight">' + escapeHtml(email) + '</span> 계정으로\n확인 메일을 보냈습니다.';
      showScreen('screen-register-confirm');
    } catch (err) {
      showError('register-error', '오류가 발생했습니다. 다시 시도해주세요.');
      console.error('register error:', err);
    } finally {
      setButtonLoading(btn, false);
    }
  });

  /* ── Form: Forgot Password ── */
  document.getElementById('btn-forgot-submit').addEventListener('click', async function () {
    const email = document.getElementById('forgot-email').value.trim();
    const btn   = this;

    showError('forgot-error', '');
    if (!email) { showError('forgot-error', '이메일을 입력해주세요.'); return; }
    // U-2: 이메일 형식 검증
    if (!validateEmail(email)) { showError('forgot-error', '올바른 이메일 형식을 입력해주세요.'); return; }

    setButtonLoading(btn, true);
    try {
      const result = await _supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + window.location.pathname,
      });

      if (result.error) {
        showError('forgot-error', result.error.message || '비밀번호 재설정 이메일 전송 중 오류가 발생했습니다.');
        return;
      }

      document.getElementById('forgot-confirm-text').innerHTML =
        '비밀번호를 재설정하기 위해\n<span class="highlight">' + escapeHtml(email) + '</span> 계정으로\n확인 메일을 보냈습니다.';
      showScreen('screen-forgot-confirm');
    } catch (err) {
      showError('forgot-error', '오류가 발생했습니다. 다시 시도해주세요.');
      console.error('forgot password error:', err);
    } finally {
      setButtonLoading(btn, false);
    }
  });

  /* ── Form: New Password ── */
  document.getElementById('btn-new-password-submit').addEventListener('click', async function () {
    const currentPw = document.getElementById('current-password').value;
    const newPw     = document.getElementById('new-password').value;
    const confirmPw = document.getElementById('confirm-password').value;
    const btn       = this;

    showError('new-password-error', '');
    if (!currentPw) { showError('new-password-error', '현재 비밀번호를 입력해주세요.'); return; }
    if (!newPw)     { showError('new-password-error', '새 비밀번호를 입력해주세요.'); return; }

    const pwErr = validatePassword(newPw);
    if (pwErr) { showError('new-password-error', pwErr); return; }

    if (newPw !== confirmPw) { showError('new-password-error', '새 비밀번호와 비밀번호 확인이 일치하지 않습니다.'); return; }
    if (currentPw === newPw) { showError('new-password-error', '현재 비밀번호와 동일한 비밀번호로는 변경할 수 없습니다.'); return; }

    // N-1: try/finally로 예외 발생 시에도 플래그·버튼 상태 반드시 복원
    _isChangingPassword = true;
    setButtonLoading(btn, true);

    try {
      const sessionRes = await _supabase.auth.getSession();
      const email = _recoveryEmail ?? sessionRes.data?.session?.user.email ?? null;

      if (!email) {
        showError('new-password-error', '세션이 만료됐습니다. 비밀번호 재설정 이메일을 다시 요청해주세요.');
        return;
      }

      const verifyRes = await _supabase.auth.signInWithPassword({ email, password: currentPw });
      if (verifyRes.error) {
        showError('new-password-error', '현재 비밀번호가 올바르지 않습니다.');
        return;
      }

      const result = await _supabase.auth.updateUser({ password: newPw });
      if (result.error) {
        showError('new-password-error', result.error.message || '비밀번호 변경 중 오류가 발생했습니다.');
        return;
      }

      // N-2: signOut 완료 후 플래그 해제 — updateUser가 SIGNED_IN 이벤트를 유발해도 차단 유지
      await _supabase.auth.signOut();
      _isChangingPassword = false;

      // U-1: 비밀번호 변경 성공 메시지
      showAuthUI();
      showScreen('screen-login');
      const successEl = document.getElementById('login-success');
      if (successEl) successEl.textContent = '비밀번호가 변경됐습니다. 새 비밀번호로 로그인해주세요.';
    } catch (err) {
      showError('new-password-error', '오류가 발생했습니다. 다시 시도해주세요.');
      console.error('password change error:', err);
    } finally {
      _isChangingPassword = false;
      setButtonLoading(btn, false);
    }
  });

  /* ── Init: check existing session ── */
  // U-4: setTimeout(clearLoginForm, 200) 제거 — autocomplete="new-password"로 충분
  clearLoginForm();

  if (_isEmailConfirmRedirect) {
    history.replaceState(null, '', window.location.pathname);
    const r = await _supabase.auth.getSession();
    if (r.data?.session) await _supabase.auth.signOut();
    _isEmailConfirmRedirect = false;
    showAuthUI();
    showScreen('screen-login');
    const el = document.getElementById('login-success');
    if (el) el.textContent = '이메일 인증이 완료됐습니다. 로그인해주세요.';
    return { supabase: _supabase, signOut: () => _supabase.auth.signOut() };
  }

  if (_isPasswordRecovery) {
    showAuthUI();
    showScreen('screen-new-password');
    return { supabase: _supabase, signOut: () => _supabase.auth.signOut() };
  }

  const result = await _supabase.auth.getSession();
  if (result.data?.session) {
    hideAuthUI();
    if (onLogin) onLogin(result.data.session.user);
    ensureProfile(result.data.session.user); // 화면 표시 후 백그라운드 실행
  } else {
    showAuthUI();
    showScreen('screen-login');
  }

  return { supabase: _supabase, signOut: () => _supabase.auth.signOut() };
}
