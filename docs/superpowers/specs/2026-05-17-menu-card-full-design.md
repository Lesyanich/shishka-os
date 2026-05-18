# Menu Card — Full Process Description for All Participants (Design Spec)

**Date:** 2026-05-17
**Status:** Draft → Awaiting CEO review
**Author:** Claude (session `claude-opus-session-142841ef`) with CEO (Lesia)
**Supersedes (absorbs):**
- MC `e696afe3` — Add 3 description fields (customer/assembler/kitchen) to nomenclature
- MC `68dbc8ec` — Add `merrychef_program` column to nomenclature

## 1. Problem Statement

Today every dish on `/menu` has only:
- `nomenclature.description` (single freeform text)
- `recipes_flow` (production steps, L1-cook-oriented)
- `bom_structures` (composition + per-unit quantities)
- `fn_dish_scorecard` (advisory 5-axis quality score)

What's **missing** to make a dish description "exhaustive for every participant level" (procurement → production → packaging → assembly → reheat → handout):

- L1 cook lacks structured pack info (batch yield, vacuum bag size, label template, shelf life, storage zone/temp, HACCP CCPs)
- L2 assembler lacks plating instructions (container, assembly order, pre/post Merrychef checks, cold add-ons after reheat, Merrychef program)
- Customer view lacks allergens, modifier options, photo, ETA, short POS name
- Owner lacks card-completeness indicator, verification trail (version, who verified, when), TTC source link

This spec defines schema + UI to cover all four participant roles on a single `/menu` page.

## 2. Roles (in scope, v1)

Maps to **Shishka POS System Map v1.0** (CEO-ratified 2026-05-15, 7 stages):

| Role | Reads in `/menu` | Stage(s) covered | Edits in v1 |
|------|------------------|------------------|-------------|
| **Owner** (Lesia) | All views | All (oversees) | All fields |
| **L1 Cook** (Alex/Hein) | L1 Cook view | Stage 2 Production | Read-only in v1 (owner edits on their behalf) |
| **L2 Assembler** (Alex/Hein at L2) | L2 Assembler view | Stage 5 Assembly | Read-only in v1 |
| **Customer** (preview as cashier/Grab sees it) | Customer view | Stage 4 Order intake | Not editable |

**Packer as separate role — explicitly deferred.** Per System Map Stage 5, "assembler packs into customer container as final sub-step of assembly." Packer becomes a distinct role only when L2 volume requires splitting (>200 orders/day). When introduced, packer reads the **same** L2 Assembler card — no new card content needed.

**Out of scope (v1):**
- Per-role RLS (waits for User Management UI, MC `6e4b56bf`)
- i18n framework (literals externalizable but no library)
- Version history (only counter + last-verified pointer)
- Loyverse auto-push on verify (explicit action only)

## 3. Storage Strategy — Approach B (Domain Split)

| Layer | Where it lives | Why |
|-------|----------------|-----|
| Cross-cutting fields (descriptions, photo, version, verified-by) | `nomenclature` (extended) | Shared across nomenclature types |
| L2 Assembler structured fields | `dish_card` (new, 1:1 with SALE-* rows) | Avoids NULL bloat on non-SALE rows |
| L1 Pack/storage structured fields | `pf_pack_card` (new, 1:1 with PF-* rows) | Avoids NULL bloat on non-PF rows |
| HACCP critical control points | `recipes_flow` (extended) | CCP is an attribute of a STEP, not a dish |
| Allergens | `tags` + `nomenclature_tags` (reuse) | Existing system; `fn_dish_scorecard` already reads tags |
| Modifier options for customer | `nomenclature_modifier_options` (new m2m) | Clean SALE×MOD link without polluting BOM |
| Composition for L2 assembler | `v_dish_assembly_components` (view over `bom_structures`) | Derived, single source of truth (BOM) |

Rejected alternatives:
- **Flat** (all fields on `nomenclature`) — 17 ALTER TABLE in one migration, NULL bloat on RAW/MOD rows
- **JSONB blob** (`card_metadata`) — loses type safety, FK, indexes, per-field RLS

## 4. Schema Changes

### 4.1 Migration `181_nomenclature_card_extension.sql`

Absorbs MC `e696afe3` + `68dbc8ec`.

```sql
ALTER TABLE nomenclature
  ADD COLUMN IF NOT EXISTS customer_description  TEXT,
  ADD COLUMN IF NOT EXISTS customer_short_name   TEXT,
  ADD COLUMN IF NOT EXISTS customer_photo_url    TEXT,
  ADD COLUMN IF NOT EXISTS assembler_note        TEXT,
  ADD COLUMN IF NOT EXISTS kitchen_note          TEXT,
  ADD COLUMN IF NOT EXISTS merrychef_program     JSONB,
  ADD COLUMN IF NOT EXISTS ttc_source_url        TEXT,
  ADD COLUMN IF NOT EXISTS card_version          INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_verified_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_verified_by      UUID REFERENCES auth.users(id);

-- card_version monotonicity
CREATE OR REPLACE FUNCTION fn_card_version_monotonic()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.card_version < OLD.card_version THEN
    RAISE EXCEPTION 'card_version cannot decrease (was %, attempt %)', OLD.card_version, NEW.card_version;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_card_version_monotonic
  BEFORE UPDATE OF card_version ON nomenclature
  FOR EACH ROW EXECUTE FUNCTION fn_card_version_monotonic();

-- merrychef_program JSONB schema check
ALTER TABLE nomenclature
  ADD CONSTRAINT chk_merrychef_program_shape CHECK (
    merrychef_program IS NULL OR (
      jsonb_typeof(merrychef_program) = 'object'
      AND (merrychef_program ? 'temp_c')
      AND (merrychef_program ? 'time_sec')
    )
  );
```

### 4.2 Migration `179_dish_card_table.sql`

```sql
CREATE TABLE public.dish_card (
  nomenclature_id           UUID PRIMARY KEY REFERENCES nomenclature(id) ON DELETE CASCADE,
  container_l2              TEXT,                         -- 'paper_bowl_16oz', 'kraft_box', 'GN'
  assembly_order            JSONB,                        -- [{step:1, text:"base"}, {step:2, text:"protein"}, ...]
  pre_merrychef_prep        TEXT,
  post_merrychef_check      TEXT,
  cold_addons_after_reheat  TEXT,
  has_cutlery               BOOLEAN NOT NULL DEFAULT false,
  has_lid_sticker           BOOLEAN NOT NULL DEFAULT false,
  assembler_photo_url       TEXT,
  customer_eta_min          INT,
  composition_override      TEXT,                         -- editorial customer-facing override of auto-from-BOM
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only SALE-* dishes can have a dish_card
CREATE OR REPLACE FUNCTION fn_dish_card_type_guard()
RETURNS TRIGGER AS $$
DECLARE v_code TEXT;
BEGIN
  SELECT product_code INTO v_code FROM nomenclature WHERE id = NEW.nomenclature_id;
  IF v_code IS NULL OR v_code NOT LIKE 'SALE-%' THEN
    RAISE EXCEPTION 'dish_card.nomenclature_id must reference SALE-* item (got %)', v_code;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_dish_card_type_guard
  BEFORE INSERT OR UPDATE OF nomenclature_id ON dish_card
  FOR EACH ROW EXECUTE FUNCTION fn_dish_card_type_guard();

-- assembly_order shape check
ALTER TABLE dish_card
  ADD CONSTRAINT chk_assembly_order_shape CHECK (
    assembly_order IS NULL OR (
      jsonb_typeof(assembly_order) = 'array'
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(assembly_order) e
        WHERE NOT (e ? 'step' AND e ? 'text')
      )
    )
  );

-- RLS: anon read (for future POS preview), authenticated full
ALTER TABLE dish_card ENABLE ROW LEVEL SECURITY;
CREATE POLICY dish_card_anon_read ON dish_card FOR SELECT TO anon USING (true);
CREATE POLICY dish_card_auth_full ON dish_card FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE dish_card;
```

### 4.3 Migration `180_pf_pack_card_table.sql`

```sql
CREATE TABLE public.pf_pack_card (
  nomenclature_id        UUID PRIMARY KEY REFERENCES nomenclature(id) ON DELETE CASCADE,
  batch_input_qty        NUMERIC,
  batch_input_uom        TEXT,                    -- 'kg', 'L', 'pcs'
  portions_per_batch     NUMERIC,
  portion_weight_g       NUMERIC,
  vacuum_bag_size        TEXT,                    -- '20x30cm'
  fill_weight_per_bag_g  NUMERIC,
  portions_per_bag       NUMERIC,
  label_template         JSONB,                   -- {fields: ["item","batch_id","date","expiry","cook","weight"]}
  shelf_life_days        INT,
  storage_zone           TEXT,                    -- 'L1-Cold-W1', 'L1-Freezer', 'L1-Cold-W3'
  storage_temp_min_c     NUMERIC,
  storage_temp_max_c     NUMERIC,
  kitchen_photo_url      TEXT,                    -- "good batch" reference
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_temp_range CHECK (
    storage_temp_min_c IS NULL OR storage_temp_max_c IS NULL
    OR storage_temp_min_c <= storage_temp_max_c
  )
);

-- Only PF-* items can have a pf_pack_card
CREATE OR REPLACE FUNCTION fn_pf_pack_card_type_guard()
RETURNS TRIGGER AS $$
DECLARE v_code TEXT;
BEGIN
  SELECT product_code INTO v_code FROM nomenclature WHERE id = NEW.nomenclature_id;
  IF v_code IS NULL OR v_code NOT LIKE 'PF-%' THEN
    RAISE EXCEPTION 'pf_pack_card.nomenclature_id must reference PF-* item (got %)', v_code;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_pf_pack_card_type_guard
  BEFORE INSERT OR UPDATE OF nomenclature_id ON pf_pack_card
  FOR EACH ROW EXECUTE FUNCTION fn_pf_pack_card_type_guard();

ALTER TABLE pf_pack_card ENABLE ROW LEVEL SECURITY;
CREATE POLICY pf_pack_card_anon_read ON pf_pack_card FOR SELECT TO anon USING (true);
CREATE POLICY pf_pack_card_auth_full ON pf_pack_card FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE pf_pack_card;
```

### 4.4 Migration `182_recipes_flow_haccp_ccp.sql`

```sql
ALTER TABLE recipes_flow
  ADD COLUMN IF NOT EXISTS is_ccp          BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ccp_check_text  TEXT;

ALTER TABLE recipes_flow
  ADD CONSTRAINT chk_ccp_text_when_ccp CHECK (
    NOT is_ccp OR ccp_check_text IS NOT NULL
  );

CREATE INDEX IF NOT EXISTS idx_recipes_flow_ccp ON recipes_flow(nomenclature_id) WHERE is_ccp = true;

-- Seed: mark existing chicken-grill internal temp + blast chill steps as CCP
UPDATE recipes_flow
SET is_ccp = true,
    ccp_check_text = 'Probe must read >= 74 C in thickest part before transferring to chill.'
WHERE operation_name = 'Grilling'
  AND internal_temp_c = 74
  AND ccp_check_text IS NULL;

UPDATE recipes_flow
SET is_ccp = true,
    ccp_check_text = 'Core temperature must reach <= 4 C within 90 minutes.'
WHERE operation_name = 'Blast Chilling'
  AND ccp_check_text IS NULL;
```

### 4.5 Migration `183_modifier_options_and_allergens.sql`

```sql
-- Modifier options for SALE dishes
CREATE TABLE public.nomenclature_modifier_options (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dish_id      UUID NOT NULL REFERENCES nomenclature(id) ON DELETE CASCADE,
  modifier_id  UUID NOT NULL REFERENCES nomenclature(id) ON DELETE RESTRICT,
  price_delta  NUMERIC NOT NULL DEFAULT 0,
  is_default   BOOLEAN NOT NULL DEFAULT false,
  sort_order   INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_dish_modifier UNIQUE (dish_id, modifier_id)
);

CREATE OR REPLACE FUNCTION fn_modifier_options_type_guard()
RETURNS TRIGGER AS $$
DECLARE v_dish_code TEXT; v_mod_code TEXT;
BEGIN
  SELECT product_code INTO v_dish_code FROM nomenclature WHERE id = NEW.dish_id;
  SELECT product_code INTO v_mod_code  FROM nomenclature WHERE id = NEW.modifier_id;

  IF v_dish_code NOT LIKE 'SALE-%' THEN
    RAISE EXCEPTION 'modifier_options.dish_id must reference SALE-* (got %)', v_dish_code;
  END IF;
  IF v_mod_code NOT LIKE 'MOD-%' THEN
    RAISE EXCEPTION 'modifier_options.modifier_id must reference MOD-* (got %)', v_mod_code;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_modifier_options_type_guard
  BEFORE INSERT OR UPDATE ON nomenclature_modifier_options
  FOR EACH ROW EXECUTE FUNCTION fn_modifier_options_type_guard();

CREATE INDEX idx_modifier_options_dish ON nomenclature_modifier_options(dish_id);
CREATE INDEX idx_modifier_options_modifier ON nomenclature_modifier_options(modifier_id);

ALTER TABLE nomenclature_modifier_options ENABLE ROW LEVEL SECURITY;
CREATE POLICY mod_opts_anon_read ON nomenclature_modifier_options FOR SELECT TO anon USING (true);
CREATE POLICY mod_opts_auth_full ON nomenclature_modifier_options FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 7 standard allergen tags (group='allergen' — enum value confirmed in tags.tag_group)
-- Schema verified 2026-05-17: tags has columns (id, slug, name, name_th, tag_group, color, sort_order)
INSERT INTO tags (slug, name, name_th, tag_group, sort_order) VALUES
  ('gluten',    'Gluten',    'กลูเตน',         'allergen', 10),
  ('dairy',     'Dairy',     'นม',             'allergen', 20),
  ('nuts',      'Nuts',      'ถั่ว',            'allergen', 30),
  ('shellfish', 'Shellfish', 'อาหารทะเลเปลือกแข็ง', 'allergen', 40),
  ('soy',       'Soy',       'ถั่วเหลือง',         'allergen', 50),
  ('egg',       'Egg',       'ไข่',              'allergen', 60),
  ('sesame',    'Sesame',    'งา',              'allergen', 70)
ON CONFLICT (slug) DO NOTHING;
```

> **Extended 2026-05-18 by lego-flow PR A** ([design](2026-05-17-lego-bowl-flow-design.md) §4.2 / mig 194). `nomenclature_modifier_options` gains 5 columns:
> - `slot TEXT CHECK IN ('base','protein','greens','topping','sauce')` — universal slot grouping
> - `quantity_per_unit NUMERIC NOT NULL DEFAULT 1` — BOM-deduction multiplier for MOD-* per order unit
> - `loyverse_modifier_id TEXT` (unique partial) — Loyverse option id, joined against `receipt.line.modifiers[].id`
> - `loyverse_modifier_list_id TEXT` — Loyverse list this option belongs to
> - `loyverse_modifier_list_name TEXT` — snapshot of list name at last pull

### 4.6 Migration `184_v_dish_assembly_components.sql`

```sql
CREATE OR REPLACE VIEW v_dish_assembly_components AS
SELECT
  bs.parent_id          AS dish_id,
  c.id                  AS component_id,
  c.product_code        AS component_code,
  c.name                AS component_name,
  c.type                AS component_type,
  bs.quantity_per_unit  AS qty_per_portion,
  c.base_unit,
  bs.slot,
  bs.notes
FROM bom_structures bs
JOIN nomenclature parent ON parent.id = bs.parent_id
JOIN nomenclature c      ON c.id      = bs.ingredient_id
WHERE parent.product_code LIKE 'SALE-%'
  AND c.product_code ~ '^(PF|MOD)-'
ORDER BY bs.parent_id, COALESCE(bs.slot, 'zzz'), c.name;

GRANT SELECT ON v_dish_assembly_components TO anon, authenticated;
```

> **Slot vocab swapped 2026-05-18 by lego-flow PR A** ([design](2026-05-17-lego-bowl-flow-design.md) §4.1 / mig 193). `bom_structures.slot` CHECK constraint changed from `(base/protein/finish/accent/dressing)` (set in mig 145) to `(base/protein/greens/topping/sauce)`. Two existing prod rows were remapped: `accent → topping`, `finish → topping`. `dressing → sauce` mapping is included for completeness even though no `dressing` rows existed. The view above (line `bs.slot`) reads whichever vocabulary is current — no view change was needed.

## 5. RPC Functions

```sql
-- Atomic save: nomenclature fields + dish_card + version bump + verified pointer
fn_dish_card_save(p_dish_id UUID, p_payload JSONB) RETURNS JSONB
  -- payload keys: customer_description, customer_short_name, customer_photo_url,
  --               assembler_note, merrychef_program, dish_card: {...}, expected_version
  -- returns: { ok, new_version, conflict?: { current_version } }

fn_pf_pack_card_save(p_pf_id UUID, p_payload JSONB) RETURNS JSONB
  -- payload keys: kitchen_note, pf_pack_card: {...}, expected_version
  -- returns: { ok, new_version, conflict?: { current_version } }

fn_dish_allergens(p_dish_id UUID) RETURNS TEXT[]
  -- walks BOM tree, collects tags WHERE tag_group='allergen' from all descendants
  -- UNION with direct tags on the dish itself
  -- returns: sorted array of allergen slugs

fn_loyverse_sync_dish(p_dish_id UUID) RETURNS JSONB
  -- prepares Loyverse item payload (customer_short_name, customer_description+allergen suffix,
  -- customer_photo_url, price). Does NOT push — returns payload for caller.
```

## 6. UI Structure

### 6.1 `/menu` page-level view toggle (4 views)

```
┌─ /menu ────────────────────────────────────────┐
│ [Owner] [L1 Cook] [L2 Assembler] [Customer]    │  ← toggle
├────────────────────────────────────────────────┤
│ (view-specific list of dishes)                  │
└────────────────────────────────────────────────┘
```

#### Owner view (extends existing table)
- Existing cost/margin/scorecard columns
- New: `version` badge, `last_verified_by` avatar
- New: completeness indicator (4 dots: customer/cook/assembler/HACCP — gray=empty, green=filled)
- Inline-edit on `price`, `is_available`, `is_featured`, `customer_short_name`
- "Open card" button → drawer

#### L1 Cook view (new) — list of PF
- Filter `type='good' AND product_code LIKE 'PF-%'`
- Card per PF showing recipes_flow step count, batch yield, pack format summary, storage, HACCP CCP count, kitchen_note preview, "Open card" button

#### L2 Assembler view (new) — list of SALE
- Filter `type='dish' AND product_code LIKE 'SALE-%'`
- Card per SALE showing container, assembly_components per portion, assembly_order summary, Merrychef program 1-liner, pre/post checks, assembler_note preview, "Open card" button

#### Customer view (extends existing card grid)
- Existing photo + description + KBJU cards
- New: allergen badge row
- New: modifier chips ("+chicken +50฿")
- New: ETA pill

### 6.2 Dish drawer (new)

Opens right-side, ~640px wide. Tab nav at top, header with dish name. Save button bumps `card_version`, writes `last_verified_at` + `last_verified_by`.

Tabs: `[Customer] [L1 Cook] [L2 Assembler] [Owner]`

Per-tab contents detailed in spec sections.

For PF-* drawer:
- Customer tab: hidden
- L2 Assembler tab: hidden
- L1 Cook tab: full (kitchen_note + pf_pack_card + recipes_flow editor with CCP toggle)
- Owner tab: cost rollup + version + ttc_source_url

For SALE-* drawer:
- Customer tab: full
- L1 Cook tab: read-only links to underlying PF cards
- L2 Assembler tab: full
- Owner tab: cost rollup + scorecard + version + ttc_source_url + Loyverse push action

### 6.3 File structure

```
apps/admin-panel/src/routes/menu/
  MenuPage.tsx                ← view toggle + view router
  views/
    OwnerView.tsx
    L1CookView.tsx
    L2AssemblerView.tsx
    CustomerView.tsx
  drawer/
    DishDrawer.tsx            ← shell + tab nav + Save&verify
    tabs/
      CustomerTab.tsx
      L1CookTab.tsx
      L2AssemblerTab.tsx
      OwnerTab.tsx
    sections/
      PackCardForm.tsx
      RecipeFlowEditor.tsx
      MerrychefProgramForm.tsx
      ModifierSlotsEditor.tsx
      AllergenPicker.tsx
      AssemblyOrderEditor.tsx
      PhotoUpload.tsx
  hooks/
    useDishCard.ts
    usePfPackCard.ts
    useModifierOptions.ts
    useAllergens.ts
    useDishesEnriched.ts      ← extend existing
```

## 7. Data Flow & Invariants

### Save flow

1. User edits drawer fields → local form state (no DB writes)
2. Click **Save & verify**:
   - Client sends `fn_dish_card_save(dish_id, {...payload, expected_version: N})`
   - RPC begins transaction:
     - Check `nomenclature.card_version == N` (optimistic lock)
     - If mismatch → return `{conflict: {current_version}}` → toast "Someone edited, reload"
     - UPDATE `nomenclature` set fields + `card_version = N+1` + `last_verified_at=now()` + `last_verified_by=auth.uid()`
     - UPSERT `dish_card` / `pf_pack_card`
   - Commit, return `{ok, new_version}`
3. Client refreshes drawer with new version

### Photo upload

- Supabase Storage bucket `dish-photos` (new)
- Path: `{photo_role}/{nomenclature_id}.{ext}` where photo_role ∈ {customer, assembler, kitchen}
- RLS: anon SELECT, authenticated INSERT/UPDATE/DELETE
- URL stored in respective `*_photo_url` column

### Composition (customer-facing)

- Default: derived from BOM tree (walks `bs.ingredient_id` → uses `nomenclature.name`)
- Override: `dish_card.composition_override` (editorial)
- UI shows source + diff-warning when BOM changes after override is set

### Allergens (customer-facing)

- Derived: `fn_dish_allergens(dish_id)` walks BOM, collects tags WHERE `tag_group='allergen'`
- Manual: direct tags on SALE dish via `nomenclature_tags`
- UI shows both with origin label ("inherited from PF-X" / "manual")

### Loyverse sync

- Triggered explicitly by Owner via "Push to Loyverse" action
- Payload prepared by `fn_loyverse_sync_dish`
- Fields synced: `customer_short_name` (fallback `name`), `customer_description` + allergen suffix, `customer_photo_url`, `price`
- All other fields stay internal

## 8. Edge Cases

| Case | Resolution |
|------|------------|
| SALE without PF (RAW+MOD only) | `dish_card` exists; `pf_pack_card` absent. L1 tab shows "No PF underlying". |
| PF used by N SALE | `pf_pack_card` 1:1 with PF; read by all SALE via JOIN. |
| MOD-* item | No own card. Appears as chip in Customer view, normal row in Owner view. |
| Dish archived (`is_available=false`) | Card persists. Owner toggle "Show archived". |
| BOM changes after `composition_override` | Diff warning in drawer Customer tab: "BOM changed — edit or regenerate?" |
| Concurrent edits | Optimistic lock via `expected_version`. On conflict, toast + force reload. |
| Photo missing | UI fallback: ChefHat icon on slate-700 background. |
| Empty `merrychef_program` for SALE | Warning in L2 Assembler tab: "No Merrychef program defined". |
| All description fields empty | Owner row indicator: 4 gray dots. Filter "Only incomplete". |
| Duplicate modifier in `modifier_options` | `UNIQUE (dish_id, modifier_id)` rejects. |
| Allergen tag order in Loyverse | Alphabetical sort for determinism. |
| Delete PF referenced by SALE | FK `ON DELETE RESTRICT` blocks (already standard in `bom_structures`). |

## 9. Migration Plan

Order: 179 → 180 → 181 → 182 → 183 → 184. Each idempotent (`IF NOT EXISTS` / `ON CONFLICT DO NOTHING`).

| # | File | Purpose |
|---|------|---------|
| 179 | `dish_card_table.sql` | New L2 Assembler 1:1 table |
| 180 | `pf_pack_card_table.sql` | New L1 Pack 1:1 table |
| 181 | `nomenclature_card_extension.sql` | 10 new cross-cutting columns (absorbs MC `e696afe3` + `68dbc8ec`) |
| 182 | `recipes_flow_haccp_ccp.sql` | CCP flag + check_text on recipe steps |
| 183 | `modifier_options_and_allergens.sql` | New m2m + 7 allergen tags |
| 184 | `v_dish_assembly_components.sql` | Derived view for L2 composition |

After all 6 applied: close MC `e696afe3` and `68dbc8ec` with comment "absorbed by menu-card-full spec."

## 10. MC Task Breakdown

Umbrella + children:

```
MC-MENU-CARD-UMBRELLA (epic, parent)
├── MC-MIG-179 ─ Create dish_card table + type guard
├── MC-MIG-180 ─ Create pf_pack_card table + type guard
├── MC-MIG-181 ─ Extend nomenclature with 10 columns (absorbs e696afe3, 68dbc8ec)
├── MC-MIG-182 ─ Add HACCP CCP to recipes_flow + seed
├── MC-MIG-183 ─ modifier_options m2m + 7 allergen tags
├── MC-MIG-184 ─ v_dish_assembly_components view
├── MC-RPC ────── 4 RPC functions (dish_card_save, pf_pack_card_save, allergens, loyverse_sync)
├── MC-UI-DRAWER ─ DishDrawer shell + 4 tabs + Save&verify (large)
├── MC-UI-L1 ─── L1 Cook list view
├── MC-UI-L2 ─── L2 Assembler list view
├── MC-UI-CUST ─ Customer view extension (allergens, modifiers, photo, ETA)
├── MC-UI-OWN ── Owner view extension (version, verified-by, completeness indicator)
├── MC-PHOTO ─── Storage bucket dish-photos + upload UI
└── MC-LOYV-PUSH ─ fn_loyverse_sync_dish + Owner action button
```

~10 child tasks + 6 migrations. Estimate: 2-3 sprints.

## 11. Open Decisions Confirmed in CEO Brainstorm 2026-05-17

1. **4 roles in v1** (Owner, L1 Cook, L2 Assembler, Customer). Packer deferred until L2 volume warrants.
2. **Approach B** (domain split) over flat or JSONB.
3. **All 17 conceptual fields** in v1 (33 atomic columns).
4. **Explicit Save & verify** for version bump (no auto-bump on edit).
5. **Both composition sources** (BOM-derived default + editorial override).
6. **Modifier slots in v1** (despite being POS-feature) because customer-view needs them.

## 12. Out of Scope (Deferred)

- Per-role RLS (waits for User Management UI `6e4b56bf`)
- Version history table (only counter + last-verified pointer)
- i18n framework
- Loyverse auto-push on verify (explicit only)
- Packer role as distinct UI surface
- Cross-contamination tracking beyond allergen tags
- Video walkthroughs / training assets
- Photo recognition / AI-assisted card filling
- Audit log table for dish_card / pf_pack_card / nomenclature changes (only `card_version` + `last_verified_*` in v1)

## 13. References

- **Shishka POS System Map v1.0** (memory: `project_shishka_pos_system_map.md`) — 7-stage operating model
- **Operations bible** (`docs/bible/operations.md`) — L1 zones, cook-chill algorithm
- **Kitchen stock model** (memory: `project_kitchen_stock_model.md`) — batch production, not cook-to-order
- **CONTEXT.md** (`/menu` project) — existing tech stack constraints (Vite + React 19 + RR7, no new deps)
- Existing migrations: `074_recipes_flow_v2.sql`, `124_bom_and_recipes_full.sql`, `147_dish_scorecard.sql`
- MC tasks absorbed: `e696afe3`, `68dbc8ec`

## 14. Approval Trail

- 2026-05-17 — CEO approved scope (4 roles + Approach B + full coverage)
- 2026-05-17 — CEO approved schema mapping (Section 1)
- 2026-05-17 — CEO approved UI structure (Section 2)
- 2026-05-17 — CEO approved data flow + edge cases (Section 3)
- 2026-05-17 — Spec written to this file, awaiting CEO file review before plan phase
