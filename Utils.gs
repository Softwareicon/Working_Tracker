/**
 * Utils.gs — Shared helpers: dates, ids, responses, logging.
 */

function tz_() {
  return CONFIG.TIMEZONE || Session.getScriptTimeZone() || 'Asia/Kolkata';
}

function nowDate_() { return new Date(); }

function nowIso_() { return formatDateTime_(new Date()); }

function today_() { return formatDate_(new Date()); }

/** yyyy-MM-dd in the configured timezone */
function formatDate_(d) {
  if (!d) return '';
  if (typeof d === 'string') d = parseDateTime_(d);
  if (!(d instanceof Date) || isNaN(d.getTime())) return '';
  return Utilities.formatDate(d, tz_(), 'yyyy-MM-dd');
}

/** yyyy-MM-dd'T'HH:mm:ss in the configured timezone (no offset; always interpreted in CONFIG.TIMEZONE) */
function formatDateTime_(d) {
  if (!d) return '';
  if (typeof d === 'string') d = parseDateTime_(d);
  if (!(d instanceof Date) || isNaN(d.getTime())) return '';
  return Utilities.formatDate(d, tz_(), "yyyy-MM-dd'T'HH:mm:ss");
}

function formatTime_(d) {
  if (!d) return '';
  if (typeof d === 'string') d = parseDateTime_(d);
  if (!(d instanceof Date) || isNaN(d.getTime())) return '';
  return Utilities.formatDate(d, tz_(), 'HH:mm');
}

function formatTime12_(d) {
  if (!d) return '';
  if (typeof d === 'string') d = parseDateTime_(d);
  if (!(d instanceof Date) || isNaN(d.getTime())) return '';
  return Utilities.formatDate(d, tz_(), 'hh:mm a');
}

function formatDateDMY_(dateStr) {
  if (!dateStr) return '';
  var p = String(dateStr).split('T')[0].split('-');
  if (p.length !== 3) return String(dateStr);
  return p[2] + '/' + p[1] + '/' + p[0];
}

/**
 * Parse "yyyy-MM-dd", "yyyy-MM-ddTHH:mm[:ss]" or "HH:mm" (today) as a time in CONFIG.TIMEZONE.
 * Works independently of the server's timezone by computing the offset for the target zone.
 */
function parseDateTime_(s, baseDate) {
  if (s instanceof Date) return s;
  if (s === null || s === undefined || s === '') return null;
  s = String(s).trim();
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) {
    var t = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (t) {
      var base = baseDate ? formatDate_(baseDate) : today_();
      var bp = base.split('-');
      return zonedDate_(+bp[0], +bp[1], +bp[2], +t[1], +t[2], +(t[3] || 0));
    }
    var d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  return zonedDate_(+m[1], +m[2], +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
}

/** Build a Date representing the given wall-clock time in CONFIG.TIMEZONE. */
function zonedDate_(y, mo, d, h, mi, s) {
  var guess = Date.UTC(y, mo - 1, d, h, mi, s || 0);
  // Offset = (wall clock interpreted as UTC) - (actual UTC) for that instant.
  var off = tzOffsetMs_(new Date(guess));
  var result = new Date(guess - off);
  // Second pass handles DST boundaries (not relevant for IST, but cheap).
  var off2 = tzOffsetMs_(result);
  if (off2 !== off) result = new Date(guess - off2);
  return result;
}

function tzOffsetMs_(date) {
  var str = Utilities.formatDate(date, tz_(), "yyyy-MM-dd'T'HH:mm:ss");
  var p = str.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
  var asUtc = Date.UTC(+p[1], +p[2] - 1, +p[3], +p[4], +p[5], +p[6]);
  return asUtc - date.getTime();
}

function minutesBetween_(a, b) {
  var da = parseDateTime_(a), db = parseDateTime_(b);
  if (!da || !db) return 0;
  return Math.max(0, Math.round((db.getTime() - da.getTime()) / 60000));
}

function addMinutes_(d, minutes) {
  var dd = parseDateTime_(d);
  return new Date(dd.getTime() + minutes * 60000);
}

function hhmmToMinutes_(hhmm) {
  if (!hhmm) return 0;
  var p = String(hhmm).split(':');
  return (+p[0] || 0) * 60 + (+p[1] || 0);
}

/** "1 Hour 30 Minutes" */
function formatDuration_(minutes) {
  minutes = Math.round(+minutes || 0);
  var h = Math.floor(minutes / 60), m = minutes % 60;
  if (h && m) return h + (h === 1 ? ' Hour ' : ' Hours ') + m + (m === 1 ? ' Minute' : ' Minutes');
  if (h) return h + (h === 1 ? ' Hour' : ' Hours');
  return m + (m === 1 ? ' Minute' : ' Minutes');
}

function formatHours_(minutes) {
  return (Math.round(((+minutes || 0) / 60) * 100) / 100) + ' h';
}

function pad2_(n) { return (n < 10 ? '0' : '') + n; }

function generateId_(prefix) {
  var ts = Utilities.formatDate(new Date(), tz_(), 'yyyyMMddHHmmss');
  var rnd = Math.random().toString(36).substring(2, 7).toUpperCase();
  return prefix + '-' + ts + '-' + rnd;
}

function sha256_(text) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8);
  return bytes.map(function (b) { var v = (b < 0 ? b + 256 : b).toString(16); return v.length === 1 ? '0' + v : v; }).join('');
}

function randomToken_() {
  return Utilities.getUuid().replace(/-/g, '') + Math.random().toString(36).substring(2, 12);
}

function ok_(data, message) {
  return { success: true, message: message || 'OK', data: data === undefined ? {} : data };
}

function fail_(message, code, extra) {
  var r = { success: false, message: message || 'Operation failed', code: code || 'ERROR', data: null };
  if (extra) r.data = extra;
  return r;
}

function AppError_(message, code, extra) {
  var e = new Error(message);
  e.code = code || 'ERROR';
  e.extra = extra;
  e.isAppError = true;
  return e;
}

function safeJsonParse_(s, fallback) {
  if (s === null || s === undefined || s === '') return fallback;
  if (typeof s === 'object') return s;
  try { return JSON.parse(s); } catch (e) { return fallback; }
}

function toBool_(v) {
  if (v === true) return true;
  if (v === false || v === null || v === undefined) return false;
  var s = String(v).trim().toUpperCase();
  return s === 'TRUE' || s === 'YES' || s === '1' || s === 'Y';
}

function toNum_(v, def) {
  if (v === null || v === undefined || v === '') return def === undefined ? 0 : def;
  var n = Number(v);
  return isNaN(n) ? (def === undefined ? 0 : def) : n;
}

function trim_(v) { return v === null || v === undefined ? '' : String(v).trim(); }

function upper_(v) { return trim_(v).toUpperCase(); }

function pct_(num, den) { return den ? Math.round((num / den) * 1000) / 10 : 0; }

function uniq_(arr) {
  var seen = {}, out = [];
  (arr || []).forEach(function (x) { if (!seen[x]) { seen[x] = 1; out.push(x); } });
  return out;
}

function groupBy_(arr, keyFn) {
  var g = {};
  (arr || []).forEach(function (x) { var k = keyFn(x); (g[k] = g[k] || []).push(x); });
  return g;
}

function sortBy_(arr, keyFn, desc) {
  return (arr || []).slice().sort(function (a, b) {
    var ka = keyFn(a), kb = keyFn(b);
    if (ka < kb) return desc ? 1 : -1;
    if (ka > kb) return desc ? -1 : 1;
    return 0;
  });
}

function escapeHtml_(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Audit log. Never throws. */
function logActivity_(ctx, action, entity, entityId, details) {
  try {
    insert_(CONFIG.SHEETS.ACTIVITY_LOGS, {
      LogID: generateId_('LOG'),
      Timestamp: nowIso_(),
      UserEmail: ctx ? ctx.email : 'system',
      EmployeeID: ctx ? ctx.employeeId : '',
      Action: action,
      Entity: entity || '',
      EntityID: entityId || '',
      Details: typeof details === 'string' ? details : JSON.stringify(details || {})
    }, ctx);
  } catch (e) {
    try { console.log('logActivity_ failed: ' + e); } catch (e2) { }
  }
}

var LOCK_DEPTH_ = 0;
/** Re-entrant script lock: nested withLock_ calls inside one execution reuse the outer lock. */
function withLock_(fn, timeoutMs) {
  if (LOCK_DEPTH_ > 0) { LOCK_DEPTH_++; try { return fn(); } finally { LOCK_DEPTH_--; } }
  var lock = LockService.getScriptLock();
  lock.waitLock(timeoutMs || 20000);
  LOCK_DEPTH_++;
  try { return fn(); } finally { LOCK_DEPTH_--; lock.releaseLock(); }
}

/** Returns the list of date strings between from and to inclusive. */
function dateRange_(from, to) {
  var out = [];
  var d = parseDateTime_(from), end = parseDateTime_(to);
  if (!d || !end) return out;
  var guard = 0;
  while (d.getTime() <= end.getTime() && guard++ < 400) {
    out.push(formatDate_(d));
    d = new Date(d.getTime() + 86400000);
  }
  return out;
}
