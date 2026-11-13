# Daily Work Tracker Pro

Enterprise-level employee daily activity & productivity management system for **Oakcraft Furniture**.

| Layer | Technology |
|---|---|
| Frontend | HTML5 · CSS3 · Vanilla JavaScript · Bootstrap 5 · Chart.js · html2pdf.js — hosted on **GitHub Pages** |
| Backend | **Google Apps Script** Web App (JSON API, `{ action, token, payload }`) |
| Database | **Google Sheets** (18 sheets, header-based column mapping, auto-created by `setupDatabase()`) |
| Reports | Professional HTML report · Print · PDF export · WhatsApp Click-to-Chat · Web Share (PDF) · CSV |

## What it does

* **Automatic department assignment** – the admin selects only a designation; the department, questionnaire set and reporting manager are resolved from the centralized `DESIGNATION_MAPPING` sheet. Unknown designations are never silently assigned; the admin is prompted to create the mapping.
* **Questionnaire engine** – designation-specific + department + common questions, conditional questions, mandatory/optional, auto-save drafts, admin-managed (add / edit / reorder / activate / delete) with version history.
* **Daily task tracking** – tasks with category, priority, status (COMPLETED / IN PROGRESS / PENDING / ON HOLD / BLOCKED), completion %, start / pause / resume / complete timers, overlapping-timer prevention, manual time entries with configurable policy, non-overlapping time math.
* **Difficulty & delay tracker** – 10 categories, delay types (employee / management approval / interdepartmental / external / technical), raise issues against other departments, escalation e-mails, recurring bottleneck analysis. External dependencies never penalize the employee.
* **Daily reports** – 10-section employee report (work summary, task-wise details, achievements, pending work, challenges, time utilization, transparent productivity metrics, tomorrow's priorities, employee & manager remarks) + department and management summaries. Submission workflow with approval locking and authorized reopening; incomplete submissions are clearly flagged, never shown as complete.
* **WhatsApp sharing** – formatted message, `wa.me` links with configurable numbers, copy text, Web Share API for PDF where supported, Download PDF fallback.
* **Dashboards & analytics** – company overview, department performance, employee performance, 10 analytics charts, bottleneck analysis, drill-down from department to employee reports.
* **Automation** – daily submission reminder, end-of-day report generation, manager / management summaries via time-based triggers configured from Settings.
* **Security** – authorized e-mail OTP login, hashed session tokens, server-side role-based authorization (SUPER ADMIN / ADMIN / DEPARTMENT MANAGER / EMPLOYEE), backend validation of every input, audit log.

## Repository layout

```
backend/               Google Apps Script project (17 .gs modules + appsscript.json)
frontend/              Static web app (deploy this folder to GitHub Pages)
  index.html           SPA shell
  css/                 styles.css, responsive.css
  js/                  config.js (API URL), api.js, app.js, auth.js, dashboard.js, employees.js, tracker.js,
                       questionnaire.js, tasks.js, difficulty.js, reports.js, analytics.js, settings.js, whatsapp.js
  js/demo/             gas-shim.js + backend-bundle.js  (Demo Mode: real backend running in the browser)
docs/                  Deployment, admin, employee guides · architecture & database schema · testing checklist
tests/                 run-tests.js (backend, 34 scenarios) · ui-smoke.py (browser end-to-end)
.github/workflows/     GitHub Pages deployment workflow
build-demo.sh          Rebuilds the demo bundle from backend/*.gs
```

## Quick start

1. **Backend** – create a Google Sheet → Extensions → Apps Script → paste the files from `backend/` → run `setupDatabase()` → (optional) `seedSampleData()` → `setupTriggers()` → Deploy → Web app (Execute as *Me*, access *Anyone*) → copy the URL.
2. **Frontend** – put the URL in `frontend/js/config.js` → `API_URL`, push to GitHub, enable Pages (Settings → Pages → Source: *GitHub Actions*).
3. Log in with a super-admin e-mail (`CONFIG.SUPER_ADMIN_EMAILS` in `backend/Config.gs`).

Full instructions: [docs/DEPLOYMENT_GUIDE.md](docs/DEPLOYMENT_GUIDE.md).

**Demo mode:** leave `API_URL` empty and open `frontend/index.html` (or the Pages URL) – the complete backend runs inside the browser with sample data, so the whole application can be explored before the Google deployment.

## Tests

```bash
node tests/run-tests.js          # backend: 34 scenarios incl. the 15 from the specification
python3 tests/ui-smoke.py        # headless Chrome end-to-end (needs playwright + local vendor libs)
```
