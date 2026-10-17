-- 507 — merge the almond-milk duplicate canonical (MC 00a81c22)
--
-- APPLIED 2026-10-17. Number claimed with claim_migration_number, not guessed.
--
-- WHY. Two live dishes read trust_class='no_cost' in v_dish_cost_trust, and the cause was not a
-- missing price. There were two canonicals for the same product:
--
--   RAW-MILK-ALMOND   "Almond Milk (Unsweetened)"           cost NULL, no purchases — the BOMs
--                                                           pointed HERE
--   RAW-ALMOND_MILK   "137 DEGREES Almond Milk Unsweetened"  cost 120.00, and a real receipt:
--                                                           2 L for 240 THB on 2026-06-07
--
-- This is the migration 491/492 trap for the third time: a canonical spelled the other way round
-- (MILK-ALMOND vs ALMOND_MILK, as RAW-PARSLEY-DRIED was to RAW-DRIED_PARSLEY) which a search by
-- code prefix cannot see. The lesson is in 492's header and it still holds — search the NAME and
-- search for the concept, not the spelling, before creating or costing anything.
--
-- WHAT MAKES THE REPOINT SAFE. Both rows carry base_unit 'L', so the two BOM quantities carry over
-- untouched and nothing needs converting; the asserts check the unit match rather than assuming
-- it. The duplicate holds no purchase rows, so there is no cost to freeze (contrast mig 325, which
-- had to) and nothing for trg_recalc_wac_on_purchase_update to null out.
--
-- ONE PROVENANCE IMPROVEMENT, NO VALUE CHANGE. The kept row carried 120.00/L as
-- cost_source='catalog_estimate', while its own receipt says 240 THB / 2 L = exactly 120.00. The
-- recompute therefore leaves the number identical and only corrects where it came from:
-- 'catalog_estimate' -> 'wac'. An estimate that happens to be right is still worth relabelling,
-- because the menu badge reads cost_source and the owner should see that a receipt backs this one.
--
-- WHAT THIS DOES NOT DO, and why it is not an oversight. Seven other ingredients leave 14 live
-- dishes costless, and none of them is a pricing problem either — three are soft-deleted while
-- still sitting in live recipes (RAW-MAYONNAISE-HEALTHY, RAW-SRIRACHA, RAW-COCONUT-SUGAR), and
-- fixing those means deciding what a dish is made of, which is RULE-SOCRATIC-GATE territory and
-- the CEO's or the chef's call rather than an inference from one price resembling another. Mont
-- Fleur bottled water has never been purchased through the system at all. The full reading is in
-- MC 00a81c22's comment of 2026-10-17. Only the mechanical, receipt-backed half ships here.
--
-- Applied through the Supabase connector, which wraps the whole file in one transaction.

BEGIN;

CREATE TEMP TABLE tmp_before_cost AS
    SELECT id, product_code, cost_per_unit, cost_source FROM public.nomenclature;
CREATE TEMP TABLE tmp_money AS
    SELECT coalesce(sum(total_price),0) AS s, count(*) AS c FROM public.purchase_logs;
CREATE TEMP TABLE tmp_bom AS SELECT count(*) AS c FROM public.bom_structures;

DO $$
DECLARE v_keep uuid; v_dupe uuid; v_keep_unit text; v_dupe_unit text; v_rows int;
BEGIN
    SELECT id, base_unit INTO v_keep, v_keep_unit FROM public.nomenclature WHERE product_code='RAW-ALMOND_MILK';
    SELECT id, base_unit INTO v_dupe, v_dupe_unit FROM public.nomenclature WHERE product_code='RAW-MILK-ALMOND';

    IF v_keep IS NULL OR v_dupe IS NULL THEN
        RAISE EXCEPTION '507 abort: expected both RAW-ALMOND_MILK and RAW-MILK-ALMOND to exist';
    END IF;
    IF v_keep_unit IS DISTINCT FROM v_dupe_unit THEN
        RAISE EXCEPTION '507 abort: base units differ (% vs %); quantities would need conversion', v_keep_unit, v_dupe_unit;
    END IF;
    IF EXISTS (SELECT 1 FROM public.purchase_logs WHERE nomenclature_id = v_dupe AND voided_at IS NULL) THEN
        RAISE EXCEPTION '507 abort: the duplicate now holds purchase rows; cost-freeze them first';
    END IF;

    UPDATE public.bom_structures
       SET ingredient_id = v_keep,
           notes = coalesce(notes,'') || ' [mig507 RAW-MILK-ALMOND->RAW-ALMOND_MILK: duplicate canonical, '
                   || 'same base unit, quantity unchanged]'
     WHERE ingredient_id = v_dupe;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 2 THEN
        RAISE EXCEPTION '507 abort: expected to repoint 2 BOM lines, repointed %', v_rows;
    END IF;

    UPDATE public.nomenclature
       SET is_deleted = true, is_available = false,
           name = '[MERGED->RAW-ALMOND_MILK] ' || name, updated_at = now()
     WHERE id = v_dupe;

    PERFORM public.fn_recalc_wac_for_product(v_keep);
END $$;

-- ──────────────────────────────────────────────────────────────────────────
-- Asserts. A repoint must move references and nothing else.
-- NOTE the alias `bs` below: naming it `b` shadows the `v_before record`
-- variable pattern and PL/pgSQL resolves b.ingredient_id against the record,
-- which is how the first run of this migration failed and rolled back.
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE v_before record; v_after record; v numeric; v_bad int; v_list text; v_bom int;
BEGIN
    SELECT * INTO v_before FROM tmp_money;
    SELECT coalesce(sum(total_price),0) AS s, count(*) AS c INTO v_after FROM public.purchase_logs;
    IF v_after.s <> v_before.s OR v_after.c <> v_before.c THEN
        RAISE EXCEPTION '507 abort: money or rows moved, % / % -> % / %',
            v_before.s, v_before.c, v_after.s, v_after.c;
    END IF;

    SELECT count(*) INTO v_bom FROM public.bom_structures;
    IF v_bom <> (SELECT c FROM tmp_bom) THEN
        RAISE EXCEPTION '507 abort: BOM line count changed; a repoint must not add or drop lines';
    END IF;

    SELECT cost_per_unit INTO v FROM public.nomenclature WHERE product_code='RAW-ALMOND_MILK';
    IF abs(v - 120.0000) > 0.01 THEN
        RAISE EXCEPTION '507 abort: almond milk landed on %, expected 120 (240 THB / 2 L)', v;
    END IF;

    IF EXISTS (SELECT 1 FROM public.bom_structures bs
                JOIN public.nomenclature n ON n.id = bs.ingredient_id
               WHERE n.product_code = 'RAW-MILK-ALMOND') THEN
        RAISE EXCEPTION '507 abort: the duplicate is still referenced by a BOM line';
    END IF;

    SELECT count(*), string_agg(n.product_code, ', ') INTO v_bad, v_list
      FROM public.nomenclature n JOIN tmp_before_cost t ON t.id = n.id
     WHERE (n.cost_per_unit IS DISTINCT FROM t.cost_per_unit OR n.cost_source IS DISTINCT FROM t.cost_source)
       AND n.product_code LIKE 'RAW-%'
       AND n.product_code <> 'RAW-ALMOND_MILK';
    IF v_bad > 0 THEN
        RAISE EXCEPTION '507 abort: % unintended ingredient cost change(s): %', v_bad, v_list;
    END IF;
END $$;

INSERT INTO public.migration_log (filename, applied_by, status, notes)
VALUES ('507_merge_almond_milk_duplicate_canonical.sql', 'claude-opus-session-477e2227', 'success',
        'MC 00a81c22. RAW-MILK-ALMOND was a duplicate canonical of RAW-ALMOND_MILK — the mig 491/492 '
     || 'trap again, a name spelled the other way round that a code-prefix search cannot see. The two '
     || 'BOM lines pointed at the empty twin (no cost, no purchases) while the real one carried a '
     || 'receipt (137 Degrees Unsweetened Almond Milk, 2 L for 240 THB, 2026-06-07). Repointed both '
     || 'lines, tombstoned the duplicate per mig 325, and recomputed the kept row so its 120.00/L is '
     || 'cost_source=wac from its own receipt rather than a catalog estimate — same number, honest '
     || 'provenance. Same base unit (L) on both, so quantities carried over untouched. total_price, '
     || 'purchase row count and BOM line count all unchanged, asserted.')
ON CONFLICT (filename) DO NOTHING;

-- INTENTIONAL DROP — all three are TEMP snapshot tables created by this migration above.
DROP TABLE tmp_before_cost; DROP TABLE tmp_money; DROP TABLE tmp_bom;

COMMIT;
