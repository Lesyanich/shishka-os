-- ============================================================
-- Migration 092: Receipt inbox management RPCs
-- Adds delete + status sync for admin panel
-- ============================================================

-- 1. RPC to delete inbox rows (bypasses RLS)
CREATE OR REPLACE FUNCTION public.fn_delete_inbox_row(p_inbox_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_row RECORD;
BEGIN
  SELECT id, status, expense_id INTO v_row
  FROM receipt_inbox WHERE id = p_inbox_id;

  IF v_row IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Inbox row not found');
  END IF;

  -- Don't allow deleting processed receipts that have expenses
  IF v_row.expense_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Cannot delete: receipt already has expense_id ' || v_row.expense_id::TEXT
    );
  END IF;

  DELETE FROM receipt_inbox WHERE id = p_inbox_id;

  RETURN jsonb_build_object('ok', true, 'deleted_id', p_inbox_id::TEXT);
END;
$$;

-- 2. RPC to sync inbox status based on expense_id presence
--    Fixes inconsistencies (e.g. approved but status still 'parsed')
CREATE OR REPLACE FUNCTION public.fn_sync_inbox_status(p_inbox_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_row RECORD;
BEGIN
  SELECT id, status, expense_id INTO v_row
  FROM receipt_inbox WHERE id = p_inbox_id;

  IF v_row IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Inbox row not found');
  END IF;

  -- If expense_id is set but status is not 'processed', fix it
  IF v_row.expense_id IS NOT NULL AND v_row.status <> 'processed' THEN
    UPDATE receipt_inbox
    SET status = 'processed'
    WHERE id = p_inbox_id;

    RETURN jsonb_build_object('ok', true, 'fixed', true, 'old_status', v_row.status, 'new_status', 'processed');
  END IF;

  RETURN jsonb_build_object('ok', true, 'fixed', false, 'status', v_row.status);
END;
$$;

-- 3. Grant execute to authenticated and anon roles
GRANT EXECUTE ON FUNCTION public.fn_delete_inbox_row(UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.fn_sync_inbox_status(UUID) TO authenticated, anon;
