# Roadmap v1 — Design Spec

**File:** `agents/designer/designs/roadmap-v1/index.html`
**Deliverable for:** `/roadmap` in `apps/admin-panel` (replaces current `OpeningRoadmap.tsx`).
**Status:** prototype v1.1, awaiting review.
**Date:** 2026-04-24 · updated after CEO feedback round 1.

## Changelog

**v1.3 (2026-04-24, CEO micro-iteration — focus row pairing)**
- **Parallel Tracks panel deleted.** CEO: "убрать вовсе". The Menu / Finance / Training rollups were not earning their place — they duplicated information you can get from individual phase cards and the chapter drill-in. Deep-links to `/menu` and `/finance` live in the task rows and dish accordion.
- **Blockers &amp; Stoppers moved** from the right rail into a new side-by-side card next to the PRIMARY FOCUS "Before Recipe Lock" panel.
- **New `.focus-row` grid** — `grid-template-columns: minmax(0,1fr) 360px`, collapses to a single column below 1120px. Primary (countdown + must-do) on the left, blockers on the right.
- **Blockers redesigned as a peer-tier card** — previously it was a smaller rail panel, now it matches Primary's elevation: 24px radius, warm-dark gradient background with red accent tint, 1px gradient border, same shadow weight. Hero-weight typography (Alegreya 28-36px title with italic em). Red wax seal emblem pinned top-right.
- **Blockers row style upgraded** — each blocker has a red left border (3px solid), italic "why" explanation, owner → recipient in Alegreya SC, phase tag as a bordered chip, "VIEW ↗" button with hover fill.
- **Body grid flattened.** Since the right rail is gone, `.body-grid` is now a single-column block. Chapters span full width for easier scanning.

**v1.2.1 (2026-04-24, CEO micro-iteration — calendar to top)**
- Calendar promoted from PART TWO to PART ONE and moved to sit directly under the topbar.
- "The Six Chapters" renumbered to PART TWO.
- Reading order: orient (calendar) → focus (Before Recipe Lock) → drill (chapters). Reveal-animation delays shifted to match DOM order.

**v1.2 (2026-04-24, CEO review round 2 — noise reduction pass)**
- **Real logo embedded** — `01_Business/Branding/Logo iCone/Shishka-Kitchen-Logo-Icone-WG-24-12-25.png` inlined as base64 data URI in the topbar. Replaces the placeholder monogram "S".
- **"Before Recipe Lock" primary panel** — new top section. Shifts the narrative from "experiments end on Tuesday" (abstract) to "these are the 5 things that must ship before Tuesday" (concrete). Big countdown on the left, must-do list on the right with per-item status, owner, MC id, due chip.
- **Summary strip removed** (Overall Progress / Tasks Done / Active Blockers / Days to Lock cells). The same information lives inside phase cards (progress %) and the primary panel (countdown, list length). No duplication.
- **"Chapter IV — The Opening Journal" hero removed** — title, lede, and "Kept by Bas" signature all cut. The page title goes straight from topbar to primary panel.
- **My Line panel removed** — CEO feedback: "не понятно, взгляд теряется". Owner chips on tasks remain — they're the light-touch answer to "whose is this?".
- **Persona switcher removed** — without My Line it had no home. If per-user focus returns in v2, it should be a subtle filter on task lists, not a page-level mode.
- **Deep Dives (Part Three) removed** — three tiles repeating what the right-rail Parallel Tracks panel already does. CEO: "не нужно".
- **Dish preview turned into category accordion** — instead of 12 plate tiles taking a screenful, the menu is grouped into 6 categories (Manaeesh / Mains / Mezze & Salads / Soups / Desserts / Drinks). Each category shows count + readiness summary (e.g. `3/4 LOCKED`). Click to expand the dish list with per-dish lock status and optional tuning note.
- **Phase 0 Manaeesh + Mains categories default-expanded**; the rest collapse for focus.

**v1.1 (2026-04-24, CEO review round 1)**
- **Persona switcher** added to topbar (Lesya / Bas / Team). Selecting a persona softly highlights their tasks and filters the "My Line" panel. Shared editorial voice in the hero is preserved.
- **"My Line" panel** added to right rail above Blockers — 11 personalized jump-links (task, phase chip, MC id, due/overdue meta) scoped to the active persona.
- **Owner chips** (14 total) added to every task row — small 20px circle with initials (L / B / KW / CO), colour-coded per persona. Hover scales +8%.
- **Dish preview strip** added inside Phase 0 expanded state — the 12 Day-1 dishes as ceramic-plate cards with lock status (Locked / Tuning / Open), legend, click-through to `/menu#dish-NN`.
- **Warmer-dark surface tokens promoted to global** — decision from CEO review.
- **No Supply track** — intentionally omitted to keep the parallel-tracks panel from overloading.
- **`--brick-bright: #E27A7F`** added for 6.82:1 contrast on small red text (was 4.21:1 with `--brick-soft`).

---

## 1. Concept

**"The Opening Journal."** The roadmap is framed as a leather kitchen journal Bas keeps through the opening. This gives us:

- A natural home for the brand's editorial serif (Alegreya) alongside functional UI sans (DM Sans) and mono (JetBrains Mono).
- Permission to use texture (paper grain), marginalia (chef's italic notes), stamps/wax seals (status), chapter markers — craft details that separate this from generic SaaS.
- A single-page reading experience: each phase is a "chapter", blockers are an "incident log", the calendar is a "ruler of days", deep-links are an "index".

The visual does not fight functionality — every ornament is tied to meaning: the wax seal only appears where there's a real status, the marginalia carries the chef's context for the phase, and the ruler ticks are calendar-aligned.

## 2. Information Architecture

```
TOPBAR       — real Shishka pine-cone icon + "SHISHKA / Healthy Kitchen · Opening Roadmap" + today/chapter
PART ONE     — The Calendar: today / lock / test / dry-run / soft-opening markers on a single ribbon
FOCUS ROW    — Two paired cards side-by-side:
                 • Before Recipe Lock (countdown + 5 must-do items) — LEFT, wider
                 • Blockers & Stoppers (what's waiting on someone)  — RIGHT, 360px
PART TWO     — 6 phase cards (chapters), expand-to-task-list, deep-links to MC,
               full page-width now that the right rail is gone.
               Phase 0 additionally contains a collapsible menu-by-category accordion.
FOOTER       — version + spec link
```

**Reading order rationale (v1.3):**

The page reads *orient → focus → drill*. Calendar gives the whole journey in one glance. The focus row then pairs two sides of the same question: "what should we push forward?" (Primary) next to "what's pushing back?" (Blockers). Both rendered at the same visual tier so neither gets hidden. Phase chapters below are the detail view for anyone who wants to go deeper.

**What each section answers:**

- Topbar → *Where am I and when?*
- Part One / calendar → *How do all the phases sit on the timeline?*
- Focus row / primary → *What has to happen in the next 4 days?*
- Focus row / blockers → *What's stuck right now and why?*
- Part Two / phases → *What are all the phases and where are we in each?*

## 3. Design tokens (delta from `apps/admin-panel/src/index.css`)

All brand tokens already exist in `src/index.css` under the `@theme {}` block. This redesign consumes:

| Token | Hex | Role in this page |
|---|---|---|
| `--royal-green` | `#2D3F1C` | Done phase circles, brand mark background |
| `--royal-red` | `#9B1C21` | Wax seals, blocker accents, critical markers |
| `--forest-soft` | `#5B7A3D` | Done status, progress gradient start |
| `--brick-soft` | `#C74A4F` | Blocker chips, age indicator |
| `--amber-watch` / `--amber-glow` | `#B88830` / `#D6A03B` | Lock day, in-progress, focus ring |
| `--cream` / `--cream-dim` | `#F0EAD6` / `#D8D0B8` | Ink on parchment (primary/muted text) |

**New tokens introduced in the prototype** (to propose adding to global `@theme`):

```css
--s-0: #0A0D08;    /* warmer page bg than zinc-950; matches "candle-lit kitchen" */
--s-1: #10150D;    /* warmer panel bg */
--s-2: #171E12;    /* elevated */
--s-3: #1F2818;    /* hover */
--line: rgba(240,234,214,0.09);
--line-strong: rgba(240,234,214,0.18);
--e-out:  cubic-bezier(0.2, 0.8, 0.2, 1);
--e-emph: cubic-bezier(0.65, 0, 0.35, 1);
```

> **Why warmer darks, not zinc?** Admin-panel currently uses `bg-slate-950`/`bg-zinc-950`. Those are cold blue-grey. Shishka's palette is earth-warm — greens, ochres, reds. Swapping to a dark-green-tinted neutral makes the brand consistent across surface depth. Test side-by-side before shipping globally; local to `/roadmap` is a safe first move.

## 4. Typography in use

| Element | Font | Size | Weight |
|---|---|---|---|
| Page title ("The Opening Journal") | Alegreya | `clamp(44px,7vw,84px)` | 500 (with italic `em` @ 400) |
| Section heads ("The Six Chapters") | Alegreya | `clamp(28px,3.2vw,42px)` | 500 |
| Phase titles | Alegreya | 28px | 500 |
| Lede + marginalia | Alegreya italic | 15–20px | 400 |
| Overlines + PHASE tags | Alegreya SC | 10–12px | 700, 0.22–0.3em tracking |
| Body UI / task labels | DM Sans | 14px | 400 |
| Progress %, countdown, task IDs | JetBrains Mono | 11–18px | 500, tabular-nums |

## 4a. "Before Recipe Lock" primary panel (new in v1.2)

The first thing on the page now, and by a large margin the most important. It reframes the countdown from a passive observation ("time is running out") to an active to-do ("here's what ships in the next 4 days"). CEO quote: *"не просто что у нас заканчивается время для экспериментов, а что мы должны успеть сделать до этого времени."*

**Left column — Countdown pillar:**
- H1 "Before Recipe Lock" (Alegreya italic emphasis on "Lock").
- Italic lede: "Everything that must be finished before Tuesday, April 28 — the day the menu is frozen."
- Big `DD` days (JetBrains Mono, 72–108px, amber-glow with soft glow shadow).
- Supporting `days remaining` + live `HH : MM : SS` clock that ticks every second.
- Footer of the countdown card: "Locks Tue 28 Apr · 9:00 AM · BANGKOK · ICT".

**Right column — The five must-do items:**
- Caption: "The five things standing between us and a locked menu."
- Aggregate progress: "1 done · 2 doing · 2 to go" in Alegreya SC.
- Item rows — grid of `[status dot] [label + meta] [badge]`. Meta shows owner pill (BAS / LESYA), `MC-####`, optional due chip (DUE TODAY / DUE SUN / DUE MON). Click = deep-link to the task in MC.
- Statuses: done (green + strikethrough + filled checkmark dot), doing (amber + glow), to-do (outlined ring).

**Why a list of 5, not all tasks?** This panel answers "what ships in 4 days", not "everything open in phase 0". Anything beyond 5 bleeds into phase-level detail. Rule: this list == critical path only. If phase 0 has >5 things that must ship by lock, that's a planning signal, not a UI problem — split the phase.

**Data source in React port:** `business_tasks` where `phase = 0 AND is_critical_path = true ORDER BY due_date`. Add `is_critical_path` boolean to the table, or infer as "phase tag == phase-0 AND assigned_sprint == 'lock'".

## 4b. Menu accordion (updated in v1.2)

Replaces the 12-plate grid from v1.1. The grid looked good in isolation but took ~⅓ of Phase 0's expanded area, which the CEO flagged as outsized for a preview. Accordion solves three things:

1. **Compact default.** Menu rendered as 6 category rows (Manaeesh, Mains, Mezze & Salads, Soups, Desserts, Drinks) with count + readiness summary chip (`3/4 LOCKED`, `0/1 LOCKED`, etc.). Less than one screen.
2. **Readiness surfaced at the category level.** Colour of the readiness chip answers "is this group ready?" instantly — green for fully locked, amber for partial, cream for all-open.
3. **Per-dish detail on demand.** Expanded category shows individual rows: readiness dot · dish name (with optional tuning note in italic) · status pill (LOCKED / TUNING / OPEN) · deep-link arrow.

Default expanded state: **Manaeesh** and **Mains** (where the active tuning lives). Others collapsed.

## 4c. Persona-aware UI (from v1.1, trimmed in v1.2)

**Shared voice, personal focus** — CEO feedback: the page should read as one shared journal, but every teammate should find their work in under two seconds.

Pattern:
1. **Topbar persona switcher** — three pill-buttons (Lesya / Bas / Team). Default is "Team" (full view).
2. **Selecting a persona** sets `data-viewing-as="lesya|bas|team"` on `<body>`:
   - Matching task rows get a soft tinted background (amber for Lesya, brick for Bas).
   - Non-matching task rows drop to `opacity: 0.45`.
   - My Line panel filters to that persona's rows only.
   - Persona badge in My Line panel head switches colour.
3. **Owner chip** (20px circle with initials) on every task — always visible, independent of active persona. Colours: `L` amber-glow, `B` brick-bright, `KW` forest-soft, `CO` cream-dim.
4. **My Line panel** — the primary "jump to my work" affordance. Each row: status dot · label · meta line (phase chip · `MC-####` · optional due/overdue flag) · arrow. Click = deep-link to the task in MC. Footer has "ALL MINE ↗" to `/tasks?owner=me`.

**Data model implication:** every `business_tasks` row needs an `owner` field (currently optional). For v1 assume `owner ∈ { 'lesya', 'bas', 'coo', 'kw', 'unassigned' }`. In the React port, source the active persona from current user session; render owner chips from `task.owner`.

**Why not per-user logins show only their own view?** Because the shared journal voice is a deliberate cultural choice — everyone sees the whole opening, nobody operates in a silo. Persona switch is a lens, not a filter gate.

## 4d. Dish preview (historical — v1.1, replaced in v1.2)

**Status:** replaced by the menu accordion (4b). Original plate-tile grid kept here for reference in case we need to revive it (e.g. for marketing/customer-facing variant).

Original notes follow:

### v1.1 dish preview

The 12 Day-1 dishes live inside Phase 0's expanded state — between the chef's marginalia and the task list. Each dish is a ceramic-plate card:

- **Plate** — circular, colour per dish family (za'atar green, chicken amber, shakshuka red, etc.), with subtle inner shadow/highlight for ceramic depth and a stylized initial in Alegreya italic.
- **Name** — Alegreya 500 / 13.5px.
- **Status** — "Locked" / "Tuning · {reason}" / "Supplier pending" with a small coloured dot and Alegreya SC label.
- **Ribbon** — 18px corner badge: ✓ (locked green), ~ (tuning amber), · (open dashed).

Click = `/menu#dish-NN` (when menu page supports anchor targeting; otherwise `/menu?dish=NN`).

**Rationale:** Phase 0 is where we live until April 28. Seeing the 12 dishes at a glance — and which three are still being tuned — is more useful than scrolling a task list alone. The plate metaphor reinforces "recipe journal" without needing real food photos yet (they come in Phase 1 alongside the photo-shoot task).

**v2 upgrade:** swap plate graphics for real dish photography once the photo shoot (MC-0053) lands.

## 5. Components / interaction states

### PhaseCard (replaces current `PhaseCard.tsx`)
- **Collapsed** — number circle (rail), tag, title, subtitle, status chip, % readout, ruler bar with tick marks.
- **Expanded** — reveals `.ph-body-content`: optional chef's marginalia + task list (`<ul.tasks>`).
- **Hover** — subtle `.phase-card` bg shift (`--s-1` → `--s-2`), no transform (we want the journal to feel solid).
- **Current (in_progress)** — amber border + glow shadow + rotating dashed ring around number + "FOCUS" chip inline with phase tag.
- **Done** — royal-green filled number circle with `✓`, card @ 72% opacity. Still clickable for history.
- **Blocked** — red tint on number circle ring + red chip with count.

**Transition:** `grid-template-rows: 0fr → 1fr` + opacity (320ms `--e-out`). Chevron rotates 180°.

### TaskRow
- 22px status dot | label | `MC-####` mono id | `OPEN ↗` link chip.
- Click anywhere → deep-link to MC task (`/tasks/:id`).
- Blocked tasks get red halo on dot, done tasks get strikethrough.

### Countdown (hero aside)
- Live JS timer updates `HH:MM:SS` every second, `days` readout pulses via amber glow animation.
- On Lock Day passing — stamp should flip to green "LOCKED" (not implemented in v1; v2 TODO).

### Blocker card
- Grid: `[title | age]` + why paragraph + `[who · phase · view ↗]`.
- Red left margin bar reinforces "incident report" metaphor.
- Wax seal badge floats top-right when blocker count > 0.

### Parallel Track
- Full-width clickable row. `.tk-bar` uses gradient per track (menu green→amber, finance amber→brick, training deep-green→forest).
- Deep-links respectively to `/menu`, `/finance`, `/tasks?track=training`.

### Calendar ribbon
- 11-stop tick ruler with absolute-positioned markers at computed % of the timeline.
- Markers have color-coded label (amber=today, red=lock, forest=soft-opening).
- Hover on marker can surface a mini-tooltip (v2).

## 6. Responsive behavior

| Breakpoint | Behavior |
|---|---|
| `>= 1120px` | Two-column body grid: phases (main) + sticky rail (blockers/tracks). Hero side-by-side with countdown. |
| `980–1120px` | Single column. Rail drops below phases. Hero still side-by-side. |
| `720–980px` | Hero stacks: countdown goes full-width below title. |
| `< 720px` | All stacks. Summary strip → 2x2. Top-meta drops "Today" column. |

## 7. Accessibility

- All text meets WCAG AA on the dark surface: cream on `--s-0` = contrast > 13:1; cream-dim on `--s-0` = 9:1; amber-glow on `--s-0` = 6.4:1. Brick-soft on `--s-0` = 4.9:1.
- Focus states inherit `outline` — on port to React, add explicit `:focus-visible` rings using `--amber-watch` for keyboard users.
- Phase toggles use `<div role="button">` equivalent — on port, use real `<button>` with `aria-expanded` and `aria-controls`.
- `prefers-reduced-motion` disables entrance animations.
- Semantic landmarks: `<header>`, `<main>` (not in proto yet — add on port), `<aside>`, `<footer>`.

## 8. Deep-link map (to implement in React Router)

| Trigger | Target route |
|---|---|
| Task row click | `/tasks/:id` (Mission Control task detail) |
| "Menu" track / "The Menu" dive | `/menu` |
| "Finance" track / "The Ledger" dive | `/finance` |
| "Training" track / "The Task List" dive | `/tasks` or `/tasks?track=training` |
| Blocker "VIEW" | `/tasks/:id` with blocker filter |

## 9. Data model — what the page needs

All fields already exist on `business_tasks` + the existing `useOpeningRoadmap` hook. Additional data:

- `description` on task (for blocker "why" paragraph) — already there.
- Track % (menu/finance/training) — **new**. Propose computing client-side from `business_tasks` tagged with `track-menu` / `track-finance` / `track-training`. If tags don't exist yet → MC task: "Add track tags to existing tasks".
- Countdown target date — use `OPENING_PHASES[0].lockDay` from `roadmap-config.ts`. Soft-opening date should move to config too (currently hardcoded in marginalia).

## 10. Handoff checklist for React port

- [x] **Decision:** adopt warmer-dark `--s-0..3` globally (CEO approved 2026-04-24). → Promote these tokens into `apps/admin-panel/src/index.css` `@theme` block and migrate existing screens from `bg-zinc-950/slate-950` to the new warm neutral in a follow-up task.
- [ ] Add warmer-dark `--s-0..3` + `--brick-bright` + motion tokens to `apps/admin-panel/src/index.css` `@theme` block.
- [ ] Port HTML structure into `OpeningRoadmap.tsx` + split children into `JournalHero`, `PersonaSwitch`, `SummaryStrip`, `PhaseChapter`, `DishPreview`, `MyLine`, `BlockerLog`, `ParallelTracks`, `CalendarRibbon`, `DeepDives`.
- [ ] Replace `onclick="openTask(id)"` with `useNavigate()` from react-router.
- [ ] Replace placeholder blocker data with real blockers from `useOpeningRoadmap().blockers` (new derived field).
- [ ] Replace placeholder track %s with computed values.
- [ ] Source active persona from user session (`auth.user.id → persona`). Render owner chips from `task.owner`. Add `owner` enum to `business_tasks` migration if not already present.
- [ ] Wire dish preview to `nomenclature` table: `type='dish' AND product_code LIKE 'SALE-%'`, join with tag `day-1-menu`. Show top 12.
- [ ] Ensure Google Fonts Alegreya + DM Sans + JetBrains Mono are loaded globally (check `index.html` `<head>`).
- [ ] Unit tests: `isExpanded`, countdown formatting edge cases (past due, lock hour in different TZ).
- [ ] Visual regression screenshot for desktop + tablet + mobile.

## 11. v2 ideas (deferred)

- Tooltip on calendar marker hover showing phase owner + tasks of that day.
- "Print this page" mode → cream paper background, ink text, one-page overview for printing and pinning in the kitchen.
- Chef's marginalia becomes editable by Bas inline (writes to `phase.chef_note`).
- "What changed since my last visit" diff banner at the top (driven by `last_viewed_at` on user session).
- Wax seal on hero flips from "APPROACHING" → "LOCKED" → "OPEN" as phase status progresses.
- Customer-facing `/opening` mirror — same data, cream paper style, public.

## 12. Resolved decisions log

### Round 2 (2026-04-24 evening)

1. Summary strip (4 cells with Overall/Tasks/Blockers/Days) → **removed** (noise, duplicative).
2. Hero title "The Opening Journal" + lede + "Kept by Bas" → **removed** (decorative, not load-bearing).
3. Primary panel → **"Before Recipe Lock"** — countdown + the 5 must-do items.
4. My Line panel → **removed** (confusing, glance-test failed).
5. Persona switcher → **removed** (no home after My Line left).
6. Deep Dives (Part Three) → **removed** (parallel tracks already do the same job).
7. Dish preview 12-plate grid → **collapsed into category accordion** (Manaeesh, Mains, Mezze, Soups, Desserts, Drinks).
8. Logo → **real brand icon** from `01_Business/Branding/Logo iCone/` embedded as base64.

### Round 1 (2026-04-24 afternoon)

1. ~~Warmer dark scoped to `/roadmap` or global?~~ → **Global.** Follow-up: migrate admin-panel `zinc/slate` surface usage to new tokens.
2. ~~Hero voice — Bas or CEO?~~ → Moot (hero removed in round 2).
3. ~~Add a Supply track?~~ → **No.** Don't overload the parallel-tracks panel.
4. ~~Dish photos in Phase 0?~~ → **Yes, if beautiful** (implemented in v1.1, reshaped into accordion in v1.2).
