export function injectAuthUI() {
  const container = document.createElement('div');
  container.id = 'auth-container';
  container.style.display = 'none';
  container.innerHTML = `
    <div class="auth-card">

      <div id="screen-login" class="screen active">
        <h1>계정에 로그인하세요.</h1>
        <p class="auth-subtitle">서비스를 이용하려면 로그인이 필요합니다.</p>
        <form id="form-login" novalidate>
          <div class="field">
            <label for="login-email">이메일</label>
            <div class="input-wrap">
              <input type="email" id="login-email" name="login-email-field" maxlength="100" autocomplete="off" />
              <button type="button" class="btn-clear" id="clear-login-email" tabindex="-1">&#10005;</button>
            </div>
          </div>
          <div class="field">
            <div class="field-header">
              <label for="login-password">비밀번호</label>
              <a class="link-small" id="link-forgot">비밀번호를 잊으셨나요?</a>
            </div>
            <div class="input-wrap">
              <input type="password" id="login-password" name="login-password-field" maxlength="100" autocomplete="off" />
              <button type="button" class="btn-clear" id="clear-login-password" tabindex="-1">&#10005;</button>
            </div>
          </div>
          <div class="success-msg" id="login-success"></div>
          <div class="error-msg" id="login-error"></div>
          <button type="button" class="btn-primary" id="btn-login-submit">로그인</button>
        </form>
        <div class="auth-footer">
          계정이 없으신가요?
          <a id="link-register">계정을 만드세요</a>
        </div>
      </div>

      <div id="screen-register" class="screen">
        <h1>계정을 만드세요.</h1>
        <form id="form-register" novalidate>
          <div class="field">
            <label for="reg-name">성명</label>
            <input type="text" id="reg-name" name="name" maxlength="100" autocomplete="name" />
          </div>
          <div class="field">
            <label for="reg-email">이메일</label>
            <input type="email" id="reg-email" name="email" maxlength="100" autocomplete="email" />
          </div>
          <div class="field">
            <label for="reg-password">비밀번호</label>
            <input type="password" id="reg-password" name="password" maxlength="100" autocomplete="new-password" />
            <p class="pw-hint">※ 비밀 번호 설정 조건<br>- 최소 8자 이상이며 숫자, 특수문자 포함</p>
          </div>
          <div class="error-msg" id="register-error"></div>
          <button type="button" class="btn-primary" id="btn-register-submit">가입하기</button>
        </form>
        <div class="auth-footer">
          이미 계정이 있으신가요?
          <a id="link-login-from-register">로그인하세요</a>
        </div>
      </div>

      <div id="screen-register-confirm" class="screen">
        <h1>계정을 만드세요.</h1>
        <p class="confirm-text" id="register-confirm-text"></p>
        <div class="auth-footer">
          이미 계정이 있으신가요?
          <a id="link-login-from-register-confirm">로그인하세요</a>
        </div>
      </div>

      <div id="screen-forgot" class="screen">
        <h1>비밀번호를 재설정하세요.</h1>
        <form id="form-forgot" novalidate>
          <div class="field">
            <label for="forgot-email">이메일</label>
            <input type="email" id="forgot-email" name="email" maxlength="100" autocomplete="email" />
          </div>
          <div class="error-msg" id="forgot-error"></div>
          <button type="button" class="btn-primary" id="btn-forgot-submit">비밀번호 재설정</button>
        </form>
        <div class="auth-footer">
          <a id="link-login-from-forgot">로그인 페이지로 돌아가기</a>
        </div>
      </div>

      <div id="screen-forgot-confirm" class="screen">
        <h1>비밀번호를 재설정하세요.</h1>
        <p class="confirm-text" id="forgot-confirm-text"></p>
        <div class="auth-footer">
          <a id="link-login-from-forgot-confirm">로그인 페이지로 돌아가기</a>
        </div>
      </div>

      <div id="screen-new-password" class="screen">
        <h1>새 비밀번호를 설정하세요.</h1>
        <form id="form-new-password" novalidate>
          <div class="field">
            <label for="current-password">현재 비밀번호</label>
            <input type="password" id="current-password" name="current-password" maxlength="100" autocomplete="current-password" />
          </div>
          <div class="field">
            <label for="new-password">새 비밀번호</label>
            <input type="password" id="new-password" name="new-password" maxlength="100" autocomplete="new-password" />
          </div>
          <div class="field">
            <label for="confirm-password">새 비밀번호 확인</label>
            <input type="password" id="confirm-password" name="confirm-password" maxlength="100" autocomplete="new-password" />
            <p class="pw-hint">※ 비밀 번호 설정 조건<br>- 최소 8자 이상이며 숫자, 특수문자 포함</p>
          </div>
          <div class="error-msg" id="new-password-error"></div>
          <button type="button" class="btn-primary" id="btn-new-password-submit">비밀번호 재설정</button>
        </form>
        <div class="auth-footer">
          <a id="link-login-from-new-password">로그인 페이지로 돌아가기</a>
        </div>
      </div>

    </div>
  `;

  const appContainer = document.getElementById('app');
  document.body.insertBefore(container, appContainer);
}
