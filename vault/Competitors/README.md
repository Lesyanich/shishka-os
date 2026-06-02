# Competitor Registry

A living registry of competitors and benchmarks for Shishka Healthy Kitchen. **Nothing gets lost** —
every competitor or benchmark the CEO flags gets a row here, even if its full analysis comes later.

## How to use
1. Add a row to the table below (status `backlog` if not yet analyzed).
2. For a full analysis, copy [`_TEMPLATE.md`](_TEMPLATE.md) into `./<slug>/analysis.md` and fill it in.
3. Put screenshots / captures in `./<slug>/assets/`.
4. Update the row's **Depth** and **Last analyzed** when done.

**Depth scale:** `backlog` (named only) → `light` (desk research) → `deep` (live site/app walkthrough) → `teardown` (full feature + flow capture).

## Registry

| # | Competitor | Segment | Site | App | Depth | Threat | Last analyzed | Entry |
|---|-----------|---------|------|-----|-------|--------|---------------|-------|
| 1 | **Easy Health** (Gourment Innovation) | Healthy meal delivery + meal plans, BKK/Pattaya | [easyhealth.asia](https://easyhealth.asia) | iOS `id6667109383` · Android `com.easyHealth.app` | **teardown** | 🟠 High (direct, mature) | 2026-06-02 | [easyhealth/analysis.md](easyhealth/analysis.md) |
| 2 | Salad (Салат) | Salad-focused — _benchmark named by CEO; details TBD_ | — | — | backlog | — | — | — |
| 3 | Salatush (Салатуш) | Salad bar / build-your-own — _benchmark named by CEO; details TBD_ | — | — | backlog | — | — | — |

> Backlog rows 2–3 are benchmarks the CEO referenced earlier ("Салат, Салатуш и так далее"). Captured
> here so they aren't lost. Confirm exact brands/URLs with the CEO, then promote to a full entry.

## Results & verdicts (the "so what")
Each entry's analysis ends with a **Copy / Beat / Skip + Threat** verdict. Quick-reference roll-up:

### 1 · Easy Health — verdict 🟠 High threat
- **COPY:** calorie-centered КБЖУ donut per dish · "Diets & Allergens" filter panel · guided BYO meal-builder (3-step wizard) · creation-based loyalty ("Happy Coin") · deep-linkable dish modals.
- **BEAT:** our BYO can be *costed & consistent* (Booster+BOM gives live cost + КБЖУ for free, theirs is a flat modifier list) · richer cuisine range (manakish/smoothies) · we own the full data stack (no Loyverse ceiling).
- **SKIP (for now):** multi-branch nearest-store routing · third-party delivery aggregators · heavy meal-plan subscription engine (v3, not MVP).
- **Their edge we lack today:** polished food photography + content depth (blog, meal-plan landing pages) and a live, deployed customer app. Our MVP blocker is *content*, not code.
- Full nuances + screenshots: [easyhealth/analysis.md](easyhealth/analysis.md).

## Why this registry exists & how it connects
The base is **hybrid** — a queryable Supabase spine + this rich git-versioned folder:

- **Supabase (queryable spine):** tables `competitors` + `competitor_cases` (migration `services/supabase/migrations/229_competitor_intel.sql`). The structured index + a growing log of "interesting cases", surfaced in the admin panel, appendable from any session. EasyHealth + 4 cases seeded.
- **Knowledge base (this folder):** `vault/Competitors/` — deep narrative, screenshots, full comparison/verdicts. Each `competitors.vault_doc` row points here.
- **Work tracking:** Mission Control task `cf0b895e` records the analysis + links here.
- **Product impact:** verdicts feed `vault/Product/customer-site-and-app.md` and MC initiative `52efcf1e`.

> Why hybrid: tables answer "show all High-threat competitors" / power a dashboard; markdown holds the
> nuance + screenshots a table can't. A row links to its deep doc; nothing is lost on either side.

Easy Health is the first competitor analyzed in depth, but not the last. Every new competitor gets a row
above + (when analyzed) a `<slug>/analysis.md` ending in a Copy/Beat/Skip verdict, so intel accumulates
into a comparable base over time.
