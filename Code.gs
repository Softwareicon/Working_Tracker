/**
 * Code.gs — Web App entry points and API router for Daily Work Tracker Pro.
 *
 * Deploy as Web App: Execute as "Me", Who has access "Anyone".
 * The frontend POSTs JSON as text/plain:  { action, token, payload }
 * Every response is { success, message, data, code? }.
 *
 * Quick start (Apps Script editor):
 *   1. Run setupDatabase()        -> creates all sheets, mappings, questionnaire templates, settings
 *   2. Run seedSampleData()       -> optional sample employees & activity
 *   3. Run setupTriggers()        -> daily reminder / report generation / manager summary
 *   4. Deploy > New deployment > Web app, copy the URL into frontend/js/config.js
 */

var ROUTES_ = {
  // Public
  'auth.requestOtp': { fn: authRequestOtp_, pub: true },
  'auth.verifyOtp': { fn: authVerifyOtp_, pub: true },
  'meta.health': { fn: function () { return ok_({ app: CONFIG.APP_NAME, version: CONFIG.APP_VERSION, time: nowIso_() }); }, pub: true },
  // Session
  'auth.me': { fn: authMe_ },
  'auth.logout': { fn: authLogout_ },
  'meta.bootstrap': { fn: metaBootstrap_ },
  // Employees / designations / departments
  'employees.list': { fn: employeesList_ },
  'employees.get': { fn: employeesGet_ },
  'employees.save': { fn: employeesSave_ },
  'employees.setStatus': { fn: employeesSetStatus_ },
  'employees.history': { fn: employeesHistory_ },
  'designations.list': { fn: designationsList_ },
  'designations.resolve': { fn: designationsResolve_ },
  'designations.save': { fn: designationsSave_ },
  'designations.delete': { fn: designationsDelete_ },
  'departments.list': { fn: departmentsList_ },
  'departments.save': { fn: departmentsSave_ },
  // Questionnaire
  'questionnaire.get': { fn: questionnaireGet_ },
  'questionnaire.save': { fn: questionnaireSave_ },
  'questionnaire.admin.list': { fn: questionnaireAdminList_ },
  'questionnaire.admin.save': { fn: questionnaireAdminSave_ },
  'questionnaire.admin.delete': { fn: questionnaireAdminDelete_ },
  'questionnaire.admin.reorder': { fn: questionnaireAdminReorder_ },
  'questionnaire.admin.toggle': { fn: questionnaireAdminToggle_ },
  'questionnaire.admin.history': { fn: questionnaireAdminHistory_ },
  'questionnaire.preview': { fn: questionnairePreview_ },
  // Tasks & time
  'tasks.list': { fn: tasksList_ },
  'tasks.save': { fn: tasksSave_ },
  'tasks.delete': { fn: tasksDelete_ },
  'tasks.timer': { fn: tasksTimer_ },
  'tasks.manualTime': { fn: tasksManualTime_ },
  'tasks.logs': { fn: tasksLogs_ },
  'tasks.deleteLog': { fn: tasksDeleteLog_ },
  'time.timeline': { fn: timelineGet_ },
  // Difficulties
  'difficulties.list': { fn: difficultiesList_ },
  'difficulties.save': { fn: difficultiesSave_ },
  'difficulties.updateStatus': { fn: difficultiesUpdateStatus_ },
  'difficulties.delete': { fn: difficultiesDelete_ },
  'difficulties.bottlenecks': { fn: difficultiesBottlenecks_ },
  // Reports
  'reports.get': { fn: reportsGet_ },
  'reports.generate': { fn: reportsGenerate_ },
  'reports.submit': { fn: reportsSubmit_ },
  'reports.approve': { fn: reportsApprove_ },
  'reports.reopen': { fn: reportsReopen_ },
  'reports.managerRemark': { fn: reportsManagerRemark_ },
  'reports.list': { fn: reportsList_ },
  'reports.mine': { fn: reportsMine_ },
  'reports.department': { fn: reportsDepartment_ },
  'reports.management': { fn: reportsManagement_ },
  'reports.whatsapp': { fn: reportsWhatsApp_ },
  // Analytics
  'analytics.dashboard': { fn: analyticsDashboard_ },
  'analytics.charts': { fn: analyticsCharts_ },
  'analytics.bottlenecks': { fn: analyticsBottlenecks_ },
  'logs.list': { fn: logsList_ },
  // Settings & admin
  'settings.get': { fn: settingsGet_ },
  'settings.save': { fn: settingsSave_ },
  'settings.applySchedule': { fn: settingsApplySchedule_ },
  'admin.runScheduled': { fn: adminRunScheduled_ },
  'admin.exportCsv': { fn: adminExportCsv_ },
  'admin.seedSample': { fn: adminSeedSample_ },
  'admin.setupDatabase': { fn: adminSetupDatabase_ }
};

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.action) return respond_(handleRequest_({ action: p.action, token: p.token, payload: safeJsonParse_(p.payload, {}) }));
  return respond_(ok_({ app: CONFIG.APP_NAME, version: CONFIG.APP_VERSION, status: 'running', time: nowIso_() }, 'Daily Work Tracker Pro API is running. POST { action, token, payload }.'));
}

function doPost(e) {
  var req = {};
  try {
    var body = e && e.postData && e.postData.contents ? e.postData.contents : '{}';
    req = JSON.parse(body);
  } catch (err) {
    return respond_(fail_('Invalid JSON request body', 'BAD_REQUEST'));
  }
  return respond_(handleRequest_(req));
}

function respond_(result) {
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

/** Central dispatcher: authentication, authorization, validation errors -> uniform responses. */
function handleRequest_(req) {
  req = req || {};
  var action = trim_(req.action);
  var route = ROUTES_[action];
  if (!route) return fail_('Unknown action: ' + action, 'UNKNOWN_ACTION');
  var started = Date.now();
  try {
    var ctx = route.pub ? null : authenticate_(req.token);
    var result = route.fn(ctx, req.payload || {});
    if (!result || typeof result !== 'object' || result.success === undefined) result = ok_(result);
    result.elapsedMs = Date.now() - started;
    return result;
  } catch (err) {
    if (err && err.isAppError) return fail_(err.message, err.code, err.extra);
    try { console.error('[' + action + '] ' + (err && err.stack ? err.stack : err)); } catch (e2) { }
    try { logActivity_(null, 'API_ERROR', action, '', String(err && err.message ? err.message : err)); } catch (e3) { }
    return fail_('Unexpected server error: ' + (err && err.message ? err.message : err), 'SERVER_ERROR');
  }
}

// ---------------------------------------------------------------------------------------------
// Meta / settings / admin endpoints
// ---------------------------------------------------------------------------------------------

/** Everything the UI needs after login in one call. */
function metaBootstrap_(ctx) {
  var depts = readTable_('DEPARTMENTS').filter(function (d) { return toBool_(d.Active); });
  var desigs = readTable_('DESIGNATIONS').filter(function (d) { return toBool_(d.Active); });
  var mappings = readTable_('DESIGNATION_MAPPING').filter(function (m) { return toBool_(m.Active); });
  var emps = visibleEmployees_(ctx);
  var byId = {};
  readTable_('EMPLOYEES').forEach(function (e) { byId[e.EmployeeID] = e; });
  return ok_({
    user: ctx.user, settings: publicSettings_(), serverTime: nowIso_(), today: today_(),
    departments: depts.map(function (d) { return { id: d.DepartmentID, name: upper_(d.DepartmentName), managerId: d.ManagerID, managerName: byId[d.ManagerID] ? byId[d.ManagerID].EmployeeName : '' }; }),
    designations: sortBy_(desigs.map(function (d) { var m = mappings.filter(function (x) { return upper_(x.Designation) === upper_(d.DesignationName); })[0]; return { name: d.DesignationName, department: m ? upper_(m.Department) : '' }; }), function (x) { return x.name; }),
    employees: sortBy_(emps.map(function (e) { return employeeView_(e, byId); }), function (e) { return e.EmployeeName; }),
    lists: { taskStatuses: CONFIG.TASK_STATUSES, taskPriorities: CONFIG.TASK_PRIORITIES, taskCategories: CONFIG.TASK_CATEGORIES, difficultyCategories: CONFIG.DIFFICULTY_CATEGORIES,
      difficultyLevels: CONFIG.DIFFICULTY_LEVELS, delayTypes: CONFIG.DELAY_TYPES, resolutionStatuses: CONFIG.RESOLUTION_STATUSES, reportStatuses: CONFIG.REPORT_STATUSES,
      questionTypes: CONFIG.QUESTION_TYPES, questionScopes: CONFIG.QUESTION_SCOPES, roles: Object.keys(CONFIG.ROLES).map(function (k) { return CONFIG.ROLES[k]; }) }
  });
}

function settingsGet_(ctx) {
  requireAdmin_(ctx);
  var s = getSettings_();
  var list = Object.keys(CONFIG.DEFAULT_SETTINGS).map(function (k) { return { key: k, value: s[k], description: CONFIG.DEFAULT_SETTINGS[k].description }; });
  var triggers = [];
  try { triggers = triggersStatus_(); } catch (e) { }
  return ok_({ settings: list, triggers: triggers, config: { timezone: tz_(), version: CONFIG.APP_VERSION, superAdmins: CONFIG.SUPER_ADMIN_EMAILS, demo: CONFIG.DEMO_MODE } });
}

function settingsSave_(ctx, p) {
  requireAdmin_(ctx);
  var updates = p.settings || {};
  var allowed = Object.keys(CONFIG.DEFAULT_SETTINGS);
  var changed = [];
  Object.keys(updates).forEach(function (k) {
    if (allowed.indexOf(k) === -1) throw AppError_('Unknown setting: ' + k, 'VALIDATION');
    var v = trim_(updates[k]);
    if (['WORK_START', 'WORK_END', 'REPORT_GENERATION_TIME', 'MANAGER_SUMMARY_TIME'].indexOf(k) !== -1 && !isHHmm_(v)) throw AppError_(k + ' must be HH:mm', 'VALIDATION');
    if (['WORKING_HOURS', 'BREAK_MINUTES', 'REMINDER_MINUTES_BEFORE_CLOSE', 'MAX_TASK_HOURS'].indexOf(k) !== -1 && isNaN(Number(v))) throw AppError_(k + ' must be a number', 'VALIDATION');
    if (k === 'MANUAL_TIME_POLICY') requireOneOf_(upper_(v), ['ALLOW', 'REASON_REQUIRED', 'MANAGER_ONLY', 'DISABLED'], 'MANUAL_TIME_POLICY');
    if (['WHATSAPP_DEFAULT_NUMBER', 'WHATSAPP_MANAGEMENT_NUMBER'].indexOf(k) !== -1) v = cleanMobile_(v);
    setSetting_(k, v, ctx);
    changed.push(k);
  });
  clearCache_();
  logActivity_(ctx, 'SETTINGS_UPDATED', 'SYSTEM_SETTINGS', '', changed);
  return ok_({ changed: changed }, 'Settings saved');
}

function settingsApplySchedule_(ctx) {
  requireAdmin_(ctx);
  var out = setupTriggers();
  return ok_(out, 'Schedule applied: reminder ' + out.reminder + ', reports ' + out.reportGeneration + ', manager summary ' + out.managerSummary);
}

function adminRunScheduled_(ctx, p) {
  requireAdmin_(ctx);
  var job = trim_(p.job);
  var date = p.date ? requireDate_(p.date) : today_();
  if (job === 'reminder') return ok_({ sent: scheduledReminder() }, 'Reminders sent');
  if (job === 'reports') return ok_(scheduledReportGeneration(date), 'Reports generated for ' + formatDateDMY_(date));
  if (job === 'managerSummary') return ok_({ sent: scheduledManagerSummary(date) }, 'Manager summaries sent');
  throw AppError_('Unknown job. Use reminder | reports | managerSummary', 'VALIDATION');
}

function adminExportCsv_(ctx, p) {
  requireAdmin_(ctx);
  var name = upper_(p.sheet);
  if (!CONFIG.SCHEMA[name]) throw AppError_('Unknown sheet', 'VALIDATION');
  if (name === 'AUTH_SESSIONS') throw AppError_('Sessions cannot be exported', 'FORBIDDEN');
  logActivity_(ctx, 'EXPORT_CSV', name, '', '');
  return ok_({ sheet: name, csv: exportCsv_(name) });
}

function adminSeedSample_(ctx, p) {
  requireAdmin_(ctx);
  return ok_({ result: seedSampleData(toBool_(p.force)) }, 'Sample data processed');
}

function adminSetupDatabase_(ctx) {
  requireRole_(ctx, [CONFIG.ROLES.SUPER_ADMIN]);
  return ok_({ result: setupDatabase() }, 'Database verified');
}

/** Editor helper: prints a quick self-test to the log. */
function selfTest() {
  var r = setupDatabase();
  Logger.log(r);
  var m = resolveDesignation_('MIS Executive');
  Logger.log('MIS Executive -> ' + (m ? m.Department : 'UNMAPPED'));
  Logger.log('Employees: ' + readTable_('EMPLOYEES').length);
}
