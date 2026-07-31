# Spec — Payslip data contract & payroll correctness

> MC Task: 0f7ab2c1-PLACEHOLDER (set on creation — see § MC binding)
> Status: draft, awaiting CEO sign-off on § 2 field list
> Origin: CEO via `/techlead` 2026-07-31 — "payslip выглядит непрофессионально", "хочу вставлять бонус вручную", "25/15/12 — это ЗП до вычета налога"

---

## 1. What is wrong today

Observed on the July 2026 period (`4ad08d26`, status `calculated`, total ฿53,800).

| # | Symptom | Root cause | Severity |
|---|---|---|---|
| 1 | `Days` column reads 0 for everyone | **Two systems that never talk.** The schedule lives in `shifts` — 104 rows for July 2026. Payroll reads `staff_attendance` — 4 rows for July 2026. `days_worked` counts only explicit `staff_attendance.status='worked'` rows, and nothing projects the schedule into attendance. June looks right only because it was backfilled by hand. | High — money is still correct (base salary is not derived from `days_worked`), but the document is unreadable and looks broken |
| 1b | Lateness is never deducted | `fn_calculate_payroll` reads `unworked_time_adjustments` into `other_deductions`, and `useUnworkedTime.ts` can write it — but the table holds **0 rows**, while `v_shift_punctuality` holds 222. The punctuality → payroll link exists end to end and has never once been actioned. | High — the LEG-004 policy the CEO agreed is, in practice, not running |
| 1c | Public holidays are invisible | No holidays/calendar table exists anywhere in the schema. The only holiday ever recorded is one hand-typed `staff_attendance` row on 2026-06-03. July 2026 has at least one fixed-date public holiday (28 July, HM the King's Birthday) plus the lunar Asalha Bucha / Khao Phansa pair, and **none of them are in the system**. | High — drives closing decisions, day-off planning, and holiday-rate pay |
| 2 | `SSO` column is ฿0 for everyone | `fn_calculate_payroll` skips SSO entirely when `staff.sso_number IS NULL`. It is NULL for **all four** employees, while the company has been a registered employer since 2026-06-01 (acct 8330006310). | **Critical — money.** If enrolment is live, June + July employee 5% and employer 5% are both unremitted. Late remittance carries 2%/month. |
| 3 | `Withholding tax` always ฿0, hardcoded | `fn_calculate_payroll` inserts a literal `0`; there is no PIT computation at all. | Low in amount, high in credibility — see § 3, the correct figure today really is ฿0, but for a reason the payslip never states |
| 4 | No way to enter a bonus | `payroll_lines` has **no bonus column**. Bonuses have been shoehorned into `overtime_pay` (Apr-2026 holiday bonus; Nono's June offset). Nothing in the UI writes it. | High — CEO-blocking |
| 5 | Any recalculation silently destroys manual adjustments | `fn_calculate_payroll`'s `ON CONFLICT … DO UPDATE` overwrites every money column. `notes` is *not* in the update list, so a stale note survives and describes numbers that no longer exist. | High — data integrity |
| 6 | Payslip identity block is thin | Short call-names only ("Mint", "Hein"), `name_th` / `sso_number` / `tax_id` / work-permit fields are NULL for everyone; no DOB or address columns exist. | Medium — the ask |
| 7 | "Work permit & visa (annual) ฿15,000 / Paid by the employer. Does not reduce your net pay." | Rendered from `staff.work_permit_annual_thb`. | Remove — CEO decision, see § 2.3 |

**Live hazard, unrelated to code:** the July period is `calculated` with an active **Approve & Create Expenses** button, and its numbers are known-wrong — Alex carries ฿3,500 the CEO decided not to pay, Nono is missing her agreed +฿1,200 offset, and SSO is ฿0 for all. Approving books all of that to the expense ledger. **Do not approve July until this spec lands.**

---

## 2. The payslip field contract

### 2.1 MUST appear

Anchored on LPA B.E. 2541 §115 (employee register: name-surname, sex, nationality, DOB, current address, start date, position, wage rate and agreed benefits, termination date) — the payslip is the employee-facing projection of that register.

**Employer block**
- Company legal name — `Shishka Healthy Food Company Limited`
- Company tax ID (13-digit)
- Registered address
- SSO employer account number

**Employee block**
- Full legal name, Latin — given + family, as on the passport / ID
- Full legal name, Thai script (`name_th`) where one exists
- Employee ID
- Position
- Nationality
- Date of birth
- Employment start date
- Employment type (full-time / probation / …)
- Social Security number, or the explicit words `Pending enrolment` — never a blank

**Period block**
- Pay period start–end, pay date, period status

**Earnings** — every line itemised, zero-value lines shown as ฿0, never hidden
- Base salary (with the contractual monthly gross printed alongside)
- Overtime — hours × multiplier, shown separately from bonus
- **Bonus** — amount + free-text reason
- Gross total

**Deductions** — itemised, zero-value lines shown
- Unpaid absence — `N days × daily rate`, with the daily-rate basis printed (`monthly / 30`, LPA §68)
- Social Security 5% — with the ฿15,000 capped base printed
- Withholding tax — with the basis printed (see § 3)
- Other — itemised, never a bare lump
- Total deductions

**Attendance**
- Calendar days · days worked · unpaid absence · paid leave — all four filled, never 0-by-accident

**Footer**
- Net pay
- Payment method (cash)
- Employer signature / employee signature lines

### 2.2 SHOULD appear when the data exists

- Thai tax ID
- Work permit number + expiry (migrant staff)
- Current address
- Year-to-date gross / tax / SSO
- Bank account (if payment ever moves off cash)

### 2.3 MUST NOT appear

- **The "Employer-paid · not deducted → Work permit & visa (annual)" block.** CEO decision 2026-07-31. Beyond being noise on a wage document, printing the employer's visa outlay next to the employee's net pay invites exactly the set-off that the Royal Decree on the Management of Foreign Workers B.E. 2560 and LPA §76 prohibit. `staff.work_permit_annual_thb` stays in the DB as an HR/finance figure; it leaves the payslip.
- Any deduction line for visa / work-permit cost, under any label.
- Passport number (HR file only).
- Punctuality records, warnings, disciplinary notes.

### 2.4 Data we hold vs. data we must collect

| Field | State today | Action |
|---|---|---|
| Full legal name (Latin) | ✗ short call-names only | **collect** |
| `name_th` | ✗ NULL for all | **collect** |
| `sso_number` | ✗ NULL for all | **collect** — blocks § 1 #2 |
| `tax_id` | ✗ NULL for all | **collect** |
| `work_permit_number` / `_expiry` | ✗ NULL for all | **collect** (migrant staff) |
| Date of birth | ✗ no column | **migration + collect** |
| Address | ✗ no column | **migration + collect** |
| Employee ID | ✗ none | derive from `staff.id` or add a short code |
| Company tax ID / address / SSO acct | ✗ hardcoded name only | add to a config table or constants |
| Position, nationality, hire date, employment type, salary | ✓ present | render |

---

## 3. Withholding tax — the answer is ฿0, and the payslip must say why

Thai PIT on employment income (Revenue Code §40(1)): expense deduction 50% capped at ฿100,000, personal allowance ฿60,000, first ฿150,000 of net taxable income taxed at 0%.

| | Annual gross | − expenses | − allowance | Net taxable | PIT |
|---|---|---|---|---|---|
| Mint ฿25,000/mo | 300,000 | 100,000 (capped) | 60,000 | 140,000 | **฿0** |
| Hein ฿15,000/mo | 180,000 | 90,000 | 60,000 | 30,000 | **฿0** |
| Nono ฿12,000/mo | 144,000 | 72,000 | 60,000 | 12,000 | **฿0** |

So treating 25/15/12 as gross-before-tax is already what the system does, and net happens to equal gross — but only because everyone sits under the threshold. The fix is **not** to start deducting; it is to compute the figure properly so it stays right when a salary rises past roughly ฿26,000/mo, and to print the basis so the number reads as deliberate rather than as an unimplemented field.

Break-even: monthly gross above ~฿26,000 starts producing a non-zero PIT. Mint at ฿25,000 is one raise away.

---

## 4. Work items

| ID | Work | Kind | Threshold |
|---|---|---|---|
| **A** | Collect the missing HR data (§ 2.4) from each employee | data / human | not code |
| **B** | Migration + `fn_calculate_payroll`: bonus columns, manual-edit preservation, SSO enrolment path, PIT computation, `days_worked` derivation | `kind:rpc-backend` | CEO-gated, fresh session |
| **C** | Payslip document rebuild (§ 2) + bonus entry UI + attendance columns | `kind:feature`, front-end | CEO preview gate, fresh session, blocked-by B |

| **D** | Thai public-holiday calendar — reference table, attendance auto-fill, admin highlighting | `kind:feature` | fresh session, can run parallel to B |

### 4.1 Design decisions needed before B starts

1. **`days_worked` source — the schedule is the default.** CEO 2026-07-31: *"по умолчанию в графике должна стоять полный рабочий день"*. So `days_worked` derives from `shifts` (104 already exist for July), not from hand-typed `staff_attendance` rows: a scheduled shift counts as a full worked day unless an absence, leave, holiday or day-off row overrides it. This kills the empty `Days` column without asking anyone to log attendance daily, and it makes the schedule the single input it was always meant to be.
2. **Lateness deduction must actually run.** `v_shift_punctuality` (222 rows) → owner approval → `unworked_time_adjustments` → `other_deductions` is fully built and has never fired. Decide the trigger: monthly review as part of closing a period, or approve-as-you-go. Per LEG-004 only **unworked minutes** may be deducted — fines are illegal — so the deducted value is always `late_minutes × (daily_rate / 8 / 60)`, never a flat penalty.
3. **Manual-edit preservation.** Add `is_manual_override` (or per-column `*_manual` flags) so recalculation refuses to clobber a hand-entered bonus or zeroed line, instead of the current silent overwrite.
4. **SSO enrolment date.** `sso_number` presence is currently the switch. It should be a date (`sso_enrolled_from`), because June is retroactive — flipping the flag today must not silently restate May.

### 4.2 Holiday calendar (work item D)

No holiday reference exists in the schema. Needed:

- `public_holidays (holiday_date, name_en, name_th, is_company_closed, source_year)` — seeded from the **official annual government / Bank of Thailand list**, not from memory. Thai holidays split into fixed-date (28 July — HM King Vajiralongkorn's Birthday; 3 June — HM the Queen's Birthday, the one row we already have) and lunar-calendar (Asalha Bucha, Khao Phansa, Makha Bucha, Visakha Bucha) whose dates move every year and **must be copied from the published list each December**.
- Attendance auto-fill: a holiday date writes `status='holiday'` for every scheduled employee instead of leaving a hole.
- Admin highlighting on the schedule and attendance views, so the CEO can see a holiday coming and decide: close the shop, run it at holiday rate, or grant days off.
- Pay treatment: LPA §29 entitles employees to at least 13 paid public holidays a year; §62 sets the premium for working on one. `payroll_config` already carries `ot_multiplier_holiday` and `ot_multiplier_holiday_ot`, so the rates exist — the calendar to trigger them does not.

**Open for July 2026:** 28 July has passed with no record. Whoever worked it is owed either a substitute day off or holiday-rate pay. Resolve before the July period is approved.

---

## 5. Acceptance

- July 2026 payslip for each of the four employees renders every § 2.1 field with no `—` in a MUST row, or an explicit `Pending enrolment` / `฿0` where that is the true value.
- A bonus can be entered from the payroll UI, survives `fn_calculate_payroll`, and appears as its own payslip line with its reason.
- The § 2.3 block is gone from both `Payslip.tsx` and `PayslipPdf.tsx`.
- `Days / Absent / Leave` are populated for July without hand-backfilling `staff_attendance`.
- SSO figures are either real or explicitly `Pending enrolment` — never a silent ฿0.

## MC binding

Task IDs are filled in on creation; this spec is referenced from each packet's `spec_file`.
