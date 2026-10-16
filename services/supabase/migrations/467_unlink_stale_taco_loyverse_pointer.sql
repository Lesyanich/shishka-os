-- 467_unlink_stale_taco_loyverse_pointer.sql
-- MC 2dceda60 — cleanup of one row surfaced by migration 466's delisting step.
--
-- WHAT HAPPENED. 466 retired the Potato Tacos line and the 9 affected dishes were
-- then delisted from the till by enqueueing loyverse_push_queue action='delete'.
-- Eight drained clean. The ninth came back 404:
--
--   SALE-MANAISH_CHEESE_MUSHROOM_GF  ->  Loyverse DELETE /items/cff3fde9-...
--   {"code":"NOT_FOUND","details":"The resource with ID '...' was not found"}
--
-- So this dish is NOT at the till and never needed deleting: the item had already
-- been removed in Loyverse and our row kept pointing at it. loyverse_synced_at on
-- that row reads 2026-06-07, four months stale, which is consistent with the item
-- having been deleted in Back Office long ago without the mirror being told.
--
-- This is the same class of drift recorded earlier on this system (the Seed
-- Crackers DB-60-vs-till-120 case, where pull_items_status had been stale since
-- 2026-06-30): nothing reconciles a Back Office deletion back into nomenclature,
-- so a dead loyverse_item_id can sit in the column indefinitely and read as
-- "synced" to anyone querying it.
--
-- WHAT THIS DOES. Exactly what handleDeleteItem would have done had the API call
-- succeeded — clears the three POS mirror columns so the row stops claiming a
-- link to an item that does not exist:
--   loyverse_item_id -> NULL, loyverse_price -> NULL, loyverse_synced_at -> NULL
-- pos_status is already 'draft' from 466, so it is not touched again.
--
-- WHY IT MATTERS BEYOND TIDINESS. A stale loyverse_item_id makes the dish look
-- synced, so a future reconcile or revival would try to update an item that is
-- gone and fail the same way. Unlinked, a revival takes the create path instead.
--
-- NOT DONE HERE: the failed loyverse_push_queue row is deliberately left at
-- status='error'. It is the audit trail for the 404 and the watchdog only resets
-- rows stuck in 'processing', so it will not be retried. The authoritative
-- evidence that the till is clear is the Loyverse API itself — 8 successful
-- DELETEs plus this 404 — not loyverse_item_sync, which cannot be refreshed from
-- SQL because pull_items_status is gated on a signed-in owner.

BEGIN;

DO $guard$
DECLARE
  v_row record;
BEGIN
  SELECT product_code, loyverse_item_id, pos_status, is_available
    INTO v_row
    FROM public.nomenclature
   WHERE product_code = 'SALE-MANAISH_CHEESE_MUSHROOM_GF';

  IF v_row IS NULL THEN
    RAISE EXCEPTION 'ABORT: SALE-MANAISH_CHEESE_MUSHROOM_GF not found.';
  END IF;
  IF v_row.loyverse_item_id IS DISTINCT FROM 'cff3fde9-d3b9-4e8d-b2be-c93107e80f12' THEN
    RAISE EXCEPTION 'ABORT: expected the stale pointer cff3fde9-..., found %. Something else changed this row.', coalesce(v_row.loyverse_item_id, '(null)');
  END IF;
  IF v_row.is_available THEN
    RAISE EXCEPTION 'ABORT: the dish is available again — migration 466 was reverted. Do not unlink.';
  END IF;
END
$guard$;

UPDATE public.nomenclature
   SET loyverse_item_id   = NULL,
       loyverse_price     = NULL,
       loyverse_synced_at = NULL,
       updated_at         = now()
 WHERE product_code = 'SALE-MANAISH_CHEESE_MUSHROOM_GF';

DO $verify$
DECLARE
  v_linked int;
BEGIN
  -- No retired taco may still claim a Loyverse link.
  SELECT count(*) INTO v_linked
    FROM public.nomenclature
   WHERE product_code IN (
           'SALE-MANAISH_ZAATAR_GF','SALE-MANAISH_CHEESE_GF','SALE-MANAISH_FALAFEL_GF',
           'SALE-MANAISH_PUMPKIN_CHEESE_MIX_GF','SALE-MANAISH_LAMB_GF','SALE-MANAISH_BEEF_GF',
           'SALE-MANAISH_SALAMI_GF','SALE-MANAISH_CHEESE_MUSHROOM_GF','SALE-BUNDLE_MANAKISH_4')
     AND loyverse_item_id IS NOT NULL;
  IF v_linked <> 0 THEN
    RAISE EXCEPTION 'ABORT: % retired taco row(s) still carry a loyverse_item_id.', v_linked;
  END IF;
END
$verify$;

INSERT INTO public.migration_log (filename, applied_by, status, notes)
VALUES ('467_unlink_stale_taco_loyverse_pointer.sql', 'claude-opus-session-5bddb375', 'success',
        'MC 2dceda60, follow-up to 466. SALE-MANAISH_CHEESE_MUSHROOM_GF was the 1 of 9 delistings that failed: '
     || 'Loyverse answered 404 NOT_FOUND for item cff3fde9-d3b9-4e8d-b2be-c93107e80f12, i.e. the item was '
     || 'already gone from the till and our row had been pointing at a dead id since 2026-06-07. Cleared '
     || 'loyverse_item_id / loyverse_price / loyverse_synced_at — exactly what handleDeleteItem does on '
     || 'success. All 9 retired taco rows now carry no Loyverse link. The failed queue row is left at '
     || 'status=error on purpose as the audit trail (the watchdog only resets stuck "processing" rows). '
     || 'Same drift class as the Seed Crackers 60-vs-120 case: nothing reconciles a Back Office deletion '
     || 'back into nomenclature, so a dead pointer reads as "synced" indefinitely.')
ON CONFLICT (filename) DO NOTHING;

COMMIT;
