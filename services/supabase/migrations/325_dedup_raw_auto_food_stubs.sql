-- 325 — Dedup RAW-AUTO food/ingredient stubs into canonical nomenclature (MC e9b9e2a3)
--
-- The invoice parser (fn_approve_receipt v15, mig 176) mints a RAW-AUTO-<md5>
-- stub every time it can't match a line to canonical nomenclature. Result:
-- 138 active stubs, heavy duplication (same product spelled many ways).
--
-- This migration consolidates the 122 FOOD/INGREDIENT stubs (16 packaging stubs
-- are handled separately — MC a2013e47; 2 mixed-bundle stubs are left on HOLD).
-- Per CEO decision (B-phased): consolidate the CATALOG now, but FREEZE costs —
-- 74 of the repointed purchase rows are in pack units (pcs/pack/g) that differ
-- from the canonical base unit (kg/L), so letting WAC recompute would distort
-- dish costs. Unit normalization + a reviewed WAC recompute is a SEPARATE pass.
--
-- Actions (data-driven from the embedded map):
--   MERGE      — repoint stub history onto an ACTIVE canonical, tombstone stub
--   REVIVE     — un-delete a soft-deleted curated canonical, then merge into it
--   PROMOTE    — rename the stub itself to a new proper RAW-* code (keeps history)
--   MERGE-NEW  — repoint a sibling onto a code promoted in this same migration
--   TOMBSTONE  — junk with no canonical: tombstone only (history preserved)
--   HOLD       — mixed bundles we cannot split: left untouched
--
-- SAFETY:
--   * 0 of the 138 stubs are referenced by any BOM/recipe/modifier/dish/order
--     (verified pre-migration) → nothing breaks structurally.
--   * COST FREEZE: the WAC/cost-seed triggers are disabled around the repoint so
--     NO canonical cost_per_unit changes; a snapshot+assert proves zero drift —
--     if any nomenclature cost moved, the whole transaction ABORTS.
--   * Nothing is hard-deleted (FK RESTRICT) — merged stubs are tombstoned
--     (is_deleted=true, name prefixed [MERGED->CODE]); fully reversible.
--
-- Reversible: see DOWN block at the tail.

-- ──────────────────────────────────────────────────────────────────────────
-- 0. Snapshot every nomenclature cost (proof surface for the cost-freeze assert)
-- ──────────────────────────────────────────────────────────────────────────
CREATE TEMP TABLE tmp_cost_snap ON COMMIT DROP AS
SELECT id, cost_per_unit, cost_source FROM public.nomenclature;

-- ──────────────────────────────────────────────────────────────────────────
-- 1. The curated map (122 food stubs). action ∈ merge|revive|promote|merge-new|
--    tombstone|hold. target_code = canonical (merge/revive) or NEW code (promote
--    / merge-new) or NULL (tombstone/hold).
-- ──────────────────────────────────────────────────────────────────────────
CREATE TEMP TABLE tmp_dedup_map (stub_code text PRIMARY KEY, action text, target_code text) ON COMMIT DROP;
INSERT INTO tmp_dedup_map (stub_code, action, target_code) VALUES
  ('RAW-AUTO-a129db7c','merge','RAW-HONEY'),('RAW-AUTO-fda47520','merge','RAW-ALMOND_SLICED'),('RAW-AUTO-f7055e57','merge','RAW-CASHEWS'),
  ('RAW-AUTO-58b4fa44','merge','RAW-FLOUR-RICE'),('RAW-AUTO-0c0703d5','merge','RAW-CHEESE-SHREDDED'),('RAW-AUTO-93bad8dd','merge','RAW-FLOUR-RICE'),
  ('RAW-AUTO-7435ddb7','merge','RAW-BANANA'),('RAW-AUTO-48bdb459','merge','RAW-BEETROOT'),('RAW-AUTO-3bf281f0','merge','RAW-PEPPER-BLACK'),
  ('RAW-AUTO-22c35a39','merge','RAW-SESAME-SEEDS-BLACK'),('RAW-AUTO-01055ffe','merge','RAW-CHICKPEAS'),('RAW-AUTO-93acbad2','merge','RAW-CARDAMOM'),
  ('RAW-AUTO-1ae0cab2','merge','RAW-OLIVE-OIL'),('RAW-AUTO-68bc7ac8','merge','RAW-FROZEN-STRAWBERRIES'),('RAW-AUTO-76501587','merge','RAW-CHIA-SEEDS'),
  ('RAW-AUTO-561078e1','merge','RAW-GARLIC-CHINESE'),('RAW-AUTO-def56793','merge','RAW-EGG'),('RAW-AUTO-db59b327','merge','RAW-CUCUMBER'),
  ('RAW-AUTO-1d73b40a','merge','RAW-DILL'),('RAW-AUTO-0da505b3','merge','RAW-OLIVE-OIL'),('RAW-AUTO-229dd9c8','merge','RAW-FENUGREEK'),
  ('RAW-AUTO-b9d1012b','merge','RAW-MUSHROOM-SHIITAKE'),('RAW-AUTO-287b78aa','merge','RAW-MUSHROOM-SHIITAKE'),('RAW-AUTO-d050d240','merge','RAW-FROZEN-BLUEBERRIES'),
  ('RAW-AUTO-f2cfdee2','merge','RAW-LEMON-JUICE'),('RAW-AUTO-ceab8890','merge','RAW-EGGPLANT'),('RAW-AUTO-eee9ce2d','merge','RAW-EGGPLANT'),
  ('RAW-AUTO-3d39d642','merge','RAW-PEPPER-BLACK'),('RAW-AUTO-52a640b3','merge','RAW-CARDAMOM'),('RAW-AUTO-982fbea0','merge','RAW-PEPPER-BLACK'),
  ('RAW-AUTO-ec431c2c','merge','RAW-OREGANO-DRIED'),('RAW-AUTO-93b5f149','merge','RAW-DRIED_PARSLEY'),('RAW-AUTO-ff1cad38','merge','RAW-CABBAGE'),
  ('RAW-AUTO-d6eee26c','merge','RAW-EGG'),('RAW-AUTO-fbd884f6','merge','RAW-ICE_CUBES'),('RAW-AUTO-37edb1af','merge','RAW-FLOUR-WW'),
  ('RAW-AUTO-5599424f','merge','RAW-CARROT'),('RAW-AUTO-2a04f2d1','merge','RAW-POTATO'),('RAW-AUTO-bb545572','merge','RAW-RED_CABBAGE'),
  ('RAW-AUTO-268d573c','merge','RAW-RED_ONION'),('RAW-AUTO-c3d7e064','merge','RAW-COCONUT-OIL'),('RAW-AUTO-c54e9674','merge','RAW-TOMATO'),
  ('RAW-AUTO-85e1f173','merge','RAW-TOMATO'),('RAW-AUTO-bc782a08','merge','RAW-MILK-COW'),('RAW-AUTO-a68be7f4','merge','RAW-CHEESE-PARMESAN'),
  ('RAW-AUTO-59f9fc7a','merge','RAW-MILK-FRESH'),('RAW-AUTO-6e86172c','merge','RAW-YOGURT-GREEK'),('RAW-AUTO-fb3db6cc','merge','RAW-YOGURT-GREEK'),
  ('RAW-AUTO-8a1ff39e','merge','RAW-MINT-LEAVES'),('RAW-AUTO-ca59d11c','merge','RAW-MINT-LEAVES'),('RAW-AUTO-0d047248','merge','RAW-COCONUT-OIL'),
  ('RAW-AUTO-ea684bc2','merge','RAW-ORANGE'),('RAW-AUTO-326ea2b4','merge','RAW-NUTMEG'),('RAW-AUTO-19f0d3f1','merge','RAW-EGG'),
  ('RAW-AUTO-e7927785','merge','RAW-PINEAPPLE'),('RAW-AUTO-365e615a','merge','RAW-POTATO'),('RAW-AUTO-7ce034c9','merge','RAW-POTATO'),
  ('RAW-AUTO-b6a6056d','merge','RAW-QUINOA'),('RAW-AUTO-dcfa7293','merge','RAW-BELL-PEPPER-RED'),('RAW-AUTO-d7252d9b','merge','RAW-BELL-PEPPER-RED'),
  ('RAW-AUTO-e46cd4fc','merge','RAW-BELL-PEPPER-RED'),('RAW-AUTO-69ed13de','merge','RAW-GOOSEBERRY-CAPE'),('RAW-AUTO-c3e5dd56','merge','RAW-SPRING-ONION'),
  ('RAW-AUTO-0d07da08','merge','RAW-CHEESE-PARMESAN'),('RAW-AUTO-de831c8a','merge','RAW-TOMATO'),('RAW-AUTO-de50c44f','merge','RAW-WATER-DRINKING'),
  ('RAW-AUTO-64f123d1','merge','RAW-SALT-SEA-COARSE'),('RAW-AUTO-6c429b0f','merge','RAW-POTATO'),('RAW-AUTO-92918bed','merge','RAW-SPRING-ONION'),
  ('RAW-AUTO-ec9b9ced','merge','RAW-POTATO'),('RAW-AUTO-e639c137','merge','RAW-THYME'),('RAW-AUTO-819b8ac7','merge','RAW-THYME'),
  ('RAW-AUTO-a2fb44f9','merge','RAW-TOMATO'),('RAW-AUTO-720527fc','merge','RAW-TOMATO'),('RAW-AUTO-827aba0d','merge','RAW-PINEAPPLE'),
  ('RAW-AUTO-9b2e01ad','merge','RAW-COCOA-POWDER'),('RAW-AUTO-ad4b881f','merge','RAW-WALNUTS'),('RAW-AUTO-61aa7c04','merge','RAW-SESAME-SEEDS-WHITE'),
  ('RAW-AUTO-ab51ca37','merge','RAW-GINGER'),
  ('RAW-AUTO-ac8b14a9','revive','RAW-CHEESE-MOZZARELLA'),('RAW-AUTO-7e8135d3','revive','RAW-CHEESE-MOZZARELLA'),('RAW-AUTO-aa077627','revive','RAW-CHEESE-MOZZARELLA'),
  ('RAW-AUTO-0fa8792e','revive','RAW-STARCH-TAPIOCA'),('RAW-AUTO-caab7397','revive','RAW-BASIL'),('RAW-AUTO-2b4ce438','revive','RAW-CELERY'),
  ('RAW-AUTO-f777765b','revive','RAW-CURRY-POWDER'),('RAW-AUTO-9e1bbb0f','revive','RAW-CURRY-POWDER'),('RAW-AUTO-d32ecf6a','revive','RAW-CURRY-POWDER'),
  ('RAW-AUTO-4140984e','revive','RAW-FROZEN-RASPBERRIES'),('RAW-AUTO-a29c1868','revive','RAW-GALANGAL'),('RAW-AUTO-96e5d896','revive','RAW-GREEN-BEANS'),
  ('RAW-AUTO-907fb0d9','revive','RAW-KAFFIR-LIME-LEAVES'),('RAW-AUTO-2c4654f8','revive','RAW-MAPLE-SYRUP'),('RAW-AUTO-5e468487','revive','RAW-CHEESE-FETA'),
  ('RAW-AUTO-06ee8ae3','revive','RAW-ROSEMARY'),('RAW-AUTO-44208be3','revive','RAW-SWEET-POTATO'),('RAW-AUTO-6cd46e72','revive','RAW-SWEET-POTATO'),
  ('RAW-AUTO-c9585068','revive','RAW-PEA-GREEN'),
  ('RAW-AUTO-433ed2b9','promote','RAW-CUMIN-SEEDS'),('RAW-AUTO-a0757515','merge-new','RAW-CUMIN-SEEDS'),
  ('RAW-AUTO-2da9ddf3','promote','RAW-SHALLOT'),
  ('RAW-AUTO-87bf2fba','promote','RAW-LIME-FRESH'),('RAW-AUTO-b6d808ea','merge-new','RAW-LIME-FRESH'),
  ('RAW-AUTO-e8bb74e4','promote','RAW-JAM-STRAWBERRY'),('RAW-AUTO-63062ac9','promote','RAW-RICE-WHITE'),
  ('RAW-AUTO-77386104','promote','RAW-CHILI-BIRDSEYE-GREEN'),('RAW-AUTO-e7c87891','promote','RAW-KAFFIR-LIME'),
  ('RAW-AUTO-4f5c7176','promote','RAW-FLOUR-BREAD-WHITESWAN'),('RAW-AUTO-e01b5978','merge-new','RAW-FLOUR-BREAD-WHITESWAN'),
  ('RAW-AUTO-00cda047','promote','RAW-BUTTER-SALTED'),('RAW-AUTO-385517f9','promote','RAW-JUICE-PINEAPPLE'),
  ('RAW-AUTO-4d3109c0','promote','RAW-BEEF-MINCE-WAGYU'),('RAW-AUTO-3fac605a','merge-new','RAW-BEEF-MINCE-WAGYU'),
  ('RAW-AUTO-5d05f038','promote','RAW-BEEF-MINCE-BRAHMAN'),
  ('RAW-AUTO-8547deb8','tombstone',NULL),('RAW-AUTO-6fb4bbeb','tombstone',NULL),('RAW-AUTO-6dd0424e','tombstone',NULL),
  ('RAW-AUTO-3245327b','tombstone',NULL),('RAW-AUTO-83bf4ed0','tombstone',NULL),('RAW-AUTO-4cec0b11','tombstone',NULL),
  ('RAW-AUTO-4c67bfd3','hold',NULL),('RAW-AUTO-d9fbec5a','hold',NULL);

-- ──────────────────────────────────────────────────────────────────────────
-- 2. Pre-flight validation — abort early on any mismatch
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE v_bad int;
BEGIN
  -- every map stub must be an ACTIVE RAW-AUTO row
  SELECT count(*) INTO v_bad FROM tmp_dedup_map m
  WHERE NOT EXISTS (SELECT 1 FROM public.nomenclature n
                    WHERE n.product_code=m.stub_code AND n.is_deleted=false);
  IF v_bad > 0 THEN RAISE EXCEPTION '325: % map stub(s) are not active RAW-AUTO rows', v_bad; END IF;

  -- merge targets must exist & be ACTIVE
  SELECT count(*) INTO v_bad FROM tmp_dedup_map m
  WHERE m.action='merge' AND NOT EXISTS (SELECT 1 FROM public.nomenclature n
       WHERE n.product_code=m.target_code AND n.is_deleted=false);
  IF v_bad > 0 THEN RAISE EXCEPTION '325: % merge target(s) missing/not active', v_bad; END IF;

  -- revive targets must exist & be SOFT-DELETED
  SELECT count(*) INTO v_bad FROM tmp_dedup_map m
  WHERE m.action='revive' AND NOT EXISTS (SELECT 1 FROM public.nomenclature n
       WHERE n.product_code=m.target_code AND n.is_deleted=true);
  IF v_bad > 0 THEN RAISE EXCEPTION '325: % revive target(s) missing/not soft-deleted', v_bad; END IF;

  -- promote codes must be FREE
  SELECT count(*) INTO v_bad FROM tmp_dedup_map m
  WHERE m.action='promote' AND EXISTS (SELECT 1 FROM public.nomenclature n WHERE n.product_code=m.target_code);
  IF v_bad > 0 THEN RAISE EXCEPTION '325: % promote code(s) already taken', v_bad; END IF;
END $$;

-- ──────────────────────────────────────────────────────────────────────────
-- 3. COST FREEZE — disable the WAC / cost-seed triggers so the repoint cannot
--    move any canonical cost_per_unit (DDL is transactional: a rollback
--    restores them automatically).
-- ──────────────────────────────────────────────────────────────────────────
ALTER TABLE public.purchase_logs  DISABLE TRIGGER trg_recalc_wac_on_purchase_update;
ALTER TABLE public.purchase_logs  DISABLE TRIGGER trg_update_cost_on_purchase;
ALTER TABLE public.purchase_logs  DISABLE TRIGGER trg_purchase_log_correction;
ALTER TABLE public.supplier_catalog DISABLE TRIGGER trg_sc_seed_raw_cost;

-- 4. REVIVE the 13 soft-deleted curated canonicals
UPDATE public.nomenclature n
SET is_deleted=false, is_available=true, updated_at=now()
WHERE n.product_code IN (SELECT DISTINCT target_code FROM tmp_dedup_map WHERE action='revive')
  AND n.is_deleted=true;

-- 5. PROMOTE — rename the stub itself to its new canonical code (keeps history)
UPDATE public.nomenclature n
SET product_code=m.target_code, is_available=true, type='raw_ingredient', updated_at=now()
FROM tmp_dedup_map m
WHERE m.action='promote' AND n.product_code=m.stub_code;

-- 6. Resolve stub→target ids for every repoint action (merge/revive/merge-new).
--    merge-new targets resolve to the just-promoted rows.
CREATE TEMP TABLE tmp_resolve ON COMMIT DROP AS
SELECT s.id AS stub_id, t.id AS target_id, m.action, m.target_code
FROM tmp_dedup_map m
JOIN public.nomenclature s ON s.product_code = m.stub_code
JOIN public.nomenclature t ON t.product_code = m.target_code
WHERE m.action IN ('merge','revive','merge-new');

-- 7. REPOINT all meaningful history from stub → canonical
UPDATE public.purchase_logs      x SET nomenclature_id=r.target_id FROM tmp_resolve r WHERE x.nomenclature_id=r.stub_id;
UPDATE public.receiving_lines     x SET nomenclature_id=r.target_id FROM tmp_resolve r WHERE x.nomenclature_id=r.stub_id;
UPDATE public.supplier_catalog    x SET nomenclature_id=r.target_id FROM tmp_resolve r WHERE x.nomenclature_id=r.stub_id;
UPDATE public.inventory_batches   x SET nomenclature_id=r.target_id FROM tmp_resolve r WHERE x.nomenclature_id=r.stub_id;
UPDATE public.stock_movements     x SET nomenclature_id=r.target_id FROM tmp_resolve r WHERE x.nomenclature_id=r.stub_id;
UPDATE public.stocktake_entries   x SET nomenclature_id=r.target_id FROM tmp_resolve r WHERE x.nomenclature_id=r.stub_id;
UPDATE public.sku                 x SET nomenclature_id=r.target_id FROM tmp_resolve r WHERE x.nomenclature_id=r.stub_id;
UPDATE public.sku_balances        x SET nomenclature_id=r.target_id FROM tmp_resolve r WHERE x.nomenclature_id=r.stub_id;
UPDATE public.waste_logs          x SET nomenclature_id=r.target_id FROM tmp_resolve r WHERE x.nomenclature_id=r.stub_id;
UPDATE public.shopping_list_items x SET nomenclature_id=r.target_id FROM tmp_resolve r WHERE x.nomenclature_id=r.stub_id;
UPDATE public.stock_request_lines x SET nomenclature_id=r.target_id FROM tmp_resolve r WHERE x.nomenclature_id=r.stub_id;
UPDATE public.po_lines            x SET nomenclature_id=r.target_id FROM tmp_resolve r WHERE x.nomenclature_id=r.stub_id;
UPDATE public.unmatched_items     x SET resolved_to=r.target_id    FROM tmp_resolve r WHERE x.resolved_to=r.stub_id;
UPDATE public.unmatched_items     x SET suggested_match=r.target_id FROM tmp_resolve r WHERE x.suggested_match=r.stub_id;

-- 8. TOMBSTONE the merged-in stubs ([MERGED->CODE]) and the junk ([JUNK-NO-MATCH]).
--    HOLD rows are intentionally left untouched.
UPDATE public.nomenclature n
SET is_deleted=true, is_available=false,
    name='[MERGED->'||m.target_code||'] '||n.name, updated_at=now()
FROM tmp_dedup_map m
WHERE m.action IN ('merge','revive','merge-new') AND n.product_code=m.stub_code AND n.is_deleted=false;

UPDATE public.nomenclature n
SET is_deleted=true, is_available=false,
    name='[JUNK-NO-MATCH] '||n.name, updated_at=now()
FROM tmp_dedup_map m
WHERE m.action='tombstone' AND n.product_code=m.stub_code AND n.is_deleted=false;

-- 9. Re-enable the cost triggers
ALTER TABLE public.purchase_logs  ENABLE TRIGGER trg_recalc_wac_on_purchase_update;
ALTER TABLE public.purchase_logs  ENABLE TRIGGER trg_update_cost_on_purchase;
ALTER TABLE public.purchase_logs  ENABLE TRIGGER trg_purchase_log_correction;
ALTER TABLE public.supplier_catalog ENABLE TRIGGER trg_sc_seed_raw_cost;

-- ──────────────────────────────────────────────────────────────────────────
-- 10. ASSERTIONS — abort the whole transaction on any violation
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE v_drift int; v_left int; v_active_auto int;
BEGIN
  -- (a) COST FREEZE proof: no nomenclature cost may differ from the snapshot
  SELECT count(*) INTO v_drift
  FROM public.nomenclature n JOIN tmp_cost_snap s ON s.id=n.id
  WHERE n.cost_per_unit IS DISTINCT FROM s.cost_per_unit;
  IF v_drift > 0 THEN
    RAISE EXCEPTION '325 ABORT: % nomenclature cost(s) drifted — dish costs would move', v_drift;
  END IF;

  -- (b) every non-hold map stub must no longer be an active RAW-AUTO row
  SELECT count(*) INTO v_left
  FROM tmp_dedup_map m JOIN public.nomenclature n ON n.product_code=m.stub_code
  WHERE m.action<>'hold' AND n.product_code ILIKE 'RAW-AUTO-%' AND n.is_deleted=false;
  IF v_left > 0 THEN
    RAISE EXCEPTION '325 ABORT: % processed stub(s) still active RAW-AUTO', v_left;
  END IF;

  -- (c) remaining active RAW-AUTO must be only the 16 packaging + 2 hold = 18
  SELECT count(*) INTO v_active_auto
  FROM public.nomenclature WHERE product_code ILIKE 'RAW-AUTO-%' AND is_deleted=false;
  IF v_active_auto <> 18 THEN
    RAISE EXCEPTION '325 ABORT: expected 18 active RAW-AUTO left (16 packaging + 2 hold), found %', v_active_auto;
  END IF;

  RAISE NOTICE '325 OK: 0 cost drift, 120 stubs consolidated, % active RAW-AUTO remain (packaging+hold)', v_active_auto;
END $$;

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '325_dedup_raw_auto_food_stubs.sql',
  'claude-code',
  NULL,
  'Dedup 122 RAW-AUTO food stubs (MC e9b9e2a3): 79 merge + 19 revive + 12 promote + 4 merge-new + 6 tombstone + 2 hold. Cost-FROZEN (WAC triggers disabled around repoint; asserts 0 cost drift). 0 BOM refs → dishes untouched. Packaging split=MC a2013e47; unit-normalization+WAC recompute = follow-up.'
)
ON CONFLICT DO NOTHING;

-- DOWN (manual, for reference — reversal is non-trivial; rely on the txn + asserts):
--   Reviving/promoting/repointing/tombstoning are individually reversible:
--   1) restore tombstoned stubs: UPDATE nomenclature SET is_deleted=false,
--      is_available=true, name = regexp_replace(name,'^\[(MERGED->[^]]+|JUNK-NO-MATCH)\] ','')
--      WHERE product_code ILIKE 'RAW-AUTO-%' AND name ~ '^\[';
--   2) re-point history back from canonical to stub (requires the original
--      stub_id per row — recover from purchase_logs.notes / receiving history);
--   3) un-promote: rename RAW-CUMIN-SEEDS/.../RAW-BEEF-MINCE-* back to RAW-AUTO-*;
--   4) re-soft-delete the 13 revived codes.
--   Practically: restore from PITR backup if a full reversal is needed.
