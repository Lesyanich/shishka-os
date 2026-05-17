# Menu Card — Data Layer Implementation Plan (Phase 1 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the database backend (6 migrations + 1 view + 4 RPCs) for the Menu Card spec so the UI layer (Phase 2) has a working API to call.

**Architecture:** Approach B (domain split): extend `nomenclature` + `recipes_flow` for cross-cutting fields; new tables `dish_card` (SALE 1:1) and `pf_pack_card` (PF 1:1) for role-specific fields; reuse `tags` for allergens (enum `tag_group='allergen'` already exists); new m2m `nomenclature_modifier_options`; derived view `v_dish_assembly_components`; 4 RPCs for atomic save with optimistic locking and derived reads.

**Tech Stack:** PostgreSQL 17.6 (Supabase ap-south-1), plpgsql, JSONB CHECK constraints, RLS, Supabase Realtime publication, `auth.users(id)` for verified-by FK.

**Source spec:** [docs/superpowers/specs/2026-05-17-menu-card-full-design.md](../specs/2026-05-17-menu-card-full-design.md)

---

## Conventions and shared environment

**Before starting:** ensure DB URL is fetchable from Keychain:
```bash
DB_URL=$(security find-generic-password -s "shishka-database-url" -w)
[ -n "$DB_URL" ] && echo "DB_URL OK" || echo "MISSING — abort"
```

**Apply pattern (every migration):**
```bash
psql "$DB_URL" -f services/supabase/migrations/NNN_name.sql
```

**Verify pattern (after every migration):**
```bash
psql "$DB_URL" -c "SELECT filename FROM migration_log WHERE filename = 'NNN_name.sql';"
# Expected: one row returned
```

**Commit pattern (every migration is its own commit):**
```bash
git add services/supabase/migrations/NNN_name.sql
git commit -m "feat(menu): mig NNN — <short desc>"
```

---

## File Structure

This phase creates/modifies:

| Path | Action | Responsibility |
|------|--------|----------------|
| `services/supabase/migrations/179_dish_card_table.sql` | Create | New table `dish_card` (1:1 SALE-*) for L2 Assembler structured fields |
| `services/supabase/migrations/180_pf_pack_card_table.sql` | Create | New table `pf_pack_card` (1:1 PF-*) for L1 pack/storage fields |
| `services/supabase/migrations/181_nomenclature_card_extension.sql` | Create | 10 new columns on `nomenclature` (absorbs MC e696afe3 + 68dbc8ec) |
| `services/supabase/migrations/182_recipes_flow_haccp_ccp.sql` | Create | `is_ccp` + `ccp_check_text` on `recipes_flow` + seed chicken/blast steps |
| `services/supabase/migrations/183_modifier_options_and_allergens.sql` | Create | m2m `nomenclature_modifier_options` + 7 allergen tags |
| `services/supabase/migrations/184_v_dish_assembly_components.sql` | Create | View walking BOM for SALE → direct PF/MOD children |
| `services/supabase/migrations/185_rpc_dish_card_save.sql` | Create | `fn_dish_card_save` atomic save + version bump + optimistic lock |
| `services/supabase/migrations/186_rpc_pf_pack_card_save.sql` | Create | `fn_pf_pack_card_save` same pattern for PF |
| `services/supabase/migrations/187_rpc_dish_allergens.sql` | Create | `fn_dish_allergens` BOM-tree allergen walk |
| `services/supabase/migrations/188_rpc_loyverse_sync_dish.sql` | Create | `fn_loyverse_sync_dish` builds Loyverse payload (no push) |

Total: 10 new files, all under `services/supabase/migrations/`.

---

## Task 1: Migration 179 — `dish_card` table

**Files:**
- Create: `services/supabase/migrations/179_dish_card_table.sql`

- [ ] **Step 1: Verify latest migration number is 178**

Run:
```bash
ls services/supabase/migrations/ | sort | tail -3
```
Expected output includes `178_cleanup_hash_coded_nomenclature.sql` as the last file. If there is already a `179_*.sql`, ABORT and use the next available number — adjust subsequent task numbers in this plan as well.

- [ ] **Step 2: Write migration file**

Create `services/supabase/migrations/179_dish_card_table.sql` with this exact content:

```sql
-- Migration 179: dish_card — L2 Assembler 1:1 extension for SALE-* dishes
-- Source spec: docs/superpowers/specs/2026-05-17-menu-card-full-design.md §4.2
-- Carries: container_l2, assembly_order, pre/post Merrychef checks, cold add-ons,
--          cutlery/sticker flags, assembler photo, customer ETA, composition override.

BEGIN;

CREATE TABLE IF NOT EXISTS public.dish_card (
  nomenclature_id           UUID PRIMARY KEY REFERENCES nomenclature(id) ON DELETE CASCADE,
  container_l2              TEXT,
  assembly_order            JSONB,
  pre_merrychef_prep        TEXT,
  post_merrychef_check      TEXT,
  cold_addons_after_reheat  TEXT,
  has_cutlery               BOOLEAN NOT NULL DEFAULT false,
  has_lid_sticker           BOOLEAN NOT NULL DEFAULT false,
  assembler_photo_url       TEXT,
  customer_eta_min          INT,
  composition_override      TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- assembly_order JSONB shape check
ALTER TABLE public.dish_card
  DROP CONSTRAINT IF EXISTS chk_assembly_order_shape;
ALTER TABLE public.dish_card
  ADD CONSTRAINT chk_assembly_order_shape CHECK (
    assembly_order IS NULL OR (
      jsonb_typeof(assembly_order) = 'array'
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(assembly_order) e
        WHERE NOT (e ? 'step' AND e ? 'text')
      )
    )
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

DROP TRIGGER IF EXISTS trg_dish_card_type_guard ON public.dish_card;
CREATE TRIGGER trg_dish_card_type_guard
  BEFORE INSERT OR UPDATE OF nomenclature_id ON public.dish_card
  FOR EACH ROW EXECUTE FUNCTION fn_dish_card_type_guard();

-- updated_at auto-bump
CREATE OR REPLACE FUNCTION fn_dish_card_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_dish_card_updated_at ON public.dish_card;
CREATE TRIGGER trg_dish_card_updated_at
  BEFORE UPDATE ON public.dish_card
  FOR EACH ROW EXECUTE FUNCTION fn_dish_card_updated_at();

-- RLS: anon SELECT (for future POS preview), authenticated ALL
ALTER TABLE public.dish_card ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dish_card_anon_read ON public.dish_card;
CREATE POLICY dish_card_anon_read ON public.dish_card
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS dish_card_auth_full ON public.dish_card;
CREATE POLICY dish_card_auth_full ON public.dish_card
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'dish_card'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.dish_card;
  END IF;
END $$;

COMMENT ON TABLE public.dish_card IS 'L2 Assembler 1:1 extension for SALE-* dishes — plating, container, Merrychef pre/post, customer ETA.';

-- Register
INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '179_dish_card_table.sql',
  'claude-code',
  'New dish_card table (1:1 with SALE-* nomenclature). Carries L2 Assembler structured fields per menu-card-full spec.'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
```

- [ ] **Step 3: Apply migration**

Run:
```bash
DB_URL=$(security find-generic-password -s "shishka-database-url" -w)
psql "$DB_URL" -f services/supabase/migrations/179_dish_card_table.sql
```
Expected: `BEGIN`, `CREATE TABLE`, `ALTER TABLE`, `CREATE FUNCTION`, `CREATE TRIGGER`, `INSERT 0 1`, `COMMIT` lines. No `ERROR`.

- [ ] **Step 4: Verify table + trigger + RLS exist**

Run:
```bash
psql "$DB_URL" -t -A -c "
SELECT 'table=' || count(*) FROM information_schema.tables
  WHERE table_schema='public' AND table_name='dish_card';
SELECT 'cols=' || count(*) FROM information_schema.columns
  WHERE table_schema='public' AND table_name='dish_card';
SELECT 'trig=' || count(*) FROM information_schema.triggers
  WHERE event_object_table='dish_card';
SELECT 'rls=' || relrowsecurity FROM pg_class WHERE relname='dish_card';
SELECT 'mig_log=' || count(*) FROM migration_log WHERE filename='179_dish_card_table.sql';
"
```
Expected:
```
table=1
cols=13
trig=2
rls=t
mig_log=1
```

- [ ] **Step 5: Verify SALE-only guard works**

Run:
```bash
psql "$DB_URL" -c "
-- Should FAIL with type guard error (use a RAW-* row)
INSERT INTO dish_card (nomenclature_id)
SELECT id FROM nomenclature WHERE product_code LIKE 'RAW-%' LIMIT 1;
" 2>&1 | grep -E "(must reference SALE)" && echo "GUARD OK"
```
Expected: line ending `GUARD OK`.

- [ ] **Step 6: Commit**

```bash
git add services/supabase/migrations/179_dish_card_table.sql
git commit -m "feat(menu): mig 179 — dish_card table for L2 Assembler fields"
```

---

## Task 2: Migration 180 — `pf_pack_card` table

**Files:**
- Create: `services/supabase/migrations/180_pf_pack_card_table.sql`

- [ ] **Step 1: Write migration file**

Create `services/supabase/migrations/180_pf_pack_card_table.sql`:

```sql
-- Migration 180: pf_pack_card — L1 Pack/Storage 1:1 extension for PF-* items
-- Source spec: docs/superpowers/specs/2026-05-17-menu-card-full-design.md §4.3
-- Carries: batch yield, vacuum bag format, label template, shelf life, storage zone/temp, good-batch photo.

BEGIN;

CREATE TABLE IF NOT EXISTS public.pf_pack_card (
  nomenclature_id        UUID PRIMARY KEY REFERENCES nomenclature(id) ON DELETE CASCADE,
  batch_input_qty        NUMERIC,
  batch_input_uom        TEXT,
  portions_per_batch     NUMERIC,
  portion_weight_g       NUMERIC,
  vacuum_bag_size        TEXT,
  fill_weight_per_bag_g  NUMERIC,
  portions_per_bag       NUMERIC,
  label_template         JSONB,
  shelf_life_days        INT,
  storage_zone           TEXT,
  storage_temp_min_c     NUMERIC,
  storage_temp_max_c     NUMERIC,
  kitchen_photo_url      TEXT,
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

DROP TRIGGER IF EXISTS trg_pf_pack_card_type_guard ON public.pf_pack_card;
CREATE TRIGGER trg_pf_pack_card_type_guard
  BEFORE INSERT OR UPDATE OF nomenclature_id ON public.pf_pack_card
  FOR EACH ROW EXECUTE FUNCTION fn_pf_pack_card_type_guard();

CREATE OR REPLACE FUNCTION fn_pf_pack_card_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pf_pack_card_updated_at ON public.pf_pack_card;
CREATE TRIGGER trg_pf_pack_card_updated_at
  BEFORE UPDATE ON public.pf_pack_card
  FOR EACH ROW EXECUTE FUNCTION fn_pf_pack_card_updated_at();

ALTER TABLE public.pf_pack_card ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pf_pack_card_anon_read ON public.pf_pack_card;
CREATE POLICY pf_pack_card_anon_read ON public.pf_pack_card
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS pf_pack_card_auth_full ON public.pf_pack_card;
CREATE POLICY pf_pack_card_auth_full ON public.pf_pack_card
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='pf_pack_card'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.pf_pack_card;
  END IF;
END $$;

COMMENT ON TABLE public.pf_pack_card IS 'L1 Cook 1:1 extension for PF-* items — batch yield, vacuum pack format, storage, label template.';

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '180_pf_pack_card_table.sql',
  'claude-code',
  'New pf_pack_card table (1:1 with PF-* nomenclature). Carries L1 pack/storage fields per menu-card-full spec.'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
```

- [ ] **Step 2: Apply**

```bash
DB_URL=$(security find-generic-password -s "shishka-database-url" -w)
psql "$DB_URL" -f services/supabase/migrations/180_pf_pack_card_table.sql
```
Expected: clean run, no ERROR.

- [ ] **Step 3: Verify table + guards**

```bash
psql "$DB_URL" -t -A -c "
SELECT 'table=' || count(*) FROM information_schema.tables WHERE table_name='pf_pack_card';
SELECT 'cols=' || count(*) FROM information_schema.columns WHERE table_name='pf_pack_card';
SELECT 'trig=' || count(*) FROM information_schema.triggers WHERE event_object_table='pf_pack_card';
SELECT 'rls=' || relrowsecurity FROM pg_class WHERE relname='pf_pack_card';
"
```
Expected:
```
table=1
cols=16
trig=2
rls=t
```

- [ ] **Step 4: Verify PF-only guard rejects RAW**

```bash
psql "$DB_URL" -c "
INSERT INTO pf_pack_card (nomenclature_id)
SELECT id FROM nomenclature WHERE product_code LIKE 'RAW-%' LIMIT 1;
" 2>&1 | grep -E "must reference PF" && echo "GUARD OK"
```
Expected: `GUARD OK`.

- [ ] **Step 5: Commit**

```bash
git add services/supabase/migrations/180_pf_pack_card_table.sql
git commit -m "feat(menu): mig 180 — pf_pack_card table for L1 pack/storage fields"
```

---

## Task 3: Migration 181 — `nomenclature` card extension (absorbs MC e696afe3 + 68dbc8ec)

**Files:**
- Create: `services/supabase/migrations/181_nomenclature_card_extension.sql`

- [ ] **Step 1: Snapshot pre-state column count**

```bash
DB_URL=$(security find-generic-password -s "shishka-database-url" -w)
psql "$DB_URL" -t -A -c "SELECT count(*) FROM information_schema.columns WHERE table_name='nomenclature';"
```
Record the number (call it N_PRE).

- [ ] **Step 2: Write migration**

Create `services/supabase/migrations/181_nomenclature_card_extension.sql`:

```sql
-- Migration 181: nomenclature card extension
-- Source spec: docs/superpowers/specs/2026-05-17-menu-card-full-design.md §4.1
-- Absorbs MC e696afe3 (3 desc fields) and MC 68dbc8ec (merrychef_program).
-- Adds 10 cross-cutting card fields: 3 descriptions, 2 customer-facing, merrychef program,
-- TTC link, version counter, last-verified pointer (at + by).

BEGIN;

ALTER TABLE public.nomenclature
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

-- merrychef_program JSONB shape: must have temp_c + time_sec when present
ALTER TABLE public.nomenclature
  DROP CONSTRAINT IF EXISTS chk_merrychef_program_shape;
ALTER TABLE public.nomenclature
  ADD CONSTRAINT chk_merrychef_program_shape CHECK (
    merrychef_program IS NULL OR (
      jsonb_typeof(merrychef_program) = 'object'
      AND (merrychef_program ? 'temp_c')
      AND (merrychef_program ? 'time_sec')
    )
  );

-- card_version monotonicity (cannot decrease)
CREATE OR REPLACE FUNCTION fn_card_version_monotonic()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.card_version < OLD.card_version THEN
    RAISE EXCEPTION 'card_version cannot decrease (was %, attempt %)', OLD.card_version, NEW.card_version;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_card_version_monotonic ON public.nomenclature;
CREATE TRIGGER trg_card_version_monotonic
  BEFORE UPDATE OF card_version ON public.nomenclature
  FOR EACH ROW EXECUTE FUNCTION fn_card_version_monotonic();

COMMENT ON COLUMN public.nomenclature.customer_description IS 'POS/website-facing description (only field synced to Loyverse description).';
COMMENT ON COLUMN public.nomenclature.customer_short_name  IS 'Short POS button label; falls back to name if NULL.';
COMMENT ON COLUMN public.nomenclature.customer_photo_url   IS 'Public URL to dish-photos bucket — customer-facing photo.';
COMMENT ON COLUMN public.nomenclature.assembler_note       IS 'L2 Assembler freeform note: critical reminders during assembly.';
COMMENT ON COLUMN public.nomenclature.kitchen_note         IS 'L1 Cook freeform note: critical reminders during production.';
COMMENT ON COLUMN public.nomenclature.merrychef_program    IS 'JSONB {temp_c, time_sec, fan_pct, microwave_pct, notes} — Merrychef preset.';
COMMENT ON COLUMN public.nomenclature.ttc_source_url       IS 'External link to source TTC document (GDrive / Notion).';
COMMENT ON COLUMN public.nomenclature.card_version         IS 'Monotonic version counter — bumped on every Save & Verify.';
COMMENT ON COLUMN public.nomenclature.last_verified_at     IS 'Timestamp of last Save & Verify action.';
COMMENT ON COLUMN public.nomenclature.last_verified_by     IS 'auth.users(id) of the user who last verified this card.';

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '181_nomenclature_card_extension.sql',
  'claude-code',
  '10 new card columns on nomenclature. Absorbs MC e696afe3 (3 desc fields) + MC 68dbc8ec (merrychef_program).'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
```

- [ ] **Step 3: Apply**

```bash
psql "$DB_URL" -f services/supabase/migrations/181_nomenclature_card_extension.sql
```
Expected: clean run.

- [ ] **Step 4: Verify 10 new columns + trigger + check constraint**

```bash
psql "$DB_URL" -t -A -c "
SELECT 'cols_added=' || count(*) FROM information_schema.columns
  WHERE table_name='nomenclature'
  AND column_name IN ('customer_description','customer_short_name','customer_photo_url',
                      'assembler_note','kitchen_note','merrychef_program','ttc_source_url',
                      'card_version','last_verified_at','last_verified_by');
SELECT 'trig=' || count(*) FROM information_schema.triggers
  WHERE trigger_name='trg_card_version_monotonic';
SELECT 'chk=' || count(*) FROM information_schema.check_constraints
  WHERE constraint_name='chk_merrychef_program_shape';
"
```
Expected:
```
cols_added=10
trig=1
chk=1
```

- [ ] **Step 5: Verify merrychef_program CHECK rejects bad shape**

```bash
psql "$DB_URL" -c "
UPDATE nomenclature SET merrychef_program = '{\"foo\":1}'::jsonb
WHERE product_code LIKE 'SALE-%' LIMIT 1;
" 2>&1 | grep -E "(chk_merrychef_program_shape|check constraint)" && echo "CHECK OK"
```
Expected: `CHECK OK`.

- [ ] **Step 6: Verify version monotonicity rejects decrease**

Pick any SALE row and try to set its version to 0:
```bash
psql "$DB_URL" -c "
UPDATE nomenclature SET card_version = 0
WHERE product_code LIKE 'SALE-%' LIMIT 1;
" 2>&1 | grep -E "card_version cannot decrease" && echo "MONOTONIC OK"
```
Expected: `MONOTONIC OK`.

- [ ] **Step 7: Close absorbed MC tasks**

Run via mission-control MCP (or psql if not authenticated):
```bash
# Close MC e696afe3 and 68dbc8ec with absorption note.
# If using mcp__shishka-mission-control: call update_task with status='done' + add_comment.
# Manual SQL fallback:
psql "$DB_URL" -c "
UPDATE business_tasks SET status='done', completed_at=now(),
  notes=COALESCE(notes,'') || E'\nAbsorbed by mig 181 in menu-card-full spec on '|| now()::date
WHERE id IN ('e696afe3-2568-47f8-8ae4-260058fcbef3', '68dbc8ec-8a80-4dcd-9b53-cdb66daf03ef');
"
```

- [ ] **Step 8: Commit**

```bash
git add services/supabase/migrations/181_nomenclature_card_extension.sql
git commit -m "feat(menu): mig 181 — 10 card columns on nomenclature (absorbs MC e696afe3 + 68dbc8ec)"
```

---

## Task 4: Migration 182 — HACCP CCP on `recipes_flow`

**Files:**
- Create: `services/supabase/migrations/182_recipes_flow_haccp_ccp.sql`

- [ ] **Step 1: Write migration**

Create `services/supabase/migrations/182_recipes_flow_haccp_ccp.sql`:

```sql
-- Migration 182: recipes_flow HACCP critical control points
-- Source spec: docs/superpowers/specs/2026-05-17-menu-card-full-design.md §4.4
-- Adds is_ccp flag + ccp_check_text per step. Seeds existing chicken-grill probe + blast-chill as CCPs.

BEGIN;

ALTER TABLE public.recipes_flow
  ADD COLUMN IF NOT EXISTS is_ccp          BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ccp_check_text  TEXT;

-- ccp_check_text required when is_ccp=true
ALTER TABLE public.recipes_flow
  DROP CONSTRAINT IF EXISTS chk_ccp_text_when_ccp;
ALTER TABLE public.recipes_flow
  ADD CONSTRAINT chk_ccp_text_when_ccp CHECK (
    NOT is_ccp OR ccp_check_text IS NOT NULL
  );

CREATE INDEX IF NOT EXISTS idx_recipes_flow_ccp
  ON public.recipes_flow(nomenclature_id) WHERE is_ccp = true;

-- Seed: defensive backfill per RULE-MIGRATION-COLUMN-EXISTENCE.
-- Only update if the rows exist + the new columns are present (always true after the ALTERs above).
UPDATE public.recipes_flow
SET is_ccp = true,
    ccp_check_text = 'Probe must read >= 74 C in thickest part before transferring to chill.'
WHERE operation_name = 'Grilling'
  AND internal_temp_c = 74
  AND ccp_check_text IS NULL;

UPDATE public.recipes_flow
SET is_ccp = true,
    ccp_check_text = 'Core temperature must reach <= 4 C within 90 minutes.'
WHERE operation_name = 'Blast Chilling'
  AND ccp_check_text IS NULL;

COMMENT ON COLUMN public.recipes_flow.is_ccp IS 'HACCP Critical Control Point flag — step requires explicit cook verification before proceeding.';
COMMENT ON COLUMN public.recipes_flow.ccp_check_text IS 'What the cook must verify and log (e.g. probe reading, core temp).';

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '182_recipes_flow_haccp_ccp.sql',
  'claude-code',
  'HACCP CCP flag + check_text on recipes_flow steps. Seeds chicken-grill probe + blast-chill steps as CCPs.'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
```

- [ ] **Step 2: Apply**

```bash
psql "$DB_URL" -f services/supabase/migrations/182_recipes_flow_haccp_ccp.sql
```
Expected: clean run. The `UPDATE` lines should report a small row count (probably 1 each, depending on current seed data).

- [ ] **Step 3: Verify columns + seed**

```bash
psql "$DB_URL" -t -A -c "
SELECT 'cols=' || count(*) FROM information_schema.columns
  WHERE table_name='recipes_flow' AND column_name IN ('is_ccp','ccp_check_text');
SELECT 'idx=' || count(*) FROM pg_indexes
  WHERE indexname='idx_recipes_flow_ccp';
SELECT 'ccp_count=' || count(*) FROM recipes_flow WHERE is_ccp = true;
"
```
Expected:
```
cols=2
idx=1
ccp_count=2     -- or more if multiple chicken recipes exist
```

- [ ] **Step 4: Verify CHECK rejects is_ccp=true without text**

```bash
psql "$DB_URL" -c "
-- Pick any non-CCP row, try to flag it without providing check text
WITH target AS (
  SELECT id FROM recipes_flow WHERE is_ccp = false LIMIT 1
)
UPDATE recipes_flow SET is_ccp = true WHERE id IN (SELECT id FROM target);
" 2>&1 | grep -E "chk_ccp_text_when_ccp" && echo "CHECK OK"
```
Expected: `CHECK OK`.

- [ ] **Step 5: Commit**

```bash
git add services/supabase/migrations/182_recipes_flow_haccp_ccp.sql
git commit -m "feat(menu): mig 182 — HACCP CCP flag on recipes_flow + seed chicken/blast steps"
```

---

## Task 5: Migration 183 — modifier options + allergen tags

**Files:**
- Create: `services/supabase/migrations/183_modifier_options_and_allergens.sql`

- [ ] **Step 1: Verify tags schema + enum (sanity)**

```bash
psql "$DB_URL" -t -A -c "
SELECT column_name FROM information_schema.columns
WHERE table_name='tags' ORDER BY ordinal_position;
SELECT '---enum---';
SELECT e.enumlabel FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid WHERE t.typname='tag_group';
"
```
Expected columns: `id, slug, name, name_th, tag_group, color, sort_order, created_at`. Enum must include `allergen`.

- [ ] **Step 2: Write migration**

Create `services/supabase/migrations/183_modifier_options_and_allergens.sql`:

```sql
-- Migration 183: nomenclature_modifier_options m2m + 7 allergen tags
-- Source spec: docs/superpowers/specs/2026-05-17-menu-card-full-design.md §4.5
-- - m2m: SALE-* dishes <-> MOD-* modifiers with price_delta + is_default + sort_order
-- - allergen tags: 7 standard slugs in existing tags table (group='allergen' enum already exists)

BEGIN;

CREATE TABLE IF NOT EXISTS public.nomenclature_modifier_options (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dish_id      UUID NOT NULL REFERENCES nomenclature(id) ON DELETE CASCADE,
  modifier_id  UUID NOT NULL REFERENCES nomenclature(id) ON DELETE RESTRICT,
  price_delta  NUMERIC NOT NULL DEFAULT 0,
  is_default   BOOLEAN NOT NULL DEFAULT false,
  sort_order   INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_dish_modifier UNIQUE (dish_id, modifier_id)
);

CREATE INDEX IF NOT EXISTS idx_modifier_options_dish
  ON public.nomenclature_modifier_options(dish_id);
CREATE INDEX IF NOT EXISTS idx_modifier_options_modifier
  ON public.nomenclature_modifier_options(modifier_id);

-- Type guard: dish_id -> SALE-*, modifier_id -> MOD-*
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

DROP TRIGGER IF EXISTS trg_modifier_options_type_guard ON public.nomenclature_modifier_options;
CREATE TRIGGER trg_modifier_options_type_guard
  BEFORE INSERT OR UPDATE ON public.nomenclature_modifier_options
  FOR EACH ROW EXECUTE FUNCTION fn_modifier_options_type_guard();

ALTER TABLE public.nomenclature_modifier_options ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mod_opts_anon_read ON public.nomenclature_modifier_options;
CREATE POLICY mod_opts_anon_read ON public.nomenclature_modifier_options
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS mod_opts_auth_full ON public.nomenclature_modifier_options;
CREATE POLICY mod_opts_auth_full ON public.nomenclature_modifier_options
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='nomenclature_modifier_options'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.nomenclature_modifier_options;
  END IF;
END $$;

-- 7 standard allergen tags. tag_group is an enum that already includes 'allergen'.
INSERT INTO public.tags (slug, name, name_th, tag_group, sort_order) VALUES
  ('gluten',    'Gluten',    'กลูเตน',             'allergen', 10),
  ('dairy',     'Dairy',     'นม',                 'allergen', 20),
  ('nuts',      'Nuts',      'ถั่ว',                'allergen', 30),
  ('shellfish', 'Shellfish', 'อาหารทะเลเปลือกแข็ง',  'allergen', 40),
  ('soy',       'Soy',       'ถั่วเหลือง',           'allergen', 50),
  ('egg',       'Egg',       'ไข่',                'allergen', 60),
  ('sesame',    'Sesame',    'งา',                 'allergen', 70)
ON CONFLICT (slug) DO NOTHING;

COMMENT ON TABLE public.nomenclature_modifier_options IS 'SALE dish <-> MOD modifier offerings shown to customer. price_delta added to dish price when selected.';

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '183_modifier_options_and_allergens.sql',
  'claude-code',
  'New m2m nomenclature_modifier_options + 7 allergen tags (gluten/dairy/nuts/shellfish/soy/egg/sesame).'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
```

- [ ] **Step 3: Apply**

```bash
psql "$DB_URL" -f services/supabase/migrations/183_modifier_options_and_allergens.sql
```
Expected: clean run.

- [ ] **Step 4: Verify table + allergen tag count**

```bash
psql "$DB_URL" -t -A -c "
SELECT 'mod_opts_table=' || count(*) FROM information_schema.tables
  WHERE table_name='nomenclature_modifier_options';
SELECT 'allergen_tags=' || count(*) FROM tags WHERE tag_group='allergen';
SELECT slug FROM tags WHERE tag_group='allergen' ORDER BY sort_order;
"
```
Expected:
```
mod_opts_table=1
allergen_tags=7
gluten
dairy
nuts
shellfish
soy
egg
sesame
```

- [ ] **Step 5: Verify type guards on m2m**

```bash
psql "$DB_URL" -c "
-- Should FAIL: passing a RAW as dish
INSERT INTO nomenclature_modifier_options (dish_id, modifier_id)
SELECT (SELECT id FROM nomenclature WHERE product_code LIKE 'RAW-%' LIMIT 1),
       (SELECT id FROM nomenclature WHERE product_code LIKE 'MOD-%' LIMIT 1);
" 2>&1 | grep -E "must reference SALE" && echo "GUARD-1 OK"
```
Expected: `GUARD-1 OK`.

```bash
psql "$DB_URL" -c "
-- Should FAIL: passing a RAW as modifier
INSERT INTO nomenclature_modifier_options (dish_id, modifier_id)
SELECT (SELECT id FROM nomenclature WHERE product_code LIKE 'SALE-%' LIMIT 1),
       (SELECT id FROM nomenclature WHERE product_code LIKE 'RAW-%' LIMIT 1);
" 2>&1 | grep -E "must reference MOD" && echo "GUARD-2 OK"
```
Expected: `GUARD-2 OK`.

- [ ] **Step 6: Commit**

```bash
git add services/supabase/migrations/183_modifier_options_and_allergens.sql
git commit -m "feat(menu): mig 183 — modifier_options m2m + 7 allergen tags"
```

---

## Task 6: Migration 184 — `v_dish_assembly_components` view

**Files:**
- Create: `services/supabase/migrations/184_v_dish_assembly_components.sql`

- [ ] **Step 1: Write migration**

Create `services/supabase/migrations/184_v_dish_assembly_components.sql`:

```sql
-- Migration 184: v_dish_assembly_components view
-- Source spec: docs/superpowers/specs/2026-05-17-menu-card-full-design.md §4.6
-- Returns direct BOM children for SALE-* parents that are PF-* or MOD-* (the things L2 assembler physically grabs).
-- L1 RAW ingredients are intentionally excluded — that's L1 Cook's concern, not L2.

BEGIN;

CREATE OR REPLACE VIEW public.v_dish_assembly_components AS
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
FROM public.bom_structures bs
JOIN public.nomenclature parent ON parent.id = bs.parent_id
JOIN public.nomenclature c      ON c.id      = bs.ingredient_id
WHERE parent.product_code LIKE 'SALE-%'
  AND c.product_code ~ '^(PF|MOD)-'
ORDER BY bs.parent_id, COALESCE(bs.slot, 'zzz'), c.name;

GRANT SELECT ON public.v_dish_assembly_components TO anon, authenticated;

COMMENT ON VIEW public.v_dish_assembly_components IS
  'L2 Assembler composition projection: direct BOM children of SALE-* dishes filtered to PF/MOD only.';

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '184_v_dish_assembly_components.sql',
  'claude-code',
  'New view v_dish_assembly_components — derived L2 assembler composition from BOM.'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
```

- [ ] **Step 2: Apply**

```bash
psql "$DB_URL" -f services/supabase/migrations/184_v_dish_assembly_components.sql
```
Expected: clean run.

- [ ] **Step 3: Verify view returns data for an existing SALE dish**

```bash
psql "$DB_URL" -t -A -c "
SELECT 'view_exists=' || count(*) FROM information_schema.views
  WHERE table_name='v_dish_assembly_components';

-- Sample row count: should be > 0 if any SALE-* dish has PF/MOD in BOM
SELECT 'sample_rows=' || count(*) FROM v_dish_assembly_components;
"
```
Expected:
```
view_exists=1
sample_rows=<positive number>  -- depends on current BOM seed; > 0 if any SALE in BOM
```

- [ ] **Step 4: Sanity-check one dish's components**

```bash
psql "$DB_URL" -c "
SELECT component_code, component_name, qty_per_portion, base_unit, slot
FROM v_dish_assembly_components
WHERE dish_id = (SELECT id FROM nomenclature WHERE product_code LIKE 'SALE-%' LIMIT 1)
LIMIT 10;
"
```
Expected: rows where `component_code` starts with `PF-` or `MOD-`. No `RAW-*` codes should appear.

- [ ] **Step 5: Commit**

```bash
git add services/supabase/migrations/184_v_dish_assembly_components.sql
git commit -m "feat(menu): mig 184 — v_dish_assembly_components view"
```

---

## Task 7: Migration 185 — `fn_dish_card_save` RPC

**Files:**
- Create: `services/supabase/migrations/185_rpc_dish_card_save.sql`

- [ ] **Step 1: Write migration**

Create `services/supabase/migrations/185_rpc_dish_card_save.sql`:

```sql
-- Migration 185: fn_dish_card_save — atomic save for SALE dish card
-- Source spec: docs/superpowers/specs/2026-05-17-menu-card-full-design.md §5
-- Atomic save of nomenclature fields + dish_card fields + version bump + verified pointer.
-- Optimistic locking via expected_version. Returns {ok, new_version} or {conflict:{current_version}}.

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_dish_card_save(
  p_dish_id  UUID,
  p_payload  JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_expected_version INT;
  v_current_version  INT;
  v_dish_code        TEXT;
  v_new_version      INT;
  v_user_id          UUID;
  v_dc_payload       JSONB;
BEGIN
  -- ── 1. Validate dish exists + is SALE ──
  SELECT product_code, card_version
    INTO v_dish_code, v_current_version
  FROM public.nomenclature
  WHERE id = p_dish_id;

  IF v_dish_code IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'dish_not_found', 'dish_id', p_dish_id);
  END IF;
  IF v_dish_code NOT LIKE 'SALE-%' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_a_sale_dish', 'product_code', v_dish_code);
  END IF;

  -- ── 2. Optimistic lock check ──
  v_expected_version := (p_payload->>'expected_version')::INT;
  IF v_expected_version IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'expected_version_required');
  END IF;

  IF v_current_version <> v_expected_version THEN
    RETURN jsonb_build_object(
      'ok', false,
      'conflict', jsonb_build_object('current_version', v_current_version)
    );
  END IF;

  v_user_id := auth.uid();
  v_new_version := v_current_version + 1;

  -- ── 3. Update nomenclature row (only fields present in payload) ──
  UPDATE public.nomenclature SET
    customer_description = COALESCE(p_payload->>'customer_description', customer_description),
    customer_short_name  = COALESCE(p_payload->>'customer_short_name',  customer_short_name),
    customer_photo_url   = COALESCE(p_payload->>'customer_photo_url',   customer_photo_url),
    assembler_note       = COALESCE(p_payload->>'assembler_note',       assembler_note),
    merrychef_program    = COALESCE(p_payload->'merrychef_program',     merrychef_program),
    ttc_source_url       = COALESCE(p_payload->>'ttc_source_url',       ttc_source_url),
    card_version         = v_new_version,
    last_verified_at     = now(),
    last_verified_by     = v_user_id
  WHERE id = p_dish_id;

  -- ── 4. Upsert dish_card ──
  v_dc_payload := COALESCE(p_payload->'dish_card', '{}'::jsonb);

  INSERT INTO public.dish_card (
    nomenclature_id, container_l2, assembly_order, pre_merrychef_prep, post_merrychef_check,
    cold_addons_after_reheat, has_cutlery, has_lid_sticker, assembler_photo_url,
    customer_eta_min, composition_override
  ) VALUES (
    p_dish_id,
    v_dc_payload->>'container_l2',
    v_dc_payload->'assembly_order',
    v_dc_payload->>'pre_merrychef_prep',
    v_dc_payload->>'post_merrychef_check',
    v_dc_payload->>'cold_addons_after_reheat',
    COALESCE((v_dc_payload->>'has_cutlery')::BOOLEAN, false),
    COALESCE((v_dc_payload->>'has_lid_sticker')::BOOLEAN, false),
    v_dc_payload->>'assembler_photo_url',
    NULLIF(v_dc_payload->>'customer_eta_min', '')::INT,
    v_dc_payload->>'composition_override'
  )
  ON CONFLICT (nomenclature_id) DO UPDATE SET
    container_l2             = COALESCE(EXCLUDED.container_l2,             dish_card.container_l2),
    assembly_order           = COALESCE(EXCLUDED.assembly_order,           dish_card.assembly_order),
    pre_merrychef_prep       = COALESCE(EXCLUDED.pre_merrychef_prep,       dish_card.pre_merrychef_prep),
    post_merrychef_check     = COALESCE(EXCLUDED.post_merrychef_check,     dish_card.post_merrychef_check),
    cold_addons_after_reheat = COALESCE(EXCLUDED.cold_addons_after_reheat, dish_card.cold_addons_after_reheat),
    has_cutlery              = EXCLUDED.has_cutlery,
    has_lid_sticker          = EXCLUDED.has_lid_sticker,
    assembler_photo_url      = COALESCE(EXCLUDED.assembler_photo_url,      dish_card.assembler_photo_url),
    customer_eta_min         = COALESCE(EXCLUDED.customer_eta_min,         dish_card.customer_eta_min),
    composition_override     = COALESCE(EXCLUDED.composition_override,     dish_card.composition_override);

  RETURN jsonb_build_object('ok', true, 'new_version', v_new_version);
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_dish_card_save(UUID, JSONB) TO authenticated;

COMMENT ON FUNCTION public.fn_dish_card_save(UUID, JSONB) IS
  'Atomic Save & Verify for a SALE dish: updates nomenclature card fields + upserts dish_card + bumps card_version. Optimistic lock via payload.expected_version.';

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '185_rpc_dish_card_save.sql',
  'claude-code',
  'fn_dish_card_save RPC with optimistic locking + version bump + verified pointer.'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
```

- [ ] **Step 2: Apply**

```bash
psql "$DB_URL" -f services/supabase/migrations/185_rpc_dish_card_save.sql
```
Expected: clean run.

- [ ] **Step 3: Verify function exists + happy-path call**

```bash
psql "$DB_URL" -c "
WITH d AS (SELECT id, card_version FROM nomenclature WHERE product_code LIKE 'SALE-%' LIMIT 1)
SELECT fn_dish_card_save(
  (SELECT id FROM d),
  jsonb_build_object(
    'expected_version', (SELECT card_version FROM d),
    'customer_description', 'TEST: brainstorm 2026-05-17',
    'dish_card', jsonb_build_object('container_l2','paper_bowl_16oz','has_cutlery',true)
  )
);
"
```
Expected: returns `{"ok": true, "new_version": <N+1>}` where N is the original card_version.

- [ ] **Step 4: Verify optimistic lock catches stale version**

```bash
psql "$DB_URL" -c "
-- Re-call with the OLD expected_version → must return conflict
WITH d AS (SELECT id FROM nomenclature WHERE customer_description = 'TEST: brainstorm 2026-05-17' LIMIT 1)
SELECT fn_dish_card_save(
  (SELECT id FROM d),
  jsonb_build_object('expected_version', 1)
);
"
```
Expected: returns `{"ok": false, "conflict": {"current_version": <N>}}`.

- [ ] **Step 5: Cleanup test data**

```bash
psql "$DB_URL" -c "
DELETE FROM dish_card WHERE composition_override IS NULL AND container_l2 = 'paper_bowl_16oz' AND nomenclature_id IN (
  SELECT id FROM nomenclature WHERE customer_description = 'TEST: brainstorm 2026-05-17'
);
UPDATE nomenclature SET customer_description = NULL WHERE customer_description = 'TEST: brainstorm 2026-05-17';
"
```

- [ ] **Step 6: Commit**

```bash
git add services/supabase/migrations/185_rpc_dish_card_save.sql
git commit -m "feat(menu): mig 185 — fn_dish_card_save RPC with optimistic lock"
```

---

## Task 8: Migration 186 — `fn_pf_pack_card_save` RPC

**Files:**
- Create: `services/supabase/migrations/186_rpc_pf_pack_card_save.sql`

- [ ] **Step 1: Write migration**

Create `services/supabase/migrations/186_rpc_pf_pack_card_save.sql`:

```sql
-- Migration 186: fn_pf_pack_card_save — atomic save for PF pack card
-- Source spec: docs/superpowers/specs/2026-05-17-menu-card-full-design.md §5
-- Same pattern as fn_dish_card_save but for PF-* items (kitchen_note + pf_pack_card fields).

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_pf_pack_card_save(
  p_pf_id    UUID,
  p_payload  JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_expected_version INT;
  v_current_version  INT;
  v_pf_code          TEXT;
  v_new_version      INT;
  v_user_id          UUID;
  v_pc_payload       JSONB;
BEGIN
  SELECT product_code, card_version
    INTO v_pf_code, v_current_version
  FROM public.nomenclature
  WHERE id = p_pf_id;

  IF v_pf_code IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'pf_not_found', 'pf_id', p_pf_id);
  END IF;
  IF v_pf_code NOT LIKE 'PF-%' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_a_pf', 'product_code', v_pf_code);
  END IF;

  v_expected_version := (p_payload->>'expected_version')::INT;
  IF v_expected_version IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'expected_version_required');
  END IF;
  IF v_current_version <> v_expected_version THEN
    RETURN jsonb_build_object(
      'ok', false,
      'conflict', jsonb_build_object('current_version', v_current_version)
    );
  END IF;

  v_user_id := auth.uid();
  v_new_version := v_current_version + 1;

  UPDATE public.nomenclature SET
    kitchen_note     = COALESCE(p_payload->>'kitchen_note', kitchen_note),
    ttc_source_url   = COALESCE(p_payload->>'ttc_source_url', ttc_source_url),
    card_version     = v_new_version,
    last_verified_at = now(),
    last_verified_by = v_user_id
  WHERE id = p_pf_id;

  v_pc_payload := COALESCE(p_payload->'pf_pack_card', '{}'::jsonb);

  INSERT INTO public.pf_pack_card (
    nomenclature_id, batch_input_qty, batch_input_uom, portions_per_batch, portion_weight_g,
    vacuum_bag_size, fill_weight_per_bag_g, portions_per_bag, label_template,
    shelf_life_days, storage_zone, storage_temp_min_c, storage_temp_max_c, kitchen_photo_url
  ) VALUES (
    p_pf_id,
    NULLIF(v_pc_payload->>'batch_input_qty', '')::NUMERIC,
    v_pc_payload->>'batch_input_uom',
    NULLIF(v_pc_payload->>'portions_per_batch', '')::NUMERIC,
    NULLIF(v_pc_payload->>'portion_weight_g', '')::NUMERIC,
    v_pc_payload->>'vacuum_bag_size',
    NULLIF(v_pc_payload->>'fill_weight_per_bag_g', '')::NUMERIC,
    NULLIF(v_pc_payload->>'portions_per_bag', '')::NUMERIC,
    v_pc_payload->'label_template',
    NULLIF(v_pc_payload->>'shelf_life_days', '')::INT,
    v_pc_payload->>'storage_zone',
    NULLIF(v_pc_payload->>'storage_temp_min_c', '')::NUMERIC,
    NULLIF(v_pc_payload->>'storage_temp_max_c', '')::NUMERIC,
    v_pc_payload->>'kitchen_photo_url'
  )
  ON CONFLICT (nomenclature_id) DO UPDATE SET
    batch_input_qty       = COALESCE(EXCLUDED.batch_input_qty,       pf_pack_card.batch_input_qty),
    batch_input_uom       = COALESCE(EXCLUDED.batch_input_uom,       pf_pack_card.batch_input_uom),
    portions_per_batch    = COALESCE(EXCLUDED.portions_per_batch,    pf_pack_card.portions_per_batch),
    portion_weight_g      = COALESCE(EXCLUDED.portion_weight_g,      pf_pack_card.portion_weight_g),
    vacuum_bag_size       = COALESCE(EXCLUDED.vacuum_bag_size,       pf_pack_card.vacuum_bag_size),
    fill_weight_per_bag_g = COALESCE(EXCLUDED.fill_weight_per_bag_g, pf_pack_card.fill_weight_per_bag_g),
    portions_per_bag      = COALESCE(EXCLUDED.portions_per_bag,      pf_pack_card.portions_per_bag),
    label_template        = COALESCE(EXCLUDED.label_template,        pf_pack_card.label_template),
    shelf_life_days       = COALESCE(EXCLUDED.shelf_life_days,       pf_pack_card.shelf_life_days),
    storage_zone          = COALESCE(EXCLUDED.storage_zone,          pf_pack_card.storage_zone),
    storage_temp_min_c    = COALESCE(EXCLUDED.storage_temp_min_c,    pf_pack_card.storage_temp_min_c),
    storage_temp_max_c    = COALESCE(EXCLUDED.storage_temp_max_c,    pf_pack_card.storage_temp_max_c),
    kitchen_photo_url     = COALESCE(EXCLUDED.kitchen_photo_url,     pf_pack_card.kitchen_photo_url);

  RETURN jsonb_build_object('ok', true, 'new_version', v_new_version);
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_pf_pack_card_save(UUID, JSONB) TO authenticated;

COMMENT ON FUNCTION public.fn_pf_pack_card_save(UUID, JSONB) IS
  'Atomic Save & Verify for a PF item: updates nomenclature.kitchen_note + upserts pf_pack_card + bumps card_version. Optimistic lock via payload.expected_version.';

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '186_rpc_pf_pack_card_save.sql',
  'claude-code',
  'fn_pf_pack_card_save RPC with optimistic locking + version bump.'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
```

- [ ] **Step 2: Apply**

```bash
psql "$DB_URL" -f services/supabase/migrations/186_rpc_pf_pack_card_save.sql
```
Expected: clean run.

- [ ] **Step 3: Happy-path verify**

```bash
psql "$DB_URL" -c "
WITH p AS (SELECT id, card_version FROM nomenclature WHERE product_code LIKE 'PF-%' LIMIT 1)
SELECT fn_pf_pack_card_save(
  (SELECT id FROM p),
  jsonb_build_object(
    'expected_version', (SELECT card_version FROM p),
    'kitchen_note', 'TEST: brainstorm 2026-05-17 pf',
    'pf_pack_card', jsonb_build_object(
      'vacuum_bag_size','20x30cm','fill_weight_per_bag_g',850,
      'portions_per_bag',5,'shelf_life_days',3,
      'storage_zone','L1-Cold-W1','storage_temp_min_c',2,'storage_temp_max_c',4
    )
  )
);
"
```
Expected: `{"ok": true, "new_version": <N+1>}`.

- [ ] **Step 4: Cleanup test data**

```bash
psql "$DB_URL" -c "
DELETE FROM pf_pack_card WHERE nomenclature_id IN (
  SELECT id FROM nomenclature WHERE kitchen_note = 'TEST: brainstorm 2026-05-17 pf'
);
UPDATE nomenclature SET kitchen_note = NULL WHERE kitchen_note = 'TEST: brainstorm 2026-05-17 pf';
"
```

- [ ] **Step 5: Commit**

```bash
git add services/supabase/migrations/186_rpc_pf_pack_card_save.sql
git commit -m "feat(menu): mig 186 — fn_pf_pack_card_save RPC"
```

---

## Task 9: Migration 187 — `fn_dish_allergens` RPC

**Files:**
- Create: `services/supabase/migrations/187_rpc_dish_allergens.sql`

- [ ] **Step 1: Write migration**

Create `services/supabase/migrations/187_rpc_dish_allergens.sql`:

```sql
-- Migration 187: fn_dish_allergens — allergen aggregation across BOM tree
-- Source spec: docs/superpowers/specs/2026-05-17-menu-card-full-design.md §5
-- Walks BOM tree (depth ≤ 10), collects tags WHERE tag_group='allergen' on any descendant,
-- UNION with tags directly attached to the dish. Returns sorted distinct slugs.

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_dish_allergens(p_dish_id UUID)
RETURNS TEXT[]
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  WITH RECURSIVE tree AS (
    SELECT p_dish_id AS nomenclature_id, 0 AS depth
    UNION ALL
    SELECT bs.ingredient_id, t.depth + 1
    FROM tree t
    JOIN public.bom_structures bs ON bs.parent_id = t.nomenclature_id
    WHERE t.depth < 10
  ),
  tree_distinct AS (
    SELECT DISTINCT nomenclature_id FROM tree
  ),
  allergens AS (
    SELECT DISTINCT tg.slug
    FROM tree_distinct td
    JOIN public.nomenclature_tags nt ON nt.nomenclature_id = td.nomenclature_id
    JOIN public.tags tg ON tg.id = nt.tag_id
    WHERE tg.tag_group = 'allergen'
  )
  SELECT ARRAY(SELECT slug FROM allergens ORDER BY slug);
$$;

GRANT EXECUTE ON FUNCTION public.fn_dish_allergens(UUID) TO authenticated, anon;

COMMENT ON FUNCTION public.fn_dish_allergens(UUID) IS
  'Walks BOM tree (depth ≤ 10) and aggregates allergen tag slugs from all descendants + direct dish tags. Returns sorted TEXT[].';

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '187_rpc_dish_allergens.sql',
  'claude-code',
  'fn_dish_allergens RPC — recursive BOM walk + tag_group=allergen aggregation.'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
```

- [ ] **Step 2: Apply**

```bash
psql "$DB_URL" -f services/supabase/migrations/187_rpc_dish_allergens.sql
```
Expected: clean run.

- [ ] **Step 3: Verify function exists + returns array (likely empty until tags are attached)**

```bash
psql "$DB_URL" -c "
SELECT fn_dish_allergens(id) AS allergens, name
FROM nomenclature
WHERE product_code LIKE 'SALE-%'
LIMIT 5;
"
```
Expected: 5 rows, `allergens` column is an array (possibly empty `{}` until allergen tags get attached in Phase 2 UI). Function should NOT error.

- [ ] **Step 4: Smoke test with a manually attached allergen**

```bash
psql "$DB_URL" -c "
-- Pick a SALE-* dish and a RAW-* used in its BOM, tag the RAW with 'gluten'
BEGIN;
WITH ingredient AS (
  SELECT bs.ingredient_id AS ing_id, bs.parent_id AS dish_id
  FROM bom_structures bs
  JOIN nomenclature p ON p.id = bs.parent_id
  WHERE p.product_code LIKE 'SALE-%'
  LIMIT 1
)
INSERT INTO nomenclature_tags (nomenclature_id, tag_id)
SELECT i.ing_id, t.id
FROM ingredient i, tags t
WHERE t.slug = 'gluten'
ON CONFLICT DO NOTHING;

-- Now fn_dish_allergens for that dish must include 'gluten'
WITH ingredient AS (
  SELECT bs.parent_id AS dish_id
  FROM bom_structures bs
  JOIN nomenclature p ON p.id = bs.parent_id
  WHERE p.product_code LIKE 'SALE-%'
  LIMIT 1
)
SELECT 'allergens=' || array_to_string(fn_dish_allergens(dish_id), ',') FROM ingredient;
ROLLBACK;
"
```
Expected: line `allergens=gluten` (rollback discards the test tag).

- [ ] **Step 5: Commit**

```bash
git add services/supabase/migrations/187_rpc_dish_allergens.sql
git commit -m "feat(menu): mig 187 — fn_dish_allergens RPC (BOM-tree walk)"
```

---

## Task 10: Migration 188 — `fn_loyverse_sync_dish` RPC

**Files:**
- Create: `services/supabase/migrations/188_rpc_loyverse_sync_dish.sql`

- [ ] **Step 1: Write migration**

Create `services/supabase/migrations/188_rpc_loyverse_sync_dish.sql`:

```sql
-- Migration 188: fn_loyverse_sync_dish — build Loyverse item payload
-- Source spec: docs/superpowers/specs/2026-05-17-menu-card-full-design.md §5
-- Returns the Loyverse item JSON payload (does NOT push — push happens in admin-panel via the Loyverse REST client).
-- Customer-facing fields only: short name (fallback name), description + allergen suffix, photo, price.

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_loyverse_sync_dish(p_dish_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
AS $$
DECLARE
  v_row       RECORD;
  v_allergens TEXT[];
  v_desc      TEXT;
  v_suffix    TEXT;
BEGIN
  SELECT id, product_code, name, customer_short_name, customer_description, customer_photo_url, price
    INTO v_row
  FROM public.nomenclature
  WHERE id = p_dish_id;

  IF v_row.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'dish_not_found', 'dish_id', p_dish_id);
  END IF;
  IF v_row.product_code NOT LIKE 'SALE-%' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_a_sale_dish', 'product_code', v_row.product_code);
  END IF;

  v_allergens := public.fn_dish_allergens(p_dish_id);

  -- Suffix only if allergens present, deterministic alphabetical order (fn_dish_allergens already sorts)
  IF array_length(v_allergens, 1) IS NOT NULL THEN
    v_suffix := E'\n(contains: ' || array_to_string(v_allergens, ', ') || ')';
  ELSE
    v_suffix := '';
  END IF;

  v_desc := COALESCE(v_row.customer_description, '') || v_suffix;

  RETURN jsonb_build_object(
    'ok', true,
    'payload', jsonb_build_object(
      'name',        COALESCE(NULLIF(v_row.customer_short_name, ''), v_row.name),
      'description', v_desc,
      'image_url',   v_row.customer_photo_url,
      'default_price', v_row.price
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_loyverse_sync_dish(UUID) TO authenticated;

COMMENT ON FUNCTION public.fn_loyverse_sync_dish(UUID) IS
  'Builds Loyverse item payload for a SALE dish (customer_short_name|name, customer_description + allergen suffix, customer_photo_url, price). Does not push.';

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '188_rpc_loyverse_sync_dish.sql',
  'claude-code',
  'fn_loyverse_sync_dish RPC — builds Loyverse item payload (push lives in admin-panel client).'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
```

- [ ] **Step 2: Apply**

```bash
psql "$DB_URL" -f services/supabase/migrations/188_rpc_loyverse_sync_dish.sql
```
Expected: clean run.

- [ ] **Step 3: Verify happy path**

```bash
psql "$DB_URL" -c "
SELECT fn_loyverse_sync_dish(id)
FROM nomenclature
WHERE product_code LIKE 'SALE-%'
LIMIT 1;
"
```
Expected: returns `{"ok": true, "payload": {"name": "...", "description": "...", "image_url": null|"...", "default_price": <number>}}`.

- [ ] **Step 4: Verify rejection for non-SALE**

```bash
psql "$DB_URL" -c "
SELECT fn_loyverse_sync_dish(id) FROM nomenclature WHERE product_code LIKE 'RAW-%' LIMIT 1;
"
```
Expected: returns `{"ok": false, "error": "not_a_sale_dish", "product_code": "RAW-..."}`.

- [ ] **Step 5: Commit**

```bash
git add services/supabase/migrations/188_rpc_loyverse_sync_dish.sql
git commit -m "feat(menu): mig 188 — fn_loyverse_sync_dish RPC (payload builder)"
```

---

## Task 11: Final verification — all 10 migrations applied + DB delta acceptable

- [ ] **Step 1: Verify all migration_log rows**

```bash
DB_URL=$(security find-generic-password -s "shishka-database-url" -w)
psql "$DB_URL" -t -A -c "
SELECT filename FROM migration_log
WHERE filename IN (
  '179_dish_card_table.sql',
  '180_pf_pack_card_table.sql',
  '181_nomenclature_card_extension.sql',
  '182_recipes_flow_haccp_ccp.sql',
  '183_modifier_options_and_allergens.sql',
  '184_v_dish_assembly_components.sql',
  '185_rpc_dish_card_save.sql',
  '186_rpc_pf_pack_card_save.sql',
  '187_rpc_dish_allergens.sql',
  '188_rpc_loyverse_sync_dish.sql'
) ORDER BY filename;
"
```
Expected: 10 rows in order 179 → 188.

- [ ] **Step 2: Check DB size delta**

```bash
psql "$DB_URL" -t -A -c "SELECT pg_size_pretty(pg_database_size(current_database()));"
```
Expected: still in single-digit MB range above pre-Phase-1 baseline (~79 MB before). New tables are empty; the bump is from added columns and indexes — should be well under +5 MB.

- [ ] **Step 3: Smoke-test end-to-end happy path with a real SALE dish**

```bash
psql "$DB_URL" -c "
WITH d AS (SELECT id, card_version FROM nomenclature WHERE product_code LIKE 'SALE-%' LIMIT 1)
SELECT
  'save=' || fn_dish_card_save((SELECT id FROM d),
    jsonb_build_object(
      'expected_version', (SELECT card_version FROM d),
      'customer_description', 'E2E smoke-test 2026-05-17',
      'customer_short_name', 'Smoke Bowl',
      'merrychef_program', jsonb_build_object('temp_c',180,'time_sec',60,'fan_pct',50,'microwave_pct',30),
      'dish_card', jsonb_build_object(
        'container_l2','paper_bowl_16oz','has_cutlery',true,
        'pre_merrychef_prep','cover with parchment',
        'assembly_order', '[{\"step\":1,\"text\":\"base\"},{\"step\":2,\"text\":\"sauce\"}]'::jsonb
      )
    )
  )::text;

WITH d AS (SELECT id FROM nomenclature WHERE customer_short_name = 'Smoke Bowl' LIMIT 1)
SELECT 'loyverse=' || fn_loyverse_sync_dish((SELECT id FROM d))::text;

WITH d AS (SELECT id FROM nomenclature WHERE customer_short_name = 'Smoke Bowl' LIMIT 1)
SELECT 'allergens=' || array_to_string(fn_dish_allergens((SELECT id FROM d)), ',');

WITH d AS (SELECT id FROM nomenclature WHERE customer_short_name = 'Smoke Bowl' LIMIT 1)
SELECT 'components=' || count(*) FROM v_dish_assembly_components WHERE dish_id = (SELECT id FROM d);
"
```
Expected:
- `save=...` returns `{"ok":true,"new_version":<N+1>}`
- `loyverse=...` returns `{"ok":true,"payload":{...}}` with `name="Smoke Bowl"` and `description="E2E smoke-test 2026-05-17"`
- `allergens=` array (possibly empty until allergens attached)
- `components=` count > 0 if that dish has any PF/MOD in BOM

- [ ] **Step 4: Cleanup smoke-test fingerprint**

```bash
psql "$DB_URL" -c "
WITH d AS (SELECT id FROM nomenclature WHERE customer_short_name = 'Smoke Bowl')
DELETE FROM dish_card WHERE nomenclature_id IN (SELECT id FROM d);

UPDATE nomenclature
SET customer_description = NULL,
    customer_short_name = NULL,
    merrychef_program = NULL
WHERE customer_short_name = 'Smoke Bowl' OR customer_description = 'E2E smoke-test 2026-05-17';
"
```

- [ ] **Step 5: Create umbrella MC task pointing to this plan**

Call (via mission-control MCP — minimal payload pattern from feedback memory):
```
emit_business_task(
  title="MENU-CARD epic — full process description across 4 roles",
  description="Spec: docs/superpowers/specs/2026-05-17-menu-card-full-design.md. Phase 1 plan: docs/superpowers/plans/2026-05-17-menu-card-data-layer.md (this). Phases 2 (drawer + Owner view) and 3 (per-role views + photo + Loyverse push) to be written after Phase 1 ships.",
  domain="tech",
  created_by="claude-opus-session-142841ef",
  related_ids={"reason":"menu-card-umbrella","spec":"2026-05-17-menu-card-full-design.md"},
  priority="high"
)
```

Record the returned task id; link subsequent child tasks (one per migration / RPC) under it as needed.

- [ ] **Step 6: Final commit (plan completion marker)**

If any uncommitted edits remain (e.g., from cleanup), commit them:
```bash
git status
# If nothing to commit, skip.
```

Phase 1 complete. Ready to write Phase 2 plan (Drawer + Owner view) — UI layer that calls these RPCs.

---

## Self-Review Notes (filled during plan-write 2026-05-17)

- **Spec coverage:** All 6 spec migrations + 4 RPCs mapped to discrete tasks. View `v_dish_assembly_components` covered in Task 6. Composition `override` field handled in `dish_card` (Task 1). Allergen tags seeded in Task 5. CCP seed for known recipes in Task 4.
- **Placeholders:** None — every SQL block and command is concrete.
- **Type consistency:** Function signatures match across tasks (`fn_dish_card_save(UUID, JSONB) RETURNS JSONB`, etc.). Column names match the spec verbatim.
- **Migration numbers:** Sequential 179 → 188, with no collisions (last existing is 178).
- **Skipped guards:** Allergen tag `slug` column has implicit UNIQUE because of `ON CONFLICT (slug)` usage; if the live `tags` table lacks that constraint, Task 5 Step 3 will FAIL — pre-checked schema in Task 5 Step 1.
- **Defensive backfill:** Task 4 seed uses `WHERE ... AND ccp_check_text IS NULL` to be idempotent on re-runs.
