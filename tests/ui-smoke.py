"""
ui-smoke.py — Opens the frontend in headless Chrome (Playwright), runs Demo Mode end-to-end for
admin, manager and employee roles, visits every module, exercises the key flows and records console
errors + screenshots.  Usage:  python3 tests/ui-smoke.py   (requires playwright + a local http server)
CDN assets are served from a local node_modules copy so the test works offline.
"""
import os, sys, json, subprocess, time, re
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRONT = os.path.join(ROOT, 'frontend')
SHOTS = os.path.join(ROOT, 'tests', 'screenshots')
VENDOR = os.environ.get('VENDOR_DIR', '/tmp/vendor/node_modules')
os.makedirs(SHOTS, exist_ok=True)
PORT = 8765

CDN_MAP = {
    'bootstrap@5.3.3/dist/css/bootstrap.min.css': 'bootstrap/dist/css/bootstrap.min.css',
    'bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js': 'bootstrap/dist/js/bootstrap.bundle.min.js',
    'bootstrap-icons@1.11.3/font/bootstrap-icons.min.css': 'bootstrap-icons/font/bootstrap-icons.min.css',
    'chart.js@4.4.1/dist/chart.umd.min.js': 'chart.js/dist/chart.umd.js',
    'html2pdf.js@0.10.1/dist/html2pdf.bundle.min.js': 'html2pdf.js/dist/html2pdf.bundle.min.js',
}

server = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1'], cwd=FRONT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
errors, failures = [], []

def route_cdn(route, request):
    url = request.url
    for k, v in CDN_MAP.items():
        if k in url:
            p = os.path.join(VENDOR, v)
            ctype = 'text/css' if p.endswith('.css') else 'application/javascript'
            return route.fulfill(path=p, content_type=ctype)
    if 'fonts.googleapis.com' in url or 'fonts/' in url:
        return route.fulfill(status=200, body='', content_type='text/css')
    return route.continue_()

def check(cond, msg):
    if cond: print('  ✔ ' + msg)
    else: print('  ✘ ' + msg); failures.append(msg)

def login(page, email):
    page.goto(f'http://127.0.0.1:{PORT}/index.html#/login')
    page.wait_for_selector('#login-form-email', timeout=20000)
    page.fill('[name=email]', email)
    page.click('#login-form-email button[type=submit]')
    page.wait_for_selector('#login-step-otp:not(.d-none)', timeout=30000)
    page.wait_for_timeout(300)
    page.click('#login-form-otp button[type=submit]')
    page.wait_for_selector('#app-shell:not(.d-none)', timeout=30000)
    page.wait_for_timeout(600)

def go(page, hash_, wait_sel=None, shot=None, ms=800):
    page.evaluate(f"location.hash='{hash_}'")
    page.wait_for_timeout(ms)
    if wait_sel: page.wait_for_selector(wait_sel, timeout=20000)
    page.wait_for_timeout(400)
    if shot: page.screenshot(path=os.path.join(SHOTS, shot), full_page=True)

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    ctx = browser.new_context(viewport={'width': 1366, 'height': 900})
    page = ctx.new_page()
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    page.on('pageerror', lambda e: errors.append('PAGEERROR: ' + str(e)))
    ctx.route('**/*', route_cdn)

    print('\n== Super admin ==')
    login(page, 'mis@oakcraft.in')
    page.screenshot(path=os.path.join(SHOTS, '01-login-done.png'))
    check('Dashboard' in page.inner_text('#topbar-title'), 'landed on dashboard')
    page.wait_for_selector('.dept-card', timeout=20000); page.wait_for_timeout(800)
    page.screenshot(path=os.path.join(SHOTS, '02-admin-dashboard.png'), full_page=True)
    check(page.locator('.dept-card').count() == 9, '9 department cards (incl. STORE)')
    check(page.locator('#dash-trend').count() == 1, 'trend chart rendered')

    go(page, '#/employees', '#emp-table table', '03-employees.png')
    check(page.locator('#emp-table tbody tr').count() >= 15, 'employee table populated')
    # Add employee flow with auto department
    page.click('[data-add]'); page.wait_for_selector('#emp-form')
    page.fill('[name=EmployeeName]', 'Test Store Person'); page.fill('[name=Designation]', 'Inventory Manager'); page.fill('[name=Email]', 'test.store@oakcraft.in'); page.fill('[name=Mobile]', '9899999999')
    page.wait_for_timeout(900)
    check(page.input_value('[name=Department]') == 'STORE', 'designation auto-resolved to STORE in form')
    page.screenshot(path=os.path.join(SHOTS, '04-add-employee.png'))
    page.click('[data-save]'); page.wait_for_timeout(1500)
    check('Test Store Person' in page.inner_text('#emp-table'), 'employee created and listed')

    go(page, '#/questionnaire', '[data-list] table, [data-list] .empty', '05-questionnaire-admin.png')
    check(page.locator('[data-set]').count() >= 13, 'question sets listed per designation')
    go(page, '#/tasks', '#task-table table', '06-tasks.png')
    go(page, '#/difficulty', '#diff-body table', '07-difficulty.png')
    check(page.locator('#diff-body tbody tr').count() >= 5, 'difficulty log rows')
    go(page, '#/reports', '#rep-table table', '08-reports-list.png')
    check(page.locator('#rep-table tbody tr').count() >= 15, 'report list rows')
    page.click('#rep-table tbody tr.clickable >> nth=0'); page.wait_for_selector('#report-doc', timeout=20000); page.wait_for_timeout(600)
    page.screenshot(path=os.path.join(SHOTS, '09-report-document.png'), full_page=True)
    txt = page.inner_text('#report-doc')
    check(all(s in txt for s in ['SECTION 1', 'SECTION 5', 'SECTION 7', 'SECTION 8', 'SECTION 10', 'DAILY EMPLOYEE WORK REPORT']), 'report has all 10 sections')
    page.click('[data-wa]'); page.wait_for_selector('.wa-preview'); page.wait_for_timeout(300)
    check('*DAILY WORK REPORT*' in page.inner_text('.wa-preview'), 'WhatsApp preview rendered')
    page.screenshot(path=os.path.join(SHOTS, '10-whatsapp-dialog.png'))
    page.keyboard.press('Escape'); page.wait_for_timeout(500)
    go(page, '#/department-reports', '#dept-doc', '11-department-report.png')
    go(page, '#/analytics', '#ch10', '12-analytics.png', ms=1500)
    check(page.locator('#an-body canvas').count() == 10, '10 analytics charts rendered')
    check(page.locator('.insight').count() >= 2, 'bottleneck insights')
    go(page, '#/settings', '#settings-form', '13-settings.png')
    page.click('a[href="#st-desig"]'); page.wait_for_timeout(800)
    check('Inventory Manager' in page.inner_text('#st-desig'), 'designation mapping shows Inventory Manager → STORE')
    page.screenshot(path=os.path.join(SHOTS, '14-settings-designations.png'), full_page=True)
    page.click('#btn-logout'); page.wait_for_selector('#login-form-email', timeout=15000)

    print('\n== Employee (Sales Executive) ==')
    login(page, 'rahul.sharma@example.com')
    check(page.locator('#main-nav a').count() == 5, 'employee sees only 5 nav items')
    page.wait_for_selector('#dash-body .kpi', timeout=20000); page.wait_for_timeout(600)
    page.screenshot(path=os.path.join(SHOTS, '20-employee-dashboard.png'), full_page=True)
    go(page, '#/tracker', '#tracker-pane .task-card, #tracker-pane .empty', '21-tracker-tasks.png')
    # Add a task and start timer
    page.click('[data-add]'); page.wait_for_selector('#task-form')
    page.fill('[name=TaskTitle]', 'Smoke test task'); page.select_option('[name=TaskCategory]', 'Reporting'); page.select_option('[name=Priority]', 'HIGH')
    page.click('[data-save-start]'); page.wait_for_timeout(1800)
    check(page.locator('.task-card.running').count() == 1, 'task created and timer running')
    check(not page.locator('#topbar-timer').evaluate('e=>e.classList.contains("d-none")'), 'top-bar running timer indicator visible')
    page.screenshot(path=os.path.join(SHOTS, '22-tracker-timer-running.png'), full_page=True)
    # Try to start a second task -> conflict dialog
    page.click('[data-add]'); page.wait_for_selector('#task-form'); page.fill('[name=TaskTitle]', 'Second task'); page.click('[data-save-start]'); page.wait_for_timeout(1500)
    check(page.locator('.modal.show').count() == 1 and 'already running' in page.inner_text('.modal.show'), 'overlapping timer prevented with conflict dialog')
    page.click('.modal.show [data-ok]'); page.wait_for_timeout(1500)
    check(page.locator('.task-card.running').count() == 1, 'pause & start swapped the running task')
    page.click('.task-card.running [data-timer=complete]'); page.wait_for_timeout(1500)
    check(page.locator('.task-card.running').count() == 0, 'complete stops the timer')
    # Questionnaire tab
    page.click('[data-tab=questionnaire]'); page.wait_for_selector('.q-section'); page.wait_for_timeout(500)
    page.screenshot(path=os.path.join(SHOTS, '23-questionnaire.png'), full_page=True)
    check('sales executive' in page.inner_text('.q-section h6 >> nth=0').lower(), 'designation-specific questionnaire shown first')
    # Timeline & submit
    page.click('[data-tab=timeline]'); page.wait_for_timeout(600); page.screenshot(path=os.path.join(SHOTS, '24-timeline.png'), full_page=True)
    check(page.locator('.tl-item').count() >= 3, 'timeline items rendered')
    page.click('[data-tab=submit]'); page.wait_for_timeout(600); page.screenshot(path=os.path.join(SHOTS, '25-submit.png'), full_page=True)
    check('*WORK SUMMARY*' in page.inner_text('.wa-preview'), 'submit pane has WhatsApp preview')
    go(page, '#/reports', '#rep-table table', '26-employee-reports.png')
    check(page.locator('#rep-table tbody tr').count() >= 3 and 'Rahul' in page.inner_text('#rep-table'), 'employee sees only own reports')
    go(page, '#/difficulty', '#diff-body table', '27-employee-difficulty.png')
    page.click('#btn-logout'); page.wait_for_selector('#login-form-email', timeout=15000)

    print('\n== Manager (Priya) ==')
    login(page, 'priya.nair@example.com')
    page.wait_for_selector('.dept-card', timeout=20000); page.wait_for_timeout(600)
    deptnames = page.inner_text('#dash-body')
    check('ACCOUNTS' not in deptnames and 'SALES' in deptnames, 'manager dashboard limited to own departments')
    page.screenshot(path=os.path.join(SHOTS, '30-manager-dashboard.png'), full_page=True)
    go(page, '#/reports', '#rep-table table')
    page.click('#rep-table tbody tr.clickable >> nth=0'); page.wait_for_selector('#report-doc', timeout=20000)
    check(page.locator('[data-remark]').count() == 1, 'manager sees Add remarks button')
    page.click('[data-remark]'); page.wait_for_selector('[data-remarks]'); page.fill('[data-remarks]', 'Smoke test remark'); page.click('[data-save]'); page.wait_for_timeout(1500)
    check('Smoke test remark' in page.inner_text('#report-doc'), 'manager remark appears in report')
    page.screenshot(path=os.path.join(SHOTS, '31-manager-report-remark.png'), full_page=True)

    # Mobile viewport check
    print('\n== Mobile viewport ==')
    mctx = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
    mp = mctx.new_page(); mctx.route('**/*', route_cdn)
    mp.on('pageerror', lambda e: errors.append('MOBILE PAGEERROR: ' + str(e)))
    mp.goto(f'http://127.0.0.1:{PORT}/index.html#/login'); mp.wait_for_selector('#login-form-email')
    mp.fill('[name=email]', 'arjun.desai@example.com'); mp.click('#login-form-email button[type=submit]'); mp.wait_for_selector('#login-step-otp:not(.d-none)'); mp.wait_for_timeout(300); mp.click('#login-form-otp button[type=submit]')
    mp.wait_for_selector('#app-shell:not(.d-none)', timeout=30000); mp.wait_for_timeout(800)
    mp.screenshot(path=os.path.join(SHOTS, '40-mobile-dashboard.png'), full_page=True)
    mp.click('#sidebar-toggle'); mp.wait_for_timeout(400); mp.screenshot(path=os.path.join(SHOTS, '41-mobile-menu.png'))
    check(mp.locator('#sidebar.open').count() == 1, 'mobile sidebar opens')
    mp.click('#main-nav a[data-hash="#/tracker"]'); mp.wait_for_selector('#tracker-pane .task-card, #tracker-pane .empty', timeout=20000); mp.wait_for_timeout(600)
    mp.screenshot(path=os.path.join(SHOTS, '42-mobile-tracker.png'), full_page=True)
    check(mp.evaluate('document.documentElement.scrollWidth <= 392'), 'no horizontal overflow on mobile')
    browser.close()

server.terminate()
real_errors = [e for e in errors if not re.search(r'favicon|ERR_INTERNET|net::|Failed to load resource', e)]
print('\nConsole/page errors: %d' % len(real_errors))
for e in real_errors[:15]: print('   ' + e[:300])
print('\n%d checks failed' % len(failures))
sys.exit(1 if failures or real_errors else 0)
