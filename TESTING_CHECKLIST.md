# Testing Checklist

Automated coverage: `node tests/run-tests.js` (34 backend scenarios, runs the real `.gs` code) and
`python3 tests/ui-smoke.py` (headless Chrome, admin / manager / employee / mobile). Status at delivery: **all passing, 0 console errors**.

| # | Scenario (from the specification) | How to verify manually | Automated |
|---|---|---|---|
| 1 | Add a Sales Executive → department SALES | Employee Management → Add → designation "Sales Executive" → Department field shows SALES; saved row has SALES | ✔ |
| 2 | Add an MIS Executive → OPERATIONS | same | ✔ |
| 3 | Add a CRM Executive → OPERATIONS | same | ✔ |
| 4 | Add a Graphic Designer → GRAPHICS DESIGNER (and Inventory Manager → STORE) | same | ✔ |
| 5 | Every designation receives the correct questionnaire | Questionnaire Management → Preview by designation; log in as employees of different designations | ✔ |
| 6 | Employees cannot access other employees' reports | Log in as an employee → only own reports/tasks; manager sees only team; API calls with another employeeId return FORBIDDEN | ✔ |
| 7 | Task durations calculate correctly | Add task 10:00–11:30 → 1 Hour 30 Minutes; timer start/complete shows elapsed | ✔ |
| 8 | Overlapping timers prevented | Start a second timer → conflict dialog; manual time inside an existing entry → OVERLAP error | ✔ |
| 9 | Statuses correctly classified | Report section 1 counts match task statuses | ✔ |
| 10 | Delay reasons appear in reports | Raise a difficulty with delay → report sections 4/5 and WhatsApp "Major challenges" | ✔ |
| 11 | Department summaries calculate correctly | Department Reports totals equal the sum of employee rows | ✔ |
| 12 | WhatsApp message formatting | Share dialog preview matches the specified template | ✔ |
| 13 | PDF generation | Report → Download PDF; department report → Download PDF | manual (browser) |
| 14 | Mobile responsiveness | Open on phone / 390px viewport; sidebar drawer, no horizontal scroll, timer buttons full width | ✔ (viewport test) |
| 15 | Incomplete submissions flagged | Generate reports for a day where someone did not submit → INCOMPLETE banner & status, never "Submitted" | ✔ |

Additional checks covered by the automated suites: OTP wrong/expired/unauthorized e-mail, duplicate e-mail/mobile, unknown designation never assigned, mapping creation for a new designation, questionnaire mandatory & conditional validation, manual-time policy, non-overlapping merge, difficulty against another department blocks task and updates delay tracker, resolving unblocks, duplicate report submission prevention, approval locking & reopening, manager remarks, scheduled reminder / generation / manager summary, trigger setup, questionnaire admin CRUD/reorder/toggle/history, settings validation, CSV export, deactivation ends sessions, demo persistence round-trip, top-bar running timer, role-based navigation.

## Before go-live
- [ ] `setupDatabase()` run, 18 sheets present
- [ ] Super-admin login works from the GitHub Pages URL
- [ ] One employee per department created; questionnaires previewed
- [ ] Department managers assigned
- [ ] Settings saved; `Apply automation schedule` run; triggers visible in Apps Script
- [ ] Test reminder and report generation manually from Settings
- [ ] WhatsApp numbers configured; share tested on a phone (text + PDF share sheet)
- [ ] Sample data removed (`removeSampleData()`) if it was loaded in production
