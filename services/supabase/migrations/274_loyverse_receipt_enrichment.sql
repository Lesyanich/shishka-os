-- Migration 274 — Loyverse receipt enrichment (payment type, refunds, financial fields)
-- Why: первые продажи пошли; webhook принимает чеки, но в колонки вынесены только
-- сумма/позиции/модификаторы. Для аналитики и финансов структурируем способ оплаты,
-- возвраты, скидки/налоги/чаевые, кассира/клиента/устройство. Полный чек по-прежнему
-- лежит в orders.loyverse_raw.
--
-- Changes:
--   1. orders += payment_type, receipt_type, cancelled_at, loyverse_customer_id,
--      loyverse_employee_id, loyverse_pos_device_id, total_discount, total_tax, tip,
--      loyverse_created_at, loyverse_updated_at
--   2. fn_deduct_order_bom(p_order_id, p_sign, p_reason) — обобщён знаком, чтобы
--      возвраты (REFUND) возвращали BOM в склад, а не списывали.
--   3. fn_ingest_loyverse_receipt — парсит новые поля; для REFUND начисляет BOM (+1),
--      для отменённых чеков (cancelled_at) BOM не трогает.
--
-- Совместимость: и webhook (loyverse-receipt), и поллер (loyverse-pull) вызывают тот же
-- идемпотентный fn_ingest_loyverse_receipt — структура чека из webhook и REST API совпадает.

BEGIN;

-- ─── 1. Enrich orders ───
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_type           TEXT,
  ADD COLUMN IF NOT EXISTS receipt_type           TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_at           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS loyverse_customer_id   TEXT,
  ADD COLUMN IF NOT EXISTS loyverse_employee_id   TEXT,
  ADD COLUMN IF NOT EXISTS loyverse_pos_device_id TEXT,
  ADD COLUMN IF NOT EXISTS total_discount         NUMERIC,
  ADD COLUMN IF NOT EXISTS total_tax              NUMERIC,
  ADD COLUMN IF NOT EXISTS tip                    NUMERIC,
  ADD COLUMN IF NOT EXISTS loyverse_created_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS loyverse_updated_at    TIMESTAMPTZ;

COMMENT ON COLUMN public.orders.payment_type IS
  'Loyverse payment type (CASH/CARD/OTHER), or ''split'' when receipt has multiple payments. Extracted from payments[].';
COMMENT ON COLUMN public.orders.receipt_type IS
  'Loyverse receipt_type: SALE or REFUND. REFUND adds BOM back to stock.';
COMMENT ON COLUMN public.orders.loyverse_updated_at IS
  'Loyverse receipt updated_at — high-water-mark source for the loyverse-pull cursor.';

-- index for cursor / reporting queries
CREATE INDEX IF NOT EXISTS idx_orders_loyverse_updated
  ON public.orders(loyverse_updated_at DESC) WHERE source = 'loyverse';
CREATE INDEX IF NOT EXISTS idx_orders_receipt_type
  ON public.orders(receipt_type) WHERE source = 'loyverse';

-- ─── 2. fn_deduct_order_bom — audit-only, generalised with sign + reason ───
-- Audit-only (matches mig 200): writes one stock_movements row per depth=1 BOM
-- leaf; does NOT touch a balance table (inventory_balances was dropped in mig 058;
-- sku_balances needs FIFO/batch selection — deferred to a future RPC).
-- p_sign = -1 (default) → sale (negative qty_delta); p_sign = +1 → refund (positive).
-- p_reason labels stock_movements rows ('loyverse_sale' | 'loyverse_refund').
CREATE OR REPLACE FUNCTION public.fn_deduct_order_bom(
  p_order_id UUID,
  p_sign     INT  DEFAULT -1,
  p_reason   TEXT DEFAULT 'loyverse_sale'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_already TIMESTAMPTZ;
  v_item    RECORD;
  v_mod     RECORD;
  v_leaf    RECORD;
BEGIN
  SELECT bom_deducted_at INTO v_already
  FROM public.orders WHERE id = p_order_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'fn_deduct_order_bom: order % not found', p_order_id;
  END IF;

  IF v_already IS NOT NULL THEN
    RETURN; -- idempotent
  END IF;

  FOR v_item IN
    SELECT id AS order_item_id, nomenclature_id, quantity
    FROM public.order_items
    WHERE order_id = p_order_id
  LOOP
    FOR v_leaf IN
      SELECT nomenclature_id AS nom_id, required_qty
      FROM public.fn_explode_bom(v_item.nomenclature_id, v_item.quantity)
      WHERE depth = 1
    LOOP
      INSERT INTO public.stock_movements (
        nomenclature_id, qty_delta, reason,
        order_id, order_item_id, notes
      ) VALUES (
        v_leaf.nom_id, p_sign * v_leaf.required_qty, p_reason,
        p_order_id, v_item.order_item_id,
        'audit-only; balance reconciliation deferred to FIFO RPC'
      );
    END LOOP;
  END LOOP;

  FOR v_mod IN
    SELECT oim.id AS oim_id, oim.order_item_id, oim.modifier_id,
           oim.quantity AS mod_qty, oi.quantity AS item_qty
    FROM public.order_item_modifiers oim
    JOIN public.order_items oi ON oi.id = oim.order_item_id
    WHERE oi.order_id = p_order_id
      AND oim.modifier_id IS NOT NULL
  LOOP
    FOR v_leaf IN
      SELECT nomenclature_id AS nom_id, required_qty
      FROM public.fn_explode_bom(v_mod.modifier_id, v_mod.mod_qty * v_mod.item_qty)
      WHERE depth = 1
    LOOP
      INSERT INTO public.stock_movements (
        nomenclature_id, qty_delta, reason,
        order_id, order_item_id, order_item_modifier_id, notes
      ) VALUES (
        v_leaf.nom_id, p_sign * v_leaf.required_qty, p_reason,
        p_order_id, v_mod.order_item_id, v_mod.oim_id,
        'audit-only; balance reconciliation deferred to FIFO RPC'
      );
    END LOOP;
  END LOOP;

  UPDATE public.orders SET bom_deducted_at = now() WHERE id = p_order_id;
END;
$$;

COMMENT ON FUNCTION public.fn_deduct_order_bom(UUID, INT, TEXT) IS
  'Audit-only BOM consumption log (extends mig 200). One stock_movements row per depth=1 BOM leaf. p_sign=-1 sale, +1 refund; p_reason labels rows. No balance table write. Idempotent via orders.bom_deducted_at.';

-- ─── 3. fn_ingest_loyverse_receipt — enriched ───
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
  -- Idempotency: if already ingested, return existing order id immediately.
  SELECT id INTO v_order_id FROM public.orders WHERE loyverse_receipt_id = v_receipt_id;
  IF v_order_id IS NOT NULL THEN RETURN v_order_id; END IF;

  -- Derive payment type: 'split' for multi-payment, else first payment's type/name.
  IF jsonb_typeof(v_payments) = 'array' AND jsonb_array_length(v_payments) > 1 THEN
    v_payment_type := 'split';
  ELSIF jsonb_typeof(v_payments) = 'array' AND jsonb_array_length(v_payments) = 1 THEN
    v_payment_type := COALESCE(v_payments->0->>'type', v_payments->0->>'name');
  END IF;

  -- Insert the order row.
  INSERT INTO public.orders (
    source, status, loyverse_receipt_id, loyverse_raw, received_at, total_amount,
    payment_type, receipt_type, cancelled_at,
    loyverse_customer_id, loyverse_employee_id, loyverse_pos_device_id,
    total_discount, total_tax, tip,
    loyverse_created_at, loyverse_updated_at
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
    NULLIF(p_receipt->>'updated_at', '')::timestamptz
  )
  RETURNING id INTO v_order_id;

  -- Process each line item.
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

  -- BOM inventory effect (same transaction):
  --   • cancelled receipt          → skip entirely (no stock effect)
  --   • REFUND                      → add BOM back to stock (+1)
  --   • SALE                        → deduct BOM (-1)
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

COMMENT ON FUNCTION public.fn_ingest_loyverse_receipt(JSONB) IS
  'Idempotent ingest of Loyverse receipt → orders/order_items/order_item_modifiers + financial fields. REFUND adds BOM back, cancelled skips, SALE deducts. Called by loyverse-receipt webhook and loyverse-pull poller.';

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '274_loyverse_receipt_enrichment.sql',
  'claude-code',
  'Enrich orders with payment_type/receipt_type/refund/financial fields; generalise fn_deduct_order_bom with sign+reason; fn_ingest handles REFUND (BOM back) and cancelled (skip). Backbone for loyverse-pull poller.'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
