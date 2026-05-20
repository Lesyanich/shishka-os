# Recipe Card Redesign — Production Tech Card UI

**Date:** 2026-05-20
**Status:** Approved
**Scope:** `L1CookTab` full redesign + `useDishRecipeSteps` hook enrichment

## Problem

The current L1CookTab in DishDrawer shows recipe steps as a flat text list with minimal metadata. Key data fields (`instruction_text`, `temperature_c`, `is_passive`) are not fetched from `recipes_flow`. The DrawerHero takes excessive vertical space with a 4:3 photo placeholder that doesn't scroll. Ingredients (BOM children) are not shown. The result: cooks and owner cannot see proportions, temperatures, equipment, or detailed instructions at a glance.

## Design Decisions

- **No new dependencies** — Tailwind + lucide-react only
- **No equipment photos** — use emoji by equipment category for readability
- **No print button** — not needed
- **Emoji for visual hierarchy** — user-requested for readability on tablet
- **Tablet-first** — 640px drawer width, touch-friendly targets
- **Works for ALL products** — PF items show ingredients + process + storage; SALE items additionally show L2 assembly block

## Architecture

### Data Layer Changes

**`useDishRecipeSteps.ts`** — add 3 missing fields to Supabase select:

```
Current:  id, step_order, operation_name, duration_min, internal_temp_c, equipment(name), notes, is_ccp, ccp_check_text
Addition: instruction_text, temperature_c, is_passive, equipment(name, category)
```

Updated `DishRecipeStep` interface:
```ts
export interface DishRecipeStep {
  id: string
  step_number: number
  operation_name: string
  duration_min: number | null
  instruction_text: string | null    // NEW
  temperature_c: number | null       // NEW — equipment target temp
  internal_temp_c: number | null
  equipment_name: string | null
  equipment_category: string | null  // NEW — for emoji mapping
  is_passive: boolean                // NEW
  notes: string | null
  is_ccp: boolean
  ccp_check_text: string | null
}
```

**`L1CookTab` props** — expand to receive ALL BOM children (not just PF-filtered) + pf_pack_card data:

```ts
interface L1CookTabProps {
  item: MenuItem
  components: AssemblyComponent[]      // ALL BOM children (RAW + MOD + PF)
  componentsLoading: boolean
  recipeSteps: DishRecipeStep[]
  recipeStepsLoading: boolean
  pfPackCard: PfPackCardData | null    // NEW — for storage section
  dishCard: DishCardData | null        // NEW — for L2 assembly section (SALE only)
}
```

**`DishDrawer.tsx`** — pass additional props to L1CookTab. No structural change to drawer layout (DrawerHero stays as-is for other tabs).

### UI Structure (top to bottom in scrollable area)

#### 1. Compact Recipe Header
Replaces DrawerHero context within L1CookTab only. Small inline block:
- Item name (bold, 18px)
- Product code (mono, muted)
- Category badge

No large photo placeholder. Everything scrolls together.

#### 2. Summary Bar
4 computed metrics in a horizontal row:

| Metric | Source | Emoji |
|--------|--------|-------|
| Total time | sum of all `duration_min` | :clock1: |
| Active time | sum where `is_passive === false` | :cooking: |
| Passive time | sum where `is_passive === true` | :hourglass_flowing_sand: |
| CCP count | count where `is_ccp === true` | :warning: |

Format time as `Xh Ym` or just `Xm` if < 60min.

#### 3. Ingredients Block
All BOM children displayed as a responsive grid of chips:

```
[PF] Chicken Breast    [RAW] Olive Oil     [RAW] Lemon Juice
     5.2 kg                 120 ml               60 ml
```

- Large quantity number, small unit text
- PF children get amber `[PF]` badge prefix
- MOD children get purple `[MOD]` badge prefix
- RAW children have no prefix badge (default)
- If no BOM children exist: show muted "No ingredients defined"

#### 4. Process Steps — Vertical Timeline
Each step rendered as a card. Three visual variants:

**Normal step:**
- White/default card background (`bg-surface-2`)
- Solid border (`border-surface-3`)
- Step number in circle + operation name + duration badge
- `instruction_text` as body paragraph
- Equipment line: emoji + equipment name
- Temperature badges only if present

**Passive step:**
- Muted background (`bg-surface-2/50`)
- Dashed border (`border-dashed border-surface-3`)
- Hourglass emoji + "cook is free" label
- Same content structure, visually quieter

**CCP step:**
- Amber background (`bg-amber-950/30`)
- Solid amber border (`border-amber-500/40`)
- Warning emoji + "CCP" badge
- Temperature blocks rendered LARGE in a 2-col grid:
  - Equipment temp: `temperature_c` with fire emoji
  - Probe temp: `internal_temp_c` with thermometer emoji
- `ccp_check_text` as amber-highlighted alert paragraph

**Equipment emoji mapping:**

| Category | Emoji |
|----------|-------|
| cooking | :fire: |
| oven | :fire: |
| prep | :hocho: |
| refrigeration | :snowflake: |
| fermentation | :petri_dish: |
| storage | :package: |
| service | :fork_and_knife: |
| beverage | :coffee: |
| infrastructure | :wrench: |
| other / null | :raised_hand: |

#### 5. Storage & Packaging (PF items only)
Shown when `pfPackCard` is not null. Horizontal chips:

- :snowflake: Temperature range (`storage_temp_min_c` .. `storage_temp_max_c` C)
- :calendar: Shelf life (`shelf_life_days` days)
- :package: Vacuum bag size + portions per bag
- Portions per batch + portion weight
- Storage zone name

#### 6. L2 Assembly (SALE items only)
Shown when `dishCard` is not null. Structured block:

- Container type
- Assembly order (numbered steps from JSONB array)
- Merrychef program (profile / temp / time)
- Pre-merrychef prep
- Post-merrychef check
- Cold add-ons after reheat

## Files Changed

| File | Change |
|------|--------|
| `apps/admin-panel/src/hooks/useDishRecipeSteps.ts` | Add `instruction_text`, `temperature_c`, `is_passive`, `equipment(name, category)` to select; update interface |
| `apps/admin-panel/src/components/menu/drawer/tabs/L1CookTab.tsx` | Full rewrite — new block structure |
| `apps/admin-panel/src/components/menu/drawer/DishDrawer.tsx` | Pass `pfPackCard` and `dishCard` to L1CookTab |

## Files NOT Changed

- `DrawerHero.tsx` — shared across all tabs, not touched
- `L1CookView.tsx` — list view unchanged
- `L2AssemblerTab.tsx` — stays as edit form for L2 data
- No migrations — all data already exists in DB
- No new dependencies

## Out of Scope

- Print/export functionality
- Equipment photo upload
- Recipe step editing (this is read-only view)
- New routes or pages (stays within existing drawer)
- i18n
