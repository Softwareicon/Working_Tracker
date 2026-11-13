# Architecture & Database Schema

```
┌───────────────────────────┐      POST text/plain { action, token, payload }      ┌──────────────────────────────┐
│  Frontend (GitHub Pages)  │ ───────────────────────────────────────────────────▶ │  Google Apps Script Web App   │
│  SPA · hash router        │ ◀─────────────────────────────────────────────────── │  Code.gs router → services    │
│  Bootstrap 5 · Chart.js   │        { success, message, data, code }              │  Auth · RBAC · Validation     │
│  html2pdf · Web Share     │                                                      └──────────────┬───────────────┘
└───────────────────────────┘                                                                     │ SpreadsheetApp (batch)
                                                                                                  ▼
                                                                                   ┌──────────────────────────────┐
                                                                                   │  Google Sheets (18 sheets)    │
                                                                                   │  CacheService · LockService   │
                                                                                   └──────────────────────────────┘
                                                        Time-based triggers: reminder · report generation · manager summary (MailApp)
```

## Backend modules

| File | Responsibility |
|---|---|
| `Code.gs` | `doGet/doPost`, route table, `handleRequest_` (auth → authorise → execute → uniform response), meta/settings/admin endpoints |
| `Config.gs` | Centralised configuration: sheets, schema, departments, designation mapping, lists, default settings |
| `Utils.gs` | Timezone-safe dates, ids, hashing, responses, audit log, re-entrant lock |
| `Database.gs` | Header-based table access (`readTable_`, `insert_`, `update_`, `remove_`), caching, `setupDatabase()`, seeds, settings, CSV |
| `Validation.gs` | Input validation for employees, tasks, difficulties, questions |
| `Auth.gs` | OTP login, hashed sessions, context resolution, role helpers, visibility rules |
| `DesignationService.gs` | Designation master + designation → department mapping engine |
| `EmployeeService.gs` | Employee CRUD with automatic department assignment, status, history |
| `QuestionnaireService.gs` | Templates, questionnaire builder, answers (draft/submit), admin CRUD, reorder, versions |
| `TimeTrackingService.gs` | Interval merging, overlap detection, daily time analysis, timeline |
| `TaskService.gs` | Task CRUD, timers (start/pause/resume/complete), manual time, logs |
| `DifficultyService.gs` | Difficulty CRUD, delay tracker sync, status workflow, bottlenecks |
| `ReportService.gs` | Daily report builder, submit/approve/reopen, manager remarks, list, department & management summaries |
| `WhatsAppService.gs` | Message formatting + `wa.me` links |
| `AnalyticsService.gs` | Dashboard, 10 chart datasets, bottleneck analysis, logs |
| `NotificationService.gs` | E-mails, scheduled jobs, trigger setup |
| `SampleData.gs` | Realistic sample data for all departments |

## API actions

Public: `auth.requestOtp`, `auth.verifyOtp`, `meta.health`.
Authenticated (role enforced server-side):

`auth.me` `auth.logout` `meta.bootstrap` · `employees.list/get/save/setStatus/history` · `designations.list/resolve/save/delete` · `departments.list/save` ·
`questionnaire.get/save/preview` `questionnaire.admin.list/save/delete/reorder/toggle/history` · `tasks.list/save/delete/timer/manualTime/logs/deleteLog` `time.timeline` ·
`difficulties.list/save/updateStatus/delete/bottlenecks` · `reports.get/generate/submit/approve/reopen/managerRemark/list/mine/department/management/whatsapp` ·
`analytics.dashboard/charts/bottlenecks` `logs.list` · `settings.get/save/applySchedule` `admin.runScheduled/exportCsv/seedSample/setupDatabase`

Error codes: `VALIDATION`, `FORBIDDEN`, `NOT_FOUND`, `DUPLICATE`, `DESIGNATION_UNMAPPED`, `TIMER_CONFLICT`, `OVERLAP`, `LOCKED`, `CONFIRM_NO_TASKS`, `AUTH_*`, `SERVER_ERROR`.

## Role matrix

| | SUPER_ADMIN | ADMIN | DEPARTMENT_MANAGER | EMPLOYEE |
|---|---|---|---|---|
| Own tracker / questionnaire / reports | ✔ | ✔ | ✔ | ✔ |
| Employees of own team / department | ✔ | ✔ | view, reports, remarks, approve, difficulties | – |
| All employees, all departments | ✔ | ✔ | – | – |
| Employee management, designations, questionnaire, settings | ✔ | ✔ | – | – |
| Grant ADMIN / SUPER_ADMIN roles, setupDatabase | ✔ | – | – | – |

## Database schema (all tables also have CreatedAt, CreatedBy, UpdatedAt, UpdatedBy)

| Sheet | Key | Columns |
|---|---|---|
| EMPLOYEES | EmployeeID (EMP001…) | EmployeeName, Designation, Department, Email, Mobile, JoiningDate, ReportingManagerID, ReportingManagerName, WorkStart, WorkEnd, WorkingHours, BreakMinutes, Role, Status, WhatsAppNumber, Notes |
| DEPARTMENTS | DepartmentID | DepartmentName, Description, ManagerID, Active |
| DESIGNATIONS | DesignationID | DesignationName, Description, Active |
| DESIGNATION_MAPPING | MappingID | Designation, Department, QuestionnaireKey, DefaultManagerID, Active |
| QUESTIONNAIRE_MASTER | QuestionID (Q0001…) | Scope (COMMON/DEPARTMENT/DESIGNATION), ScopeValue, QuestionText, QuestionType, Mandatory, SortOrder, Active, ConditionQuestionID, ConditionValue, HelpText, Version |
| QUESTIONNAIRE_OPTIONS | OptionID | QuestionID, OptionValue, OptionLabel, SortOrder, Active |
| DAILY_RESPONSES | ResponseID | Date, EmployeeID, QuestionID, QuestionText (snapshot), Answer, QuestionnaireVersion, Status (DRAFT/SUBMITTED) |
| TASK_ENTRIES | TaskID | Date, EmployeeID, EmployeeName, Department, Designation, TaskTitle, TaskDescription, TaskCategory, StartTime, EndTime, TimeSpentMinutes, Priority, Status, CompletionPercent, RelatedDepartment, SupportingDocuments, Remarks, TimerState, PendingReason, ExpectedCompletionDate, ResponsibleDependency, CompletedAt |
| TASK_TIME_LOGS | LogID | TaskID, EmployeeID, Date, StartTime, EndTime, DurationMinutes, Source (TIMER/MANUAL), Reason, ApprovalStatus |
| DIFFICULTIES | DifficultyID | Date, EmployeeID, EmployeeName, Department, TaskID, TaskName, ProblemDescription, DifficultyLevel, Category, Reason, DelayMinutes, DelayType, ResponsibleDependency, DepartmentInvolved, AssistanceRequired, EscalationRequired, ResolutionStatus, ResolutionNotes, ResolvedBy, ResolvedAt |
| DELAY_TRACKER | DelayID | Date, EmployeeID, Department, TaskID, TaskName, DifficultyID, DelayType, DelayReason, DelayMinutes, ResponsibleDependency, Status |
| DAILY_REPORTS | ReportID | Date, EmployeeID, EmployeeName, Department, Designation, ReportingManagerID, Status, QuestionnaireStatus, TotalTasks, CompletedTasks, InProgressTasks, PendingTasks, BlockedTasks, OnHoldTasks, WorkingMinutes, RecordedMinutes, UnallocatedMinutes, CompletionRate, OnTimeRate, WeightedScore, UtilizationRate, EmployeeRemarks, ReportJSON, SubmittedAt, ApprovedAt, ApprovedBy, Locked, GeneratedBy |
| DEPARTMENT_REPORTS | DeptReportID | Date, Department, TotalEmployees, ReportsSubmitted, ReportsPending, TotalTasks, TasksCompleted, TasksPending, TasksBlocked, AvgCompletionRate, TotalRecordedMinutes, MajorDifficulties, SummaryJSON |
| MANAGER_REMARKS | RemarkID | ReportID, Date, EmployeeID, ManagerID, ManagerName, Remarks, ActionPoints, Rating |
| NOTIFICATION_LOGS | NotificationID | Type, Recipient, Channel, Subject, Message, Status, Error |
| SYSTEM_SETTINGS | Key | Value, Description |
| ACTIVITY_LOGS | LogID | Timestamp, UserEmail, EmployeeID, Action, Entity, EntityID, Details |
| AUTH_SESSIONS | SessionID | TokenHash, Email, EmployeeID, Role, ExpiresAt, LastSeenAt, Active |

Design rules: columns are addressed by header name (order in the sheet is free); text-sensitive columns are forced to plain-text format; dates are stored as `yyyy-MM-dd`, times as `yyyy-MM-ddTHH:mm:ss` in the configured timezone; writes go through `LockService`; master tables are cached for 5 minutes and invalidated on write.

## Time calculations
* Every timer segment / manual entry is a `[StartTime, EndTime]` interval in TASK_TIME_LOGS.
* **Task time** = merged duration of its own intervals. **Recorded task time** = merged duration of all the employee's intervals that day — overlapping intervals are counted once.
* **Unallocated** = configured working minutes − recorded − approved break (never negative).
* **Overlap prevention**: only one RUNNING timer per employee; manual entries and timed tasks are rejected if they intersect existing intervals.

## Productivity metrics (transparent)
Completion rate · on-time rate (vs ExpectedCompletionDate) · pending % · blocked % · utilization · **weighted score** = Σ(priority weight × completion %) / Σ(weight) over tasks not blocked by management-approval / interdepartmental / external / technical dependencies. The notes explaining the formula are printed on every report.

## Report status workflow
`NOT_STARTED → INCOMPLETE → SUBMITTED → APPROVED (locked)`; `REOPENED` by manager/admin returns to editable, then `SUBMITTED` again. Automated generation never promotes a report to SUBMITTED.
