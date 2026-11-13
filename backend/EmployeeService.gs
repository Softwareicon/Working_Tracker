/**
 * EmployeeService.gs — Employee management with automatic department assignment.
 */

function employeeView_(e, managersById) {
  managersById = managersById || {};
  var mgr = managersById[e.ReportingManagerID];
  return {
    EmployeeID: e.EmployeeID, EmployeeName: e.EmployeeName, Designation: e.Designation, Department: upper_(e.Department),
    Email: e.Email, Mobile: String(e.Mobile || ''), WhatsAppNumber: String(e.WhatsAppNumber || ''), JoiningDate: e.JoiningDate,
    ReportingManagerID: e.ReportingManagerID, ReportingManagerName: mgr ? mgr.EmployeeName : (e.ReportingManagerName || ''),
    WorkStart: e.WorkStart, WorkEnd: e.WorkEnd, WorkingHours: toNum_(e.WorkingHours, 8), BreakMinutes: toNum_(e.BreakMinutes, 60),
    Role: e.Role || CONFIG.ROLES.EMPLOYEE, Status: upper_(e.Status) || 'ACTIVE', Notes: e.Notes,
    CreatedAt: e.CreatedAt, UpdatedAt: e.UpdatedAt, UpdatedBy: e.UpdatedBy
  };
}

function employeesList_(ctx, p) {
  p = p || {};
  var all = readTable_('EMPLOYEES');
  var byId = {};
  all.forEach(function (e) { byId[e.EmployeeID] = e; });
  var list = visibleEmployees_(ctx);
  if (p.department) list = list.filter(function (e) { return upper_(e.Department) === upper_(p.department); });
  if (p.status) list = list.filter(function (e) { return upper_(e.Status) === upper_(p.status); });
  if (p.designation) list = list.filter(function (e) { return upper_(e.Designation) === upper_(p.designation); });
  if (p.search) {
    var s = trim_(p.search).toLowerCase();
    list = list.filter(function (e) { return [e.EmployeeName, e.EmployeeID, e.Email, e.Designation, e.Department].join(' ').toLowerCase().indexOf(s) !== -1; });
  }
  var views = list.map(function (e) { return employeeView_(e, byId); });
  // Managers list (for dropdowns) — admins see all active employees who are managers/admins.
  var managers = all.filter(function (e) { return upper_(e.Status) === 'ACTIVE' && [CONFIG.ROLES.MANAGER, CONFIG.ROLES.ADMIN, CONFIG.ROLES.SUPER_ADMIN].indexOf(e.Role) !== -1; })
    .map(function (e) { return { EmployeeID: e.EmployeeID, EmployeeName: e.EmployeeName, Department: upper_(e.Department), Role: e.Role }; });
  return ok_({ employees: sortBy_(views, function (v) { return v.EmployeeName; }), managers: managers, total: views.length });
}

function employeesGet_(ctx, p) {
  var emp = requireEmployeeAccess_(ctx, p.employeeId);
  var byId = {};
  readTable_('EMPLOYEES').forEach(function (e) { byId[e.EmployeeID] = e; });
  return ok_({ employee: employeeView_(emp, byId) });
}

/**
 * Create or update an employee. The administrator never supplies the department:
 * it is derived from the designation mapping. Unknown designations are rejected with
 * code DESIGNATION_UNMAPPED so the UI can offer the "create mapping" option.
 */
function employeesSave_(ctx, p) {
  requireAdmin_(ctx);
  var isUpdate = !!trim_(p.EmployeeID);
  var data = validateEmployeeInput_(p, isUpdate);
  var existing = isUpdate ? findById_('EMPLOYEES', 'EmployeeID', p.EmployeeID) : null;
  if (isUpdate && !existing) throw AppError_('Employee not found', 'NOT_FOUND');

  // Duplicate prevention (e-mail unique, mobile unique when provided)
  var email = data.Email !== undefined ? data.Email : existing.Email;
  var dupEmail = findOne_('EMPLOYEES', function (e) { return trim_(e.Email).toLowerCase() === email && (!existing || e.EmployeeID !== existing.EmployeeID); });
  if (dupEmail) throw AppError_('An employee with e-mail ' + email + ' already exists (' + dupEmail.EmployeeID + ')', 'DUPLICATE');
  if (data.Mobile) {
    var dupMob = findOne_('EMPLOYEES', function (e) { return String(e.Mobile) === data.Mobile && (!existing || e.EmployeeID !== existing.EmployeeID); });
    if (dupMob) throw AppError_('Mobile number already belongs to ' + dupMob.EmployeeName, 'DUPLICATE');
  }

  // Automatic department assignment
  var designation = data.Designation !== undefined ? data.Designation : existing.Designation;
  var mapping = resolveDesignation_(designation);
  if (!mapping) {
    throw AppError_('Designation "' + designation + '" has no department mapping. Create its mapping and questionnaire first.',
      'DESIGNATION_UNMAPPED', { designation: designation });
  }
  if (!mapping.DepartmentValid) throw AppError_('Department "' + mapping.Department + '" mapped to this designation is inactive or missing.', 'VALIDATION');
  data.Designation = mapping.Designation;
  data.Department = mapping.Department;

  // Reporting manager: explicit > mapping default > department manager
  var mgrId = data.ReportingManagerID !== undefined ? data.ReportingManagerID : (existing ? existing.ReportingManagerID : '');
  if (!mgrId) mgrId = mapping.DefaultManagerID || '';
  if (mgrId) {
    var mgr = findById_('EMPLOYEES', 'EmployeeID', mgrId);
    if (!mgr) throw AppError_('Reporting manager ' + mgrId + ' not found', 'VALIDATION');
    if (existing && mgr.EmployeeID === existing.EmployeeID) throw AppError_('An employee cannot report to themselves', 'VALIDATION');
    data.ReportingManagerID = mgr.EmployeeID;
    data.ReportingManagerName = mgr.EmployeeName;
  } else { data.ReportingManagerID = ''; data.ReportingManagerName = ''; }

  // Role protection: only super admins may grant SUPER_ADMIN / ADMIN
  if (data.Role && [CONFIG.ROLES.SUPER_ADMIN, CONFIG.ROLES.ADMIN].indexOf(data.Role) !== -1 && !isSuperAdmin_(ctx)) {
    throw AppError_('Only a super administrator can grant admin roles', 'FORBIDDEN');
  }

  var saved;
  if (existing) {
    update_('EMPLOYEES', 'EmployeeID', existing.EmployeeID, data, ctx);
    saved = findById_('EMPLOYEES', 'EmployeeID', existing.EmployeeID);
    // Propagate name changes to reports/tasks is unnecessary: views read the master row by id.
    readTable_('EMPLOYEES').filter(function (e) { return e.ReportingManagerID === existing.EmployeeID && e.ReportingManagerName !== saved.EmployeeName; })
      .forEach(function (e) { update_('EMPLOYEES', 'EmployeeID', e.EmployeeID, { ReportingManagerName: saved.EmployeeName }, ctx); });
    logActivity_(ctx, 'EMPLOYEE_UPDATED', 'EMPLOYEE', saved.EmployeeID, data);
  } else {
    var row = {
      EmployeeID: nextEmployeeId_(),
      EmployeeName: data.EmployeeName, Designation: data.Designation, Department: data.Department, Email: data.Email,
      Mobile: data.Mobile || '', WhatsAppNumber: data.WhatsAppNumber || data.Mobile || '',
      JoiningDate: data.JoiningDate || today_(), ReportingManagerID: data.ReportingManagerID, ReportingManagerName: data.ReportingManagerName,
      WorkStart: data.WorkStart || getSetting_('WORK_START'), WorkEnd: data.WorkEnd || getSetting_('WORK_END'),
      WorkingHours: data.WorkingHours || toNum_(getSetting_('WORKING_HOURS'), 8),
      BreakMinutes: data.BreakMinutes !== undefined ? data.BreakMinutes : toNum_(getSetting_('BREAK_MINUTES'), 60),
      Role: data.Role || CONFIG.ROLES.EMPLOYEE, Status: data.Status || 'ACTIVE', Notes: data.Notes || ''
    };
    insert_('EMPLOYEES', row, ctx);
    saved = row;
    logActivity_(ctx, 'EMPLOYEE_CREATED', 'EMPLOYEE', row.EmployeeID, { designation: row.Designation, department: row.Department });
    try { sendWelcomeEmail_(saved); } catch (e) { }
  }
  clearCache_('EMPLOYEES');
  var byId = {};
  readTable_('EMPLOYEES').forEach(function (e) { byId[e.EmployeeID] = e; });
  return ok_({ employee: employeeView_(saved, byId), autoAssigned: { department: mapping.Department, questionnaireKey: mapping.QuestionnaireKey } },
    (existing ? 'Employee updated. ' : 'Employee created. ') + 'Department auto-assigned: ' + mapping.Department);
}

function employeesSetStatus_(ctx, p) {
  requireAdmin_(ctx);
  var emp = findById_('EMPLOYEES', 'EmployeeID', p.employeeId);
  if (!emp) throw AppError_('Employee not found', 'NOT_FOUND');
  var status = requireOneOf_(upper_(p.status), ['ACTIVE', 'INACTIVE'], 'Status');
  if (emp.EmployeeID === ctx.employeeId && status === 'INACTIVE') throw AppError_('You cannot deactivate your own account', 'VALIDATION');
  update_('EMPLOYEES', 'EmployeeID', emp.EmployeeID, { Status: status }, ctx);
  if (status === 'INACTIVE') {
    // End active sessions of the deactivated employee.
    readTable_('AUTH_SESSIONS').filter(function (s) { return s.EmployeeID === emp.EmployeeID && toBool_(s.Active); })
      .forEach(function (s) { update_('AUTH_SESSIONS', 'SessionID', s.SessionID, { Active: false }, ctx); CacheService.getScriptCache().remove('sess:' + s.TokenHash); });
  }
  logActivity_(ctx, 'EMPLOYEE_' + status, 'EMPLOYEE', emp.EmployeeID, '');
  return ok_({ employeeId: emp.EmployeeID, status: status }, 'Employee ' + (status === 'ACTIVE' ? 'activated' : 'deactivated'));
}

/** Employee activity history: reports, tasks and audit entries across a date range. */
function employeesHistory_(ctx, p) {
  var emp = requireEmployeeAccess_(ctx, p.employeeId);
  var from = p.dateFrom ? requireDate_(p.dateFrom) : formatDate_(new Date(Date.now() - 29 * 86400000));
  var to = p.dateTo ? requireDate_(p.dateTo) : today_();
  var inRange = function (d) { return d >= from && d <= to; };
  var reports = readTable_('DAILY_REPORTS').filter(function (r) { return r.EmployeeID === emp.EmployeeID && inRange(r.Date); })
    .map(function (r) { return reportSummaryView_(r); });
  var tasks = readTable_('TASK_ENTRIES').filter(function (t) { return t.EmployeeID === emp.EmployeeID && inRange(t.Date); });
  var difficulties = readTable_('DIFFICULTIES').filter(function (d) { return d.EmployeeID === emp.EmployeeID && inRange(d.Date); });
  var logs = isAdmin_(ctx) ? readTable_('ACTIVITY_LOGS').filter(function (l) { return l.EmployeeID === emp.EmployeeID && inRange(String(l.Timestamp).substring(0, 10)); }).slice(-200) : [];
  var byDate = {};
  tasks.forEach(function (t) {
    var d = byDate[t.Date] = byDate[t.Date] || { date: t.Date, tasks: 0, completed: 0, minutes: 0, difficulties: 0 };
    d.tasks++; if (upper_(t.Status) === 'COMPLETED') d.completed++; d.minutes += toNum_(t.TimeSpentMinutes);
  });
  difficulties.forEach(function (x) { var d = byDate[x.Date] = byDate[x.Date] || { date: x.Date, tasks: 0, completed: 0, minutes: 0, difficulties: 0 }; d.difficulties++; });
  return ok_({ employee: employeeView_(emp), reports: sortBy_(reports, function (r) { return r.Date; }, true),
    timeline: sortBy_(Object.keys(byDate).map(function (k) { return byDate[k]; }), function (d) { return d.date; }, true),
    tasks: sortBy_(tasks, function (t) { return t.Date + t.StartTime; }, true).slice(0, 300), difficulties: difficulties, logs: logs, dateFrom: from, dateTo: to });
}
