-- 486 — ingredient cost reconciliation, part 1 (MC cd76dcd7, parent audit MC 00a81c22)
--
-- WHAT THIS IS. 59 canonical ingredients hold a cost that contradicts their own purchase
-- history, and they are why 71 of the 133 live sellable dishes read 'unverified' in
-- v_dish_cost_trust. MC cd76dcd7 takes the 15 with the widest reach. No automated rule can
-- settle them: for some the RECEIPT is the liar (a 5 L tin booked as one unit), for others the
-- STORED cost is. Only the receipt photograph decides, which is why a blanket
-- fn_recalc_wac_for_product run is forbidden — it would overwrite the good side with the bad.
--
-- PATTERNS REUSED (do not invent new ones):
--   * mig 390 / mig 460 section 5 — normalize the QUANTITY to the nomenclature base_unit and
--     leave total_price untouched, so no money moves, and only then recompute WAC.
--   * mig 460 section 6 — repoint a wrong-item row onto the canonical it actually belongs to,
--     never hard-delete.
--
-- CORRECTION TO MIGRATION 460's DRAFT PART B. That draft proposes ONE pack `factor` per
-- product_code. Applying it would corrupt data. purchase_logs mixes two conventions ROW BY ROW:
-- some rows carry a pack count, others are already in the base unit. Chickpeas: rows at
-- price_per_unit 55/59/72 are packs, rows at 118 are already kg. Milk: three rows are cartons,
-- the 451 row is already litres. A per-product factor would halve or fifth the rows that were
-- already right. Every change below is keyed to a single purchase_logs row by id.
--
-- EVIDENCE STANDARD. Each change names the receipt. "image-confirmed" means the line was read
-- off the photograph in Supabase Storage; anything weaker is labelled as such and justified.
-- Receipt OCR cuts Thai names short and has mislabelled products, so the stored notes text is a
-- hint, never evidence — proved again here: purchase_logs says the Alpine chickpea pack is
-- "500g"; the photograph says 600 g.
--
-- THE receipts BUCKET IS PRIVATE. Every expense_ledger.receipt_supplier_url is an
-- /object/public/receipts/... URL and every one of them 404s with NoSuchBucket. The only
-- working reader is the finance MCP download_receipt (service role). Logged to MC separately.
--
-- SCOPE — 5 of the 15 settled, 10 deliberately left alone (see PART B at the foot of the file).
--   s3 olive oil      2 rows normalized   s6 pomegranate molasses  1 row repointed
--   s4 milk           3 rows normalized   s7 lime                  4 rows repointed
--   s5 chia seeds     1 row normalized    s8 ice cubes             1 row repointed
--   s9 recompute WAC for the four touched products that are not cost_source='manual'
--
-- NOT IN SCOPE, deliberately: no total_price changes anywhere (asserted); no global WAC
-- recompute; no cost_source flips (none of the five needs one — see PART B note 4); the 346
-- RAW-AUTO stubs and the unmatched_items queue; the 28 resale dishes; the OpEx supplier
-- backfill. Nothing is deleted.

BEGIN;

-- ──────────────────────────────────────────────────────────────────────────
-- 1. Pre-flight — every row this migration touches must exist and still look
--    the way it looked when the receipt was read. Abort rather than guess.
-- ──────────────────────────────────────────────────────────────────────────
CREATE TEMP TABLE tmp_qty_fix (
    pl_id       uuid PRIMARY KEY,
    old_qty     numeric NOT NULL,
    new_qty     numeric NOT NULL,
    total_price numeric NOT NULL,
    evidence    text    NOT NULL
) ON COMMIT DROP;

INSERT INTO tmp_qty_fix VALUES
-- s3 RAW-OLIVE-OIL (L) — 36 live dishes. The RECEIPT was the liar: both tins are 5 L, booked
-- as one unit, which made the log read 2,400.50/L against a stored 440.00.
 ('2be563e0-6f5c-4505-a7cc-960b9a904cab', 1, 5,    2200,
  'image-confirmed: GO Wholesale (Central Food) PK1IF26020007408, 23-02-2026, line 14 '
  '"olive oil Evolugio 5 LITRES", 1 Piece @ 2,200.00 -> 440.00/L'),
 ('f55aef96-fa9c-46fe-be43-e48c97f70033', 1, 5,    2601,
  'image-confirmed: Makro branch 00174 receipt ...66151258947, 09-05-2026, line '
  '"Chabroso pure olive oil 5 L", 1 bottle @ 2,601.00 -> 520.20/L'),

-- s4 RAW-MILK-COW (L) — 22 live dishes. Three cartons booked as one unit each; the fourth row
-- was already in litres and is deliberately NOT touched. That the normalized log (44.96) lands
-- within 0.13% of the stored 45.0192 is itself the proof the factor is right.
 ('e3f22554-c919-41a4-bd5d-adbb554562c8', 1, 5,    225.5,
  'image-confirmed: Makro branch 00063 receipt 062501118002, 27-02-2026, line '
  '"8850329150113 Meiji plain fresh milk 5 LITRES", 1 carton @ 225.50'),
 ('3fe0e211-7e9b-4aed-81e8-a59229defd31', 1, 5,    225.5,
  'same article and same 225.50 pack price as the two image-confirmed Meiji 5 L lines '
  '(27-02 and 24-06 chits); line text reads "Meiji Fresh Milk Unsweetened 5 Liter"'),
 ('3b3b289a-32e9-470e-87d1-60b27a903e81', 1, 5,    222,
  'line text "Magnolia Fresh Pasteurized Milk 5 Liters"; 5 L is also the pack size in the '
  'nomenclature name ("MAGNOLIA Pasturized Milk 5 l"). Not image-confirmed — the 24-03 chit '
  'was not read. Normalized with the other three because a partial fix would leave the WAC '
  'further from the truth than leaving all four alone'),

-- s5 RAW-CHIA-SEEDS (kg) — 6 live dishes. Single row, a 450 g pack booked as 1 kg. The stored
-- 788.8889 IS 355/0.45 to four decimals, so the hand-set cost was already read off this very
-- line; only the log quantity was wrong. Recomputing therefore reproduces the stored cost.
 ('a4f9d533-fd3a-430c-bbe1-3590b7eb66e9', 1, 0.45, 355,
  'arithmetic identity: stored 788.8889 = 355 / 0.45 exactly; pack size 450 g appears in both '
  'the line text and the nomenclature name "BABOO Chia Seeds 450 g". Receipt '
  'inbox/1776061764963_1_4i2fk6.jpg, 08-04-2026 — not image-confirmed, Storage was down');

CREATE TEMP TABLE tmp_repoint (
    pl_id        uuid PRIMARY KEY,
    from_code    text NOT NULL,
    to_code      text NOT NULL,
    old_qty      numeric NOT NULL,
    new_qty      numeric NOT NULL,
    evidence     text NOT NULL
) ON COMMIT DROP;

INSERT INTO tmp_repoint VALUES
-- s8 RAW-ICE_CUBES (kg) — 23 live dishes. Its ONE purchase row is not ice. The receipt carries
-- a single line and that line is potato. This is the whole of ice's "purchase history": the
-- 49.00/kg the trust view holds against the stored 16.67 is a potato price.
 ('dda83a0b-6621-46e4-95ee-7f72ccd9f6e6', 'RAW-ICE_CUBES', 'RAW-POTATO', 5, 5,
  'image-confirmed: Makro branch 00063 receipt 06209124476, 02-05-2026 — the only line on the '
  'chit is article 28006169 "potato pack 1 kg", 5 @ 49.00 = 245.00, which is the whole 245.00 '
  'total. Article 28006169 reads potato again on the 24-06-2026 Makro chit. Quantity '
  'unchanged: 5 one-kilogram packs is already 5 kg in RAW-POTATO base_unit'),

-- s6 RAW-POMEGRANATE_MOLASSES (kg) — 9 live dishes. Its one row is BLACKSTRAP molasses, a
-- different product. The giveaway: RAW-MOLASSES_BLACKSTRAP's hand-set 775.00 is exactly
-- 279/0.36, i.e. it was priced off this very line. RAW-POMEGRANATE_MOLASSES's stored 775.00 is
-- a straight copy of that figure with no evidence of its own.
 ('d73ad13d-d0b1-4a07-ab29-c9ee6c6baefc', 'RAW-POMEGRANATE_MOLASSES', 'RAW-MOLASSES_BLACKSTRAP',
  3, 1.08,
  'line text "Organic Unsulfured Black Strap Molasses, Size 360 Grams", 3 @ 279.00 = 837.00; '
  'arithmetic identity: the target manual cost 775.00 = 279 / 0.36 exactly. Quantity '
  'normalized 3 packs -> 1.08 kg (3 x 360 g). Receipt inbox/1777380069473_0_q75xey.webp, '
  '14-04-2026 — not image-confirmed, Storage was down'),

-- s7 RAW-LIME (kg, "ARO Frozen Tahiti Lime Juice 1 kg") — 11 live dishes. Four of its six rows
-- are FRESH seedless limes sold by the 25- or 50-fruit pack, a different product with its own
-- canonical. The stored 99.00 is simply the 20-09 fresh-lime pack price, which the AFTER INSERT
-- trigger copied onto the frozen-juice canonical. Left behind are the two rows that genuinely
-- name the product in the canonical's own name, at 135 and 139 per kilogram.
-- Destination base_unit is 'pcs' meaning one 25-fruit pack, so the 50-fruit pack counts as 2.
 ('7b8e7d62-609f-4420-801f-65962c630b3d', 'RAW-LIME', 'RAW-LIME-FRESH', 1, 2,
  'image-confirmed: GO Wholesale PK1IF26020007408, 23-02-2026, line 9 "seedless lime, per '
  'pack (50 fruits)" 259.00 — a 50-fruit pack, i.e. 2 x the 25-fruit base unit'),
 ('e47b75b0-a1f8-47de-bf6d-fb7e2e92cc22', 'RAW-LIME', 'RAW-LIME-FRESH', 1, 1,
  'line text "Seedless Limes for Juice (25 pcs/pack)" @ 229.00 — the destination canonical is '
  'named "Seedless lime, 25 fruits for juice, per pack" and hand-set at exactly 229.00'),
 ('23163ed0-793a-4a53-996b-ea50073d25eb', 'RAW-LIME', 'RAW-LIME-FRESH', 1, 1,
  'line text "Seedless lime, 25 fruits for juice, per pack" @ 229.00 — verbatim the '
  'destination canonical name'),
 ('9f2534be-2580-4bd2-9a23-ce88ac9caa3e', 'RAW-LIME', 'RAW-LIME-FRESH', 1, 1,
  'line text "Seedless Limes for Juicing, Pack of 25 pcs" @ 99.00 — and this 99.00 is the '
  'value sitting in RAW-LIME.cost_per_unit, which is how the mis-mapping announces itself');

DO $$
DECLARE
    v_missing int;
    v_drifted int;
BEGIN
    SELECT count(*) INTO v_missing
    FROM tmp_qty_fix f LEFT JOIN public.purchase_logs pl ON pl.id = f.pl_id
    WHERE pl.id IS NULL;
    IF v_missing > 0 THEN
        RAISE EXCEPTION '486 abort: % quantity-fix rows no longer exist', v_missing;
    END IF;

    SELECT count(*) INTO v_missing
    FROM tmp_repoint r LEFT JOIN public.purchase_logs pl ON pl.id = r.pl_id
    WHERE pl.id IS NULL;
    IF v_missing > 0 THEN
        RAISE EXCEPTION '486 abort: % repoint rows no longer exist', v_missing;
    END IF;

    -- The receipts were read against these exact quantities and totals. If another session has
    -- moved them since, the evidence no longer describes the row.
    SELECT count(*) INTO v_drifted
    FROM tmp_qty_fix f JOIN public.purchase_logs pl ON pl.id = f.pl_id
    WHERE pl.quantity <> f.old_qty OR pl.total_price <> f.total_price OR pl.voided_at IS NOT NULL;
    IF v_drifted > 0 THEN
        RAISE EXCEPTION '486 abort: % quantity-fix rows drifted since the receipt was read', v_drifted;
    END IF;

    SELECT count(*) INTO v_drifted
    FROM tmp_repoint r
    JOIN public.purchase_logs pl ON pl.id = r.pl_id
    JOIN public.nomenclature n ON n.id = pl.nomenclature_id
    WHERE n.product_code <> r.from_code OR pl.quantity <> r.old_qty OR pl.voided_at IS NOT NULL;
    IF v_drifted > 0 THEN
        RAISE EXCEPTION '486 abort: % repoint rows drifted since the receipt was read', v_drifted;
    END IF;

    -- Every repoint destination must already exist. This migration creates no nomenclature.
    SELECT count(*) INTO v_missing
    FROM (SELECT DISTINCT to_code FROM tmp_repoint) t
    LEFT JOIN public.nomenclature n ON n.product_code = t.to_code
    WHERE n.id IS NULL;
    IF v_missing > 0 THEN
        RAISE EXCEPTION '486 abort: % repoint destinations do not exist', v_missing;
    END IF;
END $$;

-- Snapshot for the closing asserts: no money may move, and no cost may change except the four
-- products s9 recomputes on purpose.
CREATE TEMP TABLE tmp_before_money AS
    SELECT coalesce(sum(total_price), 0) AS total_price_sum,
           count(*) AS row_count,
           count(*) FILTER (WHERE voided_at IS NOT NULL) AS voided_count
    FROM public.purchase_logs;

CREATE TEMP TABLE tmp_before_cost AS
    SELECT id, product_code, cost_per_unit, cost_source FROM public.nomenclature;

-- ──────────────────────────────────────────────────────────────────────────
-- 2. Normalize quantities (s3 s4 s5). total_price is NOT in the SET list.
-- ──────────────────────────────────────────────────────────────────────────
UPDATE public.purchase_logs pl
   SET quantity        = f.new_qty,
       price_per_unit  = round(pl.total_price / f.new_qty, 4),
       notes           = coalesce(pl.notes, '') || ' [mig486: qty ' || f.old_qty || ' -> '
                         || f.new_qty || ' ' || (SELECT base_unit FROM public.nomenclature n
                                                  WHERE n.id = pl.nomenclature_id)
                         || '; ' || f.evidence || ']'
  FROM tmp_qty_fix f
 WHERE pl.id = f.pl_id;

-- ──────────────────────────────────────────────────────────────────────────
-- 3. Repoint wrong-item rows (s6 s7 s8). total_price is NOT in the SET list.
-- ──────────────────────────────────────────────────────────────────────────
UPDATE public.purchase_logs pl
   SET nomenclature_id = dest.id,
       quantity        = r.new_qty,
       price_per_unit  = round(pl.total_price / r.new_qty, 4),
       notes           = coalesce(pl.notes, '') || ' [mig486: repointed ' || r.from_code
                         || ' -> ' || r.to_code || ', qty ' || r.old_qty || ' -> ' || r.new_qty
                         || '; ' || r.evidence || ']'
  FROM tmp_repoint r
  JOIN public.nomenclature dest ON dest.product_code = r.to_code
 WHERE pl.id = r.pl_id;

-- ──────────────────────────────────────────────────────────────────────────
-- 4. s9 Recompute WAC — ONLY for products this migration touched, and only those
--    whose log actually changed and that are not cost_source='manual'.
--
--    Deliberately NOT recomputed:
--      * RAW-LIME-FRESH, RAW-MOLASSES_BLACKSTRAP — cost_source='manual'. The live
--        fn_recalc_wac_for_product early-returns on 'manual' anyway; not calling it keeps that
--        explicit rather than incidental.
--      * RAW-POTATO — it gained one row and its log still agrees with its stored cost
--        (42.86 -> 43.51 against a stored 42.00, inside the 20% tolerance). Potato is not one
--        of the 15; moving its cost would be a side effect nobody asked for.
--        RULE-MINIMAL-CORRECT-CHANGE.
--      * RAW-ICE_CUBES, RAW-POMEGRANATE_MOLASSES — they now have NO purchase history at all.
--        fn_recalc_wac_for_product would write cost_per_unit = NULL and cost_source = 'none',
--        destroying the only figures anyone has. Their stored costs stand, unproven and flagged.
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
    r record;
    v_new numeric;
BEGIN
    FOR r IN
        SELECT n.id, n.product_code, n.cost_per_unit AS old_cost
          FROM public.nomenclature n
         WHERE n.product_code IN ('RAW-OLIVE-OIL', 'RAW-MILK-COW', 'RAW-CHIA-SEEDS', 'RAW-LIME')
    LOOP
        v_new := public.fn_recalc_wac_for_product(r.id);
        RAISE NOTICE '486: % cost % -> %', r.product_code, r.old_cost, v_new;
        IF v_new IS NULL THEN
            RAISE EXCEPTION '486 abort: % recomputed to NULL', r.product_code;
        END IF;
    END LOOP;
END $$;

-- ──────────────────────────────────────────────────────────────────────────
-- 5. Closing asserts.
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
    b record;
    a record;
    v_unexpected int;
    v_bad text;
BEGIN
    SELECT * INTO b FROM tmp_before_money;
    SELECT coalesce(sum(total_price), 0) AS total_price_sum,
           count(*) AS row_count,
           count(*) FILTER (WHERE voided_at IS NOT NULL) AS voided_count
      INTO a FROM public.purchase_logs;

    IF a.total_price_sum <> b.total_price_sum THEN
        RAISE EXCEPTION '486 abort: total_price moved, % -> %', b.total_price_sum, a.total_price_sum;
    END IF;
    IF a.row_count <> b.row_count OR a.voided_count <> b.voided_count THEN
        RAISE EXCEPTION '486 abort: purchase_logs row count changed, % -> % (voided % -> %)',
            b.row_count, a.row_count, b.voided_count, a.voided_count;
    END IF;

    -- No cost may have changed outside the four products s9 recomputes on purpose.
    SELECT count(*), string_agg(product_code, ', ') INTO v_unexpected, v_bad
      FROM (
        SELECT n.product_code
          FROM public.nomenclature n JOIN tmp_before_cost t ON t.id = n.id
         WHERE (n.cost_per_unit IS DISTINCT FROM t.cost_per_unit
                OR n.cost_source IS DISTINCT FROM t.cost_source)
           AND n.product_code NOT IN ('RAW-OLIVE-OIL', 'RAW-MILK-COW', 'RAW-CHIA-SEEDS', 'RAW-LIME')
      ) s;
    IF v_unexpected > 0 THEN
        RAISE EXCEPTION '486 abort: % unintended cost change(s): %', v_unexpected, v_bad;
    END IF;

    -- The four intended ones must now AGREE with their own logs — that is the point.
    SELECT count(*), string_agg(product_code, ', ') INTO v_unexpected, v_bad
      FROM public.v_cost_trust_nomenclature
     WHERE product_code IN ('RAW-OLIVE-OIL', 'RAW-MILK-COW', 'RAW-CHIA-SEEDS', 'RAW-LIME')
       AND trust_class <> 'verified';
    IF v_unexpected > 0 THEN
        RAISE EXCEPTION '486 abort: % of the four did not reach verified: %', v_unexpected, v_bad;
    END IF;

    -- Ice and pomegranate molasses must keep their stored cost untouched.
    IF EXISTS (
        SELECT 1 FROM public.nomenclature n JOIN tmp_before_cost t ON t.id = n.id
         WHERE n.product_code IN ('RAW-ICE_CUBES', 'RAW-POMEGRANATE_MOLASSES')
           AND (n.cost_per_unit IS DISTINCT FROM t.cost_per_unit
                OR n.cost_source IS DISTINCT FROM t.cost_source)
    ) THEN
        RAISE EXCEPTION '486 abort: an unsettled ingredient had its cost touched';
    END IF;
END $$;

-- ──────────────────────────────────────────────────────────────────────────
-- 6. Self-register (RULE-MIGRATION-TRACKING)
-- ──────────────────────────────────────────────────────────────────────────
INSERT INTO public.migration_log (filename, applied_by, status, notes)
VALUES ('486_ingredient_cost_reconciliation_part1.sql', 'claude-opus-session-58399a46', 'success',
        'MC cd76dcd7 part 1. Settled 5 of the 15 widest-reach ingredients against the receipt '
     || 'images: normalized 6 purchase_logs quantities (olive oil 2, milk 3, chia 1) and '
     || 'repointed 6 wrong-item rows (ice->potato 1, pomegranate->blackstrap molasses 1, '
     || 'lime->lime-fresh 4). Quantity only, total_price untouched per mig 390 / mig 460 s5; '
     || 'in-transaction asserts prove no money moved and no unintended cost changed. WAC '
     || 'recomputed for the 4 touched non-manual products only, never globally. Ice cubes and '
     || 'pomegranate molasses now have NO purchase history and their stored costs stand '
     || 'unproven — flagged to the CEO, not guessed. The other 10 of the 15 were left alone '
     || 'because Supabase Storage went down mid-task and their receipts could not be read.')
ON CONFLICT DO NOTHING;

COMMIT;

-- ══════════════════════════════════════════════════════════════════════════
-- PART B — THE TEN LEFT ALONE, AND WHY. A documented unknown beats a confident guess.
-- ══════════════════════════════════════════════════════════════════════════
--
-- 1. BLOCKED ON EVIDENCE. Supabase Storage began returning "The connection to the database
--    timed out" partway through this task, after five receipts had been read. These eight are
--    all-or-nothing per product — their logs mix pack rows with already-correct base-unit rows,
--    so fixing only the subset whose receipts were read would leave the WAC FURTHER from the
--    truth than leaving the product alone. They were therefore left alone:
--
--      RAW-CUCUMBER   (16 dishes)  1 of 4 pack rows image-confirmed (500 g, 24-06 chit)
--      RAW-TOMATO     (13)         the 2 rows read need NO change; the 2 that do are unread
--      RAW-CHICKPEAS  (12)         biggest row image-confirmed at 600 g — NOT the 500 g the
--                                  stored text claims. The 500 g rows are unread, and after
--                                  this they cannot be assumed
--      RAW-SESAME-SEEDS-BLACK (12) its line is on page 2 of a 2-sheet GO chit; only page 1 is
--                                  stored (the known Makro multi-sheet trap)
--      RAW-MINT       (11)         2 rows image-confirmed, 7 unread
--      RAW-PARSLEY    (11)         100 g packs give ~350/kg against a stored 321.87, which fits
--                                  — but two rows are Hand Brand DRIED parsley at 69, a
--                                  different product that probably wants its own canonical
--      RAW-TURMERIC   (7)          200/250 g packs give 302.86 against a stored 308.00, which
--                                  fits, but no receipt was read
--      RAW-BOX_BIO_600 (7)         105.00 / 2.38 = 44.1 boxes, which is not a round pack size.
--                                  Neither side is obviously right; needs the photograph
--
-- 2. NOT SETTLEABLE FROM A RECEIPT AT ALL.
--      RAW-HONEY (14) — the bottles are 760 ml and the base_unit is kg, so the conversion
--      needs a density assumption (honey ~1.4 kg/L), not a receipt reading. Worse, the 12-04
--      row already carries 1.54 (the Doi Kham 770 g x 2 weight) applied to a 760 ml Wetchapong
--      bottle, which is wrong under any density. This wants a CEO decision on the canonical:
--      either re-base RAW-HONEY on litres, or fix a density and record it.
--
-- 3. SETTLED ONLY HALFWAY, AND HONESTLY SO.
--      RAW-ICE_CUBES (23 dishes) — the mis-mapping is settled; the cost is not. Ice now has no
--      purchase history whatsoever, so 16.67/kg rests on nothing. It stays 'unverified' and its
--      23 dishes stay blocked. This is the single largest remaining item on the list and it
--      needs one number from the CEO: what does a kilogram of ice cost delivered?
--      RAW-POMEGRANATE_MOLASSES (9) — same shape. Its 775.00 was only ever a copy of the
--      blackstrap figure; it now has no history and no evidence.
--
-- 4. ON cost_source='manual'. The task suggests flipping hand-set truths to 'manual' so the
--    AFTER INSERT trigger stops dragging them back. None of the five settled here wants it:
--    all four recomputed products now AGREE with their own logs, so the trigger has nothing to
--    drag. Flipping them to 'manual' would freeze them against genuine future price moves and
--    downgrade them from trust_rank 0 ('verified') to 10 ('manual') — worse, not better.
--    Ice and pomegranate molasses are the two that would benefit, and they are exactly the two
--    whose numbers nobody can vouch for. Setting 'manual' there would dress a guess as a
--    decision. Left on 'none'/'wac' with the contradiction visible.
