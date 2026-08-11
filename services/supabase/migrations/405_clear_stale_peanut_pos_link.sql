-- 405_clear_stale_peanut_pos_link.sql
-- Follow-up to 404_retire_peanut_lime_sauce.sql, same session.
--
-- 404 preserved SALE-SAUCE_PEANUT's loyverse_item_id so the companion
-- loyverse_push_queue delete row could remove the till item. That delete ran and
-- came back 404 NOT_FOUND:
--   DELETE /items/0e4c266a-3ad7-4f23-8af0-3fea3b7c8528
--   {"errors":[{"code":"NOT_FOUND","details":"The resource with ID ... was not found"}]}
--
-- So the item was NOT on the till. The database was wrong about the POS, not the
-- other way round: nomenclature carried pos_status='synced' plus a loyverse_item_id
-- for an item that no longer exists in Loyverse. The same worker deleted two items
-- successfully on 2026-08-09, so the credentials and the store are fine — that id
-- is simply not there.
--
-- This matters beyond one sauce: pos_status='synced' + a non-null loyverse_item_id
-- is NOT evidence that something is live on the till. There is no items mirror table
-- to reconcile against (only pos_loyverse_modifier_lists / _options), so nothing
-- detects an item deleted in Loyverse by hand. Logged separately for a real fix.
--
-- Guest exposure was nil either way: order_items has zero rows for this SKU, so it
-- was never once ordered.
--
-- This migration only makes the record honest. It changes no guest-facing state.

BEGIN;

UPDATE nomenclature
SET loyverse_item_id = NULL,
    updated_at       = now()
WHERE product_code = 'SALE-SAUCE_PEANUT'
  AND loyverse_item_id = '0e4c266a-3ad7-4f23-8af0-3fea3b7c8528';

-- Close the queue row. The desired end state (no POS item) is already true, so
-- leaving it 'error' would just invite an endless retry against a dead id. The
-- original API response is preserved verbatim in result.original_error.
UPDATE loyverse_push_queue
SET status  = 'done',
    result  = jsonb_build_object(
                'ok', true,
                'resolution', 'Item already absent from Loyverse (404 NOT_FOUND). '
                           || 'Nothing to delete; stale loyverse_item_id cleared in migration 405.',
                'original_error', result -> 'error'),
    processed_at = now()
WHERE id = 'c781b0ea-7c45-4989-89cb-9234943de9eb'
  AND status = 'error';

INSERT INTO public.migration_log (filename, applied_by, status, notes)
VALUES ('405_clear_stale_peanut_pos_link.sql', 'claude-opus-session-2c0bc6', 'success',
        'Cleared SALE-SAUCE_PEANUT.loyverse_item_id. The delete queued by 404 returned 404 NOT_FOUND '
     || 'from Loyverse, proving the item was never actually on the till - the DB held a stale '
     || 'pos_status=synced plus an item id for something deleted in Loyverse by hand. Corrects the '
     || 'record only; no guest-facing change. order_items shows the SKU was never ordered, so guest '
     || 'exposure was nil. Broader gap logged: there is no Loyverse items mirror, so nothing '
     || 'reconciles nomenclature POS linkage against the real till and synced/item_id cannot be '
     || 'trusted as evidence an item is live.')
ON CONFLICT DO NOTHING;

COMMIT;

-- ---------------------------------------------------------------------------
-- DOWN
-- ---------------------------------------------------------------------------
-- Not meaningfully revertible: restoring a loyverse_item_id that Loyverse says
-- does not exist would only recreate the lie. If the sauce is ever revived, push
-- it fresh with a `dish` row in loyverse_push_queue and let the worker set the id.
-- BEGIN;
-- DELETE FROM public.migration_log WHERE filename='405_clear_stale_peanut_pos_link.sql';
-- COMMIT;
