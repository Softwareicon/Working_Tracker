/**
 * SampleData.gs — Realistic sample employees, tasks, time logs, questionnaire answers and
 * difficulties for every department, for testing. Run seedSampleData() from the editor
 * (or Settings > Load sample data). Safe to run once; refuses to run twice unless force=true.
 */

var SAMPLE_EMPLOYEES_ = [
  { name: 'Ankush Verma', designation: 'MIS Manager', email: 'ankush.verma@example.com', mobile: '9810000001', role: 'DEPARTMENT_MANAGER' },
  { name: 'Priya Nair', designation: 'Sales Manager', email: 'priya.nair@example.com', mobile: '9810000002', role: 'DEPARTMENT_MANAGER' },
  { name: 'Rahul Sharma', designation: 'Sales Executive', email: 'rahul.sharma@example.com', mobile: '9810000003', manager: 'priya.nair@example.com' },
  { name: 'Sneha Kulkarni', designation: 'Sales Executive', email: 'sneha.kulkarni@example.com', mobile: '9810000004', manager: 'priya.nair@example.com' },
  { name: 'Mohit Jain', designation: 'Accounts Executive', email: 'mohit.jain@example.com', mobile: '9810000005', manager: 'ankush.verma@example.com' },
  { name: 'Farah Khan', designation: 'E-Commerce Executive', email: 'farah.khan@example.com', mobile: '9810000006', manager: 'ankush.verma@example.com' },
  { name: 'Deepak Yadav', designation: 'MIS Executive', email: 'deepak.yadav@example.com', mobile: '9810000007', manager: 'ankush.verma@example.com' },
  { name: 'Neha Gupta', designation: 'Executive Assistant', email: 'neha.gupta@example.com', mobile: '9810000008', manager: 'ankush.verma@example.com' },
  { name: 'Vikram Singh', designation: 'Process Coordinator', email: 'vikram.singh@example.com', mobile: '9810000009', manager: 'ankush.verma@example.com' },
  { name: 'Pooja Mehta', designation: 'CRM Executive', email: 'pooja.mehta@example.com', mobile: '9810000010', manager: 'ankush.verma@example.com' },
  { name: 'Suresh Patil', designation: 'Packaging Executive', email: 'suresh.patil@example.com', mobile: '9810000011', manager: 'ankush.verma@example.com' },
  { name: 'Kiran Rao', designation: 'GEM Executive', email: 'kiran.rao@example.com', mobile: '9810000012', manager: 'ankush.verma@example.com' },
  { name: 'Aisha Siddiqui', designation: 'Digital Marketing Executive', email: 'aisha.siddiqui@example.com', mobile: '9810000013', manager: 'priya.nair@example.com' },
  { name: 'Arjun Desai', designation: 'Graphic Designer', email: 'arjun.desai@example.com', mobile: '9810000014', manager: 'priya.nair@example.com' },
  { name: 'Ramesh Iyer', designation: 'Inventory Manager', email: 'ramesh.iyer@example.com', mobile: '9810000015', manager: 'ankush.verma@example.com' }
];

var SAMPLE_TASKS_ = {
  'Sales Executive': [['Customer follow-up calls', 'Customer Follow-up', 60], ['Quotation preparation – Sharma Interiors', 'Quotation', 45], ['Internal coordination with Accounts', 'Coordination', 45], ['Lead data reporting', 'Reporting', 30], ['Showroom visit – Mehta family', 'Meeting', 90]],
  'Accounts Executive': [['Purchase invoice processing', 'Accounting', 90], ['Payment entries & reconciliation', 'Accounting', 75], ['GST return working', 'Accounting', 60], ['Outstanding payment follow-up', 'Customer Follow-up', 45]],
  'E-Commerce Executive': [['Amazon order processing', 'Marketplace', 90], ['Flipkart returns handling', 'Marketplace', 45], ['Listing updates – new sofa range', 'Marketplace', 60], ['Customer complaint resolution', 'Support', 40]],
  'MIS Executive': [['Daily sales dashboard update', 'Reporting', 60], ['Flipkart vendor sheet automation', 'Reporting', 120], ['Data validation – stock report', 'Data Entry', 45], ['Ad-hoc report for management', 'Reporting', 40]],
  'Executive Assistant': [['Management calendar coordination', 'Coordination', 45], ['Vendor meeting minutes', 'Documentation', 40], ['Approval follow-ups', 'Coordination', 30], ['Travel arrangements', 'Other', 50]],
  'Process Coordinator': [['Dispatch process monitoring', 'Coordination', 60], ['SOP update – returns process', 'Documentation', 75], ['Interdepartmental issue resolution', 'Coordination', 45], ['Daily process deviation log', 'Reporting', 30]],
  'CRM Executive': [['New lead entry (Meta + IndiaMART)', 'Data Entry', 60], ['Follow-up scheduling', 'Customer Follow-up', 45], ['Lead status updates', 'Data Entry', 45], ['CRM data cleanup', 'Data Entry', 40]],
  'Packaging Executive': [['Packing – Amazon orders', 'Packaging', 150], ['Packing – Flipkart orders', 'Packaging', 90], ['Material stock check', 'Packaging', 30], ['Dispatch coordination', 'Coordination', 30]],
  'GEM Executive': [['New tender search & shortlisting', 'Tender', 60], ['Bid document preparation', 'Tender', 120], ['Clarification queries', 'Tender', 30], ['Bid submission', 'Tender', 45]],
  'Digital Marketing Executive': [['Meta campaign optimisation', 'Marketing', 75], ['Social media posting', 'Marketing', 45], ['SEO blog update', 'Marketing', 60], ['Lead report to Sales', 'Reporting', 30]],
  'Graphic Designer': [['Festive sale creatives', 'Design', 120], ['Product catalogue layout', 'Design', 90], ['Revisions – banner set', 'Design', 45], ['Social media templates', 'Design', 60]],
  'Inventory Manager': [['GRN entry – incoming hardware stock', 'Data Entry', 60], ['Material issue to Packaging', 'Coordination', 45], ['Cycle count – foam & fabric rack', 'Other', 90], ['Reorder indent for low stock items', 'Documentation', 40]],
  'MIS Manager': [['Team review & planning', 'Meeting', 60], ['Management dashboard', 'Reporting', 90], ['Automation review', 'Reporting', 60]],
  'Sales Manager': [['Sales pipeline review', 'Meeting', 60], ['Key account negotiation', 'Customer Follow-up', 90], ['Team coaching', 'Meeting', 45]]
};

var SAMPLE_DIFFICULTIES_ = [
  { email: 'rahul.sharma@example.com', task: 0, cat: 'Customer Dependency', level: 'MEDIUM', problem: 'Customer approval on quotation pending since 2 days', dept: '', delay: 120, assist: '' },
  { email: 'rahul.sharma@example.com', task: 1, cat: 'Approval Pending', level: 'HIGH', problem: 'Product pricing confirmation pending from management', dept: 'MANAGEMENT', delay: 90, assist: 'Need pricing approval for bulk order', escalate: true },
  { email: 'mohit.jain@example.com', task: 0, cat: 'Data Not Available', level: 'MEDIUM', problem: 'Purchase bills not received from Packaging for 3 vendors', dept: 'PACKAGING', delay: 60 },
  { email: 'farah.khan@example.com', task: 2, cat: 'Other Department Dependency', level: 'HIGH', problem: 'Product images for new sofa range not received from Graphics', dept: 'GRAPHICS DESIGNER', delay: 180 },
  { email: 'deepak.yadav@example.com', task: 1, cat: 'Technical Issue', level: 'MEDIUM', problem: 'Flipkart seller portal export failing intermittently', dept: '', delay: 45 },
  { email: 'suresh.patil@example.com', task: 2, cat: 'Material Not Available', level: 'CRITICAL', problem: 'Bubble wrap stock exhausted; 40 orders waiting', dept: 'OPERATIONS', delay: 240, assist: 'Urgent purchase of packaging material', escalate: true },
  { email: 'kiran.rao@example.com', task: 1, cat: 'Lack of Information', level: 'MEDIUM', problem: 'Technical specification sheet missing for tender item', dept: 'SALES', delay: 60 },
  { email: 'arjun.desai@example.com', task: 2, cat: 'Workload Pressure', level: 'HIGH', problem: 'Three departments requested revisions on the same day', dept: 'DIGITAL MARKETING', delay: 90 },
  { email: 'aisha.siddiqui@example.com', task: 0, cat: 'System or Software Issue', level: 'LOW', problem: 'Meta Ads Manager showing delayed metrics', dept: '', delay: 30 },
  { email: 'ramesh.iyer@example.com', task: 1, cat: 'Other Department Dependency', level: 'MEDIUM', problem: 'Packaging requested material without an approved indent', dept: 'PACKAGING', delay: 45 }
];

function sampleAnswers_(emp, def, dayIndex) {
  var answers = {};
  def.sections.forEach(function (s) {
    s.questions.forEach(function (q) {
      var t = q.QuestionText;
      if (q.ConditionQuestionID) return; // filled below when relevant
      if (q.QuestionType === 'NUMBER') answers[q.QuestionID] = /hours did you work/i.test(t) ? 8 : /value|expenditure/i.test(t) ? (dayIndex + 1) * 15000 : 3 + ((dayIndex * 7 + t.length) % 9);
      else if (q.QuestionType === 'YESNO') answers[q.QuestionID] = (/delayed|discrepanc|damaged|health|left untouched/i.test(t) ? (dayIndex % 2 === 0 ? 'YES' : 'NO') : 'YES');
      else if (q.QuestionType === 'SELECT') answers[q.QuestionID] = q.Options.length ? q.Options[dayIndex % q.Options.length].value : 'None';
      else if (q.QuestionType === 'MULTISELECT') answers[q.QuestionID] = q.Options.slice(0, 2).map(function (o) { return o.value; });
      else if (/main responsibilities/i.test(t)) answers[q.QuestionID] = 'Daily ' + emp.Designation.toLowerCase() + ' responsibilities: ' + (SAMPLE_TASKS_[emp.Designation] || []).map(function (x) { return x[0]; }).slice(0, 3).join(', ');
      else if (/tasks did you complete/i.test(t)) answers[q.QuestionID] = (SAMPLE_TASKS_[emp.Designation] || []).slice(0, 2).map(function (x) { return x[0]; }).join('\n');
      else if (/in progress/i.test(t)) answers[q.QuestionID] = (SAMPLE_TASKS_[emp.Designation] || [['']])[2] ? SAMPLE_TASKS_[emp.Designation][2][0] : '';
      else if (/remains pending/i.test(t)) answers[q.QuestionID] = (SAMPLE_TASKS_[emp.Designation] || [['']]).slice(-1)[0][0];
      else if (/consumed the most time/i.test(t)) answers[q.QuestionID] = (SAMPLE_TASKS_[emp.Designation] || [['']])[0][0];
      else if (/biggest difficulty/i.test(t)) answers[q.QuestionID] = 'Waiting on inputs from another department';
      else if (/reason for the difficulty/i.test(t)) answers[q.QuestionID] = 'Information not shared on time';
      else if (/support do you need/i.test(t)) answers[q.QuestionID] = dayIndex % 3 === 0 ? 'Faster approvals on pending items' : '';
      else if (/priorities for tomorrow/i.test(t)) answers[q.QuestionID] = 'Complete pending ' + (SAMPLE_TASKS_[emp.Designation] || [['work']]).slice(-1)[0][0].toLowerCase() + '\nFollow up on open items\nPrepare daily report early';
      else if (/customers require follow-up/i.test(t)) answers[q.QuestionID] = 'ABC Interiors\nXYZ Hotels';
      else answers[q.QuestionID] = 'Handled as per plan';
    });
  });
  // Conditional follow-ups
  def.sections.forEach(function (s) { s.questions.forEach(function (q) { if (q.ConditionQuestionID && upper_(answers[q.ConditionQuestionID]) === upper_(q.ConditionValue)) answers[q.QuestionID] = q.QuestionType === 'NUMBER' ? 1 : 'Dependency on another department / approval'; }); });
  return answers;
}

function seedSampleData(force) {
  var sys = { email: 'seed', employeeId: 'SYSTEM', role: CONFIG.ROLES.SUPER_ADMIN, user: { name: 'Seeder' } };
  var existing = readTable_('EMPLOYEES');
  if (existing.some(function (e) { return /@example\.com$/.test(String(e.Email)); }) && !force) return 'Sample data already loaded. Pass force=true to add again.';
  var byEmail = {};
  existing.forEach(function (e) { byEmail[String(e.Email).toLowerCase()] = e; });
  // Employees (managers first so reporting links resolve)
  SAMPLE_EMPLOYEES_.forEach(function (s) {
    if (byEmail[s.email]) return;
    var r = employeesSave_(sys, { EmployeeName: s.name, Designation: s.designation, Email: s.email, Mobile: s.mobile, WhatsAppNumber: s.mobile, JoiningDate: '2025-04-01', Role: s.role || 'EMPLOYEE',
      ReportingManagerID: s.manager && byEmail[s.manager] ? byEmail[s.manager].EmployeeID : '' });
    byEmail[s.email] = findById_('EMPLOYEES', 'EmployeeID', r.data.employee.EmployeeID);
  });
  // Department managers
  var mgrs = { OPERATIONS: 'ankush.verma@example.com', ACCOUNTS: 'ankush.verma@example.com', 'E-COMMERCE': 'ankush.verma@example.com', PACKAGING: 'ankush.verma@example.com', GEM: 'ankush.verma@example.com',
    SALES: 'priya.nair@example.com', 'DIGITAL MARKETING': 'priya.nair@example.com', 'GRAPHICS DESIGNER': 'priya.nair@example.com', STORE: 'ankush.verma@example.com' };
  readTable_('DEPARTMENTS').forEach(function (d) { var m = mgrs[upper_(d.DepartmentName)]; if (m && byEmail[m] && !d.ManagerID) update_('DEPARTMENTS', 'DepartmentID', d.DepartmentID, { ManagerID: byEmail[m].EmployeeID }, sys); });
  clearCache_();

  // Three working days: today and the two previous days
  var days = [2, 1, 0].map(function (n) { return formatDate_(new Date(Date.now() - n * 86400000)); });
  var taskIdsByEmail = {};
  days.forEach(function (date, di) {
    var isToday = di === days.length - 1;
    SAMPLE_EMPLOYEES_.forEach(function (s, ei) {
      var emp = byEmail[s.email];
      var list = SAMPLE_TASKS_[s.designation] || [];
      var cursor = hhmmToMinutes_('09:30') + ((ei + di) % 3) * 15;
      var ids = [];
      list.forEach(function (t, ti) {
        var start = date + 'T' + pad2_(Math.floor(cursor / 60)) + ':' + pad2_(cursor % 60) + ':00';
        var endMin = cursor + t[2];
        if (ti === 2 && (di + ei) % 2 === 1) endMin = cursor + t[2] - 15; // some variety
        var end = date + 'T' + pad2_(Math.floor(endMin / 60)) + ':' + pad2_(endMin % 60) + ':00';
        var last = ti === list.length - 1;
        var status = last ? ((ei + di) % 3 === 0 ? 'PENDING' : (ei % 4 === 1 ? 'BLOCKED' : 'IN PROGRESS')) : 'COMPLETED';
        var isLastToday = isToday && last;
        var payload = { EmployeeID: emp.EmployeeID, Date: date, TaskTitle: t[0], TaskDescription: 'Sample task for ' + s.designation + ' on ' + formatDateDMY_(date), TaskCategory: t[1],
          Priority: ['MEDIUM', 'HIGH', 'LOW', 'URGENT'][(ti + ei) % 4], Status: status, CompletionPercent: status === 'COMPLETED' ? 100 : (status === 'IN PROGRESS' ? 60 : 20),
          RelatedDepartment: ti === 2 ? ['ACCOUNTS', 'SALES', 'OPERATIONS', 'PACKAGING'][ei % 4] : '', Remarks: ti === 0 ? 'Done as planned' : '',
          PendingReason: status !== 'COMPLETED' ? (status === 'BLOCKED' ? 'Waiting for inputs from another department' : 'Carried forward to next day') : '',
          ExpectedCompletionDate: status !== 'COMPLETED' ? formatDate_(new Date(parseDateTime_(date).getTime() + 86400000)) : '', ResponsibleDependency: status === 'BLOCKED' ? 'Other department' : '' };
        if (!(isLastToday && status === 'IN PROGRESS')) { payload.StartTime = start; payload.EndTime = end; }
        var r = tasksSave_(sys, payload);
        ids.push(r.data.task.TaskID);
        cursor = endMin + 15 + ((ti === 1) ? 45 : 0); // lunch after 2nd task
      });
      taskIdsByEmail[s.email + '|' + date] = ids;
      // Questionnaire answers
      var def = buildQuestionnaire_(emp);
      var answers = sampleAnswers_(emp, def, di);
      var submit = !(isToday && ei % 5 === 4); // a few employees have not submitted today
      questionnaireSave_(Object.assign({}, sys, { employeeId: emp.EmployeeID }), { employeeId: emp.EmployeeID, date: date, answers: answers, submit: submit });
      if (submit) {
        var ectx = { email: emp.Email, employeeId: emp.EmployeeID, role: emp.Role || 'EMPLOYEE', employee: emp, user: { name: emp.EmployeeName } };
        try { reportsSubmit_(ectx, { date: date, employeeRemarks: 'Productive day overall. Need quicker approvals on pending items.', confirmNoTasks: true }); } catch (e) { }
      }
    });
  });
  // Difficulties for today
  var today = days[days.length - 1];
  SAMPLE_DIFFICULTIES_.forEach(function (d) {
    var emp = byEmail[d.email];
    var ids = taskIdsByEmail[d.email + '|' + today] || [];
    difficultiesSave_({ email: emp.Email, employeeId: emp.EmployeeID, role: 'EMPLOYEE', employee: emp, user: { name: emp.EmployeeName } },
      { Date: today, TaskID: ids[d.task] || '', TaskName: ids[d.task] ? '' : 'General', ProblemDescription: d.problem, DifficultyLevel: d.level, Category: d.cat, Reason: d.problem, DelayMinutes: d.delay,
        DepartmentInvolved: d.dept, AssistanceRequired: d.assist || '', EscalationRequired: !!d.escalate, ResponsibleDependency: d.dept || 'Customer' });
  });
  // Manager remarks on a couple of reports + one approval
  var priya = byEmail['priya.nair@example.com'], rahul = byEmail['rahul.sharma@example.com'];
  var mctx = { email: priya.Email, employeeId: priya.EmployeeID, role: 'DEPARTMENT_MANAGER', employee: priya, user: { name: priya.EmployeeName } };
  var rep = findOne_('DAILY_REPORTS', function (r) { return r.EmployeeID === rahul.EmployeeID && r.Date === days[0]; });
  if (rep) { reportsManagerRemark_(mctx, { reportId: rep.ReportID, remarks: 'Good follow-up discipline. Close the Sharma Interiors quotation by tomorrow.', actionPoints: 'Escalate pricing approval\nShare lost-order reasons', rating: 4 }); reportsApprove_(mctx, { reportId: rep.ReportID }); }
  // Department summaries for today
  readTable_('DEPARTMENTS').forEach(function (d) { try { buildDepartmentSummary_(d.DepartmentName, today, sys); } catch (e) { } });
  clearCache_();
  logActivity_(sys, 'SAMPLE_DATA_LOADED', 'SYSTEM', '', { employees: SAMPLE_EMPLOYEES_.length, days: days });
  return 'Sample data loaded: ' + SAMPLE_EMPLOYEES_.length + ' employees, ' + days.length + ' days of tasks, questionnaires, reports and difficulties.';
}

/** Danger: removes all sample (@example.com) employees and their data. */
function removeSampleData() {
  var emps = readTable_('EMPLOYEES').filter(function (e) { return /@example\.com$/.test(String(e.Email)); });
  var ids = emps.map(function (e) { return e.EmployeeID; });
  var tables = ['TASK_ENTRIES', 'TASK_TIME_LOGS', 'DAILY_RESPONSES', 'DIFFICULTIES', 'DELAY_TRACKER', 'DAILY_REPORTS', 'MANAGER_REMARKS', 'AUTH_SESSIONS'];
  tables.forEach(function (t) {
    var sh = sheet_(t);
    var rows = readTable_(t, { noCache: true }).filter(function (r) { return ids.indexOf(r.EmployeeID) !== -1; });
    rows.sort(function (a, b) { return b._row - a._row; }).forEach(function (r) { sh.deleteRow(r._row); });
  });
  var sh = sheet_('EMPLOYEES');
  emps.sort(function (a, b) { return b._row - a._row; }).forEach(function (e) { sh.deleteRow(e._row); });
  readTable_('DEPARTMENTS').forEach(function (d) { if (ids.indexOf(d.ManagerID) !== -1) update_('DEPARTMENTS', 'DepartmentID', d.DepartmentID, { ManagerID: '' }); });
  clearCache_();
  return 'Removed ' + emps.length + ' sample employees and their data.';
}
