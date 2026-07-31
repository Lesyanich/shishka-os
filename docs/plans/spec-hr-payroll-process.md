# Spec — HR & Payroll: the whole process, analyzed and re-planned

> MC Task: 679e41d4-defb-43cc-bfa5-3b6da0d11c39 (backend) · 18c14d82 (UI) · 56512d1a (holidays) · 627a0cb9 (HR data) · aabd3401 (April fix)
> Companion: `docs/plans/spec-payslip-data-contract.md` (payslip field contract + defect table — still authoritative for the payslip document itself)
> Origin: CEO 2026-07-31 — *"каждая ветка раздела живёт своей жизнью… поднимемся над суетой, проанализируем весь процесс и его соответствие пожеланиям и правовой картинке. Результат — комплексный анализ и план реализации всего раздела."*

---

## Part I — Diagnosis: seven modules, zero process

The HR section is not broken in any single place. It is **seven working modules that were never connected into a process**. Each was built, tested against its own table, and shipped; none consumes the output of the previous one.

### I.1 The modules and what they actually talk to

```
┌────────────┐   ┌──────────────────┐   ┌──────────┐
│ StaffPage  │   │ SchedulePage     │   │ Clock-in │
│ staff      │   │ templates → runs │   │ shift_   │
│            │   │ → shifts (226)   │   │ clock_   │
└─────┬──────┘   └────────┬─────────┘   │ events   │
      │                   │             │ (10 rows)│
      │ (nothing reads    │ (nothing    └────┬─────┘
      │  fire_date except │  projects        │
      │  payroll pro-rate)│  shifts into     │ feeds
      │                   │  attendance)     ▼
      │                   │             ┌──────────────────┐
      │                   ▼             │ v_shift_punctual.│
      │            ┌─────────────┐      │ (222 rows)       │
      │            │ Attendance  │      └────┬─────────────┘
      │            │ Page        │           │ approval writes
      │            │ staff_atten-│           ▼
      │            │ dance (4    │      ┌──────────────────┐
      │            │ July rows)  │      │ unworked_time_   │
      │            └──────┬──────┘      │ adjustments      │
      │                   │             │ (0 rows EVER)    │
      │                   │ ONLY input  └────┬─────────────┘
      │                   ▼                  │ read by calc, never fed
      └──────────► ┌──────────────────────┐ ◄┘
                   │ fn_calculate_payroll │
                   │ → payroll_lines      │
                   └──────────┬───────────┘
                              ▼
                   ┌──────────────────────┐
                   │ fn_approve_payroll   │──► expense_ledger
                   │ (double-books OT)    │    (April +4,000 wrong)
                   └──────────┬───────────┘
                              ▼
                        Payslip / PDF
```

**Every arrow that matters is missing:**

| Broken link | Evidence (July 2026) |
|---|---|
| Schedule → Attendance | 104 shifts vs 4 attendance rows. `Days worked = 0` on every payroll line |
| Schedule → Staff lifecycle | Alex resigned 07 Jul; he still has **26 July shifts** including three weeks after his fire_date. Nothing prunes the schedule on offboarding |
| Clock-in → Punctuality | 10 clock events *ever*, 2 people, all `source='admin-web'`, several mid-afternoon. The habit does not exist, so `v_shift_punctuality` says `no_clock_in` on essentially every shift |
| Punctuality → Payroll | `unworked_time_adjustments`: **0 rows since creation** (mig 372). The approval UI exists (`PunctualityPage` + `useUnworkedTime`), the calc reads the table — nobody has ever pressed the button |
| Punctuality → Enforcement | `is_enforced = false` on all 222 rows: `staff.punctuality_ack_on` is NULL for everyone. LEG-004 §7 requires a signed acknowledgement before any deduction — **no signature has been collected**, so even a filled pipeline could deduct nothing lawfully |
| Payroll → Ledger | `fn_approve_payroll` double-books overtime/bonus (April overstated ฿4,000) and hardcodes `payment_method='transfer'` for cash salaries |

### I.2 Reference data is wrong too

| Item | In DB | Reality (CEO 2026-07-31) |
|---|---|---|
| Working hours | 09:00–18:00 (templates **and** all 226 shifts) | **09:30–18:30** |
| Weekly day off | Mon–Sat scheduled, Sunday empty; `closed_weekday=0` | Sunday — ✓ consistent, keep |
| Alex's July shifts | 26 | ≤5 (worked 1–7 Jul, minus Sunday 5 Jul) |
| SSO ceiling | `sso_ceiling_thb = 17,500` | Verify against the official announcement — the long-standing ceiling was ฿15,000; 17,500 matches the *proposed* staged increase for 2026. One number to confirm before SSO goes live |
| SSO enrolment | `sso_number` NULL for all → calc silently skips | Employer registered since 01 Jun (acct 8330006310). Every month unremitted accrues 2%/month |

### I.3 What the CEO asked for vs what exists

| CEO requirement | Status |
|---|---|
| Salary = gross, tax computed properly | Numerically right today (all under PIT threshold), structurally absent — hardcoded 0 |
| Deduct lateness; excused lates not deducted | Machinery 100% built (view has `is_excused`, excuses table, approval hook) — never used, legally blocked by missing signatures |
| Payroll must SHOW late days / minutes / deduction | Nothing in `payroll_lines` or the UI carries punctuality; only the anonymous `other_deductions` number |
| Default = full scheduled day, exceptions logged | Decided 2026-07-31; not yet implemented |
| Manual bonus | No column, no UI |
| Advances / split salary | No table, no UI |
| Holidays visible for closing/day-off decisions | No calendar at all; 28 Jul passed unrecorded |
| Professional payslip | Field contract written (`spec-payslip-data-contract.md` §2); data mostly missing (627a0cb9) |

---

## Part II — Legal frame (Thai LPA B.E. 2541), applied to our design

| § | Rule | Consequence for design |
|---|---|---|
| §23, §28 | Max 8h/day, 48h/week; ≥1 rest day/week | 09:30–18:30 with 1h break = 8h × 6 days = **exactly 48h**. Legal, zero headroom: any minute past 18:30 is OT at 1.5× — the OT fields are not decoration |
| §68 | Daily rate = monthly/30 | Implemented (mig 218) ✓ |
| §70 | Pay ≥1×/month; on termination within 3 days | Advances/splits always legal. Alex's 1–7 Jul wages: CEO decision to withhold stands, exposure documented (MC ffb9fd9e) |
| §76 | Closed list of lawful deductions; fines are NOT on it | Deduct **unworked minutes** (pay follows work) — never a "fine". Excused late ⇒ no deduction, matches CEO instruction. Visa/WP cost can never be deducted |
| §29, §62 | ≥13 paid public holidays/yr; premium for working one | Calendar task 56512d1a. `ot_multiplier_holiday=2.0`, `holiday_ot=3.0` already configured — nothing triggers them |
| §57 | Paid sick leave (own illness), ≤30 days/yr | `sick_leave` status exists and is correctly non-deducted ✓ |
| §115 | Employee register: full name, DOB, address, position, wage… | Payslip contract §2; data collection 627a0cb9 |
| SSA | 5%+5% on capped base, remit by 15th of next month | Blocked only by missing `sso_number`s; late = 2%/month, so this is the most expensive idle defect |
| LEG-004 (ours) | Deduction/warnings only after signed acknowledgement | `punctuality_ack_on` NULL for all — **collect signatures before the first deduction, or the deduction itself creates the liability**. Coordinate with MC 1209dafa (attendance-control audit, in flight in another session) |

---

## Part III — Target process (one spine, six steps)

```
 STAFF ──► SCHEDULE ──► REALITY DELTAS ──► MONTH CLOSE ──► PAYOUT ──► DOCUMENT
 hire/fire  templates    clock-in, excuses, checklist:      advances    payslip
 rates      → shifts     attendance excep-  lates→approve   + final     (contract
 SSO/tax    (09:30-      tions, holidays    days derive     payment     §2)
 ack sign   18:30,       auto-filled        calc → review   ledger once
            Sun off)                        → approve       cash
```

**Design invariants** (each kills a bug found this week):

1. **The schedule is the single source of worked time.** A scheduled shift = a worked day unless an exception row (absent / leave / holiday / day_off) overrides it. `staff_attendance` = exception log only.
2. **Staff lifecycle events cascade.** Setting `fire_date` deletes/voids future shifts (Alex: 19 ghost shifts today). Hiring + template ⇒ shifts generate.
3. **Payroll lines are derived + explicit adjustments, never silent hand-edits.** Bonus, advances, punctuality deduction each get their own column/table; recalc preserves them; `notes` can no longer lie.
4. **Money leaves once.** Every baht reaches `expense_ledger` exactly one time (kills the ฿4,000 double-book and the future advance double-book).
5. **Nothing is enforced that isn't signed.** Punctuality deductions activate per-person on `punctuality_ack_on`.
6. **The period close is a checklist, not a button.** Approve is blocked until: attendance exceptions entered → lates reviewed (excuse or approve) → holidays resolved → calc fresh → per-line review.

---

## Part IV — Implementation plan

### Phase 0 — Data hygiene (SQL only, ~1h, do first)
- Templates + all future/July shifts → **09:30–18:30**.
- Delete Alex's shifts after 2026-07-07.
- Confirm & record July holidays (28 Jul + lunar dates from the official list) even before the calendar table exists — as attendance rows for July closing.
- Verify `sso_ceiling_thb` against the official 2026 figure.
- *Gate: none. Reversible, matches stated reality.*

### Phase 1 — Backend spine (MC **679e41d4**, migration ~395, CEO-gated)
One migration + two function rewrites:
- `payroll_lines`: + `bonus_pay`, `bonus_note`, `late_days`, `late_minutes`, `late_deduction`, `is_manual_override`.
- `staff_payments` table (advances/splits — spec §6, payslip spec).
- `staff`: + `sso_enrolled_from date`, `date_of_birth`, `address` (payslip contract needs).
- `fn_calculate_payroll` v3: days from **shifts minus exceptions**; late columns filled from approved `unworked_time_adjustments` (excused excluded — CEO rule); SSO by `sso_enrolled_from`; real PIT (progressive, §48 allowances — computes ฿0 today and stays correct after raises); preserves manual/bonus/advance data on recalc.
- `fn_approve_payroll` v2: drop the 2604 double-book; `payment_method='cash'`; books `net − advances_already_paid`; refuses if advances > net or unreviewed lates exist.
- *Acceptance: July recalc → Days=26/25/22-ish real numbers; Alex line ฿3,500 pro-rated to 7 days then zeroed manually per CEO decision; totals reconcile to ledger exactly once.*

### Phase 2 — Payroll & payslip UI (MC **18c14d82**, after Phase 1)
- Period table gains: Late (days·min·฿), Bonus, Advances paid, Balance due.
- Line editor: bonus (amount+reason), record advance, zero-line override with reason.
- Close-period checklist wizard (invariant 6) replacing the bare Approve button.
- Payslip per contract §2 (remove WP block, add SSO/tax basis lines, advances below net).
- *CEO preview gate: Vercel link + "what to click".*

### Phase 3 — Punctuality goes live (people + small code)
- Collect LEG-004 signatures (paper) → set `punctuality_ack_on` (trilingual text exists in handbook). **No deduction before this.**
- Clock-in habit: tablet/KDS PIN at the shop or Telegram bot `/in` — pick ONE channel; `admin-web` self-clock stays as fallback. (Telegram bot already deployed for staff tasks — cheapest path.)
- Monthly close reviews lates: excuse (no deduction) or approve (minutes × rate) — already built, becomes step 2 of the checklist.
- *Gate: signatures first; sequencing with MC 1209dafa.*

### Phase 4 — Holiday calendar (MC **56512d1a**) + HR data (MC **627a0cb9**, human)
As already specced: `public_holidays` seeded from the official list, auto-fill + schedule highlighting + §62 premium trigger; Mint collects Thai-side documents, Ram the WP/SSO side.

### Dependency order
```
Phase 0 ──► Phase 1 ──► Phase 2 ──► (July close possible here)
                └──► Phase 3 (signatures can start TODAY, parallel)
                └──► Phase 4 (parallel after 1)
```

---

## Part V — What July 2026 close looks like after this lands

1. Attendance: 3 Nono unpaid days + 1 Hein absent already in; holidays for 28 Jul resolved.
2. Recalc: Days real (26 scheduled − exceptions), Alex pro-rated 7d.
3. Lates: July has effectively no enforceable clock data and no signatures — **0 deductions in July, lawfully**. First enforced month = first full month after signatures.
4. Manual: Nono bonus +1,200 / deduction −1,200 (net 12,000); Alex → 0 (CEO decision on record).
5. Checklist green → Approve → ledger gets each net exactly once, cash.
