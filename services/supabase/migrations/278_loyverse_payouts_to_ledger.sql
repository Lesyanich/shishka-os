-- Migration 278 — Loyverse pay-outs → expense_ledger + receipt completeness (dining_option, refund_for)
-- Why:
--   (A) Персонал берёт наличные из кассы (доставка, докупка) → это реальные мелкие
--       расходы. Заводим каждый PAY_OUT в expense_ledger как pending OpEx, чтобы финансы
--       видели и категоризировали. Идемпотентно через expense_ledger.loyverse_cash_movement_id.
--   (B) Аудит показал: dining_option (зал/навынос) и refund_for (ссылка возврата на
--       оригинальный чек) лежали только в raw. Выносим в колонки orders (refund_for нужен
--       для неттинга возвратов). Остальное (note, points, surcharge, line taxes/discounts)
--       остаётся в raw — достаём по необходимости.

BEGIN;

-- ─── (A) PAY_OUT → expense_ledger ───
ALTER TABLE public.expense_ledger
  ADD COLUMN IF NOT EXISTS loyverse_cash_movement_id UUID
    REFERENCES public.loyverse_cash_movements(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_expense_ledger_lcm
  ON public.expense_ledger(loyverse_cash_movement_id)
  WHERE loyverse_cash_movement_id IS NOT NULL;

COMMENT ON COLUMN public.expense_ledger.loyverse_cash_movement_id IS
  'Source link to loyverse_cash_movements for auto-imported PAY_OUT petty-cash expenses. Dedup guard.';

-- Idempotent sync: insert a pending OpEx row for every PAY_OUT not yet linked.
-- category 2000 = Operating Expenses (generic); finance re-categorises pending rows
-- (some pay-outs are COGS like milk/water, others admin like key copies).
CREATE OR REPLACE FUNCTION public.fn_sync_loyverse_payouts_to_ledger()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_count INT;
BEGIN
  INSERT INTO public.expense_ledger (
    transaction_date, flow_type, category_code, details,
    amount_original, currency, paid_by, payment_method, status,
    loyverse_cash_movement_id
  )
  SELECT
    COALESCE(cm.created_at::date, CURRENT_DATE),
    'OpEx', 2000,
    COALESCE(NULLIF(cm.comment, ''), 'Loyverse cash pay-out'),
    cm.money_amount, 'THB',
    COALESCE(e.name, cm.employee_id, ''), 'cash', 'pending',
    cm.id
  FROM public.loyverse_cash_movements cm
  LEFT JOIN public.loyverse_employees e ON e.loyverse_employee_id = cm.employee_id
  WHERE cm.type = 'PAY_OUT'
    AND cm.money_amount IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.expense_ledger el WHERE el.loyverse_cash_movement_id = cm.id
    );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.fn_sync_loyverse_payouts_to_ledger() IS
  'Inserts a pending OpEx expense_ledger row for each Loyverse PAY_OUT cash movement not yet linked. Idempotent. Finance re-categorises.';

-- ─── (B) orders: dining_option + refund_for ───
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS dining_option TEXT,
  ADD COLUMN IF NOT EXISTS loyverse_refund_for TEXT;

COMMENT ON COLUMN public.orders.loyverse_refund_for IS
  'For REFUND receipts: the receipt_number of the original sale being refunded (Loyverse refund_for).';

-- Re-issue fn_ingest_loyverse_receipt to also populate dining_option + refund_for.
CREATE OR REPLACE FUNCTION public.fn_ingest_loyverse_receipt(p_receipt JSONB)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_receipt_id    TEXT := p_receipt->>'receipt_number';
  v_order_id      UUID;
  v_line          JSONB;
  v_mod           JSONB;
  v_order_item_id UUID;
  v_payments      JSONB := COALESCE(p_receipt->'payments', '[]'::jsonb);
  v_payment_type  TEXT;
  v_receipt_type  TEXT := COALESCE(p_receipt->>'receipt_type', 'SALE');
  v_cancelled_at  TIMESTAMPTZ := NULLIF(p_receipt->>'cancelled_at', '')::timestamptz;
BEGIN
  SELECT id INTO v_order_id FROM public.orders WHERE loyverse_receipt_id = v_receipt_id;
  IF v_order_id IS NOT NULL THEN RETURN v_order_id; END IF;

  IF jsonb_typeof(v_payments) = 'array' AND jsonb_array_length(v_payments) > 1 THEN
    v_payment_type := 'split';
  ELSIF jsonb_typeof(v_payments) = 'array' AND jsonb_array_length(v_payments) = 1 THEN
    v_payment_type := COALESCE(v_payments->0->>'type', v_payments->0->>'name');
  END IF;

  INSERT INTO public.orders (
    source, status, loyverse_receipt_id, loyverse_raw, received_at, total_amount,
    payment_type, receipt_type, cancelled_at,
    loyverse_customer_id, loyverse_employee_id, loyverse_pos_device_id,
    total_discount, total_tax, tip,
    loyverse_created_at, loyverse_updated_at,
    dining_option, loyverse_refund_for
  )
  VALUES (
    'loyverse', 'received', v_receipt_id, p_receipt, now(),
    COALESCE(NULLIF(p_receipt->>'total_money', '')::numeric, 0),
    v_payment_type, v_receipt_type, v_cancelled_at,
    p_receipt->>'customer_id', p_receipt->>'employee_id', p_receipt->>'pos_device_id',
    NULLIF(p_receipt->>'total_discount', '')::numeric,
    NULLIF(p_receipt->>'total_tax', '')::numeric,
    NULLIF(p_receipt->>'tip', '')::numeric,
    NULLIF(p_receipt->>'created_at', '')::timestamptz,
    NULLIF(p_receipt->>'updated_at', '')::timestamptz,
    p_receipt->>'dining_option', p_receipt->>'refund_for'
  )
  RETURNING id INTO v_order_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(COALESCE(p_receipt->'line_items', '[]'::jsonb))
  LOOP
    v_order_item_id := NULL;
    INSERT INTO public.order_items (order_id, nomenclature_id, quantity, price_at_purchase)
    SELECT v_order_id, n.id,
           (v_line->>'quantity')::numeric,
           COALESCE(NULLIF(v_line->>'price', '')::numeric, 0)
    FROM public.nomenclature n
    WHERE n.loyverse_item_id = v_line->>'item_id'
    RETURNING id INTO v_order_item_id;

    IF v_order_item_id IS NULL THEN
      CONTINUE;
    END IF;

    FOR v_mod IN SELECT * FROM jsonb_array_elements(
      COALESCE(v_line->'line_modifiers', '[]'::jsonb))
    LOOP
      INSERT INTO public.order_item_modifiers (
        order_item_id, modifier_option_id, modifier_id, slot,
        quantity, price_delta_paid,
        loyverse_modifier_id, loyverse_modifier_name
      )
      SELECT v_order_item_id, nmo.id, nmo.modifier_id, nmo.slot,
             COALESCE((v_mod->>'quantity')::numeric, 1),
             COALESCE((v_mod->>'total_price')::numeric, 0),
             v_mod->>'modifier_option_id',
             v_mod->>'name'
      FROM public.nomenclature_modifier_options nmo
      WHERE nmo.loyverse_modifier_id = v_mod->>'modifier_option_id'
      LIMIT 1;

      IF NOT FOUND THEN
        INSERT INTO public.order_item_modifiers (
          order_item_id, quantity, price_delta_paid,
          loyverse_modifier_id, loyverse_modifier_name
        ) VALUES (
          v_order_item_id,
          COALESCE((v_mod->>'quantity')::numeric, 1),
          COALESCE((v_mod->>'total_price')::numeric, 0),
          v_mod->>'modifier_option_id',
          v_mod->>'name'
        );
      END IF;
    END LOOP;
  END LOOP;

  IF v_cancelled_at IS NOT NULL THEN
    UPDATE public.orders SET bom_deducted_at = now() WHERE id = v_order_id;
  ELSIF v_receipt_type = 'REFUND' THEN
    PERFORM public.fn_deduct_order_bom(v_order_id, 1, 'loyverse_refund');
  ELSE
    PERFORM public.fn_deduct_order_bom(v_order_id, -1, 'loyverse_sale');
  END IF;

  RETURN v_order_id;
END;
$$;

-- Backfill historical orders' new columns from raw.
UPDATE public.orders
SET dining_option = COALESCE(dining_option, loyverse_raw->>'dining_option'),
    loyverse_refund_for = COALESCE(loyverse_refund_for, loyverse_raw->>'refund_for')
WHERE source = 'loyverse' AND loyverse_raw IS NOT NULL;

-- Backfill pay-outs into the ledger now.
SELECT public.fn_sync_loyverse_payouts_to_ledger();

-- Hourly cron to keep the ledger in sync with new pay-outs (pure SQL, no http).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'loyverse-payouts-to-ledger') THEN
    PERFORM cron.unschedule('loyverse-payouts-to-ledger');
  END IF;
END $$;
SELECT cron.schedule('loyverse-payouts-to-ledger', '15 * * * *',
  $cron$ SELECT public.fn_sync_loyverse_payouts_to_ledger(); $cron$);

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '278_loyverse_payouts_to_ledger.sql',
  'claude-code',
  'PAY_OUT cash movements → expense_ledger (pending OpEx, idempotent via loyverse_cash_movement_id) + hourly cron. orders += dining_option, loyverse_refund_for; fn_ingest populates them; backfill from raw.'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
