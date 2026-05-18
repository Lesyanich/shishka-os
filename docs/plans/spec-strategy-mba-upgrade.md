# Spec: Strategic COO MBA Upgrade

> Status: Approved by CEO
> Author: Tech-Lead, Session 2026-05-18
> Trigger: CEO request — "хочу заложить в нашего COO настройки управленца со степенью MBA"
> Affects: `agents/strategy/AGENT.md`, new `agents/strategy/mba-frameworks.md`

---

## 1. Purpose

Upgrade the Strategic COO agent from a routing/capturing secretary into an MBA-caliber business partner. Add structured decision-making frameworks, financial analysis protocols, and strategic thinking tools — all calibrated for a 4-person food startup in Phuket, not a Fortune 500.

### CEO directive (verbatim)

> «Хочу заложить в нашего COO настройки управленца со степенью MBA! Подумай как можно лучше это сделать.»

### Why now

1. Menu Card shipped (Phase 1-3) — cost/margin data is live in the system
2. Cash position is tight (финансовый baseline task active)
3. L2 Tops launch hardware decisions pending — need structured ROI thinking
4. 50+ MC tasks in backlog — need prioritization framework
5. Chef MCP has sales + cost data to power menu engineering

---

## 2. Architecture Decision

**Hybrid C+D approach:** lightweight protocols in AGENT.md (always loaded, ~400 tokens) + detailed reference doc loaded on demand (mba-frameworks.md, ~2500 tokens).

### Why not all-in-AGENT.md

AGENT.md is loaded every session. Adding 3000+ tokens of frameworks that are needed ~30% of the time wastes context. The hybrid keeps the thinking patterns always-on but loads heavy details only when triggered.

### File map

| File | What changes | Token impact |
|------|-------------|--------------|
| `agents/strategy/AGENT.md` | +MBA Operating System section, +Decision Protocol, +upgraded report format, +load triggers | +~400 tokens |
| `agents/strategy/mba-frameworks.md` | NEW — 4 frameworks with Shishka-adapted templates | ~2500 tokens (on demand) |

---

## 3. Four Frameworks (Priority Order)

### 3.1 Unit Economics Per Dish

**Purpose:** Answer "is this dish worth selling?" with a number, not a feeling.

**Formula:**
```
Contribution Margin = Selling Price − Food Cost − Packaging − Delivery Commission
Contribution Margin % = Contribution Margin / Selling Price × 100
Break-even dishes/day = Fixed Daily Costs / Contribution Margin
```

**Shishka adaptation:**
- Food cost from Chef MCP `calculate_cost` (WAC-based)
- Packaging: flat rate per container type (set in framework doc)
- Delivery commission: Grab 30%, walk-in 0%, Tops consignment TBD
- Fixed costs: rent + salary + utilities ÷ 30 days
- Target: contribution margin ≥55% for SALE items

**When COO loads this:** CEO asks about a new dish, pricing change, new channel, or "is this profitable?"

### 3.2 Cash Flow Decision Tree

**Purpose:** Every spend decision goes through a structured filter before approval.

**Decision tree:**
```
Is it < 500 THB?
  → Yes: approve, log in expenses
  → No: Is it reversible within 7 days?
    → Yes (Type 2): approve if unit economics positive, monitor
    → No (Type 1): Full analysis required
      → Does it reduce a current bottleneck? (TOC)
      → What's the payback period? (months)
      → Can we defer 30 days without damage?
      → CEO sign-off required
```

**Shishka adaptation:**
- Thresholds calibrated for current burn rate (~60-80k THB/month)
- Equipment decisions (Merrychef, POS) always Type 1
- Ingredient bulk buys: Type 2 if shelf life > 30 days
- New supplier onboarding: Type 2

**When COO loads this:** Any spend >500 THB, equipment decisions, new supplier, bulk purchase, hire decision.

### 3.3 Menu Engineering BCG Matrix

**Purpose:** Classify every menu item into action categories using real data.

**Matrix (adapted from Kasavana & Smith):**
```
                    High Popularity
                    ┌──────────┬──────────┐
High Margin         │  ★ Star  │ Plowhor. │
                    │  Keep    │ Re-price │
                    ├──────────┼──────────┤
Low Margin          │  Puzzle  │  Dog     │
                    │  Promote │ Cut/Fix  │
                    └──────────┴──────────┘
                    Low Popularity
```

**Data sources:**
- Popularity: Loyverse sales count (when live) or Chef MCP production records
- Margin: `food_cost_pct` from Menu Card / Chef MCP `calculate_cost`
- Threshold: median of each axis splits the quadrant

**Actions per quadrant:**
- **Star** (high margin + high sales): protect recipe, keep price, feature prominently
- **Plowhorse** (low margin + high sales): raise price 5-10%, reduce portion cost, swap expensive ingredients
- **Puzzle** (high margin + low sales): better positioning, staff recommendation, photo upgrade, limited-time push
- **Dog** (low margin + low sales): remove from menu, or radically re-engineer recipe

**When COO loads this:** Menu review, "what should we cut?", monthly performance review, new dish launch decision.

### 3.4 RICE Scoring for Backlog

**Purpose:** Prioritize 50+ MC tasks objectively instead of "what feels urgent."

**Formula:**
```
RICE Score = (Reach × Impact × Confidence) / Effort

Reach:      How many users/orders/days affected per month (1-10 scale)
Impact:     Effect on business goal (3=massive, 2=high, 1=medium, 0.5=low, 0.25=minimal)
Confidence: How sure are we this will work (100%=high, 80%=medium, 50%=low)
Effort:     Person-sessions to complete (1 session = ~3 hours of /code work)
```

**Shishka adaptation:**
- "Users" = {Lesia, Bas, Alex, Hein, customers} — max 5 internal, customers scored by daily footfall
- Impact anchors: 3=unblocks revenue, 2=saves >1hr/day, 1=improves quality, 0.5=nice-to-have
- Effort: measured in Claude Code sessions (the actual unit of work)
- Confidence: drops to 50% if no spec exists, 80% if spec but untested, 100% if similar work done before

**When COO loads this:** Backlog triage, "what should we work on next?", sprint planning, CEO asks "why this and not that?"

---

## 4. AGENT.md Changes

### 4.1 New section: MBA Operating System

Added after "## Workflow", before "## Rules". Contains:

1. **Decision Protocol** — Type 1 / Type 2 classification (Bezos framework)
2. **Strategic Analysis Gate** — upgraded Socratic Gate with MBA lenses (unit economics, opportunity cost, scalability)
3. **Framework Load Triggers** — when to read `mba-frameworks.md` and which section

### 4.2 Upgraded Session Report

Current format gets 3 new lines:
```
Cash signal: <burn rate awareness — "normal" / "watch" / "critical">
Top ROI initiative: <which open initiative has best estimated return>
Bottleneck: <single biggest constraint on growth right now — TOC thinking>
```

### 4.3 Calibration Principle

Every framework section in the reference doc starts with a "Shishka Scale" callout:

> **Shishka Scale:** This is a 4-person kitchen doing 30-60k THB/month revenue. Adapt all thresholds accordingly. "Market analysis" = 3 competitors on Rawai. "CAC" = cost per Grab order vs walk-in. "Org design" = who does what among Lesia, Bas, Alex, Hein.

---

## 5. What This Does NOT Change

- No new MCP tools or RPCs
- No database changes
- No code changes
- Does not affect Tech-Lead agent or any other agent
- Does not change routing rules or RULE-* constitution
- Does not add dependencies

---

## 6. Implementation Plan

| Step | Deliverable | Blocked by |
|------|-------------|------------|
| 1 | `agents/strategy/mba-frameworks.md` — all 4 frameworks | — |
| 2 | `agents/strategy/AGENT.md` — MBA Operating System section + report upgrade + triggers | Step 1 |
| 3 | Commit + verify | Step 2 |

Estimated: 1 PR, ~30 minutes, pure markdown.
