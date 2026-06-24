-- 312_lock_expense_ledger_owner_only.sql
-- Lock expense_ledger to owner-only at the database layer, and add a narrow
-- duplicate-probe RPC so receipt reviewers keep duplicate detection without
-- read access to the full ledger.
--
-- WHY: expense_ledger RLS was `fn_is_authenticated()` for ALL commands — every
-- logged-in staff member (all cooks + the task_manager) could read/write the
-- entire ledger directly via the API. Opening the /receipts tab to the
-- task_manager (Mint) made that pre-existing gap material: hiding the finance
-- tabs in the UI never hid the data. This closes it at the source.
--
-- SAFE FOR APPROVALS: fn_approve_receipt_with_learning is SECURITY DEFINER,
-- owned by postgres, and expense_ledger does NOT force row security
-- (relforcerowsecurity = false), so the approval path bypasses RLS and keeps
-- writing the ledger for any authorized reviewer. Owner finance UI, the
-- finance MCP, and edge functions are unaffected (owner role / service_role).
--
-- MC task: 49ffbe68-4882-458d-ae55-0e8fec765c59

-- 1) Owner-only RLS on expense_ledger -----------------------------------------
DROP POLICY IF EXISTS auth_full_access ON public.expense_ledger;

CREATE POLICY expense_ledger_owner_only
  ON public.expense_ledger
  FOR ALL
  TO public
  USING (public.fn_is_owner())
  WITH CHECK (public.fn_is_owner());

-- 2) Narrow duplicate-probe RPC -----------------------------------------------
-- Returns at most 5 matching ledger rows — by invoice number, or by
-- date + amount(±1) with an optional supplier substring. Self-gated to active
-- owner/task_manager staff. SECURITY DEFINER so it can read the now owner-only
-- ledger on behalf of an authorized reviewer, while exposing only duplicate
-- summaries (never a browsable ledger).
CREATE OR REPLACE FUNCTION public.fn_check_expense_duplicate(
  p_invoice_number text DEFAULT NULL,
  p_transaction_date date DEFAULT NULL,
  p_amount numeric DEFAULT NULL,
  p_supplier text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  transaction_date date,
  amount_original numeric,
  details text,
  invoice_number text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT e.id, e.transaction_date, e.amount_original, e.details, e.invoice_number
  FROM public.expense_ledger e
  WHERE EXISTS (
    SELECT 1 FROM public.staff s
    WHERE s.auth_user_id = auth.uid()
      AND s.app_role IN ('owner', 'task_manager')
      AND s.is_active = true
  )
  AND (
    -- exact invoice-number match (when an invoice number is provided)
    (p_invoice_number IS NOT NULL AND length(trim(p_invoice_number)) > 0
       AND e.invoice_number = p_invoice_number)
    OR
    -- fuzzy date+amount match (only when no invoice number is provided)
    ((p_invoice_number IS NULL OR length(trim(p_invoice_number)) = 0)
       AND p_transaction_date IS NOT NULL
       AND p_amount IS NOT NULL AND p_amount > 0
       AND e.transaction_date = p_transaction_date
       AND e.amount_original BETWEEN p_amount - 1 AND p_amount + 1
       AND (p_supplier IS NULL OR e.details ILIKE '%' || left(p_supplier, 20) || '%'))
  )
  LIMIT 5;
$$;

REVOKE ALL ON FUNCTION public.fn_check_expense_duplicate(text, date, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_check_expense_duplicate(text, date, numeric, text) TO authenticated;

-- 3) Self-register in the migration ledger (NULL checksum by convention — see
-- check-migrations.ts; md5-of-own-contents is chicken-and-egg). Idempotent.
INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '312_lock_expense_ledger_owner_only.sql',
  'claude-code',
  NULL,
  'Lock expense_ledger RLS to fn_is_owner(); add fn_check_expense_duplicate (owner/task_manager) so receipt dup-check survives the lock (task 49ffbe68)'
)
ON CONFLICT DO NOTHING;
