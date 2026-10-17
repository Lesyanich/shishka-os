-- 494 — fold the surviving "Parsley 50 g per pack" stub into fresh parsley
--       (MC cd76dcd7 loose end, raised after PR #611 merged)
--
-- APPLIED 2026-10-17.
--
-- WHAT SURVIVED. Migrations 491 and 492 sorted the parsley family into fresh (RAW-PARSLEY) and
-- dried (RAW-DRIED_PARSLEY), but RAW-AUTO-bc7d3fa9 "Parsley 50 g per pack" was still live
-- alongside them, carrying one purchase row and no BOM use. It was missed for the same reason
-- 492 existed at all: it is a RAW-AUTO code, so a search by product_code for parsley never
-- surfaces it, and its base_unit is `pack` rather than kg.
--
-- WHY THE PRICE COULD NOT DECIDE IT. 25 THB for 50 g is 500/kg, which sits between fresh
-- parsley at 352 and dried at 1,240. Picking a family from that number alone would have been a
-- coin flip, and getting it wrong would have quietly poisoned whichever canonical received it.
-- The photograph decides it instead, on four independent signals:
--
--   Makro branch 00174, receipt 66021393101, 15-07-2026
--     line: `917245  พาร์สเลย์ 50 กรัม แพ็คละ`   qty 4, 1 พด @25.00 = 100.00
--
--   1. The Thai word is พาร์สเลย์ — the same word as article 917475, the 100 g FRESH pack used
--      on fourteen other rows. The dried product reads ตรามือ (Hand Brand) and costs 69.
--   2. Article 917245 and 917475 are sibling SKUs: the 50 g and 100 g fresh packs.
--   3. It is shelved among the fresh produce on the chit, between loose carrots sold per
--      kilogram and the 500 g cucumber packs.
--   4. The discount block carries a fresh-produce promo on it:
--      "ลด6บ/แพค เมื่อซื้อพาร์สเลย์50ก.ครบ3แพคขึ้นไป" — 6 THB off per pack when buying 3 or more.
--      Hand Brand dry goods do not run that promo.
--
-- So: FRESH, and 4 packs of 50 g is 0.2 kg. Fresh parsley moves 347.9661 -> 352.9508 and stays
-- verified. Pattern: mig 325 — cost-frozen repoint, then tombstone, never a hard delete.
--
-- BONUS, recorded because it strengthens an earlier migration: this same photograph image-
-- confirms the one cucumber row migration 488 could only justify by pattern —
-- `830433 แตงกวา แพต 500 กรัม` qty 2 @32 = 64.00, exactly the 1.0 kg that 488 assigned it.
-- 488's cucumber work is now image-confirmed on three of its four pack rows rather than two.
--
-- THE OTHER FOUR PARSLEY STUBS were checked rather than assumed, and are genuinely spent:
-- RAW-AUTO-600de11c, -653ac213, -bfbc6168 and -93b5f149 are all tombstoned with zero purchase
-- rows between them. After this migration the parsley family is exactly two live canonicals
-- (fresh and dried) and five tombstones, and a closing assert refuses to finish if any live
-- RAW-AUTO parsley stub remains.
--
-- Applied through the Supabase connector, which wraps the whole file in one transaction.

CREATE TEMP TABLE tmp_money AS
    SELECT coalesce(sum(total_price),0) AS s, count(*) AS c FROM public.purchase_logs;
CREATE TEMP TABLE tmp_before_cost AS
    SELECT id, product_code, cost_per_unit, cost_source FROM public.nomenclature;

DO $$
DECLARE v_stub uuid; v_fresh uuid; v_rows int;
BEGIN
    SELECT id INTO v_stub  FROM public.nomenclature WHERE product_code = 'RAW-AUTO-bc7d3fa9';
    SELECT id INTO v_fresh FROM public.nomenclature WHERE product_code = 'RAW-PARSLEY';
    IF v_stub IS NULL OR v_fresh IS NULL THEN
        RAISE EXCEPTION '494 abort: stub or RAW-PARSLEY not found';
    END IF;

    SELECT count(*) INTO v_rows FROM public.bom_structures WHERE ingredient_id = v_stub;
    IF v_rows > 0 THEN
        RAISE EXCEPTION '494 abort: the stub is referenced by % BOM line(s); repoint those first', v_rows;
    END IF;

    UPDATE public.purchase_logs
       SET nomenclature_id = v_fresh,
           quantity        = 0.2,
           price_per_unit  = round(total_price / 0.2, 4),
           notes = coalesce(notes,'') || ' [mig494 repoint RAW-AUTO-bc7d3fa9->RAW-PARSLEY, qty 4 '
                || 'packs->0.2 kg; image: Makro 00174 rcpt 66021393101 15-07-2026 '
                || '"917245 parsley 50 GRAM per pack" qty 4 @25 = 100.00, shelved with the fresh '
                || 'produce and carrying a fresh-produce promo (6 THB off per pack on 3+). '
                || 'Article 917245 is the 50 g fresh pack; 917475 is the 100 g fresh pack at 35. '
                || 'Not the Hand Brand dried sachet, which is a different word on the chit and 69 THB]'
     WHERE nomenclature_id = v_stub AND voided_at IS NULL;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 1 THEN
        RAISE EXCEPTION '494 abort: expected to move exactly 1 purchase row, moved %', v_rows;
    END IF;

    UPDATE public.nomenclature
       SET is_deleted = true, is_available = false,
           name = '[MERGED->RAW-PARSLEY] ' || name, updated_at = now()
     WHERE id = v_stub;
END $$;

DO $$
DECLARE b record; a record; v numeric; v_bad int; v_list text;
BEGIN
    SELECT * INTO b FROM tmp_money;
    SELECT coalesce(sum(total_price),0) AS s, count(*) AS c INTO a FROM public.purchase_logs;
    IF a.s <> b.s OR a.c <> b.c THEN
        RAISE EXCEPTION '494 abort: money or rows moved, % / % -> % / %', b.s, b.c, a.s, a.c;
    END IF;

    SELECT cost_per_unit INTO v FROM public.nomenclature WHERE product_code = 'RAW-PARSLEY';
    IF abs(v - 352.9508) > 0.01 THEN
        RAISE EXCEPTION '494 abort: fresh parsley landed on %, expected 352.9508', v;
    END IF;

    IF (SELECT trust_class FROM public.v_cost_trust_nomenclature WHERE product_code='RAW-PARSLEY')
       <> 'verified' THEN
        RAISE EXCEPTION '494 abort: fresh parsley is no longer verified';
    END IF;

    -- Dried parsley must not have been disturbed.
    SELECT cost_per_unit INTO v FROM public.nomenclature WHERE product_code = 'RAW-DRIED_PARSLEY';
    IF abs(v - 1240.0000) > 0.01 THEN
        RAISE EXCEPTION '494 abort: dried parsley moved to %, expected 1240', v;
    END IF;

    -- Nothing else may move. Only parsley and the emptied stub are in scope.
    SELECT count(*), string_agg(product_code, ', ') INTO v_bad, v_list
      FROM (SELECT n.product_code FROM public.nomenclature n JOIN tmp_before_cost t ON t.id=n.id
             WHERE (n.cost_per_unit IS DISTINCT FROM t.cost_per_unit
                    OR n.cost_source IS DISTINCT FROM t.cost_source)
               AND n.product_code LIKE 'RAW-%'
               AND n.product_code NOT IN ('RAW-PARSLEY','RAW-AUTO-bc7d3fa9')) s;
    IF v_bad > 0 THEN
        RAISE EXCEPTION '494 abort: % unintended ingredient cost change(s): %', v_bad, v_list;
    END IF;

    -- No parsley stub may be left alive behind us.
    SELECT count(*), string_agg(product_code, ', ') INTO v_bad, v_list
      FROM public.nomenclature
     WHERE name ILIKE '%parsley%' AND product_code LIKE 'RAW-AUTO-%'
       AND coalesce(is_deleted,false) = false;
    IF v_bad > 0 THEN
        RAISE EXCEPTION '494 abort: % parsley stub(s) still live: %', v_bad, v_list;
    END IF;
END $$;

INSERT INTO public.migration_log (filename, applied_by, status, notes)
VALUES ('494_fold_in_parsley_50g_stub.sql', 'claude-opus-session-58399a46', 'success',
        'MC cd76dcd7 loose end, raised after PR #611 merged. RAW-AUTO-bc7d3fa9 "Parsley 50 g per '
     || 'pack" survived migs 491/492 with 1 purchase row and no BOM use. The 15-07-2026 Makro '
     || 'chit settles it as FRESH: article 917245 "parsley 50 gram per pack", shelved with fresh '
     || 'produce under a fresh-produce promo, not the Hand Brand dried sachet. Repointed to '
     || 'RAW-PARSLEY at 4 packs -> 0.2 kg and tombstoned per mig 325. Fresh parsley 347.9661 -> '
     || '352.9508, still verified. The same photograph also image-confirms the one cucumber row '
     || 'mig 488 could only justify by pattern (830433, qty 2 @32). The other four parsley stubs '
     || 'were checked and are genuinely spent: all tombstoned, zero purchase rows between them.')
ON CONFLICT DO NOTHING;

-- INTENTIONAL DROP — both are TEMP snapshot tables created by this migration above.
DROP TABLE tmp_money; DROP TABLE tmp_before_cost;

-- ══════════════════════════════════════════════════════════════════════════
-- AFTER. The parsley family is now two live canonicals and five tombstones:
--   RAW-PARSLEY        Parsley 100 g   352.9508/kg  19 rows  verified
--   RAW-DRIED_PARSLEY  Dried Parsley  1240.0000/kg   3 rows  verified
--   RAW-AUTO-bc7d3fa9, -600de11c, -653ac213, -bfbc6168, -93b5f149, RAW-PARSLEY-DRIED
--                      all tombstoned, zero purchase rows between them
--
-- The live-dish distribution is unchanged (unverified 49 / estimated 29 / no_bom 26 /
-- no_cost 16 / verified 8 / manual 4 / deleted 1) because parsley was not blocking anything.
-- This migration buys correctness and a tidy ingredient list, not margin — worth saying so.
-- ══════════════════════════════════════════════════════════════════════════
