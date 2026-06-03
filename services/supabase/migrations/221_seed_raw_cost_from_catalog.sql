-- ============================================================
-- Migration 221: Seed RAW cost_per_unit from supplier_catalog
--                + cost_source provenance (wac/catalog_estimate/manual/none)
--
-- PROBLEM: fn_rollup_bom_costs (mig 137) rolls RAW costs up into
-- PF/SALE dishes, but it reads each RAW leaf's cost_per_unit DIRECTLY
-- and has NO fallback to the Makro catalog. When a RAW ingredient was
-- never purchased, its cost_per_unit stays 0 (DEFAULT 0, mig 019) or
-- NULL, so every dish using it under-costs. We observed 8 smoothies
-- showing THB 0-8 when the real cost is THB 16-37. The Makro prices
-- exist in supplier_catalog (last_seen_price, conversion_factor) but
-- were never written into nomenclature.cost_per_unit. The chef MCP
-- (bom-walker.ts) has this fallback in-memory only — so "verified via
-- chef" looked complete while /menu (reads cost_per_unit) stayed empty.
--
-- SOLUTION (mirrors services/mcp-chef/src/lib/bom-walker.ts fallback):
--   1. cost_source column on nomenclature: wac | catalog_estimate |
--      manual | none — so /menu can flag estimated costs.
--   2. fn_seed_raw_cost_from_catalog(uuid) — for RAW item(s) whose
--      cost_per_unit IS NULL OR = 0 (and not legit-zero), pick the
--      newest catalog row (updated_at DESC) with a non-null
--      last_seen_price and write cost = last_seen_price /
--      NULLIF(conversion_factor,0) (1:1 fallback) + cost_source =
--      'catalog_estimate'. Never clobbers WAC (NULL/0 guard). Idempotent.
--   3. trg_sc_seed_raw_cost — AFTER INSERT OR UPDATE OF last_seen_price
--      on supplier_catalog: auto-seed the linked RAW on future scrapes.
--   4. WAC writers (fn_update_cost_on_purchase mig 050,
--      fn_recalc_wac_for_product mig 214) now stamp cost_source='wac',
--      so a real purchase overrides an estimate and clears the badge.
--   5. fn_rollup_bom_costs propagates cost_source upward: a dish is
--      'catalog_estimate' if any costed child is an estimate.
--   6. One-time backfill: seed + tag existing rows + roll up.
--
-- INTERACTION WITH EXISTING CASCADE (mig 137/211):
--   Writing cost_per_unit on a RAW leaf fires trg_cascade_bom_cost,
--   which calls fn_rollup_bom_costs(parent_id) and rolls dishes up
--   automatically. The app.bom_rollup_active recursion guard prevents
--   loops; seeding writes only RAW leaves while the rollup writes only
--   non-RAW items, so the write-sets are disjoint (no infinite loop).
--
-- CONSERVATISM: only touches cost_per_unit where it IS NULL OR = 0, so
-- it NEVER overwrites a real purchase WAC (always > 0). Excludes
-- genuinely-zero RAWs (ICE_CUBES, RO-WATER). Only seeds when a usable
-- catalog price exists.
--
-- DEPENDS ON: 137_bom_cost_rollup.sql, 050 (fn_update_cost_on_purchase),
--   214_wac_recalc_on_purchase_update.sql (fn_recalc_wac_for_product).
-- IDEMPOTENT: ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE, DROP TRIGGER IF EXISTS.
-- ============================================================


-- ─── 1. cost_source provenance column ───

ALTER TABLE public.nomenclature
  ADD COLUMN IF NOT EXISTS cost_source TEXT NOT NULL DEFAULT 'none';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'nomenclature_cost_source_chk'
  ) THEN
    ALTER TABLE public.nomenclature
      ADD CONSTRAINT nomenclature_cost_source_chk
      CHECK (cost_source IN ('wac','catalog_estimate','manual','none'));
  END IF;
END;
$$;

COMMENT ON COLUMN public.nomenclature.cost_source
  IS 'Provenance of cost_per_unit: wac=real purchase weighted-average; catalog_estimate=Makro catalog price (no purchase yet); manual=hand-set; none=cost 0/unknown. Mig 221.';


-- ─── 2. fn_seed_raw_cost_from_catalog ───

CREATE OR REPLACE FUNCTION public.fn_seed_raw_cost_from_catalog(
  p_nomenclature_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item     RECORD;
  v_new_cost NUMERIC;
  v_updated  INTEGER := 0;
  v_items    JSONB := '[]'::jsonb;
BEGIN
  FOR v_item IN
    SELECT n.id, n.product_code, n.cost_per_unit
    FROM public.nomenclature n
    WHERE n.product_code LIKE 'RAW-%'
      AND n.product_code NOT IN ('RAW-ICE_CUBES', 'RAW-RO-WATER')
      AND (n.cost_per_unit IS NULL OR n.cost_per_unit = 0)
      AND (p_nomenclature_id IS NULL OR n.id = p_nomenclature_id)
  LOOP
    -- Best catalog row: newest, with a usable price. Mirrors bom-walker.ts:
    --   both present -> price / conversion_factor ; price only -> price (1:1)
    SELECT ROUND(
             sc.last_seen_price / COALESCE(NULLIF(sc.conversion_factor, 0), 1),
             4
           )
    INTO v_new_cost
    FROM public.supplier_catalog sc
    WHERE sc.nomenclature_id = v_item.id
      AND sc.last_seen_price IS NOT NULL
    ORDER BY sc.updated_at DESC NULLS LAST
    LIMIT 1;

    IF v_new_cost IS NOT NULL AND v_new_cost > 0 THEN
      -- Re-check NULL/0 at write time: a concurrent purchase WAC (>0) must win.
      UPDATE public.nomenclature
      SET cost_per_unit = v_new_cost,
          cost_source   = 'catalog_estimate',
          updated_at    = now()
      WHERE id = v_item.id
        AND (cost_per_unit IS NULL OR cost_per_unit = 0);

      IF FOUND THEN
        v_updated := v_updated + 1;
        v_items := v_items || jsonb_build_object(
          'id',       v_item.id,
          'code',     v_item.product_code,
          'old_cost', COALESCE(v_item.cost_per_unit, 0),
          'new_cost', v_new_cost,
          'source',   'catalog_estimate'
        );
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'updated_count', v_updated, 'items', v_items);
END;
$$;

COMMENT ON FUNCTION public.fn_seed_raw_cost_from_catalog(UUID)
  IS 'Seed nomenclature.cost_per_unit for RAW ingredients from the newest supplier_catalog row (last_seen_price / conversion_factor, 1:1 fallback) + cost_source=catalog_estimate. Only touches rows where cost_per_unit IS NULL OR = 0 (never clobbers WAC). Excludes RAW-ICE_CUBES, RAW-RO-WATER. NULL arg = all RAWs. Idempotent. Mirrors mcp-chef bom-walker fallback. Mig 221.';


-- ─── 3. Auto-seed trigger on supplier_catalog ───

CREATE OR REPLACE FUNCTION public.fn_sc_seed_raw_cost()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.nomenclature_id IS NULL OR NEW.last_seen_price IS NULL THEN
    RETURN NEW;
  END IF;

  -- Bounded: only acts when the linked product is a RAW still at NULL/0.
  -- After the first seed cost_per_unit > 0, so repeat scrapes no-op here.
  IF EXISTS (
    SELECT 1 FROM public.nomenclature n
    WHERE n.id = NEW.nomenclature_id
      AND n.product_code LIKE 'RAW-%'
      AND n.product_code NOT IN ('RAW-ICE_CUBES', 'RAW-RO-WATER')
      AND (n.cost_per_unit IS NULL OR n.cost_per_unit = 0)
  ) THEN
    PERFORM public.fn_seed_raw_cost_from_catalog(NEW.nomenclature_id);
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_sc_seed_raw_cost()
  IS 'AFTER INSERT OR UPDATE OF last_seen_price on supplier_catalog: auto-seed cost_per_unit for the linked RAW when still NULL/0. Bounded by the NULL/0 check (no-op once seeded). Mig 221.';

DROP TRIGGER IF EXISTS trg_sc_seed_raw_cost ON public.supplier_catalog;

CREATE TRIGGER trg_sc_seed_raw_cost
  AFTER INSERT OR UPDATE OF last_seen_price ON public.supplier_catalog
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_sc_seed_raw_cost();


-- ─── 4. Stamp cost_source='wac' in the WAC writers ───

-- 4a. Incremental WAC on purchase INSERT (mig 050)
CREATE OR REPLACE FUNCTION public.fn_update_cost_on_purchase()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_current_qty  NUMERIC;
    v_current_cost NUMERIC;
    v_new_wac      NUMERIC;
BEGIN
    SELECT
        COALESCE(v.quantity, 0),
        COALESCE(n.cost_per_unit, 0)
    INTO v_current_qty, v_current_cost
    FROM public.nomenclature n
    LEFT JOIN public.v_inventory_by_nomenclature v ON v.nomenclature_id = n.id
    WHERE n.id = NEW.nomenclature_id;

    IF (v_current_qty + NEW.quantity) > 0 THEN
        v_new_wac := (v_current_qty * v_current_cost + NEW.quantity * NEW.price_per_unit)
                     / (v_current_qty + NEW.quantity);
    ELSE
        v_new_wac := NEW.price_per_unit;
    END IF;

    UPDATE public.nomenclature
    SET cost_per_unit = ROUND(v_new_wac, 4),
        cost_source   = 'wac',
        updated_at    = now()
    WHERE id = NEW.nomenclature_id;

    RETURN NEW;
END;
$function$;

-- 4b. Full-history WAC recompute on re-link (mig 214)
CREATE OR REPLACE FUNCTION public.fn_recalc_wac_for_product(p_nomenclature_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_new_cost NUMERIC;
BEGIN
    IF p_nomenclature_id IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT
        ROUND(SUM(price_per_unit * quantity) / NULLIF(SUM(quantity), 0), 4)
    INTO v_new_cost
    FROM public.purchase_logs
    WHERE nomenclature_id = p_nomenclature_id
      AND quantity > 0
      AND price_per_unit IS NOT NULL;

    UPDATE public.nomenclature
    SET cost_per_unit = v_new_cost,
        cost_source   = CASE WHEN v_new_cost IS NOT NULL THEN 'wac' ELSE 'none' END,
        updated_at    = now()
    WHERE id = p_nomenclature_id;

    RETURN v_new_cost;
END;
$$;


-- ─── 5. fn_rollup_bom_costs: propagate cost_source upward ───
-- (re-creates mig 137 function verbatim + cost_source computation/write)

CREATE OR REPLACE FUNCTION public.fn_rollup_bom_costs(p_nomenclature_id uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_item        RECORD;
  v_new_cost    NUMERIC;
  v_old_cost    NUMERIC;
  v_new_source  TEXT;
  v_old_source  TEXT;
  v_updated     INTEGER := 0;
  v_items       JSONB := '[]'::jsonb;
  v_in_trigger  BOOLEAN;
BEGIN
  v_in_trigger := COALESCE(current_setting('app.bom_rollup_active', true), '') = 'true';
  IF v_in_trigger AND p_nomenclature_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'updated_count', 0, 'skipped', 'recursion_guard');
  END IF;

  PERFORM set_config('app.bom_rollup_active', 'true', true);

  FOR v_item IN
    WITH RECURSIVE bom_depth AS (
      SELECT DISTINCT n.id, n.product_code, n.cost_per_unit, n.cost_source, 0 AS depth
      FROM nomenclature n
      WHERE n.is_available = TRUE
        AND n.product_code NOT LIKE 'RAW-%'
        AND EXISTS (SELECT 1 FROM bom_structures bs WHERE bs.parent_id = n.id)
        AND (p_nomenclature_id IS NULL OR n.id = p_nomenclature_id)

      UNION ALL

      SELECT DISTINCT n.id, n.product_code, n.cost_per_unit, n.cost_source, bd.depth + 1
      FROM bom_depth bd
      JOIN bom_structures bs ON bs.ingredient_id = bd.id
      JOIN nomenclature n ON n.id = bs.parent_id
      WHERE n.is_available = TRUE
        AND bd.depth < 10
    )
    SELECT sub.id, sub.product_code, sub.cost_per_unit, sub.cost_source
    FROM (
      SELECT id, product_code, cost_per_unit, cost_source, MAX(depth) AS max_depth
      FROM bom_depth
      GROUP BY id, product_code, cost_per_unit, cost_source
    ) sub
    ORDER BY sub.max_depth ASC, sub.product_code
  LOOP
    v_old_cost   := COALESCE(v_item.cost_per_unit, 0);
    v_old_source := COALESCE(v_item.cost_source, 'none');

    -- Cost + provenance from BOM children (exclude MOD children of a SALE parent).
    -- yield_loss_pct is LOSS: 15 = 15% lost → gross = net / (1 - loss/100).
    -- cost_source precedence (warn-worst-first): catalog_estimate > manual > wac > none.
    SELECT
      ROUND(COALESCE(SUM(
        COALESCE(child_n.cost_per_unit, 0)
        * bs.quantity_per_unit
        / CASE WHEN COALESCE(bs.yield_loss_pct, 0) > 0
               THEN (1 - bs.yield_loss_pct / 100.0) ELSE 1 END
      ), 0), 4),
      CASE
        WHEN bool_or(child_n.cost_source = 'catalog_estimate') THEN 'catalog_estimate'
        WHEN bool_or(child_n.cost_source = 'manual')           THEN 'manual'
        WHEN bool_or(COALESCE(child_n.cost_per_unit, 0) > 0)    THEN 'wac'
        ELSE 'none'
      END
    INTO v_new_cost, v_new_source
    FROM bom_structures bs
    JOIN nomenclature child_n ON child_n.id = bs.ingredient_id
    WHERE bs.parent_id = v_item.id
      AND NOT (v_item.product_code LIKE 'SALE-%' AND child_n.product_code LIKE 'MOD-%');

    v_new_source := COALESCE(v_new_source, 'none');

    IF v_new_cost IS DISTINCT FROM v_old_cost
       OR v_new_source IS DISTINCT FROM v_old_source THEN
      UPDATE nomenclature
      SET cost_per_unit = v_new_cost,
          cost_source   = v_new_source,
          updated_at    = now()
      WHERE id = v_item.id;

      v_updated := v_updated + 1;
      v_items := v_items || jsonb_build_object(
        'id', v_item.id, 'code', v_item.product_code,
        'old_cost', v_old_cost, 'new_cost', v_new_cost,
        'old_source', v_old_source, 'new_source', v_new_source
      );
    END IF;
  END LOOP;

  PERFORM set_config('app.bom_rollup_active', 'false', true);

  RETURN jsonb_build_object('ok', true, 'updated_count', v_updated, 'items', v_items);
END;
$function$;


-- ─── 6. Backfill ───

DO $$
DECLARE
  v_seed JSONB;
  v_roll JSONB;
BEGIN
  -- 6a. Seed any remaining NULL/0 RAWs from catalog (idempotent)
  SELECT public.fn_seed_raw_cost_from_catalog(NULL) INTO v_seed;
  RAISE NOTICE 'seed-from-catalog: %', v_seed;

  -- 6b. Tag provenance of existing RAW costs.
  -- wac: has purchase history (purchase_logs) and a positive cost.
  UPDATE public.nomenclature n
  SET cost_source = 'wac'
  WHERE n.product_code LIKE 'RAW-%'
    AND COALESCE(n.cost_per_unit, 0) > 0
    AND EXISTS (SELECT 1 FROM public.purchase_logs pl WHERE pl.nomenclature_id = n.id AND pl.quantity > 0);

  -- catalog_estimate: positive cost, no purchase, but a catalog price exists
  -- (covers the 10 smoothie raws set manually from catalog earlier today).
  UPDATE public.nomenclature n
  SET cost_source = 'catalog_estimate'
  WHERE n.product_code LIKE 'RAW-%'
    AND COALESCE(n.cost_per_unit, 0) > 0
    AND n.cost_source <> 'wac'
    AND n.product_code NOT IN ('RAW-ICE_CUBES','RAW-RO-WATER')
    AND NOT EXISTS (SELECT 1 FROM public.purchase_logs pl WHERE pl.nomenclature_id = n.id AND pl.quantity > 0)
    AND EXISTS (SELECT 1 FROM public.supplier_catalog sc WHERE sc.nomenclature_id = n.id AND sc.last_seen_price IS NOT NULL);

  -- manual: positive cost, no purchase, no catalog price
  UPDATE public.nomenclature n
  SET cost_source = 'manual'
  WHERE n.product_code LIKE 'RAW-%'
    AND COALESCE(n.cost_per_unit, 0) > 0
    AND n.cost_source NOT IN ('wac','catalog_estimate')
    AND n.product_code NOT IN ('RAW-ICE_CUBES','RAW-RO-WATER')
    AND NOT EXISTS (SELECT 1 FROM public.purchase_logs pl WHERE pl.nomenclature_id = n.id AND pl.quantity > 0)
    AND NOT EXISTS (SELECT 1 FROM public.supplier_catalog sc WHERE sc.nomenclature_id = n.id AND sc.last_seen_price IS NOT NULL);

  -- 6c. Propagate cost + cost_source onto all PF/SALE dishes.
  SELECT public.fn_rollup_bom_costs(NULL) INTO v_roll;
  RAISE NOTICE 'rollup propagation: updated=%', v_roll->'updated_count';
END;
$$;


-- ─── Migration log ───

INSERT INTO migration_log (filename, applied_by, notes)
VALUES (
  '221_seed_raw_cost_from_catalog.sql',
  'claude-code',
  'Seed RAW cost_per_unit from Makro catalog (fn_seed_raw_cost_from_catalog + AFTER trigger on supplier_catalog.last_seen_price). Add nomenclature.cost_source (wac/catalog_estimate/manual/none); WAC writers stamp wac; fn_rollup_bom_costs propagates estimate upward. Backfill + tag + rollup. Closes admin /menu zero-cost gap.'
) ON CONFLICT (filename) DO NOTHING;
