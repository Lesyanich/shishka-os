-- Migration 334: column-level RLS — owner-gated RPCs (ADDITIVE phase, NON-BREAKING)
-- MC: c2a5d578 (Phase 4.3) · Epic: 2a8b06a4
-- Spec: docs/security/column-rls-rpc-design-2026-06-29.md
-- Date: 2026-06-29
--
-- This is the SAFE additive half of the column-RLS work: it creates the
-- value_change_audit table + 3 owner-gated SECURITY DEFINER RPCs + grants.
-- It deliberately does NOT REVOKE the direct column UPDATE grants
-- (price / amount_original / exchange_rate / quantity) — that breaking
-- "cutover" step must ship together with the frontend .update() -> .rpc()
-- migration, otherwise admin price/expense/stocktake editing breaks.
-- Applying THIS migration alone changes nothing for existing flows; it only
-- adds new capability (owner-gated, audited writes).
--
-- Helpers used: public.fn_is_owner() (verified present), public.fn_is_authenticated().

-- 1) Audit table ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.value_change_audit (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_auth_uid uuid NOT NULL DEFAULT auth.uid(),
  table_name     text NOT NULL,
  column_name    text NOT NULL,
  row_id         uuid NOT NULL,
  old_value      numeric,
  new_value      numeric,
  reason         text,
  changed_at     timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.value_change_audit ENABLE ROW LEVEL SECURITY;
-- Owner-read only; writes happen exclusively inside the SECURITY DEFINER RPCs below.
DROP POLICY IF EXISTS value_change_audit_owner_read ON public.value_change_audit;
CREATE POLICY value_change_audit_owner_read ON public.value_change_audit
  FOR SELECT TO authenticated USING (public.fn_is_owner());

-- 2) Owner-gated RPCs -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_set_dish_price(p_id uuid, p_price numeric, p_reason text DEFAULT NULL)
RETURNS public.nomenclature LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_old numeric; v_row public.nomenclature;
BEGIN
  IF NOT public.fn_is_owner() THEN RAISE EXCEPTION 'forbidden: owner role required' USING errcode='42501'; END IF;
  SELECT price INTO v_old FROM public.nomenclature WHERE id = p_id;
  UPDATE public.nomenclature SET price = p_price WHERE id = p_id RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'nomenclature % not found', p_id USING errcode='P0002'; END IF;
  INSERT INTO public.value_change_audit(table_name,column_name,row_id,old_value,new_value,reason)
    VALUES ('nomenclature','price',p_id,v_old,p_price,p_reason);
  RETURN v_row;
END $$;

CREATE OR REPLACE FUNCTION public.fn_set_expense_amount(p_id uuid, p_amount_original numeric, p_exchange_rate numeric, p_reason text DEFAULT NULL)
RETURNS public.expense_ledger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_old_amt numeric; v_old_fx numeric; v_row public.expense_ledger;
BEGIN
  IF NOT public.fn_is_owner() THEN RAISE EXCEPTION 'forbidden: owner role required' USING errcode='42501'; END IF;
  SELECT amount_original, exchange_rate INTO v_old_amt, v_old_fx FROM public.expense_ledger WHERE id = p_id;
  UPDATE public.expense_ledger SET amount_original = p_amount_original, exchange_rate = p_exchange_rate WHERE id = p_id RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'expense_ledger % not found', p_id USING errcode='P0002'; END IF;
  INSERT INTO public.value_change_audit(table_name,column_name,row_id,old_value,new_value,reason)
    VALUES ('expense_ledger','amount_original',p_id,v_old_amt,p_amount_original,p_reason),
           ('expense_ledger','exchange_rate', p_id,v_old_fx, p_exchange_rate, p_reason);
  RETURN v_row;
END $$;

CREATE OR REPLACE FUNCTION public.fn_set_sku_quantity(p_sku_id uuid, p_quantity numeric, p_reason text DEFAULT NULL)
RETURNS public.sku_balances LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_old numeric; v_row public.sku_balances;
BEGIN
  IF NOT public.fn_is_owner() THEN RAISE EXCEPTION 'forbidden: owner role required' USING errcode='42501'; END IF;
  SELECT quantity INTO v_old FROM public.sku_balances WHERE sku_id = p_sku_id;  -- PK = sku_id (verified)
  UPDATE public.sku_balances SET quantity = p_quantity WHERE sku_id = p_sku_id RETURNING * INTO v_row;
  IF v_row.sku_id IS NULL THEN RAISE EXCEPTION 'sku_balances % not found', p_sku_id USING errcode='P0002'; END IF;
  INSERT INTO public.value_change_audit(table_name,column_name,row_id,old_value,new_value,reason)
    VALUES ('sku_balances','quantity',p_sku_id,v_old,p_quantity,p_reason);
  RETURN v_row;
END $$;

-- 3) Grant execute (owner-check is inside each function) ---------------------
GRANT EXECUTE ON FUNCTION public.fn_set_dish_price(uuid,numeric,text)             TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_set_expense_amount(uuid,numeric,numeric,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_set_sku_quantity(uuid,numeric,text)           TO authenticated;

-- NOTE (deferred, Phase 4.3 cutover — ship WITH frontend .update()->.rpc()):
--   REVOKE UPDATE (price) ON public.nomenclature FROM authenticated, anon;
--   REVOKE UPDATE (amount_original, exchange_rate) ON public.expense_ledger FROM authenticated, anon;
--   REVOKE UPDATE (quantity) ON public.sku_balances FROM authenticated, anon;

-- 4) self-register (RULE-MIGRATION-TRACKING)
INSERT INTO public.migration_log (filename, notes, checksum)
VALUES (
  '334_column_rls_owner_rpcs.sql',
  'Column-level RLS ADDITIVE phase: value_change_audit + owner-gated fn_set_dish_price/fn_set_expense_amount/fn_set_sku_quantity + grants. REVOKEs deferred to frontend-cutover release.',
  NULL
)
ON CONFLICT (filename) DO NOTHING;
