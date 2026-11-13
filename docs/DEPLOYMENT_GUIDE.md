# Deployment Guide

Two deployments: the **backend** (Google Apps Script + Google Sheets) and the **frontend** (GitHub Pages).
Total time: about 20 minutes.

---

## Part A — Backend: Google Sheets + Apps Script

### A1. Create the database spreadsheet
1. Go to <https://sheets.new> and name the spreadsheet `Daily Work Tracker Pro – Database`.
2. **Extensions → Apps Script**. An empty project opens, bound to this sheet.

### A2. Add the script files
1. In the Apps Script editor, delete the default `Code.gs` content.
2. Create one file per module (**+ → Script**) with exactly these names and paste the contents from `backend/`:

   `Code` · `Config` · `Utils` · `Database` · `Validation` · `Auth` · `DesignationService` · `EmployeeService` · `QuestionnaireService` · `TimeTrackingService` · `TaskService` · `DifficultyService` · `ReportService` · `WhatsAppService` · `AnalyticsService` · `NotificationService` · `SampleData`

   > Order does not matter for Apps Script. Alternatively use `clasp push` with the folder as-is (`appsscript.json` is included).
3. **Project Settings (⚙) → check "Show appsscript.json manifest file"** and replace its content with `backend/appsscript.json` (sets the timezone to Asia/Kolkata, V8 runtime, web-app access and OAuth scopes).

### A3. Configure
Open `Config.gs` and review:

| Setting | Value |
|---|---|
| `COMPANY_NAME` | `Oakcraft Furniture` |
| `SUPER_ADMIN_EMAILS` | e-mails that can always log in as SUPER_ADMIN (e.g. `mis@oakcraft.in`) |
| `SPREADSHEET_ID` | leave `''` (script is bound to the sheet). Set it only for a standalone script. |
| `TIMEZONE` | `Asia/Kolkata` |

Everything else (working hours, reminder times, WhatsApp numbers, policies) is edited later in **Settings** inside the app.

### A4. Initialise the database
1. In the editor toolbar select the function **`setupDatabase`** and click **Run**.
2. Authorise the script when prompted (Sheets, Mail, Triggers). This is a one-time authorisation for your own account.
3. The sheet now contains 18 tabs with headers, 9 departments, the designation → department mapping, 150+ questionnaire template questions, default settings and your super-admin employee row.
4. *(Optional)* run **`seedSampleData`** to load 15 sample employees across all departments with three days of realistic tasks, timers, answers, difficulties and reports. Remove later with `removeSampleData`.
5. Run **`setupTriggers`** to install the daily automation (reminder, report generation, manager summary). Re-run it (or use Settings → *Apply automation schedule*) whenever you change the times.

### A5. Deploy as Web App
1. **Deploy → New deployment → ⚙ Select type → Web app**.
2. Description: `v1` · Execute as: **Me** · Who has access: **Anyone**.
3. **Deploy** → copy the **Web app URL** (`https://script.google.com/macros/s/…/exec`).
4. Test: open the URL in a browser — you should see `{"success":true,…"status":"running"}`.

> **Updating the backend later:** edit the files, then **Deploy → Manage deployments → ✎ → Version: New version → Deploy**. The URL stays the same. (Editing code without creating a new version does not change the live web app.)

---

## Part B — Frontend: GitHub Pages

The frontend is a pure static site (no build step, relative paths, hash-based routing), so it is fully compatible with GitHub Pages — including project sites served under `https://<user>.github.io/<repo>/`.

### B1. Configure the API URL
Edit `frontend/js/config.js`:

```js
API_URL: 'https://script.google.com/macros/s/AKfycb…/exec',
```

Leave it empty to keep **Demo Mode** (backend runs in the browser with sample data — useful for a preview site).

### B2. Create the repository and push
```bash
git init
git add .
git commit -m "Daily Work Tracker Pro"
git branch -M main
git remote add origin https://github.com/<your-user>/daily-work-tracker-pro.git
git push -u origin main
```

### B3. Enable GitHub Pages (two options)

**Option 1 – GitHub Actions (recommended, included)**
1. Repository **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. The workflow `.github/workflows/deploy-pages.yml` runs on every push to `main` and publishes the `frontend/` folder.
3. After the first run, the site URL appears under Settings → Pages (e.g. `https://<user>.github.io/daily-work-tracker-pro/`).

**Option 2 – Deploy from a branch**
1. Copy the contents of `frontend/` to the repository root (or a `/docs` folder).
2. Settings → Pages → Source: *Deploy from a branch* → `main` / `/ (root)` (or `/docs`).
3. Keep the `.nojekyll` file — it prevents Jekyll from ignoring files.

### B4. Verify
1. Open the Pages URL. The login screen appears.
2. Enter your super-admin e-mail → the one-time code arrives by e-mail (from your Google account) → sign in.
3. Settings → *Data & automation* shows the connected backend URL.

### Custom domain (optional)
Settings → Pages → Custom domain (e.g. `tracker.oakcraft.in`) and add the CNAME record at your DNS provider. Apps Script accepts requests from any origin, so no backend change is needed.

---

## Part C — Security checklist

* The web app runs **as you** (the deployer), so only your account needs edit access to the spreadsheet; employees never touch the sheet directly.
* "Anyone" access is required for the browser to call the API; every request is still authenticated by the session token and authorised server-side by role. Unauthenticated requests can only reach `auth.requestOtp`, `auth.verifyOtp` and `meta.health`.
* Session tokens are stored hashed (SHA-256) in `AUTH_SESSIONS`; sessions expire after `SESSION_HOURS` (12 h) and end on logout or deactivation.
* OTP codes are hashed, expire after 10 minutes and lock after 5 wrong attempts.
* Restrict spreadsheet sharing to administrators; use the app's CSV export for data access.

## Part D — Updating

| Change | Action |
|---|---|
| Backend code | Paste new `.gs` files → Deploy → Manage deployments → New version |
| Frontend code | Push to `main` → Pages workflow redeploys automatically |
| Questions, designations, departments, settings | Inside the app (Questionnaire Management / Settings) — no code change |
| Add a sheet column | Add the header to `CONFIG.SCHEMA` and run `setupDatabase()` again (adds missing columns, keeps data) |

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Invalid response from server" | Web app not deployed with access *Anyone*, or you copied the `/dev` URL instead of `/exec` |
| Login e-mail not received | Check spam; MailApp daily quota (100 for free Gmail, 1,500 for Workspace); confirm the e-mail exists in EMPLOYEES and is ACTIVE |
| "Sheet … not found" | Run `setupDatabase()` |
| Timers show the wrong time | Confirm `TIMEZONE` in Config.gs and `appsscript.json` is `Asia/Kolkata` |
| Reminder / reports not running | Run `setupTriggers()` (or Settings → Apply schedule) and check **Triggers** in the Apps Script sidebar |
| Changes to code not visible | Create a **new version** of the deployment |
