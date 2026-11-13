/**
 * tasks.js — Task Management: cross-employee task list with filters (managers/admins) and
 * personal task history (employees). Export to CSV.
 */
var Tasks = {
  render: function (el, q) {
    var boot = App.state.boot, today = U.today();
    var f = { dateFrom: q.dateFrom || U.addDays(today, -6), dateTo: q.dateTo || today, employeeId: q.employeeId || '', department: q.department || '', status: q.status || '', priority: q.priority || '', category: q.category || '' };
    el.innerHTML = '<div class="page-head"><div><h1>Task Management</h1><div class="sub">' + (App.isManagerUp() ? 'All task entries across your scope with status, priority and recorded time.' : 'Your task history.') + '</div></div><div class="actions-right"><button class="btn btn-outline-primary btn-sm" data-csv><i class="bi bi-download me-1"></i>Export CSV</button> <button class="btn btn-primary btn-sm" onclick="App.go(\'#/tracker\')"><i class="bi bi-plus-circle me-1"></i>Add task (tracker)</button></div></div>' +
      App.filterBar([{ name: 'dateFrom', label: 'From', type: 'date', value: f.dateFrom }, { name: 'dateTo', label: 'To', type: 'date', value: f.dateTo }]
        .concat(App.isManagerUp() ? [{ name: 'employeeId', label: 'Employee', type: 'select', options: App.employeeOptions(), value: f.employeeId }, { name: 'department', label: 'Department', type: 'select', options: App.deptOptions(), value: f.department }] : [])
        .concat([{ name: 'status', label: 'Status', type: 'select', options: boot.lists.taskStatuses, value: f.status }, { name: 'priority', label: 'Priority', type: 'select', options: boot.lists.taskPriorities, value: f.priority }, { name: 'category', label: 'Category', type: 'select', options: boot.lists.taskCategories, value: f.category }])) +
      '<div class="kpi-grid" id="task-kpis"></div><div class="card"><div class="table-wrap" id="task-table"></div></div>';
    U.qs('[data-apply]', el).addEventListener('click', function () { App.go('#/tasks', U.formData(U.qs('[data-filters]', el))); });
    return API.call('tasks.list', f).then(function (d) {
      var t = d.tasks;
      U.qs('[data-csv]', el).addEventListener('click', function () {
        var cols = ['Date', 'EmployeeID', 'EmployeeName', 'Department', 'Designation', 'TaskTitle', 'TaskCategory', 'Priority', 'Status', 'CompletionPercent', 'StartTime', 'EndTime', 'TimeSpentMinutes', 'RelatedDepartment', 'PendingReason', 'ExpectedCompletionDate', 'ResponsibleDependency', 'Remarks'];
        var esc = function (v) { var s = String(v === undefined || v === null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
        U.download('tasks_' + f.dateFrom + '_' + f.dateTo + '.csv', [cols.join(',')].concat(t.map(function (x) { return cols.map(function (c) { return esc(x[c]); }).join(','); })).join('\n'), 'text/csv');
      });
      var by = function (s) { return t.filter(function (x) { return x.Status === s; }).length; };
      U.qs('#task-kpis').innerHTML = App.kpi('Tasks', t.length, U.dmy(d.dateFrom) + ' – ' + U.dmy(d.dateTo), 'navy') + App.kpi('Completed', by('COMPLETED'), U.pct(t.length ? by('COMPLETED') / t.length * 100 : 0), 'good') + App.kpi('In progress', by('IN PROGRESS'), '', '') + App.kpi('Pending / On hold', by('PENDING') + by('ON HOLD'), '', 'warn') + App.kpi('Blocked', by('BLOCKED'), '', by('BLOCKED') ? 'bad' : '') + App.kpi('Recorded time', U.dur(U.sum(t, function (x) { return x.TimeSpentMinutes; })), '', 'navy');
      U.qs('#task-table').innerHTML = '<table class="table table-hover"><thead><tr><th>Date</th>' + (App.isManagerUp() ? '<th>Employee</th>' : '') + '<th>Task</th><th>Category</th><th>Priority</th><th>Status</th><th class="text-center">%</th><th>Time</th><th>Duration</th><th>Dependency / reason</th></tr></thead><tbody>' +
        (t.length ? t.map(function (x) { return '<tr class="clickable" data-open="' + U.attr(x.EmployeeID) + '|' + x.Date + '"><td class="text-nowrap">' + U.dmy(x.Date) + '</td>' + (App.isManagerUp() ? '<td><div class="fw-semibold">' + U.esc(x.EmployeeName) + '</div><div class="small-muted">' + U.esc(x.Department) + '</div></td>' : '') + '<td><div class="fw-semibold">' + U.esc(x.TaskTitle) + '</div>' + (x.TaskDescription ? '<div class="small text-muted text-truncate" style="max-width:280px">' + U.esc(x.TaskDescription) + '</div>' : '') + '</td><td class="small">' + U.esc(x.TaskCategory) + '</td><td>' + U.st(x.Priority) + '</td><td>' + U.st(x.Status) + '</td><td class="text-center">' + x.CompletionPercent + '</td><td class="small text-nowrap">' + U.esc(x.StartLabel) + (x.EndLabel ? ' – ' + U.esc(x.EndLabel) : '') + '</td><td>' + U.dur(x.TimeSpentMinutes) + '</td><td class="small text-muted">' + U.esc(x.ResponsibleDependency || x.PendingReason || (x.RelatedDepartment ? 'with ' + x.RelatedDepartment : '') || '—') + '</td></tr>'; }).join('') : '<tr><td colspan="10">' + App.empty('No tasks match the filters') + '</td></tr>') + '</tbody></table>';
      U.qsa('[data-open]', el).forEach(function (r) { r.addEventListener('click', function () { var p = r.getAttribute('data-open').split('|'); App.go('#/tracker', { employeeId: p[0] !== App.state.user.employeeId ? p[0] : '', date: p[1] }); }); });
    });
  }
};
App.views['#/tasks'] = Tasks.render;
