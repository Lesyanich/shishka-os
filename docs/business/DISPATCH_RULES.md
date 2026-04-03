# Dispatch Rules — Business Task Router

> This file is read by the Dispatcher AI to route business ideas
> into the correct domain(s) and create tasks via MCP.
> Tasks are stored in Supabase `business_tasks` table, NOT in markdown files.

## Domains

| Code | Name | Scope |
|------|------|-------|
| `kitchen` | Kitchen & R&D | Recipes, BOM, nutrition, food safety, fermentation, new dishes |
| `procurement` | Procurement | Suppliers, purchasing, receiving, inventory, MRP |
| `finance` | Finance | Receipts, P&L, food cost, budget, taxes, cash flow |
| `marketing` | Marketing & Brand | Social media, content, promotions, branding, photography, website |
| `ops` | Operations & People | Staff scheduling, SOPs, training, equipment, hygiene |
| `sales` | Sales & Customer | Pricing, menu engineering, delivery platforms, reviews, allergens |
| `strategy` | Growth & Strategy | New locations, partnerships, seasonal plans, competitors, vision |
| `tech` | Technology | Bugs, features, migrations, UI, agents, MCP tools |

## Trigger Matrix

| Keywords in idea | Primary domain | Cascade domains |
|-----------------|----------------|-----------------|
| recipe, dish, ingredient, nutrition, BOM, ferment, technique | `kitchen` | procurement, finance |
| supplier, purchase, price, Makro, delivery, stock, inventory | `procurement` | finance |
| receipt, expense, budget, P&L, tax, cash flow, cost | `finance` | — |
| post, story, promo, photo, brand, website, content, social | `marketing` | sales |
| shift, training, SOP, equipment, hygiene, staff, schedule | `ops` | — |
| price, menu, delivery platform, review, SYRVE, allergen, customer | `sales` | marketing, kitchen |
| location, partner, strategy, competitor, expansion, vision | `strategy` | finance |
| bug, feature, migration, UI, agent, MCP, API, deploy | `tech` | — |

## Routing Logic

1. Match keywords from user's idea against the trigger matrix
2. Assign primary domain (strongest match)
3. If cascade domains exist, create linked subtasks with `parent_task_id`
4. If >= 3 domains involved, suggest creating a `business_initiative`

## Priority Assignment

| Signal | Priority |
|--------|----------|
| "urgent", "today", "ASAP", "emergency" | `critical` |
| Deadline < 7 days, explicit "important" | `high` |
| Default | `medium` |
| "someday", "maybe", "idea", "consider" | `low` |

## Source Tags

| Context | `source` value |
|---------|---------------|
| Owner types idea directly | `owner` |
| Chef/cook suggests something | `chef_idea` |
| Customer review/complaint | `customer_review` |
| AI agent discovers missing functionality | `agent_discovery` |
| Seasonal/calendar trigger | `seasonal` |
| Competitor observation | `market_intel` |

## Agent-Created Tasks

When an AI agent creates a business_task (not the Dispatcher):
- `source` = `agent_discovery`
- `created_by` = `{agent-name}-agent` (e.g. `finance-agent`, `chef-agent`)
- `status` = `inbox` (default — Lesia triages) or `done` (if work already completed)
- `assigned_to` = `null` (agents don't assign work to humans)
- `related_ids` MUST include at least one entity ID

When the Dispatcher creates tasks:
- `source` = inherited from the original idea (e.g. `owner`, `chef_idea`)
- `created_by` = `dispatcher`
- Follows the full Trigger Matrix above

## Response Template

After dispatching, the agent MUST respond:
```
Created [N] task(s):
• [domain] [priority] — "title"
• [domain] [priority] — "title" (subtask)
[Optional: Created initiative "name" linking N domains]
Continue with current task?
```
