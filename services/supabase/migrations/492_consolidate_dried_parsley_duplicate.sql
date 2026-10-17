-- 492 — consolidate the dried-parsley duplicate that migration 491 created.
--
-- APPLIED 2026-10-17, minutes after 491.
--
-- MY ERROR, corrected immediately. 491 created RAW-PARSLEY-DRIED to hold the three Hand Brand
-- 50 g sachet rows that were polluting fresh parsley. A canonical already existed under a
-- different spelling — RAW-DRIED_PARSLEY ("Dried Parsley", kg, hand-set 1380) — and the search
-- patterns I used (RAW-PARSLEY%, RAW-CULANTRO%) cannot match a code that puts DRIED first.
--
-- The pre-existing one wins: it is already referenced by a BOM line, mine was not.
-- Note the corroboration — its hand-set 1380 is exactly 69/0.05, the same Hand Brand sachet
-- these three receipt rows describe. Both codes were derived from the same real product; only
-- one should ever have existed.
--
-- LESSON for the next session: searching nomenclature by code prefix is not enough. Thai
-- grocery canonicals here are spelled both ways round (RAW-DRIED_PARSLEY vs RAW-PARSLEY-DRIED,
-- RAW-SESAME-SEEDS-BLACK vs RAW-BLACK-SESAME would be the same trap). Search the NAME too,
-- and search for the concept, not the spelling, before creating any nomenclature.
--
-- Pattern: mig 325 — repoint, then tombstone. Never hard-delete.
--
-- Applied through the Supabase connector, which wraps the whole file in one transaction.

CREATE TEMP TABLE tmp_money AS
    SELECT coalesce(sum(total_price),0) AS s, count(*) AS c FROM public.purchase_logs;

DO $$
DECLARE v_keep uuid; v_dupe uuid; v_rows int;
BEGIN
    SELECT id INTO v_keep FROM public.nomenclature WHERE product_code = 'RAW-DRIED_PARSLEY';
    SELECT id INTO v_dupe FROM public.nomenclature WHERE product_code = 'RAW-PARSLEY-DRIED';
    IF v_keep IS NULL OR v_dupe IS NULL THEN
        RAISE EXCEPTION '492 abort: expected both RAW-DRIED_PARSLEY and RAW-PARSLEY-DRIED to exist';
    END IF;

    -- The duplicate must not have picked up any BOM usage since 491.
    SELECT count(*) INTO v_rows FROM public.bom_structures WHERE ingredient_id = v_dupe;
    IF v_rows > 0 THEN
        RAISE EXCEPTION '492 abort: RAW-PARSLEY-DRIED is referenced by % BOM line(s); repoint those first', v_rows;
    END IF;

    UPDATE public.purchase_logs
       SET nomenclature_id = v_keep,
           notes = coalesce(notes,'') || ' [mig492 repoint RAW-PARSLEY-DRIED->RAW-DRIED_PARSLEY: '
                   || '491 created a duplicate of a canonical that already existed]'
     WHERE nomenclature_id = v_dupe;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 3 THEN
        RAISE EXCEPTION '492 abort: expected to move 3 purchase rows, moved %', v_rows;
    END IF;

    UPDATE public.nomenclature
       SET is_deleted = true,
           name = '[MERGED->RAW-DRIED_PARSLEY] ' || name,
           updated_at = now()
     WHERE id = v_dupe;
END $$;

DO $$
DECLARE b record; a record; v numeric; v_src text;
BEGIN
    SELECT * INTO b FROM tmp_money;
    SELECT coalesce(sum(total_price),0) AS s, count(*) AS c INTO a FROM public.purchase_logs;
    IF a.s <> b.s OR a.c <> b.c THEN
        RAISE EXCEPTION '492 abort: money or rows moved';
    END IF;

    SELECT cost_per_unit, cost_source INTO v, v_src
      FROM public.nomenclature WHERE product_code = 'RAW-DRIED_PARSLEY';
    IF abs(v - 1240.0000) > 0.01 THEN
        RAISE EXCEPTION '492 abort: RAW-DRIED_PARSLEY landed on %, expected 1240 from its 3 receipt rows', v;
    END IF;

    -- Fresh parsley must be untouched by this consolidation.
    SELECT cost_per_unit INTO v FROM public.nomenclature WHERE product_code = 'RAW-PARSLEY';
    IF abs(v - 347.9661) > 0.01 THEN
        RAISE EXCEPTION '492 abort: fresh parsley moved to %, expected 347.9661', v;
    END IF;
END $$;

INSERT INTO public.migration_log (filename, applied_by, status, notes)
VALUES ('492_consolidate_dried_parsley_duplicate.sql', 'claude-opus-session-58399a46', 'success',
        'Corrects my own error in 491: RAW-PARSLEY-DRIED duplicated the pre-existing '
     || 'RAW-DRIED_PARSLEY, which my RAW-PARSLEY% search could not match. Moved the 3 Hand Brand '
     || 'sachet rows onto the pre-existing canonical (the one already used in a BOM) and '
     || 'tombstoned the duplicate per mig 325. RAW-DRIED_PARSLEY now 1240.00 from receipts, '
     || 'against its hand-set 1380 which was 69/0.05 off the same sachet. Fresh parsley unchanged.')
ON CONFLICT DO NOTHING;

-- INTENTIONAL DROP — TEMP snapshot table created by this migration above.
DROP TABLE tmp_money;
