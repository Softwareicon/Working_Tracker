/**
 * ReportService.gs — Daily employee reports, department summaries, submission workflow.
 *
 * Status workflow: NOT_STARTED -> INCOMPLETE (data exists, not submitted) -> SUBMITTED -> APPROVED (locked)
 *                  APPROVED/SUBMITTED -> REOPENED (by manager/admin) -> SUBMITTED ...
 * Reports are never marked complete for employees who have not submitted; they are flagged INCOMPLETE.
 */

function findAnswer_(responses, regex) {
  for (var i = 0; i < responses.length; i++) if (regex.test(String(responses[i].QuestionText))) return responses[i].Answer;
  return '';
}

function splitLines_(text) {
  if (Array.isArray(text)) return text.map(trim_).filter(Boolean);
  return String(text || '').split(/\r?\n|;|•/).map(function (s) { return trim_(s).replace(/^[-*\d.)\s]+/, ''); }).filter(Boolean);
}

/** Build the full report object for an employee/date (pure computation over current data). */
function buildDailyReport_(emp, date, ctx) {
  var tasks = readTable_('TASK_ENTRIES').filter(function (t) { return t.EmployeeID === emp.EmployeeID && t.Date === date; });
  var logs = logsForEmployeeDate_(emp.EmployeeID, date);
  var responses = readTable_('DAILY_RESPONSES').filter(function (r) { return r.EmployeeID === emp.EmployeeID && r.Date === date; })
    .map(function (r) { r = Object.assign({}, r); r.Answer = safeJsonParse_(r.Answer, r.Answer); return r; });
  var difficulties = readTable_('DIFFICULTIES').filter(function (d) { return d.EmployeeID === emp.EmployeeID && d.Date === date; }).map(difficultyView_);
  var time = dailyTimeAnalysis_(emp, date, tasks, logs);
  var existing = findOne_('DAILY_REPORTS', function (r) { return r.EmployeeID === emp.EmployeeID && r.Date === date; });
  var remarks = readTable_('MANAGER_REMARKS').filter(function (m) { return m.EmployeeID === emp.EmployeeID && m.Date === date; });
  var settings = getSettings_();
  var mgr = emp.ReportingManagerID ? findById_('EMPLOYEES', 'EmployeeID', emp.ReportingManagerID) : null;

  var qStatus = 'NOT_STARTED';
  responses.forEach(function (r) { if (r.Status === 'SUBMITTED') qStatus = 'SUBMITTED'; else if (qStatus !== 'SUBMITTED') qStatus = 'DRAFT'; });

  var st = function (s) { return upper_(s); };
  var views = tasks.map(function (t) { return taskView_(t, time.perTaskMinutes); });
  var byStatus = { COMPLETED: 0, 'IN PROGRESS': 0, PENDING: 0, 'ON HOLD': 0, BLOCKED: 0 };
  views.forEach(function (t) { byStatus[t.Status] = (byStatus[t.Status] || 0) + 1; });
  var total = views.length;

  // ---- Section 1: Work summary
  var summary = {
    totalTasks: total, completed: byStatus.COMPLETED, inProgress: byStatus['IN PROGRESS'], pending: byStatus.PENDING,
    onHold: byStatus['ON HOLD'], blocked: byStatus.BLOCKED,
    workingMinutes: time.workingMinutes, recordedMinutes: time.recordedMinutes, unallocatedMinutes: time.unallocatedMinutes, breakMinutes: time.breakMinutes,
    workingHoursLabel: formatDuration_(time.workingMinutes), recordedHoursLabel: formatDuration_(time.recordedMinutes), unallocatedHoursLabel: formatDuration_(time.unallocatedMinutes),
    firstEntry: time.firstEntry ? formatTime12_(time.firstEntry) : '', lastEntry: time.lastEntry ? formatTime12_(time.lastEntry) : '',
    reportedHours: toNum_(findAnswer_(responses, /how many hours did you work/i), 0)
  };

  // ---- Section 2: Task-wise details
  var taskRows = sortBy_(views, function (t) { return t.StartTime || '9999'; }).map(function (t) {
    return { taskId: t.TaskID, title: t.TaskTitle, description: t.TaskDescription, category: t.TaskCategory, priority: t.Priority, status: t.Status,
      start: t.StartLabel, end: t.EndLabel, minutes: t.TimeSpentMinutes, duration: formatDuration_(t.TimeSpentMinutes), completion: t.CompletionPercent,
      remarks: t.Remarks, relatedDepartment: t.RelatedDepartment, documents: t.SupportingDocuments };
  });

  // ---- Section 3: Achievements
  var achievements = views.filter(function (t) { return t.Status === 'COMPLETED'; }).map(function (t) { return t.TaskTitle + (t.TimeSpentMinutes ? ' (' + formatDuration_(t.TimeSpentMinutes) + ')' : ''); });
  var qCompleted = splitLines_(findAnswer_(responses, /what tasks did you complete/i));
  qCompleted.forEach(function (l) { if (achievements.indexOf(l) === -1) achievements.push(l); });
  var keyMetrics = responses.filter(function (r) { return /^how many|^what was the total|expenditure/i.test(String(r.QuestionText)) && !/hours did you work/i.test(String(r.QuestionText)) && String(r.Answer) !== '' && !isNaN(Number(r.Answer)) && Number(r.Answer) > 0; })
    .map(function (r) { return { label: String(r.QuestionText).replace(/^How many /i, '').replace(/^What was the /i, '').replace(/\?$/, ''), value: Number(r.Answer) }; });

  // ---- Section 4: Pending work
  var pending = views.filter(function (t) { return t.Status !== 'COMPLETED'; }).map(function (t) {
    var linked = difficulties.filter(function (d) { return d.TaskID === t.TaskID; });
    return { taskId: t.TaskID, title: t.TaskTitle, status: t.Status, priority: t.Priority, completion: t.CompletionPercent,
      reason: t.PendingReason || (linked.length ? linked[0].ProblemDescription : '') || (t.Status === 'IN PROGRESS' ? 'Work in progress' : ''),
      expectedDate: t.ExpectedCompletionDate ? formatDateDMY_(t.ExpectedCompletionDate) : '', dependency: t.ResponsibleDependency || (linked.length ? (linked[0].ResponsibleDependency || linked[0].DepartmentInvolved) : '') };
  });
  var qPending = splitLines_(findAnswer_(responses, /what work remains pending/i));

  // ---- Section 5: Major challenges
  var biggest = findAnswer_(responses, /biggest difficulty/i);
  var challenges = {
    biggest: biggest || (difficulties.length ? sortBy_(difficulties, function (d) { return CONFIG.DIFFICULTY_LEVELS.indexOf(d.DifficultyLevel); }, true)[0].ProblemDescription : ''),
    biggestReason: findAnswer_(responses, /reason for the difficulty/i),
    technical: difficulties.filter(function (d) { return d.DelayType === 'TECHNICAL'; }).map(function (d) { return d.TaskName + ': ' + d.ProblemDescription; }),
    approvals: difficulties.filter(function (d) { return d.DelayType === 'MANAGEMENT_APPROVAL'; }).map(function (d) { return d.TaskName + ': ' + d.ProblemDescription; }),
    interdepartmental: difficulties.filter(function (d) { return d.DelayType === 'INTERDEPARTMENTAL' || d.DelayType === 'EXTERNAL'; }).map(function (d) { return d.TaskName + ': ' + d.ProblemDescription + (d.DepartmentInvolved ? ' [' + d.DepartmentInvolved + ']' : ''); }),
    assistance: difficulties.filter(function (d) { return d.AssistanceRequired; }).map(function (d) { return d.AssistanceRequired + ' (' + d.TaskName + ')'; }),
    delays: { answer: findAnswer_(responses, /were any tasks delayed/i), reason: findAnswer_(responses, /reason for the delay/i) },
    otherDeptAssistance: findAnswer_(responses, /which department and what assistance/i),
    list: difficulties.map(function (d) { return { id: d.DifficultyID, task: d.TaskName, problem: d.ProblemDescription, category: d.Category, level: d.DifficultyLevel, delayType: d.DelayType,
      delay: d.DelayLabel, department: d.DepartmentInvolved, dependency: d.ResponsibleDependency, status: d.ResolutionStatus, escalation: d.EscalationRequired, assistance: d.AssistanceRequired }; })
  };
  var mgmtSupport = findAnswer_(responses, /support do you need from management/i);
  if (mgmtSupport) challenges.assistance.unshift(mgmtSupport);

  // ---- Section 6: Time utilization
  var distribution = sortBy_(views.map(function (t) { return { title: t.TaskTitle, minutes: t.TimeSpentMinutes, pct: pct_(t.TimeSpentMinutes, Math.max(1, time.recordedMinutes)), status: t.Status, category: t.TaskCategory }; })
    .filter(function (x) { return x.minutes > 0; }), function (x) { return x.minutes; }, true);
  var timeSection = { workingMinutes: time.workingMinutes, recordedMinutes: time.recordedMinutes, productiveMinutes: time.productiveMinutes, unallocatedMinutes: time.unallocatedMinutes,
    breakMinutes: time.breakMinutes, utilizationRate: time.utilizationRate, timeline: time.timeline, distribution: distribution, categoryMinutes: time.categoryMinutes,
    majorActivities: distribution.slice(0, 5), mostTimeConsuming: distribution.length ? distribution[0].title : findAnswer_(responses, /consumed the most time/i) };

  // ---- Section 7: Productivity (transparent, weighted, dependency-aware)
  var externallyBlocked = views.filter(function (t) {
    var linked = difficulties.filter(function (d) { return d.TaskID === t.TaskID; });
    return t.Status === 'BLOCKED' && linked.some(function (d) { return CONFIG.NON_PENALIZING_DELAY_TYPES.indexOf(d.DelayType) !== -1; });
  });
  var scorable = views.filter(function (t) { return externallyBlocked.indexOf(t) === -1; });
  var wSum = 0, wScore = 0;
  scorable.forEach(function (t) { var w = CONFIG.PRIORITY_WEIGHT[t.Priority] || 2; wSum += w; wScore += w * (t.Status === 'COMPLETED' ? 100 : toNum_(t.CompletionPercent)); });
  var completedViews = views.filter(function (t) { return t.Status === 'COMPLETED'; });
  var onTime = completedViews.filter(function (t) { return !t.ExpectedCompletionDate || (t.CompletedAt && String(t.CompletedAt).substring(0, 10) <= t.ExpectedCompletionDate) || date <= t.ExpectedCompletionDate; });
  var productivity = {
    completionRate: pct_(byStatus.COMPLETED, total), onTimeRate: pct_(onTime.length, completedViews.length), pendingPct: pct_(byStatus.PENDING + byStatus['ON HOLD'], total),
    blockedPct: pct_(byStatus.BLOCKED, total), utilizationRate: time.utilizationRate, weightedScore: wSum ? Math.round(wScore / wSum) : 0,
    externallyBlocked: externallyBlocked.length, scoredTasks: scorable.length,
    notes: [
      'Completion rate = completed tasks ÷ total tasks.',
      'Weighted score weights each task by priority (LOW 1 … URGENT 4) and completion %, so one urgent task counts more than several small ones.',
      externallyBlocked.length ? externallyBlocked.length + ' task(s) blocked by approval / other department / external dependencies are excluded from the weighted score.' : 'No tasks were excluded for external dependencies.',
      'Utilization = recorded task time ÷ (configured working time − approved break).'
    ]
  };

  // ---- Section 8: Tomorrow's priorities
  var tomorrowStr = formatDate_(new Date(parseDateTime_(date).getTime() + 86400000));
  var tomorrow = {
    highPriority: pending.filter(function (p) { return p.priority === 'HIGH' || p.priority === 'URGENT'; }).map(function (p) { return p.title + ' [' + p.priority + ']'; }),
    immediate: pending.filter(function (p) { return p.status === 'BLOCKED' || (p.expectedDate && p.expectedDate === formatDateDMY_(tomorrowStr)); }).map(function (p) { return p.title + (p.status === 'BLOCKED' ? ' (blocked: ' + (p.dependency || p.reason) + ')' : ' (due tomorrow)'); }),
    followUps: splitLines_(findAnswer_(responses, /customers require follow-up|leads require|which leads are pending|require clarification|awaiting approval/i)),
    managementSupport: uniq_(splitLines_(mgmtSupport).concat(difficulties.filter(function (d) { return d.EscalationRequired || d.AssistanceRequired; }).map(function (d) { return d.AssistanceRequired || ('Escalation: ' + d.TaskName); }))),
    planned: splitLines_(findAnswer_(responses, /priorities for tomorrow/i))
  };

  // ---- Section 9/10
  var employeeRemarks = existing && existing.EmployeeRemarks ? existing.EmployeeRemarks : '';
  var managerRemarks = sortBy_(remarks, function (m) { return m.CreatedAt; }).map(function (m) { return { manager: m.ManagerName, remarks: m.Remarks, actionPoints: splitLines_(m.ActionPoints), rating: m.Rating, at: m.CreatedAt }; });

  // ---- Questionnaire transcript grouped by section
  var def = buildQuestionnaire_(emp);
  var ansById = {};
  responses.forEach(function (r) { ansById[r.QuestionID] = r.Answer; });
  var transcript = def.sections.map(function (s) {
    return { title: s.title, questions: s.questions.filter(function (q) { return questionVisible_(q, ansById); }).map(function (q) {
      var a = ansById[q.QuestionID]; return { id: q.QuestionID, text: q.QuestionText, type: q.QuestionType, answer: a === undefined ? '' : (Array.isArray(a) ? a.join(', ') : String(a)), mandatory: q.Mandatory }; }) };
  });
  // Historical answers to questions no longer in the questionnaire
  var known = {};
  def.sections.forEach(function (s) { s.questions.forEach(function (q) { known[q.QuestionID] = 1; }); });
  var extra = responses.filter(function (r) { return !known[r.QuestionID]; });
  if (extra.length) transcript.push({ title: 'Other responses', questions: extra.map(function (r) { return { id: r.QuestionID, text: r.QuestionText, answer: Array.isArray(r.Answer) ? r.Answer.join(', ') : String(r.Answer) }; }) });

  var missing = [];
  if (qStatus !== 'SUBMITTED') missing.push(qStatus === 'DRAFT' ? 'Questionnaire saved as draft but not submitted' : 'Questionnaire not filled');
  if (!total) missing.push('No task entries recorded');
  if (time.runningTaskIds.length) missing.push('A task timer is still running');
  var status = existing ? existing.Status : (total || responses.length ? 'INCOMPLETE' : 'NOT_STARTED');
  if (['SUBMITTED', 'APPROVED'].indexOf(status) === -1) status = (total || responses.length) ? (status === 'REOPENED' ? 'REOPENED' : 'INCOMPLETE') : 'NOT_STARTED';

  return {
    reportId: existing ? existing.ReportID : '', date: date, dateLabel: formatDateDMY_(date), company: settings.COMPANY_NAME,
    employee: { id: emp.EmployeeID, name: emp.EmployeeName, designation: emp.Designation, department: upper_(emp.Department), manager: mgr ? mgr.EmployeeName : (emp.ReportingManagerName || ''), managerId: emp.ReportingManagerID, email: emp.Email, whatsapp: emp.WhatsAppNumber || emp.Mobile },
    status: status, questionnaireStatus: qStatus, incomplete: status !== 'SUBMITTED' && status !== 'APPROVED', missing: missing, locked: !!(existing && toBool_(existing.Locked)),
    submittedAt: existing ? existing.SubmittedAt : '', approvedAt: existing ? existing.ApprovedAt : '', approvedBy: existing ? existing.ApprovedBy : '',
    summary: summary, tasks: taskRows, achievements: achievements, keyMetrics: keyMetrics, pending: pending, pendingFromQuestionnaire: qPending,
    challenges: challenges, time: timeSection, productivity: productivity, tomorrow: tomorrow, employeeRemarks: employeeRemarks, managerRemarks: managerRemarks,
    questionnaire: transcript, generatedAt: nowIso_(), generatedBy: ctx ? ctx.email : 'system'
  };
}

/** Persist (upsert) a report row from a built report object. */
function persistReport_(emp, report, ctx, statusOverride) {
  var existing = findOne_('DAILY_REPORTS', function (r) { return r.EmployeeID === emp.EmployeeID && r.Date === report.date; });
  var status = statusOverride || (existing ? existing.Status : report.status);
  if (existing && ['SUBMITTED', 'APPROVED'].indexOf(existing.Status) !== -1 && !statusOverride) status = existing.Status;
  report.status = status;
  report.incomplete = status !== 'SUBMITTED' && status !== 'APPROVED';
  var row = {
    Date: report.date, EmployeeID: emp.EmployeeID, EmployeeName: emp.EmployeeName, Department: upper_(emp.Department), Designation: emp.Designation,
    ReportingManagerID: emp.ReportingManagerID, Status: status, QuestionnaireStatus: report.questionnaireStatus,
    TotalTasks: report.summary.totalTasks, CompletedTasks: report.summary.completed, InProgressTasks: report.summary.inProgress, PendingTasks: report.summary.pending,
    BlockedTasks: report.summary.blocked, OnHoldTasks: report.summary.onHold, WorkingMinutes: report.summary.workingMinutes, RecordedMinutes: report.summary.recordedMinutes,
    UnallocatedMinutes: report.summary.unallocatedMinutes, CompletionRate: report.productivity.completionRate, OnTimeRate: report.productivity.onTimeRate,
    WeightedScore: report.productivity.weightedScore, UtilizationRate: report.productivity.utilizationRate, GeneratedBy: ctx ? ctx.email : 'system'
  };
  if (existing) {
    row.EmployeeRemarks = report.employeeRemarks !== undefined ? report.employeeRemarks : existing.EmployeeRemarks;
    row.ReportJSON = JSON.stringify(report);
    update_('DAILY_REPORTS', 'ReportID', existing.ReportID, row, ctx);
    report.reportId = existing.ReportID;
  } else {
    row.ReportID = generateId_('RPT'); row.EmployeeRemarks = report.employeeRemarks || ''; row.SubmittedAt = ''; row.ApprovedAt = ''; row.ApprovedBy = ''; row.Locked = false;
    report.reportId = row.ReportID;
    row.ReportJSON = JSON.stringify(report);
    insert_('DAILY_REPORTS', row, ctx);
  }
  return report;
}

function reportSummaryView_(r) {
  return { ReportID: r.ReportID, Date: r.Date, DateLabel: formatDateDMY_(r.Date), EmployeeID: r.EmployeeID, EmployeeName: r.EmployeeName, Department: upper_(r.Department), Designation: r.Designation,
    ReportingManagerID: r.ReportingManagerID, Status: r.Status, QuestionnaireStatus: r.QuestionnaireStatus, TotalTasks: toNum_(r.TotalTasks), CompletedTasks: toNum_(r.CompletedTasks),
    InProgressTasks: toNum_(r.InProgressTasks), PendingTasks: toNum_(r.PendingTasks), BlockedTasks: toNum_(r.BlockedTasks), OnHoldTasks: toNum_(r.OnHoldTasks),
    WorkingMinutes: toNum_(r.WorkingMinutes), RecordedMinutes: toNum_(r.RecordedMinutes), UnallocatedMinutes: toNum_(r.UnallocatedMinutes), CompletionRate: toNum_(r.CompletionRate),
    OnTimeRate: toNum_(r.OnTimeRate), WeightedScore: toNum_(r.WeightedScore), UtilizationRate: toNum_(r.UtilizationRate), SubmittedAt: r.SubmittedAt, ApprovedAt: r.ApprovedAt, Locked: toBool_(r.Locked), UpdatedAt: r.UpdatedAt };
}

// ---------------------------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------------------------

/** Get a report (stored JSON when available, otherwise built live). { reportId } or { employeeId, date, live } */
function reportsGet_(ctx, p) {
  var emp, date, row = null;
  if (p.reportId) {
    row = findById_('DAILY_REPORTS', 'ReportID', p.reportId);
    if (!row) throw AppError_('Report not found', 'NOT_FOUND');
    emp = requireEmployeeAccess_(ctx, row.EmployeeID); date = row.Date;
  } else {
    emp = requireEmployeeAccess_(ctx, p.employeeId); date = p.date ? requireDate_(p.date) : today_();
    row = findOne_('DAILY_REPORTS', function (r) { return r.EmployeeID === emp.EmployeeID && r.Date === date; });
  }
  var report;
  if (row && row.ReportJSON && !toBool_(p.live) && ['SUBMITTED', 'APPROVED'].indexOf(row.Status) !== -1) {
    report = safeJsonParse_(row.ReportJSON, null);
    if (report) { report.managerRemarks = buildDailyReport_(emp, date, ctx).managerRemarks; report.status = row.Status; report.locked = toBool_(row.Locked); }
  }
  if (!report) report = buildDailyReport_(emp, date, ctx);
  report.whatsapp = buildWhatsAppMessage_(report);
  return ok_({ report: report });
}

/** Generate (or regenerate) and persist. Admin/manager for anyone visible, employee for self. */
function reportsGenerate_(ctx, p) {
  var emp = requireEmployeeAccess_(ctx, p.employeeId);
  var date = p.date ? requireDate_(p.date) : today_();
  var report = buildDailyReport_(emp, date, ctx);
  if (p.employeeRemarks !== undefined && (emp.EmployeeID === ctx.employeeId || isAdmin_(ctx))) report.employeeRemarks = trim_(p.employeeRemarks);
  report = persistReport_(emp, report, ctx);
  logActivity_(ctx, 'REPORT_GENERATED', 'REPORT', report.reportId, { employee: emp.EmployeeID, date: date, status: report.status });
  report.whatsapp = buildWhatsAppMessage_(report);
  return ok_({ report: report }, 'Report generated (' + report.status + ')');
}

/** Employee submits their day. { date, employeeRemarks } */
function reportsSubmit_(ctx, p) {
  var emp = requireEmployeeAccess_(ctx, p.employeeId);
  if (emp.EmployeeID !== ctx.employeeId && !isAdmin_(ctx)) throw AppError_('Only the employee can submit their own report', 'FORBIDDEN');
  var date = p.date ? requireDate_(p.date) : today_();
  var existing = findOne_('DAILY_REPORTS', function (r) { return r.EmployeeID === emp.EmployeeID && r.Date === date; });
  if (existing && toBool_(existing.Locked)) throw AppError_('Report is locked after approval', 'LOCKED');
  if (existing && ['SUBMITTED', 'APPROVED'].indexOf(existing.Status) !== -1 && !toBool_(p.resubmit)) {
    throw AppError_('Report for ' + formatDateDMY_(date) + ' was already submitted at ' + existing.SubmittedAt + '. Use "Update submission" to resubmit.', 'DUPLICATE');
  }
  var report = buildDailyReport_(emp, date, ctx);
  if (report.questionnaireStatus !== 'SUBMITTED') throw AppError_('Please submit the daily questionnaire before submitting the report', 'VALIDATION', { missing: report.missing });
  if (report.time.timeline.some(function (x) { return x.open; })) throw AppError_('A task timer is still running. Pause or complete it first.', 'VALIDATION');
  if (!report.summary.totalTasks && !toBool_(p.confirmNoTasks)) throw AppError_('No task entries recorded for today. Add your tasks, or confirm submission without tasks.', 'CONFIRM_NO_TASKS');
  report.employeeRemarks = p.employeeRemarks !== undefined ? trim_(p.employeeRemarks) : (existing ? existing.EmployeeRemarks : '');
  report.submittedAt = nowIso_();
  report = persistReport_(emp, report, ctx, 'SUBMITTED');
  update_('DAILY_REPORTS', 'ReportID', report.reportId, { SubmittedAt: report.submittedAt, Locked: false }, ctx);
  logActivity_(ctx, 'REPORT_SUBMITTED', 'REPORT', report.reportId, { date: date });
  try { notifyManagerSubmission_(emp, report); } catch (e) { }
  report.whatsapp = buildWhatsAppMessage_(report);
  return ok_({ report: report }, 'Daily report submitted');
}

function reportsApprove_(ctx, p) {
  if (!isManagerOrAbove_(ctx)) throw AppError_('Manager access required', 'FORBIDDEN');
  var row = findById_('DAILY_REPORTS', 'ReportID', p.reportId);
  if (!row) throw AppError_('Report not found', 'NOT_FOUND');
  requireEmployeeAccess_(ctx, row.EmployeeID);
  if (row.Status !== 'SUBMITTED' && row.Status !== 'REOPENED' && row.Status !== 'APPROVED') throw AppError_('Only submitted reports can be approved (current: ' + row.Status + ')', 'VALIDATION');
  var lock = toBool_(getSetting_('AUTO_LOCK_ON_APPROVAL'));
  update_('DAILY_REPORTS', 'ReportID', row.ReportID, { Status: 'APPROVED', ApprovedAt: nowIso_(), ApprovedBy: ctx.employeeId, Locked: lock }, ctx);
  var report = safeJsonParse_(row.ReportJSON, null);
  if (report) { report.status = 'APPROVED'; report.locked = lock; report.approvedAt = nowIso_(); report.approvedBy = ctx.user.name; update_('DAILY_REPORTS', 'ReportID', row.ReportID, { ReportJSON: JSON.stringify(report) }, ctx); }
  logActivity_(ctx, 'REPORT_APPROVED', 'REPORT', row.ReportID, { locked: lock });
  return ok_({ reportId: row.ReportID, status: 'APPROVED', locked: lock }, 'Report approved' + (lock ? ' and locked' : ''));
}

function reportsReopen_(ctx, p) {
  if (!isManagerOrAbove_(ctx)) throw AppError_('Manager access required', 'FORBIDDEN');
  var row = findById_('DAILY_REPORTS', 'ReportID', p.reportId);
  if (!row) throw AppError_('Report not found', 'NOT_FOUND');
  requireEmployeeAccess_(ctx, row.EmployeeID);
  update_('DAILY_REPORTS', 'ReportID', row.ReportID, { Status: 'REOPENED', Locked: false }, ctx);
  logActivity_(ctx, 'REPORT_REOPENED', 'REPORT', row.ReportID, { reason: trim_(p.reason) });
  return ok_({ reportId: row.ReportID, status: 'REOPENED' }, 'Report reopened for editing');
}

/** Manager remarks + action points. { reportId | employeeId+date, remarks, actionPoints, rating } */
function reportsManagerRemark_(ctx, p) {
  if (!isManagerOrAbove_(ctx)) throw AppError_('Manager access required', 'FORBIDDEN');
  var row = p.reportId ? findById_('DAILY_REPORTS', 'ReportID', p.reportId) : null;
  var emp = requireEmployeeAccess_(ctx, row ? row.EmployeeID : p.employeeId);
  var date = row ? row.Date : requireDate_(p.date);
  if (!trim_(p.remarks) && !trim_(p.actionPoints)) throw AppError_('Remarks or action points are required', 'VALIDATION');
  if (!row) { var rep = persistReport_(emp, buildDailyReport_(emp, date, ctx), ctx); row = findById_('DAILY_REPORTS', 'ReportID', rep.reportId); }
  var rating = p.rating !== undefined && trim_(p.rating) !== '' ? Math.max(1, Math.min(5, Math.round(toNum_(p.rating)))) : '';
  insert_('MANAGER_REMARKS', { RemarkID: generateId_('MRK'), ReportID: row.ReportID, Date: date, EmployeeID: emp.EmployeeID, ManagerID: ctx.employeeId, ManagerName: ctx.user.name,
    Remarks: trim_(p.remarks).substring(0, 3000), ActionPoints: trim_(p.actionPoints).substring(0, 3000), Rating: rating }, ctx);
  // Refresh stored JSON remarks
  var stored = safeJsonParse_(row.ReportJSON, null);
  if (stored) { stored.managerRemarks = buildDailyReport_(emp, date, ctx).managerRemarks; update_('DAILY_REPORTS', 'ReportID', row.ReportID, { ReportJSON: JSON.stringify(stored) }, ctx); }
  logActivity_(ctx, 'MANAGER_REMARK_ADDED', 'REPORT', row.ReportID, '');
  try { notifyEmployeeRemark_(emp, ctx.user.name, trim_(p.remarks), date); } catch (e) { }
  return ok_({ reportId: row.ReportID }, 'Remarks saved');
}

/** List report summaries with filters + submission status for every visible employee on the date range. */
function reportsList_(ctx, p) {
  p = p || {};
  var from = p.dateFrom ? requireDate_(p.dateFrom) : (p.date ? requireDate_(p.date) : today_());
  var to = p.dateTo ? requireDate_(p.dateTo) : (p.date ? requireDate_(p.date) : from);
  var emps = visibleEmployees_(ctx).filter(function (e) { return upper_(e.Status) === 'ACTIVE' || toBool_(p.includeInactive); });
  if (p.department) emps = emps.filter(function (e) { return upper_(e.Department) === upper_(p.department); });
  if (p.designation) emps = emps.filter(function (e) { return upper_(e.Designation) === upper_(p.designation); });
  if (p.employeeId) emps = emps.filter(function (e) { return e.EmployeeID === p.employeeId; });
  if (p.managerId) emps = emps.filter(function (e) { return e.ReportingManagerID === p.managerId; });
  var ids = emps.map(function (e) { return e.EmployeeID; });
  var reports = readTable_('DAILY_REPORTS').filter(function (r) { return ids.indexOf(r.EmployeeID) !== -1 && r.Date >= from && r.Date <= to; });
  var key = function (id, d) { return id + '|' + d; };
  var byKey = {};
  reports.forEach(function (r) { byKey[key(r.EmployeeID, r.Date)] = r; });
  var rows = [];
  var dates = dateRange_(from, to);
  // Only the latest 31 days are expanded per employee to keep payloads small.
  dates.slice(-31).forEach(function (d) {
    emps.forEach(function (e) {
      if (e.JoiningDate && d < String(e.JoiningDate).substring(0, 10)) return;
      var r = byKey[key(e.EmployeeID, d)];
      if (r) rows.push(reportSummaryView_(r));
      else rows.push({ ReportID: '', Date: d, DateLabel: formatDateDMY_(d), EmployeeID: e.EmployeeID, EmployeeName: e.EmployeeName, Department: upper_(e.Department), Designation: e.Designation,
        ReportingManagerID: e.ReportingManagerID, Status: 'NOT_STARTED', QuestionnaireStatus: '', TotalTasks: 0, CompletedTasks: 0, InProgressTasks: 0, PendingTasks: 0, BlockedTasks: 0, OnHoldTasks: 0,
        WorkingMinutes: 0, RecordedMinutes: 0, UnallocatedMinutes: 0, CompletionRate: 0, OnTimeRate: 0, WeightedScore: 0, UtilizationRate: 0, SubmittedAt: '', ApprovedAt: '', Locked: false });
    });
  });
  if (p.status) rows = rows.filter(function (r) { return r.Status === upper_(p.status); });
  if (p.search) { var s = trim_(p.search).toLowerCase(); rows = rows.filter(function (r) { return (r.EmployeeName + ' ' + r.EmployeeID + ' ' + r.Department).toLowerCase().indexOf(s) !== -1; }); }
  rows = sortBy_(rows, function (r) { return r.Date + '|' + r.EmployeeName; }, true);
  return ok_({ reports: rows, total: rows.length, dateFrom: from, dateTo: to, submitted: rows.filter(function (r) { return ['SUBMITTED', 'APPROVED'].indexOf(r.Status) !== -1; }).length });
}

/** Department summary for a date (built live and persisted). */
function buildDepartmentSummary_(department, date, ctx) {
  department = upper_(department);
  var emps = readTable_('EMPLOYEES').filter(function (e) { return upper_(e.Department) === department && upper_(e.Status) === 'ACTIVE'; });
  var ids = emps.map(function (e) { return e.EmployeeID; });
  var reports = readTable_('DAILY_REPORTS').filter(function (r) { return ids.indexOf(r.EmployeeID) !== -1 && r.Date === date; });
  var tasks = readTable_('TASK_ENTRIES').filter(function (t) { return ids.indexOf(t.EmployeeID) !== -1 && t.Date === date; });
  var diffs = readTable_('DIFFICULTIES').filter(function (d) { return ids.indexOf(d.EmployeeID) !== -1 && d.Date === date; });
  var byEmp = {};
  reports.forEach(function (r) { byEmp[r.EmployeeID] = r; });
  var submitted = reports.filter(function (r) { return ['SUBMITTED', 'APPROVED'].indexOf(r.Status) !== -1; });
  var st = function (s) { return tasks.filter(function (t) { return upper_(t.Status) === s; }).length; };
  var recorded = 0;
  var employees = emps.map(function (e) {
    var r = byEmp[e.EmployeeID];
    var mine = tasks.filter(function (t) { return t.EmployeeID === e.EmployeeID; });
    var time = dailyTimeAnalysis_(e, date, mine);
    recorded += time.recordedMinutes;
    return { EmployeeID: e.EmployeeID, EmployeeName: e.EmployeeName, Designation: e.Designation, Status: r ? r.Status : (mine.length ? 'INCOMPLETE' : 'NOT_STARTED'),
      TotalTasks: mine.length, Completed: mine.filter(function (t) { return upper_(t.Status) === 'COMPLETED'; }).length,
      Pending: mine.filter(function (t) { return ['COMPLETED'].indexOf(upper_(t.Status)) === -1; }).length, Blocked: mine.filter(function (t) { return upper_(t.Status) === 'BLOCKED'; }).length,
      RecordedMinutes: time.recordedMinutes, CompletionRate: r ? toNum_(r.CompletionRate) : pct_(mine.filter(function (t) { return upper_(t.Status) === 'COMPLETED'; }).length, mine.length),
      Achievements: r ? (safeJsonParse_(r.ReportJSON, {}).achievements || []).slice(0, 3) : [], ReportID: r ? r.ReportID : '' };
  });
  var catCount = groupBy_(diffs, function (d) { return d.Category; });
  var majorDifficulties = sortBy_(Object.keys(catCount).map(function (k) { return { category: k, count: catCount[k].length, unresolved: catCount[k].filter(function (d) { return upper_(d.ResolutionStatus) !== 'RESOLVED'; }).length }; }), function (x) { return x.count; }, true);
  var withTasks = employees.filter(function (e) { return e.TotalTasks; });
  var summary = {
    date: date, dateLabel: formatDateDMY_(date), department: department, company: getSetting_('COMPANY_NAME'),
    totalEmployees: emps.length, reportsSubmitted: submitted.length, reportsPending: emps.length - submitted.length,
    totalTasks: tasks.length, tasksCompleted: st('COMPLETED'), tasksInProgress: st('IN PROGRESS'), tasksPending: st('PENDING') + st('ON HOLD'), tasksBlocked: st('BLOCKED'),
    avgCompletionRate: withTasks.length ? Math.round(withTasks.reduce(function (n, e) { return n + e.CompletionRate; }, 0) / withTasks.length * 10) / 10 : 0,
    totalRecordedMinutes: recorded, totalRecordedLabel: formatDuration_(recorded), majorDifficulties: majorDifficulties,
    difficulties: diffs.map(difficultyView_).map(function (d) { return { employee: d.EmployeeName, task: d.TaskName, problem: d.ProblemDescription, category: d.Category, status: d.ResolutionStatus, delayType: d.DelayType, against: d.DepartmentInvolved }; }),
    employees: sortBy_(employees, function (e) { return e.EmployeeName; }), generatedAt: nowIso_()
  };
  var existing = findOne_('DEPARTMENT_REPORTS', function (r) { return upper_(r.Department) === department && r.Date === date; });
  var row = { Date: date, Department: department, TotalEmployees: summary.totalEmployees, ReportsSubmitted: summary.reportsSubmitted, ReportsPending: summary.reportsPending, TotalTasks: summary.totalTasks,
    TasksCompleted: summary.tasksCompleted, TasksPending: summary.tasksPending, TasksBlocked: summary.tasksBlocked, AvgCompletionRate: summary.avgCompletionRate, TotalRecordedMinutes: recorded,
    MajorDifficulties: majorDifficulties.slice(0, 3).map(function (m) { return m.category + ' (' + m.count + ')'; }).join(', '), SummaryJSON: JSON.stringify(summary) };
  if (existing) update_('DEPARTMENT_REPORTS', 'DeptReportID', existing.DeptReportID, row, ctx);
  else { row.DeptReportID = generateId_('DRP'); insert_('DEPARTMENT_REPORTS', row, ctx); }
  summary.whatsapp = buildDepartmentWhatsAppMessage_(summary);
  return summary;
}

function reportsDepartment_(ctx, p) {
  if (!isManagerOrAbove_(ctx)) throw AppError_('Manager access required', 'FORBIDDEN');
  var department = upper_(p.department);
  if (!department) throw AppError_('department is required', 'VALIDATION');
  if (isManager_(ctx)) {
    var ids = visibleEmployeeIds_(ctx);
    var deptEmps = readTable_('EMPLOYEES').filter(function (e) { return upper_(e.Department) === department && upper_(e.Status) === 'ACTIVE'; });
    if (!deptEmps.length || !deptEmps.every(function (e) { return ids.indexOf(e.EmployeeID) !== -1; })) throw AppError_('You can only view summaries of your own department/team', 'FORBIDDEN');
  }
  var date = p.date ? requireDate_(p.date) : today_();
  return ok_({ summary: buildDepartmentSummary_(department, date, ctx) });
}

/** Management summary across all departments (admins). */
function reportsManagement_(ctx, p) {
  requireAdmin_(ctx);
  var date = p.date ? requireDate_(p.date) : today_();
  var depts = readTable_('DEPARTMENTS').filter(function (d) { return toBool_(d.Active); }).map(function (d) { return upper_(d.DepartmentName); });
  var summaries = depts.map(function (d) { return buildDepartmentSummary_(d, date, ctx); });
  var totals = summaries.reduce(function (a, s) {
    a.employees += s.totalEmployees; a.submitted += s.reportsSubmitted; a.tasks += s.totalTasks; a.completed += s.tasksCompleted; a.pending += s.tasksPending; a.blocked += s.tasksBlocked; a.recorded += s.totalRecordedMinutes; return a;
  }, { employees: 0, submitted: 0, tasks: 0, completed: 0, pending: 0, blocked: 0, recorded: 0 });
  var text = '*' + upper_(getSetting_('COMPANY_NAME')) + '*\n*MANAGEMENT DAILY SUMMARY*\n\nDate: ' + formatDateDMY_(date) + '\n\n' +
    'Employees: ' + totals.employees + ' | Reports Submitted: ' + totals.submitted + '\nTasks: ' + totals.tasks + ' | Completed: ' + totals.completed + ' | Pending: ' + totals.pending + ' | Blocked: ' + totals.blocked + '\nRecorded Time: ' + formatDuration_(totals.recorded) + '\n\n*DEPARTMENTS*\n' +
    summaries.map(function (s) { return '• ' + s.department + ': ' + s.reportsSubmitted + '/' + s.totalEmployees + ' submitted, ' + s.tasksCompleted + '/' + s.totalTasks + ' tasks done' + (s.tasksBlocked ? ', ' + s.tasksBlocked + ' blocked' : ''); }).join('\n');
  return ok_({ date: date, dateLabel: formatDateDMY_(date), totals: totals, departments: summaries, whatsapp: text });
}

/** Employee's own reports list for a date range (history). */
function reportsMine_(ctx, p) {
  p = p || {};
  p.employeeId = ctx.employeeId;
  return reportsList_(ctx, p);
}
