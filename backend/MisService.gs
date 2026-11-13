/**
 * MisService.gs — Bulk task entry and the Weekly MIS report.
 *
 * Weekly MIS buckets (mutually exclusive, they add up to the total):
 *   COMPLETED  status is COMPLETED
 *   OVERDUE    not completed and the expected completion date is before today
 *   UPCOMING   not completed and the expected completion date (or the task date) is after today
 *   PENDING    every other open task (due today, or no due date)
 * Employees see only their own MIS; managers see their team; admins see everyone.
 */

/** Add many tasks for one employee and one date in a single call. { EmployeeID, Date, tasks: [...] } */
function tasksBulkSave_(ctx, p) {
  var rows = Array.isArray(p.tasks) ? p.tasks : [];
  if (!rows.length) throw AppError_('Add at least one task', 'VALIDATION');
  if (rows.length > 50) throw AppError_('You can add up to 50 tasks at a time', 'VALIDATION');
  var emp = requireEmployeeAccess_(ctx, trim_(p.EmployeeID) || ctx.employeeId);
  if (emp.EmployeeID !== ctx.employeeId && !isManagerOrAbove_(ctx)) throw AppError_('You can only manage your own tasks', 'FORBIDDEN');
  var date = trim_(p.Date) ? requireDate_(p.Date, 'Task date') : today_();
  lockedDay_(ctx, emp.EmployeeID, date);

  var maxH = toNum_(getSetting_('MAX_TASK_HOURS'), 14);
  var tasks = [], logs = [], ranges = [], errors = [];
  rows.forEach(function (r, i) {
    var label = 'Row ' + (i + 1);
    try {
      var d = validateTaskInput_(r || {}, false);
      if (d.StartTime && !d.EndTime || !d.StartTime && d.EndTime) throw AppError_('enter both start and end time, or leave both blank', 'VALIDATION');
      var s = null, e = null;
      if (d.StartTime) {
        if (d.StartTime.substring(0, 10) !== date || d.EndTime.substring(0, 10) !== date) throw AppError_('start and end time must be on ' + formatDateDMY_(date), 'VALIDATION');
        s = parseDateTime_(d.StartTime).getTime(); e = parseDateTime_(d.EndTime).getTime();
        if ((e - s) / 3600000 > maxH) throw AppError_('a task cannot span more than ' + maxH + ' hours', 'VALIDATION');
        var ov = findOverlap_(emp.EmployeeID, date, s, e);
        if (ov) throw AppError_('time overlaps an existing entry (' + formatTime12_(ov.StartTime) + ' – ' + (ov.EndTime ? formatTime12_(ov.EndTime) : 'running') + ')', 'OVERLAP');
        ranges.forEach(function (x) { if (s < x.e && e > x.s) throw AppError_('time overlaps row ' + x.row, 'OVERLAP'); });
        ranges.push({ s: s, e: e, row: i + 1 });
      }
      var status = d.Status || 'PENDING';
      var pct = status === 'COMPLETED' ? 100 : (d.CompletionPercent !== undefined ? d.CompletionPercent : 0);
      var task = {
        TaskID: generateId_('TSK'), Date: date, EmployeeID: emp.EmployeeID, EmployeeName: emp.EmployeeName, Department: upper_(emp.Department), Designation: emp.Designation,
        TaskTitle: d.TaskTitle, TaskDescription: d.TaskDescription || '', TaskCategory: d.TaskCategory || 'Other',
        StartTime: d.StartTime || '', EndTime: d.EndTime || '', TimeSpentMinutes: s !== null ? Math.round((e - s) / 60000) : 0,
        Priority: d.Priority || 'MEDIUM', Status: status, CompletionPercent: pct,
        RelatedDepartment: d.RelatedDepartment || '', SupportingDocuments: d.SupportingDocuments || '', Remarks: d.Remarks || '',
        TimerState: status === 'COMPLETED' ? 'DONE' : 'IDLE', PendingReason: d.PendingReason || '',
        ExpectedCompletionDate: d.ExpectedCompletionDate || '', ResponsibleDependency: d.ResponsibleDependency || '',
        CompletedAt: status === 'COMPLETED' ? nowIso_() : ''
      };
      tasks.push(task);
      if (s !== null) {
        logs.push({ LogID: generateId_('TLG'), TaskID: task.TaskID, EmployeeID: emp.EmployeeID, Date: date, StartTime: task.StartTime, EndTime: task.EndTime,
          DurationMinutes: task.TimeSpentMinutes, Source: 'MANUAL', Reason: 'Entered with task (bulk)', ApprovalStatus: 'APPROVED' });
      }
    } catch (err) {
      if (!err || !err.isAppError) throw err;
      errors.push(label + ': ' + err.message);
    }
  });
  if (errors.length) throw AppError_(errors.join(' | '), 'VALIDATION', { errors: errors });

  insert_('TASK_ENTRIES', tasks, ctx);
  if (logs.length) insert_('TASK_TIME_LOGS', logs, ctx);
  logActivity_(ctx, 'TASKS_BULK_CREATED', 'TASK', '', { employeeId: emp.EmployeeID, date: date, count: tasks.length });
  return ok_({ count: tasks.length, tasks: tasks.map(function (t) { return taskView_(t); }) }, tasks.length + ' tasks added');
}

/** Monday of the week that contains the given yyyy-MM-dd date. */
function weekStartOf_(dateStr) {
  var d = parseDateTime_(dateStr);
  var back = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(Utilities.formatDate(d, tz_(), 'EEE'));
  return formatDate_(new Date(d.getTime() - Math.max(0, back) * 86400000));
}

function misBucket_(t, today) {
  if (upper_(t.Status) === 'COMPLETED') return 'COMPLETED';
  var due = trim_(t.ExpectedCompletionDate);
  if (due && due < today) return 'OVERDUE';
  if ((due && due > today) || t.Date > today) return 'UPCOMING';
  return 'PENDING';
}

function misEmptyRow_(e) {
  return { EmployeeID: e.EmployeeID, EmployeeName: e.EmployeeName, Designation: e.Designation, Department: upper_(e.Department),
    total: 0, completed: 0, pending: 0, upcoming: 0, overdue: 0, inProgress: 0, onHold: 0, blocked: 0, highPriorityOpen: 0,
    recordedMinutes: 0, reportsSubmitted: 0, completionRate: 0, days: [] };
}

/** Weekly MIS. { weekStart?: yyyy-MM-dd (any day of the week), employeeId?: string } */
function misWeekly_(ctx, p) {
  p = p || {};
  var today = today_();
  var weekStart = weekStartOf_(trim_(p.weekStart) ? requireDate_(p.weekStart, 'Week') : today);
  var days = dateRange_(weekStart, formatDate_(new Date(parseDateTime_(weekStart).getTime() + 6 * 86400000)));
  var weekEnd = days[days.length - 1];

  var visible = visibleEmployees_(ctx);
  if (!isManagerOrAbove_(ctx)) visible = visible.filter(function (e) { return String(e.EmployeeID) === String(ctx.employeeId); });
  if (trim_(p.employeeId)) {
    requireEmployeeAccess_(ctx, p.employeeId);
    visible = visible.filter(function (e) { return String(e.EmployeeID) === String(p.employeeId); });
  }
  var ids = visible.map(function (e) { return String(e.EmployeeID); });

  var tasks = readTable_('TASK_ENTRIES').filter(function (t) { return ids.indexOf(String(t.EmployeeID)) !== -1 && t.Date >= weekStart && t.Date <= weekEnd; });
  var reports = readTable_('DAILY_REPORTS').filter(function (r) {
    return ids.indexOf(String(r.EmployeeID)) !== -1 && r.Date >= weekStart && r.Date <= weekEnd && ['SUBMITTED', 'APPROVED'].indexOf(upper_(r.Status)) !== -1;
  });

  var rows = {};
  visible.forEach(function (e) {
    var include = upper_(e.Status) === 'ACTIVE' || tasks.some(function (t) { return String(t.EmployeeID) === String(e.EmployeeID); });
    if (!include) return;
    rows[e.EmployeeID] = misEmptyRow_(e);
    rows[e.EmployeeID].days = days.map(function (d) { return { date: d, total: 0, completed: 0 }; });
  });

  var taskViews = [];
  tasks.forEach(function (t) {
    var row = rows[t.EmployeeID];
    if (!row) return;
    var b = misBucket_(t, today), st = upper_(t.Status);
    row.total++;
    row[b.toLowerCase()]++;
    if (st === 'IN PROGRESS') row.inProgress++;
    if (st === 'ON HOLD') row.onHold++;
    if (st === 'BLOCKED') row.blocked++;
    if (b !== 'COMPLETED' && ['HIGH', 'URGENT'].indexOf(upper_(t.Priority)) !== -1) row.highPriorityOpen++;
    row.recordedMinutes += toNum_(t.TimeSpentMinutes);
    var day = row.days[days.indexOf(t.Date)];
    if (day) { day.total++; if (b === 'COMPLETED') day.completed++; }
    var v = taskView_(t);
    v.Bucket = b;
    taskViews.push(v);
  });
  reports.forEach(function (r) { if (rows[r.EmployeeID]) rows[r.EmployeeID].reportsSubmitted++; });

  var list = sortBy_(Object.keys(rows).map(function (k) { var r = rows[k]; r.completionRate = pct_(r.completed, r.total); return r; }), function (r) { return r.EmployeeName; });
  var totals = misEmptyRow_({ EmployeeID: '', EmployeeName: 'All employees', Designation: '', Department: '' });
  totals.days = days.map(function (d) { return { date: d, total: 0, completed: 0 }; });
  list.forEach(function (r) {
    ['total', 'completed', 'pending', 'upcoming', 'overdue', 'inProgress', 'onHold', 'blocked', 'highPriorityOpen', 'recordedMinutes', 'reportsSubmitted'].forEach(function (k) { totals[k] += r[k]; });
    r.days.forEach(function (d, i) { totals.days[i].total += d.total; totals.days[i].completed += d.completed; });
  });
  totals.completionRate = pct_(totals.completed, totals.total);
  totals.employees = list.length;

  var bucketOrder = { OVERDUE: 0, PENDING: 1, UPCOMING: 2, COMPLETED: 3 };
  taskViews.sort(function (a, b) { return (bucketOrder[a.Bucket] - bucketOrder[b.Bucket]) || (a.Date < b.Date ? -1 : a.Date > b.Date ? 1 : 0); });

  return ok_({
    weekStart: weekStart, weekEnd: weekEnd, today: today, days: days,
    weekLabel: formatDateDMY_(weekStart) + ' – ' + formatDateDMY_(weekEnd),
    scope: isAdmin_(ctx) ? 'ALL' : (isManager_(ctx) ? 'TEAM' : 'SELF'),
    employees: list, totals: totals,
    tasks: (list.length === 1 || trim_(p.employeeId)) ? taskViews : []
  });
}
