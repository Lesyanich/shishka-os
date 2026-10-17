-- 511 — price the Mont Fleur resale water from the Makro shelf (MC 00a81c22)
--
-- APPLIED 2026-10-17. Number claimed with claim_migration_number, not guessed.
--
-- WHY. Mont Fleur bottled water is resold at 15 THB (330 ml) and 25 THB (500 ml), and it sold 25
-- bottles in the 120 days of sales data, yet both RAW items sat at cost 0 with cost_source 'none'.
-- Both dishes therefore displayed a 100 percent margin on real sales. Nothing had ever been
-- bought through the system: no purchase_logs row, no supplier_catalog price we could link. The two
-- FARANG FOOD PARADISE catalog rows (1,200 and 1,080) are per-case prices of unknown case size
-- and are unlinked, so they were not used.
--
-- THE PRICE. Read from the Makro Pro storefront on 2026-10-17 with tools/makro-parser (store 166,
-- Rawai, in stock), cross-checked by barcode and pack factor:
--
--   MONT FLEUR Mineral Water 330 ml x 24   189 THB   -> 7.875 THB per bottle   8851530160014
--   MONT FLEUR Mineral Water 500 ml x 12   108 THB   -> 9.0000 THB per bottle   8851530111009
--
-- The pack factor is the parser's own unitFactor field, not a figure derived from the title, so a
-- "x 24" in the product name cannot silently disagree with the divisor.
--
-- WHY cost_source = 'catalog_estimate' AND NOT 'wac'. This is a shelf price, not a price we paid.
-- The menu UI already badges catalog_estimate as "estimated from the Makro catalog, no real
-- purchase yet", which is exactly what this is. The first real purchase through the importer
-- replaces it: fn_update_cost_on_purchase takes the line cost outright when there is no stock on
-- hand, so the estimate does not linger or blend.
--
-- RESULT, measured. SALE-WATER_MONT_FLEUR_330 costs 7.875 against a price of 15 (52.5 percent food
-- cost); SALE-WATER_MONT_FLEUR costs 9.00 against 25 (36.0 percent). Both moved from 'no_cost'
-- to 'estimated' in v_dish_cost_trust, taking live 'no_cost' dishes from 14 to 12.
--
-- NOT DONE HERE. No supplier_catalog row was written for the two barcodes. Linking them with a
-- conversion_factor of 24 and 12 would let a future Makro receipt resolve straight onto these
-- items and normalise the case to bottles at import, which is worth doing, but it is a separate
-- write to a different table and was not asked for.
--
-- Applied through the Supabase connector, which wraps the whole file in one transaction.

BEGIN;

CREATE TEMP TABLE tmp_before_cost AS
    SELECT id, product_code, cost_per_unit, cost_source FROM public.nomenclature;
CREATE TEMP TABLE tmp_money AS
    SELECT coalesce(sum(total_price),0) AS s, count(*) AS c FROM public.purchase_logs;

DO $$
BEGIN
    -- Both must still be the untouched, unpurchased rows the price was read for.
    IF (SELECT count(*) FROM public.nomenclature
         WHERE product_code IN ('RAW-MONT_FLEUR_330','RAW-MONT_FLEUR_500')
           AND base_unit = 'pcs'
           AND coalesce(cost_per_unit,0) = 0
           AND cost_source = 'none') <> 2 THEN
        RAISE EXCEPTION '511 abort: Mont Fleur rows are not the zero-cost, cost_source=none, base_unit=pcs rows this migration expects';
    END IF;
    IF EXISTS (SELECT 1 FROM public.purchase_logs pl
                 JOIN public.nomenclature n ON n.id = pl.nomenclature_id
                WHERE n.product_code IN ('RAW-MONT_FLEUR_330','RAW-MONT_FLEUR_500')
                  AND pl.voided_at IS NULL) THEN
        RAISE EXCEPTION '511 abort: a real purchase now exists; a catalog estimate must not shadow it';
    END IF;
END $$;

UPDATE public.nomenclature
   SET cost_per_unit = 7.875, cost_source = 'catalog_estimate', updated_at = now()
 WHERE product_code = 'RAW-MONT_FLEUR_330';

UPDATE public.nomenclature
   SET cost_per_unit = 9.0000, cost_source = 'catalog_estimate', updated_at = now()
 WHERE product_code = 'RAW-MONT_FLEUR_500';

DO $$
DECLARE v_before record; v_after record; v_bad int; v_list text; v numeric;
BEGIN
    SELECT * INTO v_before FROM tmp_money;
    SELECT coalesce(sum(total_price),0) AS s, count(*) AS c INTO v_after FROM public.purchase_logs;
    IF v_after.s <> v_before.s OR v_after.c <> v_before.c THEN
        RAISE EXCEPTION '511 abort: money or rows moved, % / % -> % / %',
            v_before.s, v_before.c, v_after.s, v_after.c;
    END IF;

    -- No ingredient may have moved except the two.
    SELECT count(*), string_agg(n.product_code, ', ') INTO v_bad, v_list
      FROM public.nomenclature n JOIN tmp_before_cost t ON t.id = n.id
     WHERE (n.cost_per_unit IS DISTINCT FROM t.cost_per_unit OR n.cost_source IS DISTINCT FROM t.cost_source)
       AND n.product_code LIKE 'RAW-%'
       AND n.product_code NOT IN ('RAW-MONT_FLEUR_330','RAW-MONT_FLEUR_500');
    IF v_bad > 0 THEN
        RAISE EXCEPTION '511 abort: % unintended ingredient cost change(s): %', v_bad, v_list;
    END IF;

    -- The point of the migration: the two resale dishes now carry the bottle cost.
    SELECT cost_per_unit INTO v FROM public.nomenclature WHERE product_code = 'SALE-WATER_MONT_FLEUR_330';
    IF v IS NULL OR v < 7.875 - 0.01 THEN
        RAISE EXCEPTION '511 abort: 330 ml dish costs % after the update, expected at least 7.875', v;
    END IF;
    SELECT cost_per_unit INTO v FROM public.nomenclature WHERE product_code = 'SALE-WATER_MONT_FLEUR';
    IF v IS NULL OR v < 9.0 - 0.01 THEN
        RAISE EXCEPTION '511 abort: 500 ml dish costs % after the update, expected at least 9.00', v;
    END IF;
END $$;

INSERT INTO public.migration_log (filename, applied_by, status, notes)
VALUES ('511_mont_fleur_makro_catalog_estimate.sql', 'claude-opus-session-477e2227', 'success',
        'MC 00a81c22. Mont Fleur bottled water is resold at 15 and 25 THB but was never purchased '
     || 'through the system, so both RAW items sat at cost 0 / cost_source none and both dishes '
     || 'displayed a 100 percent margin on 25 units sold. Priced from the Makro Pro shelf '
     || '(read 2026-10-17 via tools/makro-parser): 330 ml x24 = 189 THB = 7.875 per bottle, '
     || '500 ml x12 = 108 THB = 9.00 per bottle. Recorded as cost_source=catalog_estimate, NOT wac: '
     || 'it is a shelf price, not a price we paid, and the menu badge already labels that honestly. '
     || 'The first real purchase through the importer replaces it. total_price and purchase row '
     || 'count unchanged, no other ingredient cost moved, asserted.')
ON CONFLICT (filename) DO NOTHING;

-- INTENTIONAL DROP — both are TEMP snapshot tables created by this migration above.
DROP TABLE tmp_before_cost; DROP TABLE tmp_money;

COMMIT;
