-- 460 — purchase_logs historical repair, Part A (MC 00a81c22 item 6)
--
-- ⛔ NOT APPLIED. This migration is the CEO's review surface. Spec:
--    docs/projects/admin/plans/spec-purchase-logs-historical-repair.md
--
-- DEPENDS ON migration 459 (applied 2026-10-16). 459 hardened the import path and
-- deliberately backfilled nothing; this repairs the damage already in the table.
--
-- PATTERNS REUSED (do not invent new ones):
--   * mig 325 — cost-frozen repoint + tombstone, never hard-delete.
--   * mig 390 — normalize the quantity to the base unit FIRST, leave total_price
--               untouched so no money moves, and only then recompute WAC.
--
-- WHY THIS IS UPDATE-HEAVY AND THAT IS FINE: 459's trg_purchase_log_import_guard is
-- INSERT-only precisely so these repairs can UPDATE the 20 arithmetic violations and
-- the 24 out-of-window dates that an UPDATE-time check would have frozen in place.
--
-- SCOPE — Part A only, every change backed by a receipt line or by a value already
-- correct elsewhere in the same record:
--   §4  normalize 20 bad-unit rows            §8  T1 auto-merge, 18 stubs + 1 partial
--   §5  repoint 4 wrong-item rows             §9  T2 tombstone 13 junk stubs
--   §6  fix 18 invoice_date rows              §9b un-poison 1 supplier_catalog row
--   §7  void 11 duplicate orphan rows
--
-- NOT IN SCOPE, deliberately: no cost_per_unit changes, no fn_recalc_wac_for_product,
-- no touching the 365 unresolved stubs, nothing deleted, no OpEx supplier_id (item 7).
-- Part B skeletons are at the tail, commented out, for the CEO to fill in.
--
-- VERIFY BEFORE APPLYING: A/B on a throwaway local PG14 fixture built from
-- information_schema + the LIVE function bodies via pg_get_functiondef (never the repo
-- copies — they drift). Socket under a short path, e.g. /tmp/shk460/sock.

BEGIN;

-- ──────────────────────────────────────────────────────────────────────────
-- 1. Snapshot every nomenclature cost — the proof surface for the freeze assert
-- ──────────────────────────────────────────────────────────────────────────
CREATE TEMP TABLE tmp_cost_snap ON COMMIT DROP AS
SELECT id, cost_per_unit, cost_source FROM public.nomenclature;

CREATE TEMP TABLE tmp_counts ON COMMIT DROP AS
SELECT (SELECT count(*) FROM public.purchase_logs)   AS pl_rows,
       (SELECT count(*) FROM public.expense_ledger)  AS el_rows;

-- ──────────────────────────────────────────────────────────────────────────
-- 2. The curated maps. Every row id was read off the live table on 2026-10-16;
--    §4 and §6 additionally cite a receipt image. Pre-flight below aborts if any
--    row has moved since.
-- ──────────────────────────────────────────────────────────────────────────

-- 2a. Bad-unit rows: quantity/price corrections. total_price is NEVER touched.
CREATE TEMP TABLE tmp_unit_fix (
  row_id uuid PRIMARY KEY, old_qty numeric, old_price numeric,
  new_qty numeric, new_price numeric, evidence text
) ON COMMIT DROP;
INSERT INTO tmp_unit_fix VALUES
 ('b25d4357-47c1-4d24-9bcf-73ab1609f8f4', 500,   180,    250,   0.72,       'Makro 07-04-2026 art 8850287001700: QTY 1 x 250g bag @ 180.00'),
 ('5236a8d3-5c41-49d6-9d07-b548e225f6d9', 500,   365,    600,   0.608333,   'Makro 20-04-2026 art 8859485301568: QTY 1 x 600g bag @ 365.00'),
 ('6853f530-0160-4271-bade-9d9d89f932ea', 1,     35,     4,     35,         'Makro 23-05-2026: 4 x potato pack 1kg @ 35.00 -> 140.00'),
 ('dc6e5f6e-72fa-415a-ade9-9cf1df5dacf0', 1,     420,    2,     420,        'Makro 23-05-2026: 2 x AU frozen lamb 1KG @ 420.00 -> 840.00'),
 ('149e28d9-7a0f-4c88-ae8a-3109029a5b1b', 1,     35,     8,     35,         'Makro 27-05-2026: 8 x potato pack 1kg @ 35.00 -> 280.00'),
 ('74be1f02-a84d-43d2-ae62-f622c891a626', 1,     420,    2,     420,        'Makro 02-06-2026: 2 x AU frozen lamb 1KG @ 420.00 -> 840.00'),
 ('bcb128bb-a010-48bb-b812-c81de67f4dc2', 2,     45,     6,     45,         'Makro 02-06-2026: 6 x potato pack 1kg @ 45.00 -> 270.00'),
 ('e444acb1-97d8-4a5c-8673-8c7f472a623e', 2.23,  620,    0.230, 620,        'Makro 11-06-2026: 0.230 kg AU striploin @ 620.00 -> 142.50'),
 ('d8a858de-3870-4218-8a52-d77d66d06bae', 1,     184,    1.060, 184,        'Makro 17-06-2026: 1.060 kg white shrimp 41-45 @ 184.00 -> 195.00'),
 ('4f4a4b32-ca6c-4824-9a6a-2f8c251b3bf5', 2.09,  247,    2.096, 247,        'Makro 22-06-2026: 2.096 kg white shrimp 41-45 @ 247.00 -> 517.75'),
 ('014cda65-63f3-4721-af16-293fd5333447', 2.258, 97,     2.058, 97,         'Makro 01-07-2026: 2.058 kg skinless chicken breast @ 97.00 -> 199.75'),
 ('318df5ef-4cc6-49e0-90c4-58d7100a7fc1', 2.606, 129,    0.606, 129,        'Makro 07-07-2026: 0.606 kg RED bell pepper @ 129.00 -> 78.25 (green+yellow already on their own rows) — also repointed in §5'),
 ('11e9ce95-c5cb-4c18-9f04-c7baf75d80c6', 1,     89.68,  1,     65,         'Phu Lae handwritten 19.9.69: iceberg, 65, total 65'),
 ('d219a527-0cd3-4548-992c-0def0c71887f', 1,     59,     1,     49,         'Tops Daily 19/09/2026: 1 x My Choice avocado 2-pack, 49.00 paid (59 is pre-discount)'),
 ('af7c74cb-8207-4f1b-a98c-97e245ef95bb', 1,     91,     1,     109,        'Tops Daily 25/09/2026: 1 x Naturel coconut oil 1 L, 109.00 paid'),
 ('c3798e9c-4717-4a2d-bedc-fefe6fac54a1', 3,     99,     3,     66,         'Tops RAWAYANA 25.09.2026 B2G1: 3 units received, 198 paid -> 66/unit'),
 ('675442d4-87db-4b69-aadf-8bc8a15e14a6', 2,     79,     1,     79,         'Makro tax invoice 08/10/2026 item 24: 1 EACH @ 79.00 -> 79.00 (sweet corn KERNELS, not cobs)'),
 ('e3f2760c-65ab-4d3a-be3e-4111dd4169af', 1,     0,      1,     300,        'handwritten delivery note: one line @ 300, total 300; price_per_unit was simply missing'),
 ('9a7fd43b-6545-4f0c-9208-f5b5cb2342cd', 2000,  30,     1,     300,        'cash bill 11-04-69 reads "น้ำ 2000 L" = one bulk water delivery, 300 THB — also repointed in §5'),
 ('4d71c9b6-f493-4e64-bbd9-417d71efa0bf', 40,    2,      2,     40,         'delivery bill 28-2-69: QTY 2 @ 40 = 80; qty and price were swapped');

-- 2b. Wrong-item repoints (row-level, not stub-level).
CREATE TEMP TABLE tmp_row_repoint (row_id uuid PRIMARY KEY, target_code text, evidence text) ON COMMIT DROP;
INSERT INTO tmp_row_repoint VALUES
 ('318df5ef-4cc6-49e0-90c4-58d7100a7fc1','RAW-BELL-PEPPER-RED', 'receipt line is the RED pepper; green and yellow already have their own rows'),
 ('8050f994-7dd0-4587-90c2-2af7b5dbf214','RAW-BANANA',          'handwritten bill reads กล้วยหอม (Hom banana). The stub it sits on also holds a genuine ARO artificial banana LEAF row — only this row moves'),
 ('2fe96063-5b31-4aa7-9b74-90887a2b0058','RAW-LETTUCE-ICEBERG', 'receipt and the row notes both say iceberg lettuce; it was stored against RAW-JUICE-MIXED-FRUIT'),
 ('9a7fd43b-6545-4f0c-9208-f5b5cb2342cd','RAW-AUTO-69961f11',   'bulk water delivery, not morning glory. Parked on the ACTIVE "FM Water 2000 L" stub — same product — until spec §5.5 decides the water canonical. This is the one repoint that moves a row ONTO a stub, on purpose: leaving it would keep morning glory priced as water');

-- 2c. invoice_date corrections. The 6 rows we could not read are deliberately absent.
CREATE TEMP TABLE tmp_date_fix (row_id uuid PRIMARY KEY, new_date date, also_expense boolean, evidence text) ON COMMIT DROP;
INSERT INTO tmp_date_fix
SELECT pl.id, DATE '2026-04-03', false,
       'GO Wholesale receipt header 03/04/2026, 15 lines, total 2681.00; expense_ledger already holds 2026-04-03'
  FROM public.purchase_logs pl
 WHERE pl.expense_id = '90914f2f-cff7-4ef9-9168-0a42ccbe0aaf' AND pl.invoice_date = DATE '2023-04-03';
INSERT INTO tmp_date_fix VALUES
 ('8fac1ee8-437e-4d47-ac15-8d7b3ae3b72a', DATE '2026-02-23', false, 'handwritten 23/2/69 plus a red paid-stamp spelling out 23 ก.พ. 2569'),
 ('4d71c9b6-f493-4e64-bbd9-417d71efa0bf', DATE '2026-02-28', true,  'delivery bill 28-2-69 = 28 Feb 2569 BE; the expense day (-26) is wrong too'),
 ('ec93dcc9-b057-45fb-a4bd-d2531d97e50d', DATE '2026-04-24', true,  'cash sale handwritten 24/4/69 = 2569 BE; expense is wrong too'),
 ('8050f994-7dd0-4587-90c2-2af7b5dbf214', DATE '2026-09-20', true,  'handwritten 20/09/69'),
 ('2fe96063-5b31-4aa7-9b74-90887a2b0058', DATE '2026-09-11', true,  'handwritten ?.9.69 — month 9 and year 2026 legible, day not; DB day 11 kept, lands before the 2026-09-15 import');

-- 2d. The 11 duplicate orphan rows (one receipt imported twice, 3 hours apart).
--     The 12th orphan (RAW-CHEESE_GOAT) is a deliberate WAC seed and is NOT listed.
CREATE TEMP TABLE tmp_void_dup (row_id uuid PRIMARY KEY) ON COMMIT DROP;
INSERT INTO tmp_void_dup VALUES
 ('4b86ef7f-57a3-43d0-840a-2e206e3ad677'), ('a0847363-82f6-45cd-ba16-7d622433354d'),
 ('347ac7b8-d475-407a-b108-6b1bebd38e87'), ('490ee1cb-030e-469d-861e-485fd01bf0d9'),
 ('0eef5137-c0a8-487a-ad82-b9d35b40b130'), ('3ae33bb0-2b3d-406f-b904-4e5376cb0d74'),
 ('a186ed29-563c-468d-b58d-a0bb64ee4a9b'), ('d7cdac19-5651-4a64-9f67-115c8b1a4604'),
 ('85b09f4c-1b0e-4d7d-9989-a25e6875a9f4'), ('e818779e-58a2-45a8-891b-792c2d27d806'),
 ('93633ef0-6d5f-4916-ba21-e0ba7a383f22');

-- 2e. T1 — stubs the LIVE fn_match_nomenclature ladder resolved to a canonical item.
--     Generated by running the ladder over every stub's most recent purchase row, then
--     hand-checked. Four ladder hits were REJECTED and are listed in §9b instead:
--       RAW-AUTO-8f43d34d / da96d8ab / 05764dbf  "Water" -> RAW-MORNING-GLORY
--       RAW-AUTO-ac4f864b  "Pineapple Juice CS"  -> RAW-PINEAPPLE (juice is not the fruit)
--     Both come from poisoned supplier_catalog rows, not from the ladder's logic.
CREATE TEMP TABLE tmp_merge (stub_code text PRIMARY KEY, target_code text) ON COMMIT DROP;
INSERT INTO tmp_merge VALUES
 ('RAW-AUTO-672dbea6','RAW-CHEESE-PARMESAN'), ('RAW-AUTO-69679c09','RAW-SYRUP_CARAMEL'),
 ('RAW-AUTO-ed7b4bed','RAW-BUTTER'),          ('RAW-AUTO-81812ca5','RAW-EGGPLANT'),
 -- ^ the ladder said RAW-THAI-EGGPLANT. REJECTED: that canonical is soft-deleted, and
 --   Thai eggplant (มะเขือเปราะ, small round) is a different vegetable from green-stem
 --   aubergine. Mig 325 already merged two identically-named stubs into RAW-EGGPLANT;
 --   this follows that precedent. Catalog rows fixed in §9b.
 ('RAW-AUTO-cd8f864d','RAW-CHICKPEAS'),       ('RAW-AUTO-ebf3d24c','RAW-CINNAMON-POWDER'),
 ('RAW-AUTO-937e6af9','RAW-JAM-BLUEBERRY'),   ('RAW-AUTO-6b5df138','RAW-MINT-LEAVES'),
 ('RAW-AUTO-17c6cee3','RAW-CARROT'),          ('RAW-AUTO-02d27c18','RAW-LETTUCE-ICEBERG'),
 ('RAW-AUTO-3cd4f323','RAW-CUCUMBER'),        ('RAW-AUTO-b26af09a','RAW-LETTUCE-ICEBERG'),
 ('RAW-AUTO-704a566f','RAW-ONION'),           ('RAW-AUTO-9b27cc4e','RAW-OREGANO-DRIED'),
 ('RAW-AUTO-72df37a0','RAW-PUMPKIN'),         ('RAW-AUTO-997ce46a','RAW-POTATO'),
 ('RAW-AUTO-64ae91d8','RAW-CUCUMBER'),        ('RAW-AUTO-0c38f14e','RAW-BUTTER');

-- 2f. T2 — junk / not-a-product. Tombstone only, history preserved, no canonical.
CREATE TEMP TABLE tmp_junk (stub_code text PRIMARY KEY, why text) ON COMMIT DROP;
INSERT INTO tmp_junk VALUES
 ('RAW-AUTO-e2d609b8','the supplier invoice NUMBER parsed as a product — 1546.15 THB of COGS that is not a purchase'),
 ('RAW-AUTO-0b4e881a','same, second invoice number, 160.00 THB'),
 ('RAW-AUTO-53ae5f17','"(1*40)" — a pack-size fragment, not a product name'),
 ('RAW-AUTO-89739060','"267 2000 L" — a meter reading or bill number'),
 ('RAW-AUTO-f2b7f726','"Miscellaneous Purchase Item" — the OCR gave up'),
 ('RAW-AUTO-58cf8eb2','"Whittaker''s" — brand only, no product'),
 ('RAW-AUTO-7f8a41c9','"Item N" — the OCR gave up'),
 ('RAW-AUTO-ac5654d5','"Aro (incomplete product name)" — says so itself'),
 ('RAW-AUTO-83bf4ed0','already [JUNK-NO-MATCH] from an earlier pass'),
 ('RAW-AUTO-4cec0b11','already [JUNK-NO-MATCH]'),
 ('RAW-AUTO-8547deb8','already [JUNK-NO-MATCH]'),
 ('RAW-AUTO-3245327b','already [JUNK-NO-MATCH]'),
 ('RAW-AUTO-6dd0424e','already [JUNK-NO-MATCH]');

-- ──────────────────────────────────────────────────────────────────────────
-- 3. PRE-FLIGHT — abort before touching anything if the table has moved
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE v_bad int;
BEGIN
  SELECT count(*) INTO v_bad FROM tmp_unit_fix f
   WHERE NOT EXISTS (SELECT 1 FROM public.purchase_logs pl
                      WHERE pl.id = f.row_id
                        AND pl.quantity = f.old_qty AND pl.price_per_unit = f.old_price);
  IF v_bad > 0 THEN RAISE EXCEPTION '460: % unit-fix row(s) no longer hold the mapped values', v_bad; END IF;

  SELECT count(*) INTO v_bad FROM tmp_unit_fix f JOIN public.purchase_logs pl ON pl.id = f.row_id
   WHERE abs(f.new_qty * f.new_price - pl.total_price) > GREATEST(1, 0.02 * abs(pl.total_price));
  IF v_bad > 0 THEN RAISE EXCEPTION '460: % proposed quantity/price pair(s) do not reconcile to total_price', v_bad; END IF;

  SELECT count(*) INTO v_bad FROM tmp_date_fix f
   WHERE NOT EXISTS (SELECT 1 FROM public.purchase_logs WHERE id = f.row_id);
  IF v_bad > 0 THEN RAISE EXCEPTION '460: % date-fix row(s) missing', v_bad; END IF;
  IF (SELECT count(*) FROM tmp_date_fix) <> 18 THEN
    RAISE EXCEPTION '460: expected 18 date fixes (13 cluster + 5 singles), got %', (SELECT count(*) FROM tmp_date_fix);
  END IF;

  SELECT count(*) INTO v_bad FROM tmp_void_dup d
   WHERE NOT EXISTS (SELECT 1 FROM public.purchase_logs WHERE id = d.row_id AND expense_id IS NULL);
  IF v_bad > 0 THEN RAISE EXCEPTION '460: % void-dup row(s) are not orphans any more', v_bad; END IF;

  SELECT count(*) INTO v_bad FROM tmp_row_repoint r
   WHERE NOT EXISTS (SELECT 1 FROM public.nomenclature WHERE product_code = r.target_code);
  IF v_bad > 0 THEN RAISE EXCEPTION '460: % row-repoint target(s) missing', v_bad; END IF;

  SELECT count(*) INTO v_bad FROM tmp_merge m
   WHERE NOT EXISTS (SELECT 1 FROM public.nomenclature WHERE product_code = m.stub_code)
      OR NOT EXISTS (SELECT 1 FROM public.nomenclature WHERE product_code = m.target_code AND is_deleted = false);
  IF v_bad > 0 THEN RAISE EXCEPTION '460: % merge pair(s) have a missing stub or an inactive target', v_bad; END IF;

  SELECT count(*) INTO v_bad FROM tmp_junk j
   WHERE NOT EXISTS (SELECT 1 FROM public.nomenclature WHERE product_code = j.stub_code);
  IF v_bad > 0 THEN RAISE EXCEPTION '460: % junk stub(s) missing', v_bad; END IF;

  -- no stub may be both merged and tombstoned
  IF EXISTS (SELECT 1 FROM tmp_merge m JOIN tmp_junk j ON j.stub_code = m.stub_code) THEN
    RAISE EXCEPTION '460: a stub appears in both the merge map and the junk map';
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────────────────
-- 4. COST FREEZE — disable the WAC / cost-seed triggers for the whole repair.
--    DDL is transactional: a rollback restores them. (Pattern: mig 325 §3.)
-- ──────────────────────────────────────────────────────────────────────────
ALTER TABLE public.purchase_logs    DISABLE TRIGGER trg_recalc_wac_on_purchase_update;
ALTER TABLE public.purchase_logs    DISABLE TRIGGER trg_update_cost_on_purchase;
ALTER TABLE public.purchase_logs    DISABLE TRIGGER trg_purchase_log_correction;
ALTER TABLE public.supplier_catalog DISABLE TRIGGER trg_sc_seed_raw_cost;

-- ──────────────────────────────────────────────────────────────────────────
-- 5. Normalize the 20 bad-unit rows. total_price is NOT in the SET list.
--    (Pattern: mig 390 — quantities move, money does not.)
-- ──────────────────────────────────────────────────────────────────────────
UPDATE public.purchase_logs pl
   SET quantity       = f.new_qty,
       price_per_unit = f.new_price,
       notes          = COALESCE(pl.notes,'') || ' [460-unit-fix]'
  FROM tmp_unit_fix f
 WHERE pl.id = f.row_id;

-- 5b. One barcode correction found while reading the Boncafe 600 g receipt:
--     stored 8859485321568, the receipt prints 8859485301568.
UPDATE public.purchase_logs
   SET barcode = '8859485301568'
 WHERE id = '5236a8d3-5c41-49d6-9d07-b548e225f6d9' AND barcode = '8859485321568';

-- ──────────────────────────────────────────────────────────────────────────
-- 6. Repoint the 4 wrong-item rows
-- ──────────────────────────────────────────────────────────────────────────
UPDATE public.purchase_logs pl
   SET nomenclature_id = t.id,
       notes           = COALESCE(pl.notes,'') || ' [460-repoint]'
  FROM tmp_row_repoint r
  JOIN public.nomenclature t ON t.product_code = r.target_code
 WHERE pl.id = r.row_id;

-- ──────────────────────────────────────────────────────────────────────────
-- 7. invoice_date. 18 rows here; 6 unreadable ones are left for the CEO (spec §3.3).
-- ──────────────────────────────────────────────────────────────────────────
UPDATE public.purchase_logs pl
   SET invoice_date = f.new_date
  FROM tmp_date_fix f
 WHERE pl.id = f.row_id;

UPDATE public.expense_ledger el
   SET transaction_date = f.new_date, updated_at = now()
  FROM tmp_date_fix f
  JOIN public.purchase_logs pl ON pl.id = f.row_id
 WHERE el.id = pl.expense_id AND f.also_expense;

-- ──────────────────────────────────────────────────────────────────────────
-- 8. Void the 11 duplicate orphan rows. purchase_logs has no soft-delete column,
--    so they are zeroed and tagged: the row survives for audit, contributes
--    nothing to WAC, and nothing is hard-deleted (mig 325's rule).
--    ⚠️ CEO may instead choose DELETE — see spec §4.
-- ──────────────────────────────────────────────────────────────────────────
UPDATE public.purchase_logs
   SET quantity = 0, price_per_unit = 0, total_price = 0,
       notes = '[VOID-DUP-77460cc2] ' || COALESCE(notes,'')
 WHERE id IN (SELECT row_id FROM tmp_void_dup);

-- ──────────────────────────────────────────────────────────────────────────
-- 9. T1 auto-merge — repoint every reference, then tombstone the stub.
--    Same table list as mig 325 §7.
-- ──────────────────────────────────────────────────────────────────────────
CREATE TEMP TABLE tmp_resolve ON COMMIT DROP AS
SELECT s.id AS stub_id, t.id AS target_id, m.target_code
  FROM tmp_merge m
  JOIN public.nomenclature s ON s.product_code = m.stub_code
  JOIN public.nomenclature t ON t.product_code = m.target_code;

UPDATE public.purchase_logs      x SET nomenclature_id=r.target_id FROM tmp_resolve r WHERE x.nomenclature_id=r.stub_id;
UPDATE public.receiving_lines    x SET nomenclature_id=r.target_id FROM tmp_resolve r WHERE x.nomenclature_id=r.stub_id;
UPDATE public.supplier_catalog   x SET nomenclature_id=r.target_id FROM tmp_resolve r WHERE x.nomenclature_id=r.stub_id;
UPDATE public.inventory_batches  x SET nomenclature_id=r.target_id FROM tmp_resolve r WHERE x.nomenclature_id=r.stub_id;
UPDATE public.stock_movements    x SET nomenclature_id=r.target_id FROM tmp_resolve r WHERE x.nomenclature_id=r.stub_id;
UPDATE public.stocktake_entries  x SET nomenclature_id=r.target_id FROM tmp_resolve r WHERE x.nomenclature_id=r.stub_id;
UPDATE public.sku                x SET nomenclature_id=r.target_id FROM tmp_resolve r WHERE x.nomenclature_id=r.stub_id;
UPDATE public.sku_balances       x SET nomenclature_id=r.target_id FROM tmp_resolve r WHERE x.nomenclature_id=r.stub_id;
UPDATE public.waste_logs         x SET nomenclature_id=r.target_id FROM tmp_resolve r WHERE x.nomenclature_id=r.stub_id;
UPDATE public.shopping_list_items x SET nomenclature_id=r.target_id FROM tmp_resolve r WHERE x.nomenclature_id=r.stub_id;
UPDATE public.stock_request_lines x SET nomenclature_id=r.target_id FROM tmp_resolve r WHERE x.nomenclature_id=r.stub_id;
UPDATE public.po_lines           x SET nomenclature_id=r.target_id FROM tmp_resolve r WHERE x.nomenclature_id=r.stub_id;
UPDATE public.unmatched_items    x SET resolved_to=r.target_id     FROM tmp_resolve r WHERE x.resolved_to=r.stub_id;
UPDATE public.unmatched_items    x SET suggested_match=r.target_id FROM tmp_resolve r WHERE x.suggested_match=r.stub_id;

-- The tombstone name carries the target code, which 459's ladder parses back as a
-- permanent matcher memory ('[MERGED->CODE]'). That is why the prefix matters.
UPDATE public.nomenclature n
   SET is_deleted=true, is_available=false,
       name='[MERGED->'||m.target_code||'] '||n.name, updated_at=now()
  FROM tmp_merge m
 WHERE n.product_code = m.stub_code AND n.is_deleted = false;

-- 9a. The one partial stub: RAW-AUTO-b211fb59 holds TWO unrelated products under one
--     deterministic code — a real banana purchase (repointed in §6) and a genuine ARO
--     artificial banana LEAF row. The stub stays alive for the leaf.
--     (Logged as a finding: deterministic stub codes can collide on a shared name.)

-- 9b. UN-POISON supplier_catalog. These rows make 459's ladder confidently assert a
--     WRONG canonical on every future receipt — a live bug, not just history:
--       6ed27304  supplier "Water delivery", product "Water" -> RAW-MORNING-GLORY
--                 (this is why morning glory costs 30/kg: its only purchase row is water)
--       9544d609  Makro "Pineapple Juice _CS" -> RAW-PINEAPPLE (juice, not the fruit)
--     fn_match_nomenclature skips rows WHERE sc.nomenclature_id IS NOT NULL, so
--     nulling the link removes them from the ladder without deleting the price history.
--     The right canonical for each is a CEO decision (spec §5.5).
UPDATE public.supplier_catalog
   SET nomenclature_id = NULL, match_reviewed_at = NULL, updated_at = now()
 WHERE id IN ('6ed27304-6b3a-41d6-9acf-7ecd23bc6270',   -- Water -> MORNING-GLORY
              '9544d609-f29b-45b3-823c-0eade33f1d52');  -- Pineapple Juice -> PINEAPPLE

-- 9c. Two more catalog rows point "Green Stem Eggplant" at RAW-THAI-EGGPLANT, which is
--     (a) a different vegetable and (b) SOFT-DELETED. Repoint them at RAW-EGGPLANT, the
--     canonical mig 325 chose for this exact product name.
--     ⚠️ THE REAL FINDING: the ladder resolved onto a soft-deleted canonical. Only the
--     `name:nomenclature` level filters is_deleted=false; the supplier_catalog levels do
--     not. A one-line fix for fn_match_nomenclature — see the spec's §9 follow-ups.
UPDATE public.supplier_catalog sc
   SET nomenclature_id = (SELECT id FROM public.nomenclature WHERE product_code='RAW-EGGPLANT'),
       match_reviewed_at = NULL, updated_at = now()
 WHERE sc.id IN ('7c830126-a36b-4d24-8493-a320891a0d0a',
                 '98718b35-ae66-4dd3-8192-0d9b8b5e995c');

-- ──────────────────────────────────────────────────────────────────────────
-- 10. T2 — tombstone the junk stubs. History preserved, nothing deleted.
-- ──────────────────────────────────────────────────────────────────────────
UPDATE public.nomenclature n
   SET is_deleted=true, is_available=false,
       name = CASE WHEN n.name LIKE '[JUNK-NO-MATCH]%' THEN n.name
                   ELSE '[JUNK-NO-MATCH] '||n.name END,
       updated_at=now()
  FROM tmp_junk j
 WHERE n.product_code = j.stub_code;

-- ──────────────────────────────────────────────────────────────────────────
-- 11. Re-enable the cost triggers
-- ──────────────────────────────────────────────────────────────────────────
ALTER TABLE public.purchase_logs    ENABLE TRIGGER trg_recalc_wac_on_purchase_update;
ALTER TABLE public.purchase_logs    ENABLE TRIGGER trg_update_cost_on_purchase;
ALTER TABLE public.purchase_logs    ENABLE TRIGGER trg_purchase_log_correction;
ALTER TABLE public.supplier_catalog ENABLE TRIGGER trg_sc_seed_raw_cost;

-- ──────────────────────────────────────────────────────────────────────────
-- 12. ASSERTIONS — any violation aborts the whole transaction
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE v int;
BEGIN
  -- (a) COST FREEZE: not one cost_per_unit or cost_source may have moved
  SELECT count(*) INTO v FROM public.nomenclature n JOIN tmp_cost_snap s ON s.id=n.id
   WHERE n.cost_per_unit IS DISTINCT FROM s.cost_per_unit;
  IF v > 0 THEN RAISE EXCEPTION '460 ABORT: % nomenclature cost_per_unit value(s) moved', v; END IF;

  SELECT count(*) INTO v FROM public.nomenclature n JOIN tmp_cost_snap s ON s.id=n.id
   WHERE n.cost_source IS DISTINCT FROM s.cost_source;
  IF v > 0 THEN RAISE EXCEPTION '460 ABORT: % cost_source value(s) moved', v; END IF;

  -- (b) nothing created or destroyed
  SELECT count(*) INTO v FROM public.purchase_logs;
  IF v <> (SELECT pl_rows FROM tmp_counts) THEN
    RAISE EXCEPTION '460 ABORT: purchase_logs row count changed (% -> %)', (SELECT pl_rows FROM tmp_counts), v; END IF;
  SELECT count(*) INTO v FROM public.expense_ledger;
  IF v <> (SELECT el_rows FROM tmp_counts) THEN
    RAISE EXCEPTION '460 ABORT: expense_ledger row count changed'; END IF;

  -- (c) no new orphans
  SELECT count(*) INTO v FROM public.purchase_logs WHERE expense_id IS NULL;
  IF v <> 12 THEN RAISE EXCEPTION '460 ABORT: orphan purchase_logs rows = %, expected 12', v; END IF;

  -- (d) the arithmetic rule is now clean, table-wide
  SELECT count(*) INTO v FROM public.purchase_logs
   WHERE abs(COALESCE(quantity,0)*COALESCE(price_per_unit,0) - COALESCE(total_price,0))
         > GREATEST(1, 0.02*abs(COALESCE(total_price,0)));
  IF v > 0 THEN RAISE EXCEPTION '460 ABORT: % row(s) still violate quantity x price = total', v; END IF;

  -- (e) exactly the 6 unreadable dates remain outside 459's window
  SELECT count(*) INTO v FROM public.purchase_logs
   WHERE invoice_date > CURRENT_DATE + 7 OR invoice_date < CURRENT_DATE - INTERVAL '2 years';
  IF v <> 6 THEN RAISE EXCEPTION '460 ABORT: % out-of-window invoice_date(s), expected exactly 6 (spec §3.3)', v; END IF;

  -- (f) the stub population moved by exactly what the map says
  --     415 - 21 merged off stubs - 1 red pepper - 1 banana + 1 water parked on a stub = 393
  SELECT count(*) INTO v FROM public.purchase_logs pl JOIN public.nomenclature n ON n.id=pl.nomenclature_id
   WHERE n.product_code LIKE 'RAW-AUTO-%';
  IF v <> 393 THEN RAISE EXCEPTION '460 ABORT: % rows still on stubs, expected 393 (415 - 21 - 1 - 1 + 1)', v; END IF;

  -- (g) every merged stub is tombstoned and holds no purchase rows
  SELECT count(*) INTO v FROM tmp_merge m JOIN public.nomenclature n ON n.product_code=m.stub_code
   WHERE n.is_deleted = false;
  IF v > 0 THEN RAISE EXCEPTION '460 ABORT: % merged stub(s) not tombstoned', v; END IF;
  SELECT count(*) INTO v FROM public.purchase_logs pl JOIN tmp_resolve r ON r.stub_id = pl.nomenclature_id;
  IF v > 0 THEN RAISE EXCEPTION '460 ABORT: % purchase row(s) still point at a merged stub', v; END IF;

  -- (h) the poisoned catalog rows no longer resolve
  IF EXISTS (SELECT 1 FROM public.supplier_catalog sc JOIN public.nomenclature n ON n.id=sc.nomenclature_id
              WHERE sc.id='6ed27304-6b3a-41d6-9acf-7ecd23bc6270' AND n.product_code='RAW-MORNING-GLORY') THEN
    RAISE EXCEPTION '460 ABORT: the Water -> RAW-MORNING-GLORY catalog row is still live';
  END IF;

  RAISE NOTICE '460 OK: 20 units, 4 repoints, 18 dates, 11 voided, % stubs merged, % junk tombstoned, 4 catalog rows fixed; zero cost drift',
    (SELECT count(*) FROM tmp_merge), (SELECT count(*) FROM tmp_junk);
END $$;

-- ──────────────────────────────────────────────────────────────────────────
-- 13. Self-register (RULE-MIGRATION-TRACKING)
-- ──────────────────────────────────────────────────────────────────────────
INSERT INTO public.migration_log (filename, applied_by, status, notes)
VALUES ('460_purchase_logs_historical_repair.sql', 'claude-opus-session-3b980af6', 'success',
        'MC 00a81c22 item 6, Part A. Normalized 20 bad-unit purchase_logs rows (17 read off the '
     || 'receipt images; quantity only, total_price untouched per mig 390), repointed 4 wrong-item '
     || 'rows, fixed 18 invoice_date rows (13 = one receipt with a mis-OCR''d year), voided 11 '
     || 'orphan rows from a receipt imported twice, merged 18 ladder-confirmed stubs and tombstoned '
     || '13 junk stubs (mig 325 cost-frozen repoint + tombstone), and fixed 4 poisoned '
     || 'supplier_catalog rows that made 459''s matcher assert a wrong canonical. No cost_per_unit '
     || 'changed (in-transaction assert); no WAC recompute. Part B (pack factors, the 365 '
     || 'unresolved stubs, cost_source) is CEO-gated and ships as 461. '
     || 'Spec: docs/projects/admin/plans/spec-purchase-logs-historical-repair.md')
ON CONFLICT DO NOTHING;

COMMIT;

-- ══════════════════════════════════════════════════════════════════════════
-- PART B — NOT IN THIS MIGRATION. The CEO fills these in; they ship as 461.
-- ══════════════════════════════════════════════════════════════════════════
--
-- B1. PACK-FACTOR NORMALIZATION (spec §6.1-§6.2). The stored cost is the plausible
--     number and purchase_logs is the corrupt source: a 100 g pack booked as 1 kg.
--     Fill in `factor`, run, and the WAC recompute reproduces the stored cost instead
--     of destroying it. ⛔ Do NOT run fn_recalc_wac_for_product before this.
--
-- CREATE TEMP TABLE tmp_pack (product_code text PRIMARY KEY, factor numeric, confirmed_by text);
-- INSERT INTO tmp_pack VALUES
--   ('RAW-CARDAMOM',            0.05,  ''),  -- stored 1980/kg vs log 99  -> 50 g pack
--   ('RAW-FENUGREEK',           0.05,  ''),  -- 380 vs 19                 -> 50 g pack
--   ('RAW-ROSEMARY',            0.10,  ''),  -- 750 vs 75                 -> 100 g pack
--   ('RAW-THYME',               0.10,  ''),  -- 968.63 vs 88.63           -> 100 g pack
--   ('RAW-CINNAMON-POWDER',     0.20,  ''),  -- 495 vs 99                 -> 200 g pack
--   ('RAW-NUTMEG',              0.20,  ''),  -- 545 vs 109                -> 200 g pack
--   ('RAW-SALT-SEA',            0.50,  ''),  -- 50 vs 25                  -> 500 g pack
--   ('RAW-SESAME-SEEDS-WHITE',  0.50,  ''),  -- 138 vs 69                 -> 500 g pack
--   ('RAW-RED-KIDNEY-BEANS',    0.50,  ''),  -- 78 vs 39                  -> 500 g pack
--   ('RAW-DRIED-CRANBERRIES',   0.50,  ''),  -- 290 vs 145                -> 500 g pack
--   ('RAW-FLOUR-SEMOLINA',      0.50,  ''),  -- 185.2 vs 92.6             -> 500 g pack
--   ('RAW-PEPPER_WHITE',        0.50,  ''),  -- 430 vs 215                -> 500 g pack
--   ('RAW-MILK-COW',            5.00,  ''),  -- 45.02/L vs 86.46          -> 5 L carton
--   ('RAW-LID_PET_1300',       50.00,  ''),  -- 2.58/pcs vs 129           -> pack of 50
--   ('RAW-BOWL_PAPER_1300',    50.00,  ''),  -- 5.18 vs 259               -> pack of 50
--   ('RAW-LID_PET_750',        50.00,  ''),  -- 2.38 vs 119               -> pack of 50
--   ('RAW-BOWL_PAPER_500',     50.00,  ''),  -- 3.18 vs 159               -> pack of 50
--   ('RAW-TAMARIND-PASTE-SEEDS',400.0, ''),  -- 0.155/g vs 62             -> 400 g pack
--   ('RAW-RICE_PAPER',         25.00,  '');  -- 2.76/pcs vs 69            -> 25-sheet pack (MC 9b091b1f)
--
-- -- UPDATE public.purchase_logs pl SET quantity = pl.quantity * p.factor
-- --   FROM tmp_pack p JOIN public.nomenclature n ON n.product_code = p.product_code
-- --  WHERE pl.nomenclature_id = n.id;
-- --
-- -- THE SAFETY NET — a wrong pack size must never reach cost_per_unit. Only recompute
-- -- WAC for items whose normalized log now AGREES with the hand-set cost:
-- -- DO $$ DECLARE r record; BEGIN
-- --   FOR r IN SELECT n.id, n.product_code, n.cost_per_unit,
-- --                   sum(pl.total_price)/NULLIF(sum(pl.quantity),0) AS log_cost
-- --              FROM public.nomenclature n JOIN public.purchase_logs pl ON pl.nomenclature_id=n.id
-- --             WHERE n.product_code IN (SELECT product_code FROM tmp_pack)
-- --             GROUP BY 1,2,3
-- --   LOOP
-- --     IF abs(r.cost_per_unit - r.log_cost) <= 0.05 * r.log_cost THEN
-- --       PERFORM fn_recalc_wac_for_product(r.id);
-- --     ELSE
-- --       RAISE WARNING '461: % skipped — factor gives %, stored is %', r.product_code, r.log_cost, r.cost_per_unit;
-- --     END IF;
-- --   END LOOP;
-- -- END $$;
--
-- B2. cost_source (spec §6.3). We recommend NOT mass-flipping: once B1 lands, the
--     log agrees with the stored cost and the trigger will not move it. Flip only what
--     must stay frozen regardless of future purchases. Our one recommendation:
-- -- UPDATE public.nomenclature SET cost_source='manual', updated_at=now()
-- --  WHERE product_code = 'RAW-RICE_PAPER';   -- hand-set under MC 9b091b1f
--
-- B3. The 365 unresolved stubs (spec §5.3). The live ladder refuses to guess for them
--     and three secondary exact passes returned zero extra hits, so the map must come
--     from a human. Review surface: docs/projects/admin/plans/data/stub-merge-map.md
--     Expect mostly `promote` (a new RAW-* code keeping the stub's history), not `merge`
--     — only 9 name-groups are duplicates of one another.
