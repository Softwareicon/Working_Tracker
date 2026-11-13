/**
 * api.js — Secure API client for the Google Apps Script backend.
 * POST body is sent as text/plain (no CORS preflight) and every call carries the session token.
 * In demo mode the same requests are dispatched to the backend bundle running in the browser.
 */
var API = (function () {
  var demoReady = null;

  function token() { return localStorage.getItem(APP_CONFIG.STORAGE_KEYS.TOKEN) || ''; }
  function setToken(t) { if (t) localStorage.setItem(APP_CONFIG.STORAGE_KEYS.TOKEN, t); else localStorage.removeItem(APP_CONFIG.STORAGE_KEYS.TOKEN); }
  function isDemo() { return !APP_CONFIG.API_URL && APP_CONFIG.ALLOW_DEMO_MODE; }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script'); s.src = src; s.onload = resolve; s.onerror = function () { reject(new Error('Failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }

  /** Boot the in-browser backend (demo mode). */
  function ensureDemo() {
    if (demoReady) return demoReady;
    demoReady = loadScript('js/demo/gas-shim.js').then(function () { return loadScript('js/demo/backend-bundle.js'); }).then(function () {
      window.CONFIG.DEMO_MODE = true;
      window.GAS_SHIM.quiet = true;
      var saved = null;
      try { saved = localStorage.getItem(APP_CONFIG.STORAGE_KEYS.DEMO_DB); } catch (e) { }
      if (saved) {
        try { window.GAS_SHIM.import(saved); } catch (e) { saved = null; }
      }
      if (!saved) {
        window.setupDatabase();
        try { window.seedSampleData(); } catch (e) { console.warn('Sample data failed', e); }
        persistDemo();
      }
      window.GAS_SHIM.onMail = function (m) { console.info('[Demo e-mail] to ' + m.to + ': ' + m.subject); };
    });
    return demoReady;
  }

  function persistDemo() {
    try { if (window.GAS_SHIM.isDirty()) { localStorage.setItem(APP_CONFIG.STORAGE_KEYS.DEMO_DB, window.GAS_SHIM.export()); window.GAS_SHIM.clean(); } }
    catch (e) { console.warn('Demo persistence failed (storage full?)', e); }
  }

  function resetDemo() { localStorage.removeItem(APP_CONFIG.STORAGE_KEYS.DEMO_DB); localStorage.removeItem(APP_CONFIG.STORAGE_KEYS.TOKEN); location.reload(); }

  function callDemo(action, payload) {
    return ensureDemo().then(function () {
      var res = window.handleRequest_({ action: action, token: token(), payload: payload || {} });
      persistDemo();
      return JSON.parse(JSON.stringify(res));
    });
  }

  function callRemote(action, payload) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, APP_CONFIG.REQUEST_TIMEOUT_MS) : null;
    return fetch(APP_CONFIG.API_URL, {
      method: 'POST', redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: action, token: token(), payload: payload || {} }),
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (r) {
      if (timer) clearTimeout(timer);
      if (!r.ok) throw new Error('Server responded ' + r.status);
      return r.text();
    }).then(function (text) {
      try { return JSON.parse(text); } catch (e) { throw new Error('Invalid response from server. Check that the Web App is deployed with access "Anyone".'); }
    }).catch(function (e) {
      if (timer) clearTimeout(timer);
      if (e.name === 'AbortError') throw new Error('Request timed out. Please try again.');
      throw e;
    });
  }

  /**
   * call(action, payload, opts) -> Promise<data>. Rejects with Error { code, data } on failure.
   * opts.silent: do not show toast on error. opts.noLoader: do not show the global loader.
   */
  function call(action, payload, opts) {
    opts = opts || {};
    if (!opts.noLoader) App.loading(true);
    var p = isDemo() ? callDemo(action, payload) : callRemote(action, payload);
    return p.then(function (res) {
      if (!opts.noLoader) App.loading(false);
      if (!res || res.success !== true) {
        var err = new Error((res && res.message) || 'Request failed');
        err.code = res && res.code; err.data = res && res.data;
        if (['AUTH_REQUIRED', 'AUTH_INVALID', 'AUTH_EXPIRED', 'AUTH_INACTIVE'].indexOf(err.code) !== -1 && action !== 'auth.verifyOtp' && action !== 'auth.requestOtp') {
          Auth.forceLogout(err.message);
        } else if (!opts.silent) {
          App.toast(err.message, 'danger');
        }
        throw err;
      }
      return res.data;
    }, function (e) {
      if (!opts.noLoader) App.loading(false);
      if (!opts.silent) App.toast(e.message || 'Network error', 'danger');
      throw e;
    });
  }

  return { call: call, token: token, setToken: setToken, isDemo: isDemo, resetDemo: resetDemo, ensureDemo: ensureDemo };
})();
