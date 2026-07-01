# Admin Panel — Current State

**Last updated:** 2026-04-05
**Active phase:** Kitchen UX v2 — Phase A Foundation
**Branch:** `feature/admin/kitchen-ux-v2-phase-a`
**Dev server:** `apps/admin-panel/` (port 5173)

## Primer
<!-- AUTO-REWRITTEN by Claude at session end. Do not edit manually. -->
- **Session date:** 2026-04-06
- **Last completed:** Kitchen UX v2 Phases A+B+C. Phase C: FeedbackFAB component with Web Speech API voice input (TH/EN/RU/AR), text fallback, type tags (problem/suggestion/question/other), context-aware task linking. Floating action button on MyTasks. Dashboard: feedback list with type badges, mark-as-processed. Speech type declarations added.
- **Next step:** 1) Create batch-photos Storage bucket in Supabase. 2) Test full flow end-to-end. 3) Phase D: Kitchen Live + Dashboard enhancements (after WiFi at L1). 4) Phase E: BOM Hub enhancements.
- **Blockers:** batch-photos storage bucket not yet created. Phase D blocked on WiFi at L1.
- **Modified files:** (Phase C) src/components/kitchen/FeedbackFAB.tsx (new), src/types/speech.d.ts (new), src/pages/MyTasks.tsx, src/pages/Dashboard.tsx

## In-flight (backend foundation)

- **2026-07-01 — Prep taxonomy split by food family; kill the "Cooked Components" catch-all (mig 341, branch `claude/suspicious-knuth-b1b00c`).**
  - Follows the shrimp precedent (mig 340). After shrimp left, `KP-PRP-RCK` "Cooked Components" still held **26 preps doing ~9 jobs** — a single unscannable L1 prep chip. CEO 2026-07-01: **maximal split** — each food family its own cook-legible bucket.
  - Mig **341**: created 9 new L3 families under `KP-PRP` — `KP-PRP-CHK` 🐔 Chicken (4), `KP-PRP-MEA` 🥩 Beef & Lamb (3), `KP-PRP-FSH` 🐟 Fish (1), `KP-PRP-GRN` 🌾 Cooked Grains (4), `KP-PRP-LEG` 🫘 Legumes (3), `KP-PRP-VEG` 🥔 Roasted & Baked Veg (6), `KP-PRP-MSH` 🥣 Mash & Purée (2), `KP-PRP-DAI` 🥛 Cultured Dairy (2), `KP-PRP-CRN` 🥜 Crunch (1). All 26 moved; **`KP-PRP-RCK` left active-but-empty** (deprecated landing zone — deactivate later if wanted). Manakish fillings grouped by protein (beef/lamb→Meat, salmon→Fish).
  - Same pass homed **10 of 19 orphans**: 6 PF (sauces→`KP-PRP-SAU`, dough→`KP-PRP-BRD`, marinade→`KP-PRP-MRN`) + 3 fruit raw→`F-PRD-FRU`; soft-deleted dead merged stub `RAW-SHREDED_MOZZARELLA_CHEESE` (0 BOM refs, verified). Applied to prod + verified (26 split, RCK=0, Uncategorized 19→9).
  - **Deferred (next pass — needs new buckets / a menu-section call):** water & soft drinks raw (ice, mineral water, soda, tonic — no `F-BEV` water bucket), protein/performance raw (whey, creatine, MCT — no `F-SUP` bucket), and the 2 `SALE-PITA_POTATO*` dishes (menu section TBD).

- **2026-07-01 — 🦐 Shrimp prep category; consolidate shrimp preps (mig 340, branch `claude/suspicious-knuth-b1b00c`).**
  - The three shrimp semi-finished preps were scattered: `PF-SHRIMP_GRILLED` + `PF-SHRIMP_SOUSVIDE` in Cooked Components (`KP-PRP-RCK`), `PF-SHRIMP_MARINATED_FZ` in **Uncategorized** (`category_id = NULL`). The raw marinated portion had no home ("Cooked Components" is the wrong axis for a raw sear-path prep) and the dual-prep model's two halves sat in different buckets.
  - Mig **340** (`340_shrimp_prep_category.sql`): new L3 prep category `KP-PRP-SHR` **"🦐 Shrimp"** (`name_th กุ้ง`) under `KP-PRP`; moved all 3 shrimp preps into it; nulled stale legacy `product_category="fish"` on the sous-vide row (`category_id` is authoritative). Applied to prod + verified (3/3 in `KP-PRP-SHR`, no orphans). Idempotent + reversible. **Supersedes** mig 301's note that kept cooked proteins flat in `KP-PRP-RCK`. CEO 2026-07-01: category names must be cook-legible → group protein preps by protein.
  - Raw shrimp *ingredients* (`RAW-SHRIMP*`) stay in Seafood `F-PRO-SEA` (ingredient taxonomy, separate branch). Reuse: when the dual-prep model replicates to chicken/fish, give each its own `KP-PRP-*` protein bucket.

- **2026-06-30 — Browser-free Loyverse push via DB queue + pg_cron (branch `feature/menu/loyverse-push-queue`).**
  - Problem: the security audit moved `LOYVERSE_API_TOKEN` into the `loyverse-sync` edge-function secrets, so the agent can no longer push menu/modifier changes to the POS — the owner was retyping by hand. We do NOT hand the key back.
  - Mechanism: agent (or admin) `INSERT`s a request into new `loyverse_push_queue`; a `loyverse-push-drain` pg_cron job (every min, `FOR UPDATE SKIP LOCKED`, LIMIT 5) calls `loyverse-sync?action=internal_push` via `net.http_post`, reading `loyverse_internal_secret` from `supabase_vault` and sending it as `x-internal-secret`. Edge fn dispatches to the existing `handlePushDish`/`handleReconcilePrices`/`handleResyncNames` and writes the row's terminal status back (net.http_post is fire-and-forget). `loyverse-push-watchdog` (*/5) retries stuck rows up to 3× then parks them as `error`. Reuses the exact cron+vault+pg_net pattern of mig 276.
  - Edge fn ([`services/supabase/functions/loyverse-sync/index.ts`](../../../services/supabase/functions/loyverse-sync/index.ts)): additive `isInternalCall()` (constant-time `x-internal-secret` compare, fails closed when unset) OR'd into the single auth gate; new `internal_push` action re-checks the secret so a browser JWT can't drive it. Browser session-JWT path (`isAuthedUser`) untouched. Raw POS token never leaves the function.
  - Migration **334** (`334_loyverse_push_queue.sql`): enum `loyverse_push_action`, `loyverse_push_queue` table + partial indexes + RLS (authenticated SELECT/INSERT, service_role ALL), the two cron jobs.
  - **✅ ACTIVATED + smoke-tested in prod (2026-06-30):** `LOYVERSE_INTERNAL_SECRET` edge secret set, loyverse-sync deployed **v36** (verify_jwt:false), vault secrets `loyverse_push_url`+`loyverse_internal_secret` created, mig 334 applied; cron jobs active. Smoke test: enqueued a `dish` push → drained → `status=done` ~31s, Loyverse item updated, `dish_push success`. Negative test: no/wrong `x-internal-secret` → 401. Runbook: [`docs/handoffs/loyverse-push-queue-activation.md`](../../handoffs/loyverse-push-queue-activation.md).
  - Phase 1 scope = `dish`/`prices`/`names`. Admin queue-status panel = Phase 2 follow-up. NB: admin ALREADY binds modifier groups↔dishes via `useDishModifierGroups` (the owner's suspected gap doesn't exist). 0 `approved` dishes currently, so first push test uses a `synced` dish.
  - **2026-06-30 (same branch) — per-dish modifier sync added + matcha fixed in POS.** New edge action `push_dish_modifiers?dish_id=` + queue `action='modifiers'` (target_id=dish) → `handlePushDishModifiers`: sets ONE dish's Loyverse `modifier_ids` from its `dish_modifier_groups` (UUID-valid only), preserving name/variants/etc. **Targeted, not the global `reattachAllDishes`** (that stays owner-only browser action — stale mirror can corrupt unrelated dishes). Fixed 4 drifted matcha dishes via the queue: Matcha Latte −Temperature; Iced Matcha Latte +Milk; Iced Dirty Matcha +Milk; Matcha Green Smoothie +Boosters. Verified live in Loyverse. fn redeployed (now ≥v37). Also: `action='delete'` queue action added (mig 335 — soft-delete + unlink) and deleted retired Iced Matcha Coconut Latte. Category drift fixed — 4 matcha items were stuck in ☕ Coffee/🥤 Smoothies in POS; `action='dish'` re-push moved them to 🍵 Matcha (push_dish sets category from DB link, preserves modifiers).

- **2026-06-29 — Finance pages re-skinned onto brand DS (epic MC d8b8438b continues, branch `feature/admin/finance-brand`).**
  - Repainted all 3 Finance tabs (Dashboard/Ledger/Analytics) + their components from default-Tailwind slate onto brand tokens + `.shk-*` primitives — matches the `/menu` look (PRs os#432/436). 15 files, no logic changes.
  - Surfaces → `.shk-panel`/`.shk-kpi`/`bg-[var(--s-*)]`/`border-[var(--line)]`; text → `text-cream` opacity ladder; chrome → `.menu-canvas` glow + seal/eyebrow/display title + `.shk-seg` tabs (NavLink `aria-current`). Semantic financial colors PRESERVED but retoned to brand analogs (healthy=forest/mint, warn=amber-watch, critical=brick-bright, accent=honey/royal-green). Food-cost thresholds + nutrition untouched; the 10-color categorical chart palette kept for legibility (only chart chrome rebranded).
  - `src/index.css`: promoted `--brick-bright` → `--color-brick-bright` (Tailwind v4 only generates color utilities from the `--color-*` namespace — was silently dropping every `text-/bg-/border-brick-bright`); extended `.shk-seg-btn` active selector to also match `[aria-current="page"]` so NavLink tab strips light up. `FinanceAnalytics`: dropped a redundant outer panel that double-wrapped MonthlyChart's own header.
  - Verified: full `npm run build` (tsc -b + vite) green; every brand utility confirmed present in compiled CSS; visual self-check via dist-CSS harness + Playwright (Vercel preview is behind SSO); `/code-review` (3 finders) → 1 finding fixed (Export-XLSX hover affordance collapse).

- **2026-06-24 — Receipts tab for managers + expense_ledger locked owner-only (MC 49ffbe68, branch `feature/admin/receipts-task-manager-access`).**
  - CEO: open ONLY `/receipts` to Mint (task_manager) so she can upload receipts + verify OCR, without exposing full expenses.
  - Frontend: `/receipts` route (App.tsx) + AppShell nav lowered `minRole` owner → task_manager. Finance dashboard/ledger/analytics/api-costs stay owner-only; Mint's "Finance" section now shows just Receipt Inbox.
  - Security finding + fix: `expense_ledger` RLS was `fn_is_authenticated()` — ANY logged-in staff (every cook + Mint) could read/write the whole ledger via the API; hiding finance tabs never hid the data. Mig **313** swaps it to `fn_is_owner()` (single `expense_ledger_owner_only` ALL policy). Approval path unaffected: `fn_approve_receipt_with_learning` is SECURITY DEFINER / owner=postgres / `force_rls=false` → bypasses RLS.
  - New RPC `fn_check_expense_duplicate(invoice, date, amount, supplier)` (SECURITY DEFINER, self-gated to active owner/task_manager, EXECUTE→authenticated only, LIMIT 5). `InboxReviewPanel` duplicate detection (on mount + pre-approve) now calls it instead of reading `expense_ledger` directly — managers keep dup warnings without table read access.
  - Verified: build (`tsc -b` + vite) + eslint green; prod RLS policy + RPC grants confirmed; RPC smoke test (unauthed → 0 rows, no error). Mig 313 applied to prod + self-registered (renumbered from 312 — collision with PR os#400's 312_seed_pf_mini_bun_pack).

- **2026-06-16 — Recipe-step station split in /menu drawer + inline-expand (MC acde9cc5, branch `feature/menu/recipe-step-station-split`).**
  - Fixes the acde9cc5 label-swap bug: the Owner-table inline-expand "L2 ASSEMBLY — Dish plating" block was rendering ALL of a SALE dish's recipe steps (incl. L1 press/pre-bake/blast-freeze each tagged "L1 production") under an L2 header.
  - New `src/lib/recipeStation.ts` (`stationForLocation`, `bucketStepsByStation`): Kitchen+Storage → L1, Assembly → L2; null/unknown → L1 bucket; `tagged=false` when no step carries a station so callers fall back to legacy "show all" (no regression for untagged smoothies/salads/etc.).
  - Hooks `useRecipeSteps` + `useDishRecipeSteps` now select `location_id, location:locations(name)` (FK `recipes_flow_location_id_fkey`).
  - `ProcessTab` gained a controlled `steps?` prop (render a station-filtered subset; keeps self-fetch `nomenclatureId` mode for RecipeBuilder + PF children).
  - `DishExpandedCard`: L2 Assembly section → Assembly-location steps only; the SALE dish's own Kitchen/Storage steps move to a "THIS SKU — cook-station steps" block inside L1 Production. Drawer `L1CookTab` Process list now shows L1-only (Merrychef step surfaced via L2AssemblyBlock, which now renders fan%/MW% + m:ss).
  - Data (mig 292/293, prod): 4 active manakish (Za'atar, Za'atar&Cheese, 6 Cheese, Salami) tagged 4 Kitchen / 1 Storage / 1 Assembly + `merrychef_program {260°C,100s,fan100,mw15}`. Other manakish/smoothies still NULL → fallback path.
  - Verified live on prod (os#369): #1 "🫓 Doughs & Bread" L1 section + Potato Manakish Dough 6 steps inline; #2 Merrychef card on manakish. #3 after-state pending prod deploy (login is password-gated for the agent).
  - Typecheck + 11 unit tests (incl. new `recipeStation.test.ts`) + eslint green.

- **2026-06-11 — Brain revival: Graphify freshness + lightrag cleanup (MC b979c787, branch `claude/elastic-easley-64e0bf`).**
  - Audit: graph.json was generated **2026-04-25** (graph-analytics.json `generated_at`); mcp-graphify served that static snapshot with no staleness signal. LightRAG embedding-suffixed tables (`lightrag_vdb_*_text_embedding_3_small_1536d`) survived 217a; brain_inbox empty.
  - `services/mcp-graphify` now returns `graph_freshness {generated_at, age_days, stale (>14d), warning}` in every tool response (source: analytics `generated_at`, fallback file mtime). Test added; 10/10 pass.
  - Mig **269** drops the 3 lightrag_vdb_* orphans — **written, NOT yet applied to prod** (destructive DROP awaits CEO approval).
  - Weekly local scheduled task `shishka-brain-maintenance` (Mon ~09:29): graph regen check, MEMORY.md size guard, MC brain-task sweep, brain_inbox check.
  - Brain v2 epic (b1c255bc) re-scoped: Phase 0 done via 217a+269, Phase 1 = this work, Phases 2-5 → backlog.
  - **Blocked on approvals:** `pip install graphifyy` (graph regeneration) + applying mig 269 DROPs.

- **2026-06-08 — Build-your-own "from ฿X" floor on shishka.health (site).**
  - Migs **259** (`group_min_select`) + **260** (`group_max_select` — adds `dish_modifier_groups.max_select`, caps Custom Smoothie "Pick Fruits" at 4): view `menu_modifiers` now exposes both min/max select (appended cols — CREATE OR REPLACE can't insert mid-list). Additive; row filter unchanged. Applied to prod.
  - shishka-health (PRs #6 + #7 + #8): dishes with a required modifier group (`minSelect>0`) price **"from ฿X"** = base + cheapest mandatory add-ons (new `src/lib/modifiers.js` `dishFloor`). Custom Smoothie shows **from ฿109** (89 + 2 cheapest fruits @฿10) on card + dialog. ModifierBuilder opens **empty** (no pre-select), enforces min **and** max per group (Pick Fruits = "pick 2–4"; at cap, unpicked options disabled), and shows the `from ฿X` floor as the total until the min is met. Mirrors the manakish-bundle `from ฿X` floor.
  - Mig **261** (`menu_modifiers_nutrition`): view now also exposes per-portion calories/protein/carbs/fat of each modifier option (nomenclature nutrition × `quantity_per_unit`, same scaling as admin `v_dish_modifier_options`). shishka-health (PR #9) feeds this into a **live KBJU counter** — DishDialog donut + macros now update as the guest adds fruits (e.g. Custom Smoothie 10 kcal → +Banana 77 → +Avocado 197). Builder reports the selected add-ons' nutrition up via `onNutritionChange`; dialog adds it onto the base. Finishes the web half of MC **389f0d99** (admin + POS still pending).
  - Mig **262** (`v_dish_modifier_options_min_max`): admin `v_dish_modifier_options` now also exposes `group_min_select`/`group_max_select`. New **admin build-preview** in the `/menu` dish drawer (CustomerTab → `ModifierBuildPreview`): owner toggles options and sees the same live KBJU + price counter customers get, fed by enrichment `modifierOptionsByDish` (no extra fetch). Finishes the **admin half** of MC **389f0d99** (MC **195e54bc**). POS surface dropped as N/A — Loyverse is third-party; printed-nutrition tracked under MC 7927fbf3.
  - GAP (MC **5a3d4792**): ModifierBuilder selections still don't flow into the cart — `addDish` adds at base price, so build-your-own lines undercharge. Separate task.

- **2026-06-07 — Packaging-as-BOM + L2 availability filter (MC 2385d288, branch `feature/menu/packaging-as-bom`).**
  - Migs **246** (normalize 9 NF-PKG containers to per-piece cost, base_unit=pcs; pack counts verified via Makro scraper) + **247** (`v_dish_packaging`, `v_dish_cost_split`) + **248** (views match whole **NF-PKG subtree** `code LIKE 'NF-PKG%'` — NF-PKG + NF-PKG-CNT/BAG/CTL, so cup/bottle on ~17 drink dishes count) — all applied to prod.
  - Packaging now modelled as `bom_structures` lines whose component's category code starts with **NF-PKG**; cost auto-rolls into `cost_per_unit` via existing trigger (migs 137/211). Food-cost % switched to **food-only** (`food_cost` from `v_dish_cost_split`), margin stays on full cost.
  - Drawer L2 tab: free-text container replaced by a packaging editor (add/remove NF-PKG lines, qty). Save blocked until ≥1 packaging line. L2 list card shows the packaging set; red warning when missing. L2 view gained an **Active/Inactive/All** availability toggle (default Active). L1 ingredient list excludes NF-PKG.
  - Follow-ups: `get_channel_margins` RPC channel FC% still includes packaging; no dishes have packaging assigned yet (owner data-entry); NF-PKG names still carry OCR garble.

- **2026-06-03 — Modifiers 2-level model (MC 38911fde).**
  - **Phase 1 SHIPPED** (PR #284, merged): mig 236 (`dish_modifier_groups` + `modifier_option_cost`) + edge fn loyverse-sync **v19** (`pull_modifiers` reconciles dish→group from Loyverse `item.modifier_ids`). Group SSoT = Loyverse lists (not `product_category`).
  - **Phases 3+4 DONE** (branch `feature/admin/modifiers-2level-editor`): `/menu/modifiers` (ModifiersPage) now has `GroupOptionEditor` (groups→options + option→MOD cost-link editor, computed cost/margin) and `DishGroupAttachEditor` (per-dish group attach/detach). DB-only writes, no Loyverse side-effects.
  - **Phase 5 PENDING** (separate review gate): single Push-to-Loyverse with fixed order (categories → groups/options/stores → item fields → LAST re-attach via `update_item`) — mutates the live POS.
  - Spec: `docs/modules/modifiers.md`.

## Tech Stack

React 19 + Vite 7 + Tailwind v4 + Supabase + TypeScript strict mode.
Error monitoring: Sentry (`@sentry/react`) — ErrorBoundary + browserTracing + replay. Source maps: `hidden`.
Auth: Supabase Auth (email/password). `persistSession: true`. ProtectedRoute + AuthProvider.
PWA: manifest.json + meta tags (no Service Worker yet).

## Phase Roadmap

### Phase 11-16: Procurement & Receiving (DONE)

| Phase | Name | Status |
|-------|------|--------|
| 11 | Procurement Foundation (DB Schema) | **DONE** (060-063) |
| 12 | Procurement RPCs | **DONE** (064-065) |
| 13 | Receiving Station (Frontend) | **DONE** |
| 14 | Purchase Order Management | **DONE** |
| 15 | Financial Reconciliation | **DONE** |
| 16 | MRP -> PO Integration | **DONE** |

### Phase 17-20: Syrve Integration

| Phase | Name | Status |
|-------|------|--------|
| 17 | Syrve Foundation — Nomenclature Mapping | **IN PROGRESS** |
| 18 | Purchase Push — Закупки -> Syrve | planned |
| 19 | Sales Pull — Продажи из Syrve | planned |
| 20 | Waste Push + Analytics Comparison | planned |

-> Integration plan: `.claude/plans/declarative-napping-chipmunk.md`

### Staff Schedule & Kitchen Dashboard (DONE — frontend, migration pending)

New modules added in session 2026-03-21:
- **Migration 069:** `staff`, `shifts`, `shift_tasks`, `equipment_slots` tables (pending apply)
- **Kitchen Dashboard:** `/kitchen` — open access, no auth, mobile-first coordinator dashboard
- **Schedule Manager:** `/schedule` — protected, CRUD for staff/shifts/tasks, weekly calendar, bulk generation
- **Backward Scheduler:** `/planner/batch` — deadline-based reverse scheduling with Gantt + conflict detection
- **PWA:** manifest.json, meta tags, QR code generation for `/kitchen`
- **Integration stubs:** `src/lib/printing.ts` (PrintService), `src/lib/scanner.ts` (ScannerService)

## Recent Fix: Receipt Job Resilience (2026-03-14)

**Problem:** Google Drive file sync causes HMR reloads, destroying in-flight async state.

**Solution — 3-layer resilience in FinanceManager.tsx:**
1. Module-level resolver outside React lifecycle (survives HMR)
2. sessionStorage persistence for pendingJobId, imageUrls, stagingData
3. Custom event bridge (`receipt-job-resolved`) + fallback poll every 10s

## Routing (Frontend)

| Route | Component | Status |
|---|---|---|
| `/login` | LoginPage.tsx | public |
| `/cook-login` | CookLogin.tsx | **public (PIN auth)** |
| `/kitchen` | → redirect to /dashboard | legacy redirect |
| `/dashboard` | Dashboard.tsx | **public (no auth)** |
| `/tasks` | MyTasks.tsx | **public (cook session)** |
| `/live` | KitchenLive.tsx | **public (no auth)** |
| `/` | ControlCenter.tsx | protected |
| `/bom` | BOMHub.tsx | protected |
| `/kds` | KDSBoard.tsx | protected |
| `/cook` | CookStation.tsx | protected (legacy) |
| `/waste` | WasteTracker.tsx | protected |
| `/logistics` | LogisticsScanner.tsx | protected |
| `/procurement` | Procurement.tsx | protected |
| `/sku` | SkuManagerPage.tsx | protected |
| `/orders` | OrderManager.tsx | protected |
| `/planner` | MasterPlanner.tsx | protected |
| `/planner/batch` | BatchPlanner.tsx | protected |
| `/finance` | FinanceManager.tsx | protected |
| `/receive` | ReceivingStation.tsx | protected |
| `/production` | ProductionOrdersPage.tsx | protected |
| `/schedule` | ScheduleManager.tsx | protected |
| `/brain/cost` | BrainCostPage.tsx | protected |
| `/settings` | Settings.tsx | protected |

## New Hooks (2026-03-21)

| Hook | Table | Realtime |
|---|---|---|
| `useStaff` | staff | no |
| `useShifts` | shifts | yes |
| `useShiftTasks` | shift_tasks | no |
| `useEquipmentSlots` | equipment_slots | yes |
| `useKitchenDashboard` | shifts + shift_tasks + equipment_slots | yes (all 3) |
| `useRecipeSteps` | recipes_flow | no |
| `useProductionOrders` | production_orders | yes |

## New Components (2026-03-21)

| Component | Location |
|---|---|
| ActiveShifts, ActiveTasks, EquipmentTimeline, UpcomingTasks | `kitchen-dashboard/` |
| StaffList, StaffForm, KitchenQR | `schedule/` |
| WeekCalendar, ShiftEditor, ShiftTaskEditor | `schedule/` |
| EquipmentAllocation, BulkScheduleGenerator | `schedule/` |
| BackwardScheduler, BackwardGantt, DishSelector, ConflictBadge | `planner/` |

## New Libs (2026-03-21)

| File | Purpose |
|---|---|
| `src/lib/backwardSchedule.ts` | Backward scheduling algorithm + conflict detection |
| `src/lib/printing.ts` | PrintService interface + stub (future: XP-365B printer) |
| `src/lib/scanner.ts` | ScannerService interface + stub (future: camera barcode) |

## Migrations Applied

70 total (001-069). Latest:
- 060-063: Procurement ENUMs + PO tables + receiving tables + links
- 064-065: Procurement RPCs + fn_approve_receipt v11
- 066: Syrve Integration (syrve_config, syrve_sync_queue, syrve_sync_log, syrve_uom_map, syrve_sales)
- 067/067a: DB Normalization & Seed Data (tag_groups, tags, nutrition, fin_sub_categories, nomenclature_tags)
- 068: Data Quality (UoM lowercase, name_th NOT NULL, nutrition gaps, wht_percent on fin_categories/fin_sub_categories)
- 069: Staff Schedule (staff, shifts, shift_tasks, equipment_slots + RLS + Realtime) — **applied**
- 070: Equipment Enrichment (capacity, setup_time_min, category, status) — **applied**
- 073: Chicken Grill recipe flow seed (superseded by 074) — **skip**
- 074: recipes_flow v2 (CREATE TABLE + enriched schema + 9-step chicken grill seed) — **applied**
- 075: production_orders (CREATE TABLE + auto order_number + RLS + Realtime) — **applied**
- 076: equipment_slots enrichment (production_order_id, recipe_step_id, status + equipment capacity seed) — **applied**
- 077: ~~DELETED~~ — MCP agent updated directly instead of DB compatibility hacks

-> Full table/RPC reference: `docs/domain/db-schema-summary.md`
-> Full schema with erDiagram: `vault/Architecture/Database Schema.md`

## Auth & Security (Phase 8)

- Supabase Auth (email/password), AuthProvider -> ProtectedRoute -> AppShell
- RLS: ALL tables `auth_full_access` via `fn_is_authenticated()`
- staff/shifts/shift_tasks/equipment_slots: anon SELECT (for /kitchen) + authenticated ALL
- SECURITY DEFINER RPCs bypass RLS by design
- `created_by` auto-filled via trigger on expense_ledger

## 3-Tier Product Architecture (Phase 10)

-> See `docs/domain/supplier-domain.md` for full model.

-> Module docs: `docs/projects/admin/modules/`
-> Architecture: `vault/Architecture/`
