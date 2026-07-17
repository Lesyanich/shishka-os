---
title: Working Hours & Punctuality Policy
owner: Shishka Healthy Food Co., Ltd.
register_id: LEG-004
status: active
effective_date: 2026-07-17
approved_by: Lesia Kostiukova (CEO)
approved_on: 2026-07-17
legal_basis: Thai Labour Protection Act B.E. 2541 §23, §76, §119(4)
supersedes: none
relates_to: LEG-003 (Attendance, Sick-Leave & Absence Discipline Policy)
updated_by: lawyer-agent
---

# Working Hours & Punctuality Policy

> **Approved by the CEO on 2026-07-17. In force from 2026-07-17.**
> Purpose: guarantee the shop opens on time and stop paying for time not
> worked, while staying fully within Thai labour law. Applies to all staff.
> **Per-employee enforcement of §3 (pay rule) and §5 (discipline ladder)
> starts only after that employee signs the acknowledgment sheet (Appendix B).**
> Companion policy: LEG-003 covers full-day absence and sick leave; this
> policy covers working hours and lateness within a scheduled day.

## 1. Working hours & schedule

- Standard schedule: up to **8 hours/day, 48 hours/week** — the statutory
  maximum for general work under **LPA §23**.
- The binding schedule is the shift plan in the company system (`shifts`,
  visible to each employee at `/staff/schedule` and on the printed roster).
  Schedule changes are announced at least 1 day ahead by the owner/manager.

## 2. Clock-in duty (time recording)

- Every employee **must clock in on arrival and clock out at end of shift**
  using the "Start shift / End shift" button at `/staff/schedule` (any
  browser: shop tablet or own phone, personal PIN login).
- The clock record (`shift_clock_events`) is the **factual record of hours
  worked**. It is tamper-proof: a punch is always attributed to the logged-in
  employee and cannot be made for someone else.
- Forgot to clock in? Report to the owner/manager **the same day**; the
  owner may record a corrective note. Repeated "forgot" without same-day
  report is treated as no clock-in.
- No clock-in and no evidence of shop opening on time = the day is treated
  per the reconciliation record (late or no-show).

## 3. Lateness — definition & pay rule ("no work – no pay")

- **Grace period: 10 minutes** after scheduled shift start (system config
  `late_grace_minutes`; the CEO may adjust it prospectively).
- **Late** = first clock-in later than shift start + grace period. Once
  late, late minutes are counted **from the scheduled shift start**.
- Minutes late are **time not worked and are not paid**. Value of unworked
  time: `monthly_salary ÷ 30 ÷ 9 hours` per hour, pro-rated per minute
  (30-day divisor per **LPA §68**). Aggregated per calendar month and shown
  on the payslip as **"hours not worked"**.
- This is **not** a wage deduction under **LPA §76** and it is **not a
  fine**: wages are simply not earned for time not worked. Fixed monetary
  fines for lateness are prohibited and are never applied.
- The pay rule applies only to lateness occurring **on or after the date the
  employee signed Appendix B**.

## 4. No-show that blocks shop opening

If the employee responsible for opening the shop has not clocked in by
shift start + grace, the system alerts the owners immediately (Telegram).
A no-show or lateness that **prevents the shop from opening on time** is a
**serious breach** of this policy: it skips the verbal step and goes
directly to a written warning (§5), independent of the LEG-003 absence
ladder for the same day.

## 5. Discipline ladder (lateness pattern)

| Step | Trigger | Action |
|---|---|---|
| 1 | 3+ late incidents in a rolling calendar month | **Verbal warning**, logged in the warnings register |
| 2 | Further lateness after verbal warning | **Written Warning #1** (Appendix A), signed, copy to employee |
| 3 | Further lateness after Written Warning #1 | **Written Warning #2 (Final)** |
| 4 | Further lateness after Final warning | **Termination for cause** — violation of work rules after written warning, **LPA §119(4)**: no severance pay, no advance notice |

- A written warning is valid for **1 year** from the date of the violation
  (**LPA §119(4)**). Warnings are recorded in the company warnings register
  (`staff_warnings`) with issue and expiry dates.
- Serious breach (§4) enters the ladder directly at step 2 or 3.
- The ladder is cumulative with LEG-003: unexcused full-day absence keeps
  its own track (LEG-003 §3–4); warnings under either policy count as
  written warnings for §119(4) purposes when the violation type matches the
  warned conduct.
- Migrant-worker safeguard on any termination: LEG-003 §5 applies (WP
  cancellation reporting via Mr. Ram).

## 6. What we never do

- No fixed monetary fines or penalty deductions (LPA §76).
- No retroactive application: the pay rule starts at signed acknowledgment.
- No reclassification of protected leave — LEG-003 §2 stands.
- Disciplinary suspension without pay is **not** used (no lawful basis in
  our work rules; investigation suspension per LPA §116–117 is a separate,
  Mr. Ram–gated track).

## 7. System of record

- Punches → `shift_clock_events` (via `fn_clock`).
- Per-shift status (on time / late N min / no clock-in) → `v_shift_punctuality`
  (grace-aware, Asia/Bangkok), visible to owners at `/hr/punctuality`.
- Warnings → `staff_warnings` (kind: verbal / written #1 / written #2 final;
  auto-expiry at 1 year).
- Monthly "hours not worked" summary → payroll notes; the statutory payroll
  calculation itself (`fn_calculate_payroll`) is unchanged and deducts only
  full `absent` days per LEG-003.

---

## Appendix A — Written Warning template: lateness (bilingual EN + TH)

```
SHISHKA HEALTHY KITCHEN — WRITTEN WARNING / หนังสือเตือน
Warning No: ☐ First  ☐ Second (Final)          Date: __________

Employee: __________________   Position: ____________
Nationality: ____________

1. FACTS / ข้อเท็จจริง
On the following dates you arrived late for your scheduled shift without
prior notice and without a justifiable reason:
ท่านมาทำงานสายกว่าเวลาเริ่มกะที่กำหนด โดยไม่แจ้งล่วงหน้าและไม่มีเหตุอันสมควร ในวันดังต่อไปนี้:
  - ____-__-__ : scheduled __:__, arrived __:__ (late ___ min)
  - ____-__-__ : scheduled __:__, arrived __:__ (late ___ min)
  - ____-__-__ : scheduled __:__, arrived __:__ (late ___ min)

2. RULE / กฎระเบียบ
Under the company Working Hours & Punctuality Policy (LEG-004), employees
must clock in by the scheduled shift start (10-minute grace period). Time
not worked due to lateness is unpaid. Repeated lateness after a written
warning is a violation of work rules.
ตามนโยบายเวลาทำงานและความตรงต่อเวลาของบริษัท พนักงานต้องบันทึกเวลาเข้างาน
ภายในเวลาเริ่มกะ (ผ่อนผัน 10 นาที) เวลาที่ไม่ได้ทำงานเนื่องจากมาสายจะไม่ได้รับค่าจ้าง
การมาสายซ้ำหลังจากได้รับหนังสือเตือนถือเป็นการฝ่าฝืนข้อบังคับการทำงาน

3. WARNING / คำเตือน
This is a formal written warning, valid for one (1) year from the date of
the violation. Further lateness may lead to termination of employment for
cause under Labour Protection Act B.E. 2541 §119(4) — without severance
pay and without advance notice.
หนังสือฉบับนี้เป็นหนังสือเตือนอย่างเป็นทางการ มีผลบังคับหนึ่ง (1) ปีนับแต่วันที่กระทำผิด
หากมาสายอีก บริษัทอาจเลิกจ้างโดยไม่จ่ายค่าชดเชยและไม่บอกกล่าวล่วงหน้า
ตามพระราชบัญญัติคุ้มครองแรงงาน พ.ศ. 2541 มาตรา 119(4)

Employer signature: __________   Employee signature: __________
(If employee refuses to sign, witness: __________)
```

> Thai text is an accurate working draft; have a native speaker confirm
> wording before first use.

## Appendix B — Acknowledgment sheet (per employee, EN + TH)

```
ACKNOWLEDGMENT — Working Hours & Punctuality Policy (LEG-004)
การรับทราบนโยบายเวลาทำงานและความตรงต่อเวลา

I confirm that the Working Hours & Punctuality Policy has been explained
to me in a language I understand, and that I received a copy. I understand:
(1) I must clock in at shift start and clock out at shift end;
(2) minutes of lateness beyond the 10-minute grace period are unpaid time
    not worked;
(3) repeated lateness leads to written warnings and may lead to termination
    without severance under LPA §119(4).
ข้าพเจ้ารับทราบและเข้าใจนโยบายดังกล่าว: (1) ต้องบันทึกเวลาเข้า-ออกงาน
(2) เวลาที่มาสายเกิน 10 นาทีเป็นเวลาที่ไม่ได้ทำงานและไม่ได้รับค่าจ้าง
(3) การมาสายซ้ำอาจนำไปสู่หนังสือเตือนและการเลิกจ้างโดยไม่จ่ายค่าชดเชย
ตามมาตรา 119(4)

Employee: __________________  Signature: __________  Date: __________
```
