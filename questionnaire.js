/**
 * questionnaire.js — Questionnaire Management (admin): add, edit, delete, reorder, activate/deactivate,
 * conditional logic, options, preview per designation, version history.
 */
var Questionnaire = {
  data: null,
  render: function (el, q) {
    var f = { scope: q.scope || '', scopeValue: q.scopeValue || '' };
    el.innerHTML = '<div class="page-head"><div><h1>Questionnaire Management</h1><div class="sub">Designation-specific, department and common questions. Changes apply immediately — no code changes needed.</div></div><div class="actions-right"><button class="btn btn-outline-primary btn-sm" data-preview><i class="bi bi-eye me-1"></i>Preview by designation</button> <button class="btn btn-outline-primary btn-sm" data-history><i class="bi bi-clock-history me-1"></i>Version history</button> <button class="btn btn-primary btn-sm" data-add><i class="bi bi-plus-circle me-1"></i>Add question</button></div></div><div id="q-body"></div>';
    U.qs('[data-add]', el).addEventListener('click', function () { Questionnaire.form(null, f); });
    U.qs('[data-preview]', el).addEventListener('click', function () { Questionnaire.preview(); });
    U.qs('[data-history]', el).addEventListener('click', function () { Questionnaire.history(''); });
    return Questionnaire.load(f);
  },
  load: function (f) {
    return API.call('questionnaire.admin.list', {}).then(function (d) {
      Questionnaire.data = d;
      var groups = {};
      d.questions.forEach(function (q) { var k = q.Scope + '|' + q.ScopeValue; (groups[k] = groups[k] || []).push(q); });
      var keys = Object.keys(groups).sort(function (a, b) { var oa = a.indexOf('COMMON') === 0 ? 0 : a.indexOf('DEPARTMENT') === 0 ? 1 : 2, ob = b.indexOf('COMMON') === 0 ? 0 : b.indexOf('DEPARTMENT') === 0 ? 1 : 2; return oa - ob || a.localeCompare(b); });
      // Add empty groups for questionnaire keys without questions
      d.questionnaireKeys.forEach(function (k) { if (!groups['DESIGNATION|' + k]) { groups['DESIGNATION|' + k] = []; keys.push('DESIGNATION|' + k); } });
      var sel = f.scope ? (f.scope + '|' + (f.scopeValue || '')) : keys[0];
      var body = U.qs('#q-body');
      body.innerHTML = '<div class="row g-3"><div class="col-lg-3"><div class="card"><div class="card-header"><i class="bi bi-collection"></i>Question sets</div><div class="list-group list-group-flush" data-sets>' + keys.map(function (k) { var p = k.split('|'); return '<a href="#" class="list-group-item list-group-item-action d-flex justify-content-between align-items-center ' + (k === sel ? 'active' : '') + '" data-set="' + U.attr(k) + '"><span><span class="small-muted d-block" style="font-size:10px;letter-spacing:.08em">' + p[0] + '</span>' + U.esc(p[1] || 'All employees') + '</span><span class="badge text-bg-light">' + groups[k].length + '</span></a>'; }).join('') + '</div></div></div><div class="col-lg-9" data-list></div></div>';
      var renderList = function (k) {
        var p = k.split('|'), list = groups[k] || [];
        U.qs('[data-list]', body).innerHTML = '<div class="card"><div class="card-header"><i class="bi bi-ui-checks"></i>' + U.esc(p[1] || 'Common questions') + ' <span class="badge text-bg-light">' + p[0] + '</span><span class="ms-auto"><button class="btn btn-sm btn-primary" data-add-here><i class="bi bi-plus"></i> Add to this set</button></span></div>' +
          (list.length ? '<div class="table-wrap"><table class="table table-hover"><thead><tr><th style="width:40px"></th><th>#</th><th>Question</th><th>Type</th><th>Mandatory</th><th>Condition</th><th>v</th><th>Status</th><th class="text-end">Actions</th></tr></thead><tbody>' +
            list.map(function (q, i) { return '<tr class="q-row ' + (q.Active ? '' : 'inactive') + '" data-qid="' + q.QuestionID + '"><td class="text-nowrap"><button class="btn btn-sm btn-light" data-up="' + i + '" ' + (i === 0 ? 'disabled' : '') + '><i class="bi bi-chevron-up"></i></button><button class="btn btn-sm btn-light" data-down="' + i + '" ' + (i === list.length - 1 ? 'disabled' : '') + '><i class="bi bi-chevron-down"></i></button></td><td class="small-muted">' + U.esc(q.QuestionID) + '</td><td><div class="fw-semibold">' + U.esc(q.QuestionText) + '</div>' + (q.Options.length ? '<div class="small text-muted">Options: ' + U.esc(q.Options.map(function (o) { return o.label; }).join(', ')) + '</div>' : '') + (q.HelpText ? '<div class="small-muted">' + U.esc(q.HelpText) + '</div>' : '') + '</td><td><span class="badge text-bg-light">' + q.QuestionType + '</span></td><td>' + (q.Mandatory ? '<i class="bi bi-asterisk text-danger"></i>' : '—') + '</td><td class="small">' + (q.ConditionQuestionID ? 'if ' + U.esc(q.ConditionQuestionID) + ' = ' + U.esc(q.ConditionValue) : '—') + '</td><td class="small-muted">' + q.Version + '</td><td>' + U.st(q.Active ? 'ACTIVE' : 'INACTIVE') + '</td><td class="text-end text-nowrap"><button class="btn btn-sm btn-light" data-edit="' + q.QuestionID + '"><i class="bi bi-pencil"></i></button> <button class="btn btn-sm btn-light" data-toggle="' + q.QuestionID + '" title="' + (q.Active ? 'Deactivate' : 'Activate') + '"><i class="bi ' + (q.Active ? 'bi-eye-slash' : 'bi-eye') + '"></i></button> <button class="btn btn-sm btn-light" data-hist="' + q.QuestionID + '" title="History"><i class="bi bi-clock-history"></i></button> <button class="btn btn-sm btn-light text-danger" data-del="' + q.QuestionID + '"><i class="bi bi-trash"></i></button></td></tr>'; }).join('') + '</tbody></table></div>' : App.empty('No questions in this set yet')) + '</div>';
        var L = U.qs('[data-list]', body);
        U.qs('[data-add-here]', L).addEventListener('click', function () { Questionnaire.form(null, { scope: p[0], scopeValue: p[1] }); });
        U.qsa('[data-edit]', L).forEach(function (b) { b.addEventListener('click', function () { Questionnaire.form(list.filter(function (q) { return q.QuestionID === b.getAttribute('data-edit'); })[0]); }); });
        U.qsa('[data-toggle]', L).forEach(function (b) { b.addEventListener('click', function () { API.call('questionnaire.admin.toggle', { QuestionID: b.getAttribute('data-toggle') }).then(function (r) { App.toast(r.active ? 'Question activated' : 'Question deactivated', 'success'); Questionnaire.load({ scope: p[0], scopeValue: p[1] }); }); }); });
        U.qsa('[data-hist]', L).forEach(function (b) { b.addEventListener('click', function () { Questionnaire.history(b.getAttribute('data-hist')); }); });
        U.qsa('[data-del]', L).forEach(function (b) { b.addEventListener('click', function () { App.confirm('Delete question <b>' + U.esc(b.getAttribute('data-del')) + '</b>? If employees have answered it, it will be deactivated instead to preserve history.', { danger: true, okText: 'Delete' }).then(function (ok) { if (ok) API.call('questionnaire.admin.delete', { QuestionID: b.getAttribute('data-del') }).then(function (r) { App.toast(r.deactivated ? 'Question deactivated (has responses)' : 'Question deleted', 'success'); Questionnaire.load({ scope: p[0], scopeValue: p[1] }); }); }); }); });
        var move = function (i, dir) { var order = list.map(function (q) { return q.QuestionID; }); var j = i + dir; var tmp = order[i]; order[i] = order[j]; order[j] = tmp; API.call('questionnaire.admin.reorder', { order: order }).then(function () { Questionnaire.load({ scope: p[0], scopeValue: p[1] }); }); };
        U.qsa('[data-up]', L).forEach(function (b) { b.addEventListener('click', function () { move(+b.getAttribute('data-up'), -1); }); });
        U.qsa('[data-down]', L).forEach(function (b) { b.addEventListener('click', function () { move(+b.getAttribute('data-down'), 1); }); });
      };
      U.qsa('[data-set]', body).forEach(function (a) { a.addEventListener('click', function (e) { e.preventDefault(); U.qsa('[data-set]', body).forEach(function (x) { x.classList.toggle('active', x === a); }); renderList(a.getAttribute('data-set')); }); });
      if (sel) renderList(sel);
    });
  },

  form: function (q, ctx) {
    var boot = App.state.boot, isNew = !q; q = q || {}; ctx = ctx || {};
    var all = (Questionnaire.data && Questionnaire.data.questions) || [];
    var keys = (Questionnaire.data && Questionnaire.data.questionnaireKeys) || [];
    var scope = q.Scope || ctx.scope || 'DESIGNATION';
    var m = App.modal({ title: isNew ? 'Add question' : 'Edit question ' + U.esc(q.QuestionID), size: 'lg', static: true,
      body: '<form id="q-form" class="row g-3">' +
        '<div class="col-md-4"><label class="form-label">Scope *</label><select class="form-select" name="Scope">' + U.opts(boot.lists.questionScopes, scope) + '</select></div>' +
        '<div class="col-md-8" data-scope-wrap><label class="form-label">Applies to</label><input class="form-control" name="ScopeValue" list="scope-values" value="' + U.attr(q.ScopeValue || ctx.scopeValue || '') + '" placeholder="Designation or department"><datalist id="scope-values"></datalist></div>' +
        '<div class="col-12"><label class="form-label">Question text *</label><input class="form-control" name="QuestionText" required value="' + U.attr(q.QuestionText || '') + '"></div>' +
        '<div class="col-md-4"><label class="form-label">Answer type *</label><select class="form-select" name="QuestionType">' + U.opts(boot.lists.questionTypes, q.QuestionType || 'TEXT') + '</select></div>' +
        '<div class="col-md-4"><label class="form-label">Sort order</label><input type="number" class="form-control" name="SortOrder" value="' + U.attr(q.SortOrder || '') + '" placeholder="auto"></div>' +
        '<div class="col-md-4 d-flex align-items-end gap-3"><div class="form-check"><input class="form-check-input" type="checkbox" name="Mandatory" id="q-mand" ' + (q.Mandatory ? 'checked' : '') + '><label class="form-check-label" for="q-mand">Mandatory</label></div><div class="form-check"><input class="form-check-input" type="checkbox" name="Active" id="q-act" ' + (q.Active !== false ? 'checked' : '') + '><label class="form-check-label" for="q-act">Active</label></div></div>' +
        '<div class="col-12 d-none" data-opts-wrap><label class="form-label">Options (one per line)</label><textarea class="form-control" name="OptionsText" rows="3">' + U.esc((q.Options || []).map(function (o) { return o.label; }).join('\n')) + '</textarea></div>' +
        '<div class="col-md-6"><label class="form-label">Show only if question…</label><select class="form-select" name="ConditionQuestionID"><option value="">Always show</option>' + U.opts(all.filter(function (x) { return x.QuestionID !== q.QuestionID; }).map(function (x) { return { value: x.QuestionID, label: x.QuestionID + ' · ' + x.QuestionText.substring(0, 60) }; }), q.ConditionQuestionID) + '</select></div>' +
        '<div class="col-md-6"><label class="form-label">…has the answer</label><input class="form-control" name="ConditionValue" value="' + U.attr(q.ConditionValue || '') + '" placeholder="e.g. YES"></div>' +
        '<div class="col-12"><label class="form-label">Help text</label><input class="form-control" name="HelpText" value="' + U.attr(q.HelpText || '') + '"></div>' +
        (isNew ? '' : '<input type="hidden" name="QuestionID" value="' + q.QuestionID + '">') + '</form>',
      footer: '<button class="btn btn-light" data-bs-dismiss="modal">Cancel</button><button class="btn btn-primary" data-save><i class="bi bi-check2 me-1"></i>Save question</button>' });
    var form = U.qs('#q-form', m.el);
    var syncScope = function () { var sc = U.qs('[name=Scope]', form).value; U.qs('[data-scope-wrap]', form).style.visibility = sc === 'COMMON' ? 'hidden' : 'visible'; var dl = U.qs('#scope-values', form); dl.innerHTML = (sc === 'DEPARTMENT' ? App.deptOptions() : keys).map(function (v) { return '<option value="' + U.attr(v) + '">'; }).join(''); };
    var syncType = function () { var t = U.qs('[name=QuestionType]', form).value; U.qs('[data-opts-wrap]', form).classList.toggle('d-none', t !== 'SELECT' && t !== 'MULTISELECT'); };
    U.qs('[name=Scope]', form).addEventListener('change', syncScope); U.qs('[name=QuestionType]', form).addEventListener('change', syncType); syncScope(); syncType();
    U.qs('[data-save]', m.el).addEventListener('click', function () {
      if (!form.reportValidity()) return;
      var d = U.formData(form);
      if (d.QuestionType === 'SELECT' || d.QuestionType === 'MULTISELECT') d.Options = d.OptionsText.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
      delete d.OptionsText;
      if (d.Scope === 'COMMON') d.ScopeValue = '';
      API.call('questionnaire.admin.save', d).then(function () { App.toast('Question saved', 'success'); m.close(); Questionnaire.load({ scope: d.Scope, scopeValue: d.ScopeValue }); }).catch(function () { });
    });
  },

  preview: function () {
    var boot = App.state.boot;
    var m = App.modal({ title: 'Questionnaire preview', size: 'lg', body: '<div class="d-flex gap-2 align-items-end mb-3"><div class="flex-grow-1"><label class="form-label">Designation</label><select class="form-select" data-desig>' + U.opts(boot.designations.map(function (d) { return d.name; })) + '</select></div></div><div data-out></div>' });
    var run = function () { API.call('questionnaire.preview', { designation: U.qs('[data-desig]', m.el).value }).then(function (d) { U.qs('[data-out]', m.el).innerHTML = '<div class="small text-muted mb-2">' + (d.mapping ? 'Department: <b>' + U.esc(d.mapping.Department) + '</b> · questionnaire key: <b>' + U.esc(d.mapping.QuestionnaireKey) + '</b>' : '<span class="text-danger">No mapping</span>') + ' · ' + d.questionnaire.totalQuestions + ' questions · v' + d.questionnaire.version + '</div>' + d.questionnaire.sections.map(function (s) { return '<div class="q-section"><h6>' + U.esc(s.title) + '</h6><ol class="small">' + s.questions.map(function (q) { return '<li>' + U.esc(q.QuestionText) + ' <span class="badge text-bg-light">' + q.QuestionType + '</span>' + (q.Mandatory ? ' <span class="text-danger">*</span>' : '') + (q.ConditionQuestionID ? ' <span class="small-muted">(if ' + U.esc(q.ConditionQuestionID) + '=' + U.esc(q.ConditionValue) + ')</span>' : '') + '</li>'; }).join('') + '</ol></div>'; }).join(''); }); };
    U.qs('[data-desig]', m.el).addEventListener('change', run); run();
  },

  history: function (qid) {
    API.call('questionnaire.admin.history', { QuestionID: qid }).then(function (d) {
      App.modal({ title: 'Questionnaire version history' + (qid ? ' — ' + U.esc(qid) : ''), size: 'lg', body: d.history.length ? '<div class="table-wrap"><table class="table table-sm"><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Question</th><th>Details</th></tr></thead><tbody>' + d.history.map(function (h) { return '<tr><td class="small text-nowrap">' + U.esc(String(h.Timestamp).replace('T', ' ')) + '</td><td class="small">' + U.esc(h.UserEmail) + '</td><td class="small">' + U.esc(h.Action) + '</td><td class="small">' + U.esc(h.EntityID) + '</td><td class="small text-muted" style="max-width:320px;word-break:break-all">' + U.esc(String(h.Details).substring(0, 300)) + '</td></tr>'; }).join('') + '</tbody></table></div>' : App.empty('No history yet') });
    });
  }
};
App.views['#/questionnaire'] = Questionnaire.render;
