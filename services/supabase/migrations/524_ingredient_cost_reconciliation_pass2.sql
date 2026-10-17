-- 524 — ingredient cost reconciliation, pass 2 (MC e5969ed9; parent audit MC 00a81c22; pass 1 = mig 488)
--
-- WHAT THIS IS. Pass 1 (488) took the 15 contradicting ingredients with the widest BOM reach.
-- Pass 2 takes the seven that matter by UNITS SOLD (v_analytics_item_sales_daily, last 120 days,
-- summed over every live dish the ingredient reaches through the BOM tree), measured live
-- 2026-10-17 against v_cost_trust_nomenclature WHERE contradicts_history:
--   RAW-LEMON-JUICE 253 sold/23 dishes · RAW-CORIANDER-POWDER 134/6 · RAW-FENUGREEK 133/5 ·
--   RAW-TURMERIC 133/7 · (RAW-CABBAGE 96, excluded — small-pack premium, not an error) ·
--   RAW-BANANA 95/10 · RAW-CHERRY-TOMATO 91/11 · RAW-OREGANO-DRIED 30/3.
-- Applied through the claude.ai Supabase connector, one transaction. Number claimed with
-- claim_migration_number, never picked by eye.
--
-- METHOD (mig 390 / 460 s5 / 488): normalise the QUANTITY to the nomenclature base_unit, never
-- touch total_price, recompute WAC for the touched products only. Every change is keyed to one
-- purchase_logs.id and names the receipt photograph it was read from. receipts is a private
-- bucket: the only reader is the finance MCP download_receipt.
--
-- ══ PER INGREDIENT — what the photographs say ═══════════════════════════════════════════════
--
-- 1. RAW-FENUGREEK (base kg). STORED COST WAS RIGHT, THE PURCHASE ROW WAS WRONG.
--    image: Makro 00174 rcpt 166501166008 23-03-2026, "8858567000955 ลูกซัด 50 กรัม" qty 10 @19 =
--    190.00. Ten 50 g packs = 0.5 kg, but the row booked quantity 10 (a pack count) against a kg
--    base. 190/0.5 = 380.00/kg — exactly the stored 380. The "19/kg" the trust view held against
--    it was the price of ONE sachet. Quantity 10 -> 0.5.
--
-- 2. RAW-TURMERIC (base kg). THE PHOTOGRAPHS EXIST — 488 looked at the wrong sheet.
--    Mig 488 said the turmeric line "was on an unstored sheet". It was stored: the missing sheets
--    sit in expense_ledger.tax_invoice_url, not in receipt_supplier_url. Read now:
--      * GO Wholesale PK1IF26020007408 23-02-2026 sheet 2/2, line 36 "8854700004231 ขมิ้น ปน 200ก.
--        X1" 1 @68 -> 200 g
--      * Makro 00063 062501126001 03-03-2026 sheet 1/2, "8854700000455 ขมิ้นผง 250 กรัม" 1 @75
--        -> 250 g, and "8858567000559 ขมิ้นชั้น ผง 250 กรัม (อินเดีย)" 1 @69 -> 250 g
--    Quantities 1 -> 0.2 / 0.25 / 0.25. Log = 212/0.70 = 302.8571/kg against a stored 308.00
--    (1.7% apart), so the stored cost was approximately right and only the log was in packs.
--    WAC recomputed -> 302.8571.
--
-- 3. RAW-CORIANDER-POWDER (base kg). BOTH SIDES WERE WRONG.
--    image: Makro 00063 062501126001 03-03-2026 sheet 1/2 "8858567000856 เม็ดผักชี ป่น 200 กรัม"
--    1 @39; Makro 00063 062501196002 07-04-2026 "8858567000856 ... 200 กรัม" qty 2 @39 = 78.
--    So 200 g packs: 0.2 kg and 0.4 kg. The stored 43.98/kg was ground-coriander at 39/200 g
--    treated as per-kg-ish — real cost is 117/0.6 = 195.00/kg, FOUR times what the dishes carry.
--    Third row 751e2202 (26-09-2026, 10 THB, Local Market): the "receipt" is a handwritten sticky
--    note reading "Buy coriander 10 B" — no weight, no product form; at 10 THB it is a bunch of
--    FRESH coriander, not powder. It is voided (not deleted, not repointed to the fresh canonical
--    with an invented weight); void_reason says why. WAC -> 195.0000.
--
-- 4. RAW-OREGANO-DRIED (base kg). STORED WAS RIGHT-ISH, LOG WAS IN PACKS.
--    image: Makro 00063 062501118002 27-02-2026 "8858567001198 ออริกาโน 50 กรัม" 1 @45;
--    Makro 00063 166501134002 07-03-2026 "8850885414261 ออริกาโนตรามือ 100กรัม X1" 1 @89;
--    Makro 00174 166011268527 14-05-2026 "8858567001198 ออริกาโน 50 กรัม" 1 @45.
--    Quantities 1 -> 0.05 / 0.10 / 0.05. Log = 179/0.20 = 895.00/kg vs stored 890.00. The "59.67/kg"
--    the view held was the price of a sachet. WAC -> 895.0000.
--
-- 5. RAW-CHERRY-TOMATO (base kg). ONE ROW OF THREE WAS WRONG.
--    image: Makro 00174 rcpt 166501180002 30-03-2026 sheet 2/3 "910544 มะเขือเทศราชินี 500กรัม
--    แพ็คละ" qty 2 @49 = 98 -> two 500 g packs = 1.0 kg, booked as 2. The other two rows were
--    already in kg and agree with their receipts: 30-06-2026 "910544 ... 500กรัม" @45 = 0.5 kg
--    (the log's 0.5 @90); 21-07-2026 "858006 มะเขือเทศราชินี 250ก." @45 = 0.25 kg (180/kg — the
--    250 g pack premium). Log = 188/1.75 = 107.4286 vs stored 113.22 (5% apart). WAC -> 107.4286.
--    NB the last paid price is 180/kg and the next receipt will overwrite this (CEO decision
--    2026-10-17: costing stays "last paid price"); that is expected, not a bug.
--
-- 6. RAW-LEMON-JUICE (base L, cost_source 'manual'). THE 250 IS NOT CONTRADICTED; THE PURCHASE ROW
--    IS A DIFFERENT PRODUCT.
--    The stored 250.00 is a derived estimate for FRESH-squeezed lemon juice (mig 207: "lemons
--    ~100/kg, 40% yield -> 250/L") — a recipe decision, not a purchase price. The one purchase
--    row behind the "105/L" is image: Makro 00174 rcpt 166071223897 21-04-2026
--    "8859102500404 มะนีมะนาว น้ำมะนาวแช่แข็ง 500ก" 1 @105 — frozen LIME juice (มะนาว = lime), a
--    500 g bag, not one litre. It entered lemon juice when mig 325 merged the stub
--    RAW-AUTO-f2cfdee2 into it by its English translation "Frozen Lemon Juice Soon".
--    Decision: the ROW is wrong, the 250 stays. The row is repointed to RAW-LIME (the frozen lime
--    juice canonical, base kg) with quantity 1 -> 0.5 (a 500 g bag). RAW-LIME's own cost is
--    protected byte-identical (137.00, two ARO 1 kg rows at 135 and 139): the Manee Manao 500 g
--    bag is a different brand and size, 210/kg, and the CEO has not decided whether it belongs in
--    that average. Repointing it ALSO teaches the matcher barcode 8859102500404 = frozen lime
--    juice, which is the point: the next Manee Manao bag will no longer price lemon juice.
--    No dish cost changes from this item, and say so plainly.
--
-- 7. RAW-BANANA (base kg, cost_source catalog_estimate 35.00). LEFT UNTOUCHED — THE RECEIPTS CANNOT
--    SETTLE IT. image: Makro 00174 rcpt 166061236608 28-04-2026 "120171 กล้วยหอม A หวีละ" 1 @89 —
--    sold PER HAND (หวี), no weight printed; Local Market 20-09-2026 handwritten "กล้วยหอม" 1 @90,
--    no weight. Both purchase rows say quantity 1 "kg" and the 89.50 the view compares against is
--    simply the price of one hand. 35/kg is a catalog estimate nothing here contradicts or
--    confirms. One number settles it: what does a hand of bananas weigh?
--
-- RAW-COFFEE-ESPRESSO — THE "ONE REMAINING BAD-UNIT ROW" IS ALREADY HANDLED. Boncafe Espresso 250 g
-- (image: Makro 00063 rcpt 062501196002 07-04-2026 "8850287001700 บอนกาแฟ เอสเพรสโซ่ เม็ด 250G*1"
-- 1 @180) lives as b25d4357 quantity 250 g @0.72 (mig 460 unit-fix) and verified. The row that
-- reads quantity 500 (0eef5137) was voided by mig 460 as a duplicate import of the same expense
-- (77460cc2), with total 180 — its quantity*price only "differs from total" because it is
-- voided and left intact as evidence. No live row with quantity*price <> total remains
-- (measured, tolerance max(0.5 THB, 2%)). Nothing to change; RAW-COFFEE-ESPRESSO is untouched.
--
-- ══ WHAT IS DELIBERATELY NOT DONE ═══════════════════════════════════════════════════════════
-- No total_price change (asserted). No global WAC. No nomenclature created. RAW-LIME, RAW-LEMON-JUICE
-- and RAW-BANANA costs are asserted byte-identical. Cabbage and quinoa are small-pack premiums.
-- RAW-BEEF-MINCE (manual 370 vs 182 history) and RAW-THYME (968 vs 88) also contradict their
-- history and were NOT in this list — logged for the next pass.

CREATE TEMP TABLE tmp_qty_fix (
    pl_id    uuid PRIMARY KEY,
    code     text    NOT NULL,
    old_qty  numeric NOT NULL,
    new_qty  numeric NOT NULL,
    evidence text    NOT NULL
);

INSERT INTO tmp_qty_fix VALUES
 -- fenugreek: ten 50 g sachets
 ('f3867c85-7dcd-4b8c-8e27-43f128f75367', 'RAW-FENUGREEK', 10, 0.5,
  'image: Makro 00174 rcpt 166501166008 23-03-2026 "8858567000955 fenugreek 50 gram" qty 10 @19 = 190 -> ten 50 g packs'),
 -- turmeric
 ('e4ccde49-c7c0-45c1-8151-7e0467d3999d', 'RAW-TURMERIC', 1, 0.2,
  'image: GO Wholesale PK1IF26020007408 23-02-2026 sheet 2/2 line 36 "8854700004231 turmeric powder 200 g" 1 @68'),
 ('4ed210e2-a7ef-49d6-b42a-77c1aa45a563', 'RAW-TURMERIC', 1, 0.25,
  'image: Makro 00063 062501126001 03-03-2026 sheet 1/2 "8858567000559 turmeric powder India 250 gram" 1 @69'),
 ('47760d96-61bd-4094-a2fa-46e2615ea1cf', 'RAW-TURMERIC', 1, 0.25,
  'image: Makro 00063 062501126001 03-03-2026 sheet 1/2 "8854700000455 turmeric powder 250 gram" 1 @75'),
 -- coriander powder: 200 g packs
 ('6328cf4e-5b37-4747-8407-4d0302081f7c', 'RAW-CORIANDER-POWDER', 1, 0.2,
  'image: Makro 00063 062501126001 03-03-2026 sheet 1/2 "8858567000856 coriander seed powder 200 gram" 1 @39'),
 ('f20b38d0-2dcf-4ae9-9de3-9a0b203972ae', 'RAW-CORIANDER-POWDER', 2, 0.4,
  'image: Makro 00063 062501196002 07-04-2026 "8858567000856 coriander seed powder 200 gram" qty 2 @39 = 78'),
 -- dried oregano
 ('d8a97e09-3ead-42a3-af8c-ba2414b49fb6', 'RAW-OREGANO-DRIED', 1, 0.05,
  'image: Makro 00063 062501118002 27-02-2026 "8858567001198 oregano 50 gram" 1 @45'),
 ('6f3361bf-1d30-407f-9661-f4f92cc3f0ba', 'RAW-OREGANO-DRIED', 1, 0.1,
  'image: Makro 00063 166501134002 07-03-2026 "8850885414261 Hand Brand oregano 100 gram X1" 1 @89'),
 ('02a2f239-4ba7-4e8d-b87a-5750b47279ae', 'RAW-OREGANO-DRIED', 1, 0.05,
  'image: Makro 00174 166011268527 14-05-2026 "8858567001198 oregano 50 gram" 1 @45'),
 -- cherry tomato: two 500 g packs
 ('131ed950-241f-4312-bf5e-cc0782229ccf', 'RAW-CHERRY-TOMATO', 2, 1.0,
  'image: Makro 00174 rcpt 166501180002 30-03-2026 sheet 2/3 "910544 queen cherry tomato 500 gram per pack" qty 2 @49 = 98');

-- Wrong-product repoint: frozen LIME juice booked as lemon juice (see item 6).
CREATE TEMP TABLE tmp_repoint (
    pl_id     uuid PRIMARY KEY,
    from_code text NOT NULL,
    to_code   text NOT NULL,
    old_qty   numeric NOT NULL,
    new_qty   numeric NOT NULL,
    evidence  text NOT NULL
);
INSERT INTO tmp_repoint VALUES
 ('f2fc269b-b887-4c6a-8657-43ee7c4cbf32', 'RAW-LEMON-JUICE', 'RAW-LIME', 1, 0.5,
  'image: Makro 00174 rcpt 166071223897 21-04-2026 "8859102500404 Manee Manao frozen LIME juice 500 g" 1 @105 — lime not lemon, 500 g bag not 1 L');

-- Pre-flight: every row exists, unvoided, still shaped as when the photograph was read.
DO $$
DECLARE v_bad int; v_list text;
BEGIN
    SELECT count(*), string_agg(f.pl_id::text, ', ') INTO v_bad, v_list
      FROM tmp_qty_fix f
      LEFT JOIN public.purchase_logs pl ON pl.id = f.pl_id
      LEFT JOIN public.nomenclature n ON n.id = pl.nomenclature_id
     WHERE pl.id IS NULL OR pl.quantity <> f.old_qty OR pl.voided_at IS NOT NULL OR n.product_code <> f.code;
    IF v_bad > 0 THEN RAISE EXCEPTION '524 abort: % quantity-fix row(s) missing or drifted: %', v_bad, v_list; END IF;

    SELECT count(*), string_agg(r.pl_id::text, ', ') INTO v_bad, v_list
      FROM tmp_repoint r
      LEFT JOIN public.purchase_logs pl ON pl.id = r.pl_id
      LEFT JOIN public.nomenclature n ON n.id = pl.nomenclature_id
     WHERE pl.id IS NULL OR pl.quantity <> r.old_qty OR pl.voided_at IS NOT NULL OR n.product_code <> r.from_code;
    IF v_bad > 0 THEN RAISE EXCEPTION '524 abort: % repoint row(s) missing or drifted: %', v_bad, v_list; END IF;

    IF NOT EXISTS (SELECT 1 FROM public.purchase_logs WHERE id = '751e2202-2602-4848-a156-1fc073d635d1' AND voided_at IS NULL AND total_price = 10) THEN
        RAISE EXCEPTION '524 abort: coriander sticky-note row missing, already voided or changed';
    END IF;
END $$;

CREATE TEMP TABLE tmp_before_money AS
    SELECT coalesce(sum(total_price), 0) AS total_price_sum, count(*) AS row_count,
           count(*) FILTER (WHERE voided_at IS NOT NULL) AS voided_count
      FROM public.purchase_logs;

CREATE TEMP TABLE tmp_before_cost AS
    SELECT id, product_code, cost_per_unit, cost_source FROM public.nomenclature;

-- Cost each recomputed product must reach (computed from the photographs above, not from the DB).
CREATE TEMP TABLE tmp_recalc (product_code text PRIMARY KEY, expected numeric);
INSERT INTO tmp_recalc VALUES
 ('RAW-FENUGREEK', 380.0000),         -- 190 / 0.5
 ('RAW-TURMERIC', 302.8571),          -- 212 / 0.70
 ('RAW-CORIANDER-POWDER', 195.0000),  -- 117 / 0.60
 ('RAW-OREGANO-DRIED', 895.0000),     -- 179 / 0.20
 ('RAW-CHERRY-TOMATO', 107.4286);     -- 188 / 1.75

-- Costs that must leave this migration byte-identical to how they went in.
CREATE TEMP TABLE tmp_protected (product_code text PRIMARY KEY, why text);
INSERT INTO tmp_protected VALUES
 ('RAW-LEMON-JUICE', 'manual 250 = fresh-lemon estimate (mig 207); it loses its only row but the decision stands'),
 ('RAW-LIME',        'gains a row of a different brand/size; its 137.00 is held until the CEO decides'),
 ('RAW-BANANA',      'untouched — receipts price a hand, no weight');

-- ── Apply. total_price is in no SET list. ──
UPDATE public.purchase_logs pl
   SET quantity       = f.new_qty,
       price_per_unit = round(pl.total_price / f.new_qty, 4),
       notes          = coalesce(pl.notes, '') || ' [mig524 qty ' || f.old_qty || '->' || f.new_qty || '; ' || f.evidence || ']'
  FROM tmp_qty_fix f
 WHERE pl.id = f.pl_id;

UPDATE public.purchase_logs pl
   SET nomenclature_id = dest.id,
       quantity        = r.new_qty,
       price_per_unit  = round(pl.total_price / r.new_qty, 4),
       notes           = coalesce(pl.notes, '') || ' [mig524 repoint ' || r.from_code || '->' || r.to_code
                         || ', qty ' || r.old_qty || '->' || r.new_qty || '; ' || r.evidence || ']'
  FROM tmp_repoint r
  JOIN public.nomenclature dest ON dest.product_code = r.to_code
 WHERE pl.id = r.pl_id;

UPDATE public.purchase_logs
   SET voided_at   = now(),
       void_reason = 'Not a receipt: a handwritten sticky note "Buy coriander 10 B" (Local Market 2026-09-26, no weight, no product form). At 10 THB it is a bunch of FRESH coriander, not RAW-CORIANDER-POWDER (200 g packs at 39 THB). Left intact as evidence. MC e5969ed9, mig 524.'
 WHERE id = '751e2202-2602-4848-a156-1fc073d635d1' AND voided_at IS NULL;

-- trg_recalc_wac_on_purchase_update recalculated both sides of the repoint. Restore the protected
-- costs (lemon juice is manual and early-returns anyway; lime is the one the trigger moved).
UPDATE public.nomenclature n
   SET cost_per_unit = t.cost_per_unit, cost_source = t.cost_source, updated_at = now()
  FROM tmp_before_cost t
 WHERE t.id = n.id
   AND n.product_code IN (SELECT product_code FROM tmp_protected)
   AND (n.cost_per_unit IS DISTINCT FROM t.cost_per_unit OR n.cost_source IS DISTINCT FROM t.cost_source);

-- Recompute WAC — only the five. Never globally.
DO $$
DECLARE r record; v_new numeric;
BEGIN
    FOR r IN SELECT n.id, n.product_code, t.expected
               FROM public.nomenclature n JOIN tmp_recalc t ON t.product_code = n.product_code
    LOOP
        v_new := public.fn_recalc_wac_for_product(r.id);
        IF v_new IS NULL THEN RAISE EXCEPTION '524 abort: % recomputed to NULL', r.product_code; END IF;
        IF abs(v_new - r.expected) > 0.01 THEN
            RAISE EXCEPTION '524 abort: % recomputed to % but % was expected', r.product_code, v_new, r.expected;
        END IF;
    END LOOP;
END $$;

-- Closing asserts.
DO $$
DECLARE b record; a record; v_bad int; v_list text;
BEGIN
    SELECT * INTO b FROM tmp_before_money;
    SELECT coalesce(sum(total_price), 0) AS total_price_sum, count(*) AS row_count,
           count(*) FILTER (WHERE voided_at IS NOT NULL) AS voided_count
      INTO a FROM public.purchase_logs;

    IF a.total_price_sum <> b.total_price_sum THEN
        RAISE EXCEPTION '524 abort: money moved, % -> %', b.total_price_sum, a.total_price_sum;
    END IF;
    IF a.row_count <> b.row_count THEN
        RAISE EXCEPTION '524 abort: purchase_logs row count changed, % -> %', b.row_count, a.row_count;
    END IF;
    IF a.voided_count <> b.voided_count + 1 THEN
        RAISE EXCEPTION '524 abort: expected exactly one new void (the sticky note), voided % -> %', b.voided_count, a.voided_count;
    END IF;

    -- No INGREDIENT cost may have moved except the five recomputed on purpose.
    -- PF-/SALE-/MOD- costs DO move (trg_cascade_bom_cost) — that is the point; police RAW- only.
    SELECT count(*), string_agg(product_code, ', ') INTO v_bad, v_list
      FROM (SELECT n.product_code
              FROM public.nomenclature n JOIN tmp_before_cost t ON t.id = n.id
             WHERE (n.cost_per_unit IS DISTINCT FROM t.cost_per_unit OR n.cost_source IS DISTINCT FROM t.cost_source)
               AND n.product_code LIKE 'RAW-%'
               AND n.product_code NOT IN (SELECT product_code FROM tmp_recalc)) s;
    IF v_bad > 0 THEN RAISE EXCEPTION '524 abort: % unintended ingredient cost change(s): %', v_bad, v_list; END IF;

    SELECT count(*), string_agg(n.product_code, ', ') INTO v_bad, v_list
      FROM public.nomenclature n
      JOIN tmp_before_cost t ON t.id = n.id
      JOIN tmp_protected p ON p.product_code = n.product_code
     WHERE n.cost_per_unit IS DISTINCT FROM t.cost_per_unit OR n.cost_source IS DISTINCT FROM t.cost_source;
    IF v_bad > 0 THEN RAISE EXCEPTION '524 abort: protected ingredient(s) moved: %', v_list; END IF;

    -- The five must now agree with their own logs.
    SELECT count(*), string_agg(product_code || '=' || trust_class, ', ') INTO v_bad, v_list
      FROM public.v_cost_trust_nomenclature
     WHERE product_code IN (SELECT product_code FROM tmp_recalc) AND trust_class <> 'verified';
    IF v_bad > 0 THEN RAISE EXCEPTION '524 abort: % of the five did not reach verified: %', v_bad, v_list; END IF;
END $$;

INSERT INTO public.migration_log (filename, applied_by, status, notes)
VALUES ('524_ingredient_cost_reconciliation_pass2.sql', 'claude-opus-session-ce05bc43', 'success',
        'MC e5969ed9. Pass 2 by units sold. Normalised 10 purchase_logs quantities (fenugreek 10 sachets '
     || '= 0.5 kg, turmeric, coriander powder 200 g packs, dried oregano, cherry tomato 2x500 g) read '
     || 'off the receipt photographs incl. the sheets 488 missed (tax_invoice_url); repointed one frozen '
     || 'LIME juice row off lemon juice; voided one sticky-note row. total_price untouched. WAC recomputed '
     || 'for 5 products. Lemon juice 250 (fresh estimate), lime 137 and banana 35 asserted unchanged.')
ON CONFLICT DO NOTHING;

-- INTENTIONAL DROP — TEMP tables created by this migration; nothing persistent is dropped.
DROP TABLE tmp_qty_fix; DROP TABLE tmp_repoint; DROP TABLE tmp_before_money;
DROP TABLE tmp_before_cost; DROP TABLE tmp_recalc; DROP TABLE tmp_protected;
