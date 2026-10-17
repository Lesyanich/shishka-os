-- 525 — pass 2 follow-up after the CEO's answers (MC e5969ed9, follows mig 524, PR #651)
--
-- CEO ANSWERS 2026-10-17:
--   1. Banana: "look the price per kg up and work out the weight yourself".
--   2. Should the frozen Manee Manao lime bag price RAW-LIME?  -> NO.
--   3. Frozen lemon juice: "we do not use it — too bitter."
--
-- 1. RAW-BANANA. Both receipts price a HAND (หวี) of Cavendish bananas and print no weight:
--      Makro 00174 rcpt 166061236608 28-04-2026 "120171 กล้วยหอม A หวีละ" 1 @89
--      Local Market 20-09-2026 handwritten "กล้วยหอม" 1 @90
--    Weight is NOT read off a receipt here; it is an ESTIMATE, labelled as one in the row notes:
--    a grade-A hand is 14-16 fruit at ~180 g = ~2.5 kg (Khaosod / Finnomena grower figures).
--    2.5 kg per hand puts the two receipts at 35.6 and 36.0 THB/kg — independent of each other
--    and of the catalog estimate they land next to (35.00). Quantities 1 -> 2.5, total_price
--    untouched, WAC -> 179/5 = 35.80. This is as good as the evidence gets without weighing a hand;
--    if the kitchen ever weighs one, re-run with the real number.
--
-- 2/3. THE MANEE MANAO LIME BAG (purchase row f2fc269b, Makro 21-04-2026, 500 g @105).
--    Mig 524 moved it off lemon juice onto RAW-LIME. The CEO says it must not price lime either, and
--    that frozen citrus juice is not what the kitchen uses. It is a one-off purchase of something
--    that feeds no dish. The row is VOIDED (kept as evidence, never deleted) so RAW-LIME goes back
--    to its two ARO 1 kg rows (137.00, asserted), and the matcher lessons that bound barcode
--    8859102500404 to a canonical are removed — pointing it at lemon juice (524's starting point)
--    or lime (524's end point) would both be wrong, so a future bag lands in the unmatched queue
--    for a human instead of silently pricing an ingredient. RAW-LEMON-JUICE keeps its manual
--    250.00/L, which is the fresh-squeezed estimate from mig 207; the CEO's answer confirms
--    that is the intent.

CREATE TEMP TABLE tmp_before_money AS
    SELECT coalesce(sum(total_price), 0) AS total_price_sum, count(*) AS row_count,
           count(*) FILTER (WHERE voided_at IS NOT NULL) AS voided_count
      FROM public.purchase_logs;
CREATE TEMP TABLE tmp_before_cost AS
    SELECT id, product_code, cost_per_unit, cost_source FROM public.nomenclature;

DO $$
BEGIN
    IF (SELECT count(*) FROM public.purchase_logs
         WHERE id IN ('b4893473-97bb-4d85-bc20-6471bc476abb','8050f994-7dd0-4587-90c2-2af7b5dbf214')
           AND quantity = 1 AND voided_at IS NULL) <> 2 THEN
        RAISE EXCEPTION '525 abort: banana rows missing or drifted';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.purchase_logs
                    WHERE id = 'f2fc269b-b887-4c6a-8657-43ee7c4cbf32' AND voided_at IS NULL AND total_price = 105) THEN
        RAISE EXCEPTION '525 abort: lime-bag row missing, changed or already voided';
    END IF;
END $$;

UPDATE public.purchase_logs
   SET quantity = 2.5,
       price_per_unit = round(total_price / 2.5, 4),
       notes = coalesce(notes, '') || ' [mig525 qty 1->2.5; ESTIMATED weight, not read off the receipt: one grade-A hand of 14-16 fruit at ~180 g = ~2.5 kg; the receipt prices a hand with no weight; CEO asked to compute it]'
 WHERE id IN ('b4893473-97bb-4d85-bc20-6471bc476abb','8050f994-7dd0-4587-90c2-2af7b5dbf214');

UPDATE public.purchase_logs
   SET voided_at = now(),
       void_reason = 'One-off Manee Manao FROZEN LIME juice 500 g bag (Makro 21-04-2026). CEO 2026-10-17: frozen citrus juice is not used in the kitchen and must not price RAW-LIME; it was never lemon juice either. Left intact as evidence. MC e5969ed9, mig 525 (follows 524).'
 WHERE id = 'f2fc269b-b887-4c6a-8657-43ee7c4cbf32' AND voided_at IS NULL;

-- Remove the matcher lessons for that barcode (see header). Exactly one of each is expected.
DO $$
DECLARE v_sc int; v_rule int;
BEGIN
    DELETE FROM public.supplier_catalog WHERE barcode = '8859102500404';
    GET DIAGNOSTICS v_sc = ROW_COUNT;
    DELETE FROM public.correction_rules
     WHERE rule_type = 'nomenclature' AND match_field = 'barcode' AND match_pattern = '8859102500404';
    GET DIAGNOSTICS v_rule = ROW_COUNT;
    IF v_sc <> 1 OR v_rule <> 1 THEN
        RAISE EXCEPTION '525 abort: expected 1 catalog row and 1 rule for barcode 8859102500404, got % and %', v_sc, v_rule;
    END IF;
END $$;

DO $$
DECLARE v numeric; v_lime numeric;
BEGIN
    v := public.fn_recalc_wac_for_product((SELECT id FROM public.nomenclature WHERE product_code = 'RAW-BANANA'));
    IF abs(v - 35.80) > 0.01 THEN RAISE EXCEPTION '525 abort: banana recomputed to %, expected 35.80', v; END IF;
    -- lime: recompute so it provably agrees with its remaining two ARO rows (135 + 139) / 2 kg.
    v_lime := public.fn_recalc_wac_for_product((SELECT id FROM public.nomenclature WHERE product_code = 'RAW-LIME'));
    IF abs(v_lime - 137.00) > 0.01 THEN RAISE EXCEPTION '525 abort: lime recomputed to %, expected 137.00', v_lime; END IF;
END $$;

DO $$
DECLARE b record; a record; v_bad int; v_list text;
BEGIN
    SELECT * INTO b FROM tmp_before_money;
    SELECT coalesce(sum(total_price), 0) AS total_price_sum, count(*) AS row_count,
           count(*) FILTER (WHERE voided_at IS NOT NULL) AS voided_count
      INTO a FROM public.purchase_logs;
    IF a.total_price_sum <> b.total_price_sum THEN RAISE EXCEPTION '525 abort: money moved'; END IF;
    IF a.row_count <> b.row_count OR a.voided_count <> b.voided_count + 1 THEN
        RAISE EXCEPTION '525 abort: expected same row count and exactly one new void';
    END IF;

    SELECT count(*), string_agg(n.product_code, ', ') INTO v_bad, v_list
      FROM public.nomenclature n JOIN tmp_before_cost t ON t.id = n.id
     WHERE (n.cost_per_unit IS DISTINCT FROM t.cost_per_unit OR n.cost_source IS DISTINCT FROM t.cost_source)
       AND n.product_code LIKE 'RAW-%'
       AND n.product_code <> 'RAW-BANANA'
       -- lime may be recomputed but must land on the same number (checked above); a source flip is not allowed
       AND NOT (n.product_code = 'RAW-LIME' AND n.cost_source = t.cost_source AND abs(n.cost_per_unit - t.cost_per_unit) < 0.01);
    IF v_bad > 0 THEN RAISE EXCEPTION '525 abort: unintended ingredient cost change(s): %', v_list; END IF;

    IF (SELECT cost_per_unit FROM public.nomenclature WHERE product_code = 'RAW-LEMON-JUICE') <> 250
       OR (SELECT cost_source FROM public.nomenclature WHERE product_code = 'RAW-LEMON-JUICE') <> 'manual' THEN
        RAISE EXCEPTION '525 abort: lemon juice moved';
    END IF;
END $$;

INSERT INTO public.migration_log (filename, applied_by, status, notes)
VALUES ('525_pass2_followup_banana_weight_and_lime_bag_void.sql', 'claude-opus-session-ce05bc43', 'success',
        'MC e5969ed9 follow-up to 524 after the CEO answers. Banana: two hand-priced rows set to an ESTIMATED 2.5 kg/hand (labelled), WAC 35.80. Manee Manao frozen lime bag voided (not used, must not price RAW-LIME), its matcher lessons for barcode 8859102500404 removed. Lemon juice 250 and lime 137 unchanged.')
ON CONFLICT DO NOTHING;

-- INTENTIONAL DROP — TEMP tables created by this migration; nothing persistent is dropped.
DROP TABLE tmp_before_money; DROP TABLE tmp_before_cost;
