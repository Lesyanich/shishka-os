-- 387_po_delete_draft_and_archive.sql
-- CEO ruling 2026-07-29: «черновик удаляем насовсем, остальное cancelled + скрыть».
-- MC task: 2cdf2a03-528a-496d-90b8-5190af61125d
--
-- Until now the Order Desk had no way to remove an order at all — only
-- `cancelled`, which leaves the card on screen forever. Prod holds 2 purchase
-- orders, one `draft` and one `cancelled`, and the CEO cannot clear either.
--
-- Two distinct verbs, deliberately NOT one:
--   fn_delete_purchase_order  — destructive, `draft` only.
--   fn_archive_purchase_order — presentation only, terminal statuses only.
--
-- `archived_at` is a separate column, NOT a new `po_status` value. Receiving,
-- reconciliation and the PO timeline all switch on `status`; adding a member to
-- that enum would silently change their behaviour. Hiding a card is a view
-- concern and has no business being in the status machine.
--
-- WHY THE DELETE GUARD IS BELT-AND-BRACES. The FKs pointing at purchase_orders
-- do NOT protect us — verified live:
--     po_lines.po_id          -> CASCADE    (intended: lines die with the order)
--     receiving_records.po_id -> SET NULL   (!) would silently orphan receiving
--     expense_ledger.po_id    -> SET NULL   (!) would silently detach spend
--     receipt_inbox.po_id     -> NO ACTION  (would raise, but only by luck)
-- So a bare `DELETE` on a non-draft order would not fail — it would quietly
-- sever financial history. The status check alone is not enough either, since
-- a row can in principle be referenced while still reading `draft`. Both
-- guards are therefore explicit, and the reference check names the offending
-- table so the caller learns why.
--
-- Reversible: see the DOWN block at the tail.

-- ---------------------------------------------------------------------------
-- 1. Archive flag
-- ---------------------------------------------------------------------------
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

COMMENT ON COLUMN public.purchase_orders.archived_at IS
  'Hidden from the Order Desk when set. Presentation state only — never a status. '
  'The order stays fully readable by direct URL (?tab=orders&po=<id>) and under '
  '"show archived". Set/cleared via fn_archive_purchase_order.';

-- Partial index: the Order Desk lists only unarchived orders.
CREATE INDEX IF NOT EXISTS idx_purchase_orders_active
  ON public.purchase_orders (created_at DESC)
  WHERE archived_at IS NULL;

-- ---------------------------------------------------------------------------
-- 2. Hard delete — draft only
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_delete_purchase_order(p_po_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_po      public.purchase_orders%ROWTYPE;
  v_lines   integer;
  v_blocker text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_po_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Purchase order not found');
  END IF;

  -- G1. CEO ruling: only a draft is disposable. Everything past draft has been
  -- shown to the other side and is part of the record.
  IF v_po.status <> 'draft' THEN
    RETURN jsonb_build_object('ok', false,
      'error', 'Only a draft can be deleted. Order ' || v_po.po_number ||
               ' is ' || v_po.status::text || ' — cancel and archive it instead.');
  END IF;

  -- G2. Nothing downstream may reference it. Two of these FKs are ON DELETE
  -- SET NULL, so without this check the delete would succeed and quietly
  -- detach the very history we are protecting.
  SELECT x.t INTO v_blocker FROM (
    SELECT 'receiving_records' AS t WHERE EXISTS (
      SELECT 1 FROM public.receiving_records WHERE po_id = p_po_id)
    UNION ALL
    SELECT 'expense_ledger' WHERE EXISTS (
      SELECT 1 FROM public.expense_ledger WHERE po_id = p_po_id)
    UNION ALL
    SELECT 'receipt_inbox' WHERE EXISTS (
      SELECT 1 FROM public.receipt_inbox WHERE po_id = p_po_id)
  ) x LIMIT 1;

  IF v_blocker IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false,
      'error', 'Order ' || v_po.po_number || ' is referenced by ' || v_blocker ||
               ' and cannot be deleted. Cancel and archive it instead.');
  END IF;

  SELECT count(*) INTO v_lines FROM public.po_lines WHERE po_id = p_po_id;

  -- po_lines.po_id is ON DELETE CASCADE, so the lines go with the order.
  DELETE FROM public.purchase_orders WHERE id = p_po_id;

  RETURN jsonb_build_object(
    'ok', true,
    'deleted_po_number', v_po.po_number,
    'lines_deleted', v_lines
  );
END;
$function$;

COMMENT ON FUNCTION public.fn_delete_purchase_order(uuid) IS
  'Permanently deletes a DRAFT purchase order and its lines (CASCADE). Refuses '
  'any other status and any order referenced by receiving_records, '
  'expense_ledger or receipt_inbox. CEO ruling 2026-07-29, MC 2cdf2a03.';

-- ---------------------------------------------------------------------------
-- 3. Archive / unarchive — terminal statuses only
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_archive_purchase_order(
  p_po_id    uuid,
  p_archived boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_po public.purchase_orders%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_po_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Purchase order not found');
  END IF;

  -- Only a finished order may be hidden. Hiding a live one would make work
  -- disappear from the desk while it is still owed to somebody.
  IF p_archived AND v_po.status NOT IN ('cancelled', 'reconciled') THEN
    RETURN jsonb_build_object('ok', false,
      'error', 'Only a cancelled or reconciled order can be archived. Order ' ||
               v_po.po_number || ' is ' || v_po.status::text || '.');
  END IF;

  UPDATE public.purchase_orders
     SET archived_at = CASE WHEN p_archived THEN now() ELSE NULL END,
         updated_at  = now()
   WHERE id = p_po_id;

  RETURN jsonb_build_object(
    'ok', true,
    'po_number', v_po.po_number,
    'archived', p_archived
  );
END;
$function$;

COMMENT ON FUNCTION public.fn_archive_purchase_order(uuid, boolean) IS
  'Hides/unhides a cancelled or reconciled order on the Order Desk by setting '
  'archived_at. Never touches status. MC 2cdf2a03.';

GRANT EXECUTE ON FUNCTION public.fn_delete_purchase_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_archive_purchase_order(uuid, boolean) TO authenticated;

-- Self-register (RULE-MIGRATION-TRACKING).
INSERT INTO public.migration_log (filename, applied_by, status, notes)
VALUES ('387_po_delete_draft_and_archive.sql', 'claude-opus-session-087dae10', 'success',
        'CEO ruling 2026-07-29: draft POs hard-delete, everything else cancelled + archived_at. MC 2cdf2a03.')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- DOWN
-- ---------------------------------------------------------------------------
-- DROP FUNCTION IF EXISTS public.fn_archive_purchase_order(uuid, boolean);
-- DROP FUNCTION IF EXISTS public.fn_delete_purchase_order(uuid);
-- DROP INDEX IF EXISTS public.idx_purchase_orders_active;
-- ALTER TABLE public.purchase_orders DROP COLUMN IF EXISTS archived_at;
