# `period_start` / `period_end` — accrual period for recurring expenses

Added in migration 201 (2026-05-20). The new optional columns on
`expense_ledger` let one payment row carry both **when paid** (cash basis,
`transaction_date`) and **what months it covers** (accrual basis,
`period_start` / `period_end`).

## When to populate (REQUIRED)

| Expense kind | Populate? | Example |
|---|---|---|
| Rent (space lease) | YES | `period_start=2026-02-01, period_end=2026-04-30` for a 3-month payment |
| Electricity / water / gas utility bill | YES | period = the billing cycle (e.g. April → `period_start=2026-04-01, period_end=2026-04-30`) |
| Internet / SaaS / phone subscription | YES | the subscription period |
| Insurance premium | YES | the coverage period |
| Salary / payroll | YES | the salary period |
| Refundable deposit (security deposit) | NO — and don't use category 2100 either; deposits are balance-sheet assets |
| One-shot purchase (groceries, equipment) | NO | leave NULL |

## How to populate

In a `fn_approve_receipt` payload:

```jsonc
{
  "transaction_date": "2026-05-14",  // when paid (cash basis)
  "period_start": "2026-02-01",      // what period this covers (accrual)
  "period_end":   "2026-04-30",
  "amount_original": 60000,
  ...
}
```

Direct INSERT:

```sql
INSERT INTO expense_ledger (..., period_start, period_end) VALUES
  (..., '2026-02-01', '2026-04-30');
```

## Querying

```sql
-- Cash basis: how much did we spend in May 2026 (when paid)?
SELECT SUM(amount_original) FROM expense_ledger
WHERE transaction_date >= '2026-05-01' AND transaction_date < '2026-06-01';

-- Accrual basis: how much rent expense was incurred in March 2026?
SELECT SUM(amount_original *
       (LEAST(period_end, DATE '2026-03-31') - GREATEST(period_start, DATE '2026-03-01') + 1)::numeric
       / NULLIF(period_end - period_start + 1, 0))
FROM expense_ledger
WHERE category_code = 2100
  AND period_start <= '2026-03-31'
  AND period_end   >= '2026-03-01';
```

## Why both axes exist

CEO's bank statement shows one 60k transfer on 2026-05-14. The expense
*accrued* across Feb/Mar/Apr. Splitting the payment into 3 rows hides the
cash event; collapsing into one row without period info hides the period.
Both views are first-class.

Driver task: MC `00cf8d54`.
