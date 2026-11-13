/**
 * app.js — Application core: state, routing, layout, shared UI helpers.
 */
var U = {
  esc: function (s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); },
  attr: function (s) { return U.esc(s).replace(/`/g, '&#96;'); },
  pad: function (n) { return (n < 10 ? '0' : '') + n; },
  today: function () { var d = new Date(); return d.getFullYear() + '-' + U.pad(d.getMonth() + 1) + '-' + U.pad(d.getDate()); },
  addDays: function (dateStr, n) { var p = dateStr.split('-'); var d = new Date(+p[0], +p[1] - 1, +p[2] + n); return d.getFullYear() + '-' + U.pad(d.getMonth() + 1) + '-' + U.pad(d.getDate()); },
  nowLocal: function () { var d = new Date(); return U.today() + 'T' + U.pad(d.getHours()) + ':' + U.pad(d.getMinutes()) + ':' + U.pad(d.getSeconds()); },
  dmy: function (s) { if (!s) return ''; var p = String(s).substring(0, 10).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : s; },
  longDate: function (s) { if (!s) return ''; var p = String(s).substring(0, 10).split('-'); var d = new Date(+p[0], +p[1] - 1, +p[2]); return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); },
  time12: function (s) { if (!s) return ''; var m = String(s).match(/T(\d{2}):(\d{2})/); if (!m) { m = String(s).match(/^(\d{2}):(\d{2})/); if (!m) return s; } var h = +m[1], mi = m[2]; return ((h % 12) || 12) + ':' + mi + ' ' + (h < 12 ? 'AM' : 'PM'); },
  dur: function (min) { min = Math.round(+min || 0); var h = Math.floor(min / 60), m = min % 60; if (h && m) return h + 'h ' + m + 'm'; if (h) return h + 'h'; return m + 'm'; },
  durLong: function (min) { min = Math.round(+min || 0); var h = Math.floor(min / 60), m = min % 60; var parts = []; if (h) parts.push(h + (h === 1 ? ' Hour' : ' Hours')); if (m || !h) parts.push(m + (m === 1 ? ' Minute' : ' Minutes')); return parts.join(' '); },
  hms: function (sec) { sec = Math.max(0, Math.floor(sec)); return U.pad(Math.floor(sec / 3600)) + ':' + U.pad(Math.floor((sec % 3600) / 60)) + ':' + U.pad(sec % 60); },
  initials: function (name) { return String(name || '?').split(/\s+/).slice(0, 2).map(function (w) { return w.charAt(0).toUpperCase(); }).join(''); },
  st: function (status) { var s = String(status || '').toUpperCase(); return '<span class="st st-' + U.attr(s.replace(/ /g, '_')) + '">' + U.esc(s.replace(/_/g, ' ')) + '</span>'; },
  pct: function (n) { return (Math.round((+n || 0) * 10) / 10) + '%'; },
  opts: function (list, selected, labelFn) { return (list || []).map(function (x) { var v = typeof x === 'object' ? x.value : x; var l = typeof x === 'object' ? x.label : (labelFn ? labelFn(x) : x); return '<option value="' + U.attr(v) + '"' + (String(v) === String(selected) ? ' selected' : '') + '>' + U.esc(l) + '</option>'; }).join(''); },
  qs: function (sel, root) { return (root || document).querySelector(sel); },
  qsa: function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); },
  formData: function (form) { var o = {}; U.qsa('[name]', form).forEach(function (el) { if (el.type === 'checkbox') o[el.name] = el.checked; else if (el.type === 'radio') { if (el.checked) o[el.name] = el.value; } else o[el.name] = el.value; }); return o; },
  roleLabel: function (r) { return { SUPER_ADMIN: 'Super Admin', ADMIN: 'Admin', DEPARTMENT_MANAGER: 'Department Manager', EMPLOYEE: 'Employee' }[r] || r; },
  copy: function (text) { if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text); var ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) { } document.body.removeChild(ta); return Promise.resolve(); },
  download: function (filename, content, mime) { var blob = new Blob([content], { type: mime || 'text/plain' }); var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500); },
  debounce: function (fn, ms) { var t; return function () { var args = arguments, self = this; clearTimeout(t); t = setTimeout(function () { fn.apply(self, args); }, ms); }; },
  nl2br: function (s) { return U.esc(s).replace(/\n/g, '<br>'); },
  sum: function (arr, f) { return (arr || []).reduce(function (n, x) { return n + (+(f ? f(x) : x) || 0); }, 0); }
};

var CHART_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
var STATUS_COLORS = { COMPLETED: '#1f8a4c', 'IN PROGRESS': '#2a78d6', PENDING: '#64748b', 'ON HOLD': '#d98c00', BLOCKED: '#d43c3c' };

var App = {
  state: { user: null, boot: null, route: '', loading: 0, timerTick: null, running: null },
  views: {},
  nav: [
    { hash: '#/dashboard', label: 'Dashboard', icon: 'bi-speedometer2', roles: ['ALL'] },
    { hash: '#/tracker', label: 'Daily Work Tracker', icon: 'bi-journal-check', roles: ['ALL'] },
    { section: 'Management' },
    { hash: '#/employees', label: 'Employee Management', icon: 'bi-people', roles: ['SUPER_ADMIN', 'ADMIN', 'DEPARTMENT_MANAGER'] },
    { hash: '#/questionnaire', label: 'Questionnaire Management', icon: 'bi-ui-checks', roles: ['SUPER_ADMIN', 'ADMIN'] },
    { hash: '#/tasks', label: 'Task Management', icon: 'bi-list-task', roles: ['ALL'] },
    { hash: '#/difficulty', label: 'Difficulty Tracker', icon: 'bi-exclamation-triangle', roles: ['ALL'] },
    { section: 'Reports & insights' },
    { hash: '#/mis', label: 'Weekly MIS', icon: 'bi-calendar-week', roles: ['ALL'] },
    { hash: '#/reports', label: 'Employee Reports', icon: 'bi-file-earmark-text', roles: ['ALL'] },
    { hash: '#/department-reports', label: 'Department Reports', icon: 'bi-diagram-3', roles: ['SUPER_ADMIN', 'ADMIN', 'DEPARTMENT_MANAGER'] },
    { hash: '#/analytics', label: 'Analytics', icon: 'bi-bar-chart-line', roles: ['SUPER_ADMIN', 'ADMIN', 'DEPARTMENT_MANAGER'] },
    { section: 'System' },
    { hash: '#/settings', label: 'Settings', icon: 'bi-gear', roles: ['SUPER_ADMIN', 'ADMIN'] }
  ],

  init: function () {
    window.addEventListener('hashchange', function () { App.route(); });
    U.qs('#sidebar-toggle').addEventListener('click', function () { App.sidebar(true); });
    U.qs('#sidebar-close').addEventListener('click', function () { App.sidebar(false); });
    U.qs('#sidebar-backdrop').addEventListener('click', function () { App.sidebar(false); });
    U.qs('#btn-logout').addEventListener('click', function () { Auth.logout(); });
    document.title = APP_CONFIG.APP_NAME;
    if (API.isDemo()) U.qs('#demo-pill').classList.remove('d-none');
    if (API.token()) {
      API.call('meta.bootstrap', {}, { silent: true }).then(function (boot) { App.start(boot); }).catch(function () { Auth.showLogin(); });
    } else Auth.showLogin();
  },

  start: function (boot) {
    App.state.boot = boot; App.state.user = boot.user;
    localStorage.setItem(APP_CONFIG.STORAGE_KEYS.USER, JSON.stringify(boot.user));
    U.qs('#login-view').classList.add('d-none');
    U.qs('#app-shell').classList.remove('d-none');
    U.qs('#topbar-date').textContent = U.longDate(U.today());
    App.renderNav();
    if (!location.hash || location.hash === '#/' || location.hash === '#/login') location.hash = '#/dashboard';
    App.route();
    App.refreshRunningTimer();
  },

  refreshBoot: function () { return API.call('meta.bootstrap', {}, { silent: true, noLoader: true }).then(function (b) { App.state.boot = b; App.state.user = b.user; return b; }); },

  can: function (roles) { if (!roles || roles.indexOf('ALL') !== -1) return true; return roles.indexOf(App.state.user.role) !== -1; },
  isAdmin: function () { return ['SUPER_ADMIN', 'ADMIN'].indexOf(App.state.user.role) !== -1; },
  isManager: function () { return App.state.user.role === 'DEPARTMENT_MANAGER'; },
  isManagerUp: function () { return App.isAdmin() || App.isManager(); },

  renderNav: function () {
    var u = App.state.user;
    var html = '';
    App.nav.forEach(function (n) {
      if (n.section) { html += '<div class="nav-section">' + U.esc(n.section) + '</div>'; return; }
      if (!App.can(n.roles)) return;
      html += '<a href="' + n.hash + '" data-hash="' + n.hash + '"><i class="bi ' + n.icon + '"></i><span>' + U.esc(n.label) + '</span></a>';
    });
    U.qs('#main-nav').innerHTML = html;
    U.qs('#sidebar-user').innerHTML = '<div class="avatar">' + U.esc(U.initials(u.name)) + '</div><div><div class="name">' + U.esc(u.name) + '</div><div class="role">' + U.esc(U.roleLabel(u.role)) + (u.department ? ' · ' + U.esc(u.department) : '') + '</div></div>';
  },

  route: function () {
    if (!App.state.user) return;
    var hash = location.hash.split('?')[0] || '#/dashboard';
    var query = {};
    (location.hash.split('?')[1] || '').split('&').forEach(function (kv) { if (!kv) return; var p = kv.split('='); query[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || ''); });
    var item = App.nav.filter(function (n) { return n.hash === hash; })[0];
    if (item && !App.can(item.roles)) { App.toast('You do not have access to that module', 'warning'); location.hash = '#/dashboard'; return; }
    U.qsa('#main-nav a').forEach(function (a) { a.classList.toggle('active', a.getAttribute('data-hash') === hash); });
    U.qs('#topbar-title').textContent = item ? item.label : 'Daily Work Tracker Pro';
    App.sidebar(false);
    App.state.route = hash;
    var view = App.views[hash];
    var el = U.qs('#view');
    if (!view) { el.innerHTML = '<div class="empty"><i class="bi bi-signpost"></i>Page not found</div>'; return; }
    el.innerHTML = '<div class="text-center py-5 text-muted"><div class="spinner-border spinner-border-sm me-2"></div>Loading…</div>';
    Promise.resolve(view(el, query)).catch(function (e) { console.error(e); el.innerHTML = '<div class="empty"><i class="bi bi-exclamation-octagon"></i>' + U.esc(e.message || 'Something went wrong') + '</div>'; });
    window.scrollTo(0, 0);
  },

  go: function (hash, params) {
    var q = params ? '?' + Object.keys(params).filter(function (k) { return params[k] !== undefined && params[k] !== ''; }).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); }).join('&') : '';
    if (location.hash === hash + q) App.route(); else location.hash = hash + q;
  },

  sidebar: function (open) { U.qs('#sidebar').classList.toggle('open', !!open); U.qs('#sidebar-backdrop').classList.toggle('show', !!open); },

  loading: function (on) { App.state.loading += on ? 1 : -1; if (App.state.loading < 0) App.state.loading = 0; U.qs('#global-loader').classList.toggle('d-none', App.state.loading === 0); },

  toast: function (msg, type, ms) {
    var id = 't' + Date.now() + Math.random().toString(36).slice(2, 6);
    var icon = { success: 'bi-check-circle', danger: 'bi-x-circle', warning: 'bi-exclamation-triangle', info: 'bi-info-circle' }[type || 'info'];
    U.qs('#toast-container').insertAdjacentHTML('beforeend', '<div id="' + id + '" class="toast align-items-center text-bg-' + (type || 'primary') + ' border-0" role="alert"><div class="d-flex"><div class="toast-body"><i class="bi ' + icon + ' me-2"></i>' + U.esc(msg) + '</div><button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button></div></div>');
    var el = document.getElementById(id);
    var t = new bootstrap.Toast(el, { delay: ms || (type === 'danger' ? 6000 : 3500) });
    el.addEventListener('hidden.bs.toast', function () { el.remove(); });
    t.show();
  },

  /** Modal helper: returns {el, modal, close}. opts: {title, body, footer, size, onShown} */
  modal: function (opts) {
    var id = 'm' + Date.now() + Math.random().toString(36).slice(2, 6);
    U.qs('#modal-host').insertAdjacentHTML('beforeend',
      '<div class="modal fade" id="' + id + '" tabindex="-1"><div class="modal-dialog ' + (opts.size ? 'modal-' + opts.size : '') + ' modal-dialog-scrollable"><div class="modal-content">' +
      '<div class="modal-header"><h5 class="modal-title">' + opts.title + '</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>' +
      '<div class="modal-body">' + opts.body + '</div>' + (opts.footer ? '<div class="modal-footer">' + opts.footer + '</div>' : '') + '</div></div></div>');
    var el = document.getElementById(id);
    var m = new bootstrap.Modal(el, { backdrop: opts.static ? 'static' : true });
    el.addEventListener('hidden.bs.modal', function () { el.remove(); });
    if (opts.onShown) el.addEventListener('shown.bs.modal', function () { opts.onShown(el); });
    m.show();
    return { el: el, modal: m, close: function () { m.hide(); } };
  },

  confirm: function (message, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var m = App.modal({ title: opts.title || 'Please confirm', body: '<p class="mb-0">' + message + '</p>', footer: '<button class="btn btn-light" data-bs-dismiss="modal">Cancel</button><button class="btn btn-' + (opts.danger ? 'danger' : 'primary') + '" data-ok>' + U.esc(opts.okText || 'Confirm') + '</button>' });
      var done = false;
      U.qs('[data-ok]', m.el).addEventListener('click', function () { done = true; m.close(); resolve(true); });
      m.el.addEventListener('hidden.bs.modal', function () { if (!done) resolve(false); });
    });
  },

  prompt: function (title, label, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var m = App.modal({ title: title, body: '<label class="form-label">' + U.esc(label) + '</label>' + (opts.textarea ? '<textarea class="form-control" rows="3" data-in>' + U.esc(opts.value || '') + '</textarea>' : '<input class="form-control" data-in value="' + U.attr(opts.value || '') + '" placeholder="' + U.attr(opts.placeholder || '') + '">'),
        footer: '<button class="btn btn-light" data-bs-dismiss="modal">Cancel</button><button class="btn btn-primary" data-ok>' + U.esc(opts.okText || 'OK') + '</button>', onShown: function (el) { U.qs('[data-in]', el).focus(); } });
      var done = false;
      U.qs('[data-ok]', m.el).addEventListener('click', function () { done = true; var v = U.qs('[data-in]', m.el).value; m.close(); resolve(v); });
      m.el.addEventListener('hidden.bs.modal', function () { if (!done) resolve(null); });
    });
  },

  /** Keep the top-bar timer indicator in sync. */
  refreshRunningTimer: function () {
    API.call('tasks.list', { employeeId: App.state.user.employeeId, date: U.today() }, { silent: true, noLoader: true }).then(function (d) {
      var r = (d.tasks || []).filter(function (t) { return t.TimerState === 'RUNNING'; })[0];
      App.setRunning(r || null);
    }).catch(function () { });
  },
  setRunning: function (task) {
    App.state.running = task;
    var el = U.qs('#topbar-timer');
    clearInterval(App.state.timerTick);
    if (!task) { el.classList.add('d-none'); return; }
    el.classList.remove('d-none');
    var base = (task.TimeSpentMinutes || 0) * 60, since = Date.now();
    var tick = function () { U.qs('span', el).textContent = task.TaskTitle.substring(0, 28) + ' · ' + U.hms(base + (Date.now() - since) / 1000); };
    tick(); App.state.timerTick = setInterval(tick, APP_CONFIG.TIMER_TICK_MS);
    el.onclick = function () { App.go('#/tracker'); };
  },

  /** Shared filter bar builder. fields: [{name,label,type:'date'|'select'|'text',options,value}] */
  filterBar: function (fields, extraHtml) {
    return '<form class="filters" data-filters onsubmit="return false">' + fields.map(function (f) {
      var ctrl = f.type === 'select' ? '<select class="form-select form-select-sm" name="' + f.name + '"><option value="">' + U.esc(f.placeholder || 'All') + '</option>' + U.opts(f.options, f.value) + '</select>'
        : '<input type="' + (f.type || 'text') + '" class="form-control form-control-sm" name="' + f.name + '" value="' + U.attr(f.value || '') + '" placeholder="' + U.attr(f.placeholder || '') + '">';
      return '<div' + (f.narrow ? ' class="w-auto"' : '') + '><label class="form-label">' + U.esc(f.label) + '</label>' + ctrl + '</div>';
    }).join('') + '<div class="w-auto"><button class="btn btn-primary btn-sm" data-apply><i class="bi bi-funnel me-1"></i>Apply</button></div>' + (extraHtml || '') + '</form>';
  },

  employeeOptions: function (list) { return (list || App.state.boot.employees).map(function (e) { return { value: e.EmployeeID, label: e.EmployeeName + ' (' + e.Designation + ')' }; }); },
  deptOptions: function () { return App.state.boot.departments.map(function (d) { return d.name; }); },

  kpi: function (label, value, hint, tone, icon) { return '<div class="kpi ' + (tone ? 'tone-' + tone : '') + '">' + (icon ? '<i class="bi ' + icon + ' ico"></i>' : '') + '<div class="label">' + U.esc(label) + '</div><div class="value">' + value + '</div>' + (hint ? '<div class="hint">' + hint + '</div>' : '') + '</div>'; },
  empty: function (msg, icon) { return '<div class="empty"><i class="bi ' + (icon || 'bi-inbox') + '"></i>' + U.esc(msg || 'Nothing here yet') + '</div>'; },

  prefs: function (key, val) {
    var p = {}; try { p = JSON.parse(localStorage.getItem(APP_CONFIG.STORAGE_KEYS.PREFS) || '{}'); } catch (e) { }
    if (val === undefined) return p[key];
    p[key] = val; localStorage.setItem(APP_CONFIG.STORAGE_KEYS.PREFS, JSON.stringify(p));
  }
};
