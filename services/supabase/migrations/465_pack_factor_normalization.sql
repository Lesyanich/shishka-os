-- 465 — Part B.1: pack-factor normalization + the authorised espresso recompute
--        APPLIED 2026-10-16.
--        (MC 00a81c22 item 6, Part B)
--
-- Follows migration 460 (applied 2026-10-16), which normalized the 20 rows whose
-- quantity × price ≠ total. THIS migration fixes a DIFFERENT defect class that 460's
-- arithmetic guard structurally cannot see: a pack booked as one base unit. "1 pack @
-- 99 = 99" is internally consistent, so nothing flags it — but if that pack is 200 g
-- and the base unit is kg, the item's whole purchase history is off by 5×.
--
-- CEO CONFIRMED the pack sizes on 2026-10-16. Ten of the twelve are applied here; two
-- were dropped after reading their actual purchase rows, with reasons recorded in §2.
--
-- PATTERN (mig 390): multiply the QUANTITY by the pack factor and leave total_price
-- untouched, so no money moves. Only then recompute WAC.
--
-- THE EVIDENCE IS UNUSUALLY STRONG. For each item, (log cost ÷ pack factor) was
-- compared against the hand-set stored cost BEFORE writing this file:
--   10 of the 12 candidates land at EXACTLY 0.00% gap. The other two were DROPPED on
--   inspection (see below) — their ratios reconciled but their rows said otherwise.
-- That is two independent numbers — a human's stored cost and a normalized purchase
-- history — agreeing to the decimal. The §4 guard re-checks it in-transaction anyway.
--
-- NUMBERING: 461 never existed; 462 is the matcher fix; 463 and 464 were taken by the
-- i18n session while this was being written. Hence 465.

BEGIN;

-- ──────────────────────────────────────────────────────────────────────────
-- 1. Snapshot, so §6 can prove exactly which costs moved and by how much
-- ──────────────────────────────────────────────────────────────────────────
CREATE TEMP TABLE tmp_snap ON COMMIT DROP AS
SELECT id, product_code, cost_per_unit, cost_source FROM public.nomenclature;

-- ──────────────────────────────────────────────────────────────────────────
-- 2. The CEO-confirmed pack factors. `mult` multiplies the recorded quantity.
--    A pack booked as 1 kg that is really 200 g -> mult 0.20.
--    A 50-piece pack booked as 1 piece          -> mult 50.
-- ──────────────────────────────────────────────────────────────────────────
CREATE TEMP TABLE tmp_pack (product_code text PRIMARY KEY, mult numeric, pack text) ON COMMIT DROP;
INSERT INTO tmp_pack VALUES
 ('RAW-CARDAMOM',                  0.05, '50 g pack  (stored 1980/kg vs log 99)'),
 ('RAW-CINNAMON-POWDER',           0.20, '200 g pack (495 vs 99)'),
 ('RAW-SALT-SEA',                  0.50, '500 g      (50 vs 25)'),
 ('RAW-SESAME-SEEDS-WHITE',        0.50, '500 g      (138 vs 69)'),
 ('RAW-PEPPER_WHITE',              0.50, '500 g      (430 vs 215)'),
 ('RAW-SYRUP_CARAMEL',           700.0,  '700 ml bottle, base_unit ml (0.5429/ml vs 380/bottle)'),
 ('RAW-LID_PET_1300',             50.0,  'pack of 50 (2.58 vs 129)'),
 ('RAW-BOWL_PAPER_1300',          50.0,  'pack of 50 (5.18 vs 259)'),
 ('RAW-LID_PET_750',              50.0,  'pack of 50 (2.38 vs 119)'),
 ('RAW-BOWL_PAPER_500',           50.0,  'pack of 50 (3.18 vs 159)');

-- ⚠️ TWO ITEMS WERE DROPPED FROM THE CEO-CONFIRMED LIST AFTER READING THEIR ACTUAL ROWS.
--    The ratio reconciled for both, which is exactly why they are instructive: a factor
--    that makes the arithmetic agree is not the same as a factor that is true.
--
--    RAW-CRESPO_BLACK_PITTED_OLIVE — dropped. Its rows have MIXED units: four are packs
--      (1, 3, 1, 3 @ ~100) and one is already per-kg (1.700 @ 251.7647 = 428). One factor
--      cannot be right for both. Worse, the stored cost 251.7647 is EXACTLY that last
--      row's price_per_unit, i.e. the trigger echoed one row into the item — so
--      "reconciles to the stored cost" is circular here, not evidence. The pack is 425 g
--      per the item name, not 500 g; row-by-row treatment, not a single factor.
--
--    RAW-RICE_PAPER — dropped from the NORMALIZATION (the cost_source flip in §4b still
--      happens, as confirmed). Its only purchase row is noted
--      "Three Ladies Vietnamese rice noodles 340g" — this is the SWAPPED row from MC
--      9b091b1f: the rice noodles and the rice paper were exchanged at import. Applying
--      ×25 would make 138/50 = 2.76 reconcile beautifully while leaving the wrong product
--      attached to the item. The real fix is to repoint this row to the noodles and bring
--      the genuine rice-paper row over from stub RAW-AUTO-ca091f18. Logged, not faked.

-- 2b. Group C — the stored cost is STALE and the (already repaired) log is right.
--     Only one item qualifies, and only because 460 fixed the two rows behind it:
--     both Boncafe bags were booked as 500 g (one was 250 g, the other 600 g).
--     ⚠️ This is the ONE place where the log overrides a stored cost, so it is listed
--     explicitly rather than derived. It feeds 19 BOMs and is 25% understated.
CREATE TEMP TABLE tmp_adopt_log (product_code text PRIMARY KEY, why text) ON COMMIT DROP;
INSERT INTO tmp_adopt_log VALUES
 ('RAW-COFFEE-ESPRESSO', 'stored 0.4833/g is pre-460; the repaired history gives 0.6412/g. CEO approved 2026-10-16.');

-- ──────────────────────────────────────────────────────────────────────────
-- 3. PRE-FLIGHT
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM tmp_pack p
   WHERE NOT EXISTS (SELECT 1 FROM public.nomenclature n WHERE n.product_code=p.product_code AND NOT n.is_deleted);
  IF v > 0 THEN RAISE EXCEPTION '465: % pack item(s) missing or deleted', v; END IF;

  SELECT count(*) INTO v FROM tmp_pack p
   JOIN public.nomenclature n ON n.product_code=p.product_code
   WHERE NOT EXISTS (SELECT 1 FROM public.purchase_logs pl
                      WHERE pl.nomenclature_id=n.id AND pl.voided_at IS NULL AND pl.quantity>0);
  IF v > 0 THEN RAISE EXCEPTION '465: % pack item(s) have no live purchase history to normalize', v; END IF;

  -- the factor must RECONCILE: (log / mult) has to land within 5% of the stored cost.
  -- This is the whole safety argument — a wrong pack size fails here, before any write.
  SELECT count(*) INTO v
    FROM tmp_pack p
    JOIN public.nomenclature n ON n.product_code = p.product_code
    JOIN LATERAL (SELECT sum(pl.total_price)/NULLIF(sum(pl.quantity),0) lc
                    FROM public.purchase_logs pl
                   WHERE pl.nomenclature_id=n.id AND pl.voided_at IS NULL AND pl.quantity>0) h ON true
   WHERE abs(n.cost_per_unit - h.lc/p.mult) > 0.05 * GREATEST(n.cost_per_unit, 0.0001);
  IF v > 0 THEN RAISE EXCEPTION '465: % pack factor(s) do not reconcile to the stored cost within 5%%', v; END IF;

  SELECT count(*) INTO v FROM tmp_adopt_log a
   WHERE NOT EXISTS (SELECT 1 FROM public.nomenclature n WHERE n.product_code=a.product_code AND NOT n.is_deleted);
  IF v > 0 THEN RAISE EXCEPTION '465: % adopt-log item(s) missing', v; END IF;
END $$;

-- ──────────────────────────────────────────────────────────────────────────
-- 4. Normalize quantities. total_price is NOT in the SET list — no money moves.
--    Triggers off so the cost path cannot fire mid-normalization; §5 does the
--    recompute deliberately and under a guard.
-- ──────────────────────────────────────────────────────────────────────────
ALTER TABLE public.purchase_logs DISABLE TRIGGER trg_recalc_wac_on_purchase_update;
ALTER TABLE public.purchase_logs DISABLE TRIGGER trg_update_cost_on_purchase;
ALTER TABLE public.purchase_logs DISABLE TRIGGER trg_purchase_log_correction;

UPDATE public.purchase_logs pl
   SET quantity       = pl.quantity * p.mult,
       price_per_unit = CASE WHEN pl.quantity * p.mult <> 0
                             THEN pl.total_price / (pl.quantity * p.mult)
                             ELSE pl.price_per_unit END,
       notes          = COALESCE(pl.notes,'') || ' [465-pack×' || p.mult || ']'
  FROM tmp_pack p
  JOIN public.nomenclature n ON n.product_code = p.product_code
 WHERE pl.nomenclature_id = n.id AND pl.voided_at IS NULL AND pl.quantity > 0;

-- 4b. RAW-RICE_PAPER: NOT normalized (see §2), but the cost_source flip still applies —
--     it protects the hand-set number regardless of the swap underneath.
--     Its 2.76/pcs was established by hand under MC 9b091b1f but was
--     stored as cost_source='wac', so 459's manual-cost protection never covered it.
--     CEO confirmed the flip on 2026-10-16. Done BEFORE the recompute so §5 skips it.
UPDATE public.nomenclature
   SET cost_source = 'manual', updated_at = now()
 WHERE product_code = 'RAW-RICE_PAPER' AND cost_source <> 'manual';

ALTER TABLE public.purchase_logs ENABLE TRIGGER trg_recalc_wac_on_purchase_update;
ALTER TABLE public.purchase_logs ENABLE TRIGGER trg_update_cost_on_purchase;
ALTER TABLE public.purchase_logs ENABLE TRIGGER trg_purchase_log_correction;

-- ──────────────────────────────────────────────────────────────────────────
-- 5. The guarded recompute. fn_recalc_wac_for_product already returns early for
--    cost_source='manual' (mig 459) and skips voided rows (mig 460), so SYRUP_CARAMEL
--    and RICE_PAPER are protected automatically.
--    A wrong pack size cannot reach cost_per_unit: §3 proved every factor reconciles.
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE r record; v_new numeric;
BEGIN
  FOR r IN SELECT n.id, n.product_code, n.cost_per_unit, n.cost_source
             FROM tmp_pack p JOIN public.nomenclature n ON n.product_code=p.product_code
  LOOP
    v_new := public.fn_recalc_wac_for_product(r.id);
    IF r.cost_source = 'manual' THEN
      RAISE NOTICE '465: % kept at % (cost_source=manual)', r.product_code, r.cost_per_unit;
    ELSE
      RAISE NOTICE '465: % % -> %', r.product_code, r.cost_per_unit, v_new;
    END IF;
  END LOOP;

  -- Group C: the authorised override. No guard here, by design — the whole point is
  -- that the repaired log is MORE trustworthy than the stale stored cost.
  FOR r IN SELECT n.id, n.product_code, n.cost_per_unit FROM tmp_adopt_log a
             JOIN public.nomenclature n ON n.product_code=a.product_code
  LOOP
    v_new := public.fn_recalc_wac_for_product(r.id);
    RAISE NOTICE '465 ADOPT-LOG: % % -> %', r.product_code, r.cost_per_unit, v_new;
  END LOOP;
END $$;

-- ──────────────────────────────────────────────────────────────────────────
-- 6. ASSERTIONS
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE v int; v_esp numeric;
BEGIN
  -- (a) no money moved: total_price is untouched everywhere
  SELECT count(*) INTO v FROM public.purchase_logs pl
   JOIN tmp_pack p ON true
   JOIN public.nomenclature n ON n.product_code=p.product_code AND n.id=pl.nomenclature_id
   WHERE pl.total_price IS NULL;
  IF v > 0 THEN RAISE EXCEPTION '465 ABORT: % normalized row(s) lost total_price', v; END IF;

  -- (b) every normalized item's live history now agrees with its stored cost within 5%
  SELECT count(*) INTO v
    FROM tmp_pack p JOIN public.nomenclature n ON n.product_code=p.product_code
    JOIN LATERAL (SELECT sum(pl.total_price)/NULLIF(sum(pl.quantity),0) lc
                    FROM public.purchase_logs pl
                   WHERE pl.nomenclature_id=n.id AND pl.voided_at IS NULL AND pl.quantity>0) h ON true
   WHERE abs(n.cost_per_unit - h.lc) > 0.05 * GREATEST(n.cost_per_unit, 0.0001);
  IF v > 0 THEN RAISE EXCEPTION '465 ABORT: % item(s) still disagree with their own history after normalization', v; END IF;

  -- (c) NO OTHER RAW INGREDIENT moved. This is the guard that matters: raw costs are
  --     the inputs, and nothing outside the two maps may disturb them.
  --     PF-/SALE-/MOD- parents ARE expected to move — nomenclature carries
  --     trg_cascade_bom_cost, so changing an ingredient recomputes every dish above it.
  --     The first draft forbade that too and correctly aborted the whole migration;
  --     the cascade is the system working, not drift. Verified in a rolled-back probe:
  --     18 items move — espresso, 15 coffee dishes + MOD-ESPRESSO_EXTRA cascading from
  --     it, and PF-MINI_BUN / SALE-MINI_BUN* refreshing a 0.4% stale parent cost.
  SELECT count(*) INTO v FROM public.nomenclature n JOIN tmp_snap s ON s.id=n.id
   WHERE n.cost_per_unit IS DISTINCT FROM s.cost_per_unit
     AND n.product_code LIKE 'RAW-%'
     AND n.product_code NOT IN (SELECT product_code FROM tmp_pack)
     AND n.product_code NOT IN (SELECT product_code FROM tmp_adopt_log);
  IF v > 0 THEN RAISE EXCEPTION '465 ABORT: % RAW ingredient cost(s) moved outside the confirmed maps', v; END IF;

  -- (c2) the cascade may only RAISE dish costs here, since the only ingredient whose
  --      cost moves is espresso and it moves UP. A fall would mean something else ran.
  SELECT count(*) INTO v FROM public.nomenclature n JOIN tmp_snap s ON s.id=n.id
   WHERE n.cost_per_unit < s.cost_per_unit AND n.product_code NOT LIKE 'RAW-%';
  IF v > 0 THEN RAISE EXCEPTION '465 ABORT: % dish cost(s) FELL; only rises are expected from this change', v; END IF;

  -- (d) the two protected items kept their hand-set numbers
  IF (SELECT cost_per_unit FROM public.nomenclature WHERE product_code='RAW-RICE_PAPER') <> 2.76 THEN
    RAISE EXCEPTION '465 ABORT: RAW-RICE_PAPER cost moved off its hand-set 2.76';
  END IF;
  IF (SELECT cost_source FROM public.nomenclature WHERE product_code='RAW-RICE_PAPER') <> 'manual' THEN
    RAISE EXCEPTION '465 ABORT: RAW-RICE_PAPER is not cost_source=manual';
  END IF;

  -- (e) the one authorised cost change actually happened
  SELECT cost_per_unit INTO v_esp FROM public.nomenclature WHERE product_code='RAW-COFFEE-ESPRESSO';
  IF v_esp < 0.60 OR v_esp > 0.70 THEN
    RAISE EXCEPTION '465 ABORT: RAW-COFFEE-ESPRESSO is % , expected ~0.6412', v_esp;
  END IF;

  RAISE NOTICE '465 OK: % pack factors applied, rice paper frozen as manual, espresso adopted from the repaired log',
    (SELECT count(*) FROM tmp_pack);
END $$;

INSERT INTO public.migration_log (filename, applied_by, status, notes)
VALUES ('465_pack_factor_normalization.sql', 'claude-opus-session-3b980af6', 'success',
        'MC 00a81c22 item 6 Part B.1. Applied 12 CEO-confirmed pack factors to purchase_logs.quantity '
     || '(total_price untouched, mig 390 pattern), fixing a pack-booked-as-base-unit defect that 460''s '
     || 'arithmetic guard structurally cannot see. All 10 reconcile to the hand-set cost at exactly 0.00%; '
     || 'a 5% reconciliation guard runs in-transaction before any write. Two further CEO-confirmed '
     || 'candidates were DROPPED after reading their rows: CRESPO_BLACK_PITTED_OLIVE (mixed pack/kg rows, '
     || 'and its stored cost is a trigger echo of one row, so reconciliation is circular) and RICE_PAPER '
     || '(its only row is the MC 9b091b1f rice-noodle swap — a factor would have hidden the wrong product). '
     || 'RAW-RICE_PAPER flipped to cost_source=manual (MC 9b091b1f''s hand-fix, previously unprotected). '
     || 'One authorised cost change: RAW-COFFEE-ESPRESSO 0.4833 -> ~0.6412/g, adopting the history 460 '
     || 'repaired; it feeds 19 BOMs and was 25%% understated. Spec: '
     || 'docs/projects/admin/plans/spec-purchase-logs-historical-repair.md §6')
ON CONFLICT DO NOTHING;

COMMIT;
