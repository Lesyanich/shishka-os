-- ============================================================
-- Migration 055: Auto-fill created_by on expense_ledger
-- Phase 8 — Accountability tracking via auth.uid()
-- ============================================================

-- ─── 1. Trigger function: auto-set created_by on INSERT ───

CREATE OR REPLACE FUNCTION fn_set_created_by()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  -- Only set if not already provided (SECURITY DEFINER RPCs may pass it explicitly)
  IF NEW.created_by IS NULL THEN
    NEW.created_by := fn_current_user_id();
  END IF;
  RETURN NEW;
END;
$$;

-- ─── 2. Trigger on expense_ledger ───

DROP TRIGGER IF EXISTS trg_set_created_by ON expense_ledger;
CREATE TRIGGER trg_set_created_by
  BEFORE INSERT ON expense_ledger
  FOR EACH ROW
  EXECUTE FUNCTION fn_set_created_by();

-- ─── 3. Update fn_approve_receipt to pass created_by (v10) ───
-- The trigger handles it automatically, but fn_approve_receipt is SECURITY DEFINER
-- so auth.uid() inside the trigger would return NULL (DEFINER context).
-- Solution: explicitly set created_by in the INSERT within fn_approve_receipt.

-- We patch only the INSERT INTO expense_ledger columns + values.
-- Full function replacement follows the v9 body from migration 049,
-- with one addition: created_by column.

-- Note: Rather than replacing the entire 200-line function, we use the trigger
-- approach. Since fn_approve_receipt is SECURITY DEFINER, the trigger's
-- fn_current_user_id() would run in DEFINER context too.
-- Therefore we need to accept created_by as a parameter or set it before the RPC call.
--
-- Practical approach: The frontend passes auth.uid() as p_payload->>'created_by',
-- and the trigger picks it up from NEW.created_by if set.
-- If fn_approve_receipt doesn't set it, trigger sets it to fn_current_user_id()
-- which in SECURITY DEFINER context = auth.uid() of the calling user
-- (because fn_current_user_id uses auth.uid() which reflects the JWT, not the definer).
--
-- auth.uid() reads from the current JWT regardless of SECURITY DEFINER/INVOKER,
-- so the trigger will correctly capture the authenticated user's ID.
