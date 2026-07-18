# Financial Codes & Tax

> Ledger table: `expense_ledger` (categories below). Receipt intake: `receipt_inbox` → `receipt_jobs`. (Verified 2026-07-18 vs live DB.)

## Expense Categories

| Code | Name | Description |
|------|------|-------------|
| COGS | Cost of Goods Sold | Food ingredients, packaging |
| OPEX | Operating Expenses | Rent, utilities, cleaning, transport |
| CAPEX | Capital Expenditure | Equipment, renovation, furniture |
| PAYROLL | Staff Costs | Salaries, social contributions |

## Tax (Thailand)

- VAT: 7% (standard rate)
- WHT: Withholding tax varies by vendor type
- Receipts may or may not include VAT — agent must detect

## Receipt Processing

Each receipt line item is classified into one of the above categories.
The finance agent uses `guidelines/classification.md` for edge cases.
