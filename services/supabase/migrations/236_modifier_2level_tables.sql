-- Migration 236 — 2-level Loyverse-synced modifier model (Phase 1: schema + sync)
-- Spec: docs/modules/modifiers.md  |  MC task 38911fde
--
-- Loyverse models modifiers as 2 levels: a GROUP (modifier list, with min/max_select
-- + stores) containing OPTIONS (name + price). We mirror that 1:1 and add the one
-- thing Loyverse can't hold: food-cost (option -> MOD-* nomenclature + portion).
--
-- Source-of-truth split:
--   Groups + options ........ Loyverse (mirror: pos_loyverse_modifier_lists/options)
--   Dish -> group attachment . Loyverse item.modifier_ids -> NEW dish_modifier_groups
--   Option -> MOD + portion .. OURS (Loyverse can't) -> NEW modifier_option_cost
--
-- SOFT REFERENCES (no FK) to the mirror tables are deliberate: pull_modifiers does a
-- full wipe-and-reload of the mirror (see fn_refresh_loyverse_modifier_mirror); a hard
-- FK from these tables would be cascade-wiped on every pull. Loyverse option/list ids
-- are stable, so a soft text ref is safe and survives pulls. This migration itself
-- performs NO destructive ops. nomenclature_modifier_options is NOT dropped here
-- (that is Phase 7) — these tables are populated alongside it for now.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. dish_modifier_groups — which modifier GROUPS apply to a dish.
--    Mirror of Loyverse item.modifier_ids. One row per (dish, group).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.dish_modifier_groups (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dish_id                   UUID NOT NULL REFERENCES nomenclature(id) ON DELETE CASCADE,
  -- SOFT ref to pos_loyverse_modifier_lists(id) — see header (no FK on purpose).
  loyverse_modifier_list_id TEXT NOT NULL,
  sort_order                INT  NOT NULL DEFAULT 0,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_dish_modifier_group UNIQUE (dish_id, loyverse_modifier_list_id)
);

CREATE INDEX IF NOT EXISTS idx_dish_modifier_groups_dish
  ON public.dish_modifier_groups(dish_id);
CREATE INDEX IF NOT EXISTS idx_dish_modifier_groups_list
  ON public.dish_modifier_groups(loyverse_modifier_list_id);

-- Type guard: dish_id must reference a SALE-* item.
CREATE OR REPLACE FUNCTION fn_dish_modifier_groups_type_guard()
RETURNS TRIGGER AS $$
DECLARE v_dish_code TEXT;
BEGIN
  SELECT product_code INTO v_dish_code FROM nomenclature WHERE id = NEW.dish_id;
  IF v_dish_code NOT LIKE 'SALE-%' THEN
    RAISE EXCEPTION 'dish_modifier_groups.dish_id must reference SALE-* (got %)', v_dish_code;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_dish_modifier_groups_type_guard ON public.dish_modifier_groups;
CREATE TRIGGER trg_dish_modifier_groups_type_guard
  BEFORE INSERT OR UPDATE ON public.dish_modifier_groups
  FOR EACH ROW EXECUTE FUNCTION fn_dish_modifier_groups_type_guard();

ALTER TABLE public.dish_modifier_groups ENABLE ROW LEVEL SECURITY;

-- RLS mirrors nomenclature_modifier_options (mig 183): anon read, authenticated full.
-- This is the proven-working pattern for the admin modifier UI.
DROP POLICY IF EXISTS dish_mod_groups_anon_read ON public.dish_modifier_groups;
CREATE POLICY dish_mod_groups_anon_read ON public.dish_modifier_groups
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS dish_mod_groups_auth_full ON public.dish_modifier_groups;
CREATE POLICY dish_mod_groups_auth_full ON public.dish_modifier_groups
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMENT ON TABLE public.dish_modifier_groups IS
  'Which modifier GROUPS (Loyverse modifier lists) apply to a SALE-* dish. Mirror of Loyverse item.modifier_ids, refreshed by loyverse-sync pull_modifiers. loyverse_modifier_list_id is a SOFT ref to pos_loyverse_modifier_lists (no FK: mirror is wipe-and-reloaded each pull).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. modifier_option_cost — food-cost link for a Loyverse OPTION (option-centric).
--    One row per Loyverse option id -> MOD-* nomenclature + portion. Survives pulls.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.modifier_option_cost (
  -- SOFT ref to pos_loyverse_modifier_options(id) — see header (no FK on purpose).
  loyverse_modifier_option_id TEXT PRIMARY KEY,
  modifier_id                 UUID NOT NULL REFERENCES nomenclature(id) ON DELETE CASCADE,
  quantity_per_unit           NUMERIC NOT NULL DEFAULT 1,   -- portion, e.g. 30 (g)
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- NOTE: price_delta is NOT stored here — it lives in Loyverse (option.price).
-- option food-cost = MOD-*.cost_per_unit * quantity_per_unit; margin = option.price - cost.

CREATE INDEX IF NOT EXISTS idx_modifier_option_cost_modifier
  ON public.modifier_option_cost(modifier_id);

-- Type guard: modifier_id must reference a MOD-* item.
CREATE OR REPLACE FUNCTION fn_modifier_option_cost_type_guard()
RETURNS TRIGGER AS $$
DECLARE v_mod_code TEXT;
BEGIN
  SELECT product_code INTO v_mod_code FROM nomenclature WHERE id = NEW.modifier_id;
  IF v_mod_code NOT LIKE 'MOD-%' THEN
    RAISE EXCEPTION 'modifier_option_cost.modifier_id must reference MOD-* (got %)', v_mod_code;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_modifier_option_cost_type_guard ON public.modifier_option_cost;
CREATE TRIGGER trg_modifier_option_cost_type_guard
  BEFORE INSERT OR UPDATE ON public.modifier_option_cost
  FOR EACH ROW EXECUTE FUNCTION fn_modifier_option_cost_type_guard();

DROP TRIGGER IF EXISTS trg_modifier_option_cost_updated_at ON public.modifier_option_cost;
CREATE TRIGGER trg_modifier_option_cost_updated_at
  BEFORE UPDATE ON public.modifier_option_cost
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

ALTER TABLE public.modifier_option_cost ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mod_opt_cost_anon_read ON public.modifier_option_cost;
CREATE POLICY mod_opt_cost_anon_read ON public.modifier_option_cost
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS mod_opt_cost_auth_full ON public.modifier_option_cost;
CREATE POLICY mod_opt_cost_auth_full ON public.modifier_option_cost
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMENT ON TABLE public.modifier_option_cost IS
  'Food-cost link for a Loyverse modifier OPTION (option-centric): option -> MOD-* nomenclature + portion (quantity_per_unit). Locally owned; survives Loyverse pulls. Same MOD in different proportions = different option = different row. cost = MOD.cost_per_unit * quantity_per_unit.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RPC fn_refresh_dish_modifier_groups — reconcile dish->group from Loyverse.
--    Called by loyverse-sync pull_modifiers. p_items = [{ item_id, modifier_list_ids[] }].
--    For each Loyverse item resolvable to a SALE-* dish, replaces that dish's group
--    rows to exactly match Loyverse. Only known mirror list ids are kept (post-mirror-
--    refresh, so the ids are current). Dishes absent from the payload are untouched.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_refresh_dish_modifier_groups(p_items JSONB)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_synced INT := 0;
BEGIN
  -- Flatten payload -> (dish_id, list_id) pairs for resolvable SALE-* dishes,
  -- keeping only list ids that exist in the freshly-refreshed mirror.
  WITH payload AS (
    SELECT
      (e->>'item_id')              AS loyverse_item_id,
      jsonb_array_elements_text(COALESCE(e->'modifier_list_ids','[]'::jsonb)) AS list_id
    FROM jsonb_array_elements(p_items) AS e
  ),
  resolved AS (
    SELECT DISTINCT n.id AS dish_id, p.list_id
    FROM payload p
    JOIN nomenclature n
      ON n.loyverse_item_id = p.loyverse_item_id
     AND n.product_code LIKE 'SALE-%'
    JOIN pos_loyverse_modifier_lists pml ON pml.id = p.list_id
  ),
  -- Dishes that appeared in the payload (so we know which dishes to reconcile).
  touched_dishes AS (
    SELECT DISTINCT n.id AS dish_id
    FROM payload p
    JOIN nomenclature n
      ON n.loyverse_item_id = p.loyverse_item_id
     AND n.product_code LIKE 'SALE-%'
  ),
  del AS (
    DELETE FROM dish_modifier_groups dmg
    WHERE dmg.dish_id IN (SELECT dish_id FROM touched_dishes)
      AND NOT EXISTS (
        SELECT 1 FROM resolved r
        WHERE r.dish_id = dmg.dish_id
          AND r.list_id = dmg.loyverse_modifier_list_id
      )
    RETURNING 1
  ),
  ins AS (
    INSERT INTO dish_modifier_groups (dish_id, loyverse_modifier_list_id)
    SELECT dish_id, list_id FROM resolved
    ON CONFLICT (dish_id, loyverse_modifier_list_id) DO NOTHING
    RETURNING 1
  )
  SELECT (SELECT count(*) FROM resolved) INTO v_synced;

  RETURN v_synced;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Backfill from the interim flat bindings (183 rows -> 36 groups + 37 cost links).
--    Verified clean 2026-06-02: 0 options span >1 MOD/qty/list (option-centric safe).
-- ─────────────────────────────────────────────────────────────────────────────

-- dish -> group (distinct dish + list)
INSERT INTO public.dish_modifier_groups (dish_id, loyverse_modifier_list_id)
SELECT DISTINCT nmo.dish_id, nmo.loyverse_modifier_list_id
FROM public.nomenclature_modifier_options nmo
WHERE nmo.loyverse_modifier_list_id IS NOT NULL
ON CONFLICT (dish_id, loyverse_modifier_list_id) DO NOTHING;

-- option -> MOD cost link (one row per Loyverse option; qty consistent per option)
INSERT INTO public.modifier_option_cost (loyverse_modifier_option_id, modifier_id, quantity_per_unit)
SELECT DISTINCT ON (nmo.loyverse_modifier_id)
       nmo.loyverse_modifier_id,
       nmo.modifier_id,
       COALESCE(nmo.quantity_per_unit, 1)
FROM public.nomenclature_modifier_options nmo
WHERE nmo.loyverse_modifier_id IS NOT NULL
ORDER BY nmo.loyverse_modifier_id, nmo.created_at
ON CONFLICT (loyverse_modifier_option_id) DO NOTHING;

-- Realtime (mirror nomenclature_modifier_options behaviour).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='dish_modifier_groups'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.dish_modifier_groups;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='modifier_option_cost'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.modifier_option_cost;
  END IF;
END $$;

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '236_modifier_2level_tables.sql',
  'claude-code',
  '2-level modifier model Phase 1: dish_modifier_groups (dish<->group) + modifier_option_cost (option-centric food-cost) + fn_refresh_dish_modifier_groups RPC. Soft refs to mirror (survive wipe-and-reload pulls). Backfilled from nomenclature_modifier_options (kept; Phase 7 drops it). MC 38911fde.'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
