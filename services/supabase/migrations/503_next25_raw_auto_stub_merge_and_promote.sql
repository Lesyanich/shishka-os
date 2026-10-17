-- 503 — second pass: resolve the next 25 RAW-AUTO stubs by spend (ranks 26-50): 14 MERGE, 8 PROMOTE, 3 left
--       (MC 00a81c22, item 6 Part B.2). Method and traps are exactly those of mig 502; see
--       docs/projects/admin/plans/data/next25-stub-resolution.md for the receipt that justifies each row.
--
-- NOT YET APPLIED at the time of writing: the Supabase connector's apply_migration was denied by the
-- permission classifier (the earlier CEO approval covered mig 502 only).
--
-- BEFORE (measured live just before): 337 stubs with live rows, 46,913.84 THB on stubs, 984 rows / 164,590.344.
-- Expected AFTER: 337 -> 315 stubs, 8,028.75 THB moved off stubs, money and rows unchanged.
--
-- Worth noting: the stub "ARO Shredded Mozzarella Frozen 1 kg" (b2f2a0c5) is NOT mozzarella. The chit prints
-- article 8858768700807 `ARO เชดด้าบูดเส้นแช่แข็ง 1 กก.` = shredded CHEDDAR, the barcode already catalogued under
-- RAW-GOLD_SHREDDED_CHEDDAR. And "Powder 1" (83bf4ed0, 9 x 41) is Makro article 28006169, the 1 kg potato pack.
-- Applied through the claude.ai Supabase connector in one transaction; any failed assert rolls everything back.

CREATE TEMP TABLE tmp_money AS
    SELECT coalesce(sum(total_price),0) AS s, count(*) AS c FROM public.purchase_logs;
CREATE TEMP TABLE tmp_before_cost AS
    SELECT id, product_code, cost_per_unit, cost_source FROM public.nomenclature;

-- stub, new code, new name, base_unit, category, qty multiplier, why
CREATE TEMP TABLE tmp_promote(stub_code text, new_code text, new_name text, base_unit text,
                              category text, qty_factor numeric, why text);
INSERT INTO tmp_promote VALUES
 ('RAW-AUTO-ac6774da','RAW-CREAM-WHIPPING_ANCHOR',      'Anchor Whipping Cream 1 L',                               'L',   'Milk & Cream', 1,    '2 x 1 L'),
 ('RAW-AUTO-bb286db5','RAW-BAG_KRAFT_15X15',            'Kraft Side-Open Bag, Brown 15x15 cm (pack of 95-100)',    'pack', NULL,          1,    'priced per pack; count is a 95-100 range'),
 ('RAW-AUTO-99ad9985','RAW-CONTAINER_SQUARE_40X30',     'Square Tray Set 40x30 with Lid',                          'set',  NULL,          1,    '3 sets'),
 ('RAW-AUTO-9bf93ab3','RAW-TRUFFLE-MUSHROOM_SAUCE',     'Giuliano Truffle Mushroom Sauce 500 g',                   'g',   'Base Sauces',  500,  '500 g bottle'),
 ('RAW-AUTO-45fddb3e','RAW-SALMON-FZ_PORTIONS',         'ARO Frozen Salmon Portions (4 pcs, 480 g)',               'kg',  'Seafood',      0.48, '480 g pack'),
 ('RAW-AUTO-2ec7b438','RAW-SHRIMP-WHITE_FZ_TAILON_32_38','SAVE Frozen White Shrimp Tail-on 32-38/kg, 1 kg',        'kg',  'Seafood',      1,    '1 kg pack'),
 ('RAW-AUTO-2f126585','RAW-SHRIMP-WHITE_FZ_TAILON_48_54','SAVE Frozen White Shrimp Tail-on 48-54/kg, 1 kg',        'kg',  'Seafood',      1,    '1 kg pack'),
 ('RAW-AUTO-33d0e47b','RAW-JAR_POP_1000ML',             'POP Jar 1000 ml, Glass Lid',                              'pcs',  NULL,          1,    'priced per jar, 6 jars');

-- stub, destination, qty multiplier, why
CREATE TEMP TABLE tmp_merge(stub_code text, canon_code text, qty_factor numeric, why text);
INSERT INTO tmp_merge VALUES
 ('RAW-AUTO-cd6db537','RAW-CHICKEN-BREAST',                    1,   'weighed kg, skinless'),
 ('RAW-AUTO-402fc40e','RAW-COFFEE-ESPRESSO',                   600, '600 g pack'),
 ('RAW-AUTO-e62258f6','RAW-COFFEE-ESPRESSO',                   600, '600 g pack'),
 ('RAW-AUTO-b5b0622e','RAW-COCONUT-OIL',                       1,   '1 L bottle'),
 ('RAW-AUTO-97fb7755','RAW-MATCHA-POWDER',                     0.1, '100 g tin'),
 ('RAW-AUTO-e6e4de40','RAW-TONIC_WATER',                       24,  'tray of 24 cans'),
 ('RAW-AUTO-a49369f1','RAW-FROZEN_SCALLOP_MEAT_16LB',          1,   '1 kg pack, same barcode'),
 ('RAW-AUTO-b2f2a0c5','RAW-GOLD_SHREDDED_CHEDDAR',             1,   '1 kg, article is cheddar not mozzarella'),
 ('RAW-AUTO-10f88f0e','RAW-CHEESE-MOZZARELLA',                 1,   '1 kg IQF'),
 ('RAW-AUTO-ff2cc49c','RAW-MOZZARELLA_MIXED_CHEDDAR_CHEESE',   1,   '1 kg'),
 ('RAW-AUTO-94ac9da4','RAW-MOZZARELLA_MIXED_CHEDDAR_CHEESE',   1,   '1 kg, same barcode'),
 ('RAW-AUTO-83bf4ed0','RAW-POTATO',                            1,   '9 packs of 1 kg'),
 ('RAW-AUTO-2c1b599d','RAW-BAG_KRAFT_15X15',                   1,   'same bag, per pack'),
 ('RAW-AUTO-13eb3180','RAW-SHRIMP-WHITE_FZ_TAILON_48_54',      1,   '1 kg pack');

DO $$
DECLARE r record; v int;
BEGIN
    FOR r IN SELECT stub_code AS c FROM tmp_merge UNION ALL SELECT stub_code FROM tmp_promote LOOP
        SELECT count(*) INTO v FROM public.nomenclature WHERE product_code = r.c AND coalesce(is_deleted,false) = false;
        IF v <> 1 THEN RAISE EXCEPTION '503 abort: stub % not found live', r.c; END IF;
        SELECT count(*) INTO v FROM public.bom_structures b JOIN public.nomenclature n ON n.id = b.ingredient_id
         WHERE n.product_code = r.c;
        IF v > 0 THEN RAISE EXCEPTION '503 abort: stub % is referenced by % BOM line(s)', r.c, v; END IF;
    END LOOP;

    -- merge destinations that already exist (the promoted ones are created below)
    FOR r IN SELECT DISTINCT canon_code AS c FROM tmp_merge
              WHERE canon_code NOT IN (SELECT new_code FROM tmp_promote) LOOP
        SELECT count(*) INTO v FROM public.nomenclature WHERE product_code = r.c AND coalesce(is_deleted,false) = false;
        IF v <> 1 THEN RAISE EXCEPTION '503 abort: canonical % missing or retired', r.c; END IF;
    END LOOP;

    -- a promotion must not duplicate a concept that already exists among live RAW products
    SELECT count(*) INTO v FROM public.nomenclature n
     WHERE coalesce(n.is_deleted,false) = false AND n.product_code LIKE 'RAW-%' AND n.product_code NOT LIKE 'RAW-AUTO-%'
       AND (n.name ~* 'whipp' OR (n.name ~* 'truffle' AND n.name ~* 'mushroom') OR n.name ~* 'pop jar'
            OR n.name ~* 'tail.?on' OR n.name ~* 'salmon.*(portion|480)'
            OR n.product_code IN (SELECT new_code FROM tmp_promote));
    IF v > 0 THEN RAISE EXCEPTION '503 abort: a promoted concept already exists in nomenclature (% hit)', v; END IF;

    SELECT count(*) INTO v FROM public.purchase_logs p JOIN public.nomenclature n ON n.id = p.nomenclature_id
     WHERE n.product_code IN (SELECT stub_code FROM tmp_merge UNION SELECT stub_code FROM tmp_promote)
       AND p.voided_at IS NULL;
    IF v <> 23 THEN RAISE EXCEPTION '503 abort: expected 23 live rows on the 22 stubs, found %', v; END IF;
END $$;

-- PROMOTE first (so the two merges into promoted products have a destination)
DO $$
DECLARE p record; v_id uuid; v_name text; v_moved int; v_total int := 0;
BEGIN
    FOR p IN SELECT * FROM tmp_promote LOOP
        SELECT id, name INTO v_id, v_name FROM public.nomenclature WHERE product_code = p.stub_code;

        UPDATE public.nomenclature
           SET product_code = p.new_code, name = p.new_name, base_unit = p.base_unit,
               type = 'raw_ingredient', category = p.category,
               aliases = ARRAY[v_name], is_available = true, updated_at = now(),
               notes = 'Promoted from ' || p.stub_code || ' by mig 503 (MC 00a81c22 B.2)'
         WHERE id = v_id;

        UPDATE public.purchase_logs
           SET quantity       = round(quantity * p.qty_factor, 6),
               price_per_unit = round(total_price / (quantity * p.qty_factor), 4),
               notes = coalesce(notes,'') || ' [mig503 promote ' || p.stub_code || '->' || p.new_code
                    || ', qty x' || p.qty_factor || ' (' || p.why || '); receipt image read]'
         WHERE nomenclature_id = v_id AND voided_at IS NULL;
        GET DIAGNOSTICS v_moved = ROW_COUNT;
        v_total := v_total + v_moved;
        PERFORM public.fn_recalc_wac_for_product(v_id);
    END LOOP;
    IF v_total <> 8 THEN RAISE EXCEPTION '503 abort: promoted % rows, expected 8', v_total; END IF;
END $$;

-- MERGE: cost-frozen repoint + tombstone
DO $$
DECLARE m record; v_stub uuid; v_canon uuid; v_name text; v_moved int; v_total int := 0;
BEGIN
    FOR m IN SELECT * FROM tmp_merge LOOP
        SELECT id, name INTO v_stub, v_name FROM public.nomenclature WHERE product_code = m.stub_code;
        SELECT id INTO v_canon FROM public.nomenclature WHERE product_code = m.canon_code;

        UPDATE public.purchase_logs
           SET nomenclature_id = v_canon,
               quantity        = round(quantity * m.qty_factor, 6),
               price_per_unit  = round(total_price / (quantity * m.qty_factor), 4),
               notes = coalesce(notes,'') || ' [mig503 ' || m.stub_code || '->' || m.canon_code
                    || ', qty x' || m.qty_factor || ' (' || m.why || '); receipt image read]'
         WHERE nomenclature_id = v_stub AND voided_at IS NULL;
        GET DIAGNOSTICS v_moved = ROW_COUNT;
        IF v_moved = 0 THEN RAISE EXCEPTION '503 abort: % had no live rows', m.stub_code; END IF;
        v_total := v_total + v_moved;

        UPDATE public.nomenclature
           SET is_deleted = true, is_available = false,
               name = '[MERGED->' || m.canon_code || '] ' || v_name, updated_at = now()
         WHERE id = v_stub;
    END LOOP;
    IF v_total <> 15 THEN RAISE EXCEPTION '503 abort: merged % rows, expected 15', v_total; END IF;
END $$;

DO $$
DECLARE b record; a record; v_bad int; v_list text; r record; v_exp numeric;
BEGIN
    SELECT * INTO b FROM tmp_money;
    SELECT coalesce(sum(total_price),0) AS s, count(*) AS c INTO a FROM public.purchase_logs;
    IF a.s <> b.s OR a.c <> b.c THEN
        RAISE EXCEPTION '503 abort: money or rows moved, % / % -> % / %', b.s, b.c, a.s, a.c;
    END IF;

    FOR r IN
        SELECT n.id, n.product_code, n.cost_per_unit, n.cost_source FROM public.nomenclature n
         WHERE n.product_code IN (SELECT canon_code FROM tmp_merge UNION SELECT new_code FROM tmp_promote)
    LOOP
        IF r.cost_source = 'manual' THEN
            SELECT cost_per_unit INTO v_exp FROM tmp_before_cost WHERE id = r.id;
            IF r.cost_per_unit IS DISTINCT FROM v_exp THEN
                RAISE EXCEPTION '503 abort: manual cost on % moved % -> %', r.product_code, v_exp, r.cost_per_unit;
            END IF;
        ELSE
            SELECT round(sum(total_price)/nullif(sum(quantity),0),4) INTO v_exp FROM public.purchase_logs
             WHERE nomenclature_id = r.id AND quantity > 0 AND total_price IS NOT NULL AND voided_at IS NULL;
            IF v_exp IS NULL OR r.cost_per_unit IS NULL OR abs(r.cost_per_unit - v_exp) > 0.0001 THEN
                RAISE EXCEPTION '503 abort: % cost % does not match its history %', r.product_code, r.cost_per_unit, v_exp;
            END IF;
        END IF;
    END LOOP;

    SELECT count(*), string_agg(n.product_code, ', ') INTO v_bad, v_list
      FROM public.nomenclature n JOIN tmp_before_cost t ON t.id = n.id
     WHERE coalesce(n.is_deleted,false) = false AND n.product_code LIKE 'RAW-%'
       AND ((n.cost_per_unit IS NULL AND t.cost_per_unit IS NOT NULL)
            OR (n.cost_source = 'none' AND t.cost_source IS DISTINCT FROM 'none'));
    IF v_bad > 0 THEN RAISE EXCEPTION '503 abort: % live ingredient(s) lost their cost: %', v_bad, v_list; END IF;

    SELECT count(*), string_agg(n.product_code, ', ') INTO v_bad, v_list
      FROM public.nomenclature n JOIN tmp_before_cost t ON t.id = n.id
     WHERE (n.cost_per_unit IS DISTINCT FROM t.cost_per_unit OR n.cost_source IS DISTINCT FROM t.cost_source)
       AND n.product_code LIKE 'RAW-%'
       AND t.product_code NOT IN (SELECT stub_code FROM tmp_merge UNION SELECT stub_code FROM tmp_promote)
       AND n.product_code NOT IN (SELECT canon_code FROM tmp_merge);
    IF v_bad > 0 THEN RAISE EXCEPTION '503 abort: % unintended ingredient cost change(s): %', v_bad, v_list; END IF;

    SELECT count(*) INTO v_bad FROM public.purchase_logs p JOIN public.nomenclature n ON n.id = p.nomenclature_id
     WHERE n.product_code IN ('RAW-AUTO-615e2645','RAW-AUTO-53ae5f17','RAW-AUTO-642000f9') AND p.voided_at IS NULL;
    IF v_bad <> 3 THEN RAISE EXCEPTION '503 abort: the 3 unresolved stubs should still hold 3 rows, hold %', v_bad; END IF;

    SELECT count(*) INTO v_bad FROM tmp_merge m JOIN public.nomenclature n ON n.name LIKE '[MERGED->' || m.canon_code || ']%'
     WHERE n.product_code = m.stub_code AND n.is_deleted = true;
    IF v_bad <> 14 THEN RAISE EXCEPTION '503 abort: only % of 14 tombstones carry the [MERGED->] prefix', v_bad; END IF;
END $$;

INSERT INTO public.migration_log (filename, applied_by, status, notes)
VALUES ('503_next25_raw_auto_stub_merge_and_promote.sql', 'claude-opus-session-8b14dc07', 'success',
        'MC 00a81c22 item 6 Part B.2, second pass (stubs ranked 26-50 by spend, 9,108.75 THB). 14 stubs MERGED into existing canonicals, 8 PROMOTED in place, 3 left alone (food-box pack count ambiguous, line hidden under a stamp, a 2024 junk row). Pack sizes read off receipt images; quantity normalized, total_price untouched. 8,028.75 THB moved off stubs.')
ON CONFLICT DO NOTHING;

-- INTENTIONAL DROP — all four are TEMP tables created by this migration above.
DROP TABLE tmp_money; DROP TABLE tmp_before_cost; DROP TABLE tmp_merge; DROP TABLE tmp_promote;
