---
title: Analytics Brain Agent
trigger_condition: When AI Executive Chef is stable in ERP and sales/production data is being collected
planted_date: 2026-04-14
---

# Analytics Brain Agent

Separate analytical agent for Shishka OS that handles data-driven kitchen intelligence.

## Scope (distinct from Chef Agent)

| Analytics Brain | Chef Agent |
|----------------|------------|
| Sales forecasting & demand prediction | Recipe creation & BOM management |
| Dynamic food cost tracking over time | Static cost calculation per dish |
| Kitchen load optimization & scheduling | Production flow steps (recipes_flow) |
| Inventory tracking & waste analysis | Ingredient data quality audit |
| Purchase pattern optimization | Supplier catalog lookups |
| Proactive alerts (cost drift, low stock) | Reactive audit on demand |
| Prep-list generation from forecast | Tech card generation |

## Prerequisites

- Sales data collection (POS integration or manual entry)
- Production logs (what was cooked, when, by whom)
- Consistent inventory tracking (receiving + waste logging)
- AI Executive Chef stable and generating clean data

## Possible Surfaces

- Dedicated /analytics dashboard in ERP
- Morning briefing (scheduled agent run → notification)
- Alert channel (Telegram/Line bot for urgent issues)
- Owner chat (same chat UI as Chef, different agent context)

## Key Questions to Explore When Triggered

1. What POS system will feed sales data? (Syrve integration?)
2. How do we track production — manual log or automated?
3. What alert thresholds make sense for a small kitchen?
4. Daily vs weekly forecasting granularity?
