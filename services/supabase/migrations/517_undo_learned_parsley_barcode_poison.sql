-- 517 — undo a poisoned barcode the learning loop taught us (MC 00a81c22)
--
-- APPLIED 2026-10-17. Number claimed with claim_migration_number, not guessed.
--
-- WHAT WENT WRONG. Found while reading the plan of the Makro receipt backlog: the Makro article
-- 917475 is FRESH parsley, 100 g, yet the matcher resolved a line carrying it onto
-- RAW-DRIED_PARSLEY. The cause was ours, from earlier the same day.
--
--   * Migrations 491/492 repointed three dried-parsley purchase rows (Hand Brand 50 g sachets).
--   * One of them, purchase_logs 35912815 ("Hand Brand Dried Parsley 50g", 69 THB, 2026-03-30),
--     had been stored with barcode '917475' — the fresh-parsley article, not its own.
--   * trg_purchase_log_correction fires on UPDATE OF nomenclature_id and TEACHES the system from every
--     repoint. It therefore learned "barcode 917475 = dried parsley": supplier_catalog row 0e36014b
--     was repointed at 08:56:51, the minute of 492, with match_count 3 (the three repointed rows), and
--     correction_rules gained a rule for the same barcode.
--
-- That is the matcher doing what it was built to do, fed a wrong premise. The ladder reads
-- barcode:supplier_catalog before anything else, so the next receipt line carrying 917475 would have
-- booked fresh parsley (about 350 THB/kg) onto dried parsley (about 1,240 THB/kg).
--
-- THE LESSON, which generalises. A repoint is never only a data move in this schema: it is also a
-- lesson to the matcher. Every migration that repoints purchase rows should be followed by a check
-- of what it taught. The check used here is cheap and worth reusing: group the learned barcode rules
-- by pattern and look for one barcode pointing at two targets.
--
--   SELECT match_pattern FROM correction_rules
--    WHERE rule_type='nomenclature' AND match_field='barcode'
--    GROUP BY match_pattern HAVING count(DISTINCT correction_value->>'nomenclature_id') > 1;
--
-- It found exactly three, all parsley, listed below. Nothing else taught today conflicts.
--
-- WHAT THIS DOES, root first.
--   1. purchase_logs 35912815: clear the wrong barcode. NULL rather than the sachet's true barcode
--      (8850885304173), because no image of THAT row was read to confirm it; removing the false
--      link is the minimum correct change. `barcode` is not in the correction trigger's column
--      list, so this teaches nothing new.
--   2. supplier_catalog 0e36014b ("Parsley 100 g", factor 0.1): repoint to RAW-PARSLEY, matching its
--      two sibling rows for sku 917475, which already pointed at fresh parsley.
--   3. correction_rules: barcode 917475 -> RAW-PARSLEY. And for the two real dried-sachet barcodes
--      (8850885304173, 8858567001167), redirect the duplicate rule that pointed at the tombstoned
--      RAW-PARSLEY-DRIED to the live RAW-DRIED_PARSLEY, so no barcode is taught two targets.
--      Rules are updated, not deleted, so nothing learned is thrown away.
--
-- NOT DONE HERE: no catalog row for the dried sachet's own barcode, which would let a future
-- Hand Brand receipt resolve by barcode instead of by name. Worth adding, but it is a new row and
-- was not asked for.
--
-- Applied through the Supabase connector, which wraps the whole file in one transaction.

BEGIN;

CREATE TEMP TABLE tmp_before_cost AS
    SELECT id, product_code, cost_per_unit, cost_source FROM public.nomenclature;
CREATE TEMP TABLE tmp_money AS
    SELECT coalesce(sum(total_price),0) AS s, count(*) AS c FROM public.purchase_logs;

DO $$
DECLARE v_fresh uuid; v_dried uuid; v_rows int;
BEGIN
    SELECT id INTO v_fresh FROM public.nomenclature WHERE product_code = 'RAW-PARSLEY'       AND NOT is_deleted;
    SELECT id INTO v_dried FROM public.nomenclature WHERE product_code = 'RAW-DRIED_PARSLEY' AND NOT is_deleted;
    IF v_fresh IS NULL OR v_dried IS NULL THEN
        RAISE EXCEPTION '517 abort: RAW-PARSLEY or RAW-DRIED_PARSLEY not found';
    END IF;

    -- Pre-flight: the poison must still be exactly as diagnosed.
    IF NOT EXISTS (SELECT 1 FROM public.supplier_catalog
                    WHERE id = '0e36014b-3ffa-4eb2-a710-9cb2ee831d5d' AND barcode = '917475'
                      AND nomenclature_id = v_dried) THEN
        RAISE EXCEPTION '517 abort: catalog row 0e36014b no longer maps barcode 917475 to RAW-DRIED_PARSLEY';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.purchase_logs
                    WHERE id = '35912815-b410-4b0d-a84b-4762cf95ff26' AND barcode = '917475'
                      AND nomenclature_id = v_dried) THEN
        RAISE EXCEPTION '517 abort: purchase row 35912815 is not the dried-parsley row carrying barcode 917475';
    END IF;

    -- 1+2+3, in the order described in the header.
    UPDATE public.supplier_catalog SET nomenclature_id = v_fresh, updated_at = now()
     WHERE id = '0e36014b-3ffa-4eb2-a710-9cb2ee831d5d';

    UPDATE public.purchase_logs SET barcode = NULL,
           notes = coalesce(notes,'') || ' [mig517 barcode 917475 cleared: that is the FRESH parsley article, this row is a dried 50 g sachet]'
     WHERE id = '35912815-b410-4b0d-a84b-4762cf95ff26';

    UPDATE public.correction_rules
       SET correction_value = jsonb_set(correction_value, '{nomenclature_id}', to_jsonb(v_fresh::text)),
           updated_at = now()
     WHERE rule_type = 'nomenclature' AND match_field = 'barcode' AND match_pattern = '917475';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows < 1 THEN RAISE EXCEPTION '517 abort: no learned rule for 917475 found to repoint'; END IF;

    UPDATE public.correction_rules cr
       SET correction_value = jsonb_set(cr.correction_value, '{nomenclature_id}', to_jsonb(v_dried::text)),
           updated_at = now()
     WHERE cr.rule_type = 'nomenclature' AND cr.match_field = 'barcode'
       AND cr.match_pattern IN ('8850885304173','8858567001167')
       AND (cr.correction_value->>'nomenclature_id')::uuid IN
           (SELECT id FROM public.nomenclature WHERE product_code = 'RAW-PARSLEY-DRIED');
END $$;

DO $$
DECLARE v_before record; v_after record; v_bad int; v_list text; v_code text; v_level text; v_sup uuid;
BEGIN
    SELECT * INTO v_before FROM tmp_money;
    SELECT coalesce(sum(total_price),0) AS s, count(*) AS c INTO v_after FROM public.purchase_logs;
    IF v_after.s <> v_before.s OR v_after.c <> v_before.c THEN
        RAISE EXCEPTION '517 abort: money or rows moved, % / % -> % / %', v_before.s, v_before.c, v_after.s, v_after.c;
    END IF;

    SELECT count(*), string_agg(n.product_code, ', ') INTO v_bad, v_list
      FROM public.nomenclature n JOIN tmp_before_cost t ON t.id = n.id
     WHERE n.cost_per_unit IS DISTINCT FROM t.cost_per_unit OR n.cost_source IS DISTINCT FROM t.cost_source;
    IF v_bad > 0 THEN
        RAISE EXCEPTION '517 abort: % cost(s) moved, this migration must not touch costs: %', v_bad, v_list;
    END IF;

    -- No barcode may still be taught two different live targets.
    SELECT count(*), string_agg(match_pattern, ', ') INTO v_bad, v_list FROM (
        SELECT cr.match_pattern FROM public.correction_rules cr
         WHERE cr.rule_type = 'nomenclature' AND cr.match_field = 'barcode'
         GROUP BY cr.match_pattern HAVING count(DISTINCT cr.correction_value->>'nomenclature_id') > 1) s;
    IF v_bad > 0 THEN
        RAISE EXCEPTION '517 abort: % barcode(s) still conflict: %', v_bad, v_list;
    END IF;

    -- The behaviour that matters, replayed through the live matcher with Makro as the supplier.
    SELECT supplier_id INTO v_sup FROM public.supplier_catalog WHERE id = '0e36014b-3ffa-4eb2-a710-9cb2ee831d5d';
    SELECT n.product_code, m.match_level INTO v_code, v_level
      FROM public.fn_match_nomenclature(v_sup, '917475', '917475', 'Parsley 100 g', NULL) m
      LEFT JOIN public.nomenclature n ON n.id = m.nomenclature_id;
    IF v_code IS DISTINCT FROM 'RAW-PARSLEY' THEN
        RAISE EXCEPTION '517 abort: the fresh-parsley article 917475 resolves to % at level %', coalesce(v_code,'(none)'), v_level;
    END IF;
    SELECT n.product_code, m.match_level INTO v_code, v_level
      FROM public.fn_match_nomenclature(v_sup, '8850885304173', NULL, 'Hand Brand Dried Parsley 50g', NULL) m
      LEFT JOIN public.nomenclature n ON n.id = m.nomenclature_id;
    IF v_code IS DISTINCT FROM 'RAW-DRIED_PARSLEY' THEN
        RAISE EXCEPTION '517 abort: the dried sachet barcode no longer resolves to dried parsley (got % at %)', coalesce(v_code,'(none)'), v_level;
    END IF;
END $$;

INSERT INTO public.migration_log (filename, applied_by, status, notes)
VALUES ('517_undo_learned_parsley_barcode_poison.sql', 'claude-opus-session-477e2227', 'success',
        'MC 00a81c22. Migrations 491/492 repointed three dried-parsley purchase rows, and one of them '
     || '(35912815, a Hand Brand 50 g sachet) carried the FRESH parsley Makro article 917475 as its barcode. '
     || 'The learning trigger on purchase_logs.nomenclature_id then taught the system that barcode 917475 means '
     || 'dried parsley: supplier_catalog row 0e36014b was repointed (at 08:56:51, the minute of 492) and a '
     || 'correction_rule was written, so a receipt line carrying 917475 would have booked on RAW-DRIED_PARSLEY. '
     || 'Fixed the root (cleared the wrong barcode on that row), repointed the catalog row and the rule to '
     || 'RAW-PARSLEY, and redirected the two dried-sachet barcode rules that still pointed at the tombstoned '
     || 'RAW-PARSLEY-DRIED. Asserted by replaying both barcodes through the live matcher. No cost, no total_price '
     || 'and no row count changed.')
ON CONFLICT (filename) DO NOTHING;

-- INTENTIONAL DROP — both are TEMP snapshot tables created by this migration above.
DROP TABLE tmp_before_cost; DROP TABLE tmp_money;

COMMIT;
