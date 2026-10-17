-- 488 — ingredient cost reconciliation (MC cd76dcd7, parent audit MC 00a81c22)
--
-- WHAT THIS IS. 59 canonical ingredients hold a cost that contradicts their own purchase
-- history, and they are why 71 of the 133 live sellable dishes read 'unverified' in
-- v_dish_cost_trust. MC cd76dcd7 takes the 15 with the widest reach. No automated rule can
-- settle them: for some the RECEIPT is the liar (a 5 L tin booked as one unit), for others the
-- STORED cost is. Only the receipt photograph decides, which is why a blanket
-- fn_recalc_wac_for_product run is forbidden — it would overwrite the good side with the bad.
--
-- APPLIED 2026-10-17 as 488 (486 was taken by a concurrent session between drafting and
-- applying; number claimed with fn_claim_migration_number, never guessed).
--
-- RESULT. 11 of the 15 settled, 4 left alone with the reason recorded (PART B at the foot).
-- Live sellable dishes (SALE-%, not deleted, pos_status='synced' — 133 of them), MEASURED
-- before and after, not estimated:
--   unverified 71 -> 54    no_cost 27 -> 27    no_bom 26 -> 26
--   verified    4 ->  8    estimated 4 -> 13   manual 0 -> 4    deleted 1 -> 1
-- 17 dishes move out of 'unverified'. The ceiling for this top-15 set was 30, so say plainly:
-- the other 13 stay blocked by ice cubes, honey, parsley and turmeric, which this migration
-- could not settle. 41 of the original 71 were never in reach of this task at all — they are
-- blocked by ingredients outside the top 15.
--
-- PATTERNS REUSED (do not invent new ones):
--   * mig 390 / mig 460 section 5 — normalize the QUANTITY to the nomenclature base_unit and
--     leave total_price untouched, so no money moves, and only then recompute WAC.
--   * mig 460 section 6 — repoint a wrong-item row onto the canonical it actually belongs to,
--     never hard-delete.
--
-- CORRECTION TO MIGRATION 460's DRAFT PART B. That draft proposes ONE pack `factor` per
-- product_code. Applying it would corrupt data, and this migration deliberately does not.
-- purchase_logs mixes two conventions ROW BY ROW: some rows carry a pack count, others are
-- already in the base unit. Chickpeas: rows at price_per_unit 55/59/72 are packs, rows at 118
-- are already kg. Milk: three rows are cartons, the 451 row is already litres. Parsley: the
-- `3 @35` rows are packs, the `0.6 @350` rows are already kg. A per-product factor would halve
-- or tenth the rows that were already right. Every change below is keyed to one row by id.
--
-- Two further things the draft could not have known, both found by opening the photographs:
--   * its proposed chickpea pack size would have been wrong. purchase_logs says "Alpine
--     Chickpeas 500g"; the receipt says 600 g. The stored line text is a hint, never evidence.
--   * RAW-MILK-COW is listed in the draft at factor 5.00, which is right for three rows and
--     wrong for the fourth — that row was already booked as 10 litres.
--
-- EVIDENCE STANDARD. Each change names the receipt. "image" means the line was read off the
-- photograph in Supabase Storage. "pattern" means the row was not read directly but carries
-- the same Makro article number and the same unit price as a line that was, on another chit —
-- stated honestly rather than dressed up as a reading.
--
-- THE receipts BUCKET IS PRIVATE. Every expense_ledger.receipt_supplier_url is an
-- /object/public/receipts/... URL and every one of them 404s with NoSuchBucket. The only
-- working reader is the finance MCP download_receipt (service role). Logged to MC separately.
--
-- NOT IN SCOPE, deliberately: no total_price changes anywhere (asserted in-transaction); no
-- global WAC recompute; the 346 RAW-AUTO stubs and the unmatched_items queue; the 28 resale
-- dishes; the OpEx supplier backfill. Nothing is deleted and no nomenclature is created.

-- Applied through the Supabase connector, which wraps the whole file in one transaction.

CREATE TEMP TABLE tmp_qty_fix (
    pl_id       uuid PRIMARY KEY,
    old_qty     numeric NOT NULL,
    new_qty     numeric NOT NULL,
    evidence    text    NOT NULL
);

-- ══════════════════════════════════════════════════════════════════════════
-- QUANTITY NORMALIZATIONS — pack count -> nomenclature base_unit.
-- total_price is never in any SET list below.
-- ══════════════════════════════════════════════════════════════════════════
INSERT INTO tmp_qty_fix VALUES
-- ── RAW-OLIVE-OIL (L), 36 live dishes. The RECEIPT was the liar: both tins are 5 L booked as
--    one unit, which is why the log read 2,400.50/L against a stored 440.00. WAC -> 480.10.
 ('2be563e0-6f5c-4505-a7cc-960b9a904cab', 1, 5,
  'image: GO Wholesale PK1IF26020007408 23-02-2026 line 14 "olive oil Evolugio 5 LITRES" 1 Piece @2200'),
 ('f55aef96-fa9c-46fe-be43-e48c97f70033', 1, 5,
  'image: Makro 00174 rcpt ...66151258947 09-05-2026 "Chabroso pure olive oil 5 L" 1 @2601'),

-- ── RAW-MILK-COW (L), 22 live dishes. Three cartons booked as one unit each. The fourth row
--    (10 L @451) was already correct and is deliberately absent from this list. That the
--    normalized log lands at 44.96 against a stored 45.0192 — 0.13% apart — is itself the
--    proof the factor is right.
 ('e3f22554-c919-41a4-bd5d-adbb554562c8', 1, 5,
  'image: Makro 00063 rcpt 062501118002 27-02-2026 "8850329150113 Meiji plain milk 5 LITRES" 1 @225.50'),
 ('3b3b289a-32e9-470e-87d1-60b27a903e81', 1, 5,
  'image: Makro 00174 rcpt 166501168001 24-03-2026 "8858705600924 Magnolia pasteurised milk 5 LITRES" 1 @222'),
 ('3fe0e211-7e9b-4aed-81e8-a59229defd31', 1, 5,
  'pattern: same Meiji 5 L article at the same 225.50 pack price as the 27-02 and 24-06 lines read as images'),

-- ── RAW-CHIA-SEEDS (kg), 6 live dishes. One row, a 450 g pack booked as 1 kg. The stored
--    788.8889 is 355/0.45 exactly, so the cost was always right and only the quantity was wrong.
 ('a4f9d533-fd3a-430c-bbe1-3590b7eb66e9', 1, 0.45,
  'image: Makro 00174 rcpt 166501198003 08-04-2026 "8858915001450 chia seeds 450 gram" 1 @355'),

-- ── RAW-CUCUMBER (kg), 16 live dishes. Makro article 830433 is a 500 g pack. Three of the four
--    pack rows were read; the weighed rows (2.05 kg @39) and the two 0.5 kg rows were already
--    correct and are not touched. Note the 20-09 row: the receipt shows TWO packs @22, which the
--    importer collapsed into quantity 1 — so that row goes to 1.0 kg, not 0.5.
 ('818617c8-3e8f-42c1-b451-b3606eeadac6', 9, 4.5,
  'image: Makro rcpt 166501168001 24-03-2026 "830433 cucumber pack 500 gram" qty 9 @23'),
 ('28feee5c-5759-4461-871f-8611704a4075', 2, 1.0,
  'image: Makro rcpt 66071351878 24-06-2026 "830433 cucumber pack 500 gram" qty 2 @29'),
 ('2c90a908-e138-4ef4-93df-348559ecc580', 2, 1.0,
  'pattern: same article 830433 500 g pack, qty 2 @32, 15-07-2026'),
 ('e0141be5-3b70-46df-82cf-408f195e33aa', 1, 1.0,
  'image: Makro tax invoice 166901037788 20-09-2026 item 10 "830433 cucumber 500 g" QUANTITY 2 @22 = 44 — two packs booked as one'),

-- ── RAW-TOMATO (kg), 13 live dishes. Most rows were ALREADY right: the weighed "large bag per
--    kilogram" lines and the 1000 g packs. Only the two 500 g pack rows are wrong. WAC falls
--    45.68 -> 37.29, i.e. tomato was being costed 22% too high on 13 dishes.
 ('23746ecf-83fc-4e5a-b75f-b12be4c73a8c', 1, 0.5,
  'pattern: same article 857883 "tomato 500 g per pack" @29 as the 12-06 line read as an image'),
 ('ec3249a3-7360-449e-a412-911c2e832334', 1, 0.5,
  'image: Makro rcpt 66061327022 12-06-2026 "857883 tomato 500 g per pack" 1 @29'),

-- ── RAW-CHICKPEAS (kg), 12 live dishes. THE PACK SIZE IS NOT UNIFORM. The 27-02 Alpine bag is
--    600 g — the stored line text calling it "500g" is wrong — while the 55/59 rows are 500 g.
--    The four rows priced at 118 are already per-kilogram and are not touched.
 ('e286f410-e3c6-4c11-a9f2-763428c26eac', 10, 6.0,
  'image: Makro rcpt 062501118002 27-02-2026 "8906011155789 Alpine chickpeas 600 GRAM" qty 10 @72'),
 ('19c79988-807e-449a-834d-f171f5bf79c7', 3, 1.5,
  'image: Makro rcpt 166501134002 07-03-2026 "8851583014869 chickpeas 500 gram" qty 3 @59'),
 ('dc65075a-2a61-4eb9-8fa1-97f89f3701ab', 3, 1.5,
  'image: Makro rcpt 166501134002 07-03-2026 "8906033355426 brown chickpeas 500 g x1" qty 3 @55'),
 ('fd448a8b-0cab-44a8-aa79-c14a2af5fb2f', 2, 1.0,
  'image: Makro rcpt 166501198003 08-04-2026 "8851583014869 chickpeas 500 gram" qty 2 @59'),
 ('948fefc9-08f9-4fda-bed9-608c5a655835', 1, 0.5, 'pattern: 500 g pack @59, 30-03-2026'),
 ('357aed73-bdf5-4aee-a8fb-699efe1d5def', 1, 0.5, 'pattern: 500 g pack @59, 16-05-2026'),
 ('0c49c0e5-d804-419b-ab9e-eaf14b33b1c4', 2, 1.0, 'pattern: 500 g pack @55, 30-05-2026'),
 ('348d6100-d123-425b-81e8-c72d23c22585', 4, 2.0, 'pattern: 500 g pack @59, 03-07-2026'),

-- ── RAW-SESAME-SEEDS-BLACK (kg), 12 live dishes. 500 g packs. The 1.0 kg @140 row was already
--    correct. The 23-02 row sits on page 2 of a two-sheet GO chit that was never stored, so it
--    rides on the article/price pattern.
 ('671ecff1-b06b-4b20-ae7c-72c4b3f1d32d', 3, 1.5,
  'image: Makro rcpt 166501134002 07-03-2026 "8851583013138 black sesame 500 gram" qty 3 @70'),
 ('657e6388-413e-468d-bd5f-b93aab066866', 3, 1.5,
  'pattern: "A-Joyz black sesame 500g x1" @75, 23-02-2026 — page 2 of the GO chit was never stored'),
 ('3cb0a3af-6485-4925-9923-0753ad046aeb', 1, 0.5, 'pattern: 500 g pack @70, 22-06-2026'),

-- ── RAW-MINT (kg), 11 live dishes. Makro article 826827 is a 300 g pack. Four rows were
--    already converted (0.3) and the 23-02 row was weighed in kilograms; none are touched.
 ('9de4bfb3-5783-41ba-b24f-715683c3ee18', 1, 0.3,
  'image: Makro rcpt 062501118002 27-02-2026 "826827 mint leaf 300 gram per pack" 1 @49'),
 ('9c8191c7-3789-4bb2-9477-13446e9dd153', 1, 0.3,
  'image: Makro rcpt 166501134002 07-03-2026 "826827 mint leaf 300 gram per pack" 1 @49'),
 ('f68a26d4-581f-4071-a174-26cfbe6ce11b', 1, 0.3,
  'image: Makro rcpt 66061327022 12-06-2026 "826827 mint leaf 300 gram per pack" 1 @59'),
 ('21070420-536c-4f24-b849-d967e39dc41f', 1, 0.3, 'pattern: article 826827 300 g pack @49, 30-03-2026'),
 ('a26451d0-b410-4dac-9d73-70797edbfea8', 1, 0.3, 'pattern: article 826827 300 g pack @59, 07-06-2026'),

-- ── RAW-PARSLEY (kg), 11 live dishes. Makro article 917475 is a 100 g pack, confirmed on four
--    separate chits. Eight rows were already in kilograms and are not touched.
--    ⚠ Parsley is NOT recomputed — see PART B note 3. Its log also carries dried herb.
 ('3ae04361-03ef-4957-b1b7-fce1a7ad373a', 1, 0.1,
  'image: Makro rcpt 062501126001 03-03-2026 "917475 parsley 100 gram per pack" 1 @35'),
 ('70ad0b31-6c60-4bca-a66b-fc02eed78e9a', 3, 0.3,
  'image: Makro rcpt 166501134002 07-03-2026 "917475 parsley 100 gram per pack" qty 3 @35'),
 ('5d4c6314-cc29-45d9-996d-993e3cfe0fe5', 1, 0.1,
  'image: Makro rcpt 062501196002 07-04-2026 "917475 parsley 100 gram per pack" 1 @35'),
 ('4cb4a8a8-dbb4-414c-8649-acbc3399904a', 2, 0.2,
  'image: Makro rcpt 166501198003 08-04-2026 "917475 parsley 100 gram per pack" qty 2 @35'),
 ('47f279f3-9207-430a-ae04-db6fbf276ed2', 5, 0.5,
  'image: Makro rcpt 66061327022 12-06-2026 "917475 parsley 100 gram per pack" qty 5 @35'),
 ('0428f318-8d87-4a84-b113-9d89d1d29df9', 3, 0.3, 'pattern: article 917475 100 g pack @35, 25-02-2026'),
 ('1abf4bcb-d400-4f23-8610-1bcc794d80a5', 4, 0.4, 'pattern: article 917475 100 g pack @35, 27-02-2026'),
 ('a7d56ce9-0da0-411d-aaf1-82b04c153d6c', 3, 0.3, 'pattern: article 917475 100 g pack @35, 30-03-2026'),
 ('04a1035a-f96f-4ced-821b-8594d213f1a0', 3, 0.3, 'pattern: article 917475 100 g pack @35, 08-04-2026'),
 ('5b19b053-274d-40c8-aea3-ef3313ce9bcd', 6, 0.6, 'pattern: article 917475 100 g pack @35, 30-06-2026'),

-- ── RAW-BOX_BIO_600 (pcs), 7 live dishes. One pack is 50 boxes, not one box. 105/2.38 = 44.1
--    boxes, which is no pack size at all — that was the clue the stored 2.38 came from nowhere.
 ('2327d69f-0d60-415c-ad24-e7a35f335d30', 1, 50,
  'image: Makro rcpt 166501134001 07-03-2026 "8859823400175 ARO bio food box 600ml" UNIT PACKS 50, 1 pack @105 -> 2.10/pc');

CREATE TEMP TABLE tmp_repoint (
    pl_id     uuid PRIMARY KEY,
    from_code text NOT NULL,
    to_code   text NOT NULL,
    old_qty   numeric NOT NULL,
    new_qty   numeric NOT NULL,
    evidence  text NOT NULL
);

-- ══════════════════════════════════════════════════════════════════════════
-- WRONG-ITEM REPOINTS. Every destination already exists; none is created here.
-- ══════════════════════════════════════════════════════════════════════════
INSERT INTO tmp_repoint VALUES
-- ── RAW-ICE_CUBES (23 live dishes). Its ONE purchase row is not ice. The 02-05 chit carries a
--    single line and that line is potato, for the whole 245.00. So the "49.00/kg purchase
--    history" the trust view held against ice's stored 16.67 was a potato price all along.
 ('dda83a0b-6621-46e4-95ee-7f72ccd9f6e6', 'RAW-ICE_CUBES', 'RAW-POTATO', 5, 5,
  'image: Makro 00063 rcpt 06209124476 02-05-2026 — the only line on the chit is "28006169 potato pack 1 kg" 5 @49 = 245.00, the entire total. Article 28006169 reads potato again on the 24-06 and 12-06 chits. Quantity unchanged: five 1 kg packs is already 5 kg'),

-- ── RAW-POMEGRANATE_MOLASSES (9 live dishes). Its one row is BLACKSTRAP molasses. The giveaway
--    is arithmetic: RAW-MOLASSES_BLACKSTRAP's hand-set 775.00 is 279/0.36 exactly, so it was
--    priced off this very line. Pomegranate molasses' identical 775.00 is a copy with no
--    evidence of its own.
 ('d73ad13d-d0b1-4a07-ab29-c9ee6c6baefc', 'RAW-POMEGRANATE_MOLASSES', 'RAW-MOLASSES_BLACKSTRAP', 3, 1.08,
  'line reads "Organic Unsulfured Black Strap Molasses, Size 360 Grams" 3 @279 = 837; destination manual cost 775.00 = 279/0.36 exactly. Quantity 3 packs -> 1.08 kg'),

-- ── RAW-LIME (11 live dishes). Four of six rows are FRESH seedless limes sold by the 25- or
--    50-fruit pack — a different product with its own canonical. The stored 99.00 is simply the
--    20-09 fresh-lime pack price, copied onto the frozen-juice canonical by the insert trigger.
--    What remains are the two rows that genuinely name "ARO Frozen Tahiti Lime Juice 1 kg",
--    at 135 and 139, so the frozen juice costs 137.00/kg and not 99.00.
--    Destination base_unit 'pcs' means one 25-fruit pack, so the 50-fruit pack counts as 2.
 ('7b8e7d62-609f-4420-801f-65962c630b3d', 'RAW-LIME', 'RAW-LIME-FRESH', 1, 2,
  'image: GO Wholesale PK1IF26020007408 23-02-2026 line 9 "seedless lime, per pack (50 fruits)" @259'),
 ('e47b75b0-a1f8-47de-bf6d-fb7e2e92cc22', 'RAW-LIME', 'RAW-LIME-FRESH', 1, 1,
  'pattern: "Seedless Limes for Juice (25 pcs/pack)" @229, the destination canonical''s own hand-set price'),
 ('23163ed0-793a-4a53-996b-ea50073d25eb', 'RAW-LIME', 'RAW-LIME-FRESH', 1, 1,
  'image: Makro rcpt 166501198003 08-04-2026 "9399 seedless juicing lime 25 fruits per pack" UNIT PACKS 25, @229'),
 ('9f2534be-2580-4bd2-9a23-ce88ac9caa3e', 'RAW-LIME', 'RAW-LIME-FRESH', 1, 1,
  'image: Makro tax invoice 166901037788 20-09-2026 item 1 "9399 seedless lime for juicing, pack 25 fruits" @99 — and this 99.00 is the value sitting in RAW-LIME.cost_per_unit, which is how the mis-mapping announces itself'),

-- ── RAW-PARSLEY, one row. Makro article 862441 is CULANTRO (sawtooth coriander), 150 g, not
--    Italian parsley. RAW-CULANTRO already exists, so the row goes home.
 ('8e2c7b16-a7d3-41f2-a1ff-f86849e74b97', 'RAW-PARSLEY', 'RAW-CULANTRO', 1, 0.15,
  'image: Makro rcpt 062501126001 03-03-2026 "862441 culantro 150 gram per pack" @35; same article at @29 on the 12-06 chit. Stored as "Italian Parsley 150g" by the importer');

-- ──────────────────────────────────────────────────────────────────────────
-- Pre-flight. Every row must exist and still look the way it looked when the
-- receipt was read. Another session may have moved it; abort rather than guess.
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE v_bad int; v_list text;
BEGIN
    SELECT count(*), string_agg(f.pl_id::text, ', ') INTO v_bad, v_list
      FROM tmp_qty_fix f LEFT JOIN public.purchase_logs pl ON pl.id = f.pl_id
     WHERE pl.id IS NULL OR pl.quantity <> f.old_qty OR pl.voided_at IS NOT NULL;
    IF v_bad > 0 THEN
        RAISE EXCEPTION '488 abort: % quantity-fix row(s) missing or drifted: %', v_bad, v_list;
    END IF;

    SELECT count(*), string_agg(r.pl_id::text, ', ') INTO v_bad, v_list
      FROM tmp_repoint r
      LEFT JOIN public.purchase_logs pl ON pl.id = r.pl_id
      LEFT JOIN public.nomenclature n ON n.id = pl.nomenclature_id
     WHERE pl.id IS NULL OR pl.quantity <> r.old_qty OR pl.voided_at IS NOT NULL
        OR n.product_code <> r.from_code;
    IF v_bad > 0 THEN
        RAISE EXCEPTION '488 abort: % repoint row(s) missing or drifted: %', v_bad, v_list;
    END IF;

    IF EXISTS (SELECT 1 FROM tmp_qty_fix f JOIN tmp_repoint r ON r.pl_id = f.pl_id) THEN
        RAISE EXCEPTION '488 abort: a row is listed as both a quantity fix and a repoint';
    END IF;
END $$;

CREATE TEMP TABLE tmp_before_money AS
    SELECT coalesce(sum(total_price), 0) AS total_price_sum, count(*) AS row_count,
           count(*) FILTER (WHERE voided_at IS NOT NULL) AS voided_count
      FROM public.purchase_logs;

CREATE TEMP TABLE tmp_before_cost AS
    SELECT id, product_code, cost_per_unit, cost_source FROM public.nomenclature;

-- The ten products whose logs this migration repairs end to end, with the cost each must
-- reach. These were computed against live data before the migration ran; a mismatch means the
-- data moved underneath us, and the migration stops rather than ship a surprise.
CREATE TEMP TABLE tmp_recalc (product_code text PRIMARY KEY, expected numeric);
INSERT INTO tmp_recalc VALUES
 ('RAW-OLIVE-OIL', 480.1000), ('RAW-MILK-COW', 44.9600), ('RAW-CHIA-SEEDS', 788.8889),
 ('RAW-CUCUMBER', 49.1943), ('RAW-TOMATO', 37.2877), ('RAW-CHICKPEAS', 117.6444),
 ('RAW-SESAME-SEEDS-BLACK', 143.3333), ('RAW-MINT', 171.6290), ('RAW-BOX_BIO_600', 2.1000),
 ('RAW-LIME', 137.0000);

-- Products whose cost must come out of this migration byte-identical to how it went in.
CREATE TEMP TABLE tmp_protected (product_code text PRIMARY KEY, why text);
INSERT INTO tmp_protected VALUES
 ('RAW-ICE_CUBES',            'loses its last purchase row; 16.67 is all anyone has'),
 ('RAW-POMEGRANATE_MOLASSES', 'loses its last purchase row; 775.00 is all anyone has'),
 ('RAW-PARSLEY',              'log still holds three DRIED parsley rows; its WAC is not ready'),
 ('RAW-HONEY',                'untouched by this migration'),
 ('RAW-TURMERIC',             'untouched by this migration');

-- ──────────────────────────────────────────────────────────────────────────
-- Apply. total_price appears in no SET list below.
-- ──────────────────────────────────────────────────────────────────────────
UPDATE public.purchase_logs pl
   SET quantity       = f.new_qty,
       price_per_unit = round(pl.total_price / f.new_qty, 4),
       notes          = coalesce(pl.notes, '') || ' [mig488 qty ' || f.old_qty || '->' || f.new_qty
                        || '; ' || f.evidence || ']'
  FROM tmp_qty_fix f
 WHERE pl.id = f.pl_id;

UPDATE public.purchase_logs pl
   SET nomenclature_id = dest.id,
       quantity        = r.new_qty,
       price_per_unit  = round(pl.total_price / r.new_qty, 4),
       notes           = coalesce(pl.notes, '') || ' [mig488 repoint ' || r.from_code || '->'
                         || r.to_code || ', qty ' || r.old_qty || '->' || r.new_qty
                         || '; ' || r.evidence || ']'
  FROM tmp_repoint r
  JOIN public.nomenclature dest ON dest.product_code = r.to_code
 WHERE pl.id = r.pl_id;

-- ──────────────────────────────────────────────────────────────────────────
-- ⚠ THE TRIGGER NOBODY WARNED US ABOUT, and the reason this block exists.
--
-- trg_recalc_wac_on_purchase_update fires AFTER UPDATE OF nomenclature_id and recalcs BOTH
-- sides of a repoint. For a product that has just lost its LAST row,
-- fn_recalc_wac_for_product computes sum/NULLIF(sum,0) over zero rows, gets NULL, and writes
-- cost_per_unit = NULL, cost_source = 'none'. Left alone it would therefore DELETE ice cubes'
-- 16.67 and pomegranate molasses' 775.00 outright, dropping 32 live dishes from 'unverified'
-- all the way to 'no_cost' — the opposite of this task. A hand-set figure with no history is
-- worth more to the owner than no figure at all, and v_cost_trust_nomenclature already labels
-- it honestly as 'unverified' / no_history. So both are restored.
--
-- Parsley is restored for a different reason: the same trigger fires on its culantro repoint
-- and recomputes its WAC to 251.57, a number that blends fresh parsley with three rows of
-- DRIED parsley still sitting in its log. See PART B note 3.
--
-- The first attempt at this migration had no such block, and its own assert caught the damage
-- and rolled the whole thing back. The assert earned its keep; keep it.
-- ──────────────────────────────────────────────────────────────────────────
UPDATE public.nomenclature n
   SET cost_per_unit = t.cost_per_unit,
       cost_source   = t.cost_source,
       updated_at    = now()
  FROM tmp_before_cost t
 WHERE t.id = n.id
   AND n.product_code IN (SELECT product_code FROM tmp_protected)
   AND (n.cost_per_unit IS DISTINCT FROM t.cost_per_unit
        OR n.cost_source IS DISTINCT FROM t.cost_source);

-- ──────────────────────────────────────────────────────────────────────────
-- Recompute WAC — only the ten. Never globally.
--
-- Deliberately NOT recomputed here:
--   RAW-PARSLEY                 see the block above and PART B note 3.
--   RAW-POTATO, RAW-CULANTRO    the repoint trigger already refreshed them, and legitimately:
--                               each gained a real receipt-backed row and each still agrees
--                               with its own log (potato 42.00 -> 43.51, culantro 95.38 ->
--                               110.00, both 'verified'). Not fought, since the numbers are
--                               sound; recorded here so the change is not a surprise.
--   RAW-LIME-FRESH,             cost_source='manual'. fn_recalc_wac_for_product early-returns
--   RAW-MOLASSES_BLACKSTRAP     on 'manual' anyway; not calling it keeps that explicit.
--   RAW-ICE_CUBES,              no purchase history left at all — see the block above.
--   RAW-POMEGRANATE_MOLASSES
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE r record; v_new numeric;
BEGIN
    FOR r IN SELECT n.id, n.product_code, n.cost_per_unit AS old_cost, t.expected
               FROM public.nomenclature n JOIN tmp_recalc t ON t.product_code = n.product_code
    LOOP
        v_new := public.fn_recalc_wac_for_product(r.id);
        IF v_new IS NULL THEN
            RAISE EXCEPTION '488 abort: % recomputed to NULL', r.product_code;
        END IF;
        IF abs(v_new - r.expected) > 0.01 THEN
            RAISE EXCEPTION '488 abort: % recomputed to % but % was expected', r.product_code, v_new, r.expected;
        END IF;
    END LOOP;
END $$;

-- ──────────────────────────────────────────────────────────────────────────
-- Closing asserts. This is the point of the migration, not a formality.
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE b record; a record; v_bad int; v_list text;
BEGIN
    SELECT * INTO b FROM tmp_before_money;
    SELECT coalesce(sum(total_price), 0) AS total_price_sum, count(*) AS row_count,
           count(*) FILTER (WHERE voided_at IS NOT NULL) AS voided_count
      INTO a FROM public.purchase_logs;

    IF a.total_price_sum <> b.total_price_sum THEN
        RAISE EXCEPTION '488 abort: money moved, % -> %', b.total_price_sum, a.total_price_sum;
    END IF;
    IF a.row_count <> b.row_count OR a.voided_count <> b.voided_count THEN
        RAISE EXCEPTION '488 abort: purchase_logs rows changed, % -> %', b.row_count, a.row_count;
    END IF;

    -- No INGREDIENT cost may have moved except the ten recomputed on purpose and the two the
    -- repoint trigger legitimately refreshed.
    -- PF-/SALE-/MOD- costs DO move here: trg_cascade_bom_cost reprices every parent of a
    -- changed ingredient, which is the entire point of correcting an ingredient cost. 151
    -- products repriced on this run.
    SELECT count(*), string_agg(product_code, ', ') INTO v_bad, v_list
      FROM (SELECT n.product_code
              FROM public.nomenclature n JOIN tmp_before_cost t ON t.id = n.id
             WHERE (n.cost_per_unit IS DISTINCT FROM t.cost_per_unit
                    OR n.cost_source IS DISTINCT FROM t.cost_source)
               AND n.product_code LIKE 'RAW-%'
               AND n.product_code NOT IN (SELECT product_code FROM tmp_recalc)
               AND n.product_code NOT IN ('RAW-POTATO', 'RAW-CULANTRO')) s;
    IF v_bad > 0 THEN
        RAISE EXCEPTION '488 abort: % unintended ingredient cost change(s): %', v_bad, v_list;
    END IF;

    -- The protected five must be byte-identical to how they went in.
    SELECT count(*), string_agg(n.product_code, ', ') INTO v_bad, v_list
      FROM public.nomenclature n
      JOIN tmp_before_cost t ON t.id = n.id
      JOIN tmp_protected p ON p.product_code = n.product_code
     WHERE n.cost_per_unit IS DISTINCT FROM t.cost_per_unit
        OR n.cost_source IS DISTINCT FROM t.cost_source;
    IF v_bad > 0 THEN
        RAISE EXCEPTION '488 abort: protected ingredient(s) moved: %', v_list;
    END IF;

    -- The ten must now agree with their own logs. That is what 'settled' means here.
    SELECT count(*), string_agg(product_code, ', ') INTO v_bad, v_list
      FROM public.v_cost_trust_nomenclature
     WHERE product_code IN (SELECT product_code FROM tmp_recalc) AND trust_class <> 'verified';
    IF v_bad > 0 THEN
        RAISE EXCEPTION '488 abort: % of the ten did not reach verified: %', v_bad, v_list;
    END IF;
END $$;

INSERT INTO public.migration_log (filename, applied_by, status, notes)
VALUES ('488_ingredient_cost_reconciliation.sql', 'claude-opus-session-58399a46', 'success',
        'MC cd76dcd7. Settled 11 of the 15 widest-reach ingredients against the receipt '
     || 'photographs: normalized 39 purchase_logs quantities and repointed 7 wrong-item rows '
     || '(ice cubes were priced off a potato line, pomegranate molasses off a blackstrap '
     || 'molasses line, 4 of lime 6 rows are fresh limes not frozen juice, 1 parsley row is '
     || 'culantro). Quantity only, total_price untouched per mig 390 / mig 460 s5; '
     || 'in-transaction asserts prove no money moved and no unintended ingredient cost changed. '
     || 'WAC recomputed for 10 products, never globally; ice cubes, pomegranate molasses and '
     || 'parsley explicitly restored after trg_recalc_wac_on_purchase_update would have nulled '
     || 'or blended them. Ice cubes, honey, turmeric and parsley left unsettled with the reason '
     || 'recorded in the migration file.')
ON CONFLICT DO NOTHING;

-- INTENTIONAL DROP — these six are TEMP tables created by this migration a few lines above,
-- holding the fix list and the before-snapshots. Nothing persistent is dropped; the
-- connector runs the file in one transaction, so this is just explicit cleanup.
DROP TABLE tmp_qty_fix; DROP TABLE tmp_repoint; DROP TABLE tmp_before_money;
DROP TABLE tmp_before_cost; DROP TABLE tmp_recalc; DROP TABLE tmp_protected;

-- ══════════════════════════════════════════════════════════════════════════
-- PART B — THE FOUR LEFT ALONE. A documented unknown beats a confident guess.
-- ══════════════════════════════════════════════════════════════════════════
--
-- 1. RAW-ICE_CUBES — 23 live dishes, the largest single item still open.
--    The mis-mapping is settled: its one "purchase" was potato. The COST is not. Ice now has
--    no purchase history whatsoever, so the stored 16.67/kg rests on nothing at all and the
--    23 dishes stay 'unverified' (reason: no_history, which is now the honest label). One
--    number from the CEO closes this: what does a kilogram of ice cost delivered? Entered with
--    cost_source='manual' it would settle 23 dishes in a single UPDATE.
--
-- 2. RAW-HONEY — 14 live dishes. Partly readable, deliberately not half-fixed.
--    The 07-04 Doi Kham line IS settled by image: Makro rcpt 062501196002,
--    "8850773620286 Doi Kham pure honey 100% 770 g X2", 1 pack of 2 @370 = 1.54 kg, 240.26/kg.
--    But the other two rows are Wetchapong bottles labelled 760 **ml** against a base_unit of
--    kg, so converting them needs a density, not a receipt. Worse, the 12-04 row already
--    carries 1.54 — the Doi Kham WEIGHT applied to a 760 ml bottle, wrong under any density.
--    Fixing only the Doi Kham row would have pulled honey's divergence under the 20% tolerance
--    and flipped its badge to 'verified' while two of its three rows stayed untrustworthy.
--    That is precisely the failure this task exists to prevent, so honey was left untouched.
--    The CEO decision: the net weight of a Wetchapong 760 ml bottle — or re-base RAW-HONEY on
--    litres. Either answer settles all three rows at once.
--
-- 3. RAW-PARSLEY — 11 live dishes. Its quantities WERE repaired (10 rows) and its culantro row
--    sent home, but its cost was deliberately NOT recomputed, so it stays 'unverified'.
--    Three rows are Hand Brand DRIED parsley in 50 g sachets at 48 and 69 THB, booked as
--    quantity 1 — as a kilogram each. Dried parsley runs about 1,380/kg against fresh at ~350;
--    they are not the same ingredient and must not share a WAC. There is no RAW-PARSLEY-DRIED
--    canonical, and creating nomenclature is outside this migration (RULE-SOCRATIC-GATE). With
--    those three rows as they are the log reads 251.57/kg against a stored 321.87 — a 22% gap
--    that is an artefact of the dried rows, not a real contradiction. Recomputing would have
--    made the number worse while making the badge look better.
--    The CEO decision: create RAW-PARSLEY-DRIED (compare RAW-OREGANO-DRIED, the same Hand Brand
--    line) and repoint those three rows. Parsley then settles at about 348/kg.
--
-- 4. RAW-TURMERIC — 7 live dishes. Its three rows are 200 g and 250 g packs, and normalizing
--    them gives 302.86/kg against a stored 308.00 — a 1.7% agreement that looks conclusive.
--    It was still left alone, because not one of the three lines could be read: both source
--    chits are multi-sheet and only the sheet WITHOUT the turmeric line was ever stored. On an
--    ingredient where the receipt has already been caught lying once (chickpeas: the stored
--    text said 500 g, the photograph said 600 g), a tidy arithmetic agreement is not evidence.
--    Re-photograph either chit and this closes in minutes.
--
-- ── ON cost_source='manual'. The task proposed flipping hand-set truths to 'manual' so the
--    AFTER INSERT trigger stops dragging them back. None of the eleven settled here wants it:
--    all ten recomputed products now AGREE with their own logs, so the trigger has nothing to
--    drag, and flipping them would freeze them against genuine future price moves while
--    demoting them from trust_rank 0 ('verified') to 10 ('manual') — worse, not better.
--    The two that would benefit are ice cubes and pomegranate molasses, and they are precisely
--    the two whose numbers nobody can vouch for. Setting 'manual' there would dress a guess as
--    a decision, so they keep 'none'/'wac' with the contradiction visible.
