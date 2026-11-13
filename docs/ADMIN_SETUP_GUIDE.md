# Administrator Setup Guide

## 1. First login
1. Open the app URL and enter a super-admin e-mail (configured in `Config.gs → SUPER_ADMIN_EMAILS`).
2. Enter the 6-digit code from the e-mail. You land on the **Dashboard**.

## 2. Settings (Settings → General)
| Setting | Purpose |
|---|---|
| Work start / end · Working hours · Break minutes | Defaults for every employee (can be overridden per employee) |
| Reminder minutes before close | When the "submit your report" e-mail goes out |
| Report generation time · Manager summary time | Automated end-of-day jobs |
| Manual time policy | `ALLOW`, `REASON_REQUIRED` (default), `MANAGER_ONLY`, `DISABLED` |
| Auto-lock on approval | Lock the day after a manager approves it |
| WhatsApp default / management numbers | Targets offered in the Share dialog |
| E-mail notifications | Master switch for reminders, summaries, escalations |

Click **Save settings**, then **Apply automation schedule** to (re)install the daily triggers.

## 3. Departments & designations (Settings → Designations & departments)
* Nine departments are created automatically: SALES, ACCOUNTS, E-COMMERCE, OPERATIONS (MIS, Executive Assistant, Process Coordinator, CRM), PACKAGING, GEM, DIGITAL MARKETING, GRAPHICS DESIGNER, **STORE** (Inventory Manager).
* Each designation is mapped to exactly one department and one **questionnaire set**. The mapping drives automatic department assignment.
* **Add designation**: name → department → questionnaire set (reuse an existing set or leave blank and add questions later) → default reporting manager.
* Assign a **department manager** to each department; managers see their department's employees, reports and difficulties.

## 4. Employees (Employee Management)
1. **Add employee** → name, **designation**, e-mail (login), mobile, WhatsApp, joining date, schedule, role, status.
2. The department is shown read-only and filled automatically as you type the designation. If the designation is unknown, the form offers *Create mapping & questionnaire* — the employee is never saved with a wrong department.
3. Reporting manager: pick one or leave *Use department default*.
4. Roles: `EMPLOYEE` (own data), `DEPARTMENT_MANAGER` (team), `ADMIN` (everything except granting admin roles), `SUPER_ADMIN`.
5. Deactivating an employee ends their sessions immediately; history is retained.
6. The profile button shows 30-day activity, reports, difficulties and the audit log.

## 5. Questionnaire Management
* Left panel lists question sets: **Common** (all employees), **Department** sets, **Designation** sets.
* **Add question**: scope, applies-to, text, answer type (TEXT, TEXTAREA, NUMBER, YESNO, SELECT, MULTISELECT), mandatory, options, condition (show only if another question has a given answer), help text.
* Reorder with the arrows; deactivate instead of deleting when history must be kept (the system does this automatically if answers exist).
* **Preview by designation** shows exactly what an employee will see. **Version history** lists every change.

## 6. Daily operation
| When | What |
|---|---|
| During the day | Employees add tasks and run timers in **Daily Work Tracker**; difficulties are raised as they happen |
| 30 min before close | Reminder e-mail to everyone who has not submitted |
| Closing time | Employees submit questionnaire + report (WhatsApp share optional) |
| Report generation time | Reports are generated for everyone; non-submitters are marked **INCOMPLETE** (never "complete") and running timers are auto-paused |
| Manager summary time | Department summaries e-mailed to managers; management summary to admins |

Manual equivalents: Settings → Data & automation → *Send reminders / Generate reports / Manager summaries*; Employee Reports → *Generate all*.

## 7. Reviewing work (managers & admins)
* **Employee Reports** → open a report → *Add manager remarks* (feedback, action points, rating) → *Approve & lock* / *Reopen*.
* **Department Reports** → team table, difficulties, WhatsApp department summary, PDF.
* **Difficulty Tracker** → update status (OPEN / IN_PROGRESS / ESCALATED / RESOLVED); resolving a blocking difficulty returns the task to IN PROGRESS.
* **Analytics** → 10 charts + bottleneck analysis; click a department bar to drill into its report.

## 8. Data
* **Export**: Settings → Data & automation → choose a sheet → CSV (opens in Excel). Task Management also exports filtered CSV.
* **Sample data**: *Load sample data* adds `@example.com` employees; remove with `removeSampleData()` in Apps Script.
* **Verify / repair sheets** re-runs `setupDatabase()` (adds missing columns, never deletes data).
* **Audit log** (Settings → Activity log): logins, edits, submissions, approvals, settings changes, exports.
