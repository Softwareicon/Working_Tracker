/**
 * mis.js — Weekly MIS: per-employee weekly summary of tasks (total, completed, pending, upcoming,
 * overdue). Employees see only their own MIS; managers their team; admins everyone.
 */
var Mis = {
  css: function () {
    if (document.getElementById('mis-css')) return;
    var s = document.createElement('style'); s.id = 'mis-css';
    s.textContent = '.st-OVERDUE{background:#fde8e8;color:#c62828}.st-UPCOMING{background:#f0ebff;color:#6250d6}' +
      '.mis-days{display:grid;grid-template-columns:repeat(7,1fr);gap:8px}.mis-day{background:#f8fafc;border:1px solid #e3e8ef;border-radius:10px;padding:10px;text-align:center}' +
      '.mis-day .d{font-size:11px;color:#64748b;font-weight:600;text-transform:uppercase}.mis-day .n{font-size:20px;font-weight:800;color:#1e3a5f}.mis-day .c{font-size:11px;color:#1f8a4c}.mis-day.today{border-color:#2a78d6}' +
      '.mis-bar{height:8px;border-radius:99px;background:#eef2f7;overflow:hidden;display:flex;min-width:90px}.mis-bar span{display:block;height:100%}' +
      '@media (max-width:640px){.mis-days{grid-template-columns:repeat(4,1fr)}}';
    document.head.appendChild(s);
  },

  render: function (el, q) {
    Mis.css();
    var u = App.state.user, mgr = App.isManagerUp();
    var week = q.week || U.today();
    var empId = mgr ? (q.employeeId || '') : u.employeeId;
    el.innerHTML = '<div class="page-head"><div><h1>Weekly MIS</h1><div class="sub">' + (mgr ? (App.isAdmin() ? 'Weekly task summary for every employee. Click a row for the full task list.' : 'Weekly task summary for your team.') : 'Your weekly task summary.') + '</div></div>' +
      '<div class="actions-right d-flex gap-2 align-items-center flex-wrap">' +
      (mgr ? '<select class="form-select form-select-sm" data-emp style="max-width:240px"><option value="">All employees</option>' + U.opts(App.employeeOptions(), empId) + '</select>' : '') +
      '<div class="btn-group btn-group-sm"><button class="btn btn-light" data-prev title="Previous week"><i class="bi bi-chevron-left"></i></button><input type="date" class="form-control form-control-sm" data-week value="' + week + '" style="max-width:160px" title="Pick any day of the week"><button class="btn btn-light" data-next title="Next week"><i class="bi bi-chevron-right"></i></button></div>' +
      '<button class="btn btn-outline-primary btn-sm" data-csv><i class="bi bi-download me-1"></i>CSV</button>' +
      '<button class="btn btn-outline-primary btn-sm" data-copy><i class="bi bi-whatsapp me-1"></i>Copy summary</button>' +
      '<button class="btn btn-outline-primary btn-sm" data-print><i class="bi bi-printer me-1"></i>Print</button></div></div>' +
      '<div id="mis-body"><div class="text-center py-5 text-muted"><div class="spinner-border spinner-border-sm me-2"></div>Loading…</div></div>';
    var go = function (w, e) { App.go('#/mis', { week: w, employeeId: e }); };
    U.qs('[data-week]', el).addEventListener('change', function (e) { go(e.target.value, empId); });
    U.qs('[data-prev]', el).addEventListener('click', function () { go(U.addDays(U.qs('[data-week]', el).value || U.today(), -7), empId); });
    U.qs('[data-next]', el).addEventListener('click', function () { go(U.addDays(U.qs('[data-week]', el).value || U.today(), 7), empId); });
    var es = U.qs('[data-emp]', el); if (es) es.addEventListener('change', function (e) { go(week, e.target.value); });

    return API.call('mis.weekly', { weekStart: week, employeeId: empId }).then(function (d) {
      Mis.data = d;
      var single = d.employees.length === 1 && (empId || !mgr);
      var row = single ? d.employees[0] : d.totals;
      U.qs('#mis-body').innerHTML = Mis.body(d, row, single);
      U.qsa('[data-open-emp]', el).forEach(function (r) { r.addEventListener('click', function () { go(week, r.getAttribute('data-open-emp')); }); });
      U.qsa('[data-open-day]', el).forEach(function (r) { r.addEventListener('click', function () { var p = r.getAttribute('data-open-day').split('|'); App.go('#/tracker', { employeeId: p[0] !== u.employeeId ? p[0] : '', date: p[1] }); }); });
      U.qs('[data-csv]', el).onclick = function () { Mis.csv(d, single); };
      U.qs('[data-copy]', el).onclick = function () { U.copy(Mis.text(d, row, single)).then(function () { App.toast('Summary copied — paste it in WhatsApp', 'success'); }); };
      U.qs('[data-print]', el).onclick = function () { Mis.print(d, row, single); };
    });
  },

  bar: function (r) {
    if (!r.total) return '<div class="mis-bar"></div>';
    var seg = function (n, c) { return n ? '<span style="width:' + (n / r.total * 100) + '%;background:' + c + '"></span>' : ''; };
    return '<div class="mis-bar" title="' + U.attr(r.completed + ' completed · ' + r.pending + ' pending · ' + r.upcoming + ' upcoming · ' + r.overdue + ' overdue') + '">' + seg(r.completed, '#1f8a4c') + seg(r.pending, '#94a3b8') + seg(r.upcoming, '#6250d6') + seg(r.overdue, '#d43c3c') + '</div>';
  },

  body: function (d, r, single) {
    var who = single ? '<div class="mb-3"><b>' + U.esc(r.EmployeeName) + '</b> · ' + U.esc(r.Designation) + ' · <span class="badge text-bg-light">' + U.esc(r.Department) + '</span></div>' : '';
    var kpis = '<div class="kpi-grid">' +
      App.kpi('Total tasks', r.total, 'Week ' + U.esc(d.weekLabel), 'navy', 'bi-list-task') +
      App.kpi('Completed', r.completed, U.pct(r.completionRate) + ' completion rate', 'good', 'bi-check2-circle') +
      App.kpi('Pending', r.pending, r.inProgress + ' in progress · ' + r.onHold + ' on hold · ' + r.blocked + ' blocked', '', 'bi-hourglass-split') +
      App.kpi('Upcoming', r.upcoming, 'due after today', '', 'bi-calendar-event') +
      App.kpi('Overdue', r.overdue, 'past the expected date', r.overdue ? 'bad' : '', 'bi-exclamation-octagon') +
      App.kpi('Reports submitted', r.reportsSubmitted, (single ? 'days this week' : 'across ' + (d.totals.employees || 0) + ' employees'), 'navy', 'bi-send-check') +
      App.kpi('Recorded time', U.dur(r.recordedMinutes), r.highPriorityOpen + ' high-priority open', '', 'bi-stopwatch') + '</div>';
    var empId = single ? r.EmployeeID : '';
    var days = '<div class="card mb-3"><div class="card-header"><i class="bi bi-calendar-week"></i>Day-wise tasks<span class="ms-auto small text-muted">' + U.esc(d.weekLabel) + '</span></div><div class="card-body"><div class="mis-days">' +
      r.days.map(function (x) { var dt = new Date(x.date + 'T12:00:00'); return '<div class="mis-day ' + (x.date === d.today ? 'today' : '') + (single ? ' clickable" data-open-day="' + U.attr(empId + '|' + x.date) : '') + '"><div class="d">' + dt.toLocaleDateString('en-IN', { weekday: 'short' }) + ' ' + U.dmy(x.date).substring(0, 5) + '</div><div class="n">' + x.total + '</div><div class="c">' + x.completed + ' done</div></div>'; }).join('') + '</div></div></div>';
    var defs = '<div class="small text-muted mb-3"><b>Completed</b>: status Completed · <b>Overdue</b>: not completed and expected completion date has passed · <b>Upcoming</b>: expected completion date is after today · <b>Pending</b>: all other open tasks.</div>';
    var table;
    if (single) {
      table = '<div class="card"><div class="card-header"><i class="bi bi-list-check"></i>Tasks this week<span class="ms-auto small text-muted">' + d.tasks.length + ' tasks</span></div><div class="table-wrap"><table class="table table-hover"><thead><tr><th>Date</th><th>Task</th><th>Category</th><th>Priority</th><th>Status</th><th>MIS</th><th class="text-center">%</th><th>Expected by</th><th>Time</th><th>Reason / remarks</th></tr></thead><tbody>' +
        (d.tasks.length ? d.tasks.map(function (t) { return '<tr class="clickable" data-open-day="' + U.attr(t.EmployeeID + '|' + t.Date) + '"><td class="text-nowrap">' + U.dmy(t.Date) + '</td><td><div class="fw-semibold">' + U.esc(t.TaskTitle) + '</div>' + (t.TaskDescription ? '<div class="small text-muted text-truncate" style="max-width:300px">' + U.esc(t.TaskDescription) + '</div>' : '') + '</td><td class="small">' + U.esc(t.TaskCategory) + '</td><td>' + U.st(t.Priority) + '</td><td>' + U.st(t.Status) + '</td><td>' + U.st(t.Bucket) + '</td><td class="text-center">' + t.CompletionPercent + '</td><td class="text-nowrap">' + (t.ExpectedCompletionDate ? U.dmy(t.ExpectedCompletionDate) : '—') + '</td><td>' + U.dur(t.TimeSpentMinutes) + '</td><td class="small text-muted">' + U.esc(t.PendingReason || t.Remarks || '—') + '</td></tr>'; }).join('') : '<tr><td colspan="10">' + App.empty('No tasks recorded this week') + '</td></tr>') + '</tbody></table></div></div>';
    } else {
      table = '<div class="card"><div class="card-header"><i class="bi bi-people"></i>Employee-wise MIS<span class="ms-auto small text-muted">' + d.employees.length + ' employees</span></div><div class="table-wrap"><table class="table table-hover"><thead><tr><th>Employee</th><th>Department</th><th class="text-center">Total</th><th class="text-center">Completed</th><th class="text-center">Pending</th><th class="text-center">Upcoming</th><th class="text-center">Overdue</th><th class="text-center">Rate</th><th>Progress</th><th class="text-center">Reports</th><th>Time</th></tr></thead><tbody>' +
        (d.employees.length ? d.employees.map(function (e) { return '<tr class="clickable" data-open-emp="' + U.attr(e.EmployeeID) + '"><td><div class="fw-semibold">' + U.esc(e.EmployeeName) + '</div><div class="small-muted">' + U.esc(e.Designation) + '</div></td><td class="small">' + U.esc(e.Department) + '</td><td class="text-center fw-bold">' + e.total + '</td><td class="text-center text-success">' + e.completed + '</td><td class="text-center">' + e.pending + '</td><td class="text-center">' + e.upcoming + '</td><td class="text-center ' + (e.overdue ? 'text-danger fw-bold' : '') + '">' + e.overdue + '</td><td class="text-center">' + U.pct(e.completionRate) + '</td><td>' + Mis.bar(e) + '</td><td class="text-center">' + e.reportsSubmitted + '/7</td><td class="text-nowrap">' + U.dur(e.recordedMinutes) + '</td></tr>'; }).join('') : '<tr><td colspan="11">' + App.empty('No employees in scope') + '</td></tr>') +
        '</tbody><tfoot><tr class="fw-bold"><td>Total</td><td></td><td class="text-center">' + d.totals.total + '</td><td class="text-center">' + d.totals.completed + '</td><td class="text-center">' + d.totals.pending + '</td><td class="text-center">' + d.totals.upcoming + '</td><td class="text-center">' + d.totals.overdue + '</td><td class="text-center">' + U.pct(d.totals.completionRate) + '</td><td>' + Mis.bar(d.totals) + '</td><td class="text-center">' + d.totals.reportsSubmitted + '</td><td>' + U.dur(d.totals.recordedMinutes) + '</td></tr></tfoot></table></div></div>';
    }
    return who + kpis + days + defs + table;
  },

  text: function (d, r, single) {
    var lines = ['*Weekly MIS — ' + d.weekLabel + '*', single ? r.EmployeeName + ' (' + r.Designation + ', ' + r.Department + ')' : 'All employees (' + d.employees.length + ')', '',
      'Total tasks: ' + r.total, '✅ Completed: ' + r.completed + ' (' + U.pct(r.completionRate) + ')', '⏳ Pending: ' + r.pending, '📅 Upcoming: ' + r.upcoming, '⚠️ Overdue: ' + r.overdue,
      'Reports submitted: ' + r.reportsSubmitted, 'Recorded time: ' + U.durLong(r.recordedMinutes)];
    if (!single && d.employees.length) { lines.push('', '*Employee-wise*'); d.employees.forEach(function (e) { lines.push('• ' + e.EmployeeName + ': ' + e.total + ' tasks, ' + e.completed + ' done, ' + e.pending + ' pending, ' + e.upcoming + ' upcoming, ' + e.overdue + ' overdue'); }); }
    if (single) { var od = d.tasks.filter(function (t) { return t.Bucket === 'OVERDUE'; }); if (od.length) { lines.push('', '*Overdue tasks*'); od.forEach(function (t) { lines.push('• ' + t.TaskTitle + ' (due ' + U.dmy(t.ExpectedCompletionDate) + ')'); }); } }
    return lines.join('\n');
  },

  csv: function (d, single) {
    var esc = function (v) { var s = String(v === undefined || v === null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    var rows;
    if (single) {
      var cols = ['Date', 'EmployeeName', 'Department', 'TaskTitle', 'TaskDescription', 'TaskCategory', 'Priority', 'Status', 'Bucket', 'CompletionPercent', 'ExpectedCompletionDate', 'TimeSpentMinutes', 'PendingReason', 'Remarks'];
      rows = [cols.join(',')].concat(d.tasks.map(function (t) { return cols.map(function (c) { return esc(t[c]); }).join(','); }));
    } else {
      var c2 = ['EmployeeName', 'Designation', 'Department', 'total', 'completed', 'pending', 'upcoming', 'overdue', 'completionRate', 'inProgress', 'onHold', 'blocked', 'reportsSubmitted', 'recordedMinutes'];
      rows = [c2.join(',')].concat(d.employees.map(function (e) { return c2.map(function (c) { return esc(e[c]); }).join(','); }));
    }
    U.download('weekly_mis_' + d.weekStart + '.csv', rows.join('\n'), 'text/csv');
  },

  print: function (d, r, single) {
    var doc = document.createElement('div');
    doc.innerHTML = '<div style="font-family:Inter,Arial,sans-serif;padding:24px"><h2 style="margin:0">Weekly MIS</h2><div style="color:#64748b;margin-bottom:12px">' + U.esc(d.weekLabel) + ' · Daily Work Tracker Pro</div>' + Mis.body(d, r, single) + '</div>';
    Share.print(doc.firstChild);
  }
};
App.views['#/mis'] = Mis.render;
