# Spec: Advanced Analytics Hub in Admin Panel

> MC Initiative: 9f7858cc-112f-4eae-81db-bfacdbe3ef03 (`admin-analytics-hub`)
> Stage tasks: P1 1be5f592 · P2 fd0a3475 · P3 338c787e · P4 3ae206c1 · P5 bfee574f · P6 d8c02f8c · P7 4489ad2f · P8 2bc2144b (parked)
> Author: techlead session claude-opus-session-d22d6df1, 2026-07-05
> Status: approved by CEO (plan approved 2026-07-05; spec + epic only, implementation gated per phase)

## 1. Context & goal

Owner needs one place to see, understand and steer the business: sales (Loyverse), menu economics
(BOM costs), финансы (expense ledger / payroll) and stock — the Syrve-class analytics toolkit,
built on our own data, chain-ready. This spec defines the section design, the data layer, canonical
metric formulas, and the phased epic. Reference bar: Syrve/iiko (KPI dashboards, OLAP-style pivots,
sales mix, ABC/XYZ, daily operational P&L) adapted to Shishka scale and brand.

### CEO decisions (Socratic gate, 2026-07-05)
1. **No Loyverse history backfill** — sales window starts 2026-05-18; design must not assume older data.
2. **Owner-only** in v1 (`minRole=owner`, same as Finance section).
3. **Read-only v1** — alerts / auto-tasks / what-if simulators deferred (parked P8).
4. **Separate top-level `/analytics` hub** with tabs, not scattered across existing sections.

### Constraints
- Existing stack only: Vite + React 19 + RR7 + Tailwind v4 + recharts 3.8 + Supabase JS. No new deps.
- **No new tables** — data layer is plain SQL views (`v_analytics_*`) over existing tables.
- Frugality (CEO 2026-07-03): everything precomputed in Postgres; no external BI, no LLM calls per view.
- Dark brand theme; reuse Finance module primitives (KpiCard, MonthlyChart, CategoryBreakdown,
  `.shk-kpi/.shk-seg/.shk-panel`, helpers.formatTHB/CATEGORY_COLORS).

## 2. Section design — `/analytics` (6 tabs)

Nav: new top-level "Analytics" entry in `NAV_SECTIONS` (`apps/admin-panel/src/layouts/AppShell.tsx`),
route `/analytics` with `.shk-seg` tab switcher (clone of `FinanceLayout` pattern).

### Tab 1 — Overview (owner pulse)
| Widget | Content | Source |
|---|---|---|
| KPI strip | Revenue today / 7d / 28d, receipts, avg check (+delta vs prev period) | v_analytics_sales_daily |
| Revenue trend | Daily bars, 28d, refunds overlaid | v_analytics_sales_daily |
| Top-10 dishes | Units + revenue, category-colored | v_analytics_item_sales_daily |
| Category mix donut | Revenue share per menu category | v_analytics_item_sales_daily × product_categories |
| Payment mix | Cash vs QR/card share | orders.payment_type |
| Food cost gauge | Blended theoretical food cost % of period | v_analytics_menu_engineering |

### Tab 2 — Sales
Day/week trends; day-of-week × hour heatmap; dine-in vs takeaway (`dining_option`);
discounts / refunds / tips totals; per-shift cash reconciliation table
(`loyverse_shifts.expected_cash` vs `actual_cash`, difference highlighted) with drawer
cash movements (`loyverse_cash_movements`).

### Tab 3 — Menu engineering
Quadrant scatter Stars / Plowhorses / Puzzles / Dogs — **median split** on units & margin THB
(rolling 28d; industry absolutes invalid on a small window). Per-dish table (units, revenue,
food cost %, margin). Zero-sellers list (active dishes with 0 sales — e.g. Salami Manakish,
bundles as of 2026-07). ABC analysis (80/15/5 cumulative revenue). Modifier attach rates
(`order_item_modifiers`). Hero-category (Manakish ≈46% of item revenue) spotlight.

### Tab 4 — Finance (P&L-lite)
Monthly operational P&L: Revenue → theoretical COGS → gross margin → OPEX (fin_categories) →
labor → operating profit. Prime cost gauge (target band 55–65%). Theoretical vs actual COGS
variance. Reuses data behind CashPositionCard / BurnRateCard / RunwayGauge.
⚠️ Existing `/finance/analytics` (expense-only) stays untouched in v1; retitle decision inside P5.

### Tab 5 — Stock & Waste
Inventory value on hand (sku_balances × cost_per_unit); count variance (`v_stock_reconciliation`);
waste cost by reason + financial_liability (`waste_logs`); expiring soon (`v_stock_status`);
shrinkage = theoretical consumption (`stock_movements` reason `loyverse_sale`) vs purchases vs counts.
**Depends on connected-stock epic outputs (MC c605e2ca / 72950d62) — consume, don't rebuild.**

### Tab 6 — Labor & Customers
Labor cost % of revenue (payroll_lines / prorated staff.monthly_salary, daily_rate = salary/30 per
Thai LPA §68); schedule vs attendance hours; sales per labor hour (gated on staff_attendance data
quality). Customers: new vs returning, repeat visit rate, top spenders (`loyverse_customers`).

## 3. Data layer — new views (single migration, P1)

Plain views (data volume is tiny), `security_invoker`, refund-aware (exclude
`receipt_type='REFUND'` receipts and their offsets), **all day-bucketing in Asia/Bangkok TZ**.

| View | Definition | Sources |
|---|---|---|
| v_analytics_sales_daily | per day: receipts, gross/net revenue, discounts, refunds, tips, avg check, payment split | orders |
| v_analytics_item_sales_daily | per day × nomenclature: units, revenue | order_items × orders × nomenclature |
| v_analytics_hourly_heat | dow × hour: receipts, revenue | orders (loyverse_created_at) |
| v_analytics_menu_engineering | per SALE dish, rolling 28d: units, revenue, food_cost, margin, fc%, popularity/margin percentiles | order_items + v_dish_cost_split + nomenclature |
| v_analytics_modifier_attach | per modifier option: attach count, attach rate, revenue delta | order_item_modifiers |
| v_analytics_pnl_monthly | per month: revenue, theoretical COGS, purchases COGS, OPEX by category, labor, prime cost | orders + expense_ledger + purchase_logs + payroll_lines |
| v_analytics_shrinkage | per item: theoretical consumption vs purchased vs counted delta | stock_movements + purchase_logs + sku_balances |
| v_analytics_labor_daily | per day: scheduled hours, attended hours, labor cost | shifts + staff_attendance + staff |

Materialize later only if measurably slow; not expected at current volume.

## 4. Canonical metric formulas
- **Avg check** = Σ orders.total_amount / count(SALE receipts)
- **Theoretical food cost %** (dish) = v_dish_cost_split.food_cost / price
- **Theoretical COGS** (period) = Σ(units sold × food_cost). Known limitation: uses current WAC,
  not purchase-time cost — accepted for v1, price snapshots are a future enhancement.
- **Actual COGS** (period) = Σ purchase_logs in period (+ inventory value delta once counts are trusted)
- **Shrinkage / variance** = actual − theoretical (THB and %)
- **Prime cost %** = (COGS + labor) / revenue (healthy band 55–65%)
- **Menu quadrants** = median split on units and margin THB, rolling 28d window
- **ABC** = cumulative revenue share 80/15/5

## 5. Epic phases

| # | Task | Phase | Size | Notes |
|---|---|---|---|---|
| P1 | 1be5f592 | Data layer: 8 views migration + verification vs manual SQL | M | blocks all tabs |
| P2 | fd0a3475 | /analytics shell + Overview tab | M | first visible value |
| P3 | 338c787e | Sales tab (trends, heatmap, shift cash recon) | M | |
| P4 | 3ae206c1 | Menu engineering tab | M | |
| P5 | bfee574f | Finance tab (P&L-lite, prime cost) | L | resolves /finance/analytics naming |
| P6 | d8c02f8c | Stock & Waste tab | M | blocked by connected-stock epic |
| P7 | 4489ad2f | Labor & Customers tab | S-M | attendance-quality gated |
| P8 | 2bc2144b | Alerts & actions (TG digest, MC auto-tasks, what-if) | — | **parked** until v1 trusted |

Order: P1→P2 fixed, then P3/P4/P5 by value; P6 waits for connected-stock; P7 anytime after P2.
Acceptance for every UI phase: full `npm run build` (tsc -b) passes; Vercel preview link +
"what/where to click" in MC comment (RULE-HANDOFF-PACKET CEO delivery gate); ≥2 metrics
cross-checked against manual SQL.

## 6. Risks & known limitations
- **RLS**: underlying tables readable by any authenticated staff; owner-gating is UI-level today.
  DB-level gating rides the auth-hardening epic (MC 79f3e983). Views are `security_invoker` → no new exposure.
- **Small data window** (since 2026-05-18): median splits and rolling windows only; no YoY; UI must not fake precision.
- **WAC bias**: historical margins computed with current cost — documented; supplier price snapshots = future task.
- **Refund correctness**: REFUND receipts and their originals' offsets excluded everywhere
  (a double-count was already caught during the 2026-07-04 manakish analysis).
- **Timezone**: Asia/Bangkok bucketing, never UTC dates.
- `syrve_sales` is empty/dead — not a source.
