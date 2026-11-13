/**
 * DesignationService.gs — Designation master + centralized designation -> department mapping engine.
 * The administrator selects only a designation; the department, questionnaire key and default
 * reporting manager are resolved here. Unknown designations are never silently assigned.
 */

/** Resolve a designation to its active mapping row, or null when no mapping exists. */
function resolveDesignation_(designation) {
  var key = upper_(designation);
  if (!key) return null;
  var m = findOne_('DESIGNATION_MAPPING', function (r) { return upper_(r.Designation) === key && toBool_(r.Active); });
  if (!m) return null;
  var dept = findOne_('DEPARTMENTS', function (d) { return upper_(d.DepartmentName) === upper_(m.Department) && toBool_(d.Active); });
  return {
    Designation: m.Designation,
    Department: upper_(m.Department),
    DepartmentValid: !!dept,
    QuestionnaireKey: m.QuestionnaireKey || m.Designation,
    DefaultManagerID: m.DefaultManagerID || (dept ? dept.ManagerID : ''),
    MappingID: m.MappingID
  };
}

function designationsList_(ctx) {
  var mappings = readTable_('DESIGNATION_MAPPING');
  var designations = readTable_('DESIGNATIONS');
  var departments = readTable_('DEPARTMENTS');
  var mapByDesig = {};
  mappings.forEach(function (m) { mapByDesig[upper_(m.Designation)] = m; });
  var employees = isAdmin_(ctx) ? readTable_('EMPLOYEES') : [];
  var countByDesig = {};
  employees.forEach(function (e) { var k = upper_(e.Designation); countByDesig[k] = (countByDesig[k] || 0) + 1; });
  var list = designations.map(function (d) {
    var m = mapByDesig[upper_(d.DesignationName)];
    return {
      DesignationID: d.DesignationID, DesignationName: d.DesignationName, Description: d.Description, Active: toBool_(d.Active),
      Department: m ? upper_(m.Department) : '', QuestionnaireKey: m ? (m.QuestionnaireKey || d.DesignationName) : '',
      DefaultManagerID: m ? m.DefaultManagerID : '', MappingID: m ? m.MappingID : '', MappingActive: m ? toBool_(m.Active) : false,
      Mapped: !!m, EmployeeCount: countByDesig[upper_(d.DesignationName)] || 0
    };
  });
  return ok_({ designations: sortBy_(list, function (x) { return x.DesignationName; }), departments: departments, mappings: mappings });
}

/** Public resolve for the employee form (admins only — used by the UI to preview the auto-assigned department). */
function designationsResolve_(ctx, p) {
  requireAdmin_(ctx);
  var r = resolveDesignation_(p.designation);
  if (!r) return ok_({ mapped: false, designation: trim_(p.designation) }, 'No mapping exists for this designation');
  return ok_({ mapped: true, mapping: r });
}

/**
 * Create / update a designation together with its mapping (admin only).
 * payload: { DesignationID?, DesignationName, Department, QuestionnaireKey?, DefaultManagerID?, Description?, Active? }
 */
function designationsSave_(ctx, p) {
  requireAdmin_(ctx);
  requireFields_(p, ['DesignationName', 'Department'], 'Designation');
  var name = trim_(p.DesignationName);
  var dept = upper_(p.Department);
  var deptRow = findOne_('DEPARTMENTS', function (d) { return upper_(d.DepartmentName) === dept; });
  if (!deptRow) throw AppError_('Department "' + dept + '" does not exist. Create it first.', 'VALIDATION');
  var active = p.Active === undefined ? true : toBool_(p.Active);
  var key = trim_(p.QuestionnaireKey) || name;

  var existing = p.DesignationID ? findById_('DESIGNATIONS', 'DesignationID', p.DesignationID)
    : findOne_('DESIGNATIONS', function (d) { return upper_(d.DesignationName) === upper_(name); });
  var oldName = existing ? existing.DesignationName : null;
  if (!existing) {
    var dup = findOne_('DESIGNATIONS', function (d) { return upper_(d.DesignationName) === upper_(name); });
    if (dup) throw AppError_('Designation "' + name + '" already exists', 'DUPLICATE');
    existing = { DesignationID: generateId_('DSG'), DesignationName: name, Description: trim_(p.Description), Active: active };
    insert_('DESIGNATIONS', existing, ctx);
  } else {
    var dup2 = findOne_('DESIGNATIONS', function (d) { return upper_(d.DesignationName) === upper_(name) && d.DesignationID !== existing.DesignationID; });
    if (dup2) throw AppError_('Another designation already uses the name "' + name + '"', 'DUPLICATE');
    update_('DESIGNATIONS', 'DesignationID', existing.DesignationID, { DesignationName: name, Description: p.Description !== undefined ? trim_(p.Description) : existing.Description, Active: active }, ctx);
  }
  var mapping = findOne_('DESIGNATION_MAPPING', function (m) { return upper_(m.Designation) === upper_(oldName || name); });
  var mapRow = { Designation: name, Department: dept, QuestionnaireKey: key, DefaultManagerID: trim_(p.DefaultManagerID), Active: active };
  if (mapping) update_('DESIGNATION_MAPPING', 'MappingID', mapping.MappingID, mapRow, ctx);
  else { mapRow.MappingID = generateId_('MAP'); insert_('DESIGNATION_MAPPING', mapRow, ctx); }

  // Keep employees consistent when a designation is renamed or re-mapped.
  if (oldName && (upper_(oldName) !== upper_(name))) {
    readTable_('EMPLOYEES').filter(function (e) { return upper_(e.Designation) === upper_(oldName); }).forEach(function (e) {
      update_('EMPLOYEES', 'EmployeeID', e.EmployeeID, { Designation: name, Department: dept }, ctx);
    });
    readTable_('QUESTIONNAIRE_MASTER').filter(function (q) { return q.Scope === 'DESIGNATION' && upper_(q.ScopeValue) === upper_(oldName); }).forEach(function (q) {
      update_('QUESTIONNAIRE_MASTER', 'QuestionID', q.QuestionID, { ScopeValue: name }, ctx);
    });
  } else if (mapping && upper_(mapping.Department) !== dept) {
    readTable_('EMPLOYEES').filter(function (e) { return upper_(e.Designation) === upper_(name); }).forEach(function (e) {
      update_('EMPLOYEES', 'EmployeeID', e.EmployeeID, { Department: dept }, ctx);
    });
  }
  clearCache_();
  logActivity_(ctx, mapping ? 'DESIGNATION_UPDATED' : 'DESIGNATION_CREATED', 'DESIGNATION', existing.DesignationID, mapRow);
  return ok_({ designation: findById_('DESIGNATIONS', 'DesignationID', existing.DesignationID), mapping: resolveDesignation_(name) },
    'Designation "' + name + '" mapped to ' + dept);
}

function designationsDelete_(ctx, p) {
  requireAdmin_(ctx);
  var d = findById_('DESIGNATIONS', 'DesignationID', p.DesignationID);
  if (!d) throw AppError_('Designation not found', 'NOT_FOUND');
  var inUse = findOne_('EMPLOYEES', function (e) { return upper_(e.Designation) === upper_(d.DesignationName); });
  if (inUse) throw AppError_('Designation is assigned to employees (' + inUse.EmployeeName + '). Deactivate it instead.', 'IN_USE');
  remove_('DESIGNATIONS', 'DesignationID', d.DesignationID);
  var m = findOne_('DESIGNATION_MAPPING', function (x) { return upper_(x.Designation) === upper_(d.DesignationName); });
  if (m) remove_('DESIGNATION_MAPPING', 'MappingID', m.MappingID);
  logActivity_(ctx, 'DESIGNATION_DELETED', 'DESIGNATION', d.DesignationID, d.DesignationName);
  return ok_({}, 'Designation deleted');
}

function departmentsList_(ctx) {
  var depts = readTable_('DEPARTMENTS');
  var emps = readTable_('EMPLOYEES');
  var byId = {};
  emps.forEach(function (e) { byId[e.EmployeeID] = e; });
  return ok_({ departments: depts.map(function (d) {
    return { DepartmentID: d.DepartmentID, DepartmentName: upper_(d.DepartmentName), Description: d.Description, ManagerID: d.ManagerID,
      ManagerName: byId[d.ManagerID] ? byId[d.ManagerID].EmployeeName : '', Active: toBool_(d.Active),
      EmployeeCount: emps.filter(function (e) { return upper_(e.Department) === upper_(d.DepartmentName) && upper_(e.Status) === 'ACTIVE'; }).length };
  }) });
}

function departmentsSave_(ctx, p) {
  requireAdmin_(ctx);
  requireFields_(p, ['DepartmentName'], 'Department');
  var name = upper_(p.DepartmentName);
  var existing = p.DepartmentID ? findById_('DEPARTMENTS', 'DepartmentID', p.DepartmentID) : findOne_('DEPARTMENTS', function (d) { return upper_(d.DepartmentName) === name; });
  var row = { DepartmentName: name, Description: trim_(p.Description), ManagerID: trim_(p.ManagerID), Active: p.Active === undefined ? true : toBool_(p.Active) };
  if (p.ManagerID && !findById_('EMPLOYEES', 'EmployeeID', p.ManagerID)) throw AppError_('Manager employee not found', 'VALIDATION');
  if (existing) {
    update_('DEPARTMENTS', 'DepartmentID', existing.DepartmentID, row, ctx);
  } else {
    row.DepartmentID = 'DEPT-' + pad2_(readTable_('DEPARTMENTS').length + 1) + '-' + Math.random().toString(36).substring(2, 5).toUpperCase();
    insert_('DEPARTMENTS', row, ctx);
  }
  clearCache_();
  logActivity_(ctx, existing ? 'DEPARTMENT_UPDATED' : 'DEPARTMENT_CREATED', 'DEPARTMENT', name, row);
  return ok_({ department: row }, 'Department saved');
}
