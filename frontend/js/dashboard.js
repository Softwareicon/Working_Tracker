/**
 * dashboard.js — Admin / manager dashboard and the employee "My day" dashboard.
 */
var Dashboard = {
  charts: {},
  destroyCharts: function () { Object.keys(Dashboard.charts).forEach(function (k) { try { Dashboard.charts[k].destroy(); } catch (e) { } }); Dashboard.charts = {}; },

  render: function (el, q) {
    Dashboard.destroyCharts();
    if (App.isManagerUp()) return Dashboard.renderAdmin(el, q);
    return Dashboard.renderEmployee(el, q);
  },

  renderAdmin: function (el, q) {
    var f = { dateFrom: q.dateFrom || U.today(), dateTo: q.dateTo || U.today(), department: q.department || '', designation: q.designation || '', employeeId: q.employeeId || '', managerId: q.managerId || '', status: q.status || '' };
    var boot = App.state.boot;
    var managers = boot.employees.filter(function (e) { return ['DEPARTMENT_MANAGER', 'ADMIN', 'SUPER_ADMIN'].indexOf(e.Role) !== -1; });
    el.innerHTML = '<div class="page-head"><div><h1>Hello, ' + U.esc(App.state.user.name.split(' ')[0]) + ' 👋</h1><div class="sub">Company overview, department performance and employee submissions.</div></div>' +
      '<div class="actions-right"><button class="btn btn-outline-primary btn-sm" data-mgmt><i class="bi bi-whatsapp me-1"></i>Management summary</button> <button class="btn btn-primary btn-sm" onclick="App.go(\'#/tracker\')"><i class="bi bi-journal-check me-1"></i>My tracker</button></div></div>' +
      App.filterBar([
        { name: 'dateFrom', label: 'From', type: 'date', value: f.dateFrom }, { name: 'dateTo', label: 'To', type: 'date', value: f.dateTo },
        { name: 'department', label: 'Department', type: 'select', options: App.deptOptions(), value: f.department },
        { name: 'designation', label: 'Designation', type: 'select', options: boot.designations.map(function (d) { return d.name; }), value: f.designation },
        { name: 'employeeId', label: 'Employee', type: 'select', options: App.employeeOptions(), value: f.employeeId },
        { name: 'status', label: 'Task status', type: 'select', options: boot.lists.taskStatuses, value: f.status },
        { name: 'managerId', label: 'Reporting manager', type: 'select', options: managers.map(function (m) { return { value: m.EmployeeID, label: m.EmployeeName }; }), value: f.managerId }
      ]) + '<div id="dash-body"><div class="text-center py-5 text-muted"><div class="spinner-border spinner-border-sm me-2"></div>Loading…</div></div>';
    U.qs('[data-apply]', el).addEventListener('click', function () { App.go('#/dashboard', U.formData(U.qs('[data-filters]', el))); });
    U.qs('[data-mgmt]', el).addEventListener('click', function () {
      if (!App.isAdmin()) { App.toast('Admin access required', 'warning'); return; }
      API.call('reports.management', { date: f.dateTo }).then(function (d) { Share.dialog({ type: 'department', text: d.whatsapp, title: 'Management summary' }); });
    });
    return API.call('analytics.dashboard', f).then(function (d) {
      var o = d.overview;
      var body = U.qs('#dash-body', el);
      var kpis = '<div class="kpi-grid">' +
        App.kpi('Total Employees', o.totalEmployees, o.activeEmployees + ' active', 'navy', 'bi-people') +
        App.kpi('Reports Submitted', o.reportsSubmittedToday, 'for ' + U.dmy(o.date), 'good', 'bi-file-earmark-check') +
        App.kpi('Reports Pending', o.reportsPendingToday, 'not yet submitted', o.reportsPendingToday ? 'warn' : 'good', 'bi-hourglass-split') +
        App.kpi('Total Tasks', o.totalTasks, U.dur(o.recordedMinutes) + ' recorded', 'navy', 'bi-list-task') +
        App.kpi('Completed', o.completedTasks, U.pct(o.totalTasks ? o.completedTasks / o.totalTasks * 100 : 0) + ' completion', 'good', 'bi-check2-circle') +
        App.kpi('In Progress', o.inProgressTasks, '', '', 'bi-arrow-repeat') +
        App.kpi('Pending', o.pendingTasks, '', 'warn', 'bi-clock') +
        App.kpi('Blocked', o.blockedTasks, o.openDifficulties + ' open difficulties', o.blockedTasks ? 'bad' : '', 'bi-slash-circle') + '</div>';
      var trend = '<div class="row g-3 mb-3"><div class="col-lg-8"><div class="card chart-card"><div class="card-header"><i class="bi bi-graph-up"></i>Daily productivity trend (14 days)<span class="ms-auto small text-muted">completion rate & submissions</span></div><div class="card-body"><div class="chart-box"><canvas id="dash-trend"></canvas></div></div></div></div>' +
        '<div class="col-lg-4"><div class="card chart-card"><div class="card-header"><i class="bi bi-exclamation-triangle"></i>Open difficulties</div><div class="card-body p-0">' +
        (d.recentDifficulties.length ? '<div class="list-group list-group-flush">' + d.recentDifficulties.map(function (x) { return '<a href="#/difficulty" class="list-group-item list-group-item-action py-2"><div class="d-flex justify-content-between"><b class="small">' + U.esc(x.EmployeeName) + '</b>' + U.st(x.DifficultyLevel) + '</div><div class="small text-muted text-truncate">' + U.esc(x.TaskName) + ' — ' + U.esc(x.ProblemDescription) + '</div><div class="small-muted">' + U.esc(x.Category) + (x.DepartmentInvolved ? ' · against ' + U.esc(x.DepartmentInvolved) : '') + ' · ' + U.dmy(x.Date) + '</div></a>'; }).join('') + '</div>' : App.empty('No open difficulties', 'bi-emoji-smile')) + '</div></div></div></div>';
      var depts = '<div class="card mb-3"><div class="card-header"><i class="bi bi-diagram-3"></i>Department performance<span class="ms-auto small text-muted">click a department to drill down</span></div><div class="card-body"><div class="row g-3">' +
        d.departments.map(function (x) {
          return '<div class="col-md-6 col-xl-3"><div class="dept-card" data-dept="' + U.attr(x.department) + '"><div class="d-flex justify-content-between align-items-center mb-2"><div class="dn">' + U.esc(x.department) + '</div><span class="badge text-bg-light">' + x.totalEmployees + ' emp</span></div>' +
            '<div class="row-kv"><span>Reports submitted</span><b>' + x.reportsSubmitted + '/' + x.expectedReports + '</b></div><div class="row-kv"><span>Tasks completed</span><b>' + x.tasksCompleted + '/' + x.totalTasks + '</b></div><div class="row-kv"><span>Tasks pending</span><b>' + x.tasksPending + '</b></div><div class="row-kv"><span>Avg completion</span><b>' + U.pct(x.avgCompletionRate) + '</b></div><div class="row-kv"><span>Recorded hours</span><b>' + U.dur(x.totalRecordedMinutes) + '</b></div>' +
            '<div class="progress mt-2"><div class="progress-bar" style="width:' + Math.min(100, x.avgCompletionRate) + '%"></div></div>' +
            '<div class="small-muted mt-2 text-truncate" title="' + U.attr(x.majorDifficulties.join(', ')) + '">' + (x.majorDifficulties.length ? '<i class="bi bi-exclamation-circle me-1"></i>' + U.esc(x.majorDifficulties.join(', ')) : 'No difficulties reported') + '</div></div></div>';
        }).join('') + '</div></div></div>';
      var emps = '<div class="card"><div class="card-header"><i class="bi bi-person-lines-fill"></i>Employee performance<span class="ms-auto small text-muted">' + d.employees.length + ' employees · ' + U.dmy(d.overview.dateFrom) + ' – ' + U.dmy(d.overview.dateTo) + '</span></div><div class="table-wrap"><table class="table table-hover"><thead><tr><th>Employee</th><th>Department</th><th>Designation</th><th class="text-center">Tasks</th><th class="text-center">Completed</th><th class="text-center">Pending</th><th class="text-center">Hours</th><th class="text-center">Completion</th><th>Submission</th></tr></thead><tbody>' +
        (d.employees.length ? d.employees.map(function (e) { return '<tr class="clickable" data-emp="' + U.attr(e.EmployeeID) + '"><td><div class="d-flex align-items-center gap-2"><div class="avatar sm">' + U.esc(U.initials(e.EmployeeName)) + '</div><div><div class="fw-semibold">' + U.esc(e.EmployeeName) + '</div><div class="small-muted">' + U.esc(e.EmployeeID) + '</div></div></div></td><td>' + U.esc(e.Department) + '</td><td>' + U.esc(e.Designation) + '</td><td class="text-center">' + e.totalTasks + '</td><td class="text-center text-success fw-semibold">' + e.completedTasks + '</td><td class="text-center">' + e.pendingTasks + '</td><td class="text-center">' + U.dur(e.recordedMinutes) + '</td><td class="text-center">' + U.pct(e.completionRate) + '</td><td>' + U.st(e.submissionStatus) + '</td></tr>'; }).join('') : '<tr><td colspan="9">' + App.empty('No employees match the filters') + '</td></tr>') + '</tbody></table></div></div>';
      body.innerHTML = kpis + trend + depts + emps;
      U.qsa('[data-dept]', body).forEach(function (c) { c.addEventListener('click', function () { App.go('#/department-reports', { department: c.getAttribute('data-dept'), date: f.dateTo }); }); });
      U.qsa('[data-emp]', body).forEach(function (r) { r.addEventListener('click', function () { App.go('#/reports', { employeeId: r.getAttribute('data-emp'), dateFrom: f.dateFrom, dateTo: f.dateTo }); }); });
      Dashboard.charts.trend = new Chart(U.qs('#dash-trend', body), { type: 'line', data: { labels: d.trend.map(function (t) { return t.label; }), datasets: [
        { label: 'Completion rate %', data: d.trend.map(function (t) { return t.completionRate; }), borderColor: CHART_COLORS[0], backgroundColor: CHART_COLORS[0], tension: .3, pointRadius: 3, borderWidth: 2 },
        { label: 'Submission rate %', data: d.trend.map(function (t) { return t.submissionRate; }), borderColor: CHART_COLORS[2], backgroundColor: CHART_COLORS[2], tension: .3, pointRadius: 3, borderWidth: 2 }] },
        options: Analytics.lineOpts({ max: 100 }) });
    });
  },

  renderEmployee: function (el) {
    var u = App.state.user, today = U.today();
    el.innerHTML = '<div class="page-head"><div><h1>Hello, ' + U.esc(u.name.split(' ')[0]) + ' 👋</h1><div class="sub">' + U.esc(U.longDate(today)) + ' · ' + U.esc(u.designation) + ' · <b>' + U.esc(u.department) + '</b> (auto-assigned)</div></div><div class="actions-right"><button class="btn btn-primary" onclick="App.go(\'#/tracker\')"><i class="bi bi-journal-check me-1"></i>Open today\'s tracker</button></div></div><div id="dash-body"></div>';
    return Promise.all([
      API.call('reports.get', { employeeId: u.employeeId, date: today, live: true }),
      API.call('reports.mine', { dateFrom: U.addDays(today, -13), dateTo: today }),
      API.call('difficulties.list', { employeeId: u.employeeId, dateFrom: U.addDays(today, -30), dateTo: today, status: 'OPEN' })
    ]).then(function (res) {
      var r = res[0].report, s = r.summary, hist = res[1].reports, diffs = res[2].difficulties.concat();
      var body = U.qs('#dash-body', el);
      var status = r.status;
      body.innerHTML = '<div class="kpi-grid">' +
        App.kpi("Today's status", U.st(status), r.questionnaireStatus === 'SUBMITTED' ? 'questionnaire submitted' : 'questionnaire ' + r.questionnaireStatus.toLowerCase().replace('_', ' '), '', 'bi-flag') +
        App.kpi('Tasks today', s.totalTasks, s.completed + ' completed · ' + (s.inProgress) + ' in progress', 'navy', 'bi-list-task') +
        App.kpi('Recorded time', U.dur(s.recordedMinutes), 'of ' + U.dur(s.workingMinutes) + ' working time', 'good', 'bi-stopwatch') +
        App.kpi('Unallocated', U.dur(s.unallocatedMinutes), 'after ' + U.dur(s.breakMinutes) + ' break', s.unallocatedMinutes > 120 ? 'warn' : '', 'bi-hourglass') +
        App.kpi('Pending / blocked', (s.pending + s.onHold) + ' / ' + s.blocked, '', s.blocked ? 'bad' : '', 'bi-slash-circle') + '</div>' +
        '<div class="row g-3"><div class="col-lg-7"><div class="card mb-3"><div class="card-header"><i class="bi bi-lightning"></i>Quick actions</div><div class="card-body d-flex flex-wrap gap-2">' +
        '<button class="btn btn-primary" onclick="App.go(\'#/tracker\')"><i class="bi bi-plus-circle me-1"></i>Add task / start timer</button><button class="btn btn-outline-primary" onclick="App.go(\'#/tracker\',{tab:\'questionnaire\'})"><i class="bi bi-ui-checks me-1"></i>Fill questionnaire</button><button class="btn btn-outline-primary" onclick="App.go(\'#/difficulty\')"><i class="bi bi-exclamation-triangle me-1"></i>Report a difficulty</button><button class="btn btn-outline-primary" onclick="App.go(\'#/reports\',{employeeId:\'' + u.employeeId + '\',date:\'' + today + '\',open:1})"><i class="bi bi-file-earmark-text me-1"></i>View today\'s report</button></div></div>' +
        '<div class="card"><div class="card-header"><i class="bi bi-clock-history"></i>Today\'s timeline</div><div class="card-body">' + Tracker.timelineHtml(r.time) + '</div></div></div>' +
        '<div class="col-lg-5"><div class="card mb-3"><div class="card-header"><i class="bi bi-calendar-week"></i>Last 14 days</div><div class="table-wrap"><table class="table table-sm"><thead><tr><th>Date</th><th>Status</th><th class="text-center">Tasks</th><th class="text-center">Done</th><th class="text-center">Hours</th></tr></thead><tbody>' +
        hist.map(function (h) { return '<tr class="clickable" onclick="App.go(\'#/reports\',{employeeId:\'' + u.employeeId + '\',date:\'' + h.Date + '\',open:1})"><td>' + U.dmy(h.Date) + '</td><td>' + U.st(h.Status) + '</td><td class="text-center">' + h.TotalTasks + '</td><td class="text-center">' + h.CompletedTasks + '</td><td class="text-center">' + U.dur(h.RecordedMinutes) + '</td></tr>'; }).join('') + '</tbody></table></div></div>' +
        '<div class="card"><div class="card-header"><i class="bi bi-exclamation-triangle"></i>My open difficulties</div><div class="card-body p-0">' + (diffs.length ? '<div class="list-group list-group-flush">' + diffs.slice(0, 6).map(function (x) { return '<a href="#/difficulty" class="list-group-item list-group-item-action py-2"><div class="d-flex justify-content-between"><b class="small">' + U.esc(x.TaskName) + '</b>' + U.st(x.ResolutionStatus) + '</div><div class="small text-muted">' + U.esc(x.ProblemDescription) + '</div></a>'; }).join('') + '</div>' : App.empty('No open difficulties', 'bi-emoji-smile')) + '</div></div></div></div>';
    });
  }
};
App.views['#/dashboard'] = Dashboard.render;
