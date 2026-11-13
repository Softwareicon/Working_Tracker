/**
 * difficulty.js — Difficulty & Delay Tracker: raise issues (optionally against another department),
 * update resolution status, and see recurring bottlenecks (managers).
 */
var Difficulty = {
  render: function (el, q) {
    var boot = App.state.boot, today = U.today();
    var f = { dateFrom: q.dateFrom || U.addDays(today, -29), dateTo: q.dateTo || today, employeeId: q.employeeId || '', status: q.status || '', category: q.category || '', department: q.department || '', departmentInvolved: q.departmentInvolved || '' };
    el.innerHTML = '<div class="page-head"><div><h1>Difficulty &amp; Delay Tracker</h1><div class="sub">Capture what blocks work, who the dependency is, and how long it delayed the task. External dependencies never penalize the employee.</div></div><div class="actions-right"><button class="btn btn-primary btn-sm" data-add><i class="bi bi-plus-circle me-1"></i>Report a difficulty</button></div></div>' +
      App.filterBar([{ name: 'dateFrom', label: 'From', type: 'date', value: f.dateFrom }, { name: 'dateTo', label: 'To', type: 'date', value: f.dateTo }]
        .concat(App.isManagerUp() ? [{ name: 'employeeId', label: 'Employee', type: 'select', options: App.employeeOptions(), value: f.employeeId }, { name: 'department', label: 'Raised by dept', type: 'select', options: App.deptOptions(), value: f.department }, { name: 'departmentInvolved', label: 'Against dept', type: 'select', options: App.deptOptions().concat(['MANAGEMENT', 'EXTERNAL']), value: f.departmentInvolved }] : [])
        .concat([{ name: 'status', label: 'Status', type: 'select', options: boot.lists.resolutionStatuses, value: f.status }, { name: 'category', label: 'Category', type: 'select', options: boot.lists.difficultyCategories, value: f.category }])) +
      '<div id="diff-body"></div>';
    U.qs('[data-apply]', el).addEventListener('click', function () { App.go('#/difficulty', U.formData(U.qs('[data-filters]', el))); });
    U.qs('[data-add]', el).addEventListener('click', function () { Difficulty.form({ Date: today }, function () { App.route(); }); });
    var calls = [API.call('difficulties.list', f)];
    if (App.isManagerUp()) calls.push(API.call('difficulties.bottlenecks', { dateFrom: f.dateFrom, dateTo: f.dateTo }));
    return Promise.all(calls).then(function (r) {
      var list = r[0].difficulties, b = r[1];
      var body = U.qs('#diff-body');
      var kpis = '<div class="kpi-grid">' + App.kpi('Difficulties', list.length, U.dmy(f.dateFrom) + ' – ' + U.dmy(f.dateTo), 'navy') + App.kpi('Unresolved', list.filter(function (d) { return d.ResolutionStatus !== 'RESOLVED'; }).length, '', 'warn') + App.kpi('Escalated', list.filter(function (d) { return d.ResolutionStatus === 'ESCALATED'; }).length, '', 'bad') + App.kpi('Total delay', U.dur(U.sum(list, function (d) { return d.DelayMinutes; })), '', 'navy') + App.kpi('Not employee-caused', U.pct(list.length ? list.filter(function (d) { return d.DelayType !== 'EMPLOYEE'; }).length / list.length * 100 : 0), 'approval / dept / external / technical', 'good') + '</div>';
      var table = '<div class="card mb-3"><div class="table-wrap"><table class="table table-hover"><thead><tr><th>Date</th>' + (App.isManagerUp() ? '<th>Employee</th>' : '') + '<th>Task / problem</th><th>Category</th><th>Delay type</th><th>Level</th><th>Delay</th><th>Against / dependency</th><th>Status</th><th class="text-end">Actions</th></tr></thead><tbody>' +
        (list.length ? list.map(function (d) { return '<tr><td class="text-nowrap">' + U.dmy(d.Date) + '</td>' + (App.isManagerUp() ? '<td><div class="fw-semibold">' + U.esc(d.EmployeeName) + '</div><div class="small-muted">' + U.esc(d.Department) + '</div></td>' : '') + '<td><div class="fw-semibold">' + U.esc(d.TaskName) + '</div><div class="small text-muted">' + U.esc(d.ProblemDescription) + '</div>' + (d.AssistanceRequired ? '<div class="small"><i class="bi bi-life-preserver me-1"></i>' + U.esc(d.AssistanceRequired) + '</div>' : '') + (d.ResolutionNotes ? '<div class="small text-success"><i class="bi bi-check2 me-1"></i>' + U.esc(d.ResolutionNotes) + '</div>' : '') + '</td><td class="small">' + U.esc(d.Category) + '</td><td class="small">' + U.esc(d.DelayType.replace(/_/g, ' ')) + '</td><td>' + U.st(d.DifficultyLevel) + '</td><td>' + (d.DelayLabel ? U.esc(d.DelayLabel) : '—') + '</td><td class="small">' + U.esc(d.DepartmentInvolved || '') + (d.ResponsibleDependency && d.ResponsibleDependency !== d.DepartmentInvolved ? '<div class="small-muted">' + U.esc(d.ResponsibleDependency) + '</div>' : '') + '</td><td>' + U.st(d.ResolutionStatus) + (d.EscalationRequired ? ' <i class="bi bi-arrow-up-circle text-danger" title="Escalated"></i>' : '') + '</td><td class="text-end text-nowrap">' + (d.ResolutionStatus !== 'RESOLVED' ? '<button class="btn btn-sm btn-light" data-res="' + d.DifficultyID + '" title="Update status"><i class="bi bi-check2-square"></i></button> ' : '') + (d.EmployeeID === App.state.user.employeeId || App.isAdmin() ? '<button class="btn btn-sm btn-light" data-edit="' + d.DifficultyID + '"><i class="bi bi-pencil"></i></button> <button class="btn btn-sm btn-light text-danger" data-del="' + d.DifficultyID + '"><i class="bi bi-trash"></i></button>' : '') + '</td></tr>'; }).join('') : '<tr><td colspan="10">' + App.empty('No difficulties recorded for this period', 'bi-emoji-smile') + '</td></tr>') + '</tbody></table></div></div>';
      var bott = '';
      if (b) {
        var kv = function (title, arr, icon) { return '<div class="col-md-6 col-xl-3"><div class="card h-100"><div class="card-header"><i class="bi ' + icon + '"></i>' + title + '</div><div class="card-body">' + (arr.length ? '<ul class="list-kv">' + arr.slice(0, 6).map(function (x) { return '<li><span>' + U.esc(x.key) + (x.unresolved ? ' <span class="small-muted">(' + x.unresolved + ' open)</span>' : '') + '</span><b>' + x.count + '</b></li>'; }).join('') + '</ul>' : '<div class="small-muted">No data</div>') + '</div></div></div>'; };
        bott = '<h5 class="mt-2 mb-3"><i class="bi bi-funnel me-2"></i>Recurring bottlenecks</h5><div class="row g-3 mb-3">' + kv('By category', b.byCategory, 'bi-tags') + kv('Departments raising issues', b.byDepartment, 'bi-building') + kv('Departments blamed', b.byDepartmentInvolved, 'bi-diagram-2') + kv('Repeat dependencies', b.byDependency, 'bi-link-45deg') + '</div>' +
          (b.recurringTasks.length ? '<div class="card mb-3"><div class="card-header"><i class="bi bi-arrow-repeat"></i>Tasks that keep running into difficulty</div><div class="card-body"><ul class="list-kv">' + b.recurringTasks.map(function (x) { return '<li><span>' + U.esc(x.key) + '</span><b>' + x.count + '×</b></li>'; }).join('') + '</ul></div></div>' : '');
      }
      body.innerHTML = kpis + bott + '<h5 class="mb-3"><i class="bi bi-list-check me-2"></i>Difficulty log</h5>' + table;
      U.qsa('[data-res]', body).forEach(function (btn) { btn.addEventListener('click', function () { Difficulty.statusForm(list.filter(function (d) { return d.DifficultyID === btn.getAttribute('data-res'); })[0]); }); });
      U.qsa('[data-edit]', body).forEach(function (btn) { btn.addEventListener('click', function () { Difficulty.form(list.filter(function (d) { return d.DifficultyID === btn.getAttribute('data-edit'); })[0], function () { App.route(); }); }); });
      U.qsa('[data-del]', body).forEach(function (btn) { btn.addEventListener('click', function () { App.confirm('Delete this difficulty record?', { danger: true, okText: 'Delete' }).then(function (ok) { if (ok) API.call('difficulties.delete', { DifficultyID: btn.getAttribute('data-del') }).then(function () { App.toast('Deleted', 'success'); App.route(); }); }); }); });
    });
  },

  /** Raise / edit form. pre: {TaskID, Date, EmployeeID} or an existing record. */
  form: function (pre, done) {
    var boot = App.state.boot; pre = pre || {};
    var isEdit = !!pre.DifficultyID;
    var empId = pre.EmployeeID || App.state.user.employeeId, date = pre.Date || U.today();
    API.call('tasks.list', { employeeId: empId, date: date }, { noLoader: true, silent: true }).catch(function () { return { tasks: [] }; }).then(function (td) {
      var tasks = td.tasks || [];
      var m = App.modal({ title: isEdit ? 'Edit difficulty' : 'Report a difficulty / delay', size: 'lg', static: true,
        body: '<form id="diff-form" class="row g-3">' +
          '<div class="col-md-6"><label class="form-label">Related task</label><select class="form-select" name="TaskID"><option value="">— Not linked to a task —</option>' + U.opts(tasks.map(function (t) { return { value: t.TaskID, label: t.TaskTitle + ' (' + t.Status + ')' }; }), pre.TaskID) + '</select></div>' +
          '<div class="col-md-6"><label class="form-label">Task / activity name *</label><input class="form-control" name="TaskName" value="' + U.attr(pre.TaskName || '') + '" placeholder="auto-filled from the task"></div>' +
          '<div class="col-12"><label class="form-label">Problem description *</label><textarea class="form-control" name="ProblemDescription" rows="2" required>' + U.esc(pre.ProblemDescription || '') + '</textarea></div>' +
          '<div class="col-md-4"><label class="form-label">Difficulty category *</label><select class="form-select" name="Category" required>' + U.opts(boot.lists.difficultyCategories, pre.Category || 'Other Department Dependency') + '</select></div>' +
          '<div class="col-md-4"><label class="form-label">Difficulty level</label><select class="form-select" name="DifficultyLevel">' + U.opts(boot.lists.difficultyLevels, pre.DifficultyLevel || 'MEDIUM') + '</select></div>' +
          '<div class="col-md-4"><label class="form-label">Delay type</label><select class="form-select" name="DelayType"><option value="">Auto from category</option>' + U.opts(boot.lists.delayTypes.map(function (t) { return { value: t, label: t.replace(/_/g, ' ') }; }), pre.DelayType) + '</select></div>' +
          '<div class="col-md-4"><label class="form-label">Delay duration (minutes)</label><input type="number" min="0" class="form-control" name="DelayMinutes" value="' + U.attr(pre.DelayMinutes || '') + '"></div>' +
          '<div class="col-md-4"><label class="form-label">Department involved</label><select class="form-select" name="DepartmentInvolved"><option value="">None</option>' + U.opts(App.deptOptions().concat(['MANAGEMENT', 'EXTERNAL']), pre.DepartmentInvolved) + '</select></div>' +
          '<div class="col-md-4"><label class="form-label">Responsible dependency</label><input class="form-control" name="ResponsibleDependency" value="' + U.attr(pre.ResponsibleDependency || '') + '" placeholder="person / vendor / customer"></div>' +
          '<div class="col-12"><label class="form-label">Reason for difficulty (detailed explanation)</label><textarea class="form-control" name="Reason" rows="2">' + U.esc(pre.Reason || '') + '</textarea></div>' +
          '<div class="col-md-8"><label class="form-label">Assistance required</label><input class="form-control" name="AssistanceRequired" value="' + U.attr(pre.AssistanceRequired || '') + '" placeholder="What support do you need?"></div>' +
          '<div class="col-md-4 d-flex align-items-end"><div class="form-check"><input class="form-check-input" type="checkbox" name="EscalationRequired" id="d-esc" ' + (pre.EscalationRequired ? 'checked' : '') + '><label class="form-check-label" for="d-esc">Escalation required (notify managers)</label></div></div>' +
          '<input type="hidden" name="Date" value="' + date + '"><input type="hidden" name="EmployeeID" value="' + empId + '">' + (isEdit ? '<input type="hidden" name="DifficultyID" value="' + pre.DifficultyID + '">' : '') + '</form>',
        footer: '<button class="btn btn-light" data-bs-dismiss="modal">Cancel</button><button class="btn btn-primary" data-save><i class="bi bi-check2 me-1"></i>' + (isEdit ? 'Save' : 'Record difficulty') + '</button>' });
      var form = U.qs('#diff-form', m.el);
      U.qs('[name=TaskID]', form).addEventListener('change', function (e) { var t = tasks.filter(function (x) { return x.TaskID === e.target.value; })[0]; if (t && !U.qs('[name=TaskName]', form).value) U.qs('[name=TaskName]', form).value = t.TaskTitle; });
      if (pre.TaskID && !pre.TaskName) { var t0 = tasks.filter(function (x) { return x.TaskID === pre.TaskID; })[0]; if (t0) U.qs('[name=TaskName]', form).value = t0.TaskTitle; }
      U.qs('[data-save]', m.el).addEventListener('click', function () {
        if (!form.reportValidity()) return;
        var d = U.formData(form);
        if (!d.TaskName && !d.TaskID) { App.toast('Enter a task / activity name', 'warning'); return; }
        API.call('difficulties.save', d).then(function () { App.toast(isEdit ? 'Difficulty updated' : 'Difficulty recorded', 'success'); m.close(); if (done) done(); }).catch(function () { });
      });
    });
  },

  statusForm: function (d) {
    var m = App.modal({ title: 'Update status — ' + U.esc(d.TaskName), body: '<div class="small text-muted mb-3">' + U.esc(d.ProblemDescription) + '</div><label class="form-label">New status</label><select class="form-select" data-status>' + U.opts(App.state.boot.lists.resolutionStatuses, d.ResolutionStatus) + '</select><label class="form-label mt-3">Resolution notes</label><textarea class="form-control" rows="3" data-notes>' + U.esc(d.ResolutionNotes || '') + '</textarea>',
      footer: '<button class="btn btn-light" data-bs-dismiss="modal">Cancel</button><button class="btn btn-primary" data-save>Update</button>' });
    U.qs('[data-save]', m.el).addEventListener('click', function () { API.call('difficulties.updateStatus', { DifficultyID: d.DifficultyID, status: U.qs('[data-status]', m.el).value, notes: U.qs('[data-notes]', m.el).value }).then(function (r) { App.toast('Status: ' + r.difficulty.ResolutionStatus, 'success'); m.close(); App.route(); }); });
  }
};
App.views['#/difficulty'] = Difficulty.render;
