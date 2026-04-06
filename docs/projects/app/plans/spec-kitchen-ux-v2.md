# Kitchen Management System v2 — UX Specification

> **Author:** COO (Cowork)
> **Date:** 2026-04-05
> **Priority:** CRITICAL (path to opening)
> **MC Parent:** `26a8ec5b` (UX Audit: Kitchen Pages)
> **Status:** DRAFT → CEO review

## 1. Problem Statement

Current kitchen UI has 8+ pages built around technical features (Gantt, BOM, Schedule)
rather than user workflows. Result:
- Cook opens system → doesn't know what to do
- Manager opens system → can't figure out how to assign tasks
- `/kitchen` page is broken (`shift_tasks.shift` column missing)
- `/cook` has ugly task cards that error on click
- `/kds` Gantt chart starts at midnight, unclear purpose
- No clear path: Plan → Assign → Execute → Track → Learn

## 2. Design Principles

1. **Process-first, not feature-first** — every screen answers ONE question
2. **Role-based views** — Manager sees differently from Cook
3. **Mobile-first for Cooks** — phone is primary device, iPad secondary
4. **Data collection by default** — every completed task feeds analytics
5. **Multilingual** — UI in English, voice input accepts any language (Burmese, Thai, Arabic)

## 3. User Roles

### 3.1 Manager (Леся, An)
- **Device:** Laptop / iPad
- **Auth:** Full login (email/password)
- **Permissions:** Plan, assign, monitor, review, configure
- **Key question:** "Is today's production on track?"

### 3.2 Cook (Alex, Bas, Hein, Pa + future hires)
- **Device:** Personal phone / shared iPad
- **Auth:** PIN or simple login (per staff member from `staff` table)
- **Permissions:** View assigned tasks, execute, log weights, leave feedback
- **Key question:** "What do I do next?"

### 3.3 Kitchen Display (wall-mounted iPad)
- **Device:** iPad in landscape, always-on
- **Auth:** None (public route, like current `/kitchen`)
- **Permissions:** View-only, real-time
- **Key question:** "What's happening right now?"

## 4. Screen Architecture

### Current pages → New structure

| Current Page | Verdict | Replacement |
|---|---|---|
| `/kitchen` | **REMOVE** (broken, legacy) | → Dashboard |
| `/cook` | **REDESIGN** | → My Tasks |
| `/kds` | **SIMPLIFY** | → Kitchen Live |
| `/orders` | **MERGE** into Planner flow | — |
| `/production` | **MERGE** into Planner flow | — |
| `/planner/batch` | **EVOLVE** | → Planner |
| `/schedule` | **FIX** (add custom patterns) | → Schedule (keep) |
| `/bom` | **ENHANCE** | → BOM Hub (keep, add features) |

### New navigation (KitchenNav component)

**Manager view** (authenticated):
```
Dashboard | Planner | Kitchen Live | BOM Hub | Schedule | History
```

**Cook view** (cook auth):
```
My Tasks | Kitchen Live
```

**Kitchen Display** (no auth):
```
Kitchen Live (full screen, auto-refresh)
```

---

## 5. Screen Specifications

### 5.1 Dashboard (`/dashboard`)

**Role:** Manager
**Question:** "Is today's production on track?"

**Layout (single scroll page):**

**Section A: Today's Summary**
- Total tasks planned / in progress / completed (progress bar)
- Estimated completion time for all tasks
- Next delivery window to L2 (e.g., "10:00 delivery: 80% ready")

**Section B: Alerts**
- Equipment bottleneck (Blast Chiller queue)
- Weight deviations > 10%
- Overdue tasks (past scheduled time)
- Staff not logged in yet

**Section C: Active Tasks** (live, Realtime)
- Card per active task: who's doing it, what step, time elapsed
- Tap → jumps to task detail

**Section D: Staff Today**
- Who's on shift, what they're working on, idle time

**Data source:** `production_tasks` + `shifts` + `staff` + Realtime subscription

---

### 5.2 Planner (`/planner`)

**Role:** Manager
**Question:** "What do we produce today/tomorrow?"

**Flow:**
1. **Pick delivery deadline** — e.g., "L2 delivery at 10:00" or "L2 delivery at 14:00"
   - Presets based on daily model: morning batch (10:00), afternoon batch (14:00), evening prep (18:00)
   - Custom time also allowed
2. **Select dishes/PFs** — from nomenclature (SALE + PF items that have recipe_flow)
   - Show: name, last batch date, current stock (if inventory connected)
   - Multiplier: x1, x2, x3 (batch sizes)
3. **Calculate schedule** — backward from deadline
   - Start time must be >= shift start (default 07:00, configurable)
   - If calculated start < shift start → warning: "Not enough time, need earlier start or fewer items"
   - Show equipment conflicts (especially Blast Chiller)
4. **Assign to cooks** — drag tasks to staff members, or auto-assign
5. **Save & Generate** — creates `production_tasks` in Supabase
   - Tasks appear on cooks' My Tasks screen
   - Tasks appear on Kitchen Live

**Key improvement over current `/planner/batch`:**
- Working hours constraint (no midnight starts)
- Delivery-window presets
- Staff assignment
- Batch quantity multiplier
- Stock-aware suggestions (future: "you're low on hummus base")

**Reusable from current code:** `BackwardScheduler.tsx`, `BackwardGantt.tsx`, `DishSelector.tsx`, `backwardSchedule.ts`

---

### 5.3 My Tasks (`/tasks`)

**Role:** Cook
**Question:** "What do I do next?"
**Device:** Phone (portrait), iPad

**States:**

**A) Task List (home)**
- Sorted by priority/scheduled time
- Card per task:
  - Dish name + icon (emoji or color dot by category)
  - Scheduled time: "07:00 - 08:30"
  - Status pill: Pending / In Progress / Done
  - Equipment needed: "Blast Chiller, Gas Range"
- Filter: My Tasks / All Tasks (toggle)

**B) Task Execution (tap on task)**
- **Step-by-step UI** (recipe_flow steps):
  - Step N of M: "Marinate chicken — 30 min"
  - Equipment: "Bowl, Prep Station"
  - Instruction text (from `recipes_flow.instruction_text`)
  - Timer (auto-start on step start, manual override)
  - Active step indicator (current step highlighted)
  - "Next Step" button
- **On last step → Complete screen:**
  - Input: actual weight (kg) — large numeric input, easy for wet hands
  - Input: temperature (if HACCP step)
  - **REQUIRED: photo** — camera opens, cook photographs the finished batch
    - Purpose: anti-theft (proof of production), quality control, portion consistency
    - Stored: Supabase Storage bucket `batch-photos/` → URL saved in `batches.photo_url`
    - UX: big camera button, one tap → shoot → confirm → done. No gallery browsing.
    - Fallback: if camera fails, cook can skip with reason (logged)
  - "Complete" button → saves to `production_tasks` + creates batch + shows Label Info

**C) Feedback button (always visible — floating action button)**
- 🎤 **Voice input** (primary):
  - Tap → records audio
  - Transcription via Web Speech API (browser-native) or Whisper API
  - Supports: Thai, Burmese (Myanmar), Arabic, English, Russian
  - Transcribed text saved to `cook_feedback` table
- ✏️ **Text input** (fallback):
  - Free text field
  - Multilingual keyboard (phone default)
- **Context attachment:**
  - If pressed during a task → auto-links to that task's `production_task_id`
  - If pressed from task list → global feedback (no task link)
  - Tags: suggestion / problem / question / other
- **Saved to:** `cook_feedback` table (new)
  - `id`, `staff_id`, `production_task_id` (nullable), `type` (suggestion/problem/question/other),
    `raw_text`, `language_detected`, `audio_url` (nullable), `created_at`

---

### 5.4 Kitchen Live (`/live`)

**Role:** All (Kitchen Display, Manager, Cook)
**Question:** "What's happening right now?"
**Device:** iPad landscape (wall mount), any device

**Layout:**

**Option A: Timeline view (2-3 hour rolling window)**
- Equipment rows (only active/upcoming equipment)
- Task bars showing: who, what, time remaining
- Current time marker (red vertical line)
- Color coding: green = on track, yellow = slow, red = overdue

**Option B: Card grid (simpler, for phone)**
- Active tasks as cards
- Each card: dish, cook name, step, timer, equipment
- Sorted by urgency (overdue first, then soonest)

**Auto-refresh:** Realtime subscription, no manual refresh needed
**No auth required** — public route (like current `/kitchen`)

**Replaces:** `/kds` (simplified, no 24h Gantt) + `/kitchen` (broken)

---

### 5.5 BOM Hub (`/bom`) — Enhanced

**Role:** Manager
**Current:** Basic BOM editor
**Additions:**

1. **Status filter:** Active / Testing / Archive / All
   - Active = currently on menu
   - Testing = in recipe development
   - Archive = deprecated
   - (Requires `status` field on `nomenclature` table, or use `is_available`)

2. **Recipe Flow tab** (per product):
   - Steps with equipment, duration, instructions
   - Visual: mini-timeline of steps
   - Edit inline or in modal
   - Currently in `recipes_flow` table, but no UI in BOM Hub

3. **Equipment view:**
   - For each PF/SALE → which equipment is needed
   - Helps planning: "if I add a new dish, do I have equipment capacity?"

4. **Cost & Margin:**
   - Already partially there (Cost: -- shown)
   - Need: auto-calculate from BOM tree, show margin if price set

5. **Nutrition:**
   - Already in DB, surface in BOM Hub (KBZHU per portion)

---

### 5.6 Schedule (`/schedule`) — Fixed

**Current issues:**
- Only 5/2 and 2/2 patterns, missing 6/1
- UI works but patterns are too rigid

**Fix:**
- Replace preset buttons with **custom pattern builder:**
  - Work days: slider 1-7
  - Off days: slider 0-6
  - Common presets as quick buttons: "Every Day", "6/1", "5/2", "2/2"
  - Or: calendar picker where manager taps on/off per day

**Nice-to-have:** Staff can see their own schedule in My Tasks header

---

## 6. Data Model Changes

### 6.1 New table: `cook_feedback`

```sql
CREATE TABLE cook_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID REFERENCES staff(id),
  production_task_id UUID REFERENCES production_tasks(id),
  type TEXT CHECK (type IN ('suggestion', 'problem', 'question', 'other')) DEFAULT 'other',
  raw_text TEXT NOT NULL,
  language_detected TEXT,
  audio_url TEXT,
  is_processed BOOLEAN DEFAULT FALSE,
  processed_by TEXT, -- 'chef-agent' or 'manager'
  processed_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS: staff can INSERT own, manager can SELECT/UPDATE all
```

### 6.2 Modify `production_tasks`

Add fields if missing:
- `assigned_to UUID REFERENCES staff(id)` — who should execute this task
- `actual_start TIMESTAMPTZ` — when cook actually started
- `actual_end TIMESTAMPTZ` — when cook actually completed
- `actual_weight NUMERIC` — grams/kg logged by cook
- `actual_temperature NUMERIC` — degrees if HACCP step
- `notes TEXT` — cook's notes on this specific task

### 6.3 Modify `staff`

Add if missing:
- `pin TEXT` — 4-digit PIN for quick login (alternative to email/password)
- `preferred_language TEXT` — for voice transcription language hint

### 6.4 Route changes

| Old Route | New Route | Notes |
|---|---|---|
| `/kitchen` | `/dashboard` | Manager home |
| `/cook` | `/tasks` | Cook personal view |
| `/kds` | `/live` | Kitchen display |
| `/orders` | REMOVE | Merged into `/planner` |
| `/production` | REMOVE | Merged into `/planner` |
| `/planner/batch` | `/planner` | Enhanced backward scheduler |
| `/bom` | `/bom` | Keep, enhance |
| `/schedule` | `/schedule` | Fix patterns |

**Add:** `/history` — completed tasks, yield analytics (later phase)

---

## 7. Implementation Phases

### Phase A: Foundation (CRITICAL — week 1)
1. Fix broken `/kitchen` → redirect to new Dashboard (minimal viable: today's tasks summary)
2. Fix `/cook` → clean up TaskExecutionCard, step-by-step flow with weight input
3. Fix Schedule patterns (add 6/1 / custom)
4. Add `assigned_to` to `production_tasks` (migration)
5. Add PIN auth for cooks (migration + simple PIN login screen)

### Phase B: Planner + Assignment (HIGH — week 2)
1. Evolve `/planner/batch` → add working hours constraint (07:00 start)
2. Add delivery deadline presets (10:00, 14:00, 18:00)
3. Add staff assignment step to planner
4. Save → generate assigned production_tasks

### Phase C: Cook Feedback (HIGH — week 2-3)
1. Create `cook_feedback` table (migration)
2. Voice input component (Web Speech API, browser-native)
3. Floating feedback button on My Tasks
4. Feedback list view for Manager (in Dashboard or separate tab)

### Phase D: Kitchen Live + Dashboard (MEDIUM — week 3)
1. Build rolling-window timeline (replace 24h Gantt)
2. Dashboard summary cards
3. Realtime alerts (bottleneck, overdue, deviation)

### Phase E: BOM Hub Enhancement (MEDIUM — week 3-4)
1. Status filter (active/testing/archive)
2. Recipe flow tab per product
3. Equipment view per product
4. Cost auto-calculation display

### Phase F: Analytics & Learning (LOW — after opening)
1. `/history` page — completed batches, yield trends
2. Deviation analytics (planned vs actual weight/time)
3. Chef Agent integration — auto-process feedback, suggest recipe adjustments

---

## 8. Legacy Cleanup

**Pages to remove after v2 is live:**
- `/kitchen` (KitchenDashboard.tsx) — replaced by Dashboard
- `/cook` (CookStation.tsx) — replaced by My Tasks
- `/kds` (KDSBoard.tsx) — replaced by Kitchen Live
- `/orders` (OrderManager.tsx) — merged into Planner
- `/production` (ProductionOrdersPage.tsx) — merged into Planner

**Components to archive:**
- `kitchen-dashboard/*` (ActiveShifts, ActiveTasks, EquipmentTimeline, UpcomingTasks)
- `kds/GanttTimeline.tsx`, `kds/GanttRow.tsx`, `kds/GanttTaskBar.tsx`, `kds/TimeHeader.tsx`
- `kds/TaskExecutionCard.tsx` — replace with new step-by-step component

**Components to KEEP and evolve:**
- `planner/BackwardScheduler.tsx` → enhance
- `planner/BackwardGantt.tsx` → adapt for Planner and Kitchen Live
- `planner/DishSelector.tsx` → enhance with stock info
- `kds/RecipeStepCard.tsx` → reuse in My Tasks
- `kds/BOMSnapshotPanel.tsx` → reuse in My Tasks
- `kds/DeviationBadge.tsx` → reuse everywhere
- `schedule/*` — keep all, fix pattern builder

---

## 9. Voice Input Technical Notes

### Browser-native approach (Phase C, MVP):
```
Web Speech API → SpeechRecognition
- Supports: th-TH (Thai), ar-SA (Arabic), en-US, ru-RU
- Does NOT support: my-MM (Burmese) natively
```

### For Burmese support:
- Option 1: Record audio blob → send to Whisper API (supports Burmese)
- Option 2: Let cook speak in Thai (many Burmese workers in Thailand speak basic Thai)
- Recommendation: Start with Web Speech API for Thai/Arabic/English, add Whisper fallback for Burmese

### UX for voice:
1. Cook taps 🎤 button
2. "Listening..." indicator with waveform
3. Auto-stop after 2s silence
4. Shows transcribed text → cook confirms or re-records
5. Save with language tag + original audio (for verification)

---

## 10. CEO Decisions (resolved 2026-04-05)

1. **PIN auth:** Name from list + 4-digit PIN ✅
2. **Delivery windows:** TBD — separate task `1535afb0` (L2 delivery schedule design)
3. **Cook task assignment:** Auto-assign with manager approval. Skill-based model (see Section 15) ✅
4. **Photo on completion:** REQUIRED. Anti-theft + quality control + portion consistency ✅
5. **WiFi at L1:** NOT YET — task `9487bb8c` to install internet set. Impacts offline architecture.
6. **Current labeling:** Marker on vacuum bag (handwritten). Need system-generated label info ASAP.

---

## 11. Batch Tracking Integration

### 11.1 Batch Lifecycle

```
Plan → Cook → Weigh → Label → Store → Transfer (L1→L2) → Use/Sell → Expire
```

Every batch in the system has:
- `batch_id` (UUID, auto-generated)
- `batch_code` (short human-readable, e.g., "BC-0405-01" = Borsch-April05-batch1)
- `production_task_id` (link to what created it)
- `product_id` (what is it: PF-BORSCH_BASE, etc.)
- `produced_by` (staff_id — who made it)
- `produced_at` (timestamp)
- `weight_kg` (actual weight logged by cook)
- `expires_at` (auto-calculated: produced_at + shelf_life from nomenclature)
- `location` (L1-fridge, L1-freezer, L2-fridge, etc.)
- `status` (produced → stored → in_transit → at_l2 → opened → used_up → expired)

### 11.2 Three Phases of Labeling

**Phase 0: NOW (marker on bag) — enhanced with system**
- Cook completes task → system shows "Label Info" screen:
  - Product name (big text)
  - Batch code (short, e.g., "BC-0405-01")
  - Date produced: 05.04.2026
  - Expires: 12.04.2026
  - Weight: 2.3 kg
- Cook writes this on the bag with marker
- System has the record — traceability exists even without barcode
- **KEY:** batch_code is SHORT (6-8 chars) so it's easy to write by hand

**Phase 1: PRINTER ARRIVES (label printer)**
- Same data → printed on thermal label
- Label includes: QR code (encodes batch_id UUID), product name, dates, weight
- Cook presses "Print Label" button after completing task
- Printer: thermal label printer (e.g., Brother QL-820NWB or similar)
- Connection: WiFi direct or Bluetooth

**Phase 2: FULL TRACEABILITY (POS scan)**
- L2 staff scans QR on bag → system records: batch received at L2
- On opening: scan again → system records: batch opened, starts "use by" timer
- Dashboard shows: which batches at L2, what's expiring soon, what to reorder

### 11.3 Integration Points with Kitchen UX v2

| Kitchen UX Screen | Batch Tracking Role |
|---|---|
| **Planner** | Creates production_tasks → each task will produce 1+ batches |
| **My Tasks** | Cook logs weight → triggers batch creation. Shows "Label Info" screen |
| **Kitchen Live** | Shows active batches being produced |
| **Dashboard** | Alerts: expiring batches, low stock at L2 |
| **BOM Hub** | shelf_life per product (defines expiry calculation) |

### 11.4 Data Model: `batches` table

```sql
CREATE TABLE batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_code TEXT NOT NULL UNIQUE,  -- human-readable short code
  production_task_id UUID REFERENCES production_tasks(id),
  nomenclature_id UUID REFERENCES nomenclature(id) NOT NULL,
  produced_by UUID REFERENCES staff(id),
  produced_at TIMESTAMPTZ DEFAULT now(),
  weight_kg NUMERIC NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  location TEXT DEFAULT 'L1-fridge',
  status TEXT CHECK (status IN (
    'produced', 'stored', 'in_transit', 'at_l2', 'opened', 'used_up', 'expired', 'wasted'
  )) DEFAULT 'produced',
  transferred_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- batch_code generation: fn_generate_batch_code(nomenclature_id, date)
-- e.g., "BC-0405-01", "HB-0405-02" (first 2 letters of product + date + sequence)

-- RLS: cook INSERT, manager ALL, anon SELECT (for L2 POS)
```

### 11.5 `nomenclature` additions

```sql
ALTER TABLE nomenclature ADD COLUMN IF NOT EXISTS
  shelf_life_days INTEGER;  -- e.g., 7 for vacuum-sealed PF, 3 for fresh
```

---

## 12. Offline Strategy

### 12.1 Current Reality
- L1 kitchen: NO WiFi yet (installation planned)
- L2 sales point: WiFi available
- Cooks' phones: mobile data (Thai SIM)

### 12.2 Decision: Online-first + Graceful Degradation

**Phase 0 (before WiFi at L1):**
- Planner runs on Manager's laptop (office, has WiFi)
- Cook uses phone with mobile data (4G) — works for basic task viewing/completion
- If signal is weak: app caches current task list on load, queues completions
- Minimal offline: `sessionStorage` for in-progress task state (already partially implemented)

**Phase 1 (after WiFi at L1):**
- All devices on WiFi
- Realtime subscriptions work
- Kitchen Live display becomes useful

**Phase 2 (future, if needed):**
- Full PWA with Service Worker
- IndexedDB for offline task queue
- Background sync on reconnect

### 12.3 Practical Implication for Phase A
- Cook app MUST work on 4G (lightweight, minimal data)
- No heavy Realtime subscriptions on cook's phone — poll or load on demand
- Dashboard and Kitchen Live: defer until WiFi is installed (Phase D)
- **Reorder phases:** A → B → C (these work on 4G) → [WiFi installed] → D

---

## 13. Revised Phase Order (with dependencies)

```
                    WiFi at L1?
                        │
        ┌───── NO ──────┴────── YES ─────┐
        │                                 │
   Phase A: Foundation               Phase D: Kitchen Live
   Phase B: Planner                  Phase D: Dashboard
   Phase C: Cook Feedback                 │
        │                                 │
        └─────────────────────────────────┘
                        │
                   Phase E: BOM Hub
                   Phase F: Analytics
```

### Phase A: Foundation (CRITICAL — week 1)
1. Remove/redirect broken `/kitchen` page
2. **Cook login:** name list + 4-digit PIN (new `/cook-login` route)
3. Fix CookStation → step-by-step execution + weight input
4. **Batch creation:** on task complete → generate batch record + show Label Info screen
5. Fix Schedule: add 6/1 + custom pattern builder
6. Migration: `assigned_to` on production_tasks, `pin` + `preferred_language` on staff
7. Migration: `batches` table + `shelf_life_days` on nomenclature + `fn_generate_batch_code`

### Phase B: Planner + Assignment (HIGH — week 2)
1. Working hours constraint (configurable shift start, default 07:00)
2. **No fixed delivery presets** — just deadline time picker (delivery schedule is separate task)
3. Staff assignment step
4. Batch quantity multiplier
5. Save → generate assigned production_tasks

### Phase C: Cook Feedback (HIGH — week 2-3)
1. `cook_feedback` table
2. Voice input (Web Speech API; works on 4G)
3. Floating feedback FAB
4. Feedback manager view

### Phase D: Kitchen Live + Dashboard (MEDIUM — after WiFi)
1. Requires: WiFi installed at L1
2. Rolling timeline (2-3h window)
3. Dashboard summary
4. Realtime alerts
5. Wall-mounted iPad setup

### Phase E: BOM Hub Enhancement (MEDIUM — week 3-4)
1. Status filter, recipe flow tab, equipment view
2. Cost calculation display
3. **shelf_life_days** editor per product (feeds batch expiry)

### Phase F: Analytics (LOW — after opening)
1. Yield trends, deviation analytics
2. Batch lifecycle analytics (how fast is stock turning over?)
3. Chef Agent integration

---

## 14. Open Tasks (linked to MC)

| Task | MC ID | Dependency |
|---|---|---|
| Kitchen UX v2 Phase A | `accac08b` | — |
| Kitchen UX v2 Phase B | `d7bca994` | Phase A |
| Kitchen UX v2 Phase C | `7d49630d` | Phase A |
| Kitchen UX v2 Phase D | `3b3a6e5b` | WiFi at L1 |
| Kitchen UX v2 Phase E | `a551a520` | — |
| WiFi installation at L1 | `9487bb8c` | hardware |
| L2 delivery schedule design | `1535afb0` | business decision |
| Barcode printer purchase + integration | `04a67a19` | hardware |
| POS barcode scan UI | `a4c76318` | Phase 1 labeling + hardware |
| Parent: Kitchen Production System | `9563ea4e` | umbrella |

---

## 15. Skill-Based Task Assignment

### 15.1 Problem

Cooks have different skill levels. A junior prep cook should not be assigned to operate
the Blast Chiller or manage critical HACCP steps. Auto-assignment must respect this.

### 15.2 Skill Model

**Skill Levels per Cook:**

| Level | Name | Can Do | Example |
|---|---|---|---|
| 1 | Prep | Washing, cutting, portioning, simple mixing | Wash vegetables, portion hummus |
| 2 | Cook | Thermal processing, marination, basic equipment | Grill chicken, cook quinoa |
| 3 | Senior | Blast Chiller, vacuum, complex recipes, HACCP-critical | Borsch base cook-chill cycle |
| 4 | Lead | All + quality checks + can approve others' work | Full batch production A-Z |

**Data Model:**

```sql
-- Add to staff table
ALTER TABLE staff ADD COLUMN IF NOT EXISTS skill_level INTEGER DEFAULT 1
  CHECK (skill_level BETWEEN 1 AND 4);

-- Each recipe_flow step has a minimum skill level required
ALTER TABLE recipes_flow ADD COLUMN IF NOT EXISTS min_skill_level INTEGER DEFAULT 1
  CHECK (min_skill_level BETWEEN 1 AND 4);
```

**Equipment → Skill mapping (seed data):**

| Equipment | Min Skill | Reason |
|---|---|---|
| Prep Workstation (sink, slicer) | 1 | Basic prep |
| Dough Mixer | 2 | Needs recipe knowledge |
| Gas Range, Lava Grill | 2 | Thermal processing |
| Convection Oven | 2 | Temperature control |
| Blast Chiller | 3 | HACCP critical, timing |
| Vacuum Sealer | 3 | Food safety |
| Bowl Cutter | 2 | Blade safety |

### 15.3 Assignment Algorithm

```
For each production_task in plan:
  1. Get required min_skill_level (max of all recipe steps)
  2. Get equipment requirements
  3. Filter available staff:
     - On shift today
     - skill_level >= required level
     - Not already overloaded (max concurrent tasks = 2)
  4. Sort by: least busy first, then highest skill match
  5. Propose assignment → show to Manager for approval
```

**Manager Approval Flow (in Planner):**

1. Manager picks dishes + quantities + deadline
2. System calculates backward schedule
3. System proposes staff assignments (color-coded cards)
   - Green = good fit (skill matches, available)
   - Yellow = stretch (skill level exactly meets minimum)
   - Red = no available staff for this skill level
4. Manager can drag-reassign or approve all
5. "Confirm Plan" → generates production_tasks with assigned_to

### 15.4 Skill Progression

Over time, as system collects data:
- Cook completes X tasks at level N without deviations → suggest promotion to N+1
- Dashboard shows: "Bas has completed 15 grill tasks with <5% deviation. Ready for Level 3?"
- Manager approves → skill_level updated

This is Phase F (analytics), but the data model supports it from day 1.

### 15.5 Phase B Implementation (MVP)

For week 2 (Phase B), keep it simple:
1. Add `skill_level` to staff (manager sets manually in Schedule page)
2. Add `min_skill_level` to recipes_flow steps (defaults to 1)
3. Planner shows suggested assignments with skill match indicator
4. Manager confirms or overrides
5. No automatic progression yet (that's Phase F)

---

## 16. Photo Capture on Task Completion

### 16.1 Purpose
- **Anti-theft:** Proves the batch was actually produced (photo = evidence)
- **Quality control:** Manager can review portion sizes, plating, packaging
- **Training:** Compare photos across batches to ensure consistency
- **Dispute resolution:** If weight is questioned, photo shows the actual product

### 16.2 Technical Implementation

**Capture flow:**
1. Cook enters actual weight
2. Screen shows: "Take a photo of the finished batch"
3. Camera opens (using `<input type="file" accept="image/*" capture="environment">`)
   - Uses back camera by default (environment-facing)
   - Works on any phone/iPad without special permissions
4. Photo preview → "Retake" or "Confirm"
5. Upload to Supabase Storage: `batch-photos/{batch_code}.jpg`
6. Save URL in `batches.photo_url`

**Compression (critical for 4G):**
- Resize to max 1200px width before upload
- JPEG quality 70% (good enough for review, ~200-400KB per photo)
- Use browser Canvas API for client-side compression
- No external libraries needed

**Storage:**
```sql
ALTER TABLE batches ADD COLUMN IF NOT EXISTS photo_url TEXT;
```

**Supabase Storage bucket:**
- Name: `batch-photos`
- Public: no (authenticated access only)
- Policy: cook can upload, manager can view all
- Auto-cleanup: photos older than 90 days → archive or delete (configurable)

### 16.3 Skip Policy
Cook CAN skip photo with a reason:
- "Camera broken"
- "Hands too dirty"
- "Other" (free text)

Skip is logged: `batches.photo_skipped_reason TEXT`
Manager sees skip count on Dashboard → too many skips = warning.

### 16.4 Manager Review
- Dashboard shows recent batch photos (thumbnail grid)
- Tap → full photo + batch details (weight, time, who made it)
- Flag button: "Quality issue" → creates MC task or feedback item
