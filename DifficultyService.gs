/**
 * DifficultyService.gs — Difficulty & delay tracker.
 * Distinguishes employee-controlled, management-approval, interdepartmental, external and technical delays.
 * Difficulties with a delay also create a DELAY_TRACKER row for delay-reason analytics.
 */

function difficultyView_(d) {
  var v = {};
  Object.keys(d).forEach(function (k) { if (k.charAt(0) !== '_') v[k] = d[k]; });
  v.DelayMinutes = toNum_(d.DelayMinutes);
  v.DelayLabel = v.DelayMinutes ? formatDuration_(v.DelayMinutes) : '';
  v.EscalationRequired = toBool_(d.EscalationRequired);
  v.ResolutionStatus = upper_(d.ResolutionStatus) || 'OPEN';
  v.DifficultyLevel = upper_(d.DifficultyLevel) || 'MEDIUM';
  v.PenalizesEmployee = CONFIG.NON_PENALIZING_DELAY_TYPES.indexOf(upper_(d.DelayType)) === -1 && upper_(d.DelayType) === 'EMPLOYEE';
  return v;
}

/** Infer the delay type from the category when the employee did not choose one. */
function inferDelayType_(category, delayType) {
  if (delayType) return upper_(delayType);
  var c = String(category);
  if (c === 'Approval Pending') return 'MANAGEMENT_APPROVAL';
  if (c === 'Other Department Dependency' || c === 'Data Not Available' || c === 'Material Not Available') return 'INTERDEPARTMENTAL';
  if (c === 'Customer Dependency') return 'EXTERNAL';
  if (c === 'Technical Issue' || c === 'System or Software Issue') return 'TECHNICAL';
  return 'EMPLOYEE';
}

function difficultiesList_(ctx, p) {
  p = p || {};
  var ids = visibleEmployeeIds_(ctx);
  var from = p.dateFrom ? requireDate_(p.dateFrom) : (p.date ? requireDate_(p.date) : formatDate_(new Date(Date.now() - 29 * 86400000)));
  var to = p.dateTo ? requireDate_(p.dateTo) : (p.date ? requireDate_(p.date) : today_());
  var list = readTable_('DIFFICULTIES').filter(function (d) {
    // Managers also see issues raised AGAINST their department.
    var mine = ids.indexOf(String(d.EmployeeID)) !== -1;
    var against = isManager_(ctx) && ctx.employee && upper_(d.DepartmentInvolved) === upper_(ctx.employee.Department);
    if (!mine && !against) return false;
    if (p.employeeId && d.EmployeeID !== p.employeeId) return false;
    if (d.Date < from || d.Date > to) return false;
    if (p.status && upper_(d.ResolutionStatus) !== upper_(p.status)) return false;
    if (p.category && d.Category !== p.category) return false;
    if (p.department && upper_(d.Department) !== upper_(p.department)) return false;
    if (p.departmentInvolved && upper_(d.DepartmentInvolved) !== upper_(p.departmentInvolved)) return false;
    return true;
  }).map(difficultyView_);
  return ok_({ difficulties: sortBy_(list, function (d) { return d.Date + d.CreatedAt; }, true), total: list.length, dateFrom: from, dateTo: to });
}

function difficultiesSave_(ctx, p) {
  var isUpdate = !!trim_(p.DifficultyID);
  var existing = isUpdate ? findById_('DIFFICULTIES', 'DifficultyID', p.DifficultyID) : null;
  if (isUpdate && !existing) throw AppError_('Difficulty record not found', 'NOT_FOUND');
  var employeeId = existing ? existing.EmployeeID : (trim_(p.EmployeeID) || ctx.employeeId);
  var emp = requireEmployeeAccess_(ctx, employeeId);
  if (emp.EmployeeID !== ctx.employeeId && !isManagerOrAbove_(ctx)) throw AppError_('You can only report your own difficulties', 'FORBIDDEN');
  var data = validateDifficultyInput_(p, isUpdate);
  var date = data.Date || (existing ? existing.Date : today_());
  lockedDay_(ctx, emp.EmployeeID, date);
  if (data.TaskID) {
    var task = findById_('TASK_ENTRIES', 'TaskID', data.TaskID);
    if (!task) throw AppError_('Linked task not found', 'VALIDATION');
    if (!data.TaskName) data.TaskName = task.TaskTitle;
  }
  if (data.DepartmentInvolved && !findOne_('DEPARTMENTS', function (d) { return upper_(d.DepartmentName) === data.DepartmentInvolved; }) && data.DepartmentInvolved !== 'MANAGEMENT' && data.DepartmentInvolved !== 'EXTERNAL') {
    throw AppError_('Department "' + data.DepartmentInvolved + '" does not exist', 'VALIDATION');
  }
  var saved;
  if (existing) {
    if (data.DelayType === undefined && data.Category) data.DelayType = inferDelayType_(data.Category, '');
    update_('DIFFICULTIES', 'DifficultyID', existing.DifficultyID, data, ctx);
    saved = findById_('DIFFICULTIES', 'DifficultyID', existing.DifficultyID);
    logActivity_(ctx, 'DIFFICULTY_UPDATED', 'DIFFICULTY', saved.DifficultyID, data);
  } else {
    var row = {
      DifficultyID: generateId_('DIF'), Date: date, EmployeeID: emp.EmployeeID, EmployeeName: emp.EmployeeName, Department: upper_(emp.Department),
      TaskID: data.TaskID || '', TaskName: data.TaskName, ProblemDescription: data.ProblemDescription, DifficultyLevel: data.DifficultyLevel || 'MEDIUM',
      Category: data.Category, Reason: data.Reason || '', DelayMinutes: data.DelayMinutes || 0, DelayType: inferDelayType_(data.Category, data.DelayType),
      ResponsibleDependency: data.ResponsibleDependency || '', DepartmentInvolved: data.DepartmentInvolved || '', AssistanceRequired: data.AssistanceRequired || '',
      EscalationRequired: !!data.EscalationRequired, ResolutionStatus: data.ResolutionStatus || (data.EscalationRequired ? 'ESCALATED' : 'OPEN'),
      ResolutionNotes: '', ResolvedBy: '', ResolvedAt: ''
    };
    insert_('DIFFICULTIES', row, ctx);
    saved = row;
    if (row.TaskID) {
      var patch = {};
      if (row.Category === 'Approval Pending' || row.Category === 'Other Department Dependency' || row.Category === 'Customer Dependency') {
        var tk = findById_('TASK_ENTRIES', 'TaskID', row.TaskID);
        if (tk && upper_(tk.Status) !== 'COMPLETED') { patch.Status = 'BLOCKED'; patch.PendingReason = tk.PendingReason || row.ProblemDescription; patch.ResponsibleDependency = tk.ResponsibleDependency || row.ResponsibleDependency || row.DepartmentInvolved; }
      }
      if (Object.keys(patch).length) update_('TASK_ENTRIES', 'TaskID', row.TaskID, patch, ctx);
    }
    logActivity_(ctx, 'DIFFICULTY_RAISED', 'DIFFICULTY', row.DifficultyID, { category: row.Category, against: row.DepartmentInvolved });
    if (row.EscalationRequired) { try { notifyEscalation_(emp, row); } catch (e) { } }
  }
  syncDelayTracker_(saved, ctx);
  return ok_({ difficulty: difficultyView_(saved) }, existing ? 'Difficulty updated' : 'Difficulty recorded');
}

/** Keep DELAY_TRACKER in sync with the difficulty row. */
function syncDelayTracker_(d, ctx) {
  var existing = findOne_('DELAY_TRACKER', function (x) { return x.DifficultyID === d.DifficultyID; });
  var hasDelay = toNum_(d.DelayMinutes) > 0 || ['Approval Pending', 'Other Department Dependency', 'Customer Dependency', 'Data Not Available', 'Material Not Available'].indexOf(d.Category) !== -1;
  if (!hasDelay) { if (existing) remove_('DELAY_TRACKER', 'DelayID', existing.DelayID); return; }
  var row = { Date: d.Date, EmployeeID: d.EmployeeID, Department: d.Department, TaskID: d.TaskID, TaskName: d.TaskName, DifficultyID: d.DifficultyID,
    DelayType: upper_(d.DelayType), DelayReason: d.Reason || d.Category, DelayMinutes: toNum_(d.DelayMinutes), ResponsibleDependency: d.ResponsibleDependency || d.DepartmentInvolved,
    Status: upper_(d.ResolutionStatus) === 'RESOLVED' ? 'RESOLVED' : 'OPEN' };
  if (existing) update_('DELAY_TRACKER', 'DelayID', existing.DelayID, row, ctx);
  else { row.DelayID = generateId_('DLY'); insert_('DELAY_TRACKER', row, ctx); }
}

/** Managers/admins resolve or escalate; employees may mark their own as resolved. */
function difficultiesUpdateStatus_(ctx, p) {
  var d = findById_('DIFFICULTIES', 'DifficultyID', p.DifficultyID);
  if (!d) throw AppError_('Difficulty record not found', 'NOT_FOUND');
  var status = requireOneOf_(upper_(p.status), CONFIG.RESOLUTION_STATUSES, 'Status');
  var own = d.EmployeeID === ctx.employeeId;
  var against = isManager_(ctx) && ctx.employee && upper_(d.DepartmentInvolved) === upper_(ctx.employee.Department);
  if (!own && !isAdmin_(ctx) && !(isManager_(ctx) && (managesEmployee_(ctx, findById_('EMPLOYEES', 'EmployeeID', d.EmployeeID)) || against))) throw AppError_('Not allowed', 'FORBIDDEN');
  if (status === 'ESCALATED' && own && !isManagerOrAbove_(ctx)) { /* employees may escalate their own issue */ }
  var patch = { ResolutionStatus: status, ResolutionNotes: p.notes !== undefined ? trim_(p.notes) : d.ResolutionNotes };
  if (status === 'RESOLVED') { patch.ResolvedBy = ctx.employeeId; patch.ResolvedAt = nowIso_(); }
  if (status === 'ESCALATED') patch.EscalationRequired = true;
  update_('DIFFICULTIES', 'DifficultyID', d.DifficultyID, patch, ctx);
  var saved = findById_('DIFFICULTIES', 'DifficultyID', d.DifficultyID);
  syncDelayTracker_(saved, ctx);
  if (status === 'RESOLVED' && saved.TaskID) {
    var t = findById_('TASK_ENTRIES', 'TaskID', saved.TaskID);
    if (t && upper_(t.Status) === 'BLOCKED') update_('TASK_ENTRIES', 'TaskID', t.TaskID, { Status: 'IN PROGRESS' }, ctx);
  }
  logActivity_(ctx, 'DIFFICULTY_' + status, 'DIFFICULTY', d.DifficultyID, patch);
  return ok_({ difficulty: difficultyView_(saved) }, 'Status updated to ' + status);
}

function difficultiesDelete_(ctx, p) {
  var d = findById_('DIFFICULTIES', 'DifficultyID', p.DifficultyID);
  if (!d) throw AppError_('Difficulty record not found', 'NOT_FOUND');
  if (d.EmployeeID !== ctx.employeeId && !isAdmin_(ctx)) throw AppError_('Not allowed', 'FORBIDDEN');
  lockedDay_(ctx, d.EmployeeID, d.Date);
  remove_('DIFFICULTIES', 'DifficultyID', d.DifficultyID);
  var dt = findOne_('DELAY_TRACKER', function (x) { return x.DifficultyID === d.DifficultyID; });
  if (dt) remove_('DELAY_TRACKER', 'DelayID', dt.DelayID);
  logActivity_(ctx, 'DIFFICULTY_DELETED', 'DIFFICULTY', d.DifficultyID, d.TaskName);
  return ok_({}, 'Difficulty deleted');
}

/** Recurring bottlenecks & unresolved issues for managers. */
function difficultiesBottlenecks_(ctx, p) {
  p = p || {};
  if (!isManagerOrAbove_(ctx)) throw AppError_('Manager access required', 'FORBIDDEN');
  var from = p.dateFrom ? requireDate_(p.dateFrom) : formatDate_(new Date(Date.now() - 29 * 86400000));
  var to = p.dateTo ? requireDate_(p.dateTo) : today_();
  var ids = visibleEmployeeIds_(ctx);
  var list = readTable_('DIFFICULTIES').filter(function (d) { return d.Date >= from && d.Date <= to && (isAdmin_(ctx) || ids.indexOf(String(d.EmployeeID)) !== -1); });
  var count = function (keyFn) {
    var g = groupBy_(list, keyFn);
    return sortBy_(Object.keys(g).filter(function (k) { return k && k !== 'undefined'; }).map(function (k) {
      return { key: k, count: g[k].length, unresolved: g[k].filter(function (d) { return upper_(d.ResolutionStatus) !== 'RESOLVED'; }).length,
        delayMinutes: g[k].reduce(function (n, d) { return n + toNum_(d.DelayMinutes); }, 0) };
    }), function (x) { return x.count; }, true);
  };
  var unresolved = list.filter(function (d) { return upper_(d.ResolutionStatus) !== 'RESOLVED'; }).map(difficultyView_);
  var ageing = unresolved.map(function (d) { d.AgeDays = Math.round((Date.now() - parseDateTime_(d.Date).getTime()) / 86400000); return d; });
  return ok_({
    dateFrom: from, dateTo: to, total: list.length,
    byCategory: count(function (d) { return d.Category; }),
    byDepartment: count(function (d) { return upper_(d.Department); }),
    byDepartmentInvolved: count(function (d) { return upper_(d.DepartmentInvolved); }),
    byDelayType: count(function (d) { return upper_(d.DelayType); }),
    byDependency: count(function (d) { return trim_(d.ResponsibleDependency); }),
    recurringTasks: count(function (d) { return trim_(d.TaskName); }).filter(function (x) { return x.count > 1; }),
    unresolved: sortBy_(ageing, function (d) { return d.AgeDays; }, true).slice(0, 100)
  });
}
