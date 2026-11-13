/**
 * Database.gs — Google Sheets data access layer.
 *
 * - Header-based column mapping (never fixed column numbers).
 * - Batch reads/writes (one getValues / setValues per operation).
 * - Automatic audit columns (CreatedAt/By, UpdatedAt/By).
 * - CacheService for master data, LockService for writes.
 */

var CACHED_TABLES_ = ['DEPARTMENTS', 'DESIGNATIONS', 'DESIGNATION_MAPPING', 'QUESTIONNAIRE_MASTER',
  'QUESTIONNAIRE_OPTIONS', 'SYSTEM_SETTINGS', 'EMPLOYEES'];

var SS_CACHE_ = null;

function ss_() {
  if (SS_CACHE_) return SS_CACHE_;
  if (CONFIG.SPREADSHEET_ID) SS_CACHE_ = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  else SS_CACHE_ = SpreadsheetApp.getActiveSpreadsheet();
  if (!SS_CACHE_) throw AppError_('Spreadsheet not found. Set CONFIG.SPREADSHEET_ID or bind the script to a sheet.', 'DB_NOT_FOUND');
  return SS_CACHE_;
}

function fullHeaders_(name) {
  var base = CONFIG.SCHEMA[name];
  if (!base) throw AppError_('Unknown table: ' + name, 'DB_UNKNOWN_TABLE');
  return base.concat(CONFIG.AUDIT_COLUMNS);
}

function sheet_(name) {
  var sh = ss_().getSheetByName(name);
  if (!sh) throw AppError_('Sheet "' + name + '" not found. Run setupDatabase() first.', 'DB_SHEET_MISSING');
  return sh;
}

/** Create a sheet with headers if missing; add any missing header columns if present. */
function ensureSheet_(name) {
  var ss = ss_();
  var headers = fullHeaders_(name);
  var sh = ss.getSheetByName(name);
  var created = false;
  if (!sh) {
    sh = ss.insertSheet(name);
    created = true;
  }
  var lastCol = sh.getLastColumn();
  var existing = lastCol > 0 ? sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return trim_(h); }) : [];
  var missing = headers.filter(function (h) { return existing.indexOf(h) === -1; });
  if (existing.length === 0 || existing.every(function (h) { return !h; })) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    existing = headers.slice();
  } else if (missing.length) {
    sh.getRange(1, existing.length + 1, 1, missing.length).setValues([missing]);
    existing = existing.concat(missing);
  }
  // Header styling
  var hdr = sh.getRange(1, 1, 1, existing.length);
  hdr.setFontWeight('bold').setBackground('#1e3a5f').setFontColor('#ffffff');
  sh.setFrozenRows(1);
  // Force text format on sensitive columns so Sheets never re-types the data.
  existing.forEach(function (h, i) {
    if (CONFIG.TEXT_COLUMNS.indexOf(h) !== -1) {
      sh.getRange(1, i + 1, Math.max(sh.getMaxRows(), 2), 1).setNumberFormat('@');
    }
  });
  return { sheet: sh, created: created, headers: existing };
}

/**
 * setupDatabase() — creates every sheet with headers, seeds departments, designation mapping,
 * questionnaire templates, system settings and the bootstrap super admin. Safe to run repeatedly.
 */
function setupDatabase() {
  var ss = ss_();
  var created = [];
  Object.keys(CONFIG.SHEETS).forEach(function (key) {
    var r = ensureSheet_(CONFIG.SHEETS[key]);
    if (r.created) created.push(CONFIG.SHEETS[key]);
  });
  // Remove the default empty "Sheet1" if present and untouched
  var def = ss.getSheetByName('Sheet1');
  if (def && def.getLastRow() === 0 && ss.getSheets().length > 1) {
    try { ss.deleteSheet(def); } catch (e) { }
  }
  clearCache_();
  var sys = { email: 'system', employeeId: 'SYSTEM', role: CONFIG.ROLES.SUPER_ADMIN };
  seedDepartments_(sys);
  seedDesignationMapping_(sys);
  seedSettings_(sys);
  seedQuestionnaireTemplates_(sys);
  seedSuperAdmins_(sys);
  clearCache_();
  logActivity_(sys, 'SETUP_DATABASE', 'SYSTEM', '', { created: created });
  return 'Database ready. Sheets created: ' + (created.length ? created.join(', ') : 'none (all existed)');
}

function seedDepartments_(ctx) {
  var existing = readTable_('DEPARTMENTS').map(function (d) { return upper_(d.DepartmentName); });
  var rows = CONFIG.DEFAULT_DEPARTMENTS.filter(function (d) { return existing.indexOf(upper_(d.DepartmentName)) === -1; })
    .map(function (d, i) {
      return { DepartmentID: 'DEPT-' + pad2_(existing.length + i + 1), DepartmentName: upper_(d.DepartmentName),
        Description: d.Description, ManagerID: '', Active: true };
    });
  if (rows.length) insert_('DEPARTMENTS', rows, ctx);
}

function seedDesignationMapping_(ctx) {
  var maps = readTable_('DESIGNATION_MAPPING').map(function (m) { return upper_(m.Designation); });
  var desigs = readTable_('DESIGNATIONS').map(function (m) { return upper_(m.DesignationName); });
  var newMaps = [], newDesigs = [];
  CONFIG.DEFAULT_DESIGNATION_MAPPING.forEach(function (m) {
    if (maps.indexOf(upper_(m.Designation)) === -1) {
      newMaps.push({ MappingID: generateId_('MAP'), Designation: m.Designation, Department: upper_(m.Department),
        QuestionnaireKey: m.QuestionnaireKey || m.Designation, DefaultManagerID: '', Active: true });
    }
    if (desigs.indexOf(upper_(m.Designation)) === -1) {
      newDesigs.push({ DesignationID: generateId_('DSG'), DesignationName: m.Designation, Description: '', Active: true });
      desigs.push(upper_(m.Designation));
    }
  });
  if (newMaps.length) insert_('DESIGNATION_MAPPING', newMaps, ctx);
  if (newDesigs.length) insert_('DESIGNATIONS', newDesigs, ctx);
}

function seedSettings_(ctx) {
  var existing = readTable_('SYSTEM_SETTINGS').map(function (s) { return s.Key; });
  var rows = [];
  Object.keys(CONFIG.DEFAULT_SETTINGS).forEach(function (k) {
    if (existing.indexOf(k) === -1) {
      rows.push({ Key: k, Value: CONFIG.DEFAULT_SETTINGS[k].value, Description: CONFIG.DEFAULT_SETTINGS[k].description });
    }
  });
  if (rows.length) insert_('SYSTEM_SETTINGS', rows, ctx);
}

function seedSuperAdmins_(ctx) {
  var emps = readTable_('EMPLOYEES');
  var emails = emps.map(function (e) { return e.Email.toLowerCase(); });
  var rows = [];
  CONFIG.SUPER_ADMIN_EMAILS.forEach(function (email, i) {
    email = trim_(email).toLowerCase();
    if (!email || emails.indexOf(email) !== -1) return;
    var mapping = resolveDesignation_('System Administrator');
    rows.push({
      EmployeeID: nextEmployeeId_(emps.length + rows.length),
      EmployeeName: email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); }),
      Designation: 'System Administrator', Department: mapping ? mapping.Department : 'OPERATIONS',
      Email: email, Mobile: '', JoiningDate: today_(), ReportingManagerID: '', ReportingManagerName: '',
      WorkStart: getSetting_('WORK_START'), WorkEnd: getSetting_('WORK_END'),
      WorkingHours: toNum_(getSetting_('WORKING_HOURS'), 8), BreakMinutes: toNum_(getSetting_('BREAK_MINUTES'), 60),
      Role: CONFIG.ROLES.SUPER_ADMIN, Status: 'ACTIVE', WhatsAppNumber: '', Notes: 'Bootstrap super admin'
    });
  });
  if (rows.length) insert_('EMPLOYEES', rows, ctx);
}

function nextEmployeeId_(count) {
  var all = readTable_('EMPLOYEES');
  var max = 0;
  all.forEach(function (e) {
    var m = String(e.EmployeeID).match(/EMP(\d+)/);
    if (m) max = Math.max(max, +m[1]);
  });
  var n = Math.max(max + 1, (count || 0) + 1);
  return 'EMP' + (n < 1000 ? ('000' + n).slice(-3) : n);
}

// ---------------------------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------------------------

function cacheKey_(name) { return 'tbl:' + name; }

function clearCache_(name) {
  var cache = CacheService.getScriptCache();
  if (name) { cache.remove(cacheKey_(name)); return; }
  cache.removeAll(Object.keys(CONFIG.SHEETS).map(cacheKey_));
}

/** Normalize a raw cell to a JSON-friendly value. */
function normalizeCell_(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return '';
    var y = +Utilities.formatDate(v, tz_(), 'yyyy');
    if (y < 1900) return Utilities.formatDate(v, tz_(), 'HH:mm'); // time-only cell
    var hm = Utilities.formatDate(v, tz_(), 'HH:mm:ss');
    return hm === '00:00:00' ? formatDate_(v) : formatDateTime_(v);
  }
  if (typeof v === 'string') {
    var s = v;
    if (s === 'TRUE') return true;
    if (s === 'FALSE') return false;
    return s;
  }
  return v;
}

/** Convert a JS value into a sheet-safe cell. */
function toCell_(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return formatDateTime_(v);
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'object') return JSON.stringify(v);
  return v;
}

/**
 * Read a whole table as an array of objects keyed by header. Each object carries a hidden
 * _row (1-based sheet row) used for updates. Master tables are cached.
 */
function readTable_(name, opts) {
  opts = opts || {};
  var useCache = CACHED_TABLES_.indexOf(name) !== -1 && !opts.noCache;
  var cache = useCache ? CacheService.getScriptCache() : null;
  if (useCache) {
    var hit = cache.get(cacheKey_(name));
    if (hit) { try { return JSON.parse(hit); } catch (e) { } }
  }
  var sh = sheet_(name);
  var lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
  if (lastRow < 1 || lastCol < 1) return [];
  var values = sh.getRange(1, 1, lastRow, lastCol).getValues();
  var headers = values[0].map(trim_);
  var rows = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r], obj = { _row: r + 1 }, empty = true;
    for (var c = 0; c < headers.length; c++) {
      if (!headers[c]) continue;
      var val = normalizeCell_(row[c]);
      if (val !== '' && val !== false) empty = false;
      obj[headers[c]] = val;
    }
    if (!empty) rows.push(obj);
  }
  if (useCache) {
    try { var str = JSON.stringify(rows); if (str.length < 95000) cache.put(cacheKey_(name), str, CONFIG.CACHE_SECONDS); } catch (e) { }
  }
  return rows;
}

function findMany_(name, predicate) {
  return readTable_(name).filter(predicate);
}

function findOne_(name, predicate) {
  var rows = readTable_(name);
  for (var i = 0; i < rows.length; i++) if (predicate(rows[i])) return rows[i];
  return null;
}

function findById_(name, idField, id) {
  return findOne_(name, function (r) { return String(r[idField]) === String(id); });
}

// ---------------------------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------------------------

function headerIndex_(sh) {
  var lastCol = sh.getLastColumn();
  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(trim_);
  var idx = {};
  headers.forEach(function (h, i) { if (h) idx[h] = i; });
  return { headers: headers, idx: idx };
}

/** Insert one object or an array of objects. Returns the inserted objects. */
function insert_(name, objs, ctx) {
  var list = Array.isArray(objs) ? objs : [objs];
  if (!list.length) return [];
  var who = ctx ? (ctx.email || 'system') : 'system';
  var now = nowIso_();
  return withLock_(function () {
    var sh = sheet_(name);
    var hi = headerIndex_(sh);
    var matrix = list.map(function (obj) {
      obj.CreatedAt = obj.CreatedAt || now; obj.CreatedBy = obj.CreatedBy || who;
      obj.UpdatedAt = now; obj.UpdatedBy = who;
      var row = new Array(hi.headers.length).fill('');
      Object.keys(obj).forEach(function (k) {
        if (k.charAt(0) === '_') return;
        if (hi.idx[k] !== undefined) row[hi.idx[k]] = toCell_(obj[k]);
      });
      return row;
    });
    var start = sh.getLastRow() + 1;
    var range = sh.getRange(start, 1, matrix.length, hi.headers.length);
    // Text columns stay text even for new rows below the pre-formatted area.
    hi.headers.forEach(function (h, i) {
      if (CONFIG.TEXT_COLUMNS.indexOf(h) !== -1) sh.getRange(start, i + 1, matrix.length, 1).setNumberFormat('@');
    });
    range.setValues(matrix);
    clearCache_(name);
    list.forEach(function (o, i) { o._row = start + i; });
    return list;
  });
}

/** Update row(s) where idField === id with the given patch. Returns the number of rows updated. */
function update_(name, idField, id, patch, ctx) {
  var who = ctx ? (ctx.email || 'system') : 'system';
  return withLock_(function () {
    var sh = sheet_(name);
    var hi = headerIndex_(sh);
    var idCol = hi.idx[idField];
    if (idCol === undefined) throw AppError_('Column ' + idField + ' missing in ' + name);
    var lastRow = sh.getLastRow();
    if (lastRow < 2) return 0;
    var ids = sh.getRange(2, idCol + 1, lastRow - 1, 1).getValues();
    var count = 0;
    patch.UpdatedAt = nowIso_(); patch.UpdatedBy = who;
    for (var i = 0; i < ids.length; i++) {
      if (String(normalizeCell_(ids[i][0])) !== String(id)) continue;
      var rowNum = i + 2;
      var rowRange = sh.getRange(rowNum, 1, 1, hi.headers.length);
      var row = rowRange.getValues()[0];
      Object.keys(patch).forEach(function (k) {
        if (k.charAt(0) === '_') return;
        if (hi.idx[k] !== undefined) row[hi.idx[k]] = toCell_(patch[k]);
      });
      rowRange.setValues([row]);
      count++;
    }
    clearCache_(name);
    return count;
  });
}

/** Delete rows where idField === id. Returns number deleted. */
function remove_(name, idField, id) {
  return withLock_(function () {
    var sh = sheet_(name);
    var hi = headerIndex_(sh);
    var idCol = hi.idx[idField];
    var lastRow = sh.getLastRow();
    if (lastRow < 2) return 0;
    var ids = sh.getRange(2, idCol + 1, lastRow - 1, 1).getValues();
    var count = 0;
    for (var i = ids.length - 1; i >= 0; i--) {
      if (String(normalizeCell_(ids[i][0])) === String(id)) { sh.deleteRow(i + 2); count++; }
    }
    clearCache_(name);
    return count;
  });
}

/** Insert or update by id. */
function upsert_(name, idField, obj, ctx) {
  var existing = findById_(name, idField, obj[idField]);
  if (existing) { update_(name, idField, obj[idField], obj, ctx); return obj; }
  insert_(name, obj, ctx);
  return obj;
}

// ---------------------------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------------------------

function getSettings_() {
  var out = {};
  Object.keys(CONFIG.DEFAULT_SETTINGS).forEach(function (k) { out[k] = CONFIG.DEFAULT_SETTINGS[k].value; });
  try {
    readTable_('SYSTEM_SETTINGS').forEach(function (s) { if (s.Key) out[s.Key] = s.Value === '' ? out[s.Key] : String(s.Value); });
  } catch (e) { }
  return out;
}

function getSetting_(key, def) {
  var s = getSettings_();
  return s[key] !== undefined && s[key] !== '' ? s[key] : (def !== undefined ? def : (CONFIG.DEFAULT_SETTINGS[key] || {}).value);
}

function setSetting_(key, value, ctx) {
  var existing = findById_('SYSTEM_SETTINGS', 'Key', key);
  if (existing) update_('SYSTEM_SETTINGS', 'Key', key, { Value: value }, ctx);
  else insert_('SYSTEM_SETTINGS', { Key: key, Value: value, Description: (CONFIG.DEFAULT_SETTINGS[key] || {}).description || '' }, ctx);
}

/** CSV export of a table (used by Export to CSV). */
function exportCsv_(name) {
  var headers = fullHeaders_(name);
  var rows = readTable_(name, { noCache: true });
  var esc = function (v) { var s = String(v === null || v === undefined ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  var lines = [headers.map(esc).join(',')];
  rows.forEach(function (r) { lines.push(headers.map(function (h) { return esc(r[h]); }).join(',')); });
  return lines.join('\n');
}
