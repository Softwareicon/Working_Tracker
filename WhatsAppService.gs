/**
 * WhatsAppService.gs — Builds concise WhatsApp-ready text and Click-to-Chat links.
 * wa.me links can prefill text only; PDF attachments use the Web Share API on the client
 * (or Download PDF + manual attach). Phone numbers are configurable per employee and in settings.
 */

function waList_(items, max) {
  items = (items || []).filter(Boolean);
  if (!items.length) return 'None';
  return items.slice(0, max || 5).map(function (x, i) { return (i + 1) + '. ' + String(x).replace(/\s+/g, ' ').substring(0, 120); }).join('\n');
}

function buildWhatsAppMessage_(r) {
  var s = r.summary, p = r.productivity;
  var statusLabel = { SUBMITTED: 'Submitted', APPROVED: 'Approved', INCOMPLETE: 'Incomplete (not submitted)', NOT_STARTED: 'Not started', REOPENED: 'Reopened', DRAFT: 'Draft' }[r.status] || r.status;
  var challenges = [r.challenges.biggest].concat(r.challenges.approvals, r.challenges.interdepartmental, r.challenges.technical).filter(Boolean);
  var priorities = [].concat(r.tomorrow.planned, r.tomorrow.highPriority, r.tomorrow.immediate).filter(Boolean);
  var pending = r.pending.map(function (x) { return x.title + (x.reason ? ' – ' + x.reason : ''); }).concat(r.pendingFromQuestionnaire || []);
  return [
    '*' + upper_(r.company) + '*', '*DAILY WORK REPORT*', '',
    'Date: ' + r.dateLabel, '',
    'Employee: ' + r.employee.name, 'Department: ' + r.employee.department, 'Designation: ' + r.employee.designation, '',
    '*WORK SUMMARY*',
    'Total Tasks: ' + s.totalTasks, 'Completed: ' + s.completed, 'In Progress: ' + s.inProgress, 'Pending: ' + (s.pending + s.onHold) + (s.blocked ? '\nBlocked: ' + s.blocked : ''), '',
    '*TIME UTILIZATION*',
    'Working Hours: ' + formatDuration_(s.workingMinutes), 'Recorded Task Time: ' + formatDuration_(s.recordedMinutes), 'Unallocated Time: ' + formatDuration_(s.unallocatedMinutes),
    'Completion Rate: ' + p.completionRate + '%', '',
    '*MAJOR ACHIEVEMENTS*', waList_(r.achievements, 5), '',
    '*PENDING WORK*', waList_(uniq_(pending), 5), '',
    '*MAJOR CHALLENGES*', waList_(uniq_(challenges), 4), '',
    '*PRIORITIES FOR TOMORROW*', waList_(uniq_(priorities), 5), '',
    'Report Status: ' + statusLabel + '.'
  ].join('\n');
}

function buildDepartmentWhatsAppMessage_(sm) {
  return [
    '*' + upper_(sm.company) + '*', '*DEPARTMENT DAILY SUMMARY – ' + sm.department + '*', '',
    'Date: ' + sm.dateLabel, '',
    'Employees: ' + sm.totalEmployees, 'Reports Submitted: ' + sm.reportsSubmitted, 'Reports Pending: ' + sm.reportsPending, '',
    '*TASKS*', 'Total: ' + sm.totalTasks, 'Completed: ' + sm.tasksCompleted, 'In Progress: ' + sm.tasksInProgress, 'Pending: ' + sm.tasksPending, 'Blocked: ' + sm.tasksBlocked,
    'Avg Completion Rate: ' + sm.avgCompletionRate + '%', 'Recorded Time: ' + sm.totalRecordedLabel, '',
    '*TEAM*', sm.employees.map(function (e) { return '• ' + e.EmployeeName + ': ' + e.Completed + '/' + e.TotalTasks + ' done, ' + formatDuration_(e.RecordedMinutes) + ' [' + e.Status + ']'; }).join('\n') || 'No employees', '',
    '*MAJOR DIFFICULTIES*', waList_(sm.majorDifficulties.map(function (m) { return m.category + ' (' + m.count + (m.unresolved ? ', ' + m.unresolved + ' unresolved' : '') + ')'; }), 5)
  ].join('\n');
}

function waLink_(number, text) {
  var digits = String(number || '').replace(/[^\d]/g, '');
  if (digits.length === 10) digits = '91' + digits; // default country code (India) when 10 digits given
  var enc = encodeURIComponent(text);
  return digits ? 'https://wa.me/' + digits + '?text=' + enc : 'https://wa.me/?text=' + enc;
}

/**
 * API: { reportId | employeeId+date, target: 'self' | 'manager' | 'custom' | 'default', number? , type: 'employee' | 'department', department? }
 * Returns the text and a ready wa.me URL.
 */
function reportsWhatsApp_(ctx, p) {
  var settings = getSettings_();
  var text, number = '';
  if (upper_(p.type) === 'DEPARTMENT') {
    if (!isManagerOrAbove_(ctx)) throw AppError_('Manager access required', 'FORBIDDEN');
    var sm = buildDepartmentSummary_(p.department, p.date ? requireDate_(p.date) : today_(), ctx);
    text = buildDepartmentWhatsAppMessage_(sm);
    number = settings.WHATSAPP_MANAGEMENT_NUMBER || settings.WHATSAPP_DEFAULT_NUMBER;
  } else {
    var res = reportsGet_(ctx, p);
    var r = res.data.report;
    text = buildWhatsAppMessage_(r);
    var target = upper_(p.target || 'default');
    if (target === 'MANAGER') { var mgr = r.employee.managerId ? findById_('EMPLOYEES', 'EmployeeID', r.employee.managerId) : null; number = mgr ? (mgr.WhatsAppNumber || mgr.Mobile) : ''; if (!number) throw AppError_('Reporting manager has no WhatsApp number configured', 'VALIDATION'); }
    else if (target === 'SELF') number = r.employee.whatsapp;
    else if (target === 'CUSTOM') number = cleanMobile_(p.number);
    else number = settings.WHATSAPP_DEFAULT_NUMBER || '';
  }
  return ok_({ text: text, number: number, url: waLink_(number, text) });
}
