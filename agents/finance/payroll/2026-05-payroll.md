# Payroll Register — May 2026 (Расчётная ведомость, детальная)

> **Period:** 2026-05-01 → 2026-05-31 · **Calendar days:** 31
> **Prepared by:** finance-agent · **Date:** 2026-05-30
> **Source of truth:** Supabase `staff` table (https://shishka-os.vercel.app/hr/staff)
> **Currency:** THB · **Payment:** cash · **Status:** POSTED to expense_ledger
>
> Thai labour reference: working day 8h · OT weekday ×1.5 · min wage Phuket 400/day ·
> SSF 5% employee + 5% employer, cap 875 THB/mo (2026)

---

## 📋 Summary table (сводная)

| # | Employee | Role | Nat. | Hire | Salary | Days worked | Unpaid | Gross | SSF | Advance | **NET** |
|---|----------|------|------|------|-------:|:-----------:|:------:|------:|:---:|:-------:|--------:|
| 1 | Alex | cook | MM | 2026-02-18 | 15,000 | 29 / 31 | 2 | 14,032 | 0* | 0 | **14,032** |
| 2 | Hein | cook | MM | 2026-02-18 | 15,000 | 31 / 31 | 0 | 15,000 | 0* | 0 | **15,000** |
| 3 | Nono | helper | MM | 2026-05-15 | 12,000 | 17 / 17 | 0 | 6,581 | 0* | 0 | **6,581** |
| | | | | | | | | | | **TOTAL** | **35,613** |

\* SSF = 0 this period — staff not yet enrolled (`sso_number` null). Enrollment in progress via Blessed Business invoice IV-20260500021. From the month enrollment completes, SSF will be deducted (projection in each payslip below).

---

## 🧾 Payslip 1 — Alex

| Field | Value |
|---|---|
| Full name | Alex (Aung Khant Phyo) |
| Role / Nationality | cook / Myanmar |
| Staff ID | `9c979e6b-2e14-4f05-9ba1-1c7a9f0310bb` |
| Hire date | 2026-02-18 (full-time, past probation) |
| Contract | Monthly fixed |
| Monthly salary | 15,000 THB |

**Attendance**
- Calendar days in month: 31
- Days present: 29
- Unpaid absences (за свой счёт): **2** (CEO-confirmed)
- Paid leave / sick: 0 · Overtime: 0h

**Calculation**
```
daily_rate   = 15,000 / 31           = 483.87 THB/day
hourly_rate  = 15,000 / (31 × 8)     = 60.48 THB/h
unpaid_deduct= 2 × 483.87            = 967.74 THB
base_salary  = 15,000 − 967.74       = 14,032.26
gross        = base + OT(0)          = 14,032.26
SSF          = 0  (not enrolled)     [if enrolled: min(14,032×5%, 875) = 701.60]
net          = gross − SSF − advance = 14,032 THB
```
**NET PAYABLE: 14,032 THB** → expense `ba78aedb-60ec-4da9-9873-bd980cd9b424`
*(if SSF active, net would be 13,330)*

---

## 🧾 Payslip 2 — Hein

| Field | Value |
|---|---|
| Full name | Hein (Kyaw Swar Hein) |
| Role / Nationality | cook / Myanmar |
| Staff ID | `efcd98a5-78cb-4d3f-a274-7e79f22bc556` |
| Hire date | 2026-02-18 (full-time, past probation) |
| Contract | Monthly fixed |
| Monthly salary | 15,000 THB |

**Attendance**
- Calendar days in month: 31 · Days present: 31
- Unpaid absences: 0 · Paid leave / sick: 0 · Overtime: 0h

**Calculation**
```
daily_rate   = 15,000 / 31           = 483.87 THB/day
base_salary  = 15,000 (full month)   = 15,000.00
gross        = base + OT(0)          = 15,000.00
SSF          = 0  (not enrolled)     [if enrolled: min(15,000×5%, 875) = 750.00]
net          = gross − SSF − advance = 15,000 THB
```
**NET PAYABLE: 15,000 THB** → expense `2601ee26-adbd-4501-b91b-bfb0909f57dd`
*(if SSF active, net would be 14,250)*

---

## 🧾 Payslip 3 — Nono

| Field | Value |
|---|---|
| Full name | Nono (Noe Noe Zin) |
| Role / Nationality | helper / Myanmar |
| Staff ID | `b1fb72db-55b6-4afd-be85-be598a7c19ac` |
| Hire date | **2026-05-15** (probation) |
| Contract | Monthly fixed (pro-rated first month) |
| Monthly salary | 12,000 THB |

**Attendance**
- Days employed in May: 15→31 = **17 days** of 31
- Unpaid absences: 0 · Paid leave / sick: 0 · Overtime: 0h

**Calculation**
```
daily_rate   = 12,000 / 31           = 387.10 THB/day
worked_days  = 17  (hired mid-month)
base_salary  = 12,000 × 17 / 31      = 6,580.65
gross        = base + OT(0)          = 6,580.65
SSF          = 0  (not enrolled)     [if enrolled: min(6,581×5%, 875) = 329.05]
net          = gross − SSF − advance = 6,581 THB
```
**NET PAYABLE: 6,581 THB** → expense `5a24fd89-b231-4dc4-92e7-83a335d9502b`
*(if SSF active, net would be 6,252)*

---

## 💰 Cash impact

| | THB |
|---|---:|
| Total payroll (paid 2026-05-30, cash) | **35,613** |
| Thai card balance before | 86,000 |
| − Payroll | −35,613 |
| Remaining after payroll | 50,387 |
| − Mr. Ram / Blessed Business (pending, due 2026-06-03) | −45,000 |
| **Projected remaining after Ram paid** | **5,387** |

---

## 🔗 Related obligation — Mr. Ram (Blessed Business) — PENDING
- Invoice IV-20260500021 · 2026-05-27 · **45,000 THB** · status=**pending** (due 2026-06-03)
- expense `4447d068-3cb3-42d7-a12f-7aa9cbe8bb80` · supplier `b8669d0a-b5f5-45ec-a299-55696c1f0d9f` · cat 3200
- 3 × Myanmar staff @ 15,000: Visa + Work Permit + employer transfer + **SSO registration** + doc processing
- Persons: Kyaw Swar Hein (Hein), Aung Khant Phyo (Alex), Noe Noe Zin (Nono)
- Pay to BBL Saving 7660180352 → when paid, set status `paid` + attach bank slip

---

## ✅ Data corrections this session
- **Ton** (cashier, 19,000) set `is_active=false`, `fire_date=2026-05-21` — fired before working, excluded from payroll.

## ⚠️ Open compliance items
- **SSF enrollment** — 3 Myanmar work-permit holders not yet in Social Security (`sso_number` null). Being registered by Blessed Business. Once `sso_number` filled → SSF deductions start (Alex −702, Hein −750, Nono −329 per month) + employer match (cat 2603). Lawyer-agent to confirm registration completion.

## 📌 Excluded from payroll (reference)
| Name | Reason | DB state |
|------|--------|----------|
| Pa | Fired 2026-04-06 | is_active=false ✅ |
| Ton | Fired before working | is_active=false ✅ (fixed this session) |
| Lesia, Bas | Owners (no salary) | monthly_salary=null ✅ |
