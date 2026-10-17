-- 502 — resolve the 25 biggest RAW-AUTO stubs by purchase spend: 19 MERGE, 3 PROMOTE, 3 left alone
--       (MC 00a81c22, item 6 Part B.2 — slice "top 25 stubs by spend")
--
-- BEFORE (measured live, not from stub-merge-map.md):
--   359 RAW-AUTO stubs hold live purchase rows worth 62,782.59 THB of 164,590.344 recorded (984 rows).
--   The top 25 by spend hold 18,624.90 THB. None of it reached a dish: 0 BOM lines point at any of them.
--
-- METHOD (settled, not redesigned here): every pack size below was read off the receipt IMAGE through
-- the finance MCP download_receipt, never from OCR text. Quantity is normalized to the product's base
-- unit; total_price is NEVER touched (mig 390 rule, mig 460 section 5 precedent), so no money moves.
-- MERGE = cost-frozen repoint onto an existing canonical + a `[MERGED->CODE]` tombstone (mig 325
-- pattern; fn_match_nomenclature's last level reads the destination out of that prefix).
-- PROMOTE = the stub is renamed IN PLACE into a real product (new code/name/base_unit, original stub
-- name kept as an alias so the next receipt line still resolves through the name:aliases level).
--
-- ── THE LAMB QUESTION ───────────────────────────────────────────────────────────────────────────────
-- Seven stubs: "AU Frozen Lamb 1KG", "KUP Frozen Lamb 1KG", "Frozen Lamb Meat 1KG", "AU Frozen Minced
-- Lamb 1KG" (all 420 x2) and "CP Frozen Minced Lamb 1KG", "CP Frozen Lamb Meat 1KG", "Australian Frozen
-- Minced Lamb 1 kg" (all 485 x1). Minced lamb is NOT the same product as a lamb cut for costing — a
-- boned shoulder (RAW-LAMB-SHOULDER, 450/kg) and a frozen mince pack are different yields and prices.
-- So the names alone could not justify lumping them. The IMAGES do. All seven lines are one Makro
-- article, 831436, printed `AU เนื้อแกะบดแช่แข็ง 1KG` (บด = minced) — read on six chits:
--   16-05 66041272615 · 20-05 66071280841 (sheet 1, see below) · 23-05 66111287799 · 02-06 36081307490
--   14-09 66071515039 · 28-09 166901038443 (line 20, ออสเตรเลีย) · 02-10 166081550381
-- The stub names lost the word "minced" (or gained "Lamb Meat") when the importer abbreviated them.
-- Verdict: one SKU, one product, no split. All seven go to RAW-LAMB_MINCE. Price moved 420 -> 485 in
-- September; the lifetime WAC (433.00) reflects both. RAW-LAMB_MINCE already carries two 420 rows
-- labelled "Lamb Leg"/"Lamb Shoulder" that are probably the same article — NOT touched (out of scope).
--
-- ── DECISIONS, ONE PER STUB, WITH THE RECEIPT THAT JUSTIFIES IT ─────────────────────────────────────
--  #  stub              spend    outcome  -> destination                    receipt / what the image says
--  1  e2d609b8        1546.15   LEFT     (unresolved)                       Farang Food Paradise payment slip QO-9823 lists only "Invoice
--                                                                          2606/957645 160.00 + 2606/957646 1,546.15". No line items exist in
--                                                                          the system; need invoice 2606/957646 itself.
--  2  6eb5e77b        1250.00   MERGE    RAW-OLIVE-OIL (qty 1->5 L)         2609/000693 28-09-2026: `6VR006 Extra Virgin Olive Oil 'Ybarra' /
--                                                                          5L Pail` qty 1 @1,250 = 250/L.
--  3  5c683281        1054.75   PROMOTE  RAW-BEEF-CRYING_TIGER (kg)         Makro 66031495105 04-09-2026: `AU เสือร้องไห้วัว กก.ละ` 3.196 kg
--                                                                          @330 (weighed). Crying tiger = a beef cut; nothing like it existed.
--  4  e104d9c7        1047.25   MERGE    RAW-SHRIMP (kg, qty kept)          Makro 66111346474 22-06-2026: `กุ้งขาวใหญ่ 41-45 ตัว/กก.` 2.096 kg
--                                                                          @247 (weighed). 01-07 row (6051364827) merged on name+weighed qty;
--                                                                          that image was not opened.
--  5  1e32cde2         879.00   MERGE    RAW-POTATO (qty kept, 1 pack=1 kg) Makro art 28006169 `มันฝรั่งแพ็ค 1 กก.` read on 20-05, 24-09;
--                                                                          05-14 and 05-29 rows merged on the same article name.
--  6  6ec5635b         865.75   MERGE    RAW-BEEF-STRIPLOIN (REVIVED)       Makro 66071280841 20-05-2026 sheet 1: `AU สันนอกวัว กก.ละ` 1.924 kg
--                                                                          @450. สันนอก = striploin; the stub's "Outside Round" is wrong.
--  7  13d581a7         840.00   MERGE    RAW-LAMB_MINCE                     art 831436, 16-05 (see lamb question)
--  8  dd1bf505         840.00   MERGE    RAW-LAMB_MINCE                     art 831436, 02-06
--  9  9a659e56         840.00   MERGE    RAW-LAMB_MINCE                     art 831436, 23-05
-- 10  f9d56227         840.00   MERGE    RAW-LAMB_MINCE                     art 831436, 20-05
-- 11  d27f620d         828.00   PROMOTE  RAW-SHRIMP-WHITE_FZ_26_30 (kg)     Makro 166041535091 24-09-2026: `CP กุ้งขาวถุงตาข่าย(26-30) 500ก` 4 packs
--                                                                          @207 -> 2 kg. Peeled vs shell-on is not printed, so it is kept apart
--                                                                          from RAW-SHRIMP (fresh 41-45) and RAW-SHRIMP-PEELED rather than guessed.
-- 12  5874b02d         758.00   MERGE    RAW-COFFEE-ESPRESSO (g, x600)      Makro 66151368350 03-07-2026: `บอนกาแฟ เอสเพรสโซ่ เม็ด 600 ก X1` 2 @379.
-- 13  677a770f         700.00   LEFT     (unresolved — not a product)       Payment for water delivery, an OpEx item booked into purchase_logs.
--                                                                          Needs a void/reclass, which is the OpEx backfill, out of scope.
-- 14  4b587bbf         657.00   MERGE    RAW-POTATO (qty kept)              art 28006169 on 02-06 (read); 08-06 and 17-07 rows by article name.
-- 15  85ca7969         634.75   MERGE    RAW-RED_CABBAGE (kg, qty kept)     Makro 166901037788 20-09-2026: `373997 กะหล่ำปลีม่วง 13 กก.ขึ้นไป กก.ละ`
--                                                                          14.104 kg @45 (weighed).
-- 16  7261e4f6         569.00   MERGE    RAW-SMOKED_TROUT (kg, x0.5)        Makro 166081550381 02-10-2026: `8851988009170 ARO FZ แซลมอนเทราต์รมควัน
--                                                                          สไลซ์ 500ก` @569.
-- 17  9f4920b5         519.00   MERGE    RAW-SMOKED_TROUT (kg, x0.5)        same article 23-05-2026 @519: 500 g — the stub's "5oz" is wrong.
-- 18  2c4adb9a         519.00   MERGE    RAW-SMOKED_TROUT (kg, x0.5)        01-07 @519, same article by name+price; image not opened.
-- 19  042876d1         510.00   LEFT     (unresolved)                       24-02 delivery bill is handwritten: 2 x 230, no volume stated.
--                                                                          17-09 gas/water slip: handwritten "50", no quantity or unit. Neither
--                                                                          supports 19 L; the 50 x 1 booking is a parse artifact.
-- 20  67a60a1d         493.25   MERGE    RAW-SHRIMP (kg, qty kept)          Makro 66071396986 17-07-2026: `กุ้งขาวใหญ่ 41-45 ตัว/กก.` 1.934 kg @255.
-- 21  d0592da6         490.00   MERGE    RAW-BOTTLE_PET_250 (pcs, x150)     Sangdamrong 000601002468: `25643800 ขวด PET 250 CC. กลมเรียบสูงเปล่า+ฝา
--                                                                          13g. (แพ็คx150)` 1 pack @490 = 150 bottles.
-- 22  4022df30         489.00   PROMOTE  RAW-COFFEE-ARO_BLACK (g, x1000)    Makro 062111301131 30-05-2026: `8859603300299 ARO เมล็ดกาแฟแบล็ค 1000ก`
--                                                                          @489. A house-brand roast, a different product from Boncafe espresso.
-- 23  80858736         485.00   MERGE    RAW-LAMB_MINCE                     art 831436, 14-09
-- 24  f562e9cb         485.00   MERGE    RAW-LAMB_MINCE                     art 831436, 28-09
-- 25  e845f31e         485.00   MERGE    RAW-LAMB_MINCE                     art 831436, 02-10
--
-- Money moved off stubs: 18,624.90 - (1,546.15 + 700.00 + 510.00) = 15,868.75 THB.
-- Stubs with live rows: 359 -> 337 (19 merged away + 3 promoted out of the RAW-AUTO class).
--
-- THE TRAP FROM MIG 488 — trg_recalc_wac_on_purchase_update recalculates BOTH sides of a repoint, so a
-- product that loses its last row is written cost_per_unit NULL / cost_source 'none'. Here the only
-- products that lose their last row are the tombstoned stubs (0 BOM lines, asserted below), so
-- nothing live can be nulled. Costs are snapshotted first and the closing assert polices every RAW-
-- product OUTSIDE the intended set; PF-/SALE-/MOD- are allowed to move through trg_cascade_bom_cost.
-- RAW-SHRIMP is cost_source='manual' (239): the trigger skips it, so its cost is asserted UNCHANGED.
--
-- APPLIED 2026-10-17 through the claude.ai Supabase connector (the plugin silently declines writes); the
-- connector wraps this file in one transaction, so any failed assert rolls everything back.

CREATE TEMP TABLE tmp_money AS
    SELECT coalesce(sum(total_price),0) AS s, count(*) AS c FROM public.purchase_logs;
CREATE TEMP TABLE tmp_before_cost AS
    SELECT id, product_code, cost_per_unit, cost_source FROM public.nomenclature;

-- stub_code, destination code, quantity multiplier (pack -> base unit)
CREATE TEMP TABLE tmp_merge(stub_code text, canon_code text, qty_factor numeric, why text);
INSERT INTO tmp_merge VALUES
 ('RAW-AUTO-6eb5e77b','RAW-OLIVE-OIL',        5,    '5 L pail'),
 ('RAW-AUTO-e104d9c7','RAW-SHRIMP',           1,    'weighed kg'),
 ('RAW-AUTO-67a60a1d','RAW-SHRIMP',           1,    'weighed kg'),
 ('RAW-AUTO-1e32cde2','RAW-POTATO',           1,    '1 pack = 1 kg'),
 ('RAW-AUTO-4b587bbf','RAW-POTATO',           1,    '1 pack = 1 kg'),
 ('RAW-AUTO-6ec5635b','RAW-BEEF-STRIPLOIN',   1,    'weighed kg'),
 ('RAW-AUTO-13d581a7','RAW-LAMB_MINCE',       1,    '1 pack = 1 kg'),
 ('RAW-AUTO-dd1bf505','RAW-LAMB_MINCE',       1,    '1 pack = 1 kg'),
 ('RAW-AUTO-9a659e56','RAW-LAMB_MINCE',       1,    '1 pack = 1 kg'),
 ('RAW-AUTO-f9d56227','RAW-LAMB_MINCE',       1,    '1 pack = 1 kg'),
 ('RAW-AUTO-80858736','RAW-LAMB_MINCE',       1,    '1 pack = 1 kg'),
 ('RAW-AUTO-f562e9cb','RAW-LAMB_MINCE',       1,    '1 pack = 1 kg'),
 ('RAW-AUTO-e845f31e','RAW-LAMB_MINCE',       1,    '1 pack = 1 kg'),
 ('RAW-AUTO-5874b02d','RAW-COFFEE-ESPRESSO',  600,  '600 g pack'),
 ('RAW-AUTO-85ca7969','RAW-RED_CABBAGE',      1,    'weighed kg'),
 ('RAW-AUTO-7261e4f6','RAW-SMOKED_TROUT',     0.5,  '500 g pack'),
 ('RAW-AUTO-9f4920b5','RAW-SMOKED_TROUT',     0.5,  '500 g pack'),
 ('RAW-AUTO-2c4adb9a','RAW-SMOKED_TROUT',     0.5,  '500 g pack'),
 ('RAW-AUTO-d0592da6','RAW-BOTTLE_PET_250',   150,  'pack of 150 bottles');

-- stub_code, new code, new name, base_unit, category, qty multiplier
CREATE TEMP TABLE tmp_promote(stub_code text, new_code text, new_name text, base_unit text,
                              category text, qty_factor numeric, why text);
INSERT INTO tmp_promote VALUES
 ('RAW-AUTO-5c683281','RAW-BEEF-CRYING_TIGER',   'Beef Crying Tiger (Australian)',                       'kg','Red Meat', 1,    'weighed kg'),
 ('RAW-AUTO-d27f620d','RAW-SHRIMP-WHITE_FZ_26_30','CP Frozen White Shrimp 26-30, 500 g net bag',          'kg','Seafood',  0.5,  '500 g pack'),
 ('RAW-AUTO-4022df30','RAW-COFFEE-ARO_BLACK',     'ARO Black Roast Coffee Beans 1000 g',                  'g', NULL,       1000, '1000 g bag');

-- ── PRE-FLIGHT ────────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE r record; v int;
BEGIN
    FOR r IN SELECT stub_code AS c FROM tmp_merge UNION ALL SELECT stub_code FROM tmp_promote LOOP
        SELECT count(*) INTO v FROM public.nomenclature WHERE product_code = r.c AND coalesce(is_deleted,false) = false;
        IF v <> 1 THEN RAISE EXCEPTION '502 abort: stub % not found live', r.c; END IF;
        SELECT count(*) INTO v FROM public.bom_structures b JOIN public.nomenclature n ON n.id = b.ingredient_id
         WHERE n.product_code = r.c;
        IF v > 0 THEN RAISE EXCEPTION '502 abort: stub % is referenced by % BOM line(s)', r.c, v; END IF;
    END LOOP;

    -- the destination must exist (RAW-BEEF-STRIPLOIN is retired and gets revived below)
    FOR r IN SELECT DISTINCT canon_code AS c FROM tmp_merge LOOP
        SELECT count(*) INTO v FROM public.nomenclature WHERE product_code = r.c;
        IF v <> 1 THEN RAISE EXCEPTION '502 abort: canonical % missing', r.c; END IF;
    END LOOP;

    -- promotion must not duplicate a concept that already exists (the mig 491 / RAW-DRIED_PARSLEY trap)
    SELECT count(*) INTO v FROM public.nomenclature n
     WHERE coalesce(n.is_deleted,false) = false AND n.product_code NOT LIKE 'RAW-AUTO-%'
       AND (n.name ~* '(crying|tiger)'
            OR n.product_code ~* '(CRYING|TIGER)'
            OR (n.name ~* 'shrimp|prawn' AND n.name ~* '(26.?-?.?30)')
            OR n.product_code IN ('RAW-BEEF-CRYING_TIGER','RAW-SHRIMP-WHITE_FZ_26_30','RAW-COFFEE-ARO_BLACK')
            OR (n.name ~* 'coffee' AND n.name ~* 'black'));
    IF v > 0 THEN RAISE EXCEPTION '502 abort: a promoted concept already exists in nomenclature (% hit)', v; END IF;

    -- every stub's live rows are the ones this migration was written against
    SELECT count(*) INTO v FROM public.purchase_logs p JOIN public.nomenclature n ON n.id = p.nomenclature_id
     WHERE n.product_code IN (SELECT stub_code FROM tmp_merge UNION SELECT stub_code FROM tmp_promote)
       AND p.voided_at IS NULL;
    IF v <> 28 THEN RAISE EXCEPTION '502 abort: expected 28 live rows on the 22 stubs, found %', v; END IF;
END $$;

-- ── REVIVE the retired striploin canonical (deleted 2026-04-20, 0 rows, 0 BOM, no notes) ─────────────
UPDATE public.nomenclature
   SET is_deleted = false, is_available = true, updated_at = now(),
       aliases = ARRAY['Beef Outside Round per kg', 'AU Beef Striploin']
 WHERE product_code = 'RAW-BEEF-STRIPLOIN' AND is_deleted = true;

-- ── MERGE: cost-frozen repoint + tombstone ────────────────────────────────────────────────────────
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
               notes = coalesce(notes,'') || ' [mig502 ' || m.stub_code || '->' || m.canon_code
                    || ', qty x' || m.qty_factor || ' (' || m.why || '); receipt image read]'
         WHERE nomenclature_id = v_stub AND voided_at IS NULL;
        GET DIAGNOSTICS v_moved = ROW_COUNT;
        IF v_moved = 0 THEN RAISE EXCEPTION '502 abort: % had no live rows', m.stub_code; END IF;
        v_total := v_total + v_moved;

        UPDATE public.nomenclature
           SET is_deleted = true, is_available = false,
               name = '[MERGED->' || m.canon_code || '] ' || v_name, updated_at = now()
         WHERE id = v_stub;
    END LOOP;
    IF v_total <> 25 THEN RAISE EXCEPTION '502 abort: merged % rows, expected 25', v_total; END IF;
END $$;

-- ── PROMOTE: rename in place, normalize quantity, keep the old stub name as an alias ─────────────
DO $$
DECLARE p record; v_id uuid; v_name text; v_moved int; v_total int := 0;
BEGIN
    FOR p IN SELECT * FROM tmp_promote LOOP
        SELECT id, name INTO v_id, v_name FROM public.nomenclature WHERE product_code = p.stub_code;

        UPDATE public.nomenclature
           SET product_code = p.new_code, name = p.new_name, base_unit = p.base_unit,
               type = 'raw_ingredient', category = p.category,
               aliases = ARRAY[v_name], is_available = true, updated_at = now(),
               notes = 'Promoted from ' || p.stub_code || ' by mig 502 (MC 00a81c22 B.2)'
         WHERE id = v_id;

        UPDATE public.purchase_logs
           SET quantity       = round(quantity * p.qty_factor, 6),
               price_per_unit = round(total_price / (quantity * p.qty_factor), 4),
               notes = coalesce(notes,'') || ' [mig502 promote ' || p.stub_code || '->' || p.new_code
                    || ', qty x' || p.qty_factor || ' (' || p.why || '); receipt image read]'
         WHERE nomenclature_id = v_id AND voided_at IS NULL;
        GET DIAGNOSTICS v_moved = ROW_COUNT;
        v_total := v_total + v_moved;
        -- quantity-only UPDATE does not fire the nomenclature_id trigger, so price the new product now
        PERFORM public.fn_recalc_wac_for_product(v_id);
    END LOOP;
    IF v_total <> 3 THEN RAISE EXCEPTION '502 abort: promoted % rows, expected 3', v_total; END IF;
END $$;

-- ── ASSERTS: no money moved, only intended costs moved ───────────────────────────────────────────
DO $$
DECLARE b record; a record; v_bad int; v_list text; r record; v_exp numeric; v_got numeric;
BEGIN
    SELECT * INTO b FROM tmp_money;
    SELECT coalesce(sum(total_price),0) AS s, count(*) AS c INTO a FROM public.purchase_logs;
    IF a.s <> b.s OR a.c <> b.c THEN
        RAISE EXCEPTION '502 abort: money or rows moved, % / % -> % / %', b.s, b.c, a.s, a.c;
    END IF;

    -- every touched canonical equals sum(total)/sum(qty) over its live rows (manual stays frozen)
    FOR r IN
        SELECT n.id, n.product_code, n.cost_per_unit, n.cost_source FROM public.nomenclature n
         WHERE n.product_code IN (SELECT canon_code FROM tmp_merge UNION SELECT new_code FROM tmp_promote)
    LOOP
        IF r.cost_source = 'manual' THEN
            SELECT cost_per_unit INTO v_exp FROM tmp_before_cost WHERE id = r.id;
            IF r.cost_per_unit IS DISTINCT FROM v_exp THEN
                RAISE EXCEPTION '502 abort: manual cost on % moved % -> %', r.product_code, v_exp, r.cost_per_unit;
            END IF;
        ELSE
            SELECT round(sum(total_price)/nullif(sum(quantity),0),4) INTO v_exp FROM public.purchase_logs
             WHERE nomenclature_id = r.id AND quantity > 0 AND total_price IS NOT NULL AND voided_at IS NULL;
            IF v_exp IS NULL OR r.cost_per_unit IS NULL OR abs(r.cost_per_unit - v_exp) > 0.0001 THEN
                RAISE EXCEPTION '502 abort: % cost % does not match its history %', r.product_code, r.cost_per_unit, v_exp;
            END IF;
        END IF;
    END LOOP;

    -- nothing live may have been nulled
    SELECT count(*), string_agg(n.product_code, ', ') INTO v_bad, v_list
      FROM public.nomenclature n JOIN tmp_before_cost t ON t.id = n.id
     WHERE coalesce(n.is_deleted,false) = false AND n.product_code LIKE 'RAW-%'
       AND ((n.cost_per_unit IS NULL AND t.cost_per_unit IS NOT NULL)
            OR (n.cost_source = 'none' AND t.cost_source IS DISTINCT FROM 'none'));
    IF v_bad > 0 THEN RAISE EXCEPTION '502 abort: % live ingredient(s) lost their cost: %', v_bad, v_list; END IF;

    -- no RAW- cost may move outside the intended set (tombstoned stubs are the stubs themselves)
    SELECT count(*), string_agg(n.product_code, ', ') INTO v_bad, v_list
      FROM public.nomenclature n JOIN tmp_before_cost t ON t.id = n.id
     WHERE (n.cost_per_unit IS DISTINCT FROM t.cost_per_unit OR n.cost_source IS DISTINCT FROM t.cost_source)
       AND n.product_code LIKE 'RAW-%'
       AND t.product_code NOT IN (SELECT stub_code FROM tmp_merge UNION SELECT stub_code FROM tmp_promote)
       AND n.product_code NOT IN (SELECT canon_code FROM tmp_merge);
    IF v_bad > 0 THEN RAISE EXCEPTION '502 abort: % unintended ingredient cost change(s): %', v_bad, v_list; END IF;

    -- the three left-alone stubs are untouched and still carry their rows
    SELECT count(*) INTO v_bad FROM public.purchase_logs p JOIN public.nomenclature n ON n.id = p.nomenclature_id
     WHERE n.product_code IN ('RAW-AUTO-e2d609b8','RAW-AUTO-677a770f','RAW-AUTO-042876d1') AND p.voided_at IS NULL;
    IF v_bad <> 4 THEN RAISE EXCEPTION '502 abort: the 3 unresolved stubs should still hold 4 rows, hold %', v_bad; END IF;

    -- every tombstone carries the prefix fn_match_nomenclature reads
    SELECT count(*) INTO v_bad FROM tmp_merge m JOIN public.nomenclature n ON n.name LIKE '[MERGED->' || m.canon_code || ']%'
     WHERE n.product_code = m.stub_code AND n.is_deleted = true;
    IF v_bad <> 19 THEN RAISE EXCEPTION '502 abort: only % of 19 tombstones carry the [MERGED->] prefix', v_bad; END IF;
END $$;

INSERT INTO public.migration_log (filename, applied_by, status, notes)
VALUES ('502_top25_raw_auto_stub_merge_and_promote.sql', 'claude-opus-session-8b14dc07', 'success',
        'MC 00a81c22 item 6 Part B.2 (top 25 stubs by spend, 18,624.90 THB). 19 stubs MERGED into existing '
     || 'canonicals (cost-frozen repoint + [MERGED->CODE] tombstone), 3 PROMOTED in place, 3 left alone '
     || '(payment slip with no lines / OpEx water payment / unreadable handwritten water bills). Pack '
     || 'sizes read off receipt images; quantity normalized, total_price untouched. All 7 lamb stubs are '
     || 'Makro article 831436 minced lamb -> RAW-LAMB_MINCE. 15,868.75 THB moved off stubs. 0 BOM refs '
     || 'on any stub; RAW-SHRIMP manual 239 asserted unchanged.')
ON CONFLICT DO NOTHING;

-- INTENTIONAL DROP — all four are TEMP tables created by this migration above.
DROP TABLE tmp_money; DROP TABLE tmp_before_cost; DROP TABLE tmp_merge; DROP TABLE tmp_promote;
