/**
 * QuestionnaireService.gs — Automatic questionnaire generation engine.
 *
 * Questions live in QUESTIONNAIRE_MASTER with a Scope of COMMON / DEPARTMENT / DESIGNATION.
 * An employee's daily questionnaire = DESIGNATION questions (their questionnaire key)
 *   + DEPARTMENT questions (their department) + COMMON questions, filtered to Active,
 *   ordered by SortOrder, with options and conditional display rules attached.
 * Administrators manage questions without code changes; every change bumps the Version and
 * is recorded in ACTIVITY_LOGS (questionnaire version history).
 */

// ---------------------------------------------------------------------------------------------
// Templates (initial seed only — editable afterwards from the admin UI)
// ---------------------------------------------------------------------------------------------

function questionnaireTemplates_() {
  var N = 'NUMBER', T = 'TEXT', A = 'TEXTAREA', Y = 'YESNO';
  var q = function (text, type, opts) { var o = { text: text, type: type || T }; if (opts) Object.keys(opts).forEach(function (k) { o[k] = opts[k]; }); return o; };
  return {
    COMMON: [
      q('What were your main responsibilities today?', A, { mandatory: true }),
      q('What tasks did you complete today?', A, { mandatory: true }),
      q('What tasks are currently in progress?', A),
      q('What work remains pending?', A),
      q('How many hours did you work today?', N, { mandatory: true, help: 'Total hours, e.g. 8 or 8.5' }),
      q('Which task consumed the most time?', T),
      q('What was the biggest difficulty you faced?', A),
      q('What was the reason for the difficulty?', A),
      q('Were any tasks delayed?', Y, { mandatory: true, key: 'delayed' }),
      q('What was the reason for the delay?', A, { condition: 'delayed', conditionValue: 'YES', mandatory: true }),
      q('Did you require assistance from another department?', Y, { key: 'assist' }),
      q('Which department and what assistance was required?', A, { condition: 'assist', conditionValue: 'YES' }),
      q('What support do you need from management?', A),
      q('What are your priorities for tomorrow?', A, { mandatory: true })
    ],
    'Sales Executive': [
      q('How many new leads did you receive?', N, { mandatory: true }), q('How many customers did you contact?', N, { mandatory: true }),
      q('How many follow-ups did you complete?', N), q('How many quotations did you prepare?', N),
      q('How many orders were confirmed?', N), q('How many orders were lost?', N), q('What was the total order value (INR)?', N),
      q('Which customers require follow-up?', A), q('What objections did customers raise?', A),
      q('What was the biggest sales challenge?', A), q('Which leads are pending and why?', A)
    ],
    'Accounts Executive': [
      q('How many purchase invoices were processed?', N), q('How many sales invoices were generated?', N),
      q('How many payment entries were completed?', N), q('How many outstanding payments were followed up?', N),
      q('Were bank reconciliations completed?', Y), q('Were GST-related tasks completed?', Y),
      q('Which accounting entries are pending?', A), q('Were any discrepancies identified?', Y, { key: 'disc' }),
      q('Describe the discrepancies identified', A, { condition: 'disc', conditionValue: 'YES' }),
      q('What was the biggest accounting issue?', A), q('Are any documents pending from other departments?', A)
    ],
    'E-Commerce Executive': [
      q('Which marketplaces did you work on today?', 'MULTISELECT', { options: ['Amazon', 'Flipkart', 'Meesho', 'JioMart', 'Myntra', 'Website', 'Other'] }),
      q('How many orders were processed?', N, { mandatory: true }), q('How many orders were dispatched?', N), q('How many orders are pending?', N),
      q('How many returns were processed?', N), q('How many customer complaints were resolved?', N),
      q('Were marketplace listings updated?', Y), q('Were inventory discrepancies identified?', Y),
      q('Were pricing or catalog issues identified?', Y), q('Were account health issues identified?', Y, { key: 'health' }),
      q('Describe the account health issue', A, { condition: 'health', conditionValue: 'YES' }),
      q('What was the biggest marketplace-related challenge?', A)
    ],
    'MIS Executive': [
      q('Which reports were prepared today?', A, { mandatory: true }), q('Which dashboards were updated?', A),
      q('Which data sources were used?', T), q('How many reports were completed?', N),
      q('Were any data discrepancies identified?', Y), q('Which automation or scripts were developed?', A),
      q('Were existing automations working correctly?', Y, { key: 'auto' }),
      q('Which automation failed and why?', A, { condition: 'auto', conditionValue: 'NO' }),
      q('Which reports are pending?', A), q('What was the biggest data-related problem?', A),
      q('Did any department delay providing data?', A)
    ],
    'Executive Assistant': [
      q('Which management tasks were completed?', A, { mandatory: true }), q('Which meetings were coordinated?', A),
      q('Which follow-ups were completed?', A), q('Which documents were prepared?', A), q('Which approvals were obtained?', A),
      q('Which management instructions were executed?', A), q('Which tasks are pending from management?', A),
      q('Were any urgent matters handled?', A), q("What difficulties affected today's work?", A)
    ],
    'Process Coordinator': [
      q('Which operational processes were monitored?', A, { mandatory: true }), q('Which departments were coordinated with?', A),
      q('Which process deviations were identified?', A), q('Which issues were resolved?', A),
      q('Which tasks are pending from other departments?', A), q('Were any SOPs updated?', Y),
      q('Were any process improvements implemented?', A), q('Which operational bottlenecks were identified?', A), q('What caused delays?', A)
    ],
    'CRM Executive': [
      q('How many new leads were entered?', N, { mandatory: true }), q('How many leads were updated?', N),
      q('How many follow-ups were scheduled?', N), q('How many follow-ups were completed?', N), q('How many leads changed status?', N),
      q('Were any leads left untouched?', Y), q('Were customer records corrected?', Y), q('Were any CRM automation issues identified?', A),
      q('Which leads require management intervention?', A)
    ],
    'Packaging Executive': [
      q('How many products were packed?', N, { mandatory: true }), q('How many orders were completed?', N), q('How many orders remain pending?', N),
      q('Which products faced packaging issues?', A), q('Were packaging materials available?', Y), q('Were any products damaged?', Y, { key: 'dmg' }),
      q('Describe the damaged products', A, { condition: 'dmg', conditionValue: 'YES' }),
      q('How many employees were assigned to packaging?', N), q('What was the biggest packaging bottleneck?', A), q('Were dispatch deadlines achieved?', Y)
    ],
    'GEM Executive': [
      q('How many new tenders were identified?', N, { mandatory: true }), q('How many tenders were shortlisted?', N), q('How many tenders were evaluated?', N),
      q('How many bids were submitted?', N), q('Which documents were prepared?', A), q('Which tenders require clarification?', A),
      q('Which bids are pending?', A), q('Were any technical or financial eligibility issues identified?', A), q('What was the biggest tender-related difficulty?', A)
    ],
    'Digital Marketing Executive': [
      q('Which marketing campaigns were managed?', A, { mandatory: true }), q('Which social media posts were published?', A),
      q('How many creatives were published?', N), q('What was the advertising expenditure (INR)?', N), q('How many leads were generated?', N),
      q('What was the campaign performance?', A), q('Were SEO activities completed?', Y), q('Were website updates completed?', Y),
      q('Which campaigns need optimization?', A), q('What marketing challenges occurred?', A)
    ],
    'Graphic Designer': [
      q('How many designs were created?', N, { mandatory: true }), q('Which projects were completed?', A), q('Which designs are pending?', A),
      q('How many revisions were requested?', N), q('Which designs received approval?', A), q('Which designs are awaiting approval?', A),
      q('How much time was spent on each creative?', A), q('Were there any asset or content availability issues?', A),
      q('Which department delayed the design process?', 'SELECT', { options: ['None', 'SALES', 'ACCOUNTS', 'E-COMMERCE', 'OPERATIONS', 'PACKAGING', 'GEM', 'DIGITAL MARKETING', 'MANAGEMENT'] }),
      q('What was the biggest creative challenge?', A)
    ],
    'Inventory Manager': [
      q('How many stock receipts (GRN) were processed today?', N, { mandatory: true }), q('How many stock issues / dispatches were recorded?', N, { mandatory: true }),
      q('Which items are below reorder level?', A), q('Were physical stock counts or cycle counts done?', Y, { key: 'count' }),
      q('Which items showed stock variance and by how much?', A, { condition: 'count', conditionValue: 'YES' }),
      q('Were any damaged, expired or rejected items identified?', Y, { key: 'dmg' }),
      q('Describe the damaged / rejected items and action taken', A, { condition: 'dmg', conditionValue: 'YES' }),
      q('Which purchase requests or indents were raised?', A), q('Which pending deliveries from vendors are overdue?', A),
      q('Were inventory records (ERP / sheet) updated and reconciled?', Y), q('Which department requested material that could not be issued, and why?', A),
      q('What was the biggest store / inventory challenge today?', A)
    ]
  };
}

function seedQuestionnaireTemplates_(ctx) {
  var existing = readTable_('QUESTIONNAIRE_MASTER');
  if (existing.length) return; // Seed only once; afterwards the admin UI owns the questions.
  var templates = questionnaireTemplates_();
  var rows = [], optRows = [];
  var counter = 0;
  Object.keys(templates).forEach(function (key) {
    var scope = key === 'COMMON' ? 'COMMON' : 'DESIGNATION';
    var keyMap = {};
    templates[key].forEach(function (q, i) {
      counter++;
      var id = 'Q' + ('0000' + counter).slice(-4);
      if (q.key) keyMap[q.key] = id;
      rows.push({ QuestionID: id, Scope: scope, ScopeValue: scope === 'COMMON' ? '' : key, QuestionText: q.text, QuestionType: q.type,
        Mandatory: !!q.mandatory, SortOrder: (i + 1) * 10, Active: true,
        ConditionQuestionID: q.condition ? keyMap[q.condition] : '', ConditionValue: q.conditionValue || '', HelpText: q.help || '', Version: 1 });
      (q.options || []).forEach(function (o, j) {
        optRows.push({ OptionID: generateId_('OPT') + j, QuestionID: id, OptionValue: o, OptionLabel: o, SortOrder: (j + 1) * 10, Active: true });
      });
    });
  });
  insert_('QUESTIONNAIRE_MASTER', rows, ctx);
  if (optRows.length) insert_('QUESTIONNAIRE_OPTIONS', optRows, ctx);
}

// ---------------------------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------------------------

function optionsByQuestion_() {
  var map = {};
  readTable_('QUESTIONNAIRE_OPTIONS').filter(function (o) { return toBool_(o.Active); }).forEach(function (o) { (map[o.QuestionID] = map[o.QuestionID] || []).push(o); });
  Object.keys(map).forEach(function (k) { map[k] = sortBy_(map[k], function (o) { return toNum_(o.SortOrder); }); });
  return map;
}

function questionView_(q, optMap) {
  return {
    QuestionID: q.QuestionID, Scope: q.Scope, ScopeValue: q.ScopeValue, QuestionText: q.QuestionText, QuestionType: upper_(q.QuestionType) || 'TEXT',
    Mandatory: toBool_(q.Mandatory), SortOrder: toNum_(q.SortOrder), Active: toBool_(q.Active),
    ConditionQuestionID: q.ConditionQuestionID || '', ConditionValue: q.ConditionValue || '', HelpText: q.HelpText || '',
    Version: toNum_(q.Version, 1), Options: (optMap[q.QuestionID] || []).map(function (o) { return { value: o.OptionValue, label: o.OptionLabel || o.OptionValue, OptionID: o.OptionID }; })
  };
}

/** Build the questionnaire definition for an employee (sections of questions). */
function buildQuestionnaire_(emp) {
  var mapping = resolveDesignation_(emp.Designation);
  var key = mapping ? mapping.QuestionnaireKey : emp.Designation;
  var dept = upper_(emp.Department);
  var all = readTable_('QUESTIONNAIRE_MASTER').filter(function (q) { return toBool_(q.Active); });
  var optMap = optionsByQuestion_();
  var pick = function (scope, value) {
    return sortBy_(all.filter(function (q) { return upper_(q.Scope) === scope && (scope === 'COMMON' || upper_(q.ScopeValue) === upper_(value)); }),
      function (q) { return toNum_(q.SortOrder); }).map(function (q) { return questionView_(q, optMap); });
  };
  var sections = [];
  var desig = pick('DESIGNATION', key);
  if (!desig.length && upper_(key) !== upper_(emp.Designation)) desig = pick('DESIGNATION', emp.Designation);
  if (desig.length) sections.push({ key: 'DESIGNATION', title: emp.Designation + ' — Role Questions', questions: desig });
  var deptQ = pick('DEPARTMENT', dept);
  if (deptQ.length) sections.push({ key: 'DEPARTMENT', title: dept + ' — Department Questions', questions: deptQ });
  sections.push({ key: 'COMMON', title: 'Daily Work Review', questions: pick('COMMON') });
  var version = 0;
  sections.forEach(function (s) { s.questions.forEach(function (q) { version = Math.max(version, q.Version); }); });
  return { sections: sections, version: version, questionnaireKey: key, totalQuestions: sections.reduce(function (n, s) { return n + s.questions.length; }, 0) };
}

/** Questionnaire + saved answers for an employee/date. */
function questionnaireGet_(ctx, p) {
  var emp = requireEmployeeAccess_(ctx, p.employeeId);
  var date = p.date ? requireDate_(p.date) : today_();
  var def = buildQuestionnaire_(emp);
  var answers = {};
  var status = 'NOT_STARTED';
  readTable_('DAILY_RESPONSES').filter(function (r) { return r.EmployeeID === emp.EmployeeID && r.Date === date; }).forEach(function (r) {
    answers[r.QuestionID] = safeJsonParse_(r.Answer, r.Answer);
    if (r.Status === 'SUBMITTED') status = 'SUBMITTED'; else if (status !== 'SUBMITTED') status = 'DRAFT';
  });
  var report = findOne_('DAILY_REPORTS', function (r) { return r.EmployeeID === emp.EmployeeID && r.Date === date; });
  return ok_({ employee: employeeView_(emp), date: date, questionnaire: def, answers: answers, status: status,
    locked: !!(report && toBool_(report.Locked)) });
}

/** Evaluate whether a conditional question is visible given current answers. */
function questionVisible_(q, answers) {
  if (!q.ConditionQuestionID) return true;
  var a = answers[q.ConditionQuestionID];
  if (a === undefined || a === null || a === '') return false;
  var vals = Array.isArray(a) ? a.map(upper_) : [upper_(a)];
  return vals.indexOf(upper_(q.ConditionValue)) !== -1;
}

/**
 * Save answers (auto-save draft or final submit).
 * payload: { employeeId?, date, answers: {QuestionID: value}, submit: boolean }
 */
function questionnaireSave_(ctx, p) {
  var emp = requireEmployeeAccess_(ctx, p.employeeId);
  if (emp.EmployeeID !== ctx.employeeId && !isAdmin_(ctx)) throw AppError_('Only the employee (or an admin) can fill in the questionnaire', 'FORBIDDEN');
  var date = p.date ? requireDate_(p.date) : today_();
  var answers = p.answers || {};
  var submit = toBool_(p.submit);
  var report = findOne_('DAILY_REPORTS', function (r) { return r.EmployeeID === emp.EmployeeID && r.Date === date; });
  if (report && toBool_(report.Locked) && !isAdmin_(ctx)) throw AppError_('This day is locked after approval. Ask your manager to reopen it.', 'LOCKED');

  var def = buildQuestionnaire_(emp);
  var allQ = [];
  def.sections.forEach(function (s) { allQ = allQ.concat(s.questions); });
  var qById = {};
  allQ.forEach(function (q) { qById[q.QuestionID] = q; });

  // Validation of answers (type + mandatory on submit)
  var errors = [];
  allQ.forEach(function (q) {
    var v = answers[q.QuestionID];
    var visible = questionVisible_(q, answers);
    var empty = v === undefined || v === null || trim_(v) === '' || (Array.isArray(v) && !v.length);
    if (!visible) { delete answers[q.QuestionID]; return; }
    if (submit && q.Mandatory && empty) errors.push(q.QuestionText);
    if (!empty) {
      if (q.QuestionType === 'NUMBER' && isNaN(Number(v))) errors.push(q.QuestionText + ' must be a number');
      if (q.QuestionType === 'YESNO' && ['YES', 'NO'].indexOf(upper_(v)) === -1) errors.push(q.QuestionText + ' must be Yes or No');
      if (q.QuestionType === 'SELECT' && q.Options.length && !q.Options.some(function (o) { return o.value === v; })) errors.push(q.QuestionText + ': invalid option');
      if (q.QuestionType === 'MULTISELECT' && !Array.isArray(v)) answers[q.QuestionID] = [v];
      if (typeof v === 'string' && v.length > 4000) answers[q.QuestionID] = v.substring(0, 4000);
    }
  });
  if (errors.length) throw AppError_((submit ? 'Please answer all mandatory questions: ' : 'Invalid answers: ') + errors.slice(0, 5).join('; '), 'VALIDATION', { errors: errors });

  var status = submit ? 'SUBMITTED' : 'DRAFT';
  var existing = readTable_('DAILY_RESPONSES').filter(function (r) { return r.EmployeeID === emp.EmployeeID && r.Date === date; });
  var exById = {};
  existing.forEach(function (r) { exById[r.QuestionID] = r; });
  var toInsert = [];
  Object.keys(answers).forEach(function (qid) {
    if (!qById[qid]) return; // ignore unknown question ids
    var val = answers[qid];
    var stored = Array.isArray(val) ? JSON.stringify(val) : String(val);
    if (exById[qid]) {
      if (String(exById[qid].Answer) !== stored || exById[qid].Status !== status) {
        update_('DAILY_RESPONSES', 'ResponseID', exById[qid].ResponseID, { Answer: stored, Status: status, QuestionText: qById[qid].QuestionText, QuestionnaireVersion: def.version }, ctx);
      }
    } else {
      toInsert.push({ ResponseID: generateId_('RSP'), Date: date, EmployeeID: emp.EmployeeID, QuestionID: qid, QuestionText: qById[qid].QuestionText,
        Answer: stored, QuestionnaireVersion: def.version, Status: status });
    }
  });
  if (toInsert.length) insert_('DAILY_RESPONSES', toInsert, ctx);
  // Mark remaining rows with the new status on submit
  if (submit) existing.forEach(function (r) { if (r.Status !== 'SUBMITTED' && answers[r.QuestionID] !== undefined) update_('DAILY_RESPONSES', 'ResponseID', r.ResponseID, { Status: 'SUBMITTED' }, ctx); });
  logActivity_(ctx, submit ? 'QUESTIONNAIRE_SUBMITTED' : 'QUESTIONNAIRE_SAVED', 'DAILY_RESPONSES', emp.EmployeeID + ':' + date, { answers: Object.keys(answers).length });
  return ok_({ status: status, saved: Object.keys(answers).length, date: date }, submit ? 'Questionnaire submitted' : 'Draft saved');
}

// ---------------------------------------------------------------------------------------------
// Admin management
// ---------------------------------------------------------------------------------------------

function questionnaireAdminList_(ctx, p) {
  requireAdmin_(ctx);
  var optMap = optionsByQuestion_();
  var all = readTable_('QUESTIONNAIRE_MASTER').map(function (q) { return questionView_(q, optMap); });
  if (p && p.scope) all = all.filter(function (q) { return q.Scope === upper_(p.scope); });
  if (p && p.scopeValue) all = all.filter(function (q) { return upper_(q.ScopeValue) === upper_(p.scopeValue); });
  var keys = uniq_(readTable_('DESIGNATION_MAPPING').map(function (m) { return m.QuestionnaireKey || m.Designation; }));
  return ok_({ questions: sortBy_(all, function (q) { return q.Scope + '|' + q.ScopeValue + '|' + ('00000' + q.SortOrder).slice(-5); }),
    questionnaireKeys: keys, departments: readTable_('DEPARTMENTS').map(function (d) { return upper_(d.DepartmentName); }) });
}

function questionnaireAdminSave_(ctx, p) {
  requireAdmin_(ctx);
  var isUpdate = !!trim_(p.QuestionID);
  var data = validateQuestionInput_(p, isUpdate);
  var existing = isUpdate ? findById_('QUESTIONNAIRE_MASTER', 'QuestionID', p.QuestionID) : null;
  if (isUpdate && !existing) throw AppError_('Question not found', 'NOT_FOUND');
  if (data.ConditionQuestionID && !findById_('QUESTIONNAIRE_MASTER', 'QuestionID', data.ConditionQuestionID)) throw AppError_('Condition question not found', 'VALIDATION');
  if (data.ConditionQuestionID && existing && data.ConditionQuestionID === existing.QuestionID) throw AppError_('A question cannot depend on itself', 'VALIDATION');
  var id;
  if (existing) {
    data.Version = toNum_(existing.Version, 1) + 1;
    update_('QUESTIONNAIRE_MASTER', 'QuestionID', existing.QuestionID, data, ctx);
    id = existing.QuestionID;
    logActivity_(ctx, 'QUESTION_UPDATED', 'QUESTIONNAIRE_MASTER', id, { before: existing, after: data });
  } else {
    var all = readTable_('QUESTIONNAIRE_MASTER');
    var maxN = 0;
    all.forEach(function (q) { var m = String(q.QuestionID).match(/^Q(\d+)$/); if (m) maxN = Math.max(maxN, +m[1]); });
    id = 'Q' + ('0000' + (maxN + 1)).slice(-4);
    var siblings = all.filter(function (q) { return q.Scope === data.Scope && upper_(q.ScopeValue) === upper_(data.ScopeValue || ''); });
    var row = { QuestionID: id, Scope: data.Scope, ScopeValue: data.ScopeValue || '', QuestionText: data.QuestionText, QuestionType: data.QuestionType,
      Mandatory: !!data.Mandatory, SortOrder: data.SortOrder !== undefined ? data.SortOrder : (siblings.length + 1) * 10, Active: data.Active === undefined ? true : data.Active,
      ConditionQuestionID: data.ConditionQuestionID || '', ConditionValue: data.ConditionValue || '', HelpText: data.HelpText || '', Version: 1 };
    insert_('QUESTIONNAIRE_MASTER', row, ctx);
    logActivity_(ctx, 'QUESTION_CREATED', 'QUESTIONNAIRE_MASTER', id, row);
  }
  // Options (replace set when provided)
  if (Array.isArray(p.Options)) {
    readTable_('QUESTIONNAIRE_OPTIONS').filter(function (o) { return o.QuestionID === id; }).forEach(function (o) { remove_('QUESTIONNAIRE_OPTIONS', 'OptionID', o.OptionID); });
    var rows = p.Options.map(function (o, i) {
      var val = typeof o === 'string' ? o : (o.value || o.label);
      return { OptionID: generateId_('OPT') + i, QuestionID: id, OptionValue: trim_(val), OptionLabel: trim_(typeof o === 'string' ? o : (o.label || o.value)), SortOrder: (i + 1) * 10, Active: true };
    }).filter(function (o) { return o.OptionValue; });
    if (rows.length) insert_('QUESTIONNAIRE_OPTIONS', rows, ctx);
  }
  clearCache_();
  return ok_({ question: questionView_(findById_('QUESTIONNAIRE_MASTER', 'QuestionID', id), optionsByQuestion_()) }, existing ? 'Question updated' : 'Question created');
}

function questionnaireAdminDelete_(ctx, p) {
  requireAdmin_(ctx);
  var q = findById_('QUESTIONNAIRE_MASTER', 'QuestionID', p.QuestionID);
  if (!q) throw AppError_('Question not found', 'NOT_FOUND');
  var dependents = readTable_('QUESTIONNAIRE_MASTER').filter(function (x) { return x.ConditionQuestionID === q.QuestionID; });
  if (dependents.length) throw AppError_('Other questions depend on this one: ' + dependents.map(function (d) { return d.QuestionID; }).join(', '), 'IN_USE');
  var answered = findOne_('DAILY_RESPONSES', function (r) { return r.QuestionID === q.QuestionID; });
  if (answered && !toBool_(p.force)) {
    // Preserve history: deactivate instead of hard delete when responses exist.
    update_('QUESTIONNAIRE_MASTER', 'QuestionID', q.QuestionID, { Active: false, Version: toNum_(q.Version, 1) + 1 }, ctx);
    logActivity_(ctx, 'QUESTION_DEACTIVATED', 'QUESTIONNAIRE_MASTER', q.QuestionID, 'Has responses; deactivated instead of deleted');
    clearCache_();
    return ok_({ deactivated: true }, 'Question has historical responses, so it was deactivated instead of deleted');
  }
  remove_('QUESTIONNAIRE_MASTER', 'QuestionID', q.QuestionID);
  readTable_('QUESTIONNAIRE_OPTIONS').filter(function (o) { return o.QuestionID === q.QuestionID; }).forEach(function (o) { remove_('QUESTIONNAIRE_OPTIONS', 'OptionID', o.OptionID); });
  logActivity_(ctx, 'QUESTION_DELETED', 'QUESTIONNAIRE_MASTER', q.QuestionID, q);
  clearCache_();
  return ok_({ deleted: true }, 'Question deleted');
}

/** Reorder: payload { order: [QuestionID, ...] } — assigns SortOrder 10, 20, 30... */
function questionnaireAdminReorder_(ctx, p) {
  requireAdmin_(ctx);
  if (!Array.isArray(p.order) || !p.order.length) throw AppError_('order must be a non-empty array', 'VALIDATION');
  p.order.forEach(function (id, i) { update_('QUESTIONNAIRE_MASTER', 'QuestionID', id, { SortOrder: (i + 1) * 10 }, ctx); });
  logActivity_(ctx, 'QUESTIONS_REORDERED', 'QUESTIONNAIRE_MASTER', '', p.order);
  clearCache_();
  return ok_({}, 'Order saved');
}

function questionnaireAdminToggle_(ctx, p) {
  requireAdmin_(ctx);
  var q = findById_('QUESTIONNAIRE_MASTER', 'QuestionID', p.QuestionID);
  if (!q) throw AppError_('Question not found', 'NOT_FOUND');
  var active = p.active === undefined ? !toBool_(q.Active) : toBool_(p.active);
  update_('QUESTIONNAIRE_MASTER', 'QuestionID', q.QuestionID, { Active: active, Version: toNum_(q.Version, 1) + 1 }, ctx);
  logActivity_(ctx, active ? 'QUESTION_ACTIVATED' : 'QUESTION_DEACTIVATED', 'QUESTIONNAIRE_MASTER', q.QuestionID, '');
  clearCache_();
  return ok_({ active: active }, active ? 'Question activated' : 'Question deactivated');
}

/** Version history of a question from the audit log. */
function questionnaireAdminHistory_(ctx, p) {
  requireAdmin_(ctx);
  var logs = readTable_('ACTIVITY_LOGS').filter(function (l) { return l.Entity === 'QUESTIONNAIRE_MASTER' && (!p.QuestionID || l.EntityID === p.QuestionID); });
  return ok_({ history: sortBy_(logs, function (l) { return l.Timestamp; }, true).slice(0, 200) });
}

/** Preview the questionnaire a designation would receive (admin tool). */
function questionnairePreview_(ctx, p) {
  requireAdmin_(ctx);
  var mapping = resolveDesignation_(p.designation);
  var emp = { Designation: trim_(p.designation), Department: mapping ? mapping.Department : upper_(p.department || '') };
  return ok_({ questionnaire: buildQuestionnaire_(emp), mapping: mapping });
}
