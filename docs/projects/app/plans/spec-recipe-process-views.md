# Recipe Process Views — Specification

> **Author:** COO (Cowork)
> **Date:** 2026-04-09
> **Priority:** HIGH (path to opening)
> **MC Parent:** `9563ea4e` (Kitchen UX v2 Initiative)
> **Status:** DRAFT → CEO review
> **Depends on:** spec-kitchen-ux-v2.md (Phases A and E)

## 1. Problem Statement

Current ERP has `recipes_flow` table with full step data model (operation, equipment, duration, temperatures, instructions, HACCP points) but:
- **No CEO-facing view** to see/manage/audit process completeness across all recipes
- **Cook task execution** doesn't surface step-by-step process info (RecipeStepCard exists in code but not wired into workflow)
- **Data gap**: most recipes have 0 steps in `recipes_flow` — schema exists, data doesn't
- Result: CEO can't verify what's documented, cooks have no process guidance, HACCP points are untracked

## 2. Design Principles

1. **Two views, one data source** — `recipes_flow` feeds both CEO reference and cook execution
2. **Completeness-driven** — system shows what's missing, not just what's filled
3. **BOM Hub integration** — process lives next to composition (BOM + Process = full recipe picture)
4. **Chef-agent as data entry** — AI parsing happens in Claude via Chef agent, not in-app AI
5. **HACCP-first for cook** — temperature confirmation is mandatory, not optional

## 3. Data Model (existing)

Table: `recipes_flow` (migration 074)

| Column | Type | Purpose |
|---|---|---|
| `nomenclature_id` | UUID FK | Links to product |
| `step_order` | int | Sequential step (1-based) |
| `operation_name` | text | e.g. "Marination", "Grilling", "Blast Chilling" |
| `equipment_id` | UUID FK nullable | NULL = manual operation |
| `duration_min` | int | Expected duration in minutes |
| `instruction_text` | text | Detailed cook instruction |
| `temperature_c` | int nullable | Target equipment temperature |
| `internal_temp_c` | int nullable | HACCP control point — internal product temp |
| `is_passive` | bool | true = cook is free during this step |
| `notes` | text nullable | Chef's additional notes |

**No schema changes needed.** Existing model covers all requirements.

## 4. View 1: BOM Hub — "Process" Tab (CEO/Manager)

### 4.1 Entry Point

Inside RecipeBuilder (BOM Hub), add a new tab: **"Process"** alongside existing tabs (BOM, Pricing, Nutrition, etc.).

### 4.2 Recipe List — Completeness Column

Add column "Process" to the recipe list view:

| Badge | Meaning | Color |
|---|---|---|
| `9 steps ✓` | All steps have operation + duration + instruction | Green |
| `5/9 incomplete` | Some steps missing required fields | Yellow |
| `No process` | Zero rows in `recipes_flow` for this nomenclature | Red/Gray |

**Required fields for "complete" step:** `operation_name`, `duration_min`, `instruction_text`. Equipment and temperatures are optional (manual operations have neither).

### 4.3 Process Tab — Timeline View

When viewing a recipe's Process tab:

```
┌─────────────────────────────────────────────────┐
│ PF-CHICKEN_GRILL_NEUTRAL — Process (9 steps)    │
│                                                 │
│ Total time: 285 min (4h 45m)                    │
│ Active: 45 min | Passive: 240 min               │
│ Equipment: Grill, Blast Chiller, Vacuum Sealer  │
├─────────────────────────────────────────────────┤
│                                                 │
│  1. Preparation          ⚡ Active    15 min     │
│     Manual | No equipment                       │
│     ▸ Instruction text (expandable)             │
│                                                 │
│  2. Marination           💤 Passive   120 min    │
│     Manual | No equipment                       │
│     ▸ Instruction text                          │
│                                                 │
│  3. Tempering            💤 Passive   30 min     │
│     Manual | No equipment                       │
│     ▸ Instruction text                          │
│                                                 │
│  4. Grilling             ⚡ Active    15 min     │
│     🔥 Grill | 220°C | Internal: 74°C [HACCP]  │
│     ▸ Instruction text                          │
│                                                 │
│  5. Resting              💤 Passive   10 min     │
│  6. Portioning           ⚡ Active    10 min     │
│  7. Vacuum Sealing       ⚡ Active    5 min      │
│  8. Blast Chilling       💤 Passive   90 min     │
│     ❄️ Blast Chiller | -18°C | Internal: 3°C   │
│  9. Storage              ⚡ Active    5 min      │
│                                                 │
│  [+ Add Step]                                   │
└─────────────────────────────────────────────────┘
```

### 4.4 Summary Header

Computed from steps (not stored):
- **Total time**: sum of `duration_min`
- **Active time**: sum where `is_passive = false`
- **Passive time**: sum where `is_passive = true`
- **Equipment list**: distinct equipment names from steps
- **HACCP points**: count of steps where `internal_temp_c IS NOT NULL`

### 4.5 Editing

- **Inline edit**: click any field to edit in place
- **Drag-and-drop**: reorder steps (updates `step_order`)
- **Add step**: button at bottom, inserts with next `step_order`
- **Delete step**: with confirmation, reorders remaining steps
- **Equipment picker**: dropdown from `equipment` table

### 4.6 Filtering & Bulk View

On the recipe list level:
- Filter: "Show only recipes without process" (quick audit)
- Sort by: completeness percentage
- Bulk indicator: "47/120 recipes have complete process data"

## 5. View 2: Cook Task Execution — Step Wizard (Cook)

### 5.1 Entry Point

When a cook starts a production task (clicks "Start" on their task card in My Tasks), if the task's `target_nomenclature_id` has rows in `recipes_flow`, the wizard launches automatically.

If no `recipes_flow` data → show simple task card (current behavior) with note: "No process steps defined."

### 5.2 Wizard Layout (Mobile-First)

```
┌──────────────────────────┐
│ Step 2 of 9              │
│ ━━━━━━━░░░░░░░░░░░░░░░░ │  ← progress bar
│                          │
│ 🔥 GRILLING              │  ← operation name (large)
│                          │
│ ┌──────────────────────┐ │
│ │ Equipment: Grill     │ │
│ │ Temp: 220°C          │ │
│ │ HACCP: 74°C internal │ │
│ └──────────────────────┘ │
│                          │
│ Place chicken breast on  │  ← instruction (large, readable)
│ preheated grill. Cook    │
│ 7 min per side. Check    │
│ internal temp reaches    │
│ 74°C before removing.    │
│                          │
│ ┌──────────────────────┐ │
│ │  ⏱ 15:00    [Start]  │ │  ← timer
│ └──────────────────────┘ │
│                          │
│ 📝 Chef notes ▸          │  ← collapsible
│                          │
│ ┌────────────────────┐   │
│ │ Enter internal     │   │  ← HACCP confirmation
│ │ temp: [____] °C    │   │     (required to proceed)
│ └────────────────────┘   │
│                          │
│  [← Back]    [Next →]   │
│                          │
│ 💤 Passive step?         │  ← if is_passive
│ You're free until timer  │
│ ends. Take another task! │
└──────────────────────────┘
```

### 5.3 HACCP Gate

If step has `internal_temp_c`:
- Cook MUST enter actual measured temperature before "Next" is enabled
- Entered value is stored (in `production_task_temps` or similar — see Section 7)
- If entered temp is outside tolerance (±2°C of target), show warning: "Temperature out of range. Confirm or re-measure?"

### 5.4 Timer Behavior

- Auto-start: optional (cook presses "Start")
- Countdown from `duration_min`
- When timer hits 0: vibration + sound alert
- Overtime: timer goes negative, shows in red
- Passive steps: timer runs even if cook navigates away to another task

### 5.5 Passive Step Handling

When `is_passive = true`:
- Show badge: "Passive — you can work on other tasks"
- Timer continues in background
- Notification when timer completes
- Cook's task list shows "1 passive timer running" indicator

### 5.6 Navigation

- **Back**: go to previous step (non-destructive)
- **Next**: go to next step (blocked if HACCP confirmation pending)
- **Done** (last step): marks task as requiring photo capture (per Kitchen UX v2 spec)
- **Skip step**: NOT allowed — every step must be acknowledged

## 6. View 3: Data Entry via Chef Agent (Claude)

### 6.1 Workflow

1. CEO describes recipe to Chef agent (text in Claude conversation)
2. Chef agent parses into structured steps
3. Chef agent calls Supabase API to insert/update `recipes_flow` rows
4. CEO verifies in BOM Hub Process tab

### 6.2 Chef Agent Protocol

Chef agent should:
- Parse natural language recipe into `recipes_flow` fields
- Map equipment mentions to existing `equipment` table entries
- Flag ambiguous temperatures (equipment vs internal)
- Ask for HACCP points explicitly: "Which steps need internal temperature confirmation?"
- Present parsed result for CEO confirmation before writing to DB

### 6.3 Bulk Population Priority

For opening, prioritize populating `recipes_flow` for:
1. All SALE items currently on active menu
2. All PF (semi-finished) items used in active SALE items
3. Items with HACCP requirements (grilling, blast chilling)

## 7. Schema Extension (if needed)

### 7.1 HACCP Temperature Log

For storing actual temperatures entered by cooks during execution:

```sql
-- New table: production_step_logs
CREATE TABLE production_step_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  production_task_id UUID NOT NULL REFERENCES production_tasks(id),
  recipe_flow_id UUID NOT NULL REFERENCES recipes_flow(id),
  step_order INT NOT NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  actual_duration_min INT, -- computed or entered
  actual_temp_c NUMERIC(5,2), -- HACCP: actual measured temperature
  temp_confirmed BOOLEAN DEFAULT false,
  notes TEXT, -- cook's notes for this step
  created_at TIMESTAMPTZ DEFAULT now()
);
```

This enables:
- HACCP audit trail (when, who, what temperature)
- Actual vs planned duration analytics
- Per-step completion tracking

### 7.2 No other schema changes needed

`recipes_flow` already has all required fields. `equipment` table exists. `production_tasks` exist.

## 8. Implementation Phases

### Phase 1: BOM Hub Process Tab (CEO view)
- **What:** New tab in RecipeBuilder showing process timeline + completeness indicators
- **Depends on:** Nothing (pure frontend + existing API)
- **Maps to Kitchen UX v2:** Phase E enhancement
- **MC task:** To be created

### Phase 2: Cook Step Wizard
- **What:** Step-by-step wizard in cook task execution
- **Depends on:** Phase A of Kitchen UX v2 (task execution flow must work first)
- **Maps to Kitchen UX v2:** Part of Phase A task execution
- **MC task:** Already exists as part of Phase A (`accac08b`)

### Phase 3: HACCP Logging
- **What:** `production_step_logs` table + temperature entry + audit trail
- **Depends on:** Phase 2 (cook wizard must exist)
- **Maps to Kitchen UX v2:** Phase A enhancement
- **MC task:** To be created

### Phase 4: Chef Agent Bulk Population
- **What:** Chef agent populates `recipes_flow` for all active menu items
- **Depends on:** Phase 1 (CEO needs to verify results)
- **Parallel with:** Phases 1-3
- **MC task:** To be created

## 9. Out of Scope

- Voice input for recipe description (future — Chef agent in Cowork handles this naturally)
- AI in-app recipe parsing (Chef agent in Claude is the AI layer)
- Recipe versioning / change history (future consideration)
- Video/photo instructions per step (future)
- Nutrition per step (computed at recipe level, not step level)

## 10. Success Criteria

1. CEO can open any recipe in BOM Hub and see full process timeline with completeness status
2. CEO can see at a glance which recipes are missing process data
3. Cook starting a task sees step-by-step wizard with equipment, temps, timers
4. HACCP temperature confirmations are recorded and auditable
5. 100% of active SALE items have complete process data before opening
