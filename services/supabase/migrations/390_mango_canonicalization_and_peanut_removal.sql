-- 390 — Fresh-mango canonicalization + removal of the dead peanut-lime sauce (MC 3a11032b)
--
-- The website already says "Mango Sauce" (shishka-health PR #40, merged). The database
-- still said "Peanut-Lime". The site is the correct one. This migration makes the data
-- agree with what the counter actually serves.
--
-- PART A — DEAD PEANUT-LIME SAUCE (allergen risk)
--   All 4 spring rolls carried PF-SAUCE_PEANUT_LIME @ 0.04. That prep contains peanut
--   butter, soy sauce and sesame oil, so fn_dish_allergens asserted
--   allergen-nuts + allergen-soy + allergen-sesame + allergen-gluten on four dishes that
--   are served with mango sauce. Peanut is anaphylaxis-grade; this must not reach
--   schema.org. Replace with PF-MANGO_SAUCE @ 0.04 (same dose, same 2oz cup already in
--   the BOM). PF-MANGO_SAUCE carries no allergen-tagged ingredient, so after this the
--   4 rolls are genuinely gluten-free too (rice paper + rice noodle).
--   NOT touched: SALE-SAUCE_PEANUT (is_web_visible=false, pos_status=draft) keeps
--   PF-SAUCE_PEANUT_LIME alive as a non-public draft SKU. Out of scope here.
--
-- PART B — MANGO CANONICALIZATION
--   CEO 2026-07-29: frozen mango is no longer used at all; the cultivar is NOT fixed
--   ("whatever is in season — yellow"); mango is priced per WHOLE fruit.
--   * ONE generic canonical in kg: RAW-MANGO_FRESH "Ripe Yellow Mango (whole, fresh)",
--     promoted from RAW-AUTO-70ee1d0a (already kg, already generic) so its purchase
--     history is kept. The other 3 fresh stubs merge into it.
--   * The 2 stubs recorded in pack/pcs are the SAME goods at 69 THB/kg, stated verbatim
--     in their own names. Their purchase rows are normalized to kg (total_price is left
--     untouched — the money does not move, only the unit it is expressed in), so the
--     WAC over the merged history is unit-consistent instead of averaging 146-per-"pack"
--     against 69-per-kg. This is the unit normalization mig 325 deferred; it is only 2
--     rows here, all with an unambiguous stated price per kg.
--   * Cost is NOT hardcoded — fn_recalc_wac_for_product() recomputes it from the merged,
--     normalized history (SUM(price*qty)/SUM(qty)); it lands at ~66.84 THB/kg and moves
--     with the season on the next purchase, exactly as the CEO asked.
--   * yield_loss_pct = 35 on all 7 repointed BOM lines (whole ripe mango edible yield
--     ~65%). quantity_per_unit is NET edible flesh by this schema's convention
--     (fn_rollup_bom_costs grosses it up as qty/(1-yield); fn_rollup_bom_nutrition uses
--     qty as-is), so the quantities stay unchanged and only the cost is grossed up.
--   * The frozen family is retired, NOT merged into fresh: frozen diced mango at
--     174-189 THB/kg is different goods from whole fresh fruit at 55-69, and folding its
--     purchase history into the fresh WAC would inflate every mango dish. The 2 frozen
--     RAW-AUTO stubs merge into RAW-FROZEN_MANGO_CHUNKS, then that one SKU is tombstoned.
--
-- SAFETY
--   * Nothing is hard-deleted. Merged stubs are tombstoned ([MERGED->CODE] name prefix).
--   * BOM lines are repointed BEFORE any tombstone, so
--     trg_guard_no_delete_referenced_ingredient never has to be overridden and no
--     soft-deleted RAW is ever left dangling in an active BOM.
--   * WAC / cost-seed triggers are disabled around the repoint and the canonical cost is
--     recomputed explicitly afterwards, so no unrelated nomenclature cost can drift.
--   * Asserts at the tail abort the whole transaction on any violation.

-- ──────────────────────────────────────────────────────────────────────────
-- 0. Snapshot every cost — proof surface for the "no unrelated drift" assert
-- ──────────────────────────────────────────────────────────────────────────
CREATE TEMP TABLE tmp_cost_snap ON COMMIT DROP AS
SELECT id, cost_per_unit, cost_source FROM public.nomenclature;

-- Baseline count of BOM lines already pointing at a soft-deleted ingredient. This repo
-- carries 3 such lines today (RAW-LEMON x2, RAW-CHICKEN-THIGH) — pre-existing debt,
-- tracked separately. The tail assert must prove this migration adds none, not that the
-- number is zero.
CREATE TEMP TABLE tmp_dangling_baseline ON COMMIT DROP AS
SELECT count(*) AS n
FROM public.bom_structures b
JOIN public.nomenclature i ON i.id = b.ingredient_id
WHERE i.is_deleted = true;

-- ──────────────────────────────────────────────────────────────────────────
-- 1. Pre-flight validation — abort early rather than half-apply
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE v_n int;
BEGIN
  -- the promote target code must be free
  IF EXISTS (SELECT 1 FROM public.nomenclature WHERE product_code = 'RAW-MANGO_FRESH') THEN
    RAISE EXCEPTION '390: RAW-MANGO_FRESH already exists';
  END IF;

  -- all 6 source rows must be present and active
  SELECT count(*) INTO v_n FROM public.nomenclature
  WHERE product_code IN ('RAW-AUTO-70ee1d0a','RAW-AUTO-876d30fb','RAW-AUTO-3620156d',
                         'RAW-AUTO-a7d40ab3','RAW-AUTO-b386542d','RAW-AUTO-03808d06')
    AND is_deleted = false;
  IF v_n <> 6 THEN RAISE EXCEPTION '390: expected 6 active mango stubs, found %', v_n; END IF;

  -- the two BOM targets must exist and be active
  SELECT count(*) INTO v_n FROM public.nomenclature
  WHERE product_code IN ('PF-MANGO_SAUCE','RAW-FROZEN_MANGO_CHUNKS') AND is_deleted = false;
  IF v_n <> 2 THEN RAISE EXCEPTION '390: PF-MANGO_SAUCE / RAW-FROZEN_MANGO_CHUNKS missing'; END IF;

  -- exactly the 4 known peanut-lime roll lines
  SELECT count(*) INTO v_n FROM public.bom_structures b
  JOIN public.nomenclature p ON p.id = b.parent_id
  JOIN public.nomenclature i ON i.id = b.ingredient_id
  WHERE i.product_code = 'PF-SAUCE_PEANUT_LIME' AND p.product_code LIKE 'SALE-SUMMER_ROLLS_%';
  IF v_n <> 4 THEN RAISE EXCEPTION '390: expected 4 peanut-lime roll lines, found %', v_n; END IF;

  -- no roll already carries mango sauce (UNIQUE(parent_id, ingredient_id))
  SELECT count(*) INTO v_n FROM public.bom_structures b
  JOIN public.nomenclature p ON p.id = b.parent_id
  JOIN public.nomenclature i ON i.id = b.ingredient_id
  WHERE i.product_code = 'PF-MANGO_SAUCE' AND p.product_code LIKE 'SALE-SUMMER_ROLLS_%';
  IF v_n <> 0 THEN RAISE EXCEPTION '390: % roll(s) already carry PF-MANGO_SAUCE', v_n; END IF;

  -- exactly the 7 known frozen-mango lines
  SELECT count(*) INTO v_n FROM public.bom_structures b
  JOIN public.nomenclature i ON i.id = b.ingredient_id
  WHERE i.product_code = 'RAW-FROZEN_MANGO_CHUNKS';
  IF v_n <> 7 THEN RAISE EXCEPTION '390: expected 7 frozen-mango BOM lines, found %', v_n; END IF;

  -- no parent already carries the fresh canonical source row (would collide on repoint)
  SELECT count(*) INTO v_n
  FROM public.bom_structures b
  JOIN public.nomenclature i ON i.id = b.ingredient_id
  WHERE i.product_code = 'RAW-AUTO-70ee1d0a';
  IF v_n <> 0 THEN RAISE EXCEPTION '390: RAW-AUTO-70ee1d0a is already used in % BOM line(s)', v_n; END IF;
END $$;

-- ──────────────────────────────────────────────────────────────────────────
-- 2. Freeze the cost machinery around the repoint
-- ──────────────────────────────────────────────────────────────────────────
ALTER TABLE public.purchase_logs    DISABLE TRIGGER trg_recalc_wac_on_purchase_update;
ALTER TABLE public.purchase_logs    DISABLE TRIGGER trg_update_cost_on_purchase;
ALTER TABLE public.purchase_logs    DISABLE TRIGGER trg_purchase_log_correction;
ALTER TABLE public.supplier_catalog DISABLE TRIGGER trg_sc_seed_raw_cost;

-- ──────────────────────────────────────────────────────────────────────────
-- 3. Unit normalization — express the 2 pack/pcs mango purchases in kg.
--    Both rows state their own price per kg in the item text (69 THB/kg).
--    total_price is deliberately NOT changed: the money is the source document.
-- ──────────────────────────────────────────────────────────────────────────
UPDATE public.purchase_logs pl
SET quantity        = ROUND(pl.total_price / 69.0, 6),
    price_per_unit  = 69.0,
    notes           = COALESCE(pl.notes,'') || ' [390: normalized to kg @69 THB/kg; total_price unchanged]'
FROM public.nomenclature n
WHERE n.id = pl.nomenclature_id
  AND n.product_code IN ('RAW-AUTO-3620156d','RAW-AUTO-a7d40ab3');

-- ──────────────────────────────────────────────────────────────────────────
-- 4. PROMOTE RAW-AUTO-70ee1d0a → RAW-MANGO_FRESH (keeps its purchase history)
--    Nutrition is per BASE UNIT (per kg), matching this schema's RAW convention:
--    ripe mango flesh ≈ 60 kcal / 0.8 p / 15 c / 0.4 f per 100 g.
--    Ops fields (shelf life, count class, stock sheet) inherit the retiring frozen
--    SKU's role in the stock count; flagged for chef review in the MC task.
-- ──────────────────────────────────────────────────────────────────────────
UPDATE public.nomenclature
SET product_code      = 'RAW-MANGO_FRESH',
    name              = 'Ripe Yellow Mango (whole, fresh)',
    type              = 'raw_ingredient',
    base_unit         = 'kg',
    is_available      = true,
    calories          = 600,
    protein           = 8,
    carbs             = 150,
    fat               = 4,
    storage_type      = 'chilled',
    storage_location  = 'fridge',
    shelf_life_days   = 5,
    count_class       = 'B',
    in_stock_sheet    = true,
    notes             = 'Canonical fresh mango. Cultivar is intentionally NOT fixed — whatever yellow mango is in season (CEO 2026-07-29). Priced per WHOLE fruit, so BOM lines carry yield_loss_pct=35 (~65% edible). Merged from RAW-AUTO-70ee1d0a/876d30fb/3620156d/a7d40ab3 in mig 390.',
    updated_at        = now()
WHERE product_code = 'RAW-AUTO-70ee1d0a';

-- ──────────────────────────────────────────────────────────────────────────
-- 5. Resolve stub → target for every repoint (3 fresh + 2 frozen)
-- ──────────────────────────────────────────────────────────────────────────
CREATE TEMP TABLE tmp_resolve ON COMMIT DROP AS
SELECT s.id AS stub_id, t.id AS target_id, m.target_code
FROM (VALUES
  ('RAW-AUTO-876d30fb','RAW-MANGO_FRESH'),
  ('RAW-AUTO-3620156d','RAW-MANGO_FRESH'),
  ('RAW-AUTO-a7d40ab3','RAW-MANGO_FRESH'),
  ('RAW-AUTO-b386542d','RAW-FROZEN_MANGO_CHUNKS'),
  ('RAW-AUTO-03808d06','RAW-FROZEN_MANGO_CHUNKS')
) AS m(stub_code, target_code)
JOIN public.nomenclature s ON s.product_code = m.stub_code
JOIN public.nomenclature t ON t.product_code = m.target_code;

-- 6. REPOINT history stub → canonical (same table list as mig 325)
UPDATE public.purchase_logs      x SET nomenclature_id=r.target_id FROM tmp_resolve r WHERE x.nomenclature_id=r.stub_id;
UPDATE public.receiving_lines    x SET nomenclature_id=r.target_id FROM tmp_resolve r WHERE x.nomenclature_id=r.stub_id;
UPDATE public.supplier_catalog   x SET nomenclature_id=r.target_id FROM tmp_resolve r WHERE x.nomenclature_id=r.stub_id;
UPDATE public.inventory_batches  x SET nomenclature_id=r.target_id FROM tmp_resolve r WHERE x.nomenclature_id=r.stub_id;
UPDATE public.stock_movements    x SET nomenclature_id=r.target_id FROM tmp_resolve r WHERE x.nomenclature_id=r.stub_id;
UPDATE public.stocktake_entries  x SET nomenclature_id=r.target_id FROM tmp_resolve r WHERE x.nomenclature_id=r.stub_id;
UPDATE public.sku                x SET nomenclature_id=r.target_id FROM tmp_resolve r WHERE x.nomenclature_id=r.stub_id;
UPDATE public.sku_balances       x SET nomenclature_id=r.target_id FROM tmp_resolve r WHERE x.nomenclature_id=r.stub_id;
UPDATE public.waste_logs         x SET nomenclature_id=r.target_id FROM tmp_resolve r WHERE x.nomenclature_id=r.stub_id;
UPDATE public.shopping_list_items x SET nomenclature_id=r.target_id FROM tmp_resolve r WHERE x.nomenclature_id=r.stub_id;
UPDATE public.stock_request_lines x SET nomenclature_id=r.target_id FROM tmp_resolve r WHERE x.nomenclature_id=r.stub_id;
UPDATE public.po_lines           x SET nomenclature_id=r.target_id FROM tmp_resolve r WHERE x.nomenclature_id=r.stub_id;
UPDATE public.unmatched_items    x SET resolved_to=r.target_id     FROM tmp_resolve r WHERE x.resolved_to=r.stub_id;
UPDATE public.unmatched_items    x SET suggested_match=r.target_id FROM tmp_resolve r WHERE x.suggested_match=r.stub_id;

-- 7. TOMBSTONE the merged stubs
UPDATE public.nomenclature n
SET is_deleted=true, is_available=false, in_stock_sheet=false,
    name='[MERGED->'||r.target_code||'] '||n.name, updated_at=now()
FROM tmp_resolve r
WHERE n.id = r.stub_id;

-- ──────────────────────────────────────────────────────────────────────────
-- 8. PART A — swap the dead peanut-lime sauce for mango sauce in the 4 rolls
-- ──────────────────────────────────────────────────────────────────────────
UPDATE public.bom_structures b
SET ingredient_id = (SELECT id FROM public.nomenclature WHERE product_code='PF-MANGO_SAUCE'),
    notes = COALESCE(b.notes,'') || ' [390: was PF-SAUCE_PEANUT_LIME — never served; site says mango]'
FROM public.nomenclature p, public.nomenclature i
WHERE p.id = b.parent_id AND i.id = b.ingredient_id
  AND i.product_code = 'PF-SAUCE_PEANUT_LIME'
  AND p.product_code LIKE 'SALE-SUMMER_ROLLS_%';

-- ──────────────────────────────────────────────────────────────────────────
-- 9. PART B — repoint the 7 frozen-mango lines to fresh + apply the whole-fruit yield
-- ──────────────────────────────────────────────────────────────────────────
UPDATE public.bom_structures b
SET ingredient_id  = (SELECT id FROM public.nomenclature WHERE product_code='RAW-MANGO_FRESH'),
    yield_loss_pct = 35,
    notes = COALESCE(b.notes,'') || ' [390: frozen->fresh whole mango; yield 35% (~65% edible)]'
FROM public.nomenclature i
WHERE i.id = b.ingredient_id
  AND i.product_code = 'RAW-FROZEN_MANGO_CHUNKS';

-- ──────────────────────────────────────────────────────────────────────────
-- 10. Retire the frozen SKU (now zero BOM references, zero inventory)
-- ──────────────────────────────────────────────────────────────────────────
UPDATE public.nomenclature
SET is_deleted=true, is_available=false, in_stock_sheet=false,
    name='[RETIRED 390] '||name,
    notes = COALESCE(notes,'') || ' Retired 2026-07-29 (mig 390): frozen mango is no longer used — replaced by RAW-MANGO_FRESH.',
    updated_at=now()
WHERE product_code = 'RAW-FROZEN_MANGO_CHUNKS';

-- ──────────────────────────────────────────────────────────────────────────
-- 11. Re-enable the cost machinery and recompute
-- ──────────────────────────────────────────────────────────────────────────
ALTER TABLE public.purchase_logs    ENABLE TRIGGER trg_recalc_wac_on_purchase_update;
ALTER TABLE public.purchase_logs    ENABLE TRIGGER trg_update_cost_on_purchase;
ALTER TABLE public.purchase_logs    ENABLE TRIGGER trg_purchase_log_correction;
ALTER TABLE public.supplier_catalog ENABLE TRIGGER trg_sc_seed_raw_cost;

-- canonical mango cost from its own merged, unit-consistent purchase history
SELECT public.fn_recalc_wac_for_product(
  (SELECT id FROM public.nomenclature WHERE product_code='RAW-MANGO_FRESH')
);

-- Re-roll cost + nutrition/allergen arrays for the affected items ONLY, in dependency
-- order (prep before the dishes that contain it). The trg_cascade_* triggers stayed
-- enabled and already did most of this; these calls make the final state deterministic
-- regardless of the order the cascades happened to fire in. Deliberately NOT the global
-- fn_rollup_bom_costs() — that would also "fix" unrelated stale items, silently widening
-- this migration's blast radius past what the task authorized.
DO $$
DECLARE v_id uuid; v_code text;
BEGIN
  FOREACH v_code IN ARRAY ARRAY[
    'PF-MANGO_SAUCE',
    'SALE-SAUCE_MANGO',
    'SALE-SUMMER_ROLLS_CHICKEN','SALE-SUMMER_ROLLS_SHRIMP',
    'SALE-SUMMER_ROLLS_TUNA_CORN','SALE-SUMMER_ROLLS_VEGGIE',
    'SALE-SMOOTHIE_PASSION_MANGO','SALE-SMOOTHIE_MANGO_STRAWBERRY'
  ] LOOP
    SELECT id INTO v_id FROM public.nomenclature WHERE product_code = v_code;
    PERFORM public.fn_rollup_bom_costs(v_id);
    PERFORM public.fn_rollup_bom_nutrition(v_id);
  END LOOP;
END $$;

-- ──────────────────────────────────────────────────────────────────────────
-- 12. ASSERTIONS
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE v_n int; v_cost numeric; v_drift int;
BEGIN
  -- (a) no roll asserts peanut / soy / sesame / gluten any more
  SELECT count(*) INTO v_n
  FROM public.nomenclature n
  WHERE n.product_code LIKE 'SALE-SUMMER_ROLLS_%'
    AND public.fn_dish_allergens(n.id) && ARRAY['allergen-nuts','allergen-soy','allergen-sesame','allergen-gluten'];
  IF v_n > 0 THEN RAISE EXCEPTION '390 ABORT: % roll(s) still assert peanut/soy/sesame/gluten', v_n; END IF;

  -- (b) the manual allergens array agrees (it is derived by fn_rollup_bom_nutrition)
  SELECT count(*) INTO v_n
  FROM public.nomenclature n
  WHERE n.product_code LIKE 'SALE-SUMMER_ROLLS_%'
    AND COALESCE(n.allergens,'{}') && ARRAY['peanuts','soy','sesame','gluten'];
  IF v_n > 0 THEN RAISE EXCEPTION '390 ABORT: % roll(s) still list peanuts/soy/sesame/gluten in nomenclature.allergens', v_n; END IF;

  -- (c1) nothing this migration retired is still referenced by any BOM line
  SELECT count(*) INTO v_n
  FROM public.bom_structures b JOIN public.nomenclature i ON i.id=b.ingredient_id
  WHERE i.product_code IN ('RAW-FROZEN_MANGO_CHUNKS','RAW-AUTO-876d30fb','RAW-AUTO-3620156d',
                           'RAW-AUTO-a7d40ab3','RAW-AUTO-b386542d','RAW-AUTO-03808d06');
  IF v_n > 0 THEN RAISE EXCEPTION '390 ABORT: % BOM line(s) still reference a SKU retired here', v_n; END IF;

  -- (c2) this migration adds no new dangling line on top of the pre-existing debt
  SELECT count(*) INTO v_n
  FROM public.bom_structures b JOIN public.nomenclature i ON i.id=b.ingredient_id
  WHERE i.is_deleted = true;
  IF v_n > (SELECT n FROM tmp_dangling_baseline) THEN
    RAISE EXCEPTION '390 ABORT: dangling BOM lines rose from % to %',
      (SELECT n FROM tmp_dangling_baseline), v_n;
  END IF;

  -- (d) all 7 mango lines now point at the canonical and carry the whole-fruit yield
  SELECT count(*) INTO v_n
  FROM public.bom_structures b JOIN public.nomenclature i ON i.id=b.ingredient_id
  WHERE i.product_code='RAW-MANGO_FRESH' AND b.yield_loss_pct = 35;
  IF v_n <> 7 THEN RAISE EXCEPTION '390 ABORT: expected 7 fresh-mango lines at yield 35, found %', v_n; END IF;

  -- (e) the canonical cost came out in the real purchased range, not a frozen-price echo
  SELECT cost_per_unit INTO v_cost FROM public.nomenclature WHERE product_code='RAW-MANGO_FRESH';
  IF v_cost IS NULL OR v_cost < 50 OR v_cost > 80 THEN
    RAISE EXCEPTION '390 ABORT: RAW-MANGO_FRESH cost % THB/kg outside the purchased 55-69 range', v_cost;
  END IF;

  -- (f) no cost moved on anything outside the mango / spring-roll blast radius
  SELECT count(*) INTO v_drift
  FROM public.nomenclature n JOIN tmp_cost_snap s ON s.id=n.id
  WHERE n.cost_per_unit IS DISTINCT FROM s.cost_per_unit
    AND n.product_code NOT IN (
      'RAW-MANGO_FRESH','RAW-AUTO-70ee1d0a','PF-MANGO_SAUCE','SALE-SAUCE_MANGO',
      'SALE-SMOOTHIE_PASSION_MANGO','SALE-SMOOTHIE_MANGO_STRAWBERRY',
      'SALE-SUMMER_ROLLS_CHICKEN','SALE-SUMMER_ROLLS_SHRIMP',
      'SALE-SUMMER_ROLLS_TUNA_CORN','SALE-SUMMER_ROLLS_VEGGIE');
  IF v_drift > 0 THEN RAISE EXCEPTION '390 ABORT: % unrelated cost(s) drifted', v_drift; END IF;

  RAISE NOTICE '390 OK: peanut-lime removed from 4 rolls, 4 fresh stubs merged into RAW-MANGO_FRESH @ % THB/kg, 7 BOM lines repointed at yield 35, frozen family retired', v_cost;
END $$;

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '390_mango_canonicalization_and_peanut_removal.sql',
  'claude-code',
  NULL,
  'MC 3a11032b. Part A: PF-SAUCE_PEANUT_LIME -> PF-MANGO_SAUCE in the 4 spring rolls (kills a false peanut/soy/sesame/gluten assertion on sellable dishes). Part B: 4 fresh-mango RAW-AUTO stubs merged into new canonical RAW-MANGO_FRESH (kg, WAC recomputed from unit-normalized history ~66.8 THB/kg); 7 BOM lines repointed with yield_loss_pct=35 (whole fruit); frozen mango family (RAW-FROZEN_MANGO_CHUNKS + 2 stubs) retired.'
)
ON CONFLICT DO NOTHING;

-- DOWN (manual): restore tombstones
--   UPDATE nomenclature SET is_deleted=false, is_available=true,
--     name = regexp_replace(name,'^\[(MERGED->[^]]+|RETIRED 390)\] ','')
--   WHERE name ~ '^\[(MERGED->|RETIRED 390)';
--   then rename RAW-MANGO_FRESH back to RAW-AUTO-70ee1d0a, repoint the 7 BOM lines to
--   RAW-FROZEN_MANGO_CHUNKS with yield_loss_pct=NULL, repoint the 4 roll sauce lines back
--   to PF-SAUCE_PEANUT_LIME, restore the 2 normalized purchase rows to pack/pcs, and
--   re-run fn_rollup_bom_costs() + fn_rollup_bom_nutrition().
--   Practically: PITR restore is safer than a hand reversal.
