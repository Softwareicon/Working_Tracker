/**
 * Validation.gs — Server-side input validation. Every write endpoint validates here.
 */

function requireFields_(obj, fields, label) {
  var missing = fields.filter(function (f) { return obj[f] === undefined || obj[f] === null || trim_(obj[f]) === ''; });
  if (missing.length) throw AppError_((label ? label + ': ' : '') + 'Missing required field(s): ' + missing.join(', '), 'VALIDATION');
}

function requireOneOf_(value, list, label) {
  if (list.indexOf(value) === -1) throw AppError_((label || 'Value') + ' must be one of: ' + list.join(', '), 'VALIDATION');
  return value;
}

function isEmail_(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trim_(s)); }

function isDateStr_(s) { return /^\d{4}-\d{2}-\d{2}$/.test(trim_(s)) && !!parseDateTime_(s); }

function isDateTimeStr_(s) { return /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(trim_(s)) && !!parseDateTime_(s); }

function isHHmm_(s) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(trim_(s)); }

function requireDate_(s, label) {
  if (!isDateStr_(s)) throw AppError_((label || 'Date') + ' must be in yyyy-MM-dd format', 'VALIDATION');
  return trim_(s);
}

function requireDateTime_(s, label) {
  if (!isDateTimeStr_(s)) throw AppError_((label || 'Date/time') + ' must be in yyyy-MM-ddTHH:mm format', 'VALIDATION');
  return trim_(s);
}

function cleanMobile_(s) {
  var d = trim_(s).replace(/[^\d]/g, '');
  return d;
}

function validateEmployeeInput_(p, isUpdate) {
  var e = {};
  if (!isUpdate) requireFields_(p, ['EmployeeName', 'Designation', 'Email'], 'Employee');
  if (p.EmployeeName !== undefined) { e.EmployeeName = trim_(p.EmployeeName); if (e.EmployeeName.length < 2) throw AppError_('Employee name is too short', 'VALIDATION'); }
  if (p.Designation !== undefined) e.Designation = trim_(p.Designation);
  if (p.Email !== undefined) { e.Email = trim_(p.Email).toLowerCase(); if (!isEmail_(e.Email)) throw AppError_('Invalid e-mail address', 'VALIDATION'); }
  if (p.Mobile !== undefined) { e.Mobile = cleanMobile_(p.Mobile); if (e.Mobile && (e.Mobile.length < 10 || e.Mobile.length > 15)) throw AppError_('Mobile number must have 10-15 digits', 'VALIDATION'); }
  if (p.WhatsAppNumber !== undefined) e.WhatsAppNumber = cleanMobile_(p.WhatsAppNumber);
  if (p.JoiningDate !== undefined && trim_(p.JoiningDate)) e.JoiningDate = requireDate_(p.JoiningDate, 'Joining date');
  if (p.ReportingManagerID !== undefined) e.ReportingManagerID = trim_(p.ReportingManagerID);
  if (p.WorkStart !== undefined && trim_(p.WorkStart)) { if (!isHHmm_(p.WorkStart)) throw AppError_('Work start must be HH:mm', 'VALIDATION'); e.WorkStart = trim_(p.WorkStart); }
  if (p.WorkEnd !== undefined && trim_(p.WorkEnd)) { if (!isHHmm_(p.WorkEnd)) throw AppError_('Work end must be HH:mm', 'VALIDATION'); e.WorkEnd = trim_(p.WorkEnd); }
  if (p.WorkingHours !== undefined && trim_(p.WorkingHours) !== '') { e.WorkingHours = toNum_(p.WorkingHours); if (e.WorkingHours <= 0 || e.WorkingHours > 16) throw AppError_('Working hours must be between 1 and 16', 'VALIDATION'); }
  if (p.BreakMinutes !== undefined && trim_(p.BreakMinutes) !== '') { e.BreakMinutes = toNum_(p.BreakMinutes); if (e.BreakMinutes < 0 || e.BreakMinutes > 240) throw AppError_('Break minutes must be 0-240', 'VALIDATION'); }
  if (p.Role !== undefined && trim_(p.Role)) e.Role = requireOneOf_(upper_(p.Role), Object.keys(CONFIG.ROLES).map(function (k) { return CONFIG.ROLES[k]; }), 'Role');
  if (p.Status !== undefined && trim_(p.Status)) e.Status = requireOneOf_(upper_(p.Status), ['ACTIVE', 'INACTIVE'], 'Status');
  if (p.Notes !== undefined) e.Notes = trim_(p.Notes);
  return e;
}

function validateTaskInput_(p, isUpdate) {
  var t = {};
  if (!isUpdate) requireFields_(p, ['TaskTitle'], 'Task');
  if (p.Date !== undefined && trim_(p.Date)) t.Date = requireDate_(p.Date, 'Task date');
  if (p.TaskTitle !== undefined) { t.TaskTitle = trim_(p.TaskTitle); if (t.TaskTitle.length < 2) throw AppError_('Task title is too short', 'VALIDATION'); if (t.TaskTitle.length > 200) throw AppError_('Task title is too long (max 200)', 'VALIDATION'); }
  if (p.TaskDescription !== undefined) t.TaskDescription = trim_(p.TaskDescription).substring(0, 4000);
  if (p.TaskCategory !== undefined) t.TaskCategory = trim_(p.TaskCategory) || 'Other';
  if (p.Priority !== undefined && trim_(p.Priority)) t.Priority = requireOneOf_(upper_(p.Priority), CONFIG.TASK_PRIORITIES, 'Priority');
  if (p.Status !== undefined && trim_(p.Status)) t.Status = requireOneOf_(upper_(p.Status), CONFIG.TASK_STATUSES, 'Status');
  if (p.CompletionPercent !== undefined && trim_(p.CompletionPercent) !== '') {
    t.CompletionPercent = Math.round(toNum_(p.CompletionPercent));
    if (t.CompletionPercent < 0 || t.CompletionPercent > 100) throw AppError_('Completion % must be 0-100', 'VALIDATION');
  }
  if (p.StartTime !== undefined && trim_(p.StartTime)) t.StartTime = requireDateTime_(p.StartTime, 'Start time');
  if (p.EndTime !== undefined && trim_(p.EndTime)) t.EndTime = requireDateTime_(p.EndTime, 'End time');
  if (t.StartTime && t.EndTime && parseDateTime_(t.EndTime) <= parseDateTime_(t.StartTime)) throw AppError_('End time must be after start time', 'VALIDATION');
  if (p.RelatedDepartment !== undefined) t.RelatedDepartment = upper_(p.RelatedDepartment);
  if (p.SupportingDocuments !== undefined) t.SupportingDocuments = trim_(p.SupportingDocuments).substring(0, 2000);
  if (p.Remarks !== undefined) t.Remarks = trim_(p.Remarks).substring(0, 2000);
  if (p.PendingReason !== undefined) t.PendingReason = trim_(p.PendingReason).substring(0, 1000);
  if (p.ExpectedCompletionDate !== undefined && trim_(p.ExpectedCompletionDate)) t.ExpectedCompletionDate = requireDate_(p.ExpectedCompletionDate, 'Expected completion date');
  if (p.ExpectedCompletionDate !== undefined && !trim_(p.ExpectedCompletionDate)) t.ExpectedCompletionDate = '';
  if (p.ResponsibleDependency !== undefined) t.ResponsibleDependency = trim_(p.ResponsibleDependency).substring(0, 300);
  return t;
}

function validateDifficultyInput_(p, isUpdate) {
  var d = {};
  if (!isUpdate) {
    requireFields_(p, ['ProblemDescription', 'Category'], 'Difficulty');
    if (!trim_(p.TaskName) && !trim_(p.TaskID)) throw AppError_('Difficulty: Task name (or a linked task) is required', 'VALIDATION');
  }
  if (p.Date !== undefined && trim_(p.Date)) d.Date = requireDate_(p.Date);
  if (p.TaskID !== undefined) d.TaskID = trim_(p.TaskID);
  if (p.TaskName !== undefined) d.TaskName = trim_(p.TaskName).substring(0, 200);
  if (p.ProblemDescription !== undefined) d.ProblemDescription = trim_(p.ProblemDescription).substring(0, 4000);
  if (p.DifficultyLevel !== undefined && trim_(p.DifficultyLevel)) d.DifficultyLevel = requireOneOf_(upper_(p.DifficultyLevel), CONFIG.DIFFICULTY_LEVELS, 'Difficulty level');
  if (p.Category !== undefined && trim_(p.Category)) d.Category = requireOneOf_(trim_(p.Category), CONFIG.DIFFICULTY_CATEGORIES, 'Difficulty category');
  if (p.Reason !== undefined) d.Reason = trim_(p.Reason).substring(0, 2000);
  if (p.DelayMinutes !== undefined && trim_(p.DelayMinutes) !== '') { d.DelayMinutes = Math.round(toNum_(p.DelayMinutes)); if (d.DelayMinutes < 0) throw AppError_('Delay minutes cannot be negative', 'VALIDATION'); }
  if (p.DelayType !== undefined && trim_(p.DelayType)) d.DelayType = requireOneOf_(upper_(p.DelayType), CONFIG.DELAY_TYPES, 'Delay type');
  if (p.ResponsibleDependency !== undefined) d.ResponsibleDependency = trim_(p.ResponsibleDependency).substring(0, 300);
  if (p.DepartmentInvolved !== undefined) d.DepartmentInvolved = upper_(p.DepartmentInvolved);
  if (p.AssistanceRequired !== undefined) d.AssistanceRequired = trim_(p.AssistanceRequired).substring(0, 1000);
  if (p.EscalationRequired !== undefined) d.EscalationRequired = toBool_(p.EscalationRequired);
  if (p.ResolutionStatus !== undefined && trim_(p.ResolutionStatus)) d.ResolutionStatus = requireOneOf_(upper_(p.ResolutionStatus), CONFIG.RESOLUTION_STATUSES, 'Resolution status');
  if (p.ResolutionNotes !== undefined) d.ResolutionNotes = trim_(p.ResolutionNotes).substring(0, 2000);
  return d;
}

function validateQuestionInput_(p, isUpdate) {
  var q = {};
  if (!isUpdate) requireFields_(p, ['Scope', 'QuestionText', 'QuestionType'], 'Question');
  if (p.Scope !== undefined) q.Scope = requireOneOf_(upper_(p.Scope), CONFIG.QUESTION_SCOPES, 'Scope');
  if (p.ScopeValue !== undefined) q.ScopeValue = trim_(p.ScopeValue);
  if (q.Scope && q.Scope !== 'COMMON' && !q.ScopeValue) throw AppError_('ScopeValue (department or designation) is required for ' + q.Scope + ' questions', 'VALIDATION');
  if (p.QuestionText !== undefined) { q.QuestionText = trim_(p.QuestionText); if (q.QuestionText.length < 3) throw AppError_('Question text is too short', 'VALIDATION'); }
  if (p.QuestionType !== undefined) q.QuestionType = requireOneOf_(upper_(p.QuestionType), CONFIG.QUESTION_TYPES, 'Question type');
  if (p.Mandatory !== undefined) q.Mandatory = toBool_(p.Mandatory);
  if (p.SortOrder !== undefined && trim_(p.SortOrder) !== '') q.SortOrder = toNum_(p.SortOrder);
  if (p.Active !== undefined) q.Active = toBool_(p.Active);
  if (p.ConditionQuestionID !== undefined) q.ConditionQuestionID = trim_(p.ConditionQuestionID);
  if (p.ConditionValue !== undefined) q.ConditionValue = trim_(p.ConditionValue);
  if (p.HelpText !== undefined) q.HelpText = trim_(p.HelpText).substring(0, 500);
  return q;
}
