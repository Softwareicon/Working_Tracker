/**
 * TaskService.gs — Daily task entries, timers (start/pause/resume/complete), manual time.
 */

function taskView_(t, perTaskMinutes) {
  var v = {};
  Object.keys(t).forEach(function (k) { if (k.charAt(0) !== '_') v[k] = t[k]; });
  v.Status = upper_(t.Status) || 'PENDING';
  v.Priority = upper_(t.Priority) || 'MEDIUM';
  v.TimerState = upper_(t.TimerState) || 'IDLE';
  v.CompletionPercent = toNum_(t.CompletionPercent);
  v.TimeSpentMinutes = perTaskMinutes && perTaskMinutes[t.TaskID] !== undefined ? perTaskMinutes[t.TaskID] : toNum_(t.TimeSpentMinutes);
  v.TimeSpentLabel = formatDuration_(v.TimeSpentMinutes);
  v.StartLabel = t.StartTime ? formatTime12_(t.StartTime) : '';
  v.EndLabel = t.EndTime ? formatTime12_(t.EndTime) : '';
  if (v.TimerState === 'RUNNING') { var ol = openLogForTask_(t.TaskID); v.RunningSince = ol ? ol.StartTime : ''; v.ServerNow = nowIso_(); }
  return v;
}

function lockedDay_(ctx, employeeId, date) {
  var report = findOne_('DAILY_REPORTS', function (r) { return r.EmployeeID === employeeId && r.Date === date; });
  if (report && toBool_(report.Locked) && !isAdmin_(ctx)) throw AppError_('This day is locked after approval. Ask your manager to reopen it.', 'LOCKED');
  return report;
}

/** List tasks. Employees: own; managers: team; admins: all. Filters: employeeId, date, dateFrom, dateTo, status, department, priority. */
function tasksList_(ctx, p) {
  p = p || {};
  var ids = visibleEmployeeIds_(ctx);
  var byId = {};
  readTable_('EMPLOYEES').forEach(function (e) { byId[e.EmployeeID] = e; });
  var from = p.dateFrom ? requireDate_(p.dateFrom) : (p.date ? requireDate_(p.date) : today_());
  var to = p.dateTo ? requireDate_(p.dateTo) : (p.date ? requireDate_(p.date) : from);
  var list = readTable_('TASK_ENTRIES').filter(function (t) {
    if (ids.indexOf(String(t.EmployeeID)) === -1) return false;
    if (p.employeeId && t.EmployeeID !== p.employeeId) return false;
    if (t.Date < from || t.Date > to) return false;
    if (p.status && upper_(t.Status) !== upper_(p.status)) return false;
    if (p.priority && upper_(t.Priority) !== upper_(p.priority)) return false;
    if (p.department && upper_(t.Department) !== upper_(p.department)) return false;
    if (p.category && t.TaskCategory !== p.category) return false;
    return true;
  });
  var perTask = {};
  if (p.employeeId && from === to && byId[p.employeeId]) perTask = dailyTimeAnalysis_(byId[p.employeeId], from, list).perTaskMinutes;
  var views = sortBy_(list.map(function (t) { return taskView_(t, perTask); }), function (t) { return t.Date + '|' + (t.StartTime || '9999') + '|' + t.CreatedAt; }, true);
  return ok_({ tasks: views, total: views.length, dateFrom: from, dateTo: to });
}

/** Create / update a task entry (employee own, admin any, manager for team). */
function tasksSave_(ctx, p) {
  var isUpdate = !!trim_(p.TaskID);
  var existing = isUpdate ? findById_('TASK_ENTRIES', 'TaskID', p.TaskID) : null;
  if (isUpdate && !existing) throw AppError_('Task not found', 'NOT_FOUND');
  var employeeId = existing ? existing.EmployeeID : (trim_(p.EmployeeID) || ctx.employeeId);
  var emp = requireEmployeeAccess_(ctx, employeeId);
  if (emp.EmployeeID !== ctx.employeeId && !isManagerOrAbove_(ctx)) throw AppError_('You can only manage your own tasks', 'FORBIDDEN');
  var data = validateTaskInput_(p, isUpdate);
  var date = data.Date || (existing ? existing.Date : today_());
  lockedDay_(ctx, emp.EmployeeID, date);
  if (data.StartTime && data.StartTime.substring(0, 10) !== date) throw AppError_('Start time must be on the task date', 'VALIDATION');
  if (data.EndTime && data.EndTime.substring(0, 10) !== date) throw AppError_('End time must be on the task date', 'VALIDATION');
  var maxH = toNum_(getSetting_('MAX_TASK_HOURS'), 14);
  if (data.StartTime && data.EndTime && minutesBetween_(data.StartTime, data.EndTime) > maxH * 60) throw AppError_('A task cannot span more than ' + maxH + ' hours', 'VALIDATION');

  if (data.Status === 'COMPLETED') { data.CompletionPercent = 100; data.CompletedAt = existing && existing.CompletedAt ? existing.CompletedAt : nowIso_(); }
  else if (data.Status && existing && upper_(existing.Status) === 'COMPLETED') { data.CompletedAt = ''; if (data.CompletionPercent === undefined || data.CompletionPercent === 100) data.CompletionPercent = 90; }
  if (data.Status && ['PENDING', 'ON HOLD', 'BLOCKED'].indexOf(data.Status) !== -1 && data.CompletionPercent === undefined && !existing) data.CompletionPercent = 0;

  var saved;
  if (existing) {
    if (upper_(existing.TimerState) === 'RUNNING' && data.Status && data.Status !== 'IN PROGRESS') {
      // Changing status away from IN PROGRESS stops the running timer.
      closeOpenLog_(existing, ctx);
      data.TimerState = data.Status === 'COMPLETED' ? 'DONE' : 'PAUSED';
    }
    // Manual start/end edit without logs: keep TimeSpent consistent.
    update_('TASK_ENTRIES', 'TaskID', existing.TaskID, data, ctx);
    saved = findById_('TASK_ENTRIES', 'TaskID', existing.TaskID);
    logActivity_(ctx, 'TASK_UPDATED', 'TASK', saved.TaskID, data);
  } else {
    var row = {
      TaskID: generateId_('TSK'), Date: date, EmployeeID: emp.EmployeeID, EmployeeName: emp.EmployeeName, Department: upper_(emp.Department), Designation: emp.Designation,
      TaskTitle: data.TaskTitle, TaskDescription: data.TaskDescription || '', TaskCategory: data.TaskCategory || 'Other',
      StartTime: data.StartTime || '', EndTime: data.EndTime || '', TimeSpentMinutes: 0,
      Priority: data.Priority || 'MEDIUM', Status: data.Status || 'PENDING', CompletionPercent: data.CompletionPercent !== undefined ? data.CompletionPercent : (data.Status === 'COMPLETED' ? 100 : 0),
      RelatedDepartment: data.RelatedDepartment || '', SupportingDocuments: data.SupportingDocuments || '', Remarks: data.Remarks || '', TimerState: 'IDLE',
      PendingReason: data.PendingReason || '', ExpectedCompletionDate: data.ExpectedCompletionDate || '', ResponsibleDependency: data.ResponsibleDependency || '',
      CompletedAt: data.Status === 'COMPLETED' ? nowIso_() : ''
    };
    // A task created with explicit start & end time gets a manual log so the timeline and totals include it.
    // Overlap is checked BEFORE anything is written.
    var s = null, e = null;
    if (row.StartTime && row.EndTime) {
      s = parseDateTime_(row.StartTime).getTime(); e = parseDateTime_(row.EndTime).getTime();
      var ov = findOverlap_(emp.EmployeeID, date, s, e);
      if (ov) throw AppError_('This time range overlaps with another entry (' + formatTime12_(ov.StartTime) + ' – ' + (ov.EndTime ? formatTime12_(ov.EndTime) : 'running') + ').', 'OVERLAP');
    }
    insert_('TASK_ENTRIES', row, ctx);
    saved = row;
    if (s !== null) {
      insert_('TASK_TIME_LOGS', { LogID: generateId_('TLG'), TaskID: row.TaskID, EmployeeID: emp.EmployeeID, Date: date, StartTime: row.StartTime, EndTime: row.EndTime,
        DurationMinutes: Math.round((e - s) / 60000), Source: 'MANUAL', Reason: 'Entered with task', ApprovalStatus: 'APPROVED' }, ctx);
    }
    logActivity_(ctx, 'TASK_CREATED', 'TASK', row.TaskID, { title: row.TaskTitle });
  }
  recalcTaskTime_(saved, ctx);
  saved = findById_('TASK_ENTRIES', 'TaskID', saved.TaskID);
  return ok_({ task: taskView_(saved) }, existing ? 'Task updated' : 'Task added');
}

function tasksDelete_(ctx, p) {
  var t = findById_('TASK_ENTRIES', 'TaskID', p.TaskID);
  if (!t) throw AppError_('Task not found', 'NOT_FOUND');
  requireEmployeeAccess_(ctx, t.EmployeeID);
  if (t.EmployeeID !== ctx.employeeId && !isAdmin_(ctx)) throw AppError_('Only the task owner or an admin can delete a task', 'FORBIDDEN');
  lockedDay_(ctx, t.EmployeeID, t.Date);
  remove_('TASK_ENTRIES', 'TaskID', t.TaskID);
  readTable_('TASK_TIME_LOGS').filter(function (l) { return l.TaskID === t.TaskID; }).forEach(function (l) { remove_('TASK_TIME_LOGS', 'LogID', l.LogID); });
  logActivity_(ctx, 'TASK_DELETED', 'TASK', t.TaskID, { title: t.TaskTitle });
  return ok_({}, 'Task deleted');
}

function openLogForTask_(taskId) {
  return findOne_('TASK_TIME_LOGS', function (l) { return l.TaskID === taskId && !l.EndTime; });
}

function closeOpenLog_(task, ctx) {
  var log = openLogForTask_(task.TaskID);
  if (!log) return null;
  var end = nowIso_();
  var mins = minutesBetween_(log.StartTime, end);
  update_('TASK_TIME_LOGS', 'LogID', log.LogID, { EndTime: end, DurationMinutes: mins }, ctx);
  return log;
}

/** Recompute TimeSpentMinutes (merged) and Start/End bounds from logs. */
function recalcTaskTime_(task, ctx) {
  var logs = readTable_('TASK_TIME_LOGS').filter(function (l) { return l.TaskID === task.TaskID && upper_(l.ApprovalStatus) !== 'REJECTED'; });
  if (!logs.length) return;
  var mins = taskMinutes_(task.TaskID, logs);
  var first = null, last = null, open = false;
  logs.forEach(function (l) {
    var s = parseDateTime_(l.StartTime); if (s && (first === null || s.getTime() < first)) first = s.getTime();
    if (!l.EndTime) { open = true; return; }
    var e = parseDateTime_(l.EndTime); if (e && (last === null || e.getTime() > last)) last = e.getTime();
  });
  var patch = { TimeSpentMinutes: mins, StartTime: first !== null ? formatDateTime_(new Date(first)) : task.StartTime };
  if (!open && last !== null) patch.EndTime = formatDateTime_(new Date(last));
  update_('TASK_ENTRIES', 'TaskID', task.TaskID, patch, ctx);
}

/**
 * Timer actions: start | pause | resume | complete.
 * Overlap prevention: only one RUNNING timer per employee; starting a second one is refused.
 */
function tasksTimer_(ctx, p) {
  var action = upper_(p.action);
  requireOneOf_(action, ['START', 'PAUSE', 'RESUME', 'COMPLETE'], 'Timer action');
  return withLock_(function () {
    var t = findById_('TASK_ENTRIES', 'TaskID', p.TaskID);
    if (!t) throw AppError_('Task not found', 'NOT_FOUND');
    if (t.EmployeeID !== ctx.employeeId && !isAdmin_(ctx)) throw AppError_('Only the task owner can operate its timer', 'FORBIDDEN');
    lockedDay_(ctx, t.EmployeeID, t.Date);
    var state = upper_(t.TimerState) || 'IDLE';
    var now = nowIso_();
    var msg = '';
    if (action === 'START' || action === 'RESUME') {
      if (upper_(t.Status) === 'COMPLETED') throw AppError_('Task is already completed. Reopen it first.', 'VALIDATION');
      if (state === 'RUNNING') throw AppError_('Timer is already running for this task', 'VALIDATION');
      var running = findOne_('TASK_ENTRIES', function (x) { return x.EmployeeID === t.EmployeeID && upper_(x.TimerState) === 'RUNNING' && x.TaskID !== t.TaskID; });
      if (running) throw AppError_('Another task is already running: "' + running.TaskTitle + '". Pause or complete it first.', 'TIMER_CONFLICT', { runningTaskId: running.TaskID, runningTaskTitle: running.TaskTitle });
      if (t.Date !== today_() && !isAdmin_(ctx)) throw AppError_('Timers can only run on today\'s tasks. Use a manual time entry for past dates.', 'VALIDATION');
      insert_('TASK_TIME_LOGS', { LogID: generateId_('TLG'), TaskID: t.TaskID, EmployeeID: t.EmployeeID, Date: t.Date, StartTime: now, EndTime: '', DurationMinutes: 0, Source: 'TIMER', Reason: '', ApprovalStatus: 'APPROVED' }, ctx);
      update_('TASK_ENTRIES', 'TaskID', t.TaskID, { TimerState: 'RUNNING', Status: 'IN PROGRESS', StartTime: t.StartTime || now, EndTime: '' }, ctx);
      msg = action === 'START' ? 'Timer started' : 'Timer resumed';
    } else if (action === 'PAUSE') {
      if (state !== 'RUNNING') throw AppError_('Timer is not running', 'VALIDATION');
      closeOpenLog_(t, ctx);
      update_('TASK_ENTRIES', 'TaskID', t.TaskID, { TimerState: 'PAUSED' }, ctx);
      msg = 'Timer paused';
    } else if (action === 'COMPLETE') {
      closeOpenLog_(t, ctx);
      update_('TASK_ENTRIES', 'TaskID', t.TaskID, { TimerState: 'DONE', Status: 'COMPLETED', CompletionPercent: 100, CompletedAt: now, EndTime: now }, ctx);
      msg = 'Task completed';
    }
    var saved = findById_('TASK_ENTRIES', 'TaskID', t.TaskID);
    recalcTaskTime_(saved, ctx);
    saved = findById_('TASK_ENTRIES', 'TaskID', t.TaskID);
    logActivity_(ctx, 'TIMER_' + action, 'TASK', t.TaskID, '');
    var v = taskView_(saved);
    if (action === 'COMPLETE') v.TimeSpentLabel = formatDuration_(v.TimeSpentMinutes);
    return ok_({ task: v }, msg + (action === 'COMPLETE' ? ' — ' + formatDuration_(v.TimeSpentMinutes) + ' recorded' : ''));
  });
}

/** Manual time entry: { TaskID, StartTime, EndTime, Reason } */
function tasksManualTime_(ctx, p) {
  var t = findById_('TASK_ENTRIES', 'TaskID', p.TaskID);
  if (!t) throw AppError_('Task not found', 'NOT_FOUND');
  requireEmployeeAccess_(ctx, t.EmployeeID);
  if (t.EmployeeID !== ctx.employeeId && !isManagerOrAbove_(ctx)) throw AppError_('Not allowed', 'FORBIDDEN');
  lockedDay_(ctx, t.EmployeeID, t.Date);
  checkManualTimePolicy_(ctx, p.Reason);
  var start = requireDateTime_(p.StartTime, 'Start time'), end = requireDateTime_(p.EndTime, 'End time');
  var s = parseDateTime_(start).getTime(), e = parseDateTime_(end).getTime();
  if (e <= s) throw AppError_('End time must be after start time', 'VALIDATION');
  if (start.substring(0, 10) !== t.Date || end.substring(0, 10) !== t.Date) throw AppError_('Manual time must fall on the task date (' + t.Date + ')', 'VALIDATION');
  if (e > Date.now() + 60000 && !isAdmin_(ctx)) throw AppError_('Time entries cannot be in the future', 'VALIDATION');
  var maxH = toNum_(getSetting_('MAX_TASK_HOURS'), 14);
  if ((e - s) / 3600000 > maxH) throw AppError_('A single entry cannot exceed ' + maxH + ' hours', 'VALIDATION');
  var ov = findOverlap_(t.EmployeeID, t.Date, s, e);
  if (ov) {
    var ovTask = findById_('TASK_ENTRIES', 'TaskID', ov.TaskID);
    throw AppError_('Overlaps with "' + (ovTask ? ovTask.TaskTitle : ov.TaskID) + '" (' + formatTime12_(ov.StartTime) + ' – ' + (ov.EndTime ? formatTime12_(ov.EndTime) : 'running') + ')', 'OVERLAP');
  }
  insert_('TASK_TIME_LOGS', { LogID: generateId_('TLG'), TaskID: t.TaskID, EmployeeID: t.EmployeeID, Date: t.Date, StartTime: start, EndTime: end,
    DurationMinutes: Math.round((e - s) / 60000), Source: 'MANUAL', Reason: trim_(p.Reason), ApprovalStatus: 'APPROVED' }, ctx);
  var patch = {};
  if (upper_(t.Status) === 'PENDING') patch.Status = 'IN PROGRESS';
  if (Object.keys(patch).length) update_('TASK_ENTRIES', 'TaskID', t.TaskID, patch, ctx);
  recalcTaskTime_(t, ctx);
  logActivity_(ctx, 'MANUAL_TIME_ADDED', 'TASK', t.TaskID, { start: start, end: end, reason: trim_(p.Reason) });
  return ok_({ task: taskView_(findById_('TASK_ENTRIES', 'TaskID', t.TaskID)) }, 'Manual time added (' + formatDuration_(Math.round((e - s) / 60000)) + ')');
}

/** Time logs of a task (for the task detail drawer). */
function tasksLogs_(ctx, p) {
  var t = findById_('TASK_ENTRIES', 'TaskID', p.TaskID);
  if (!t) throw AppError_('Task not found', 'NOT_FOUND');
  requireEmployeeAccess_(ctx, t.EmployeeID);
  var logs = readTable_('TASK_TIME_LOGS').filter(function (l) { return l.TaskID === t.TaskID; }).map(function (l) {
    return { LogID: l.LogID, StartTime: l.StartTime, EndTime: l.EndTime, StartLabel: formatTime12_(l.StartTime), EndLabel: l.EndTime ? formatTime12_(l.EndTime) : 'Running',
      DurationMinutes: l.EndTime ? toNum_(l.DurationMinutes) : minutesBetween_(l.StartTime, nowIso_()), Source: l.Source, Reason: l.Reason, ApprovalStatus: l.ApprovalStatus };
  });
  return ok_({ task: taskView_(t), logs: sortBy_(logs, function (l) { return l.StartTime; }) });
}

function tasksDeleteLog_(ctx, p) {
  var log = findById_('TASK_TIME_LOGS', 'LogID', p.LogID);
  if (!log) throw AppError_('Time log not found', 'NOT_FOUND');
  var t = findById_('TASK_ENTRIES', 'TaskID', log.TaskID);
  if (!isAdmin_(ctx) && (!t || t.EmployeeID !== ctx.employeeId)) throw AppError_('Not allowed', 'FORBIDDEN');
  if (t) lockedDay_(ctx, t.EmployeeID, t.Date);
  remove_('TASK_TIME_LOGS', 'LogID', log.LogID);
  if (t) { if (!log.EndTime) update_('TASK_ENTRIES', 'TaskID', t.TaskID, { TimerState: 'PAUSED' }, ctx); recalcTaskTime_(t, ctx); }
  logActivity_(ctx, 'TIME_LOG_DELETED', 'TASK', log.TaskID, log);
  return ok_({}, 'Time entry removed');
}
