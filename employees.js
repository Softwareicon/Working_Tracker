/**
 * employees.js — Employee Management: list, add/edit (automatic department assignment), activate/deactivate,
 * profile & activity history, designation mapping creation for unknown designations.
 */
var Employees = {
  data: null,
  render: function (el, q) {
    var boot = App.state.boot;
    var f = { search: q.search || '', department: q.department || '', designation: q.designation || '', status: q.status || '' };
    el.innerHTML = '<div class="page-head"><div><h1>Employee Management</h1><div class="sub">Department, questionnaire and reporting line are assigned automatically from the designation.</div></div>' +
      '<div class="actions-right">' + (App.isAdmin() ? '<button class="btn btn-outline-primary btn-sm" data-desig><i class="bi bi-diagram-2 me-1"></i>Designation mapping</button> <button class="btn btn-primary btn-sm" data-add><i class="bi bi-person-plus me-1"></i>Add employee</button>' : '') + '</div></div>' +
      App.filterBar([{ name: 'search', label: 'Search', placeholder: 'Name, ID, e-mail…', value: f.search }, { name: 'department', label: 'Department', type: 'select', options: App.deptOptions(), value: f.department },
        { name: 'designation', label: 'Designation', type: 'select', options: boot.designations.map(function (d) { return d.name; }), value: f.designation }, { name: 'status', label: 'Status', type: 'select', options: ['ACTIVE', 'INACTIVE'], value: f.status }]) +
      '<div class="card"><div class="table-wrap" id="emp-table"></div></div>';
    U.qs('[data-apply]', el).addEventListener('click', function () { App.go('#/employees', U.formData(U.qs('[data-filters]', el))); });
    var add = U.qs('[data-add]', el); if (add) add.addEventListener('click', function () { Employees.form(null); });
    var dg = U.qs('[data-desig]', el); if (dg) dg.addEventListener('click', function () { Settings.designationManager(); });
    return Employees.load(f);
  },
  load: function (f) {
    return API.call('employees.list', f).then(function (d) {
      Employees.data = d;
      var rows = d.employees;
      U.qs('#emp-table').innerHTML = '<table class="table table-hover"><thead><tr><th>Employee</th><th>Designation</th><th>Department</th><th>Contact</th><th>Reporting manager</th><th>Hours</th><th>Role</th><th>Status</th><th class="text-end">Actions</th></tr></thead><tbody>' +
        (rows.length ? rows.map(function (e) {
          return '<tr><td><div class="d-flex align-items-center gap-2"><div class="avatar sm">' + U.esc(U.initials(e.EmployeeName)) + '</div><div><div class="fw-semibold">' + U.esc(e.EmployeeName) + '</div><div class="small-muted">' + U.esc(e.EmployeeID) + ' · joined ' + U.dmy(e.JoiningDate) + '</div></div></div></td><td>' + U.esc(e.Designation) + '</td><td><span class="badge text-bg-light">' + U.esc(e.Department) + '</span></td><td><div class="small">' + U.esc(e.Email) + '</div><div class="small-muted">' + U.esc(e.Mobile) + '</div></td><td>' + U.esc(e.ReportingManagerName || '—') + '</td><td class="small">' + U.esc(e.WorkStart) + '–' + U.esc(e.WorkEnd) + '<div class="small-muted">' + e.WorkingHours + 'h · ' + e.BreakMinutes + 'm break</div></td><td class="small">' + U.esc(U.roleLabel(e.Role)) + '</td><td>' + U.st(e.Status) + '</td>' +
            '<td class="text-end text-nowrap"><button class="btn btn-sm btn-light" data-profile="' + U.attr(e.EmployeeID) + '" title="Profile & history"><i class="bi bi-person-vcard"></i></button> ' + (App.isAdmin() ? '<button class="btn btn-sm btn-light" data-edit="' + U.attr(e.EmployeeID) + '" title="Edit"><i class="bi bi-pencil"></i></button> <button class="btn btn-sm btn-light" data-status="' + U.attr(e.EmployeeID) + '" data-cur="' + e.Status + '" title="' + (e.Status === 'ACTIVE' ? 'Deactivate' : 'Activate') + '"><i class="bi ' + (e.Status === 'ACTIVE' ? 'bi-person-x' : 'bi-person-check') + '"></i></button>' : '') + '</td></tr>';
        }).join('') : '<tr><td colspan="9">' + App.empty('No employees found') + '</td></tr>') + '</tbody></table>';
      U.qsa('[data-edit]').forEach(function (b) { b.addEventListener('click', function () { Employees.form(rows.filter(function (e) { return e.EmployeeID === b.getAttribute('data-edit'); })[0]); }); });
      U.qsa('[data-profile]').forEach(function (b) { b.addEventListener('click', function () { Employees.profile(b.getAttribute('data-profile')); }); });
      U.qsa('[data-status]').forEach(function (b) { b.addEventListener('click', function () {
        var id = b.getAttribute('data-status'), cur = b.getAttribute('data-cur'), next = cur === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
        App.confirm((next === 'INACTIVE' ? 'Deactivate' : 'Activate') + ' employee <b>' + U.esc(id) + '</b>?' + (next === 'INACTIVE' ? ' Their sessions will be ended and they will not be able to log in.' : ''), { danger: next === 'INACTIVE', okText: next === 'INACTIVE' ? 'Deactivate' : 'Activate' }).then(function (ok) {
          if (!ok) return; API.call('employees.setStatus', { employeeId: id, status: next }).then(function (r) { App.toast(r.status === 'ACTIVE' ? 'Employee activated' : 'Employee deactivated', 'success'); App.refreshBoot().then(function () { App.route(); }); });
        });
      }); });
    });
  },

  /** Add / edit form. Department is read-only and resolved from the designation. */
  form: function (emp) {
    var boot = App.state.boot;
    var managers = (Employees.data && Employees.data.managers) || [];
    var desigs = boot.designations.map(function (d) { return d.name; });
    var isNew = !emp; emp = emp || {};
    var m = App.modal({ title: isNew ? 'Add employee' : 'Edit employee — ' + U.esc(emp.EmployeeName), size: 'lg', static: true,
      body: '<form id="emp-form" class="row g-3">' +
        '<div class="col-md-6"><label class="form-label">Employee name *</label><input class="form-control" name="EmployeeName" required value="' + U.attr(emp.EmployeeName || '') + '"></div>' +
        '<div class="col-md-6"><label class="form-label">Designation *</label><input class="form-control" name="Designation" list="desig-list" required value="' + U.attr(emp.Designation || '') + '" placeholder="Start typing…"><datalist id="desig-list">' + desigs.map(function (d) { return '<option value="' + U.attr(d) + '">'; }).join('') + '</datalist>' +
        '<div class="small mt-1" data-resolve><span class="text-muted">Department is assigned automatically from the designation.</span></div></div>' +
        '<div class="col-md-6"><label class="form-label">Department (auto)</label><input class="form-control bg-light" name="Department" readonly value="' + U.attr(emp.Department || '') + '" placeholder="Resolved from designation"></div>' +
        '<div class="col-md-6"><label class="form-label">Reporting manager</label><select class="form-select" name="ReportingManagerID"><option value="">— Use department default —</option>' + U.opts(managers.filter(function (x) { return x.EmployeeID !== emp.EmployeeID; }).map(function (x) { return { value: x.EmployeeID, label: x.EmployeeName + ' (' + x.Department + ')' }; }), emp.ReportingManagerID) + '</select></div>' +
        '<div class="col-md-6"><label class="form-label">E-mail address * (login)</label><input type="email" class="form-control" name="Email" required value="' + U.attr(emp.Email || '') + '"></div>' +
        '<div class="col-md-3"><label class="form-label">Mobile number</label><input class="form-control" name="Mobile" value="' + U.attr(emp.Mobile || '') + '" placeholder="10 digits"></div>' +
        '<div class="col-md-3"><label class="form-label">WhatsApp number</label><input class="form-control" name="WhatsAppNumber" value="' + U.attr(emp.WhatsAppNumber || '') + '" placeholder="defaults to mobile"></div>' +
        '<div class="col-md-3"><label class="form-label">Joining date</label><input type="date" class="form-control" name="JoiningDate" value="' + U.attr(emp.JoiningDate || U.today()) + '"></div>' +
        '<div class="col-md-3"><label class="form-label">Work start</label><input type="time" class="form-control" name="WorkStart" value="' + U.attr(emp.WorkStart || boot.settings.WORK_START) + '"></div>' +
        '<div class="col-md-3"><label class="form-label">Work end</label><input type="time" class="form-control" name="WorkEnd" value="' + U.attr(emp.WorkEnd || boot.settings.WORK_END) + '"></div>' +
        '<div class="col-md-3"><label class="form-label">Working hours / day</label><input type="number" step="0.5" min="1" max="16" class="form-control" name="WorkingHours" value="' + U.attr(emp.WorkingHours || boot.settings.WORKING_HOURS) + '"></div>' +
        '<div class="col-md-3"><label class="form-label">Break (minutes)</label><input type="number" min="0" max="240" class="form-control" name="BreakMinutes" value="' + U.attr(emp.BreakMinutes !== undefined ? emp.BreakMinutes : boot.settings.BREAK_MINUTES) + '"></div>' +
        '<div class="col-md-4"><label class="form-label">Role</label><select class="form-select" name="Role">' + U.opts(boot.lists.roles.filter(function (r) { return App.state.user.role === 'SUPER_ADMIN' || ['EMPLOYEE', 'DEPARTMENT_MANAGER'].indexOf(r) !== -1; }).map(function (r) { return { value: r, label: U.roleLabel(r) }; }), emp.Role || 'EMPLOYEE') + '</select></div>' +
        '<div class="col-md-5"><label class="form-label">Status</label><select class="form-select" name="Status">' + U.opts(['ACTIVE', 'INACTIVE'], emp.Status || 'ACTIVE') + '</select></div>' +
        '<div class="col-12"><label class="form-label">Notes</label><input class="form-control" name="Notes" value="' + U.attr(emp.Notes || '') + '"></div>' +
        (isNew ? '' : '<input type="hidden" name="EmployeeID" value="' + U.attr(emp.EmployeeID) + '">') + '</form>',
      footer: '<button class="btn btn-light" data-bs-dismiss="modal">Cancel</button><button class="btn btn-primary" data-save><i class="bi bi-check2 me-1"></i>' + (isNew ? 'Create employee' : 'Save changes') + '</button>' });
    var form = U.qs('#emp-form', m.el), desigIn = U.qs('[name=Designation]', form), deptIn = U.qs('[name=Department]', form), hint = U.qs('[data-resolve]', form);
    var resolve = U.debounce(function () {
      var v = desigIn.value.trim();
      if (!v) { deptIn.value = ''; hint.innerHTML = '<span class="text-muted">Department is assigned automatically from the designation.</span>'; return; }
      API.call('designations.resolve', { designation: v }, { silent: true, noLoader: true }).then(function (d) {
        if (d.mapped) { deptIn.value = d.mapping.Department; hint.innerHTML = '<span class="text-success"><i class="bi bi-check-circle me-1"></i>Auto-assigned to <b>' + U.esc(d.mapping.Department) + '</b> · questionnaire: ' + U.esc(d.mapping.QuestionnaireKey) + '</span>'; }
        else { deptIn.value = ''; hint.innerHTML = '<span class="text-danger"><i class="bi bi-exclamation-circle me-1"></i>No mapping for "' + U.esc(v) + '".</span> <a href="#" data-create-map>Create mapping &amp; questionnaire</a>'; U.qs('[data-create-map]', hint).addEventListener('click', function (e) { e.preventDefault(); Settings.designationForm({ DesignationName: v }, function () { resolve(); }); }); }
      }).catch(function () { });
    }, 350);
    desigIn.addEventListener('input', resolve); desigIn.addEventListener('change', resolve);
    if (emp.Designation) resolve();
    U.qs('[data-save]', m.el).addEventListener('click', function () {
      if (!form.reportValidity()) return;
      var data = U.formData(form); delete data.Department;
      API.call('employees.save', data).then(function (d) {
        App.toast('Saved. Department: ' + d.autoAssigned.department, 'success'); m.close();
        App.refreshBoot().then(function () { App.route(); });
      }).catch(function (e) {
        if (e.code === 'DESIGNATION_UNMAPPED') { App.confirm('Designation <b>' + U.esc(e.data.designation) + '</b> has no department mapping. Create it now?', { okText: 'Create mapping' }).then(function (ok) { if (ok) Settings.designationForm({ DesignationName: e.data.designation }, function () { resolve(); }); }); }
      });
    });
  },

  /** Profile & activity history drawer. */
  profile: function (id) {
    var to = U.today(), from = U.addDays(to, -29);
    API.call('employees.history', { employeeId: id, dateFrom: from, dateTo: to }).then(function (d) {
      var e = d.employee;
      App.modal({ title: '<div class="d-flex align-items-center gap-2"><div class="avatar">' + U.esc(U.initials(e.EmployeeName)) + '</div><div>' + U.esc(e.EmployeeName) + '<div class="small text-muted fw-normal">' + U.esc(e.EmployeeID) + ' · ' + U.esc(e.Designation) + ' · ' + U.esc(e.Department) + '</div></div></div>', size: 'xl',
        body: '<div class="row g-3"><div class="col-md-4"><div class="help-box"><div class="row-kv"><div class="small-muted">E-mail</div><div>' + U.esc(e.Email) + '</div></div><div class="mt-2"><div class="small-muted">Mobile / WhatsApp</div><div>' + U.esc(e.Mobile || '—') + ' / ' + U.esc(e.WhatsAppNumber || '—') + '</div></div><div class="mt-2"><div class="small-muted">Reporting manager</div><div>' + U.esc(e.ReportingManagerName || '—') + '</div></div><div class="mt-2"><div class="small-muted">Schedule</div><div>' + U.esc(e.WorkStart) + ' – ' + U.esc(e.WorkEnd) + ' · ' + e.WorkingHours + ' h · ' + e.BreakMinutes + ' min break</div></div><div class="mt-2"><div class="small-muted">Role / status</div><div>' + U.esc(U.roleLabel(e.Role)) + ' · ' + U.st(e.Status) + '</div></div><div class="mt-2"><div class="small-muted">Joined</div><div>' + U.dmy(e.JoiningDate) + '</div></div></div>' +
          '<div class="kpi-grid mt-3" style="grid-template-columns:1fr 1fr">' + App.kpi('Reports (30d)', d.reports.length, d.reports.filter(function (r) { return ['SUBMITTED', 'APPROVED'].indexOf(r.Status) !== -1; }).length + ' submitted') + App.kpi('Tasks (30d)', d.tasks.length, d.tasks.filter(function (t) { return t.Status === 'COMPLETED'; }).length + ' completed') + '</div></div>' +
          '<div class="col-md-8"><ul class="nav nav-tabs mb-3"><li class="nav-item"><a class="nav-link active" data-bs-toggle="tab" href="#ph-days">Daily activity</a></li><li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#ph-reports">Reports</a></li><li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#ph-diff">Difficulties</a></li>' + (App.isAdmin() ? '<li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#ph-logs">Audit log</a></li>' : '') + '</ul><div class="tab-content">' +
          '<div class="tab-pane fade show active" id="ph-days"><div class="table-wrap"><table class="table table-sm"><thead><tr><th>Date</th><th class="text-center">Tasks</th><th class="text-center">Completed</th><th class="text-center">Hours</th><th class="text-center">Difficulties</th></tr></thead><tbody>' + (d.timeline.length ? d.timeline.map(function (t) { return '<tr><td>' + U.dmy(t.date) + '</td><td class="text-center">' + t.tasks + '</td><td class="text-center">' + t.completed + '</td><td class="text-center">' + U.dur(t.minutes) + '</td><td class="text-center">' + t.difficulties + '</td></tr>'; }).join('') : '<tr><td colspan="5">' + App.empty('No activity in the last 30 days') + '</td></tr>') + '</tbody></table></div></div>' +
          '<div class="tab-pane fade" id="ph-reports"><div class="table-wrap"><table class="table table-sm"><thead><tr><th>Date</th><th>Status</th><th class="text-center">Tasks</th><th class="text-center">Completion</th><th class="text-center">Hours</th><th></th></tr></thead><tbody>' + (d.reports.length ? d.reports.map(function (r) { return '<tr><td>' + U.dmy(r.Date) + '</td><td>' + U.st(r.Status) + '</td><td class="text-center">' + r.TotalTasks + '</td><td class="text-center">' + U.pct(r.CompletionRate) + '</td><td class="text-center">' + U.dur(r.RecordedMinutes) + '</td><td class="text-end"><a href="#" onclick="App.go(\'#/reports\',{employeeId:\'' + e.EmployeeID + '\',date:\'' + r.Date + '\',open:1});return false;">Open</a></td></tr>'; }).join('') : '<tr><td colspan="6">' + App.empty('No reports') + '</td></tr>') + '</tbody></table></div></div>' +
          '<div class="tab-pane fade" id="ph-diff">' + (d.difficulties.length ? '<div class="list-group">' + d.difficulties.map(function (x) { return '<div class="list-group-item py-2"><div class="d-flex justify-content-between"><b class="small">' + U.esc(x.TaskName) + '</b>' + U.st(x.ResolutionStatus) + '</div><div class="small">' + U.esc(x.ProblemDescription) + '</div><div class="small-muted">' + U.esc(x.Category) + ' · ' + U.dmy(x.Date) + '</div></div>'; }).join('') + '</div>' : App.empty('No difficulties recorded')) + '</div>' +
          (App.isAdmin() ? '<div class="tab-pane fade" id="ph-logs"><div class="table-wrap"><table class="table table-sm"><thead><tr><th>Time</th><th>Action</th><th>Entity</th><th>Details</th></tr></thead><tbody>' + (d.logs.length ? d.logs.slice().reverse().map(function (l) { return '<tr><td class="small text-nowrap">' + U.esc(String(l.Timestamp).replace('T', ' ')) + '</td><td class="small">' + U.esc(l.Action) + '</td><td class="small">' + U.esc(l.Entity) + ' ' + U.esc(l.EntityID) + '</td><td class="small text-muted text-truncate" style="max-width:260px">' + U.esc(l.Details) + '</td></tr>'; }).join('') : '<tr><td colspan="4">' + App.empty('No log entries') + '</td></tr>') + '</tbody></table></div></div>' : '') +
          '</div></div></div>' });
    });
  }
};
App.views['#/employees'] = Employees.render;
