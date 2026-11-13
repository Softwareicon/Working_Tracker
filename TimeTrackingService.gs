/**
 * TimeTrackingService.gs — Timer segments, non-overlapping time math, daily timeline.
 *
 * Every timer start/pause/complete and every manual entry creates a TASK_TIME_LOGS row
 * (StartTime, EndTime). Task TimeSpentMinutes = merged duration of its own logs.
 * Daily Recorded Task Time = merged duration of all logs of the employee (overlaps counted once).
 */

/** Merge [start,end] ms intervals and return {total minutes, merged intervals}. */
function mergeIntervals_(intervals) {
  var list = intervals.filter(function (i) { return i.end > i.start; }).sort(function (a, b) { return a.start - b.start; });
  var merged = [];
  list.forEach(function (i) {
    var last = merged[merged.length - 1];
    if (last && i.start <= last.end) last.end = Math.max(last.end, i.end);
    else merged.push({ start: i.start, end: i.end });
  });
  var total = merged.reduce(function (n, m) { return n + (m.end - m.start); }, 0);
  return { minutes: Math.round(total / 60000), intervals: merged };
}

/** Convert a log row to a ms interval (open logs end "now"). */
function logInterval_(log, nowMs) {
  var s = parseDateTime_(log.StartTime);
  if (!s) return null;
  var e = log.EndTime ? parseDateTime_(log.EndTime) : new Date(nowMs || Date.now());
  if (!e) return null;
  return { start: s.getTime(), end: e.getTime(), log: log };
}

function logsForEmployeeDate_(employeeId, date) {
  return readTable_('TASK_TIME_LOGS').filter(function (l) { return l.EmployeeID === employeeId && l.Date === date && upper_(l.ApprovalStatus) !== 'REJECTED'; });
}

/** Minutes for a single task (merged over its logs). */
function taskMinutes_(taskId, logs) {
  var ints = logs.filter(function (l) { return l.TaskID === taskId; }).map(function (l) { return logInterval_(l); }).filter(Boolean);
  return mergeIntervals_(ints).minutes;
}

/** True when the proposed [start,end] overlaps any closed/open log of the employee on that date (excluding a given log id). */
function findOverlap_(employeeId, date, startMs, endMs, excludeLogId) {
  var logs = logsForEmployeeDate_(employeeId, date);
  for (var i = 0; i < logs.length; i++) {
    if (excludeLogId && logs[i].LogID === excludeLogId) continue;
    var iv = logInterval_(logs[i]);
    if (!iv) continue;
    if (startMs < iv.end && endMs > iv.start) return logs[i];
  }
  return null;
}

/** Working-day configuration for an employee. */
function workConfig_(emp) {
  var s = getSettings_();
  var workStart = emp && emp.WorkStart ? String(emp.WorkStart) : s.WORK_START;
  var workEnd = emp && emp.WorkEnd ? String(emp.WorkEnd) : s.WORK_END;
  var hours = emp && emp.WorkingHours ? toNum_(emp.WorkingHours) : toNum_(s.WORKING_HOURS, 8);
  var breakMin = emp && emp.BreakMinutes !== '' && emp.BreakMinutes !== undefined ? toNum_(emp.BreakMinutes) : toNum_(s.BREAK_MINUTES, 60);
  return { workStart: workStart, workEnd: workEnd, workingMinutes: Math.round(hours * 60), breakMinutes: breakMin };
}

/**
 * Daily time analysis for an employee:
 * first/last entry, recorded (non-overlapping) minutes, per-task minutes, timeline, unallocated time.
 */
function dailyTimeAnalysis_(emp, date, tasks, logs) {
  tasks = tasks || readTable_('TASK_ENTRIES').filter(function (t) { return t.EmployeeID === emp.EmployeeID && t.Date === date; });
  logs = logs || logsForEmployeeDate_(emp.EmployeeID, date);
  var cfg = workConfig_(emp);
  var taskById = {};
  tasks.forEach(function (t) { taskById[t.TaskID] = t; });
  var ints = logs.map(function (l) { return logInterval_(l); }).filter(Boolean);
  var merged = mergeIntervals_(ints);
  var perTask = {};
  tasks.forEach(function (t) { perTask[t.TaskID] = taskMinutes_(t.TaskID, logs); });
  // Tasks with manual Start/End but no logs still count (legacy/manual entry)
  tasks.forEach(function (t) {
    if (!perTask[t.TaskID] && t.StartTime && t.EndTime) {
      var iv = { start: parseDateTime_(t.StartTime).getTime(), end: parseDateTime_(t.EndTime).getTime() };
      if (iv.end > iv.start) { ints.push(iv); perTask[t.TaskID] = Math.round((iv.end - iv.start) / 60000); }
    }
  });
  if (ints.length !== logs.length) merged = mergeIntervals_(ints);
  var first = null, last = null;
  ints.forEach(function (i) { if (first === null || i.start < first) first = i.start; if (last === null || i.end > last) last = i.end; });
  var timeline = sortBy_(ints.map(function (i) {
    var t = i.log ? taskById[i.log.TaskID] : null;
    return { start: formatDateTime_(new Date(i.start)), end: formatDateTime_(new Date(i.end)), startLabel: formatTime12_(new Date(i.start)), endLabel: formatTime12_(new Date(i.end)),
      minutes: Math.round((i.end - i.start) / 60000), taskId: i.log ? i.log.TaskID : '', title: t ? t.TaskTitle : (i.log ? 'Task ' + i.log.TaskID : 'Manual entry'),
      category: t ? t.TaskCategory : '', status: t ? t.Status : '', source: i.log ? i.log.Source : 'TASK', open: !!(i.log && !i.log.EndTime) };
  }), function (x) { return x.start; });
  var recorded = merged.minutes;
  var unallocated = Math.max(0, cfg.workingMinutes - recorded - cfg.breakMinutes);
  var categoryMinutes = {};
  timeline.forEach(function (x) { var c = x.category || 'Other'; categoryMinutes[c] = (categoryMinutes[c] || 0) + x.minutes; });
  var running = tasks.filter(function (t) { return upper_(t.TimerState) === 'RUNNING'; }).map(function (t) { return t.TaskID; });
  return {
    date: date, workStart: cfg.workStart, workEnd: cfg.workEnd, workingMinutes: cfg.workingMinutes, breakMinutes: cfg.breakMinutes,
    firstEntry: first ? formatDateTime_(new Date(first)) : '', lastEntry: last ? formatDateTime_(new Date(last)) : '',
    recordedMinutes: recorded, productiveMinutes: recorded, unallocatedMinutes: unallocated,
    utilizationRate: pct_(recorded, Math.max(1, cfg.workingMinutes - cfg.breakMinutes)),
    perTaskMinutes: perTask, timeline: timeline, categoryMinutes: categoryMinutes, runningTaskIds: running,
    spanMinutes: first !== null && last !== null ? Math.round((last - first) / 60000) : 0
  };
}

function timelineGet_(ctx, p) {
  var emp = requireEmployeeAccess_(ctx, p.employeeId);
  var date = p.date ? requireDate_(p.date) : today_();
  return ok_(dailyTimeAnalysis_(emp, date));
}
