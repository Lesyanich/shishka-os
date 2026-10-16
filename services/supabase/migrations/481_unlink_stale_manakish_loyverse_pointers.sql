-- 481_unlink_stale_manakish_loyverse_pointers.sql
-- Cleanup of 5 dead Loyverse pointers, surfaced by a parallel session.
--
-- WHAT WAS REPORTED. A parallel session checking today's retirements reported
-- that "5 GF manakish are still in Loyverse", i.e. that the till could still
-- ring five Potato Taco variants after the line was retired.
--
-- WHAT IS ACTUALLY TRUE — half of that. The five rows DID claim a Loyverse
-- link, with pos_status='synced' and a populated loyverse_item_id:
--   SALE-MANAISH_OLIVE_CHEESE_GF    59   synced 2026-06-04
--   SALE-MANAISH_CHILLI_CHEESE_GF   69   synced 2026-06-07
--   SALE-MANAISH_PUMPKIN_GOAT_GF    79   synced 2026-06-10
--   SALE-MANAISH_SUJUK_GF           79   synced 2026-06-11
--   SALE-MANAISH_TRUFFLE_LAMB_GF    79   synced 2026-06-11
-- But all five DELETE calls came back 404 NOT_FOUND, so the items are NOT in
-- Loyverse and no cashier could ever have rung them. They were removed in Back
-- Office months ago while our rows kept pointing at dead ids and reading as
-- "synced" the whole time.
--
-- Worth stating plainly because the distinction matters operationally: this was
-- a stale-data problem, not a live sellable-item problem. The till was clean.
--
-- These five sat outside the retirement migrations on purpose — they were
-- already '[ARCHIVED]' and is_available=false long before, so the scope was
-- what was live. The parallel session was right that something was wrong with
-- them; it just read the consequence one notch too severe.
--
-- WHAT THIS DOES. Clears loyverse_item_id / loyverse_price / loyverse_synced_at
-- on those five — exactly what handleDeleteItem does on a successful delete.
-- Identical in kind to migration 467, which did this for Cheese & Mushroom.
-- After this, no retired taco, taco bundle or rice-paper roll row claims a
-- Loyverse link.
--
-- NOT DONE: the five failed queue rows stay at status='error' as the audit
-- trail. The watchdog only resets rows stuck in 'processing', so they will not
-- be retried.
--
-- ROOT CAUSE STILL UNFIXED, and this is now the THIRD instance in one day
-- (migration 467, then this). Nothing reconciles a Back Office deletion back
-- into nomenclature, so a dead loyverse_item_id reads as "synced" indefinitely
-- and the only way anyone finds out is by trying to delete it. A periodic
-- reconciliation against pull_items_status would catch the whole class.

BEGIN;

DO $guard$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM public.nomenclature
   WHERE product_code LIKE 'SALE-MANAISH%' AND loyverse_item_id IS NOT NULL;
  IF v_n <> 5 THEN RAISE EXCEPTION 'ABORT: expected 5 stale taco pointers, found %.', v_n; END IF;

  SELECT count(*) INTO v_n FROM public.nomenclature
   WHERE product_code LIKE 'SALE-MANAISH%' AND loyverse_item_id IS NOT NULL AND is_available;
  IF v_n <> 0 THEN RAISE EXCEPTION 'ABORT: % of them are available again; do not unlink.', v_n; END IF;
END $guard$;

UPDATE public.nomenclature
   SET loyverse_item_id = NULL, loyverse_price = NULL, loyverse_synced_at = NULL, updated_at = now()
 WHERE product_code LIKE 'SALE-MANAISH%' AND loyverse_item_id IS NOT NULL;

DO $verify$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM public.nomenclature
   WHERE (product_code LIKE 'SALE-MANAISH%' OR product_code LIKE 'SALE-BUNDLE_MANAKISH%'
          OR product_code LIKE 'SALE-SUMMER_ROLLS%')
     AND loyverse_item_id IS NOT NULL;
  IF v_n <> 0 THEN RAISE EXCEPTION 'ABORT: % retired taco/roll rows still claim a Loyverse link.', v_n; END IF;
END $verify$;

INSERT INTO public.migration_log (filename, applied_by, status, notes)
VALUES ('481_unlink_stale_manakish_loyverse_pointers.sql', 'claude-opus-session-5bddb375', 'success',
        'Cleared 5 dead loyverse_item_id pointers on already-[ARCHIVED] taco variants. A parallel session '
     || 'reported "5 GF manakish still in Loyverse"; half right - the rows claimed a link with '
     || 'pos_status=synced, but all 5 DELETE calls returned 404 NOT_FOUND, so the items are NOT in Loyverse '
     || 'and the till could never ring them. Identical drift to migration 467. After this NO retired taco, '
     || 'taco bundle or rice-paper roll row claims a Loyverse link. ROOT CAUSE UNFIXED: nothing reconciles a '
     || 'Back Office deletion back into nomenclature - third instance today.')
ON CONFLICT (filename) DO NOTHING;

COMMIT;
