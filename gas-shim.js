/**
 * gas-shim.js — Minimal in-memory implementation of the Google Apps Script services used by the
 * backend (SpreadsheetApp, Utilities, CacheService, LockService, MailApp, Session, ContentService,
 * ScriptApp, Logger). It lets the unmodified backend run in a browser (Demo Mode) and in Node (tests).
 * Not used in production — production runs on Google Apps Script with real Google Sheets.
 */
(function (global) {
  'use strict';

  var TZ = 'Asia/Kolkata';
  var store = { sheets: {}, order: [], mails: [], props: {} };

  // ---------- SHA-256 (sync, pure JS) ----------
  function sha256Bytes(str) {
    var utf8 = unescape(encodeURIComponent(str));
    var K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var l = utf8.length * 8, words = [];
    for (var i = 0; i < utf8.length; i++) words[i >> 2] |= utf8.charCodeAt(i) << (24 - (i % 4) * 8);
    words[l >> 5] |= 0x80 << (24 - l % 32);
    words[((l + 64 >> 9) << 4) + 15] = l;
    var w = new Array(64);
    function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }
    for (var j = 0; j < words.length; j += 16) {
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (var t = 0; t < 64; t++) {
        if (t < 16) w[t] = words[j + t] | 0;
        else { var s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3); var s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10); w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0; }
        var S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25), ch = (e & f) ^ (~e & g), t1 = (h + S1 + ch + K[t] + w[t]) | 0;
        var S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22), maj = (a & b) ^ (a & c) ^ (b & c), t2 = (S0 + maj) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0; H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    var out = [];
    H.forEach(function (x) { out.push((x >>> 24) & 255, (x >>> 16) & 255, (x >>> 8) & 255, x & 255); });
    return out.map(function (b) { return b > 127 ? b - 256 : b; });
  }

  // ---------- Utilities ----------
  function tzParts(date, tz) {
    var dtf = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short' });
    var p = {};
    dtf.formatToParts(date).forEach(function (x) { p[x.type] = x.value; });
    if (p.hour === '24') p.hour = '00';
    return p;
  }
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function formatDate(date, tz, pattern) {
    var p = tzParts(date, tz || TZ);
    var h24 = +p.hour, h12 = h24 % 12 || 12;
    var map = { yyyy: p.year, MM: p.month, dd: p.day, HH: p.hour, hh: (h12 < 10 ? '0' : '') + h12, mm: p.minute, ss: p.second, a: h24 < 12 ? 'AM' : 'PM', EEE: p.weekday, MMM: MONTHS[+p.month - 1] };
    var out = '', i = 0;
    while (i < pattern.length) {
      if (pattern[i] === "'") { var j = pattern.indexOf("'", i + 1); if (j === -1) j = pattern.length; out += pattern.substring(i + 1, j); i = j + 1; continue; }
      var matched = false;
      ['yyyy', 'MMM', 'EEE', 'MM', 'dd', 'HH', 'hh', 'mm', 'ss', 'a'].forEach(function (tok) {
        if (!matched && pattern.substr(i, tok.length) === tok) { out += map[tok]; i += tok.length; matched = true; }
      });
      if (!matched) { out += pattern[i]; i++; }
    }
    return out;
  }
  global.Utilities = {
    DigestAlgorithm: { SHA_256: 'SHA_256' }, Charset: { UTF_8: 'UTF_8' },
    formatDate: formatDate,
    computeDigest: function (alg, text) { return sha256Bytes(String(text)); },
    getUuid: function () { return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }); },
    sleep: function () { }, base64Encode: function (s) { return typeof btoa === 'function' ? btoa(s) : Buffer.from(s).toString('base64'); }
  };

  // ---------- Spreadsheet ----------
  function Range(sheet, row, col, numRows, numCols) { this.sheet = sheet; this.row = row; this.col = col; this.numRows = numRows || 1; this.numCols = numCols || 1; }
  Range.prototype.getValues = function () {
    var out = [];
    for (var r = 0; r < this.numRows; r++) { var line = []; var src = this.sheet.data[this.row - 1 + r] || []; for (var c = 0; c < this.numCols; c++) { var v = src[this.col - 1 + c]; line.push(v === undefined || v === null ? '' : v); } out.push(line); }
    return out;
  };
  Range.prototype.setValues = function (values) {
    for (var r = 0; r < values.length; r++) { var line = this.sheet.data[this.row - 1 + r] = this.sheet.data[this.row - 1 + r] || []; for (var c = 0; c < values[r].length; c++) line[this.col - 1 + c] = values[r][c]; }
    this.sheet.touch(); return this;
  };
  Range.prototype.getValue = function () { return this.getValues()[0][0]; };
  Range.prototype.setValue = function (v) { return this.setValues([[v]]); };
  ['setNumberFormat', 'setFontWeight', 'setBackground', 'setFontColor', 'setWrap', 'setHorizontalAlignment'].forEach(function (m) { Range.prototype[m] = function () { return this; }; });
  Range.prototype.clearContent = function () { for (var r = 0; r < this.numRows; r++) for (var c = 0; c < this.numCols; c++) if (this.sheet.data[this.row - 1 + r]) this.sheet.data[this.row - 1 + r][this.col - 1 + c] = ''; this.sheet.touch(); return this; };

  function Sheet(ss, name) { this.ss = ss; this.name = name; this.data = []; }
  Sheet.prototype.touch = function () { this.ss.dirty = true; };
  Sheet.prototype.getName = function () { return this.name; };
  Sheet.prototype.getLastRow = function () { for (var r = this.data.length - 1; r >= 0; r--) { if ((this.data[r] || []).some(function (v) { return v !== '' && v !== null && v !== undefined; })) return r + 1; } return 0; };
  Sheet.prototype.getLastColumn = function () { var max = 0; this.data.forEach(function (row) { for (var c = row.length - 1; c >= 0; c--) { if (row[c] !== '' && row[c] !== null && row[c] !== undefined) { max = Math.max(max, c + 1); break; } } }); return max; };
  Sheet.prototype.getMaxRows = function () { return Math.max(this.data.length, 1000); };
  Sheet.prototype.getMaxColumns = function () { return Math.max(this.getLastColumn(), 26); };
  Sheet.prototype.getRange = function (row, col, numRows, numCols) { if (typeof row === 'string') throw new Error('A1 notation not supported in shim'); return new Range(this, row, col, numRows, numCols); };
  Sheet.prototype.getDataRange = function () { return new Range(this, 1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn())); };
  Sheet.prototype.appendRow = function (values) { this.data.push(values.slice()); this.touch(); return this; };
  Sheet.prototype.deleteRow = function (r) { this.data.splice(r - 1, 1); this.touch(); return this; };
  Sheet.prototype.deleteRows = function (r, n) { this.data.splice(r - 1, n); this.touch(); return this; };
  ['setFrozenRows', 'setColumnWidth', 'setColumnWidths', 'autoResizeColumns', 'setTabColor', 'hideSheet'].forEach(function (m) { Sheet.prototype[m] = function () { return this; }; });

  function Spreadsheet() { this.sheets = {}; this.order = []; this.dirty = false; }
  Spreadsheet.prototype.getSheetByName = function (name) { return this.sheets[name] || null; };
  Spreadsheet.prototype.insertSheet = function (name) { var s = new Sheet(this, name); this.sheets[name] = s; this.order.push(name); this.dirty = true; return s; };
  Spreadsheet.prototype.getSheets = function () { var self = this; return this.order.map(function (n) { return self.sheets[n]; }); };
  Spreadsheet.prototype.deleteSheet = function (sheet) { delete this.sheets[sheet.name]; this.order = this.order.filter(function (n) { return n !== sheet.name; }); this.dirty = true; };
  Spreadsheet.prototype.getId = function () { return 'demo-spreadsheet'; };
  Spreadsheet.prototype.getName = function () { return 'Daily Work Tracker Pro (Demo)'; };
  Spreadsheet.prototype.toJSON = function () { var self = this; var o = {}; this.order.forEach(function (n) { o[n] = self.sheets[n].data; }); return o; };
  Spreadsheet.prototype.fromJSON = function (o) { var self = this; this.sheets = {}; this.order = []; Object.keys(o || {}).forEach(function (n) { var s = self.insertSheet(n); s.data = o[n]; }); this.dirty = false; };

  var activeSS = new Spreadsheet();
  global.SpreadsheetApp = { getActiveSpreadsheet: function () { return activeSS; }, openById: function () { return activeSS; }, getActive: function () { return activeSS; } };

  // ---------- Cache / Lock / Properties ----------
  var cache = {};
  global.CacheService = { getScriptCache: function () { return {
    get: function (k) { var e = cache[k]; if (!e) return null; if (e.exp < Date.now()) { delete cache[k]; return null; } return e.v; },
    put: function (k, v, sec) { cache[k] = { v: v, exp: Date.now() + (sec || 600) * 1000 }; },
    remove: function (k) { delete cache[k]; }, removeAll: function (keys) { keys.forEach(function (k) { delete cache[k]; }); }
  }; }, getUserCache: function () { return this.getScriptCache(); } };
  global.LockService = { getScriptLock: function () { return { waitLock: function () { }, tryLock: function () { return true; }, releaseLock: function () { }, hasLock: function () { return true; } }; } };
  global.PropertiesService = { getScriptProperties: function () { return { getProperty: function (k) { return store.props[k] === undefined ? null : store.props[k]; }, setProperty: function (k, v) { store.props[k] = String(v); }, deleteProperty: function (k) { delete store.props[k]; } }; } };

  // ---------- Mail / Session / Content / Script ----------
  global.MailApp = { sendEmail: function (o) { var m = typeof o === 'string' ? { to: arguments[0], subject: arguments[1], body: arguments[2] } : o; store.mails.push(Object.assign({ at: new Date().toISOString() }, m)); if (global.GAS_SHIM && global.GAS_SHIM.onMail) global.GAS_SHIM.onMail(m); }, getRemainingDailyQuota: function () { return 100; } };
  global.Session = { getScriptTimeZone: function () { return TZ; }, getActiveUser: function () { return { getEmail: function () { return ''; } }; }, getEffectiveUser: function () { return { getEmail: function () { return ''; } }; } };
  global.ContentService = { MimeType: { JSON: 'application/json', TEXT: 'text/plain' }, createTextOutput: function (s) { var o = { content: s, mime: 'text/plain', setMimeType: function (m) { o.mime = m; return o; }, getContent: function () { return o.content; } }; return o; } };
  global.ScriptApp = { getProjectTriggers: function () { return store.triggers || []; }, deleteTrigger: function () { }, newTrigger: function (fn) { var t = { handler: fn, chain: [] }; var b = {}; ['timeBased', 'everyDays', 'atHour', 'nearMinute', 'inTimezone', 'everyMinutes', 'onWeekDay'].forEach(function (m) { b[m] = function () { return b; }; }); b.create = function () { store.triggers = (store.triggers || []).concat([{ getHandlerFunction: function () { return fn; }, getEventType: function () { return 'CLOCK'; } }]); return b; }; return b; } };
  global.Logger = { log: function () { if (global.GAS_SHIM && global.GAS_SHIM.quiet) return; console.log.apply(console, arguments); } };
  if (!global.console.error) global.console.error = global.console.log;

  global.GAS_SHIM = {
    spreadsheet: activeSS, store: store, cache: cache,
    export: function () { return JSON.stringify({ sheets: activeSS.toJSON(), props: store.props }); },
    import: function (json) { var o = typeof json === 'string' ? JSON.parse(json) : json; activeSS.fromJSON(o.sheets || {}); store.props = o.props || {}; Object.keys(cache).forEach(function (k) { delete cache[k]; }); },
    reset: function () { activeSS.fromJSON({}); store.mails = []; store.props = {}; Object.keys(cache).forEach(function (k) { delete cache[k]; }); activeSS.dirty = true; },
    isDirty: function () { return activeSS.dirty; }, clean: function () { activeSS.dirty = false; },
    mails: store.mails, quiet: false, onMail: null
  };
})(typeof window !== 'undefined' ? window : globalThis);
