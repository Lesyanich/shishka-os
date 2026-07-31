---
title: Attendance, Sick-Leave & Absence Discipline Policy
owner: Shishka Healthy Food Co., Ltd.
register_id: LEG-003
status: active
effective_date: 2026-07-06
approved_by: Lesia Kostiukova (CEO)
approved_on: 2026-07-06
legal_basis: Thai Labour Protection Act B.E. 2541 §32, §34, §57, §119
supersedes: none
updated_by: lawyer-agent
---

# Attendance, Sick-Leave & Absence Discipline Policy

> **Approved by the CEO on 2026-07-06. In force from 2026-07-06.**
> Purpose: stop paying for unexcused no-shows while staying fully within Thai
> labour law. Applies to all staff, with special care for migrant workers whose
> work permits are sponsored by the company.

## 1. Leave classification & pay

Every absent day is recorded in `staff_attendance.status` as exactly one of:

| Situation | Status | Paid? | Evidence required | Statute |
|---|---|---|---|---|
| Own illness, 1–2 days | `sick_leave` | **Paid** (within 30 working days/yr) | Self-report; no certificate can be demanded | LPA §32, §57 |
| Own illness, **3+ consecutive days** | `sick_leave` if certified, else `absent` | Paid **only with** a medical certificate; **no certificate → unpaid** | Medical certificate (public hospital / first-class physician) | LPA §32, §57 |
| Own illness beyond 30 paid days/yr | `sick_leave` | **Unpaid** (statutory paid cap reached) | — | LPA §57 |
| Family member sick / personal errand | `personal_leave` (≤3/yr) else `absent` | First **3 days/yr paid**, thereafter **unpaid** | Prior notice + reason | LPA §34, §57 |
| No notice, no justifiable reason (no-show) | `absent` | **Unpaid** | — | — |
| Approved annual leave (after 1 yr service) | `annual_leave` | **Paid** | Pre-approved | LPA §30 |
| Day off taken back for a public holiday worked | `substitute_day_off` | **Paid** | A `holiday_credits` row marked `used` on that date | LPA §29 |

**Deduction mechanism.** Unpaid `absent` days are deducted at the 30-day daily
rate (`monthly_salary / 30`) by `fn_calculate_payroll`. `sick_leave`,
`personal_leave`, `annual_leave`, `substitute_day_off` are **never** deducted.
Not paying for an unpaid `absent` day is "no wage earned for a day not worked,"
**not** a wage deduction under LPA §76.

**Substitute days (LPA §29).** Working a public holiday earns a day off to be
taken later, tracked in `holiday_credits`. Spending it is a *day*, not money:
set the attendance status to `substitute_day_off` and mark the credit `used` on
the same date. Both halves are required — an unmatched paid day has no basis,
and an unspent credit keeps showing on the payslip as still owed. Introduced by
migration 399 (CEO decision 2026-07-31, MC b4876c65); before it, a day taken
back was recorded as `absent` and deducted, charging the employee for a day the
employer already owed them.

## 2. The one line we do not cross

A genuine **own-illness** sick day is payable by law (LPA §57) — for 1–2 days
**without** any certificate. We do **not** reclassify a genuine sick day to
`absent` to avoid paying it. Doing so is a wage violation and, for migrant
workers, the exact trigger for a Department of Labour complaint (back-pay order
+ fine + scrutiny of our work-permit sponsorship). The lawful lever against
abuse is the **certificate requirement** + **attendance discipline** below — not
deduction of protected leave.

## 3. Discipline ladder (pattern absenteeism)

For repeated unexcused absences that are **not** 3-consecutive-day abandonment:

1. 1st unexcused `absent` → **verbal warning**, logged in attendance notes.
2. 2nd → **Written Warning #1** (Appendix A), signed, copy to employee.
3. 3rd → **Written Warning #2 (final)**.
4. Continued → **termination**.

## 4. Dismissal for cause — abandonment

Absence **without justifiable reason for 3 consecutive working days** (whether
or not a holiday falls in between) is grounds for **dismissal without severance
pay and without advance notice** under **LPA §119(5)**. Prior warning letters
are not legally required for §119(5), but a written record must still be kept.

## 5. Migrant-worker safeguard

On any termination of a migrant worker, the work permit is sponsored by the
company and its cancellation **must be reported to DOE / Immigration within the
statutory window**, or liability remains with the employer. Route through the
visa/WP agent (Mr. Ram) at termination time.

## 6. System of record

- Daily status → `staff_attendance.status`.
- Paid-leave allowances → `leave_balances` (sick 30 / personal 3 / annual per §30).
- Certificate on file → recorded in `staff_attendance.notes` until the
  `medical_certificate` column ships (tracked follow-up).

---

## Appendix A — Written Warning template (bilingual EN + Burmese note)

```
SHISHKA HEALTHY KITCHEN — WRITTEN WARNING / หนังสือเตือน
Warning No: ☐ First  ☐ Second (Final)          Date: __________

Employee: __________________   Position: ____________
WP No: ______________   Nationality: ____________

1. FACTS
On [date(s)] you were absent from work without prior notice and without a
justifiable reason / without a medical certificate for a sick leave of 3+
consecutive days. This is an unexcused absence under company policy.

2. RULE
Unexcused absence is unpaid (a day not worked, not covered by paid leave).
Absence without a justifiable reason for 3 consecutive working days is grounds
for dismissal without severance under Labour Protection Act §119(5).

3. WARNING
This is a formal written warning. Further unexcused absence may lead to
termination of employment for cause, without severance pay and without advance
notice, as permitted by law.

Employer signature: __________   Employee signature: __________
(If employee refuses to sign, witness: __________)

— မှတ်ချက် (Burmese note): ဤစာသည် တရားဝင် သတိပေးစာဖြစ်သည်။
အလုပ်ပျက်ကွက်မှု ဆက်လက်ဖြစ်ပါက ဥပဒေအရ နစ်နာကြေးမပေးဘဲ
အလုပ်မှ ထုတ်ပယ်ခြင်း ခံရနိုင်သည်။ လက်မှတ်မထိုးမီ နားလည်အောင် ဖတ်ပါ။
```

> The Burmese line is an accurate draft; have a native speaker confirm wording
> before first use.
