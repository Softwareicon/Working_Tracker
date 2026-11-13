/**
 * NotificationService.gs — E-mail notifications, scheduled automation (reminders, report generation,
 * manager summaries) and trigger management. All sends are logged in NOTIFICATION_LOGS.
 */

function emailEnabled_() { return toBool_(getSetting_('EMAIL_NOTIFICATIONS')); }

function sendEmail_(type, to, subject, htmlBody, textBody) {
  var row = { NotificationID: generateId_('NTF'), Type: type, Recipient: to, Channel: 'EMAIL', Subject: subject, Message: (textBody || htmlBody).substring(0, 2000), Status: 'SENT', Error: '' };
  try {
    if (!to) throw new Error('No recipient');
    MailApp.sendEmail({ to: to, subject: subject, htmlBody: htmlBody, body: textBody || htmlBody.replace(/<[^>]+>/g, '') });
  } catch (e) {
    row.Status = 'FAILED'; row.Error = String(e.message || e).substring(0, 500);
  }
  try { insert_('NOTIFICATION_LOGS', row); } catch (e2) { }
  return row.Status === 'SENT';
}

function emailShell_(title, bodyHtml) {
  var company = escapeHtml_(getSetting_('COMPANY_NAME'));
  return '<div style="font-family:Segoe UI,Arial,sans-serif;max-width:640px;margin:auto;border:1px solid #e3e8ef;border-radius:10px;overflow:hidden">' +
    '<div style="background:#1e3a5f;color:#fff;padding:18px 24px"><div style="font-size:12px;letter-spacing:1px;opacity:.8">' + company + '</div><div style="font-size:20px;font-weight:700">' + escapeHtml_(title) + '</div></div>' +
    '<div style="padding:20px 24px;color:#1f2937;font-size:14px;line-height:1.6">' + bodyHtml + '</div>' +
    '<div style="background:#f5f7fa;color:#6b7280;padding:12px 24px;font-size:12px">' + escapeHtml_(CONFIG.APP_NAME) + ' · automated message</div></div>';
}

function sendOtpEmail_(email, name, otp) {
  var html = emailShell_('Your login code', '<p>Hello ' + escapeHtml_(name) + ',</p><p>Your one-time login code for ' + escapeHtml_(CONFIG.APP_NAME) + ' is:</p>' +
    '<p style="font-size:30px;letter-spacing:8px;font-weight:700;color:#1e3a5f">' + otp + '</p><p>The code expires in ' + CONFIG.OTP_MINUTES + ' minutes. If you did not request it, ignore this e-mail.</p>');
  var sent = sendEmail_('OTP', email, CONFIG.APP_NAME + ' login code: ' + otp, html, 'Your login code is ' + otp + ' (valid ' + CONFIG.OTP_MINUTES + ' minutes).');
  if (!sent) throw AppError_('Could not send the login e-mail. Please try again or contact the administrator.', 'EMAIL_FAILED');
}

function sendWelcomeEmail_(emp) {
  if (!emailEnabled_()) return;
  var html = emailShell_('Welcome to ' + CONFIG.APP_NAME, '<p>Hello ' + escapeHtml_(emp.EmployeeName) + ',</p><p>Your account has been created.</p>' +
    '<table style="border-collapse:collapse"><tr><td style="padding:4px 12px 4px 0;color:#6b7280">Employee ID</td><td><b>' + escapeHtml_(emp.EmployeeID) + '</b></td></tr>' +
    '<tr><td style="padding:4px 12px 4px 0;color:#6b7280">Designation</td><td>' + escapeHtml_(emp.Designation) + '</td></tr><tr><td style="padding:4px 12px 4px 0;color:#6b7280">Department</td><td>' + escapeHtml_(emp.Department) + '</td></tr></table>' +
    '<p>Log in with this e-mail address — you will receive a one-time code each time.</p>');
  sendEmail_('WELCOME', emp.Email, 'Welcome to ' + CONFIG.APP_NAME, html);
}

function notifyManagerSubmission_(emp, report) {
  if (!emailEnabled_() || !emp.ReportingManagerID) return;
  var mgr = findById_('EMPLOYEES', 'EmployeeID', emp.ReportingManagerID);
  if (!mgr || !mgr.Email) return;
  var s = report.summary;
  var html = emailShell_('Daily report submitted: ' + emp.EmployeeName, '<p>' + escapeHtml_(emp.EmployeeName) + ' (' + escapeHtml_(emp.Designation) + ') submitted the daily report for ' + report.dateLabel + '.</p>' +
    '<ul><li>Tasks: ' + s.totalTasks + ' (completed ' + s.completed + ', pending ' + (s.pending + s.onHold) + ', blocked ' + s.blocked + ')</li><li>Recorded time: ' + formatDuration_(s.recordedMinutes) + '</li>' +
    '<li>Biggest challenge: ' + escapeHtml_(report.challenges.biggest || '—') + '</li></ul><p>Open the Employee Reports module to review and add remarks.</p>');
  sendEmail_('REPORT_SUBMITTED', mgr.Email, '[' + CONFIG.APP_NAME + '] ' + emp.EmployeeName + ' submitted ' + report.dateLabel, html);
}

function notifyEmployeeRemark_(emp, managerName, remarks, date) {
  if (!emailEnabled_() || !emp.Email) return;
  var html = emailShell_('Manager remarks on your report', '<p>' + escapeHtml_(managerName) + ' added remarks to your report for ' + formatDateDMY_(date) + ':</p><blockquote style="border-left:3px solid #1e3a5f;padding-left:12px;color:#374151">' + escapeHtml_(remarks) + '</blockquote>');
  sendEmail_('MANAGER_REMARK', emp.Email, '[' + CONFIG.APP_NAME + '] Remarks on your ' + formatDateDMY_(date) + ' report', html);
}

function notifyEscalation_(emp, d) {
  if (!emailEnabled_()) return;
  var recipients = [];
  if (emp.ReportingManagerID) { var mgr = findById_('EMPLOYEES', 'EmployeeID', emp.ReportingManagerID); if (mgr && mgr.Email) recipients.push(mgr.Email); }
  if (d.DepartmentInvolved) { var dept = findOne_('DEPARTMENTS', function (x) { return upper_(x.DepartmentName) === upper_(d.DepartmentInvolved); }); if (dept && dept.ManagerID) { var dm = findById_('EMPLOYEES', 'EmployeeID', dept.ManagerID); if (dm && dm.Email) recipients.push(dm.Email); } }
  if (!recipients.length) recipients = CONFIG.SUPER_ADMIN_EMAILS.slice();
  var html = emailShell_('Escalation: ' + d.TaskName, '<p><b>' + escapeHtml_(emp.EmployeeName) + '</b> (' + escapeHtml_(emp.Department) + ') escalated a difficulty.</p>' +
    '<ul><li>Task: ' + escapeHtml_(d.TaskName) + '</li><li>Category: ' + escapeHtml_(d.Category) + ' · Level: ' + escapeHtml_(d.DifficultyLevel) + '</li><li>Problem: ' + escapeHtml_(d.ProblemDescription) + '</li>' +
    (d.DepartmentInvolved ? '<li>Department involved: ' + escapeHtml_(d.DepartmentInvolved) + '</li>' : '') + (d.AssistanceRequired ? '<li>Assistance required: ' + escapeHtml_(d.AssistanceRequired) + '</li>' : '') + '</ul>');
  sendEmail_('ESCALATION', uniq_(recipients).join(','), '[' + CONFIG.APP_NAME + '] Escalation from ' + emp.EmployeeName + ': ' + d.TaskName, html);
}

// ---------------------------------------------------------------------------------------------
// Scheduled automation
// ---------------------------------------------------------------------------------------------

/** Reminder to employees who have not submitted today's report (runs REMINDER_MINUTES_BEFORE_CLOSE before WORK_END). */
function scheduledReminder() {
  var date = today_();
  var emps = readTable_('EMPLOYEES').filter(function (e) { return upper_(e.Status) === 'ACTIVE' && e.Email; });
  var reports = readTable_('DAILY_REPORTS').filter(function (r) { return r.Date === date; });
  var done = {};
  reports.forEach(function (r) { if (['SUBMITTED', 'APPROVED'].indexOf(r.Status) !== -1) done[r.EmployeeID] = 1; });
  var tasks = readTable_('TASK_ENTRIES').filter(function (t) { return t.Date === date; });
  var sent = 0;
  emps.forEach(function (e) {
    if (done[e.EmployeeID]) return;
    var mine = tasks.filter(function (t) { return t.EmployeeID === e.EmployeeID; });
    var open = mine.filter(function (t) { return upper_(t.Status) !== 'COMPLETED'; }).length;
    var running = mine.filter(function (t) { return upper_(t.TimerState) === 'RUNNING'; }).length;
    var html = emailShell_('Reminder: submit your daily report', '<p>Hello ' + escapeHtml_(e.EmployeeName) + ',</p><p>Your daily work report for ' + formatDateDMY_(date) + ' has not been submitted yet.</p>' +
      '<ul><li>Tasks recorded today: ' + mine.length + '</li><li>Incomplete tasks: ' + open + '</li>' + (running ? '<li><b>' + running + ' timer still running</b></li>' : '') + '</ul><p>Please complete your questionnaire and submit before the end of the day.</p>');
    if (emailEnabled_() && sendEmail_('REMINDER', e.Email, '[' + CONFIG.APP_NAME + '] Submit your daily report – ' + formatDateDMY_(date), html)) sent++;
  });
  logActivity_(null, 'SCHEDULED_REMINDER', 'SYSTEM', date, { sent: sent });
  return sent;
}

/** End-of-day: generate reports for every active employee, flag missing submissions, build department summaries. */
function scheduledReportGeneration(dateOverride) {
  var date = dateOverride || today_();
  var sys = { email: 'scheduler', employeeId: 'SYSTEM', role: CONFIG.ROLES.SUPER_ADMIN };
  var emps = readTable_('EMPLOYEES').filter(function (e) { return upper_(e.Status) === 'ACTIVE'; });
  var generated = 0, incomplete = [];
  emps.forEach(function (e) {
    try {
      // Auto-pause timers still running at closing time so recorded time is bounded.
      readTable_('TASK_ENTRIES').filter(function (t) { return t.EmployeeID === e.EmployeeID && t.Date === date && upper_(t.TimerState) === 'RUNNING'; }).forEach(function (t) { closeOpenLog_(t, sys); update_('TASK_ENTRIES', 'TaskID', t.TaskID, { TimerState: 'PAUSED' }, sys); recalcTaskTime_(t, sys); });
      var report = buildDailyReport_(e, date, sys);
      if (report.status === 'NOT_STARTED' && !report.summary.totalTasks && report.questionnaireStatus === 'NOT_STARTED') { incomplete.push(e.EmployeeName + ' (no data)'); persistReport_(e, report, sys, 'NOT_STARTED'); return; }
      report = persistReport_(e, report, sys);
      generated++;
      if (report.incomplete) incomplete.push(e.EmployeeName + ' (' + report.missing.join('; ') + ')');
    } catch (err) { logActivity_(sys, 'SCHEDULED_REPORT_ERROR', 'EMPLOYEE', e.EmployeeID, String(err)); }
  });
  readTable_('DEPARTMENTS').filter(function (d) { return toBool_(d.Active); }).forEach(function (d) { try { buildDepartmentSummary_(d.DepartmentName, date, sys); } catch (err) { } });
  logActivity_(sys, 'SCHEDULED_REPORT_GENERATION', 'SYSTEM', date, { generated: generated, incomplete: incomplete });
  return { generated: generated, incomplete: incomplete };
}

/** Manager summaries by e-mail (department managers + reporting managers + admins). */
function scheduledManagerSummary(dateOverride) {
  var date = dateOverride || today_();
  var sys = { email: 'scheduler', employeeId: 'SYSTEM', role: CONFIG.ROLES.SUPER_ADMIN };
  if (!emailEnabled_()) return 0;
  var emps = readTable_('EMPLOYEES');
  var byId = {};
  emps.forEach(function (e) { byId[e.EmployeeID] = e; });
  var depts = readTable_('DEPARTMENTS').filter(function (d) { return toBool_(d.Active); });
  var sent = 0;
  var allHtml = '';
  depts.forEach(function (d) {
    var sm = buildDepartmentSummary_(d.DepartmentName, date, sys);
    var html = '<h3 style="margin:16px 0 6px;color:#1e3a5f">' + escapeHtml_(sm.department) + '</h3><p>Submitted ' + sm.reportsSubmitted + '/' + sm.totalEmployees + ' · Tasks ' + sm.tasksCompleted + '/' + sm.totalTasks + ' completed · ' + sm.tasksBlocked + ' blocked · ' + sm.totalRecordedLabel + ' recorded</p>' +
      '<table style="border-collapse:collapse;width:100%;font-size:13px"><tr style="background:#f1f5f9"><th align="left" style="padding:4px 6px">Employee</th><th style="padding:4px 6px">Status</th><th style="padding:4px 6px">Done/Total</th><th style="padding:4px 6px">Time</th></tr>' +
      sm.employees.map(function (e) { return '<tr><td style="padding:4px 6px;border-top:1px solid #e5e7eb">' + escapeHtml_(e.EmployeeName) + '</td><td align="center" style="padding:4px 6px;border-top:1px solid #e5e7eb">' + e.Status + '</td><td align="center" style="padding:4px 6px;border-top:1px solid #e5e7eb">' + e.Completed + '/' + e.TotalTasks + '</td><td align="center" style="padding:4px 6px;border-top:1px solid #e5e7eb">' + formatDuration_(e.RecordedMinutes) + '</td></tr>'; }).join('') + '</table>' +
      (sm.majorDifficulties.length ? '<p><b>Difficulties:</b> ' + sm.majorDifficulties.map(function (m) { return escapeHtml_(m.category) + ' (' + m.count + ')'; }).join(', ') + '</p>' : '');
    allHtml += html;
    var recipients = [];
    if (d.ManagerID && byId[d.ManagerID]) recipients.push(byId[d.ManagerID].Email);
    emps.filter(function (e) { return upper_(e.Department) === upper_(d.DepartmentName) && e.ReportingManagerID && byId[e.ReportingManagerID]; }).forEach(function (e) { recipients.push(byId[e.ReportingManagerID].Email); });
    recipients = uniq_(recipients.filter(Boolean));
    if (recipients.length && sendEmail_('MANAGER_SUMMARY', recipients.join(','), '[' + CONFIG.APP_NAME + '] ' + sm.department + ' summary – ' + sm.dateLabel, emailShell_(sm.department + ' daily summary', html))) sent++;
  });
  var admins = emps.filter(function (e) { return [CONFIG.ROLES.ADMIN, CONFIG.ROLES.SUPER_ADMIN].indexOf(e.Role) !== -1 && e.Email && upper_(e.Status) === 'ACTIVE'; }).map(function (e) { return e.Email; });
  if (admins.length && sendEmail_('MANAGEMENT_SUMMARY', uniq_(admins).join(','), '[' + CONFIG.APP_NAME + '] Management summary – ' + formatDateDMY_(date), emailShell_('Management daily summary', allHtml))) sent++;
  logActivity_(sys, 'SCHEDULED_MANAGER_SUMMARY', 'SYSTEM', date, { sent: sent });
  return sent;
}

/** (Re)create the time-based triggers from SYSTEM_SETTINGS. Run from the editor or Settings > "Apply schedule". */
function setupTriggers() {
  var s = getSettings_();
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (['scheduledReminder', 'scheduledReportGeneration', 'scheduledManagerSummary'].indexOf(t.getHandlerFunction()) !== -1) ScriptApp.deleteTrigger(t);
  });
  var reminderMin = hhmmToMinutes_(s.WORK_END) - toNum_(s.REMINDER_MINUTES_BEFORE_CLOSE, 30);
  var mk = function (fn, minutes) {
    var h = Math.floor(((minutes % 1440) + 1440) % 1440 / 60), m = minutes % 60;
    ScriptApp.newTrigger(fn).timeBased().everyDays(1).atHour(h).nearMinute(m).inTimezone(tz_()).create();
    return pad2_(h) + ':' + pad2_(m);
  };
  var out = { reminder: mk('scheduledReminder', reminderMin), reportGeneration: mk('scheduledReportGeneration', hhmmToMinutes_(s.REPORT_GENERATION_TIME)), managerSummary: mk('scheduledManagerSummary', hhmmToMinutes_(s.MANAGER_SUMMARY_TIME)) };
  logActivity_(null, 'TRIGGERS_SETUP', 'SYSTEM', '', out);
  return out;
}

function triggersStatus_() {
  return ScriptApp.getProjectTriggers().map(function (t) { return { handler: t.getHandlerFunction(), type: String(t.getEventType()) }; });
}
