/**
 * auth.js — Login (e-mail + one-time code), logout, forced logout.
 */
var Auth = {
  showLogin: function (message) {
    U.qs('#app-shell').classList.add('d-none');
    var v = U.qs('#login-view');
    v.classList.remove('d-none');
    var demo = API.isDemo();
    v.innerHTML = '<div class="login-card">' +
      '<div class="login-brand"><div class="brand-mark"><i class="bi bi-check2-square"></i></div><div><div class="fw-bold fs-5">' + U.esc(APP_CONFIG.APP_NAME) + '</div><div class="small-muted">' + U.esc(APP_CONFIG.COMPANY_NAME) + '</div></div></div>' +
      '<div class="login-steps"><span class="on" data-step="1"></span><span data-step="2"></span></div>' +
      (message ? '<div class="alert alert-warning py-2 small">' + U.esc(message) + '</div>' : '') +
      '<div id="login-step-email"><h5 class="mb-1">Sign in</h5><p class="text-muted mb-3">Enter your authorized work e-mail. We will send you a one-time login code.</p>' +
      '<form id="login-form-email"><label class="form-label">Work e-mail</label><input type="email" class="form-control form-control-lg" name="email" required autocomplete="email" placeholder="you@company.com" value="' + U.attr(localStorage.getItem('dwtp_last_email') || '') + '">' +
      '<button class="btn btn-primary btn-lg w-100 mt-3" type="submit"><i class="bi bi-send me-2"></i>Send login code</button></form>' +
      (demo ? '<div class="demo-hint mt-3"><b>Demo mode</b> — no backend configured. Try one of the sample accounts:<br>' +
        '<div class="mt-1 d-flex flex-wrap gap-1">' + [['mis@oakcraft.in', 'Super Admin'], ['priya.nair@example.com', 'Manager'], ['rahul.sharma@example.com', 'Sales Exec'], ['deepak.yadav@example.com', 'MIS Exec'], ['arjun.desai@example.com', 'Designer']].map(function (a) { return '<button type="button" class="btn btn-sm btn-outline-primary" data-demo-email="' + a[0] + '">' + a[1] + '</button>'; }).join('') + '</div><div class="mt-1">The code is shown on screen instead of e-mailed.</div></div>' : '') +
      '</div>' +
      '<div id="login-step-otp" class="d-none"><h5 class="mb-1">Enter your code</h5><p class="text-muted mb-3">We sent a ' + '6-digit code to <b id="login-email-label"></b>.</p>' +
      '<form id="login-form-otp"><input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="6" class="form-control form-control-lg otp-input" name="otp" required autocomplete="one-time-code" placeholder="••••••">' +
      '<div id="demo-otp" class="demo-hint mt-2 d-none"></div>' +
      '<button class="btn btn-primary btn-lg w-100 mt-3" type="submit"><i class="bi bi-box-arrow-in-right me-2"></i>Verify & sign in</button>' +
      '<button class="btn btn-link w-100 mt-1" type="button" id="login-back">Use a different e-mail</button></form></div>' +
      '</div><div class="login-foot">Secure e-mail based authentication · Role-based access · ' + U.esc(APP_CONFIG.APP_NAME) + '</div>';

    U.qsa('[data-demo-email]', v).forEach(function (b) { b.addEventListener('click', function () { U.qs('[name=email]', v).value = b.getAttribute('data-demo-email'); U.qs('#login-form-email').requestSubmit(); }); });
    U.qs('#login-form-email').addEventListener('submit', function (e) {
      e.preventDefault();
      var email = U.qs('[name=email]', v).value.trim().toLowerCase();
      API.call('auth.requestOtp', { email: email }).then(function (d) {
        localStorage.setItem('dwtp_last_email', email);
        U.qs('#login-email-label').textContent = email;
        U.qs('#login-step-email').classList.add('d-none'); U.qs('#login-step-otp').classList.remove('d-none');
        U.qs('[data-step="2"]').classList.add('on');
        if (d.demoOtp) { var h = U.qs('#demo-otp'); h.classList.remove('d-none'); h.innerHTML = 'Demo login code: <b class="fs-5">' + U.esc(d.demoOtp) + '</b>'; U.qs('[name=otp]', v).value = d.demoOtp; }
        else App.toast('Login code sent to ' + email, 'success');
        U.qs('[name=otp]', v).focus();
      }).catch(function () { });
    });
    U.qs('#login-back').addEventListener('click', function () { U.qs('#login-step-otp').classList.add('d-none'); U.qs('#login-step-email').classList.remove('d-none'); U.qs('[data-step="2"]').classList.remove('on'); });
    U.qs('#login-form-otp').addEventListener('submit', function (e) {
      e.preventDefault();
      var email = U.qs('#login-email-label').textContent, otp = U.qs('[name=otp]', v).value.trim();
      API.call('auth.verifyOtp', { email: email, otp: otp }).then(function (d) {
        API.setToken(d.token);
        return API.call('meta.bootstrap');
      }).then(function (boot) { App.toast('Welcome, ' + boot.user.name, 'success'); App.start(boot); }).catch(function () { });
    });
  },

  logout: function () {
    API.call('auth.logout', {}, { silent: true }).catch(function () { }).then(function () { Auth.forceLogout(); });
  },

  forceLogout: function (message) {
    API.setToken('');
    App.state.user = null; App.state.boot = null;
    clearInterval(App.state.timerTick);
    location.hash = '#/login';
    Auth.showLogin(message);
  }
};
