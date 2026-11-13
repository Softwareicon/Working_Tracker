/**
 * Config.gs — Centralized configuration for Daily Work Tracker Pro.
 * Everything that an administrator may need to tune lives here or in the SYSTEM_SETTINGS sheet.
 * Nothing in the application hard-codes employee names, departments or designations:
 * the DEPARTMENTS / DESIGNATION_MAPPING sheets are the source of truth after setupDatabase().
 */

var CONFIG = {
  APP_NAME: 'Daily Work Tracker Pro',
  APP_VERSION: '1.0.0',
  COMPANY_NAME: 'Oakcraft Furniture',

  // Leave blank when the script is container-bound to the spreadsheet.
  // Set to the spreadsheet ID when the script is standalone.
  SPREADSHEET_ID: '',

  TIMEZONE: 'Asia/Kolkata',

  // Bootstrap super administrators. These emails can log in even before an employee row exists
  // and are created as SUPER_ADMIN employees by setupDatabase().
  SUPER_ADMIN_EMAILS: ['mis@oakcraft.in'],

  SESSION_HOURS: 12,
  OTP_MINUTES: 10,
  OTP_LENGTH: 6,
  OTP_MAX_ATTEMPTS: 5,
  CACHE_SECONDS: 300,

  // When true (demo bundle / tests only) the OTP is returned to the client instead of e-mailed.
  DEMO_MODE: false,

  ROLES: { SUPER_ADMIN: 'SUPER_ADMIN', ADMIN: 'ADMIN', MANAGER: 'DEPARTMENT_MANAGER', EMPLOYEE: 'EMPLOYEE' },

  TASK_STATUSES: ['COMPLETED', 'IN PROGRESS', 'PENDING', 'ON HOLD', 'BLOCKED'],
  TASK_PRIORITIES: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'],
  PRIORITY_WEIGHT: { LOW: 1, MEDIUM: 2, HIGH: 3, URGENT: 4 },
  TASK_CATEGORIES: ['Customer Follow-up', 'Quotation', 'Order Processing', 'Reporting', 'Data Entry', 'Coordination',
    'Meeting', 'Design', 'Documentation', 'Accounting', 'Marketplace', 'Packaging', 'Tender', 'Marketing', 'Support', 'Other'],
  TIMER_STATES: ['IDLE', 'RUNNING', 'PAUSED', 'DONE'],

  DIFFICULTY_CATEGORIES: ['Technical Issue', 'Data Not Available', 'Approval Pending', 'Material Not Available',
    'Customer Dependency', 'Other Department Dependency', 'System or Software Issue', 'Workload Pressure',
    'Lack of Information', 'Other'],
  DIFFICULTY_LEVELS: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
  DELAY_TYPES: ['EMPLOYEE', 'MANAGEMENT_APPROVAL', 'INTERDEPARTMENTAL', 'EXTERNAL', 'TECHNICAL'],
  // Delay types that must never penalize the employee's productivity score.
  NON_PENALIZING_DELAY_TYPES: ['MANAGEMENT_APPROVAL', 'INTERDEPARTMENTAL', 'EXTERNAL', 'TECHNICAL'],
  RESOLUTION_STATUSES: ['OPEN', 'IN_PROGRESS', 'ESCALATED', 'RESOLVED'],
  REPORT_STATUSES: ['NOT_STARTED', 'INCOMPLETE', 'DRAFT', 'SUBMITTED', 'APPROVED', 'REOPENED'],
  QUESTION_TYPES: ['TEXT', 'TEXTAREA', 'NUMBER', 'YESNO', 'SELECT', 'MULTISELECT'],
  QUESTION_SCOPES: ['COMMON', 'DEPARTMENT', 'DESIGNATION'],

  SHEETS: {
    EMPLOYEES: 'EMPLOYEES',
    DEPARTMENTS: 'DEPARTMENTS',
    DESIGNATIONS: 'DESIGNATIONS',
    DESIGNATION_MAPPING: 'DESIGNATION_MAPPING',
    QUESTIONNAIRE_MASTER: 'QUESTIONNAIRE_MASTER',
    QUESTIONNAIRE_OPTIONS: 'QUESTIONNAIRE_OPTIONS',
    DAILY_RESPONSES: 'DAILY_RESPONSES',
    TASK_ENTRIES: 'TASK_ENTRIES',
    TASK_TIME_LOGS: 'TASK_TIME_LOGS',
    DIFFICULTIES: 'DIFFICULTIES',
    DELAY_TRACKER: 'DELAY_TRACKER',
    DAILY_REPORTS: 'DAILY_REPORTS',
    DEPARTMENT_REPORTS: 'DEPARTMENT_REPORTS',
    MANAGER_REMARKS: 'MANAGER_REMARKS',
    NOTIFICATION_LOGS: 'NOTIFICATION_LOGS',
    SYSTEM_SETTINGS: 'SYSTEM_SETTINGS',
    ACTIVITY_LOGS: 'ACTIVITY_LOGS',
    AUTH_SESSIONS: 'AUTH_SESSIONS'
  },

  // Audit columns appended to every table automatically.
  AUDIT_COLUMNS: ['CreatedAt', 'CreatedBy', 'UpdatedAt', 'UpdatedBy'],

  // Column headers. All access is header-based; column order can be changed in the sheet safely.
  SCHEMA: {
    EMPLOYEES: ['EmployeeID', 'EmployeeName', 'Designation', 'Department', 'Email', 'Mobile', 'JoiningDate',
      'ReportingManagerID', 'ReportingManagerName', 'WorkStart', 'WorkEnd', 'WorkingHours', 'BreakMinutes',
      'Role', 'Status', 'WhatsAppNumber', 'Notes'],
    DEPARTMENTS: ['DepartmentID', 'DepartmentName', 'Description', 'ManagerID', 'Active'],
    DESIGNATIONS: ['DesignationID', 'DesignationName', 'Description', 'Active'],
    DESIGNATION_MAPPING: ['MappingID', 'Designation', 'Department', 'QuestionnaireKey', 'DefaultManagerID', 'Active'],
    QUESTIONNAIRE_MASTER: ['QuestionID', 'Scope', 'ScopeValue', 'QuestionText', 'QuestionType', 'Mandatory',
      'SortOrder', 'Active', 'ConditionQuestionID', 'ConditionValue', 'HelpText', 'Version'],
    QUESTIONNAIRE_OPTIONS: ['OptionID', 'QuestionID', 'OptionValue', 'OptionLabel', 'SortOrder', 'Active'],
    DAILY_RESPONSES: ['ResponseID', 'Date', 'EmployeeID', 'QuestionID', 'QuestionText', 'Answer',
      'QuestionnaireVersion', 'Status'],
    TASK_ENTRIES: ['TaskID', 'Date', 'EmployeeID', 'EmployeeName', 'Department', 'Designation', 'TaskTitle',
      'TaskDescription', 'TaskCategory', 'StartTime', 'EndTime', 'TimeSpentMinutes', 'Priority', 'Status',
      'CompletionPercent', 'RelatedDepartment', 'SupportingDocuments', 'Remarks', 'TimerState', 'PendingReason',
      'ExpectedCompletionDate', 'ResponsibleDependency', 'CompletedAt'],
    TASK_TIME_LOGS: ['LogID', 'TaskID', 'EmployeeID', 'Date', 'StartTime', 'EndTime', 'DurationMinutes',
      'Source', 'Reason', 'ApprovalStatus'],
    DIFFICULTIES: ['DifficultyID', 'Date', 'EmployeeID', 'EmployeeName', 'Department', 'TaskID', 'TaskName',
      'ProblemDescription', 'DifficultyLevel', 'Category', 'Reason', 'DelayMinutes', 'DelayType',
      'ResponsibleDependency', 'DepartmentInvolved', 'AssistanceRequired', 'EscalationRequired',
      'ResolutionStatus', 'ResolutionNotes', 'ResolvedBy', 'ResolvedAt'],
    DELAY_TRACKER: ['DelayID', 'Date', 'EmployeeID', 'Department', 'TaskID', 'TaskName', 'DifficultyID',
      'DelayType', 'DelayReason', 'DelayMinutes', 'ResponsibleDependency', 'Status'],
    DAILY_REPORTS: ['ReportID', 'Date', 'EmployeeID', 'EmployeeName', 'Department', 'Designation',
      'ReportingManagerID', 'Status', 'QuestionnaireStatus', 'TotalTasks', 'CompletedTasks', 'InProgressTasks',
      'PendingTasks', 'BlockedTasks', 'OnHoldTasks', 'WorkingMinutes', 'RecordedMinutes', 'UnallocatedMinutes',
      'CompletionRate', 'OnTimeRate', 'WeightedScore', 'UtilizationRate', 'EmployeeRemarks', 'ReportJSON',
      'SubmittedAt', 'ApprovedAt', 'ApprovedBy', 'Locked', 'GeneratedBy'],
    DEPARTMENT_REPORTS: ['DeptReportID', 'Date', 'Department', 'TotalEmployees', 'ReportsSubmitted',
      'ReportsPending', 'TotalTasks', 'TasksCompleted', 'TasksPending', 'TasksBlocked', 'AvgCompletionRate',
      'TotalRecordedMinutes', 'MajorDifficulties', 'SummaryJSON'],
    MANAGER_REMARKS: ['RemarkID', 'ReportID', 'Date', 'EmployeeID', 'ManagerID', 'ManagerName', 'Remarks',
      'ActionPoints', 'Rating'],
    NOTIFICATION_LOGS: ['NotificationID', 'Type', 'Recipient', 'Channel', 'Subject', 'Message', 'Status', 'Error'],
    SYSTEM_SETTINGS: ['Key', 'Value', 'Description'],
    ACTIVITY_LOGS: ['LogID', 'Timestamp', 'UserEmail', 'EmployeeID', 'Action', 'Entity', 'EntityID', 'Details'],
    AUTH_SESSIONS: ['SessionID', 'TokenHash', 'Email', 'EmployeeID', 'Role', 'ExpiresAt', 'LastSeenAt', 'Active']
  },

  // Columns that must always be stored as plain text (prevents Sheets from dropping leading zeros etc.)
  TEXT_COLUMNS: ['Mobile', 'WhatsAppNumber', 'Answer', 'ReportJSON', 'SummaryJSON', 'Details', 'Value',
    'StartTime', 'EndTime', 'WorkStart', 'WorkEnd', 'Date', 'JoiningDate', 'ExpectedCompletionDate',
    'CompletedAt', 'Timestamp', 'CreatedAt', 'UpdatedAt', 'SubmittedAt', 'ApprovedAt', 'ResolvedAt',
    'ExpiresAt', 'LastSeenAt'],

  DEFAULT_DEPARTMENTS: [
    { DepartmentName: 'SALES', Description: 'Sales and customer acquisition' },
    { DepartmentName: 'ACCOUNTS', Description: 'Accounting, invoicing, GST and payments' },
    { DepartmentName: 'E-COMMERCE', Description: 'Marketplace operations' },
    { DepartmentName: 'OPERATIONS', Description: 'MIS, Executive Assistant, Process Coordination, CRM' },
    { DepartmentName: 'PACKAGING', Description: 'Packaging and dispatch' },
    { DepartmentName: 'GEM', Description: 'Government e-Marketplace tenders and bids' },
    { DepartmentName: 'DIGITAL MARKETING', Description: 'Campaigns, social media, SEO' },
    { DepartmentName: 'GRAPHICS DESIGNER', Description: 'Creative and design' },
    { DepartmentName: 'STORE', Description: 'Inventory, stock control and store operations' }
  ],

  // Centralized designation -> department mapping (seeded into DESIGNATION_MAPPING; editable by admins).
  DEFAULT_DESIGNATION_MAPPING: [
    { Designation: 'Sales Executive', Department: 'SALES', QuestionnaireKey: 'Sales Executive' },
    { Designation: 'Accounts Executive', Department: 'ACCOUNTS', QuestionnaireKey: 'Accounts Executive' },
    { Designation: 'E-Commerce Executive', Department: 'E-COMMERCE', QuestionnaireKey: 'E-Commerce Executive' },
    { Designation: 'MIS Executive', Department: 'OPERATIONS', QuestionnaireKey: 'MIS Executive' },
    { Designation: 'Executive Assistant', Department: 'OPERATIONS', QuestionnaireKey: 'Executive Assistant' },
    { Designation: 'Process Coordinator', Department: 'OPERATIONS', QuestionnaireKey: 'Process Coordinator' },
    { Designation: 'CRM Executive', Department: 'OPERATIONS', QuestionnaireKey: 'CRM Executive' },
    { Designation: 'Packaging Executive', Department: 'PACKAGING', QuestionnaireKey: 'Packaging Executive' },
    { Designation: 'GEM Executive', Department: 'GEM', QuestionnaireKey: 'GEM Executive' },
    { Designation: 'Digital Marketing Executive', Department: 'DIGITAL MARKETING', QuestionnaireKey: 'Digital Marketing Executive' },
    { Designation: 'Graphic Designer', Department: 'GRAPHICS DESIGNER', QuestionnaireKey: 'Graphic Designer' },
    { Designation: 'Inventory Manager', Department: 'STORE', QuestionnaireKey: 'Inventory Manager' },
    { Designation: 'Store Executive', Department: 'STORE', QuestionnaireKey: 'Inventory Manager' },
    { Designation: 'MIS Manager', Department: 'OPERATIONS', QuestionnaireKey: 'MIS Executive' },
    { Designation: 'Sales Manager', Department: 'SALES', QuestionnaireKey: 'Sales Executive' },
    { Designation: 'Accounts Manager', Department: 'ACCOUNTS', QuestionnaireKey: 'Accounts Executive' },
    { Designation: 'E-Commerce Manager', Department: 'E-COMMERCE', QuestionnaireKey: 'E-Commerce Executive' },
    { Designation: 'Operations Manager', Department: 'OPERATIONS', QuestionnaireKey: 'Process Coordinator' },
    { Designation: 'System Administrator', Department: 'OPERATIONS', QuestionnaireKey: 'MIS Executive' }
  ],

  DEFAULT_SETTINGS: {
    COMPANY_NAME: { value: 'Oakcraft Furniture', description: 'Company name printed on reports' },
    WORK_START: { value: '09:30', description: 'Default working day start (HH:mm)' },
    WORK_END: { value: '18:30', description: 'Default working day end (HH:mm)' },
    WORKING_HOURS: { value: '8', description: 'Default configured working hours per day' },
    BREAK_MINUTES: { value: '60', description: 'Default approved break minutes per day' },
    REMINDER_MINUTES_BEFORE_CLOSE: { value: '30', description: 'Submission reminder sent this many minutes before WORK_END' },
    REPORT_GENERATION_TIME: { value: '19:00', description: 'Automatic daily report generation time (HH:mm)' },
    MANAGER_SUMMARY_TIME: { value: '19:30', description: 'Manager / department summary e-mail time (HH:mm)' },
    MANUAL_TIME_POLICY: { value: 'REASON_REQUIRED', description: 'ALLOW | REASON_REQUIRED | MANAGER_ONLY | DISABLED' },
    WHATSAPP_DEFAULT_NUMBER: { value: '', description: 'Default WhatsApp number (with country code, digits only) for report sharing' },
    WHATSAPP_MANAGEMENT_NUMBER: { value: '', description: 'Management WhatsApp number for department summaries' },
    AUTO_LOCK_ON_APPROVAL: { value: 'TRUE', description: 'Lock report after manager approval' },
    EMAIL_NOTIFICATIONS: { value: 'TRUE', description: 'Send e-mail reminders and summaries' },
    MAX_TASK_HOURS: { value: '14', description: 'Maximum hours a single task entry may span (validation)' },
    DEFAULT_TIMEZONE: { value: 'Asia/Kolkata', description: 'Display timezone' }
  }
};
