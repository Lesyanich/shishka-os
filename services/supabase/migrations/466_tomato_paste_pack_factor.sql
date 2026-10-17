-- 466 — Part B.1 addendum: the tomato-paste pack factor (MC 00a81c22 item 6)
--        APPLIED 2026-10-16 on CEO instruction.
--
-- One row, and it should have been in migration 465. I triaged it into the
-- "ratio doesn't land on a pack size" bucket because the ratio is 2.500 — but
-- 1 / 2.5 = 0.4, and a 400 g can is a standard size. My reading error, not a
-- gap in the data: RAW-TOMATO-PASTE was in the drift table all along.
-- Surfaced by the session that wrote 462 while sweeping for catalog rows
-- pointing at a live-but-semantically-wrong canonical.
--
-- THE ROW
--   RAW-TOMATO-PASTE, its ONLY purchase row:
--   quantity 1 · price 86 · total 86 · barcode 3229755207976 · 2026-05-04
--   notes "Fine Tomato Puree 400g"
--   A 400 g can booked as quantity = 1. It predates 459, so the catalog's
--   conversion_factor was never applied at import — the exact structural
--   failure 459 fixed going forward.
--
-- WHY THIS NEEDS NO PACK-SIZE JUDGEMENT. Unlike 465's twelve candidates, the
-- pack size here is not inferred from the ratio at all: supplier_catalog row
-- 18c2d6d7 carries conversion_factor = 0.400000 for this exact barcode. That is
-- independent, recorded evidence. And 86 / 0.4 = 215.0000, which is EXACTLY the
-- stored cost today — so this migration moves no cost whatsoever.
--
-- 460's arithmetic guard cannot see this class: 1 × 86 = 86 reconciles perfectly.
-- Only the UNIT is wrong.
--
-- A NOTE FOR WHOEVER READS THIS LATER, recorded deliberately:
-- RAW-TOMATO-PASTE is now priced from a PURÉE can. Purée and paste are different
-- concentrations (~8-12% vs ~28-30% solids) and real paste is normally dearer per
-- kg. The CEO decided on 2026-10-16 to keep purée under RAW-TOMATO-PASTE rather
-- than create RAW-TOMATO-PUREE. That is a deliberate modelling choice, not a data
-- error — and if a genuine paste purchase ever arrives its price simply blends in
-- via WAC, which is the correct behaviour. Do not reopen it as a defect.
-- Impact is small by design: 4 preparations at 15-30 g each
-- (PF-CHICKEN_GRILL_TAWOOK, PF-MANAISH_BEEF_MEAT, PF-MANAISH_LAMB_MEAT,
-- PF-MUHAMMARA_BASE), i.e. roughly 3-6.5 THB per unit at 215/kg.

BEGIN;

CREATE TEMP TABLE tmp_snap ON COMMIT DROP AS
SELECT id, product_code, cost_per_unit, cost_source FROM public.nomenclature;

-- ── Pre-flight: the row must still be exactly as mapped, and the catalog's
--    conversion_factor must still independently say 0.4.
DO $$
DECLARE v int; v_conv numeric;
BEGIN
  SELECT count(*) INTO v
    FROM public.purchase_logs pl JOIN public.nomenclature n ON n.id = pl.nomenclature_id
   WHERE n.product_code = 'RAW-TOMATO-PASTE' AND pl.voided_at IS NULL AND pl.quantity > 0;
  IF v <> 1 THEN RAISE EXCEPTION '466: expected exactly 1 live purchase row for RAW-TOMATO-PASTE, found %', v; END IF;

  SELECT count(*) INTO v
    FROM public.purchase_logs pl JOIN public.nomenclature n ON n.id = pl.nomenclature_id
   WHERE n.product_code = 'RAW-TOMATO-PASTE' AND pl.voided_at IS NULL
     AND pl.quantity = 1 AND pl.total_price = 86;
  IF v <> 1 THEN RAISE EXCEPTION '466: the mapped row (quantity 1, total 86) has moved'; END IF;

  SELECT conversion_factor INTO v_conv FROM public.supplier_catalog
   WHERE id = '18c2d6d7-eca9-404b-874c-36c570f50cb4';
  IF v_conv IS DISTINCT FROM 0.400000 THEN
    RAISE EXCEPTION '466: catalog conversion_factor is %, expected 0.400000 — the pack-size evidence has changed', v_conv;
  END IF;
END $$;

ALTER TABLE public.purchase_logs DISABLE TRIGGER trg_recalc_wac_on_purchase_update;
ALTER TABLE public.purchase_logs DISABLE TRIGGER trg_update_cost_on_purchase;
ALTER TABLE public.purchase_logs DISABLE TRIGGER trg_purchase_log_correction;

UPDATE public.purchase_logs pl
   SET quantity       = 0.4,
       price_per_unit = pl.total_price / 0.4,
       notes          = COALESCE(pl.notes,'') || ' [466-pack x0.4, 400 g can]'
  FROM public.nomenclature n
 WHERE n.id = pl.nomenclature_id AND n.product_code = 'RAW-TOMATO-PASTE'
   AND pl.voided_at IS NULL AND pl.quantity = 1;

ALTER TABLE public.purchase_logs ENABLE TRIGGER trg_recalc_wac_on_purchase_update;
ALTER TABLE public.purchase_logs ENABLE TRIGGER trg_update_cost_on_purchase;
ALTER TABLE public.purchase_logs ENABLE TRIGGER trg_purchase_log_correction;

DO $$
DECLARE v_new numeric;
BEGIN
  v_new := public.fn_recalc_wac_for_product(
             (SELECT id FROM public.nomenclature WHERE product_code='RAW-TOMATO-PASTE'));
  RAISE NOTICE '466: RAW-TOMATO-PASTE recomputed to % (was 215.0)', v_new;
END $$;

-- ── Assertions. The distinguishing feature of this migration is that NOTHING
--    may move: 86/0.4 is exactly the stored cost, so a changed cost anywhere
--    means the premise was wrong. That is a stricter guard than 465 could use.
DO $$
DECLARE v int; v_qty numeric; v_cost numeric;
BEGIN
  SELECT count(*) INTO v FROM public.nomenclature n JOIN tmp_snap s ON s.id = n.id
   WHERE n.cost_per_unit IS DISTINCT FROM s.cost_per_unit;
  IF v > 0 THEN RAISE EXCEPTION '466 ABORT: % cost(s) moved; 86/0.4 should equal the stored 215 exactly', v; END IF;

  SELECT count(*) INTO v FROM public.nomenclature n JOIN tmp_snap s ON s.id = n.id
   WHERE n.cost_source IS DISTINCT FROM s.cost_source;
  IF v > 0 THEN RAISE EXCEPTION '466 ABORT: % cost_source value(s) moved', v; END IF;

  SELECT pl.quantity, n.cost_per_unit INTO v_qty, v_cost
    FROM public.purchase_logs pl JOIN public.nomenclature n ON n.id = pl.nomenclature_id
   WHERE n.product_code = 'RAW-TOMATO-PASTE' AND pl.voided_at IS NULL;
  IF v_qty <> 0.4 THEN RAISE EXCEPTION '466 ABORT: quantity is %, expected 0.4', v_qty; END IF;
  IF v_cost <> 215.0 THEN RAISE EXCEPTION '466 ABORT: cost is %, expected 215.0', v_cost; END IF;

  RAISE NOTICE '466 OK: 400 g can normalized, cost unchanged at 215.0/kg as predicted';
END $$;

INSERT INTO public.migration_log (filename, applied_by, status, notes)
VALUES ('466_tomato_paste_pack_factor.sql', 'claude-opus-session-3b980af6', 'success',
        'MC 00a81c22 item 6, Part B.1 addendum. RAW-TOMATO-PASTE''s only purchase row was a 400 g can '
     || 'booked as quantity 1; normalized to 0.4 kg (total_price untouched, mig 390 pattern). The pack '
     || 'size is not inferred — supplier_catalog 18c2d6d7 carries conversion_factor 0.400000 for barcode '
     || '3229755207976 — and 86/0.4 = 215.0000 is exactly the stored cost, so NO cost moved and the '
     || 'migration asserts that. Belongs to the pack-booked-as-base-unit class that 460''s arithmetic '
     || 'guard cannot see (1 x 86 = 86 reconciles). Should have been in 465; it was mis-triaged out '
     || 'because ratio 2.500 was read as "not a pack size" when 1/2.5 = 0.4 is a standard can. '
     || 'Recorded decision: the CEO chose on 2026-10-16 to keep tomato PUREE under RAW-TOMATO-PASTE '
     || 'rather than create RAW-TOMATO-PUREE, so paste is priced from a puree can by design, not by '
     || 'error; a genuine paste purchase will blend in via WAC. 4 preparations at 15-30 g each.')
ON CONFLICT DO NOTHING;

COMMIT;
