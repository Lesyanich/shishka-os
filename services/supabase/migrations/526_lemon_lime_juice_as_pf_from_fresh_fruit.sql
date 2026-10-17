-- 526 — lemon juice and lime juice become in-house PF items made from FRESH fruit
--       (MC c223bbf5, on the CEO's decision; parent audit MC 00a81c22)
--
-- ⚠ THE YIELD IN THIS MIGRATION IS A TYPICAL-VALUE ESTIMATE, NOT A MEASURED FIGURE. ⚠
-- Nobody in the kitchen has measured how much juice a lemon or a lime gives. The CEO approved a
-- placeholder taken from commonly cited yields, to be overwritten by one UPDATE once the chef
-- measures. It is labelled an estimate in three places: this header, the notes on both BOM
-- lines, and a comment on MC c223bbf5.
--
-- THE CEO'S ANSWER. "For juice the kitchen uses fresh lemons and fresh limes." So RAW-LEMON-JUICE
-- and RAW-LIME-JUICE were never purchased ingredients (0 purchases each); they carried hand-typed
-- costs (250 and 140 THB/L, cost_source = manual) that do not follow the price of fruit. Same
-- shape as migration 493 (ice from water): promote each juice to a PF with a BOM.
--
-- THE ESTIMATE, with the arithmetic (this is the only place the yield is assumed):
--   lemon: ~40-45 ml juice per fruit, midpoint 42.5 ml  ->  1000 / 42.5 = 23.53 lemons per litre
--   lime : ~25-30 ml juice per fruit, midpoint 27.5 ml  ->  1000 / 27.5 = 36.36 limes  per litre
-- Juice yield is already net of peel and pith, so yield_loss_pct = 0 on both lines.
--
-- THE UNIT TRAP, checked and handled. Both fruit canonicals have base_unit 'pcs' but are costed
-- per PACK, not per fruit:
--   RAW-LEMON       74.5555 THB per 'Lemon Pack 4 pcs'  -> 4 fruits per base unit -> 18.64 THB/fruit
--   RAW-LIME-FRESH  229.00  THB per 'pack of 25 fruits' -> 25 fruits per base unit ->  9.16 THB/fruit
-- A BOM quantity of "23.53" against RAW-LEMON would therefore have priced 23.53 PACKS (1,754
-- THB/L), a 4x overstatement. The BOM quantity is in PACKS:
--   lemon: 23.529 fruits / 4  = 5.882353 packs per litre
--   lime : 36.364 fruits / 25 = 1.454545 packs per litre
-- Resulting cost (at today's fruit costs): lemon juice ~438.56 THB/L (was 250, +75%),
-- lime juice ~333.09 THB/L (was 140, +138%).
--
-- WHY THE RENAME RAW- -> PF- IS LOAD-BEARING (same as 493). fn_rollup_bom_costs seeds its
-- recursion with `product_code NOT LIKE 'RAW-%'`, so a RAW- item with a recipe is never rolled up.
-- The UUID is unchanged, so all 20 BOM lines that use the juices (16 semi-finished parents) stay
-- intact. And, learned from 495, nomenclature.type moves to 'semi_finished' IN THIS migration.
--
-- THE MANUAL-COST PROTECTION. The juices carry cost_source = 'manual'. For a PF the rollup
-- recomputes cost AND cost_source from the children and writes both (it does not skip manual
-- parents), so the typed number is overwritten; asserted below. Note the inherited source: lime
-- juice reads 'manual' because its fruit RAW-LIME-FRESH is itself a hand-set 229 (see below),
-- lemon juice reads 'wac'.
--
-- COST BASIS CHECKED AGAINST RECEIPTS (not changed here — out of scope, flagged to MC):
--   RAW-LEMON      3 purchases: 69 (31-03, pack of 4), 2 x 79 (10-10, "Yellow Limes 4 pcs" — the
--                  same lemons mis-titled). Cost 74.56 is the pooled figure; the LAST paid is 79
--                  per pack = 19.75/fruit.
--   RAW-LIME-FRESH cost is a hand-set 229, but the most recent receipt (10-10) is 99 THB for a
--                  pack of 25 (3.96/fruit), and two RAW-AUTO stubs show 10-packs at 49-59. If 99
--                  is the real current price, lime juice is overstated ~2.3x. Not touched: the
--                  brief forbids changing other nomenclature. See MC c223bbf5.
--
-- OLD CODES STILL RESOLVE. Nothing keyed by text points at the old codes except one tombstone:
-- supplier_catalog, sku, purchase_logs, correction_rules, inventory_batches and loyverse_item_sync
-- hold ZERO rows for either juice (they are keyed by UUID anyway, which does not change).
-- The tombstone RAW-AUTO-f2cfdee2 carries '[MERGED->RAW-LEMON-JUICE]', which fn_match_nomenclature
-- resolves by product_code — the rename would have orphaned it, so its prefix is rewritten to the
-- new code and the redirect is replayed through the live matcher below.
-- BEHAVIOUR CHANGE, stated plainly: the matcher's `name:nomenclature` level only looks at
-- RAW-/NF- codes, so a receipt line literally named "Lemon Juice" no longer lands on the juice
-- (which is correct: we make it, we do not buy it). It falls to the stub path instead.
--
-- NUTRITION IS NOT TOUCHED. A BOM insert fires trg_cascade_bom_nutrition_on_bom, which could
-- recompute calories/protein/fat/carbs from fruit sold per pack (pcs) — the per-base-unit trap
-- recorded in gotcha_raw_nutrition_per_base_unit_x10. This migration changes cost only, so that
-- trigger is disabled for the transaction and a nutrition snapshot is asserted unchanged.
--
-- NO MONEY MOVES. No purchase_logs row is touched; sum(total_price) and row count asserted.
-- Not touched: RAW-LIME (frozen ARO juice), RAW-LEMON, RAW-LIME-FRESH, receipts.
--
-- TO REPLACE THE ESTIMATE once measured (chef: squeeze 20 lemons / 20 limes, measure ml):
--   UPDATE bom_structures SET quantity_per_unit = round(1000.0 / <ml_per_fruit> / 4, 6),
--          notes = 'measured <date>: <ml> ml/lemon' WHERE ... (parent PF-LEMON_JUICE)
--   UPDATE bom_structures SET quantity_per_unit = round(1000.0 / <ml_per_fruit> / 25, 6),
--          notes = 'measured <date>: <ml> ml/lime'  WHERE ... (parent PF-LIME_JUICE)
--
-- Applied through the Supabase connector (claude.ai), one transaction.

BEGIN;

CREATE TEMP TABLE tmp_money AS
    SELECT coalesce(sum(total_price),0) AS s, count(*) AS c FROM public.purchase_logs;
CREATE TEMP TABLE tmp_before AS
    SELECT id, product_code, cost_per_unit, cost_source, type, calories, protein, fat, carbs
      FROM public.nomenclature;

DO $$
BEGIN
    IF (SELECT count(*) FROM public.nomenclature
         WHERE product_code IN ('RAW-LEMON-JUICE','RAW-LIME-JUICE') AND type='raw_ingredient'
           AND cost_source='manual') <> 2 THEN
        RAISE EXCEPTION '526 abort: the two juices are not the manual raw_ingredient rows expected';
    END IF;
    IF EXISTS (SELECT 1 FROM public.nomenclature WHERE product_code IN ('PF-LEMON_JUICE','PF-LIME_JUICE')) THEN
        RAISE EXCEPTION '526 abort: a PF juice code already exists';
    END IF;
    IF EXISTS (SELECT 1 FROM public.bom_structures bs JOIN public.nomenclature n ON n.id=bs.parent_id
                WHERE n.product_code IN ('RAW-LEMON-JUICE','RAW-LIME-JUICE')) THEN
        RAISE EXCEPTION '526 abort: a juice already has a BOM';
    END IF;
    IF (SELECT base_unit FROM public.nomenclature WHERE product_code='RAW-LEMON') <> 'pcs'
       OR (SELECT base_unit FROM public.nomenclature WHERE product_code='RAW-LIME-FRESH') <> 'pcs' THEN
        RAISE EXCEPTION '526 abort: fruit base units are not the pack-priced pcs this migration assumes';
    END IF;
    -- The pack-size assumption is the whole unit trap: refuse to run if the costs are no longer pack-sized.
    IF (SELECT cost_per_unit FROM public.nomenclature WHERE product_code='RAW-LEMON') NOT BETWEEN 30 AND 200
       OR (SELECT cost_per_unit FROM public.nomenclature WHERE product_code='RAW-LIME-FRESH') NOT BETWEEN 60 AND 600 THEN
        RAISE EXCEPTION '526 abort: fruit costs no longer look like per-pack prices';
    END IF;
END $$;

-- §1 Rename + tier, same transaction (the rename is what makes the rollup run; the type is 495's lesson).
UPDATE public.nomenclature
   SET product_code = 'PF-LEMON_JUICE', type = 'semi_finished', updated_at = now()
 WHERE product_code = 'RAW-LEMON-JUICE';
UPDATE public.nomenclature
   SET product_code = 'PF-LIME_JUICE', type = 'semi_finished', updated_at = now()
 WHERE product_code = 'RAW-LIME-JUICE';

-- §2 Keep the one redirect that named the old code working.
UPDATE public.nomenclature
   SET name = replace(name, '[MERGED->RAW-LEMON-JUICE]', '[MERGED->PF-LEMON_JUICE]'), updated_at = now()
 WHERE name LIKE '[MERGED->RAW-LEMON-JUICE]%';
UPDATE public.nomenclature
   SET name = replace(name, '[MERGED->RAW-LIME-JUICE]', '[MERGED->PF-LIME_JUICE]'), updated_at = now()
 WHERE name LIKE '[MERGED->RAW-LIME-JUICE]%';

-- §3 The recipes — ESTIMATED yield, in PACKS (see header). Nutrition trigger off for this txn only.
ALTER TABLE public.bom_structures DISABLE TRIGGER trg_cascade_bom_nutrition_on_bom;

INSERT INTO public.bom_structures (parent_id, ingredient_id, quantity_per_unit, yield_loss_pct, notes)
SELECT p.id, c.id, round(1000.0 / 42.5 / 4, 6), 0,
       'mig526 ESTIMATE, NOT MEASURED: typical lemon gives ~42.5 ml juice (range 40-45), so 1 L = '
    || '23.53 lemons = 5.882353 packs of 4. Quantity is in PACKS because RAW-LEMON is costed per '
    || 'pack of 4. Chef: measure real ml per lemon, then UPDATE this row (1000/ml/4).'
  FROM public.nomenclature p, public.nomenclature c
 WHERE p.product_code = 'PF-LEMON_JUICE' AND c.product_code = 'RAW-LEMON';

INSERT INTO public.bom_structures (parent_id, ingredient_id, quantity_per_unit, yield_loss_pct, notes)
SELECT p.id, c.id, round(1000.0 / 27.5 / 25, 6), 0,
       'mig526 ESTIMATE, NOT MEASURED: typical lime gives ~27.5 ml juice (range 25-30), so 1 L = '
    || '36.36 limes = 1.454545 packs of 25. Quantity is in PACKS because RAW-LIME-FRESH is costed '
    || 'per pack of 25. Chef: measure real ml per lime, then UPDATE this row (1000/ml/25).'
  FROM public.nomenclature p, public.nomenclature c
 WHERE p.product_code = 'PF-LIME_JUICE' AND c.product_code = 'RAW-LIME-FRESH';

ALTER TABLE public.bom_structures ENABLE TRIGGER trg_cascade_bom_nutrition_on_bom;

-- §4 Roll the juices (and, recursively, everything that uses them) up from the fruit.
SELECT public.fn_rollup_bom_costs(id) FROM public.nomenclature
 WHERE product_code IN ('PF-LEMON_JUICE','PF-LIME_JUICE');

-- ──────────────────────────────────────────────────────────────────────────
-- Asserts
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
    b record; a record; v numeric; v_src text; v_bad int; v_list text; v_code text; v_level text;
    v_lemon numeric; v_lime numeric;
BEGIN
    SELECT * INTO b FROM tmp_money;
    SELECT coalesce(sum(total_price),0) AS s, count(*) AS c INTO a FROM public.purchase_logs;
    IF a.s <> b.s OR a.c <> b.c THEN
        RAISE EXCEPTION '526 abort: money or rows moved, % / % -> % / %', b.s, b.c, a.s, a.c;
    END IF;

    SELECT cost_per_unit INTO v_lemon FROM public.nomenclature WHERE product_code='RAW-LEMON';
    SELECT cost_per_unit INTO v_lime  FROM public.nomenclature WHERE product_code='RAW-LIME-FRESH';

    -- Juice cost = fruits-per-litre x per-fruit cost (pack cost / fruits per pack).
    SELECT cost_per_unit, cost_source INTO v, v_src FROM public.nomenclature WHERE product_code='PF-LEMON_JUICE';
    IF abs(v - (1000.0/42.5) * (v_lemon/4)) > 0.01 THEN
        RAISE EXCEPTION '526 abort: lemon juice % <> % (23.53 fruits x % per fruit)', v, (1000.0/42.5)*(v_lemon/4), v_lemon/4;
    END IF;
    IF v_src = 'manual' AND v_src IS DISTINCT FROM (SELECT cost_source FROM public.nomenclature WHERE product_code='RAW-LEMON') THEN
        RAISE EXCEPTION '526 abort: lemon juice kept a protected manual source';
    END IF;
    IF v_src IN ('none') THEN RAISE EXCEPTION '526 abort: lemon juice got no cost source'; END IF;

    SELECT cost_per_unit, cost_source INTO v, v_src FROM public.nomenclature WHERE product_code='PF-LIME_JUICE';
    IF abs(v - (1000.0/27.5) * (v_lime/25)) > 0.01 THEN
        RAISE EXCEPTION '526 abort: lime juice % <> % (36.36 fruits x % per fruit)', v, (1000.0/27.5)*(v_lime/25), v_lime/25;
    END IF;
    IF v = 140 THEN RAISE EXCEPTION '526 abort: lime juice still carries the typed 140'; END IF;

    -- Tier: PF- with type semi_finished, BOM present, and both old users intact.
    IF (SELECT count(*) FROM public.nomenclature
         WHERE product_code IN ('PF-LEMON_JUICE','PF-LIME_JUICE') AND type='semi_finished') <> 2 THEN
        RAISE EXCEPTION '526 abort: a juice is not semi_finished';
    END IF;
    IF (SELECT count(*) FROM public.bom_structures bs JOIN public.nomenclature n ON n.id=bs.ingredient_id
         WHERE n.product_code='PF-LEMON_JUICE') <> 16
       OR (SELECT count(*) FROM public.bom_structures bs JOIN public.nomenclature n ON n.id=bs.ingredient_id
            WHERE n.product_code='PF-LIME_JUICE') <> 4 THEN
        RAISE EXCEPTION '526 abort: juice users lost in the rename';
    END IF;

    -- Only the juices and things that (transitively) use them may change cost.
    SELECT count(*), string_agg(product_code, ', ') INTO v_bad, v_list FROM (
        WITH RECURSIVE up AS (
            SELECT n.id FROM public.nomenclature n WHERE n.product_code IN ('PF-LEMON_JUICE','PF-LIME_JUICE')
            UNION
            SELECT bs.parent_id FROM public.bom_structures bs JOIN up ON bs.ingredient_id = up.id)
        SELECT n.product_code FROM public.nomenclature n JOIN tmp_before t ON t.id = n.id
         WHERE (n.cost_per_unit IS DISTINCT FROM t.cost_per_unit OR n.cost_source IS DISTINCT FROM t.cost_source)
           AND n.id NOT IN (SELECT id FROM up)) s;
    IF v_bad > 0 THEN
        RAISE EXCEPTION '526 abort: % unintended cost change(s): %', v_bad, v_list;
    END IF;

    -- Fruit rows untouched.
    IF EXISTS (SELECT 1 FROM public.nomenclature n JOIN tmp_before t ON t.id=n.id
                WHERE n.product_code IN ('RAW-LEMON','RAW-LIME-FRESH','RAW-LIME')
                  AND (n.cost_per_unit IS DISTINCT FROM t.cost_per_unit OR n.cost_source IS DISTINCT FROM t.cost_source)) THEN
        RAISE EXCEPTION '526 abort: a fruit / frozen-lime cost moved';
    END IF;

    -- Nutrition untouched everywhere.
    SELECT count(*) INTO v_bad FROM public.nomenclature n JOIN tmp_before t ON t.id=n.id
     WHERE n.calories IS DISTINCT FROM t.calories OR n.protein IS DISTINCT FROM t.protein
        OR n.fat IS DISTINCT FROM t.fat OR n.carbs IS DISTINCT FROM t.carbs;
    IF v_bad > 0 THEN RAISE EXCEPTION '526 abort: % nutrition value(s) changed', v_bad; END IF;

    -- Matcher replay: the tombstone redirect must land on the new lemon juice code.
    SELECT n.product_code, m.match_level INTO v_code, v_level
      FROM public.fn_match_nomenclature(NULL, NULL, NULL, 'Frozen Lemon Juice Soon', NULL) m
      LEFT JOIN public.nomenclature n ON n.id = m.nomenclature_id;
    IF v_code IS DISTINCT FROM 'PF-LEMON_JUICE' THEN
        RAISE EXCEPTION '526 abort: tombstone redirect resolves to % at level %, expected PF-LEMON_JUICE',
            coalesce(v_code,'(none)'), v_level;
    END IF;

    -- Conflicting-barcode check (gotcha_repoint_is_also_a_lesson_to_the_matcher): nothing taught wrongly.
    IF EXISTS (SELECT 1 FROM public.correction_rules
                WHERE rule_type='nomenclature' AND match_field='barcode'
                GROUP BY match_pattern HAVING count(DISTINCT correction_value->>'nomenclature_id') > 1) THEN
        RAISE EXCEPTION '526 abort: a barcode now points at two targets in correction_rules';
    END IF;
END $$;

INSERT INTO public.migration_log (filename, applied_by, status, notes)
VALUES ('526_lemon_lime_juice_as_pf_from_fresh_fruit.sql', 'claude-opus-session-92b8d233', 'success',
        'MC c223bbf5, on the CEO decision that juice is made from fresh lemons and limes. '
     || 'RAW-LEMON-JUICE -> PF-LEMON_JUICE and RAW-LIME-JUICE -> PF-LIME_JUICE, type semi_finished '
     || '(rename is required: fn_rollup_bom_costs skips RAW-%), each with a BOM of fresh fruit in '
     || 'PACKS (lemon 5.882353 packs of 4 per L; lime 1.454545 packs of 25 per L). THE YIELD IS A '
     || 'TYPICAL-VALUE ESTIMATE, NOT MEASURED (lemon 42.5 ml/fruit, lime 27.5 ml/fruit); chef must '
     || 'measure ml per fruit and UPDATE the two BOM lines. Typed 250/140 THB/L replaced by rollup. '
     || 'Tombstone [MERGED->RAW-LEMON-JUICE] repointed to the new code and replayed through the '
     || 'matcher. No purchase_logs money moved, nutrition untouched, asserted in-transaction.')
ON CONFLICT (filename) DO NOTHING;

-- INTENTIONAL DROP — both are TEMP tables created by this migration above.
DROP TABLE tmp_money; DROP TABLE tmp_before;

COMMIT;
