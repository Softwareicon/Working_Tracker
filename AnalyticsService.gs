/**
 * AnalyticsService.gs — Admin dashboard, management analytics charts and bottleneck analysis.
 * All aggregation respects visibility: admins see everything, managers their team, employees themselves.
 */

function analyticsScope_(ctx, p) {
  p = p || {};
  var from = p.dateFrom ? requireDate_(p.dateFrom) : formatDate_(new Date(Date.now() - 13 * 86400000));
  var to = p.dateTo ? requireDate_(p.dateTo) : today_();
  if (from > to) { var x = from; from = to; to = x; }
  var emps = visibleEmployees_(ctx);
  if (p.department) emps = emps.filter(function (e) { return upper_(e.Department) === upper_(p.department); });
  if (p.designation) emps = emps.filter(function (e) { return upper_(e.Designation) === upper_(p.designation); });
  if (p.employeeId) emps = emps.filter(function (e) { return e.EmployeeID === p.employeeId; });
  if (p.managerId) emps = emps.filter(function (e) { return e.ReportingManagerID === p.managerId; });
  var ids = {};
  emps.forEach(function (e) { ids[e.EmployeeID] = e; });
  var inScope = function (r) { return ids[r.EmployeeID] && r.Date >= from && r.Date <= to; };
  var tasks = readTable_('TASK_ENTRIES').filter(inScope);
  if (p.status) tasks = tasks.filter(function (t) { return upper_(t.Status) === upper_(p.status); });
  var reports = readTable_('DAILY_REPORTS').filter(inScope);
  var difficulties = readTable_('DIFFICULTIES').filter(inScope);
  var delays = readTable_('DELAY_TRACKER').filter(inScope);
  return { from: from, to: to, employees: emps, ids: ids, tasks: tasks, reports: reports, difficulties: difficulties, delays: delays, days: dateRange_(from, to) };
}

function countBy_(list, keyFn) {
  var g = {};
  list.forEach(function (x) { var k = keyFn(x); if (k === undefined || k === null || k === '') k = 'Unspecified'; g[k] = (g[k] || 0) + 1; });
  return g;
}

function sumBy_(list, keyFn, valFn) {
  var g = {};
  list.forEach(function (x) { var k = keyFn(x) || 'Unspecified'; g[k] = (g[k] || 0) + toNum_(valFn(x)); });
  return g;
}

function toSeries_(obj, order) {
  var keys = order || sortBy_(Object.keys(obj), function (k) { return obj[k]; }, true);
  return { labels: keys, values: keys.map(function (k) { return obj[k] || 0; }) };
}

/** Admin dashboard (company overview, department performance, employee performance). */
function analyticsDashboard_(ctx, p) {
  p = p || {};
  var date = p.date ? requireDate_(p.date) : today_();
  var scope = analyticsScope_(ctx, { dateFrom: p.dateFrom || date, dateTo: p.dateTo || date, department: p.department, designation: p.designation, employeeId: p.employeeId, managerId: p.managerId, status: p.status });
  var active = scope.employees.filter(function (e) { return upper_(e.Status) === 'ACTIVE'; });
  var activeIds = active.map(function (e) { return e.EmployeeID; });
  var submittedKeys = {};
  scope.reports.forEach(function (r) { if (['SUBMITTED', 'APPROVED'].indexOf(r.Status) !== -1) submittedKeys[r.EmployeeID + '|' + r.Date] = 1; });
  var submittedToday = Object.keys(submittedKeys).filter(function (k) { return k.split('|')[1] === scope.to && activeIds.indexOf(k.split('|')[0]) !== -1; }).length;
  var st = function (list, s) { return list.filter(function (t) { return upper_(t.Status) === s; }).length; };
  var overview = {
    totalEmployees: scope.employees.length, activeEmployees: active.length, reportsSubmittedToday: submittedToday, reportsPendingToday: Math.max(0, active.length - submittedToday),
    totalTasks: scope.tasks.length, completedTasks: st(scope.tasks, 'COMPLETED'), inProgressTasks: st(scope.tasks, 'IN PROGRESS'), pendingTasks: st(scope.tasks, 'PENDING') + st(scope.tasks, 'ON HOLD'), blockedTasks: st(scope.tasks, 'BLOCKED'),
    openDifficulties: scope.difficulties.filter(function (d) { return upper_(d.ResolutionStatus) !== 'RESOLVED'; }).length,
    recordedMinutes: scope.tasks.reduce(function (n, t) { return n + toNum_(t.TimeSpentMinutes); }, 0), date: scope.to, dateFrom: scope.from, dateTo: scope.to
  };
  // Department performance (all departments, even those with no data in range)
  var depts = readTable_('DEPARTMENTS').filter(function (d) { return toBool_(d.Active); }).map(function (d) { return upper_(d.DepartmentName); });
  if (isManager_(ctx)) depts = uniq_(scope.employees.map(function (e) { return upper_(e.Department); }));
  var daysCount = scope.days.length || 1;
  var departments = depts.map(function (dn) {
    var emps = active.filter(function (e) { return upper_(e.Department) === dn; });
    var eids = emps.map(function (e) { return e.EmployeeID; });
    var tasks = scope.tasks.filter(function (t) { return eids.indexOf(t.EmployeeID) !== -1; });
    var reports = scope.reports.filter(function (r) { return eids.indexOf(r.EmployeeID) !== -1 && ['SUBMITTED', 'APPROVED'].indexOf(r.Status) !== -1; });
    var diffs = scope.difficulties.filter(function (d) { return eids.indexOf(d.EmployeeID) !== -1; });
    var cat = countBy_(diffs, function (d) { return d.Category; });
    var rates = reports.map(function (r) { return toNum_(r.CompletionRate); });
    return { department: dn, totalEmployees: emps.length, reportsSubmitted: reports.length, expectedReports: emps.length * daysCount, submissionRate: pct_(reports.length, emps.length * daysCount),
      tasksCompleted: st(tasks, 'COMPLETED'), tasksPending: tasks.length - st(tasks, 'COMPLETED'), tasksBlocked: st(tasks, 'BLOCKED'), totalTasks: tasks.length,
      avgCompletionRate: rates.length ? Math.round(rates.reduce(function (a, b) { return a + b; }, 0) / rates.length * 10) / 10 : pct_(st(tasks, 'COMPLETED'), tasks.length),
      majorDifficulties: sortBy_(Object.keys(cat), function (k) { return cat[k]; }, true).slice(0, 3).map(function (k) { return k + ' (' + cat[k] + ')'; }),
      totalRecordedMinutes: tasks.reduce(function (n, t) { return n + toNum_(t.TimeSpentMinutes); }, 0), openDifficulties: diffs.filter(function (d) { return upper_(d.ResolutionStatus) !== 'RESOLVED'; }).length };
  });
  // Employee performance
  var employees = scope.employees.map(function (e) {
    var tasks = scope.tasks.filter(function (t) { return t.EmployeeID === e.EmployeeID; });
    var reps = scope.reports.filter(function (r) { return r.EmployeeID === e.EmployeeID; });
    var latest = reps.filter(function (r) { return r.Date === scope.to; })[0];
    var submitted = reps.filter(function (r) { return ['SUBMITTED', 'APPROVED'].indexOf(r.Status) !== -1; }).length;
    return { EmployeeID: e.EmployeeID, EmployeeName: e.EmployeeName, Department: upper_(e.Department), Designation: e.Designation, Status: upper_(e.Status), ReportingManagerName: e.ReportingManagerName,
      totalTasks: tasks.length, completedTasks: st(tasks, 'COMPLETED'), pendingTasks: tasks.length - st(tasks, 'COMPLETED'), blockedTasks: st(tasks, 'BLOCKED'),
      recordedMinutes: tasks.reduce(function (n, t) { return n + toNum_(t.TimeSpentMinutes); }, 0), completionRate: pct_(st(tasks, 'COMPLETED'), tasks.length),
      submissionStatus: latest ? latest.Status : (tasks.some(function (t) { return t.Date === scope.to; }) ? 'INCOMPLETE' : 'NOT_STARTED'), submittedDays: submitted, expectedDays: daysCount,
      latestReportId: latest ? latest.ReportID : '', openDifficulties: scope.difficulties.filter(function (d) { return d.EmployeeID === e.EmployeeID && upper_(d.ResolutionStatus) !== 'RESOLVED'; }).length };
  });
  // Trend for the dashboard sparkline (last 14 days regardless of filter window)
  var trend = analyticsTrend_(ctx, { dateFrom: formatDate_(new Date(parseDateTime_(scope.to).getTime() - 13 * 86400000)), dateTo: scope.to, department: p.department, employeeId: p.employeeId, managerId: p.managerId, designation: p.designation });
  return ok_({ overview: overview, departments: departments, employees: sortBy_(employees, function (e) { return e.EmployeeName; }), trend: trend,
    recentDifficulties: sortBy_(scope.difficulties.filter(function (d) { return upper_(d.ResolutionStatus) !== 'RESOLVED'; }).map(difficultyView_), function (d) { return d.Date + d.CreatedAt; }, true).slice(0, 8) });
}

function analyticsTrend_(ctx, p) {
  var scope = analyticsScope_(ctx, p);
  var activeCount = scope.employees.filter(function (e) { return upper_(e.Status) === 'ACTIVE'; }).length || 1;
  return scope.days.map(function (d) {
    var tasks = scope.tasks.filter(function (t) { return t.Date === d; });
    var reports = scope.reports.filter(function (r) { return r.Date === d && ['SUBMITTED', 'APPROVED'].indexOf(r.Status) !== -1; });
    var completed = tasks.filter(function (t) { return upper_(t.Status) === 'COMPLETED'; }).length;
    return { date: d, label: formatDateDMY_(d).substring(0, 5), tasks: tasks.length, completed: completed, completionRate: pct_(completed, tasks.length),
      recordedMinutes: tasks.reduce(function (n, t) { return n + toNum_(t.TimeSpentMinutes); }, 0), submitted: reports.length, submissionRate: pct_(reports.length, activeCount) };
  });
}

/** Chart datasets for the Analytics module. */
function analyticsCharts_(ctx, p) {
  var scope = analyticsScope_(ctx, p);
  var completed = function (t) { return upper_(t.Status) === 'COMPLETED'; };
  var deptOrder = uniq_(readTable_('DEPARTMENTS').filter(function (d) { return toBool_(d.Active); }).map(function (d) { return upper_(d.DepartmentName); }));
  if (isManager_(ctx)) deptOrder = uniq_(scope.employees.map(function (e) { return upper_(e.Department); }));
  var byDeptTotal = countBy_(scope.tasks, function (t) { return upper_(t.Department); });
  var byDeptDone = countBy_(scope.tasks.filter(completed), function (t) { return upper_(t.Department); });
  var byDeptPending = countBy_(scope.tasks.filter(function (t) { return !completed(t); }), function (t) { return upper_(t.Department); });
  var empName = function (id) { return scope.ids[id] ? scope.ids[id].EmployeeName : id; };
  var byEmpTotal = countBy_(scope.tasks, function (t) { return empName(t.EmployeeID); });
  var byEmpDone = countBy_(scope.tasks.filter(completed), function (t) { return empName(t.EmployeeID); });
  var empOrder = sortBy_(Object.keys(byEmpTotal), function (k) { return byEmpTotal[k]; }, true).slice(0, 15);
  var trend = analyticsTrend_(ctx, p);
  var catMinutes = sumBy_(scope.tasks, function (t) { return t.TaskCategory; }, function (t) { return t.TimeSpentMinutes; });
  var diffCat = countBy_(scope.difficulties, function (d) { return d.Category; });
  var delayType = countBy_(scope.delays.length ? scope.delays : scope.difficulties, function (d) { return upper_(d.DelayType); });
  var delayReason = countBy_(scope.delays, function (d) { return d.DelayReason; });
  var priority = countBy_(scope.tasks, function (t) { return upper_(t.Priority); });
  var dependency = {};
  scope.difficulties.forEach(function (d) { if (d.DepartmentInvolved) { var k = upper_(d.Department) + ' → ' + upper_(d.DepartmentInvolved); dependency[k] = (dependency[k] || 0) + 1; } });
  var relDep = {};
  scope.tasks.forEach(function (t) { if (t.RelatedDepartment) { var k = upper_(t.Department) + ' → ' + upper_(t.RelatedDepartment); relDep[k] = (relDep[k] || 0) + 1; } });
  var activeCount = scope.employees.filter(function (e) { return upper_(e.Status) === 'ACTIVE'; }).length;
  var submissionByEmp = {};
  scope.employees.forEach(function (e) { submissionByEmp[e.EmployeeName] = scope.reports.filter(function (r) { return r.EmployeeID === e.EmployeeID && ['SUBMITTED', 'APPROVED'].indexOf(r.Status) !== -1; }).length; });
  var submissionRate = {};
  Object.keys(submissionByEmp).forEach(function (k) { submissionRate[k] = pct_(submissionByEmp[k], scope.days.length || 1); });
  // Time utilisation (sum over reports)
  var util = { Recorded: 0, Unallocated: 0, Break: 0 };
  scope.reports.forEach(function (r) { util.Recorded += toNum_(r.RecordedMinutes); util.Unallocated += toNum_(r.UnallocatedMinutes); });
  util.Break = scope.reports.reduce(function (n, r) { return n + Math.max(0, toNum_(r.WorkingMinutes) - toNum_(r.RecordedMinutes) - toNum_(r.UnallocatedMinutes)); }, 0);
  return ok_({
    dateFrom: scope.from, dateTo: scope.to, employeeCount: activeCount, taskCount: scope.tasks.length,
    departmentCompletion: { labels: deptOrder, completed: deptOrder.map(function (d) { return byDeptDone[d] || 0; }), total: deptOrder.map(function (d) { return byDeptTotal[d] || 0; }) },
    employeeCompletion: { labels: empOrder, completed: empOrder.map(function (k) { return byEmpDone[k] || 0; }), total: empOrder.map(function (k) { return byEmpTotal[k] || 0; }) },
    productivityTrend: { labels: trend.map(function (t) { return t.label; }), completionRate: trend.map(function (t) { return t.completionRate; }), tasks: trend.map(function (t) { return t.tasks; }), completed: trend.map(function (t) { return t.completed; }), hours: trend.map(function (t) { return Math.round(t.recordedMinutes / 6) / 10; }) },
    timeUtilization: toSeries_(util, ['Recorded', 'Unallocated', 'Break']),
    categoryTime: toSeries_(catMinutes),
    departmentPending: { labels: deptOrder, values: deptOrder.map(function (d) { return byDeptPending[d] || 0; }) },
    difficultyCategories: toSeries_(diffCat),
    delayTypes: toSeries_(delayType, CONFIG.DELAY_TYPES),
    delayReasons: toSeries_(delayReason),
    submissionRate: { labels: Object.keys(submissionRate), values: Object.keys(submissionRate).map(function (k) { return submissionRate[k]; }), days: scope.days.length },
    priorityDistribution: toSeries_(priority, CONFIG.TASK_PRIORITIES),
    dependencies: toSeries_(Object.keys(dependency).length ? dependency : relDep)
  });
}

/** Bottleneck analysis for the Analytics module (and manager dashboards). */
function analyticsBottlenecks_(ctx, p) {
  var scope = analyticsScope_(ctx, p);
  var completed = function (t) { return upper_(t.Status) === 'COMPLETED'; };
  var top = function (obj, n) { return sortBy_(Object.keys(obj), function (k) { return obj[k]; }, true).slice(0, n || 8).map(function (k) { return { key: k, value: obj[k] }; }); };
  var deptDiff = countBy_(scope.difficulties, function (d) { return upper_(d.Department); });
  var catMinutes = sumBy_(scope.tasks, function (t) { return t.TaskCategory; }, function (t) { return t.TimeSpentMinutes; });
  var dep = countBy_(scope.difficulties.filter(function (d) { return d.ResponsibleDependency || d.DepartmentInvolved; }), function (d) { return d.ResponsibleDependency || d.DepartmentInvolved; });
  var unresolved = scope.difficulties.filter(function (d) { return upper_(d.ResolutionStatus) !== 'RESOLVED'; }).map(difficultyView_).map(function (d) { d.AgeDays = Math.round((Date.now() - parseDateTime_(d.Date).getTime()) / 86400000); return d; });
  var pendingTitles = countBy_(scope.tasks.filter(function (t) { return !completed(t); }), function (t) { return t.TaskTitle; });
  var frequentlyPending = top(pendingTitles, 10).filter(function (x) { return x.value > 1; });
  var blockedByDept = countBy_(scope.tasks.filter(function (t) { return upper_(t.Status) === 'BLOCKED'; }), function (t) { return upper_(t.Department); });
  var delayMinutesByDept = sumBy_(scope.difficulties, function (d) { return upper_(d.DepartmentInvolved) || 'Unspecified'; }, function (d) { return d.DelayMinutes; });
  var insights = [];
  var d1 = top(deptDiff, 1)[0]; if (d1) insights.push(d1.key + ' reports the most difficulties (' + d1.value + ').');
  var c1 = top(catMinutes, 1)[0]; if (c1) insights.push('"' + c1.key + '" consumes the most time (' + formatDuration_(c1.value) + ').');
  var p1 = top(dep, 1)[0]; if (p1) insights.push('"' + p1.key + '" is the most frequent delaying dependency (' + p1.value + ' times).');
  if (unresolved.length) insights.push(unresolved.length + ' difficulties remain unresolved; oldest is ' + Math.max.apply(null, unresolved.map(function (u) { return u.AgeDays; })) + ' day(s) old.');
  if (frequentlyPending.length) insights.push('"' + frequentlyPending[0].key + '" keeps appearing as pending (' + frequentlyPending[0].value + ' times).');
  return ok_({
    dateFrom: scope.from, dateTo: scope.to, insights: insights,
    departmentsMostDifficulties: top(deptDiff), categoriesMostTime: top(catMinutes).map(function (x) { x.label = formatDuration_(x.value); return x; }),
    repeatDependencies: top(dep), unresolved: sortBy_(unresolved, function (u) { return u.AgeDays; }, true).slice(0, 50), frequentlyPending: frequentlyPending,
    blockedByDepartment: top(blockedByDept), delayMinutesByDepartmentInvolved: top(delayMinutesByDept).map(function (x) { x.label = formatDuration_(x.value); return x; })
  });
}

/** Activity logs (admin). */
function logsList_(ctx, p) {
  requireAdmin_(ctx);
  p = p || {};
  var logs = readTable_('ACTIVITY_LOGS');
  if (p.employeeId) logs = logs.filter(function (l) { return l.EmployeeID === p.employeeId; });
  if (p.action) logs = logs.filter(function (l) { return String(l.Action).indexOf(upper_(p.action)) !== -1; });
  if (p.dateFrom) logs = logs.filter(function (l) { return String(l.Timestamp).substring(0, 10) >= p.dateFrom; });
  if (p.dateTo) logs = logs.filter(function (l) { return String(l.Timestamp).substring(0, 10) <= p.dateTo; });
  logs = sortBy_(logs, function (l) { return l.Timestamp; }, true).slice(0, toNum_(p.limit, 300));
  return ok_({ logs: logs.map(function (l) { var o = {}; Object.keys(l).forEach(function (k) { if (k.charAt(0) !== '_') o[k] = l[k]; }); return o; }) });
}
