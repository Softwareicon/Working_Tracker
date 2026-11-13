/**
 * tracker.js — Daily Work Tracker (employee-facing): tasks + timers, questionnaire with auto-save,
 * difficulty reporting, timeline, and end-of-day submission.
 */
var Tracker = {
  state: { date: '', employeeId: '', tasks: [], q: null, answers: {}, dirty: false, saveTimer: null, tick: null, tab: 'tasks' },

  render: function (el, q) {
    var u = App.state.user;
    var s = Tracker.state;
    s.date = q.date || U.today();
    s.employeeId = (App.isManagerUp() && q.employeeId) ? q.employeeId : u.employeeId;
    s.tab = q.tab || s.tab || 'tasks';
    clearInterval(s.tick);
    var isSelf = s.employeeId === u.employeeId;
    var emp = App.state.boot.employees.filter(function (e) { return e.EmployeeID === s.employeeId; })[0] || u;
    el.innerHTML = '<div class="page-head"><div><h1>Daily Work Tracker</h1><div class="sub"><b>' + U.esc(emp.EmployeeName || u.name) + '</b> · ' + U.esc(emp.Designation || u.designation) + ' · <span class="badge text-bg-light">' + U.esc(emp.Department || u.department) + '</span> <span class="small-muted">(department auto-assigned)</span></div></div>' +
      '<div class="actions-right d-flex gap-2 align-items-center">' + (App.isManagerUp() ? '<select class="form-select form-select-sm" data-emp style="max-width:220px">' + U.opts(App.employeeOptions(), s.employeeId) + '</select>' : '') + '<input type="date" class="form-control form-control-sm" data-date value="' + s.date + '" max="' + U.today() + '" style="max-width:160px"></div></div>' +
      '<div id="tracker-status" class="mb-3"></div>' +
      '<ul class="nav nav-tabs mb-3" id="tracker-tabs"><li class="nav-item"><a class="nav-link ' + (s.tab === 'tasks' ? 'active' : '') + '" href="#" data-tab="tasks"><i class="bi bi-list-task me-1"></i>Tasks & timers</a></li><li class="nav-item"><a class="nav-link ' + (s.tab === 'questionnaire' ? 'active' : '') + '" href="#" data-tab="questionnaire"><i class="bi bi-ui-checks me-1"></i>Daily questionnaire</a></li><li class="nav-item"><a class="nav-link ' + (s.tab === 'timeline' ? 'active' : '') + '" href="#" data-tab="timeline"><i class="bi bi-clock-history me-1"></i>Timeline</a></li><li class="nav-item"><a class="nav-link ' + (s.tab === 'submit' ? 'active' : '') + '" href="#" data-tab="submit"><i class="bi bi-send-check me-1"></i>Submit report</a></li></ul>' +
      '<div id="tracker-pane"></div>';
    U.qs('[data-date]', el).addEventListener('change', function (e) { App.go('#/tracker', { date: e.target.value, employeeId: s.employeeId !== u.employeeId ? s.employeeId : '', tab: s.tab }); });
    var es = U.qs('[data-emp]', el); if (es) es.addEventListener('change', function (e) { App.go('#/tracker', { date: s.date, employeeId: e.target.value, tab: s.tab }); });
    U.qsa('[data-tab]', el).forEach(function (a) { a.addEventListener('click', function (e) { e.preventDefault(); s.tab = a.getAttribute('data-tab'); U.qsa('[data-tab]', el).forEach(function (x) { x.classList.toggle('active', x === a); }); Tracker.pane(); }); });
    return Tracker.reload();
  },

  reload: function () {
    var s = Tracker.state;
    return Promise.all([
      API.call('tasks.list', { employeeId: s.employeeId, date: s.date }),
      API.call('questionnaire.get', { employeeId: s.employeeId, date: s.date }),
      API.call('reports.get', { employeeId: s.employeeId, date: s.date, live: true })
    ]).then(function (r) {
      s.tasks = r[0].tasks; s.q = r[1]; s.answers = r[1].answers || {}; s.report = r[2].report; s.locked = r[1].locked;
      Tracker.statusBar(); Tracker.pane();
      if (s.employeeId === App.state.user.employeeId) App.setRunning(s.tasks.filter(function (t) { return t.TimerState === 'RUNNING'; })[0] || null);
    });
  },

  statusBar: function () {
    var s = Tracker.state, r = s.report, sm = r.summary;
    var qPct = 0, total = 0, answered = 0;
    s.q.questionnaire.sections.forEach(function (sec) { sec.questions.forEach(function (q) { if (!Tracker.visible(q)) return; total++; var a = s.answers[q.QuestionID]; if (a !== undefined && a !== '' && !(Array.isArray(a) && !a.length)) answered++; }); });
    qPct = total ? Math.round(answered / total * 100) : 0;
    U.qs('#tracker-status').innerHTML = '<div class="kpi-grid mb-0">' +
      App.kpi('Report status', U.st(r.status) + (s.locked ? ' <i class="bi bi-lock-fill text-muted" title="Locked after approval"></i>' : ''), U.dmy(s.date)) +
      App.kpi('Tasks', sm.totalTasks, sm.completed + ' done · ' + sm.inProgress + ' in progress · ' + (sm.pending + sm.onHold + sm.blocked) + ' open', 'navy') +
      App.kpi('Recorded time', U.dur(sm.recordedMinutes), 'unallocated ' + U.dur(sm.unallocatedMinutes), 'good') +
      App.kpi('Questionnaire', qPct + '%', answered + '/' + total + ' answered · ' + U.esc(s.q.status.replace('_', ' ').toLowerCase()), qPct === 100 ? 'good' : 'warn') + '</div>';
  },

  pane: function () {
    var s = Tracker.state, p = U.qs('#tracker-pane');
    clearInterval(s.tick);
    if (!p) return;
    if (s.tab === 'tasks') Tracker.tasksPane(p);
    else if (s.tab === 'questionnaire') Tracker.questionnairePane(p);
    else if (s.tab === 'timeline') p.innerHTML = '<div class="card"><div class="card-header"><i class="bi bi-clock-history"></i>How the day was spent<span class="ms-auto small text-muted">' + U.dur(s.report.time.recordedMinutes) + ' recorded</span></div><div class="card-body">' + Tracker.timelineHtml(s.report.time) + '</div></div>';
    else Tracker.submitPane(p);
  },

  // ------------------------------------------------------------------ Tasks
  tasksPane: function (p) {
    var s = Tracker.state, locked = s.locked, isToday = s.date === U.today();
    var open = s.tasks.filter(function (t) { return t.Status !== 'COMPLETED'; }), done = s.tasks.filter(function (t) { return t.Status === 'COMPLETED'; });
    var card = function (t) {
      var running = t.TimerState === 'RUNNING';
      var btns = '';
      if (!locked) {
        if (t.Status !== 'COMPLETED') {
          if (running) btns += '<button class="btn btn-sm btn-warning" data-timer="pause" data-id="' + t.TaskID + '"><i class="bi bi-pause-fill"></i> Pause</button>';
          else if (isToday) btns += '<button class="btn btn-sm btn-primary" data-timer="' + (t.TimerState === 'PAUSED' ? 'resume' : 'start') + '" data-id="' + t.TaskID + '"><i class="bi bi-play-fill"></i> ' + (t.TimerState === 'PAUSED' ? 'Resume' : 'Start') + '</button>';
          btns += '<button class="btn btn-sm btn-success" data-timer="complete" data-id="' + t.TaskID + '"><i class="bi bi-check2"></i> Complete</button>';
        }
        btns += '<button class="btn btn-sm btn-light" data-manual="' + t.TaskID + '" title="Add manual time"><i class="bi bi-clock-history"></i></button><button class="btn btn-sm btn-light" data-diff="' + t.TaskID + '" title="Report difficulty"><i class="bi bi-exclamation-triangle"></i></button><button class="btn btn-sm btn-light" data-edit="' + t.TaskID + '" title="Edit"><i class="bi bi-pencil"></i></button><button class="btn btn-sm btn-light text-danger" data-del="' + t.TaskID + '" title="Delete"><i class="bi bi-trash"></i></button>';
      }
      btns += '<button class="btn btn-sm btn-light" data-logs="' + t.TaskID + '" title="Time entries"><i class="bi bi-list-ul"></i></button>';
      return '<div class="task-card ' + (running ? 'running' : '') + '" data-task="' + t.TaskID + '"><div class="prio-bar prio-' + t.Priority + '"></div><div class="flex-grow-1 min-w-0"><div class="d-flex align-items-center gap-2 flex-wrap"><span class="title">' + U.esc(t.TaskTitle) + '</span>' + U.st(t.Status) + U.st(t.Priority) + (running ? '<span class="elapsed" data-elapsed="' + t.TaskID + '">00:00:00</span>' : '') + '</div>' +
        (t.TaskDescription ? '<div class="small text-muted mt-1">' + U.esc(t.TaskDescription) + '</div>' : '') +
        '<div class="meta"><span><i class="bi bi-tag me-1"></i>' + U.esc(t.TaskCategory) + '</span><span><i class="bi bi-stopwatch me-1"></i>' + U.dur(t.TimeSpentMinutes) + '</span>' + (t.StartLabel ? '<span><i class="bi bi-clock me-1"></i>' + U.esc(t.StartLabel) + (t.EndLabel ? ' – ' + U.esc(t.EndLabel) : '') + '</span>' : '') + '<span><i class="bi bi-percent me-1"></i>' + t.CompletionPercent + '%</span>' + (t.RelatedDepartment ? '<span><i class="bi bi-diagram-2 me-1"></i>' + U.esc(t.RelatedDepartment) + '</span>' : '') + (t.PendingReason ? '<span class="text-warning"><i class="bi bi-info-circle me-1"></i>' + U.esc(t.PendingReason) + '</span>' : '') + '</div></div><div class="actions">' + btns + '</div></div>';
    };
    p.innerHTML = '<div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2"><div class="text-muted small">Record every activity as a task. Use the timer for live tracking, or enter start/end times manually.</div>' + (locked ? '<span class="badge text-bg-warning"><i class="bi bi-lock me-1"></i>Locked after approval</span>' : '<div class="d-flex gap-2"><button class="btn btn-outline-primary" data-bulk><i class="bi bi-list-check me-1"></i>Bulk add tasks</button><button class="btn btn-primary" data-add><i class="bi bi-plus-circle me-1"></i>Add task</button></div>') + '</div>' +
      (s.tasks.length ? (open.length ? '<h6 class="text-muted small text-uppercase fw-bold mb-2">Open tasks (' + open.length + ')</h6>' + open.map(card).join('') : '') + (done.length ? '<h6 class="text-muted small text-uppercase fw-bold mb-2 mt-3">Completed (' + done.length + ')</h6>' + done.map(card).join('') : '') : App.empty('No tasks recorded for ' + U.dmy(s.date) + '. Add your first task to start tracking.', 'bi-journal-plus'));
    var add = U.qs('[data-add]', p); if (add) add.addEventListener('click', function () { Tracker.taskForm(null); });
    var bulk = U.qs('[data-bulk]', p); if (bulk) bulk.addEventListener('click', function () { Tracker.bulkForm(); });
    U.qsa('[data-timer]', p).forEach(function (b) { b.addEventListener('click', function () { Tracker.timer(b.getAttribute('data-id'), b.getAttribute('data-timer')); }); });
    U.qsa('[data-edit]', p).forEach(function (b) { b.addEventListener('click', function () { Tracker.taskForm(Tracker.task(b.getAttribute('data-edit'))); }); });
    U.qsa('[data-del]', p).forEach(function (b) { b.addEventListener('click', function () { var t = Tracker.task(b.getAttribute('data-del')); App.confirm('Delete task <b>' + U.esc(t.TaskTitle) + '</b> and its time entries?', { danger: true, okText: 'Delete' }).then(function (ok) { if (ok) API.call('tasks.delete', { TaskID: t.TaskID }).then(function () { App.toast('Task deleted', 'success'); Tracker.reload(); }); }); }); });
    U.qsa('[data-manual]', p).forEach(function (b) { b.addEventListener('click', function () { Tracker.manualTime(Tracker.task(b.getAttribute('data-manual'))); }); });
    U.qsa('[data-diff]', p).forEach(function (b) { b.addEventListener('click', function () { Difficulty.form({ TaskID: b.getAttribute('data-diff'), Date: s.date, EmployeeID: s.employeeId }, function () { Tracker.reload(); }); }); });
    U.qsa('[data-logs]', p).forEach(function (b) { b.addEventListener('click', function () { Tracker.logs(b.getAttribute('data-logs')); }); });
    // live elapsed
    var running = s.tasks.filter(function (t) { return t.TimerState === 'RUNNING'; });
    if (running.length) {
      var loaded = Date.now();
      var tick = function () { running.forEach(function (t) { var el = U.qs('[data-elapsed="' + t.TaskID + '"]', p); if (el) el.textContent = U.hms(t.TimeSpentMinutes * 60 + (Date.now() - loaded) / 1000); }); };
      tick(); s.tick = setInterval(tick, APP_CONFIG.TIMER_TICK_MS);
    }
  },
  task: function (id) { return Tracker.state.tasks.filter(function (t) { return t.TaskID === id; })[0]; },

  timer: function (id, action) {
    API.call('tasks.timer', { TaskID: id, action: action }).then(function (d) { App.toast(d && d.task ? (action === 'complete' ? 'Task completed — ' + d.task.TimeSpentLabel : 'Timer ' + action + (action === 'pause' ? 'd' : 'ed')) : 'Done', 'success'); Tracker.reload(); })
      .catch(function (e) { if (e.code === 'TIMER_CONFLICT' && e.data) { App.confirm('<b>' + U.esc(e.data.runningTaskTitle) + '</b> is already running. Pause it and start this task instead?', { okText: 'Pause & start' }).then(function (ok) { if (ok) API.call('tasks.timer', { TaskID: e.data.runningTaskId, action: 'pause' }).then(function () { return API.call('tasks.timer', { TaskID: id, action: 'start' }); }).then(function () { Tracker.reload(); }); }); } });
  },

  taskForm: function (t) {
    var s = Tracker.state, boot = App.state.boot, isNew = !t; t = t || {};
    var toLocal = function (iso) { return iso ? String(iso).substring(0, 16) : ''; };
    var m = App.modal({ title: isNew ? 'Add task' : 'Edit task', size: 'lg', static: true,
      body: '<form id="task-form" class="row g-3">' +
        '<div class="col-md-8"><label class="form-label">Task title *</label><input class="form-control" name="TaskTitle" required maxlength="200" value="' + U.attr(t.TaskTitle || '') + '" placeholder="e.g. Customer follow-up calls"></div>' +
        '<div class="col-md-4"><label class="form-label">Category</label><select class="form-select" name="TaskCategory">' + U.opts(boot.lists.taskCategories, t.TaskCategory || 'Other') + '</select></div>' +
        '<div class="col-12"><label class="form-label">Description</label><textarea class="form-control" name="TaskDescription" rows="2">' + U.esc(t.TaskDescription || '') + '</textarea></div>' +
        '<div class="col-md-3"><label class="form-label">Priority</label><select class="form-select" name="Priority">' + U.opts(boot.lists.taskPriorities, t.Priority || 'MEDIUM') + '</select></div>' +
        '<div class="col-md-3"><label class="form-label">Status</label><select class="form-select" name="Status">' + U.opts(boot.lists.taskStatuses, t.Status || 'PENDING') + '</select></div>' +
        '<div class="col-md-3"><label class="form-label">Completion %</label><input type="number" min="0" max="100" class="form-control" name="CompletionPercent" value="' + U.attr(t.CompletionPercent !== undefined ? t.CompletionPercent : 0) + '"></div>' +
        '<div class="col-md-3"><label class="form-label">Related department</label><select class="form-select" name="RelatedDepartment"><option value="">None</option>' + U.opts(App.deptOptions(), t.RelatedDepartment) + '</select></div>' +
        (isNew ? '<div class="col-md-6"><label class="form-label">Start time <span class="small-muted">(optional – leave blank to use the timer)</span></label><input type="datetime-local" class="form-control" name="StartTime" value="' + U.attr(toLocal(t.StartTime)) + '" min="' + s.date + 'T00:00" max="' + s.date + 'T23:59"></div><div class="col-md-6"><label class="form-label">End time</label><input type="datetime-local" class="form-control" name="EndTime" value="' + U.attr(toLocal(t.EndTime)) + '" min="' + s.date + 'T00:00" max="' + s.date + 'T23:59"></div>' : '') +
        '<div class="col-md-6"><label class="form-label">Pending reason <span class="small-muted">(if not completed)</span></label><input class="form-control" name="PendingReason" value="' + U.attr(t.PendingReason || '') + '"></div>' +
        '<div class="col-md-3"><label class="form-label">Expected completion</label><input type="date" class="form-control" name="ExpectedCompletionDate" value="' + U.attr(t.ExpectedCompletionDate || '') + '"></div>' +
        '<div class="col-md-3"><label class="form-label">Responsible dependency</label><input class="form-control" name="ResponsibleDependency" value="' + U.attr(t.ResponsibleDependency || '') + '" placeholder="e.g. Accounts / Customer"></div>' +
        '<div class="col-md-6"><label class="form-label">Supporting documents (links)</label><input class="form-control" name="SupportingDocuments" value="' + U.attr(t.SupportingDocuments || '') + '" placeholder="Drive / file links"></div>' +
        '<div class="col-md-6"><label class="form-label">Remarks</label><input class="form-control" name="Remarks" value="' + U.attr(t.Remarks || '') + '"></div>' +
        (isNew ? '<input type="hidden" name="Date" value="' + s.date + '"><input type="hidden" name="EmployeeID" value="' + s.employeeId + '">' : '<input type="hidden" name="TaskID" value="' + t.TaskID + '">') + '</form>',
      footer: '<button class="btn btn-light" data-bs-dismiss="modal">Cancel</button><button class="btn btn-primary" data-save><i class="bi bi-check2 me-1"></i>' + (isNew ? 'Add task' : 'Save') + '</button>' + (isNew && s.date === U.today() ? '<button class="btn btn-success" data-save-start><i class="bi bi-play-fill me-1"></i>Add & start timer</button>' : '') });
    var form = U.qs('#task-form', m.el);
    var save = function (start) {
      if (!form.reportValidity()) return;
      var data = U.formData(form);
      if (data.StartTime && !data.EndTime) { App.toast('Enter an end time, or leave both blank and use the timer', 'warning'); return; }
      API.call('tasks.save', data).then(function (d) { m.close(); App.toast(isNew ? 'Task added' : 'Task updated', 'success'); if (start) Tracker.timer(d.task.TaskID, 'start'); else Tracker.reload(); }).catch(function () { });
    };
    U.qs('[data-save]', m.el).addEventListener('click', function () { save(false); });
    var ss = U.qs('[data-save-start]', m.el); if (ss) ss.addEventListener('click', function () { save(true); });
  },

  bulkForm: function () {
    var s = Tracker.state, boot = App.state.boot;
    var row = function (n) {
      return '<tr data-row><td class="text-muted small align-middle" data-num>' + n + '</td>' +
        '<td><input class="form-control form-control-sm" name="TaskTitle" maxlength="200" placeholder="Task title *" style="min-width:200px"><textarea class="form-control form-control-sm mt-1" name="TaskDescription" rows="1" placeholder="Details (optional)"></textarea></td>' +
        '<td><select class="form-select form-select-sm" name="TaskCategory" style="min-width:140px">' + U.opts(boot.lists.taskCategories, 'Other') + '</select></td>' +
        '<td><select class="form-select form-select-sm" name="Priority" style="min-width:100px">' + U.opts(boot.lists.taskPriorities, 'MEDIUM') + '</select></td>' +
        '<td><select class="form-select form-select-sm" name="Status" style="min-width:120px">' + U.opts(boot.lists.taskStatuses, 'COMPLETED') + '</select></td>' +
        '<td><input type="time" class="form-control form-control-sm" name="Start" style="min-width:95px"></td>' +
        '<td><input type="time" class="form-control form-control-sm" name="End" style="min-width:95px"></td>' +
        '<td><input type="date" class="form-control form-control-sm" name="ExpectedCompletionDate" style="min-width:130px" title="Expected completion date"><input class="form-control form-control-sm mt-1" name="Remarks" placeholder="Remarks / pending reason" style="min-width:130px"></td>' +
        '<td class="align-middle"><button type="button" class="btn btn-sm btn-light text-danger" data-rm title="Remove row"><i class="bi bi-x-lg"></i></button></td></tr>';
    };
    var m = App.modal({ title: 'Bulk add tasks — ' + U.dmy(s.date), size: 'xl', static: true,
      body: '<div class="d-flex flex-wrap gap-2 align-items-center mb-2"><span class="small text-muted me-auto">Fill one row per task. Only the title is required. Start/end time is optional; leave the expected date blank for tasks finished today.</span>' +
        '<button type="button" class="btn btn-sm btn-light" data-paste><i class="bi bi-clipboard-plus me-1"></i>Paste a list</button><button type="button" class="btn btn-sm btn-light" data-more="1"><i class="bi bi-plus"></i> 1 row</button><button type="button" class="btn btn-sm btn-light" data-more="5"><i class="bi bi-plus"></i> 5 rows</button></div>' +
        '<div class="d-none mb-2" data-paste-box><textarea class="form-control form-control-sm" rows="5" placeholder="One task title per line (you can paste from Excel / WhatsApp)"></textarea><div class="mt-1 text-end"><button type="button" class="btn btn-sm btn-primary" data-paste-apply>Add these as rows</button></div></div>' +
        '<div class="table-responsive"><table class="table table-sm align-top mb-0"><thead><tr><th>#</th><th>Task / details</th><th>Category</th><th>Priority</th><th>Status</th><th>Start</th><th>End</th><th>Expected by / remarks</th><th></th></tr></thead><tbody data-rows>' + [1, 2, 3, 4, 5].map(row).join('') + '</tbody></table></div>' +
        '<div class="alert alert-danger small mt-2 mb-0 d-none" data-errors></div>',
      footer: '<span class="small text-muted me-auto" data-count></span><button class="btn btn-light" data-bs-dismiss="modal">Cancel</button><button class="btn btn-primary" data-save><i class="bi bi-check2-all me-1"></i>Save all tasks</button>' });
    var body = U.qs('[data-rows]', m.el);
    var renumber = function () { var rows = U.qsa('[data-row]', body); rows.forEach(function (r, i) { U.qs('[data-num]', r).textContent = i + 1; }); var n = rows.filter(function (r) { return U.qs('[name=TaskTitle]', r).value.trim(); }).length; U.qs('[data-count]', m.el).textContent = n + ' task' + (n === 1 ? '' : 's') + ' ready'; };
    var addRows = function (n) { for (var i = 0; i < n; i++) body.insertAdjacentHTML('beforeend', row(0)); renumber(); };
    U.qsa('[data-more]', m.el).forEach(function (b) { b.addEventListener('click', function () { addRows(+b.getAttribute('data-more')); }); });
    body.addEventListener('click', function (e) { var b = e.target.closest('[data-rm]'); if (!b) return; var r = b.closest('[data-row]'); if (U.qsa('[data-row]', body).length > 1) r.remove(); else U.qsa('input,textarea', r).forEach(function (x) { x.value = ''; }); renumber(); });
    body.addEventListener('input', renumber);
    U.qs('[data-paste]', m.el).addEventListener('click', function () { U.qs('[data-paste-box]', m.el).classList.toggle('d-none'); });
    U.qs('[data-paste-apply]', m.el).addEventListener('click', function () {
      var ta = U.qs('[data-paste-box] textarea', m.el);
      var titles = ta.value.split(/\r?\n/).map(function (x) { return x.replace(/^\s*(\d+[.)]|[-•*])\s*/, '').trim(); }).filter(Boolean);
      titles.forEach(function (t) {
        var empty = U.qsa('[data-row]', body).filter(function (r) { return !U.qs('[name=TaskTitle]', r).value.trim(); })[0];
        if (!empty) { body.insertAdjacentHTML('beforeend', row(0)); empty = U.qsa('[data-row]', body).pop(); }
        U.qs('[name=TaskTitle]', empty).value = t.substring(0, 200);
      });
      ta.value = ''; U.qs('[data-paste-box]', m.el).classList.add('d-none'); renumber();
    });
    renumber();
    U.qs('[data-save]', m.el).addEventListener('click', function () {
      var errBox = U.qs('[data-errors]', m.el); errBox.classList.add('d-none');
      var tasks = [], problems = [];
      U.qsa('[data-row]', body).forEach(function (r, i) {
        var v = function (n) { var el = U.qs('[name=' + n + ']', r); return el ? el.value.trim() : ''; };
        if (!v('TaskTitle')) { if (v('TaskDescription') || v('Start') || v('End') || v('Remarks')) problems.push('Row ' + (i + 1) + ': task title is required'); return; }
        if (!!v('Start') !== !!v('End')) problems.push('Row ' + (i + 1) + ': enter both start and end time, or neither');
        var st = v('Status');
        tasks.push({ TaskTitle: v('TaskTitle'), TaskDescription: v('TaskDescription'), TaskCategory: v('TaskCategory'), Priority: v('Priority'), Status: st,
          StartTime: v('Start') ? s.date + 'T' + v('Start') : '', EndTime: v('End') ? s.date + 'T' + v('End') : '', ExpectedCompletionDate: v('ExpectedCompletionDate'),
          Remarks: st === 'COMPLETED' ? v('Remarks') : '', PendingReason: st === 'COMPLETED' ? '' : v('Remarks') });
      });
      if (!tasks.length) problems.push('Add at least one task title');
      if (problems.length) { errBox.innerHTML = problems.map(U.esc).join('<br>'); errBox.classList.remove('d-none'); return; }
      API.call('tasks.bulkSave', { EmployeeID: s.employeeId, Date: s.date, tasks: tasks }, { silent: true }).then(function (d) {
        m.close(); App.toast(d.count + ' tasks added', 'success'); Tracker.reload();
      }).catch(function (e) {
        var list = e.data && e.data.errors ? e.data.errors : [e.message];
        errBox.innerHTML = list.map(U.esc).join('<br>'); errBox.classList.remove('d-none');
      });
    });
  },

  manualTime: function (t) {
    var s = Tracker.state, policy = App.state.boot.settings.MANUAL_TIME_POLICY;
    if (policy === 'DISABLED' && !App.isAdmin()) { App.toast('Manual time entries are disabled by the administrator', 'warning'); return; }
    var m = App.modal({ title: 'Add manual time — ' + U.esc(t.TaskTitle), body: '<form id="mt-form" class="row g-3"><div class="col-6"><label class="form-label">Start</label><input type="time" class="form-control" name="start" required></div><div class="col-6"><label class="form-label">End</label><input type="time" class="form-control" name="end" required></div><div class="col-12"><label class="form-label">Reason ' + (policy === 'ALLOW' ? '' : '*') + '</label><input class="form-control" name="Reason" ' + (policy === 'ALLOW' ? '' : 'required') + ' placeholder="e.g. Forgot to start the timer"></div><div class="col-12 small text-muted">Entries cannot overlap other recorded time for ' + U.dmy(s.date) + '.</div></form>',
      footer: '<button class="btn btn-light" data-bs-dismiss="modal">Cancel</button><button class="btn btn-primary" data-save>Add time</button>' });
    U.qs('[data-save]', m.el).addEventListener('click', function () {
      var f = U.qs('#mt-form', m.el); if (!f.reportValidity()) return; var d = U.formData(f);
      API.call('tasks.manualTime', { TaskID: t.TaskID, StartTime: s.date + 'T' + d.start, EndTime: s.date + 'T' + d.end, Reason: d.Reason }).then(function (r) { m.close(); App.toast('Time added: ' + r.task.TimeSpentLabel + ' total', 'success'); Tracker.reload(); }).catch(function () { });
    });
  },

  logs: function (id) {
    API.call('tasks.logs', { TaskID: id }).then(function (d) {
      var m = App.modal({ title: 'Time entries — ' + U.esc(d.task.TaskTitle), body: '<div class="table-wrap"><table class="table table-sm"><thead><tr><th>Start</th><th>End</th><th>Duration</th><th>Source</th><th>Reason</th><th></th></tr></thead><tbody>' + (d.logs.length ? d.logs.map(function (l) { return '<tr><td>' + U.esc(l.StartLabel) + '</td><td>' + U.esc(l.EndLabel) + '</td><td>' + U.dur(l.DurationMinutes) + '</td><td>' + U.st(l.Source) + '</td><td class="small text-muted">' + U.esc(l.Reason) + '</td><td class="text-end">' + (Tracker.state.locked ? '' : '<button class="btn btn-sm btn-light text-danger" data-dl="' + l.LogID + '"><i class="bi bi-trash"></i></button>') + '</td></tr>'; }).join('') : '<tr><td colspan="6">' + App.empty('No time recorded yet') + '</td></tr>') + '</tbody></table></div><div class="small text-muted mt-2">Total (non-overlapping): <b>' + U.esc(d.task.TimeSpentLabel) + '</b></div>' });
      U.qsa('[data-dl]', m.el).forEach(function (b) { b.addEventListener('click', function () { App.confirm('Remove this time entry?', { danger: true, okText: 'Remove' }).then(function (ok) { if (ok) API.call('tasks.deleteLog', { LogID: b.getAttribute('data-dl') }).then(function () { m.close(); Tracker.reload(); }); }); }); });
    });
  },

  // ------------------------------------------------------------ Questionnaire
  visible: function (q) {
    if (!q.ConditionQuestionID) return true;
    var a = Tracker.state.answers[q.ConditionQuestionID];
    if (a === undefined || a === null || a === '') return false;
    var vals = Array.isArray(a) ? a.map(function (x) { return String(x).toUpperCase(); }) : [String(a).toUpperCase()];
    return vals.indexOf(String(q.ConditionValue).toUpperCase()) !== -1;
  },
  questionnairePane: function (p) {
    var s = Tracker.state, def = s.q.questionnaire, ro = s.locked || (s.employeeId !== App.state.user.employeeId && !App.isAdmin());
    var input = function (q) {
      var v = s.answers[q.QuestionID]; var dis = ro ? ' disabled' : '';
      var name = 'q_' + q.QuestionID;
      if (q.QuestionType === 'NUMBER') return '<input type="number" step="any" class="form-control" data-q="' + q.QuestionID + '" value="' + U.attr(v === undefined ? '' : v) + '"' + dis + '>';
      if (q.QuestionType === 'TEXT') return '<input class="form-control" data-q="' + q.QuestionID + '" value="' + U.attr(v || '') + '"' + dis + '>';
      if (q.QuestionType === 'TEXTAREA') return '<textarea class="form-control" rows="2" data-q="' + q.QuestionID + '"' + dis + '>' + U.esc(v || '') + '</textarea>';
      if (q.QuestionType === 'YESNO') return '<div class="btn-group yesno" role="group"><input type="radio" class="btn-check" name="' + name + '" id="' + name + '_y" value="YES" data-q="' + q.QuestionID + '"' + (String(v).toUpperCase() === 'YES' ? ' checked' : '') + dis + '><label class="btn btn-outline-primary btn-sm" for="' + name + '_y">Yes</label><input type="radio" class="btn-check" name="' + name + '" id="' + name + '_n" value="NO" data-q="' + q.QuestionID + '"' + (String(v).toUpperCase() === 'NO' ? ' checked' : '') + dis + '><label class="btn btn-outline-primary btn-sm" for="' + name + '_n">No</label></div>';
      if (q.QuestionType === 'SELECT') return '<select class="form-select" data-q="' + q.QuestionID + '"' + dis + '><option value="">— Select —</option>' + U.opts(q.Options, v) + '</select>';
      if (q.QuestionType === 'MULTISELECT') { var arr = Array.isArray(v) ? v : (v ? [v] : []); return '<div class="d-flex flex-wrap gap-2">' + q.Options.map(function (o, i) { return '<input type="checkbox" class="btn-check" id="' + name + '_' + i + '" value="' + U.attr(o.value) + '" data-q="' + q.QuestionID + '" data-multi="1"' + (arr.indexOf(o.value) !== -1 ? ' checked' : '') + dis + '><label class="btn btn-outline-primary btn-sm" for="' + name + '_' + i + '">' + U.esc(o.label) + '</label>'; }).join('') + '</div>'; }
      return '';
    };
    p.innerHTML = '<div class="card"><div class="card-header"><i class="bi bi-ui-checks"></i>Daily questionnaire for ' + U.esc(App.state.boot.employees.filter(function (e) { return e.EmployeeID === s.employeeId; })[0] ? App.state.boot.employees.filter(function (e) { return e.EmployeeID === s.employeeId; })[0].Designation : App.state.user.designation) + '<span class="ms-auto autosave" data-autosave>' + (s.q.status === 'SUBMITTED' ? '<i class="bi bi-check-circle text-success me-1"></i>Submitted' : 'Auto-save on') + '</span></div><div class="card-body">' +
      (ro ? '<div class="alert alert-warning py-2 small"><i class="bi bi-lock me-1"></i>Read-only' + (s.locked ? ' — locked after approval' : '') + '</div>' : '') +
      def.sections.map(function (sec) { return '<div class="q-section"><h6><i class="bi ' + (sec.key === 'COMMON' ? 'bi-journal-text' : sec.key === 'DEPARTMENT' ? 'bi-diagram-3' : 'bi-person-badge') + '"></i>' + U.esc(sec.title) + ' <span class="badge text-bg-light fw-normal">' + sec.questions.length + '</span></h6>' + sec.questions.map(function (q) { return '<div class="q-item" data-qwrap="' + q.QuestionID + '" ' + (Tracker.visible(q) ? '' : 'style="display:none"') + '><div class="q-text">' + U.esc(q.QuestionText) + (q.Mandatory ? '<span class="req">*</span>' : '') + '</div>' + input(q) + (q.HelpText ? '<div class="help">' + U.esc(q.HelpText) + '</div>' : '') + '</div>'; }).join('') + '</div>'; }).join('') +
      (ro ? '' : '<div class="sticky-submit"><button class="btn btn-outline-primary" data-qsave><i class="bi bi-save me-1"></i>Save draft</button><button class="btn btn-primary" data-qsubmit><i class="bi bi-send-check me-1"></i>' + (s.q.status === 'SUBMITTED' ? 'Update answers' : 'Submit questionnaire') + '</button><span class="small text-muted ms-auto">* mandatory</span></div>') + '</div></div>';
    if (ro) return;
    var collect = function () {
      var a = {};
      U.qsa('[data-q]', p).forEach(function (el) {
        var id = el.getAttribute('data-q');
        if (el.type === 'radio') { if (el.checked) a[id] = el.value; else if (a[id] === undefined) a[id] = a[id]; }
        else if (el.getAttribute('data-multi')) { a[id] = a[id] || []; if (el.checked) a[id].push(el.value); }
        else a[id] = el.value;
      });
      Object.keys(a).forEach(function (k) { if (a[k] === undefined || a[k] === '' || (Array.isArray(a[k]) && !a[k].length)) delete a[k]; });
      return a;
    };
    var refreshVisibility = function () { def.sections.forEach(function (sec) { sec.questions.forEach(function (q) { var w = U.qs('[data-qwrap="' + q.QuestionID + '"]', p); if (w) w.style.display = Tracker.visible(q) ? '' : 'none'; }); }); };
    var save = function (submit) {
      s.answers = collect();
      var ind = U.qs('[data-autosave]', p); if (ind) ind.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Saving…';
      return API.call('questionnaire.save', { employeeId: s.employeeId, date: s.date, answers: s.answers, submit: !!submit }, { noLoader: !submit, silent: !submit }).then(function (r) {
        s.dirty = false; s.q.status = r.status;
        if (ind) ind.innerHTML = submit ? '<i class="bi bi-check-circle text-success me-1"></i>Submitted' : '<i class="bi bi-cloud-check text-success me-1"></i>Draft saved ' + new Date().toLocaleTimeString();
        if (submit) { App.toast('Questionnaire submitted', 'success'); Tracker.reload().then(function () { s.tab = 'submit'; U.qsa('[data-tab]').forEach(function (x) { x.classList.toggle('active', x.getAttribute('data-tab') === 'submit'); }); Tracker.pane(); }); }
        else Tracker.statusBar();
      }).catch(function (e) { if (ind) ind.innerHTML = '<span class="text-danger"><i class="bi bi-exclamation-circle me-1"></i>' + U.esc(submit ? 'Not submitted' : 'Not saved') + '</span>'; if (e.data && e.data.errors && submit) { var first = e.data.errors[0]; var q = null; def.sections.forEach(function (sec) { sec.questions.forEach(function (x) { if (!q && first.indexOf(x.QuestionText) === 0) q = x; }); }); if (q) { var w = U.qs('[data-qwrap="' + q.QuestionID + '"]', p); if (w) { w.scrollIntoView({ behavior: 'smooth', block: 'center' }); var inp = U.qs('[data-q]', w); if (inp) inp.focus(); } } } });
    };
    var autosave = U.debounce(function () { if (s.dirty) save(false); }, APP_CONFIG.AUTOSAVE_MS);
    p.addEventListener('input', function (e) { if (e.target.getAttribute('data-q')) { s.dirty = true; s.answers = collect(); refreshVisibility(); Tracker.statusBar(); autosave(); } });
    p.addEventListener('change', function (e) { if (e.target.getAttribute('data-q')) { s.dirty = true; s.answers = collect(); refreshVisibility(); Tracker.statusBar(); autosave(); } });
    U.qs('[data-qsave]', p).addEventListener('click', function () { save(false).then(function () { App.toast('Draft saved', 'success'); }); });
    U.qs('[data-qsubmit]', p).addEventListener('click', function () { save(true); });
  },

  // ------------------------------------------------------------------ Timeline
  timelineHtml: function (time) {
    if (!time || !time.timeline.length) return App.empty('No time recorded yet. Start a task timer or add manual time.', 'bi-stopwatch');
    var startMin = Math.min.apply(null, [hm(time.workStart)].concat(time.timeline.map(function (x) { return hmIso(x.start); })));
    var endMin = Math.max.apply(null, [hm(time.workEnd)].concat(time.timeline.map(function (x) { return hmIso(x.end); })));
    var span = Math.max(60, endMin - startMin);
    function hm(s) { var p = String(s || '09:00').split(':'); return (+p[0]) * 60 + (+p[1]); }
    function hmIso(s) { var m = String(s).match(/T(\d{2}):(\d{2})/); return m ? (+m[1]) * 60 + (+m[2]) : 0; }
    function lbl(min) { var h = Math.floor(min / 60), mi = min % 60; return ((h % 12) || 12) + (mi ? ':' + U.pad(mi) : '') + (h < 12 ? 'am' : 'pm'); }
    var bar = '<div class="daybar">' + time.timeline.map(function (x, i) { var l = (hmIso(x.start) - startMin) / span * 100, w = Math.max(.5, x.minutes / span * 100); return '<span style="position:absolute;left:' + l + '%;width:' + w + '%;background:' + (STATUS_COLORS[x.status] || CHART_COLORS[i % 8]) + '" title="' + U.attr(x.title + ' · ' + x.startLabel + ' – ' + x.endLabel + ' · ' + U.dur(x.minutes)) + '"></span>'; }).join('') + '</div>';
    bar = bar.replace('class="daybar"', 'class="daybar" style="position:relative"');
    var scale = '<div class="daybar-scale"><span>' + lbl(startMin) + '</span><span>' + lbl(startMin + Math.round(span / 2)) + '</span><span>' + lbl(endMin) + '</span></div>';
    var list = '<div class="timeline mt-3">' + time.timeline.map(function (x) { return '<div class="tl-item"><div class="time">' + U.esc(x.startLabel) + ' – ' + (x.open ? '<span class="text-warning">running</span>' : U.esc(x.endLabel)) + ' <span class="badge text-bg-light ms-1">' + U.durLong(x.minutes) + '</span></div><div class="ttl">' + U.esc(x.title) + ' ' + (x.status ? U.st(x.status) : '') + (x.source === 'MANUAL' ? ' <span class="small-muted">manual</span>' : '') + '</div></div>'; }).join('') + '</div>';
    var cats = Object.keys(time.categoryMinutes || {}).sort(function (a, b) { return time.categoryMinutes[b] - time.categoryMinutes[a]; });
    var catHtml = cats.length ? '<div class="mt-3"><div class="small fw-bold text-muted text-uppercase mb-1">Time by category</div><ul class="list-kv">' + cats.map(function (c) { return '<li><span>' + U.esc(c) + '</span><b>' + U.dur(time.categoryMinutes[c]) + '</b></li>'; }).join('') + '</ul></div>' : '';
    return '<div class="d-flex flex-wrap gap-3 mb-2 small text-muted"><span><b>First entry:</b> ' + (time.firstEntry ? U.time12(time.firstEntry) : '—') + '</span><span><b>Last entry:</b> ' + (time.lastEntry ? U.time12(time.lastEntry) : '—') + '</span><span><b>Recorded:</b> ' + U.durLong(time.recordedMinutes) + '</span><span><b>Unallocated:</b> ' + U.durLong(time.unallocatedMinutes) + '</span><span><b>Utilization:</b> ' + U.pct(time.utilizationRate) + '</span></div>' + bar + scale + list + catHtml;
  },

  // ------------------------------------------------------------------ Submit
  submitPane: function (p) {
    var s = Tracker.state, r = s.report, isSelf = s.employeeId === App.state.user.employeeId || App.isAdmin();
    var submitted = ['SUBMITTED', 'APPROVED'].indexOf(r.status) !== -1;
    var checks = [
      { ok: r.questionnaireStatus === 'SUBMITTED', label: 'Daily questionnaire submitted', fix: 'questionnaire' },
      { ok: r.summary.totalTasks > 0, label: 'At least one task recorded (' + r.summary.totalTasks + ')', fix: 'tasks' },
      { ok: !r.time.timeline.some(function (x) { return x.open; }), label: 'No timer still running', fix: 'tasks' },
      { ok: r.pending.every(function (x) { return x.reason; }), label: 'Every pending task has a reason', fix: 'tasks', soft: true },
      { ok: r.summary.unallocatedMinutes <= 120, label: 'Unallocated time under 2 hours (' + U.dur(r.summary.unallocatedMinutes) + ')', fix: 'tasks', soft: true }
    ];
    p.innerHTML = '<div class="row g-3"><div class="col-lg-5"><div class="card"><div class="card-header"><i class="bi bi-send-check"></i>Submit daily report</div><div class="card-body">' +
      '<ul class="list-unstyled mb-3">' + checks.map(function (c) { return '<li class="d-flex align-items-center gap-2 py-1"><i class="bi ' + (c.ok ? 'bi-check-circle-fill text-success' : (c.soft ? 'bi-exclamation-circle-fill text-warning' : 'bi-x-circle-fill text-danger')) + '"></i><span>' + U.esc(c.label) + '</span>' + (c.ok ? '' : '<a href="#" class="ms-auto small" data-fix="' + c.fix + '">fix</a>') + '</li>'; }).join('') + '</ul>' +
      (submitted ? '<div class="alert alert-success py-2"><i class="bi bi-check2-circle me-1"></i>Report ' + (r.status === 'APPROVED' ? 'approved' : 'submitted') + (r.submittedAt ? ' at ' + U.time12(r.submittedAt) : '') + '.' + (s.locked ? ' Locked.' : ' You can update and resubmit.') + '</div>' : '') +
      (isSelf && !s.locked ? '<label class="form-label">Employee remarks</label><textarea class="form-control" rows="3" data-remarks placeholder="Final comments for the day…">' + U.esc(r.employeeRemarks || '') + '</textarea>' +
        '<div class="d-grid gap-2 mt-3"><button class="btn btn-primary btn-lg" data-submit><i class="bi bi-send-check me-1"></i>' + (submitted ? 'Update submission' : 'Submit daily report') + '</button><button class="btn btn-outline-primary" data-preview><i class="bi bi-file-earmark-text me-1"></i>Preview report</button></div>' : '<div class="d-grid"><button class="btn btn-outline-primary" data-preview><i class="bi bi-file-earmark-text me-1"></i>View report</button></div>') +
      '</div></div></div>' +
      '<div class="col-lg-7"><div class="card"><div class="card-header"><i class="bi bi-whatsapp text-success"></i>WhatsApp preview</div><div class="card-body"><div class="wa-preview">' + U.esc(r.whatsapp) + '</div><div class="d-flex gap-2 mt-2"><button class="btn btn-light btn-sm" data-copy><i class="bi bi-clipboard me-1"></i>Copy</button><button class="btn btn-wa btn-sm" data-wa><i class="bi bi-whatsapp me-1"></i>Share on WhatsApp</button></div></div></div></div></div>';
    U.qsa('[data-fix]', p).forEach(function (a) { a.addEventListener('click', function (e) { e.preventDefault(); s.tab = a.getAttribute('data-fix'); U.qsa('[data-tab]').forEach(function (x) { x.classList.toggle('active', x.getAttribute('data-tab') === s.tab); }); Tracker.pane(); }); });
    U.qs('[data-preview]', p).addEventListener('click', function () { App.go('#/reports', { employeeId: s.employeeId, date: s.date, open: 1 }); });
    U.qs('[data-copy]', p).addEventListener('click', function () { U.copy(r.whatsapp).then(function () { App.toast('Copied', 'success'); }); });
    U.qs('[data-wa]', p).addEventListener('click', function () { Share.dialog({ text: r.whatsapp, selfNumber: App.state.user.whatsapp, managerNumber: '', title: 'Daily report' }); });
    var sb = U.qs('[data-submit]', p);
    if (sb) sb.addEventListener('click', function () {
      var doSubmit = function (confirmNoTasks) {
        API.call('reports.submit', { employeeId: s.employeeId, date: s.date, employeeRemarks: U.qs('[data-remarks]', p).value, resubmit: submitted, confirmNoTasks: !!confirmNoTasks }, { silent: true }).then(function (d) { App.toast('Daily report submitted', 'success'); App.go('#/reports', { employeeId: s.employeeId, date: s.date, open: 1 }); })
          .catch(function (e) { if (e.code === 'CONFIRM_NO_TASKS') App.confirm('No tasks were recorded today. Submit anyway?', { okText: 'Submit without tasks' }).then(function (ok) { if (ok) doSubmit(true); }); else App.toast(e.message, 'danger'); });
      };
      doSubmit(false);
    });
  }
};
App.views['#/tracker'] = Tracker.render;
