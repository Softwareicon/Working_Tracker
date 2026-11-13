/**
 * run-tests.js — Executes the unmodified Apps Script backend inside Node using the GAS shim and
 * walks through the testing checklist (section 19 of the specification).
 *   node tests/run-tests.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const load = (p) => vm.runInThisContext(fs.readFileSync(p, 'utf8'), { filename: p });
load(path.join(root, 'frontend/js/demo/gas-shim.js'));
const order = ['Config', 'Utils', 'Database', 'Validation', 'Auth', 'DesignationService', 'EmployeeService', 'QuestionnaireService',
  'TimeTrackingService', 'TaskService', 'DifficultyService', 'ReportService', 'WhatsAppService', 'AnalyticsService', 'NotificationService', 'SampleData', 'Code'];
order.forEach((f) => load(path.join(root, 'backend', f + '.gs')));
CONFIG.DEMO_MODE = true;
GAS_SHIM.quiet = true;

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✔ ' + name); }
  catch (e) { failed++; console.log('  ✘ ' + name + '\n      ' + (e.stack || e).toString().split('\n').slice(0, 3).join('\n      ')); }
}
function assert(c, m) { if (!c) throw new Error('Assertion failed: ' + m); }
function eq(a, b, m) { if (a !== b) throw new Error((m || 'eq') + ': expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a)); }
const api = (action, token, payload) => handleRequest_({ action, token, payload });
const must = (r, m) => { if (!r.success) throw new Error((m || 'API') + ' failed: ' + r.message + ' [' + r.code + ']'); return r.data; };
const mustFail = (r, code, m) => { if (r.success) throw new Error((m || 'API') + ' should have failed'); if (code && r.code !== code) throw new Error((m || 'API') + ' wrong code ' + r.code + ' (' + r.message + ')'); return r; };
const login = (email) => { const o = must(api('auth.requestOtp', null, { email })); return must(api('auth.verifyOtp', null, { email, otp: o.demoOtp })).token; };

console.log('\nPHASE 1 — Database & designation mapping');
test('setupDatabase creates all sheets with headers', () => {
  setupDatabase();
  Object.keys(CONFIG.SHEETS).forEach((k) => { const sh = GAS_SHIM.spreadsheet.getSheetByName(CONFIG.SHEETS[k]); assert(sh, 'sheet ' + k); eq(sh.getRange(1, 1, 1, 1).getValue(), CONFIG.SCHEMA[k][0], 'header ' + k); });
  assert(readTable_('DEPARTMENTS').length === 9, '9 departments');
  assert(readTable_('QUESTIONNAIRE_MASTER').length > 100, 'questionnaire templates seeded');
  assert(readTable_('EMPLOYEES').some((e) => e.Role === 'SUPER_ADMIN'), 'bootstrap super admin');
});
test('setupDatabase is idempotent', () => { const n = readTable_('QUESTIONNAIRE_MASTER').length; setupDatabase(); eq(readTable_('QUESTIONNAIRE_MASTER').length, n); eq(readTable_('DEPARTMENTS').length, 9); });

let adminToken, adminId;
test('super admin login via OTP (demo)', () => { adminToken = login(CONFIG.SUPER_ADMIN_EMAILS[0]); const me = must(api('auth.me', adminToken)); eq(me.user.role, 'SUPER_ADMIN'); adminId = me.user.employeeId; });
test('wrong OTP rejected, unauthorized e-mail rejected', () => {
  must(api('auth.requestOtp', null, { email: CONFIG.SUPER_ADMIN_EMAILS[0] }));
  mustFail(api('auth.verifyOtp', null, { email: CONFIG.SUPER_ADMIN_EMAILS[0], otp: '000000' }), 'AUTH_OTP_INVALID');
  mustFail(api('auth.requestOtp', null, { email: 'nobody@nowhere.com' }), 'AUTH_UNAUTHORIZED_EMAIL');
  mustFail(api('employees.list', 'bad-token'), 'AUTH_INVALID');
});

const add = (name, designation, email, extra) => must(api('employees.save', adminToken, Object.assign({ EmployeeName: name, Designation: designation, Email: email, Mobile: '98' + String(Math.floor(Math.random() * 1e8)).padStart(8, '0') }, extra || {}))).employee;
let sales, mis, crm, gfx, mgr;
test('1. Sales Executive -> SALES automatically', () => { sales = add('Rahul Test', 'Sales Executive', 'rahul.test@oak.test'); eq(sales.Department, 'SALES'); assert(/^EMP\d{3}$/.test(sales.EmployeeID), 'EmployeeID format ' + sales.EmployeeID); });
test('2. MIS Executive -> OPERATIONS automatically', () => { mis = add('Deepak Test', 'MIS Executive', 'deepak.test@oak.test'); eq(mis.Department, 'OPERATIONS'); });
test('3. CRM Executive -> OPERATIONS automatically', () => { crm = add('Pooja Test', 'CRM Executive', 'pooja.test@oak.test'); eq(crm.Department, 'OPERATIONS'); });
test('4. Graphic Designer -> GRAPHICS DESIGNER automatically', () => { gfx = add('Arjun Test', 'Graphic Designer', 'arjun.test@oak.test'); eq(gfx.Department, 'GRAPHICS DESIGNER'); });
test('4b. Inventory Manager -> STORE automatically (with its own questionnaire)', () => { const inv = add('Ramesh Test', 'Inventory Manager', 'ramesh.test@oak.test'); eq(inv.Department, 'STORE'); const qq = buildQuestionnaire_({ Designation: 'Inventory Manager', Department: 'STORE' }); eq(qq.sections[0].title, 'Inventory Manager — Role Questions'); assert(qq.sections[0].questions.length === 12, 'store questions'); });
test('Unknown designation is never silently assigned', () => { mustFail(api('employees.save', adminToken, { EmployeeName: 'X Y', Designation: 'Quantum Analyst', Email: 'q@oak.test' }), 'DESIGNATION_UNMAPPED'); });
test('Admin can create mapping for a new designation, then employee creation works', () => {
  must(api('designations.save', adminToken, { DesignationName: 'Quantum Analyst', Department: 'OPERATIONS', QuestionnaireKey: 'MIS Executive' }));
  const e = add('Q Analyst', 'Quantum Analyst', 'q@oak.test'); eq(e.Department, 'OPERATIONS');
});
test('Duplicate e-mail / mobile prevented', () => { mustFail(api('employees.save', adminToken, { EmployeeName: 'Dup', Designation: 'Sales Executive', Email: 'rahul.test@oak.test' }), 'DUPLICATE'); });
test('Manager assignment + role', () => {
  mgr = add('Priya Manager', 'Sales Manager', 'priya.mgr@oak.test', { Role: 'DEPARTMENT_MANAGER' });
  const upd = must(api('employees.save', adminToken, { EmployeeID: sales.EmployeeID, ReportingManagerID: mgr.EmployeeID })).employee;
  eq(upd.ReportingManagerName, 'Priya Manager'); eq(upd.Department, 'SALES');
});

console.log('\nPHASE 2 — Questionnaire engine & access control');
let salesToken, misToken, mgrToken;
test('5. Every designation receives its own questionnaire', () => {
  const keys = Object.keys(questionnaireTemplates_()).filter((k) => k !== 'COMMON');
  keys.forEach((k) => { const q = buildQuestionnaire_({ Designation: k, Department: resolveDesignation_(k).Department }); eq(q.sections[0].key, 'DESIGNATION', k); assert(q.sections[0].questions.length >= 9, k + ' role questions'); assert(q.sections[q.sections.length - 1].questions.length === 14, 'common questions'); });
  const a = buildQuestionnaire_({ Designation: 'Sales Executive', Department: 'SALES' }), b = buildQuestionnaire_({ Designation: 'Graphic Designer', Department: 'GRAPHICS DESIGNER' });
  assert(a.sections[0].questions[0].QuestionText !== b.sections[0].questions[0].QuestionText, 'different questions');
});
test('Employee gets own questionnaire via API; conditional + mandatory validation', () => {
  salesToken = login('rahul.test@oak.test'); misToken = login('deepak.test@oak.test'); mgrToken = login('priya.mgr@oak.test');
  const q = must(api('questionnaire.get', salesToken, {}));
  eq(q.questionnaire.sections[0].title.indexOf('Sales Executive'), 0);
  const r = mustFail(api('questionnaire.save', salesToken, { answers: { Q0001: 'x' }, submit: true }), 'VALIDATION');
  assert(/mandatory/i.test(r.message), 'mandatory message');
  must(api('questionnaire.save', salesToken, { answers: { Q0001: 'draft' }, submit: false }));
  eq(must(api('questionnaire.get', salesToken, {})).status, 'DRAFT');
});
test('6. Employees cannot access other employees\' records', () => {
  mustFail(api('questionnaire.get', salesToken, { employeeId: mis.EmployeeID }), 'FORBIDDEN');
  mustFail(api('reports.get', salesToken, { employeeId: mis.EmployeeID }), 'FORBIDDEN');
  mustFail(api('employees.save', salesToken, { EmployeeName: 'Hack', Designation: 'Sales Executive', Email: 'h@oak.test' }), 'FORBIDDEN');
  mustFail(api('settings.get', salesToken), 'FORBIDDEN');
  eq(must(api('employees.list', salesToken)).employees.length, 1, 'employee sees only self');
  const mgrList = must(api('employees.list', mgrToken)).employees.map((e) => e.EmployeeID);
  assert(mgrList.indexOf(sales.EmployeeID) !== -1 && mgrList.indexOf(mis.EmployeeID) === -1, 'manager sees only team');
  must(api('reports.get', mgrToken, { employeeId: sales.EmployeeID }));
  mustFail(api('reports.get', mgrToken, { employeeId: mis.EmployeeID }), 'FORBIDDEN');
});

console.log('\nPHASE 3 — Tasks, timers, difficulties');
const today = today_();
let t1, t2;
test('7. Task durations calculate correctly (10:00 -> 11:30 = 90 min)', () => {
  t1 = must(api('tasks.save', salesToken, { TaskTitle: 'Customer follow-up', TaskCategory: 'Customer Follow-up', Priority: 'HIGH', StartTime: today + 'T10:00', EndTime: today + 'T11:30', Status: 'COMPLETED' })).task;
  eq(t1.TimeSpentMinutes, 90); eq(t1.TimeSpentLabel, '1 Hour 30 Minutes'); eq(t1.Status, 'COMPLETED');
});
test('8. Overlapping timers / entries are prevented', () => {
  t2 = must(api('tasks.save', salesToken, { TaskTitle: 'Quotation prep', TaskCategory: 'Quotation', Priority: 'URGENT' })).task;
  mustFail(api('tasks.save', salesToken, { TaskTitle: 'Overlap', StartTime: today + 'T11:00', EndTime: today + 'T12:00' }), 'OVERLAP');
  mustFail(api('tasks.manualTime', salesToken, { TaskID: t2.TaskID, StartTime: today + 'T10:30', EndTime: today + 'T10:45', Reason: 'test' }), 'OVERLAP');
  const t3 = must(api('tasks.save', salesToken, { TaskTitle: 'Reporting', TaskCategory: 'Reporting' })).task;
  const run = must(api('tasks.timer', salesToken, { TaskID: t2.TaskID, action: 'start' })).task;
  eq(run.TimerState, 'RUNNING'); eq(run.Status, 'IN PROGRESS');
  mustFail(api('tasks.timer', salesToken, { TaskID: t3.TaskID, action: 'start' }), 'TIMER_CONFLICT');
  mustFail(api('tasks.timer', salesToken, { TaskID: t2.TaskID, action: 'start' }), 'VALIDATION');
  const paused = must(api('tasks.timer', salesToken, { TaskID: t2.TaskID, action: 'pause' })).task; eq(paused.TimerState, 'PAUSED');
  must(api('tasks.timer', salesToken, { TaskID: t3.TaskID, action: 'start' }));
  must(api('tasks.timer', salesToken, { TaskID: t3.TaskID, action: 'complete' }));
  eq(must(api('tasks.list', salesToken, { employeeId: sales.EmployeeID, date: today })).tasks.filter((t) => t.TimerState === 'RUNNING').length, 0);
});
test('Manual time policy requires a reason; valid manual entry adds time', () => {
  mustFail(api('tasks.manualTime', salesToken, { TaskID: t2.TaskID, StartTime: today + 'T08:00', EndTime: today + 'T08:30', Reason: '' }), 'VALIDATION');
  const t = must(api('tasks.manualTime', salesToken, { TaskID: t2.TaskID, StartTime: today + 'T08:00', EndTime: today + 'T08:45', Reason: 'Forgot to start timer' })).task;
  assert(t.TimeSpentMinutes >= 45, 'manual minutes ' + t.TimeSpentMinutes);
});
test('Non-overlapping merge never double counts', () => {
  const m = mergeIntervals_([{ start: 0, end: 60000 * 60 }, { start: 60000 * 30, end: 60000 * 90 }, { start: 60000 * 200, end: 60000 * 230 }]);
  eq(m.minutes, 120);
  const tl = must(api('time.timeline', salesToken, { date: today }));
  assert(tl.recordedMinutes >= 135 && tl.recordedMinutes < 200, 'recorded ' + tl.recordedMinutes);
  eq(tl.unallocatedMinutes, Math.max(0, tl.workingMinutes - tl.recordedMinutes - tl.breakMinutes));
});
test('Difficulty raised against another department -> delay tracker + task blocked', () => {
  const t4 = must(api('tasks.save', salesToken, { TaskTitle: 'Pricing approval', Priority: 'HIGH' })).task;
  const d = must(api('difficulties.save', salesToken, { TaskID: t4.TaskID, ProblemDescription: 'Pricing approval pending from management', Category: 'Approval Pending', DifficultyLevel: 'HIGH', DelayMinutes: 120, DepartmentInvolved: 'ACCOUNTS', AssistanceRequired: 'Need approval', EscalationRequired: true })).difficulty;
  eq(d.DelayType, 'MANAGEMENT_APPROVAL'); eq(d.ResolutionStatus, 'ESCALATED');
  eq(findById_('TASK_ENTRIES', 'TaskID', t4.TaskID).Status, 'BLOCKED');
  assert(readTable_('DELAY_TRACKER').some((x) => x.DifficultyID === d.DifficultyID), 'delay tracker row');
  mustFail(api('difficulties.save', salesToken, { TaskName: 'x', ProblemDescription: 'y', Category: 'Nope' }), 'VALIDATION');
  const res = must(api('difficulties.updateStatus', mgrToken, { DifficultyID: d.DifficultyID, status: 'RESOLVED', notes: 'Approved' })).difficulty;
  eq(res.ResolutionStatus, 'RESOLVED'); eq(findById_('TASK_ENTRIES', 'TaskID', t4.TaskID).Status, 'IN PROGRESS');
  must(api('difficulties.save', salesToken, { TaskID: t2.TaskID, ProblemDescription: 'Customer approval delayed', Category: 'Customer Dependency', DelayMinutes: 60 }));
});

console.log('\nPHASE 4 — Reports & WhatsApp');
let report;
test('15. Incomplete submissions are clearly flagged', () => {
  const r = must(api('reports.get', salesToken, { date: today })).report;
  eq(r.incomplete, true); eq(r.status, 'INCOMPLETE'); assert(r.missing.some((m) => /questionnaire/i.test(m)), 'missing questionnaire');
  mustFail(api('reports.submit', salesToken, { date: today }), 'VALIDATION');
});
test('Submit questionnaire + report; duplicate submission prevented', () => {
  const q = must(api('questionnaire.get', salesToken, {})).questionnaire;
  const answers = {};
  q.sections.forEach((s) => s.questions.forEach((qq) => { if (qq.ConditionQuestionID) return; answers[qq.QuestionID] = qq.QuestionType === 'NUMBER' ? 5 : qq.QuestionType === 'YESNO' ? (/delayed/i.test(qq.QuestionText) ? 'YES' : 'NO') : qq.QuestionType === 'MULTISELECT' ? [qq.Options[0].value] : qq.QuestionType === 'SELECT' ? qq.Options[0].value : (/priorities for tomorrow/i.test(qq.QuestionText) ? 'Close ABC quotation\nFollow up XYZ' : /tasks did you complete/i.test(qq.QuestionText) ? 'Completed 15 customer follow-ups' : 'Answer'); }));
  q.sections.forEach((s) => s.questions.forEach((qq) => { if (qq.ConditionQuestionID && String(answers[qq.ConditionQuestionID]).toUpperCase() === qq.ConditionValue) answers[qq.QuestionID] = 'Customer approval delay'; }));
  must(api('questionnaire.save', salesToken, { answers, submit: true }));
  report = must(api('reports.submit', salesToken, { date: today, employeeRemarks: 'Good day' })).report;
  eq(report.status, 'SUBMITTED'); eq(report.incomplete, false); assert(report.reportId, 'report id');
  mustFail(api('reports.submit', salesToken, { date: today }), 'DUPLICATE');
});
test('9. Completed / pending / blocked / in-progress correctly classified', () => {
  const s = report.summary; eq(s.totalTasks, 4); eq(s.completed, 2); eq(s.inProgress, 1); eq(s.pending, 0); eq(s.blocked, 1);
  eq(report.productivity.completionRate, 50);
  assert(report.tasks.every((t) => ['COMPLETED', 'IN PROGRESS', 'PENDING', 'ON HOLD', 'BLOCKED'].indexOf(t.status) !== -1), 'statuses');
});
test('10. Delay reasons appear in reports', () => {
  assert(report.challenges.list.length === 2, 'difficulties in report');
  assert(report.challenges.interdepartmental.length === 1, 'external/customer delay listed');
  eq(report.challenges.delays.answer, 'YES'); eq(report.challenges.delays.reason, 'Customer approval delay');
  assert(report.achievements.indexOf('Completed 15 customer follow-ups') !== -1, 'questionnaire achievements merged');
  assert(report.tomorrow.planned.length === 2, 'tomorrow priorities');
  assert(report.time.timeline.length >= 3, 'timeline entries');
});
test('12. WhatsApp message formatting', () => {
  const w = must(api('reports.whatsapp', salesToken, { reportId: report.reportId, target: 'custom', number: '9876543210' }));
  ['*OAKCRAFT FURNITURE*', '*DAILY WORK REPORT*', '*WORK SUMMARY*', '*TIME UTILIZATION*', '*MAJOR ACHIEVEMENTS*', '*PENDING WORK*', '*MAJOR CHALLENGES*', '*PRIORITIES FOR TOMORROW*', 'Report Status: Submitted.'].forEach((h) => assert(w.text.indexOf(h) !== -1, 'missing ' + h));
  assert(w.url.indexOf('https://wa.me/919876543210?text=') === 0, 'wa.me link');
  assert(w.text.indexOf('Date: ' + formatDateDMY_(today)) !== -1, 'date format DD/MM/YYYY');
});
test('Manager remarks, approval locks the day, reopen unlocks', () => {
  must(api('reports.managerRemark', mgrToken, { reportId: report.reportId, remarks: 'Well done', actionPoints: 'Close ABC\nCall XYZ', rating: 4 }));
  mustFail(api('reports.managerRemark', salesToken, { reportId: report.reportId, remarks: 'self' }), 'FORBIDDEN');
  must(api('reports.approve', mgrToken, { reportId: report.reportId }));
  mustFail(api('tasks.save', salesToken, { TaskTitle: 'After lock' }), 'LOCKED');
  mustFail(api('questionnaire.save', salesToken, { answers: { Q0001: 'x' } }), 'LOCKED');
  const r = must(api('reports.get', salesToken, { reportId: report.reportId })).report; eq(r.status, 'APPROVED'); eq(r.managerRemarks.length, 1); eq(r.managerRemarks[0].actionPoints.length, 2);
  must(api('reports.reopen', mgrToken, { reportId: report.reportId, reason: 'fix' }));
  must(api('tasks.save', salesToken, { TaskTitle: 'After reopen' }));
  must(api('reports.submit', salesToken, { date: today, resubmit: true }));
});

console.log('\nPHASE 5 — Dashboard, department summaries, analytics, automation');
test('Sample data loads for all departments', () => { const msg = seedSampleData(); assert(/Sample data loaded/.test(msg), msg); eq(readTable_('EMPLOYEES').filter((e) => /@example\.com$/.test(e.Email)).length, 15); assert(readTable_('DAILY_REPORTS').length > 30, 'reports generated'); });
test('11. Department summaries calculate correctly', () => {
  const sm = must(api('reports.department', adminToken, { department: 'SALES', date: today })).summary;
  const emps = readTable_('EMPLOYEES').filter((e) => e.Department === 'SALES' && e.Status === 'ACTIVE');
  eq(sm.totalEmployees, emps.length);
  const tasks = readTable_('TASK_ENTRIES').filter((t) => t.Date === today && emps.some((e) => e.EmployeeID === t.EmployeeID));
  eq(sm.totalTasks, tasks.length); eq(sm.tasksCompleted, tasks.filter((t) => t.Status === 'COMPLETED').length);
  eq(sm.reportsSubmitted + sm.reportsPending, emps.length);
  assert(sm.whatsapp.indexOf('*DEPARTMENT DAILY SUMMARY – SALES*') !== -1, 'dept whatsapp');
  const mg = must(api('reports.management', adminToken, { date: today })); eq(mg.departments.length, 9);
  mustFail(api('reports.department', salesToken, { department: 'SALES' }), 'FORBIDDEN');
});
test('Admin dashboard + analytics charts + bottlenecks respond with full structures', () => {
  const d = must(api('analytics.dashboard', adminToken, { date: today }));
  eq(d.departments.length, 9); assert(d.overview.totalEmployees >= 20, 'employees'); assert(d.overview.reportsSubmittedToday > 0, 'submitted today'); assert(d.trend.length === 14, 'trend');
  const c = must(api('analytics.charts', adminToken, { dateFrom: formatDate_(new Date(Date.now() - 2 * 86400000)), dateTo: today }));
  ['departmentCompletion', 'employeeCompletion', 'productivityTrend', 'timeUtilization', 'departmentPending', 'difficultyCategories', 'delayTypes', 'submissionRate', 'priorityDistribution', 'dependencies'].forEach((k) => assert(c[k], 'chart ' + k));
  assert(c.difficultyCategories.labels.length >= 5, 'difficulty categories');
  const b = must(api('analytics.bottlenecks', adminToken, {})); assert(b.insights.length >= 3, 'insights'); assert(b.unresolved.length > 0, 'unresolved');
  const bm = must(api('analytics.dashboard', mgrToken, { date: today })); assert(bm.employees.every((e) => e.Department === 'SALES'), 'manager scope limited to team');
  must(api('difficulties.bottlenecks', mgrToken, {}));
  must(api('employees.history', adminToken, { employeeId: sales.EmployeeID }));
});
test('Scheduled jobs: reminder, report generation (flags incomplete), manager summary', () => {
  GAS_SHIM.store.mails.length = 0;
  const sent = scheduledReminder(); assert(sent > 0, 'reminders sent ' + sent);
  const gen = scheduledReportGeneration(today); assert(gen.generated > 10, 'generated'); assert(gen.incomplete.length > 0, 'incomplete flagged: ' + gen.incomplete.length);
  const inc = readTable_('DAILY_REPORTS').filter((r) => r.Date === today && r.Status === 'INCOMPLETE'); assert(inc.length > 0, 'INCOMPLETE rows');
  assert(scheduledManagerSummary(today) > 0, 'summaries sent');
  assert(GAS_SHIM.store.mails.length > 3, 'mails logged');
  eq(readTable_('NOTIFICATION_LOGS').filter((n) => n.Status === 'SENT').length > 3, true);
  const trig = setupTriggers(); assert(trig.reminder && trig.reportGeneration, 'triggers');
});
test('Questionnaire admin: add / edit / reorder / toggle / delete / history', () => {
  const q = must(api('questionnaire.admin.save', adminToken, { Scope: 'DEPARTMENT', ScopeValue: 'SALES', QuestionText: 'Which showroom did you cover?', QuestionType: 'SELECT', Options: ['Main', 'Annex'], Mandatory: true })).question;
  assert(q.Options.length === 2, 'options');
  const got = must(api('questionnaire.get', salesToken, {})).questionnaire; assert(got.sections.some((s) => s.key === 'DEPARTMENT'), 'department section appears');
  must(api('questionnaire.admin.save', adminToken, { QuestionID: q.QuestionID, QuestionText: 'Which showroom did you cover today?' }));
  eq(findById_('QUESTIONNAIRE_MASTER', 'QuestionID', q.QuestionID).Version, 2);
  must(api('questionnaire.admin.reorder', adminToken, { order: [q.QuestionID] }));
  must(api('questionnaire.admin.toggle', adminToken, { QuestionID: q.QuestionID, active: false }));
  assert(!must(api('questionnaire.get', salesToken, {})).questionnaire.sections.some((s) => s.key === 'DEPARTMENT'), 'inactive hidden');
  must(api('questionnaire.admin.delete', adminToken, { QuestionID: q.QuestionID }));
  assert(must(api('questionnaire.admin.history', adminToken, { QuestionID: q.QuestionID })).history.length >= 4, 'history');
  mustFail(api('questionnaire.admin.save', salesToken, { Scope: 'COMMON', QuestionText: 'hack?', QuestionType: 'TEXT' }), 'FORBIDDEN');
});
test('Settings save/validate, CSV export, deactivation ends sessions', () => {
  must(api('settings.save', adminToken, { settings: { WORK_END: '18:00', WHATSAPP_DEFAULT_NUMBER: '+91 98765 43210' } }));
  eq(getSetting_('WHATSAPP_DEFAULT_NUMBER'), '919876543210');
  mustFail(api('settings.save', adminToken, { settings: { WORK_END: '25:00' } }), 'VALIDATION');
  const csv = must(api('admin.exportCsv', adminToken, { sheet: 'TASK_ENTRIES' })).csv; assert(csv.split('\n').length > 20, 'csv rows'); assert(csv.indexOf('TaskID,Date,EmployeeID') === 0, 'csv header');
  must(api('employees.setStatus', adminToken, { employeeId: mis.EmployeeID, status: 'INACTIVE' }));
  mustFail(api('auth.me', misToken), 'AUTH_INVALID'); // session terminated on deactivation
  mustFail(api('auth.requestOtp', null, { email: 'deepak.test@oak.test' }), 'AUTH_INACTIVE');
  must(api('employees.setStatus', adminToken, { employeeId: mis.EmployeeID, status: 'ACTIVE' }));
  must(api('auth.logout', salesToken)); mustFail(api('auth.me', salesToken), 'AUTH_INVALID');
});
test('Export/import of the in-memory spreadsheet round-trips (demo persistence)', () => {
  const json = GAS_SHIM.export(); const n = readTable_('TASK_ENTRIES', { noCache: true }).length;
  GAS_SHIM.import(json); eq(readTable_('TASK_ENTRIES', { noCache: true }).length, n);
});

console.log('\n' + passed + ' passed, ' + failed + ' failed\n');
process.exit(failed ? 1 : 0);
