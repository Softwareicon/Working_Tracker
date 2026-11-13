/**
 * analytics.js — Management analytics: 10 charts + bottleneck analysis with drill-down.
 */
var Analytics = {
  charts: [],
  destroy: function () { Analytics.charts.forEach(function (c) { try { c.destroy(); } catch (e) { } }); Analytics.charts = []; },
  baseOpts: function () { return { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, font: { size: 11 } } }, tooltip: { backgroundColor: '#102640', padding: 10, cornerRadius: 8 } }, scales: { x: { grid: { display: false }, ticks: { font: { size: 11 }, color: '#475569' } }, y: { beginAtZero: true, grid: { color: '#eef1f6' }, ticks: { font: { size: 11 }, color: '#475569' } } } }; },
  lineOpts: function (o) { var b = Analytics.baseOpts(); if (o && o.max) b.scales.y.max = o.max; b.interaction = { mode: 'index', intersect: false }; return b; },
  barOpts: function (o) { var b = Analytics.baseOpts(); o = o || {}; if (o.horizontal) { b.indexAxis = 'y'; b.scales.x.grid = { color: '#eef1f6' }; b.scales.y.grid = { display: false }; } if (o.stacked) { b.scales.x.stacked = true; b.scales.y.stacked = true; } if (o.single) b.plugins.legend.display = false; if (o.max) b.scales[o.horizontal ? 'x' : 'y'].max = o.max; return b; },
  doughnutOpts: function () { return { responsive: true, maintainAspectRatio: false, cutout: '62%', plugins: { legend: { position: 'right', labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, font: { size: 11 } } }, tooltip: { backgroundColor: '#102640', padding: 10, cornerRadius: 8 } } }; },
  bar: function (ctx, labels, datasets, o) { var c = new Chart(ctx, { type: 'bar', data: { labels: labels, datasets: datasets.map(function (d, i) { return Object.assign({ backgroundColor: d.color || CHART_COLORS[i], borderRadius: 4, borderSkipped: false, maxBarThickness: 28, hoverBackgroundColor: d.color || CHART_COLORS[i] }, d); }) }, options: Analytics.barOpts(o) }); Analytics.charts.push(c); return c; },
  doughnut: function (ctx, labels, values, colors) { var c = new Chart(ctx, { type: 'doughnut', data: { labels: labels, datasets: [{ data: values, backgroundColor: colors || labels.map(function (_, i) { return CHART_COLORS[i % 8]; }), borderWidth: 2, borderColor: '#fff', hoverOffset: 4 }] }, options: Analytics.doughnutOpts() }); Analytics.charts.push(c); return c; },
  card: function (id, title, sub, tall) { return '<div class="col-lg-6"><div class="card chart-card"><div class="card-header">' + title + (sub ? '<span class="ms-auto small text-muted">' + sub + '</span>' : '') + '</div><div class="card-body"><div class="chart-box ' + (tall ? 'tall' : '') + '"><canvas id="' + id + '"></canvas></div></div></div></div>'; },

  render: function (el, q) {
    Analytics.destroy();
    var boot = App.state.boot, today = U.today();
    var f = { dateFrom: q.dateFrom || U.addDays(today, -13), dateTo: q.dateTo || today, department: q.department || '', designation: q.designation || '', employeeId: q.employeeId || '', managerId: q.managerId || '' };
    var managers = boot.employees.filter(function (e) { return ['DEPARTMENT_MANAGER', 'ADMIN', 'SUPER_ADMIN'].indexOf(e.Role) !== -1; });
    el.innerHTML = '<div class="page-head"><div><h1>Management Analytics</h1><div class="sub">Completion, time utilization, delays and interdepartmental dependencies. Click a department bar to drill down.</div></div></div>' +
      App.filterBar([{ name: 'dateFrom', label: 'From', type: 'date', value: f.dateFrom }, { name: 'dateTo', label: 'To', type: 'date', value: f.dateTo }, { name: 'department', label: 'Department', type: 'select', options: App.deptOptions(), value: f.department }, { name: 'designation', label: 'Designation', type: 'select', options: boot.designations.map(function (d) { return d.name; }), value: f.designation }, { name: 'employeeId', label: 'Employee', type: 'select', options: App.employeeOptions(), value: f.employeeId }, { name: 'managerId', label: 'Reporting manager', type: 'select', options: managers.map(function (m) { return { value: m.EmployeeID, label: m.EmployeeName }; }), value: f.managerId }]) +
      '<div id="an-body"><div class="text-center py-5 text-muted"><div class="spinner-border spinner-border-sm me-2"></div>Loading analytics…</div></div>';
    U.qs('[data-apply]', el).addEventListener('click', function () { App.go('#/analytics', U.formData(U.qs('[data-filters]', el))); });
    return Promise.all([API.call('analytics.charts', f), API.call('analytics.bottlenecks', f)]).then(function (r) {
      var c = r[0], b = r[1];
      var body = U.qs('#an-body');
      body.innerHTML = '<div class="kpi-grid">' + App.kpi('Employees in scope', c.employeeCount, '', 'navy') + App.kpi('Tasks in range', c.taskCount, U.dmy(c.dateFrom) + ' – ' + U.dmy(c.dateTo), 'navy') + App.kpi('Avg completion', U.pct(c.productivityTrend.completionRate.length ? U.sum(c.productivityTrend.completionRate) / c.productivityTrend.completionRate.length : 0), 'daily average', 'good') + App.kpi('Recorded hours', Math.round(U.sum(c.productivityTrend.hours) * 10) / 10 + ' h', 'from submitted days', 'navy') + '</div>' +
        '<div class="row g-3 mb-3">' +
        Analytics.card('ch1', '1. Department-wise task completion', 'completed vs total') + Analytics.card('ch2', '2. Employee-wise task completion', 'top 15 by tasks', true) +
        Analytics.card('ch3', '3. Daily productivity trend', 'completion rate %') + Analytics.card('ch4', '4. Time utilization analysis', 'recorded vs unallocated vs break') +
        Analytics.card('ch5', '5. Department-wise pending tasks') + Analytics.card('ch6', '6. Major difficulty categories') +
        Analytics.card('ch7', '7. Delay reason analysis', 'by delay type') + Analytics.card('ch8', '8. Employee report submission rate', '% of days submitted', true) +
        Analytics.card('ch9', '9. Task priority distribution') + Analytics.card('ch10', '10. Interdepartmental dependency analysis', 'raised by → against') +
        '</div>' +
        '<h5 class="mb-3"><i class="bi bi-funnel me-2"></i>Bottleneck analysis</h5>' + (b.insights.length ? b.insights.map(function (i) { return '<div class="insight"><i class="bi bi-lightbulb me-2 text-warning"></i>' + U.esc(i) + '</div>'; }).join('') : '') +
        '<div class="row g-3 mt-1">' + [['Departments with most difficulties', b.departmentsMostDifficulties, 'bi-building', function (x) { return x.value; }], ['Task categories consuming most time', b.categoriesMostTime, 'bi-hourglass-split', function (x) { return x.label; }], ['Dependencies that repeatedly delay work', b.repeatDependencies, 'bi-link-45deg', function (x) { return x.value + '×'; }], ['Tasks frequently pending', b.frequentlyPending, 'bi-arrow-repeat', function (x) { return x.value + '×'; }], ['Blocked tasks by department', b.blockedByDepartment, 'bi-slash-circle', function (x) { return x.value; }], ['Delay caused per department involved', b.delayMinutesByDepartmentInvolved, 'bi-diagram-2', function (x) { return x.label; }]].map(function (k) { var max = Math.max.apply(null, [1].concat(k[1].map(function (x) { return x.value; }))); return '<div class="col-md-6 col-xl-4"><div class="card h-100"><div class="card-header"><i class="bi ' + k[2] + '"></i>' + k[0] + '</div><div class="card-body">' + (k[1].length ? '<ul class="list-kv">' + k[1].map(function (x) { return '<li><span class="flex-grow-1">' + U.esc(x.key) + '<span class="bar-mini" style="width:' + Math.round(x.value / max * 100) + '%"></span></span><b>' + U.esc(k[3](x)) + '</b></li>'; }).join('') + '</ul>' : '<div class="small-muted">No data</div>') + '</div></div></div>'; }).join('') + '</div>' +
        '<div class="card mt-3"><div class="card-header"><i class="bi bi-exclamation-triangle"></i>Problems that remain unresolved<span class="ms-auto small text-muted">' + b.unresolved.length + '</span></div>' + (b.unresolved.length ? '<div class="table-wrap"><table class="table table-sm table-hover"><thead><tr><th>Age</th><th>Date</th><th>Employee</th><th>Task</th><th>Problem</th><th>Category</th><th>Against</th><th>Status</th></tr></thead><tbody>' + b.unresolved.slice(0, 25).map(function (d) { return '<tr class="clickable" onclick="App.go(\'#/difficulty\',{employeeId:\'' + d.EmployeeID + '\',dateFrom:\'' + d.Date + '\',dateTo:\'' + U.today() + '\'})"><td><b>' + d.AgeDays + 'd</b></td><td>' + U.dmy(d.Date) + '</td><td>' + U.esc(d.EmployeeName) + '</td><td>' + U.esc(d.TaskName) + '</td><td class="small">' + U.esc(d.ProblemDescription) + '</td><td class="small">' + U.esc(d.Category) + '</td><td class="small">' + U.esc(d.DepartmentInvolved || '—') + '</td><td>' + U.st(d.ResolutionStatus) + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<div class="card-body">' + App.empty('Everything resolved', 'bi-emoji-smile') + '</div>') + '</div>';
      var g = function (id) { return U.qs('#' + id, body); };
      var dc = c.departmentCompletion;
      var ch1 = Analytics.bar(g('ch1'), dc.labels, [{ label: 'Completed', data: dc.completed }, { label: 'Pending', data: dc.total.map(function (t, i) { return t - dc.completed[i]; }), color: '#cbd5e1' }], { stacked: true });
      g('ch1').onclick = function (evt) { var pts = ch1.getElementsAtEventForMode(evt, 'nearest', { intersect: true }, true); if (pts.length) App.go('#/department-reports', { department: dc.labels[pts[0].index], date: f.dateTo }); };
      var ec = c.employeeCompletion;
      Analytics.bar(g('ch2'), ec.labels, [{ label: 'Completed', data: ec.completed }, { label: 'Pending', data: ec.total.map(function (t, i) { return t - ec.completed[i]; }), color: '#cbd5e1' }], { stacked: true, horizontal: true });
      var pt = c.productivityTrend;
      Analytics.charts.push(new Chart(g('ch3'), { type: 'line', data: { labels: pt.labels, datasets: [{ label: 'Completion rate %', data: pt.completionRate, borderColor: CHART_COLORS[0], backgroundColor: CHART_COLORS[0], tension: .3, borderWidth: 2, pointRadius: 3 }] }, options: Analytics.lineOpts({ max: 100 }) }));
      var tu = c.timeUtilization;
      Analytics.doughnut(g('ch4'), tu.labels.map(function (l, i) { return l + ' (' + U.dur(tu.values[i]) + ')'; }), tu.values, [CHART_COLORS[2], '#cbd5e1', CHART_COLORS[3]]);
      Analytics.bar(g('ch5'), c.departmentPending.labels, [{ label: 'Pending tasks', data: c.departmentPending.values, color: CHART_COLORS[3] }], { single: true });
      Analytics.bar(g('ch6'), c.difficultyCategories.labels, [{ label: 'Difficulties', data: c.difficultyCategories.values, color: CHART_COLORS[7] }], { single: true, horizontal: true });
      Analytics.doughnut(g('ch7'), c.delayTypes.labels.map(function (l) { return l.replace(/_/g, ' '); }), c.delayTypes.values);
      Analytics.bar(g('ch8'), c.submissionRate.labels, [{ label: 'Submission rate %', data: c.submissionRate.values, color: CHART_COLORS[2] }], { single: true, horizontal: true, max: 100 });
      Analytics.doughnut(g('ch9'), c.priorityDistribution.labels, c.priorityDistribution.values, ['#94a3b8', CHART_COLORS[0], CHART_COLORS[3], CHART_COLORS[7]]);
      Analytics.bar(g('ch10'), c.dependencies.labels, [{ label: 'Issues raised', data: c.dependencies.values, color: CHART_COLORS[6] }], { single: true, horizontal: true });
    });
  }
};
App.views['#/analytics'] = Analytics.render;
