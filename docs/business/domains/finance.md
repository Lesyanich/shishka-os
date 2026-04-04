# Finance — Domain Context

## Scope
Receipt processing, expense tracking, P&L, food cost analysis, budgeting, tax compliance (Thailand), cash flow management.

## Key Systems
- **Finance Agent** (`agents/finance/`): Receipt parsing, classification, ledger
- **Admin Panel**: Finance Ledger, Finance Entry, Receipt Inbox, Finance Analytics
- **Supabase**: `expense_ledger`, `receipt_jobs`, `inbox`

## Key Metrics
- Food cost target: < 35% of revenue
- Target margin per dish: >= 70%
- Monthly OpEx budget tracking
- CapEx tracking (equipment amortization)

## Tax (Thailand)
- VAT: 7%
- Buddhist Era calendar: year - 543
- Tax invoices: must request from suppliers for VAT deduction

## Typical Tasks
- Process pending receipts (agent workflow)
- Monthly P&L review
- Food cost analysis by dish
- Budget planning (monthly/quarterly)
- Tax invoice collection optimization
- Cash flow forecasting
- CapEx approval for new equipment

## Assets Location
- Receipt photos: `01_Business/Receipts/`
- Agent guidelines: `agents/finance/guidelines/`
