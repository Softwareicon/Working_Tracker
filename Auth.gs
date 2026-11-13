/**
 * Auth.gs — Authorized e-mail authentication (OTP) + session tokens + server-side RBAC.
 *
 * Flow: client sends e-mail -> if e-mail belongs to an ACTIVE employee (or bootstrap super admin)
 * a one-time code is e-mailed -> client verifies code -> server issues a session token.
 * Tokens are stored hashed (SHA-256) in AUTH_SESSIONS and mirrored in CacheService.
 * Every protected API call resolves the token into a context {email, employeeId, role, employee}.
 */

function authRequestOtp_(ctx, p) {
  var email = trim_(p.email).toLowerCase();
  if (!isEmail_(email)) throw AppError_('Please enter a valid e-mail address', 'VALIDATION');
  var emp = findEmployeeByEmail_(email);
  var isBootstrap = CONFIG.SUPER_ADMIN_EMAILS.map(function (e) { return e.toLowerCase(); }).indexOf(email) !== -1;
  if (!emp && !isBootstrap) throw AppError_('This e-mail is not authorized. Contact your administrator.', 'AUTH_UNAUTHORIZED_EMAIL');
  if (emp && upper_(emp.Status) !== 'ACTIVE') throw AppError_('Your account is inactive. Contact your administrator.', 'AUTH_INACTIVE');

  var otp = '';
  for (var i = 0; i < CONFIG.OTP_LENGTH; i++) otp += Math.floor(Math.random() * 10);
  var cache = CacheService.getScriptCache();
  cache.put('otp:' + email, JSON.stringify({ hash: sha256_(otp + ':' + email), attempts: 0 }), CONFIG.OTP_MINUTES * 60);

  var result = { email: email, expiresInMinutes: CONFIG.OTP_MINUTES };
  if (CONFIG.DEMO_MODE) {
    result.demoOtp = otp;
  } else {
    sendOtpEmail_(email, emp ? emp.EmployeeName : email, otp);
  }
  logActivity_({ email: email }, 'OTP_REQUESTED', 'AUTH', email, '');
  return ok_(result, 'A one-time login code has been sent to ' + email);
}

function authVerifyOtp_(ctx, p) {
  var email = trim_(p.email).toLowerCase();
  var otp = trim_(p.otp);
  var cache = CacheService.getScriptCache();
  var raw = cache.get('otp:' + email);
  if (!raw) throw AppError_('Login code expired or not requested. Please request a new code.', 'AUTH_OTP_EXPIRED');
  var rec = JSON.parse(raw);
  if (rec.attempts >= CONFIG.OTP_MAX_ATTEMPTS) {
    cache.remove('otp:' + email);
    throw AppError_('Too many incorrect attempts. Request a new code.', 'AUTH_OTP_LOCKED');
  }
  if (sha256_(otp + ':' + email) !== rec.hash) {
    rec.attempts++;
    cache.put('otp:' + email, JSON.stringify(rec), CONFIG.OTP_MINUTES * 60);
    throw AppError_('Incorrect login code (' + (CONFIG.OTP_MAX_ATTEMPTS - rec.attempts) + ' attempts left)', 'AUTH_OTP_INVALID');
  }
  cache.remove('otp:' + email);
  var session = createSession_(email);
  return ok_(session, 'Login successful');
}

function createSession_(email) {
  var emp = findEmployeeByEmail_(email);
  var isBootstrap = CONFIG.SUPER_ADMIN_EMAILS.map(function (e) { return e.toLowerCase(); }).indexOf(email) !== -1;
  var role = emp ? (emp.Role || CONFIG.ROLES.EMPLOYEE) : CONFIG.ROLES.SUPER_ADMIN;
  if (isBootstrap) role = CONFIG.ROLES.SUPER_ADMIN;
  var token = randomToken_();
  var hash = sha256_(token);
  var expires = formatDateTime_(new Date(Date.now() + CONFIG.SESSION_HOURS * 3600000));
  var rec = { SessionID: generateId_('SES'), TokenHash: hash, Email: email, EmployeeID: emp ? emp.EmployeeID : 'BOOTSTRAP',
    Role: role, ExpiresAt: expires, LastSeenAt: nowIso_(), Active: true };
  insert_('AUTH_SESSIONS', rec, { email: email });
  CacheService.getScriptCache().put('sess:' + hash, JSON.stringify(rec), 21600);
  logActivity_({ email: email, employeeId: rec.EmployeeID }, 'LOGIN', 'AUTH', email, '');
  pruneSessions_();
  return { token: token, expiresAt: expires, user: userView_(emp, email, role) };
}

function userView_(emp, email, role) {
  return {
    email: email,
    employeeId: emp ? emp.EmployeeID : 'BOOTSTRAP',
    name: emp ? emp.EmployeeName : email,
    designation: emp ? emp.Designation : 'System Administrator',
    department: emp ? emp.Department : '',
    role: role,
    reportingManagerId: emp ? emp.ReportingManagerID : '',
    reportingManagerName: emp ? emp.ReportingManagerName : '',
    workStart: emp && emp.WorkStart ? emp.WorkStart : getSetting_('WORK_START'),
    workEnd: emp && emp.WorkEnd ? emp.WorkEnd : getSetting_('WORK_END'),
    workingHours: emp && emp.WorkingHours ? toNum_(emp.WorkingHours) : toNum_(getSetting_('WORKING_HOURS'), 8),
    breakMinutes: emp && emp.BreakMinutes !== '' ? toNum_(emp.BreakMinutes) : toNum_(getSetting_('BREAK_MINUTES'), 60),
    whatsapp: emp ? (emp.WhatsAppNumber || emp.Mobile) : ''
  };
}

/** Resolve a token into a request context. Throws when invalid. */
function authenticate_(token) {
  token = trim_(token);
  if (!token) throw AppError_('Authentication required', 'AUTH_REQUIRED');
  var hash = sha256_(token);
  var cache = CacheService.getScriptCache();
  var raw = cache.get('sess:' + hash);
  var rec = raw ? JSON.parse(raw) : findOne_('AUTH_SESSIONS', function (s) { return s.TokenHash === hash && toBool_(s.Active); });
  if (!rec) throw AppError_('Session invalid. Please log in again.', 'AUTH_INVALID');
  if (!toBool_(rec.Active)) throw AppError_('Session ended. Please log in again.', 'AUTH_INVALID');
  var exp = parseDateTime_(rec.ExpiresAt);
  if (!exp || exp.getTime() < Date.now()) throw AppError_('Session expired. Please log in again.', 'AUTH_EXPIRED');
  if (!raw) cache.put('sess:' + hash, JSON.stringify(rec), 21600);

  var email = String(rec.Email).toLowerCase();
  var emp = findEmployeeByEmail_(email);
  var isBootstrap = CONFIG.SUPER_ADMIN_EMAILS.map(function (e) { return e.toLowerCase(); }).indexOf(email) !== -1;
  if (!emp && !isBootstrap) throw AppError_('Account no longer exists', 'AUTH_INVALID');
  if (emp && upper_(emp.Status) !== 'ACTIVE') throw AppError_('Account inactive', 'AUTH_INACTIVE');
  var role = isBootstrap ? CONFIG.ROLES.SUPER_ADMIN : (emp.Role || CONFIG.ROLES.EMPLOYEE);
  return { email: email, employeeId: emp ? emp.EmployeeID : 'BOOTSTRAP', role: role, employee: emp, tokenHash: hash, user: userView_(emp, email, role) };
}

function authMe_(ctx) { return ok_({ user: ctx.user, settings: publicSettings_() }); }

function authLogout_(ctx) {
  CacheService.getScriptCache().remove('sess:' + ctx.tokenHash);
  update_('AUTH_SESSIONS', 'TokenHash', ctx.tokenHash, { Active: false }, ctx);
  logActivity_(ctx, 'LOGOUT', 'AUTH', ctx.email, '');
  return ok_({}, 'Logged out');
}

function pruneSessions_() {
  try {
    var rows = readTable_('AUTH_SESSIONS');
    if (rows.length < 200) return;
    var now = Date.now();
    var sh = sheet_('AUTH_SESSIONS');
    for (var i = rows.length - 1; i >= 0; i--) {
      var exp = parseDateTime_(rows[i].ExpiresAt);
      if (!exp || exp.getTime() < now || !toBool_(rows[i].Active)) sh.deleteRow(rows[i]._row);
    }
  } catch (e) { }
}

function publicSettings_() {
  var s = getSettings_();
  return { COMPANY_NAME: s.COMPANY_NAME, WORK_START: s.WORK_START, WORK_END: s.WORK_END, WORKING_HOURS: s.WORKING_HOURS,
    BREAK_MINUTES: s.BREAK_MINUTES, MANUAL_TIME_POLICY: s.MANUAL_TIME_POLICY, WHATSAPP_DEFAULT_NUMBER: s.WHATSAPP_DEFAULT_NUMBER,
    WHATSAPP_MANAGEMENT_NUMBER: s.WHATSAPP_MANAGEMENT_NUMBER, DEFAULT_TIMEZONE: s.DEFAULT_TIMEZONE };
}

// ---------------------------------------------------------------------------------------------
// Authorization helpers
// ---------------------------------------------------------------------------------------------

function isSuperAdmin_(ctx) { return ctx.role === CONFIG.ROLES.SUPER_ADMIN; }
function isAdmin_(ctx) { return ctx.role === CONFIG.ROLES.SUPER_ADMIN || ctx.role === CONFIG.ROLES.ADMIN; }
function isManager_(ctx) { return ctx.role === CONFIG.ROLES.MANAGER; }
function isManagerOrAbove_(ctx) { return isAdmin_(ctx) || isManager_(ctx); }

function requireRole_(ctx, roles) {
  if (roles.indexOf(ctx.role) === -1) throw AppError_('You do not have permission to perform this action', 'FORBIDDEN');
}

function requireAdmin_(ctx) { if (!isAdmin_(ctx)) throw AppError_('Administrator access required', 'FORBIDDEN'); }

/** Returns the employee row if ctx is allowed to view it, else throws. */
function requireEmployeeAccess_(ctx, employeeId) {
  employeeId = trim_(employeeId) || ctx.employeeId;
  var emp = findById_('EMPLOYEES', 'EmployeeID', employeeId);
  if (!emp) throw AppError_('Employee not found: ' + employeeId, 'NOT_FOUND');
  if (isAdmin_(ctx)) return emp;
  if (employeeId === ctx.employeeId) return emp;
  if (isManager_(ctx) && managesEmployee_(ctx, emp)) return emp;
  throw AppError_('You are not allowed to access this employee\'s records', 'FORBIDDEN');
}

/** A manager manages an employee when they are the reporting manager or the department manager. */
function managesEmployee_(ctx, emp) {
  if (!emp) return false;
  if (String(emp.ReportingManagerID) === String(ctx.employeeId)) return true;
  var dept = findOne_('DEPARTMENTS', function (d) { return upper_(d.DepartmentName) === upper_(emp.Department); });
  return !!(dept && String(dept.ManagerID) === String(ctx.employeeId));
}

/** List of employees visible to ctx (admins: all, managers: their team, employees: self). */
function visibleEmployees_(ctx) {
  var all = readTable_('EMPLOYEES');
  if (isAdmin_(ctx)) return all;
  if (isManager_(ctx)) {
    var depts = readTable_('DEPARTMENTS').filter(function (d) { return String(d.ManagerID) === String(ctx.employeeId); })
      .map(function (d) { return upper_(d.DepartmentName); });
    return all.filter(function (e) {
      return String(e.EmployeeID) === String(ctx.employeeId) || String(e.ReportingManagerID) === String(ctx.employeeId) || depts.indexOf(upper_(e.Department)) !== -1;
    });
  }
  return all.filter(function (e) { return String(e.EmployeeID) === String(ctx.employeeId); });
}

function visibleEmployeeIds_(ctx) { return visibleEmployees_(ctx).map(function (e) { return String(e.EmployeeID); }); }

function findEmployeeByEmail_(email) {
  email = trim_(email).toLowerCase();
  return findOne_('EMPLOYEES', function (e) { return trim_(e.Email).toLowerCase() === email; });
}

/** Manual-time policy enforcement */
function checkManualTimePolicy_(ctx, reason) {
  var policy = upper_(getSetting_('MANUAL_TIME_POLICY'));
  if (policy === 'DISABLED' && !isAdmin_(ctx)) throw AppError_('Manual time entries are disabled by the administrator', 'FORBIDDEN');
  if (policy === 'MANAGER_ONLY' && !isManagerOrAbove_(ctx)) throw AppError_('Only managers can add manual time entries', 'FORBIDDEN');
  if ((policy === 'REASON_REQUIRED' || policy === 'MANAGER_ONLY') && !trim_(reason)) throw AppError_('A reason is required for manual time entries', 'VALIDATION');
}
