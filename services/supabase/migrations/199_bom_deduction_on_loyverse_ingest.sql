-- Migration 199 — BOM deduction on Loyverse receipt ingest (T5 webhook backend)
-- Adds:
--   1. stock_movements audit table (every deduction logs here)
--   2. orders.bom_deducted_at idempotency flag
--   3. loyverse_webhook_dead_letter table (HMAC/parse failures land here)
--   4. fn_deduct_order_bom(p_order_id) — walks order_items + order_item_modifiers,
--      reuses fn_explode_bom at depth=1, decrements inventory_balances
--   5. CREATE OR REPLACE fn_ingest_loyverse_receipt — chains in fn_deduct_order_bom
--      at the end of the first-insert path (idempotent path skips deduction)

BEGIN;

-- ─── 1. stock_movements audit table ───
CREATE TABLE public.stock_movements (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nomenclature_id          UUID NOT NULL REFERENCES public.nomenclature(id),
  qty_delta                NUMERIC NOT NULL,
  reason                   TEXT NOT NULL,
  order_id                 UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  order_item_id            UUID REFERENCES public.order_items(id) ON DELETE SET NULL,
  order_item_modifier_id   UUID REFERENCES public.order_item_modifiers(id) ON DELETE SET NULL,
  notes                    TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.stock_movements IS
  'Append-only audit of every inventory_balances mutation. reason=''loyverse_sale'' for receipt-driven deductions. Negative qty_delta = deduction.';

CREATE INDEX idx_stock_movements_order ON public.stock_movements(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX idx_stock_movements_nom   ON public.stock_movements(nomenclature_id);
CREATE INDEX idx_stock_movements_reason ON public.stock_movements(reason);

ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY auth_full_access ON public.stock_movements
  USING (fn_is_authenticated())
  WITH CHECK (fn_is_authenticated());

-- ─── 2. orders.bom_deducted_at idempotency flag ───
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS bom_deducted_at TIMESTAMPTZ;

COMMENT ON COLUMN public.orders.bom_deducted_at IS
  'Set by fn_deduct_order_bom when BOM has been deducted from inventory_balances. Idempotency guard prevents double-deduction on webhook retries.';

-- ─── 3. loyverse_webhook_dead_letter ───
CREATE TABLE public.loyverse_webhook_dead_letter (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_body     TEXT,
  signature    TEXT,
  headers      JSONB,
  error        TEXT NOT NULL,
  received_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.loyverse_webhook_dead_letter IS
  'Captures Loyverse webhook payloads that failed HMAC verification or JSON parsing. Inspected manually; not auto-retried.';

CREATE INDEX idx_loyverse_dlq_received ON public.loyverse_webhook_dead_letter(received_at DESC);

ALTER TABLE public.loyverse_webhook_dead_letter ENABLE ROW LEVEL SECURITY;
CREATE POLICY auth_full_access ON public.loyverse_webhook_dead_letter
  USING (fn_is_authenticated())
  WITH CHECK (fn_is_authenticated());

-- ─── 4. fn_deduct_order_bom ───
-- Deducts at depth=1 of the BOM tree (direct components of SALE-* or MOD-*),
-- which is what L2 physically pulls from stock on assembly. Future enhancement:
-- per-location stock (current inventory_balances is single global balance).
CREATE OR REPLACE FUNCTION public.fn_deduct_order_bom(p_order_id UUID)
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
  -- Lock the order row and check idempotency
  SELECT bom_deducted_at INTO v_already
  FROM public.orders WHERE id = p_order_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'fn_deduct_order_bom: order % not found', p_order_id;
  END IF;

  IF v_already IS NOT NULL THEN
    RETURN; -- already deducted
  END IF;

  -- Walk each order_item: deduct depth=1 BOM components scaled by line quantity
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
      INSERT INTO public.inventory_balances (nomenclature_id, quantity, last_counted_at)
      VALUES (v_leaf.nom_id, -v_leaf.required_qty, now())
      ON CONFLICT (nomenclature_id) DO UPDATE
        SET quantity = public.inventory_balances.quantity - v_leaf.required_qty,
            last_counted_at = now();

      INSERT INTO public.stock_movements (
        nomenclature_id, qty_delta, reason,
        order_id, order_item_id, notes
      ) VALUES (
        v_leaf.nom_id, -v_leaf.required_qty, 'loyverse_sale',
        p_order_id, v_item.order_item_id, NULL
      );
    END LOOP;
  END LOOP;

  -- Walk each order_item_modifier with a bound modifier_id (MOD-* nomenclature).
  -- Unbound (NULL modifier_id) modifiers are skipped: backfill happens via
  -- fn_backfill_unmapped_order_modifiers once admin binds the option.
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
      INSERT INTO public.inventory_balances (nomenclature_id, quantity, last_counted_at)
      VALUES (v_leaf.nom_id, -v_leaf.required_qty, now())
      ON CONFLICT (nomenclature_id) DO UPDATE
        SET quantity = public.inventory_balances.quantity - v_leaf.required_qty,
            last_counted_at = now();

      INSERT INTO public.stock_movements (
        nomenclature_id, qty_delta, reason,
        order_id, order_item_id, order_item_modifier_id, notes
      ) VALUES (
        v_leaf.nom_id, -v_leaf.required_qty, 'loyverse_sale',
        p_order_id, v_mod.order_item_id, v_mod.oim_id, NULL
      );
    END LOOP;
  END LOOP;

  UPDATE public.orders SET bom_deducted_at = now() WHERE id = p_order_id;
END;
$$;

COMMENT ON FUNCTION public.fn_deduct_order_bom(UUID) IS
  'Deducts BOM components (depth=1) for an order from inventory_balances and logs to stock_movements. Idempotent via orders.bom_deducted_at. Called at the tail of fn_ingest_loyverse_receipt on first insert.';

-- ─── 5. CREATE OR REPLACE fn_ingest_loyverse_receipt ───
-- Re-issued from mig 198 with one addition: PERFORM fn_deduct_order_bom(v_order_id)
-- before RETURN, on the first-insert path only (idempotent early-return preserves
-- existing behavior: returns the same order_id without re-deducting).
CREATE OR REPLACE FUNCTION public.fn_ingest_loyverse_receipt(p_receipt JSONB)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_receipt_id TEXT := p_receipt->>'receipt_number';
  v_order_id UUID;
  v_line JSONB;
  v_mod JSONB;
  v_order_item_id UUID;
BEGIN
  -- Idempotency: if already ingested, return existing order id immediately.
  SELECT id INTO v_order_id FROM public.orders WHERE loyverse_receipt_id = v_receipt_id;
  IF v_order_id IS NOT NULL THEN RETURN v_order_id; END IF;

  -- Insert the order row.
  INSERT INTO public.orders (source, status, loyverse_receipt_id, loyverse_raw,
                             received_at, total_amount)
  VALUES ('loyverse', 'received', v_receipt_id, p_receipt, now(),
          COALESCE(NULLIF(p_receipt->>'total_money', '')::numeric, 0))
  RETURNING id INTO v_order_id;

  -- Process each line item.
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_receipt->'line_items')
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

  -- Chain BOM deduction in same transaction (atomic with order insert).
  PERFORM public.fn_deduct_order_bom(v_order_id);

  RETURN v_order_id;
END;
$$;

COMMENT ON FUNCTION public.fn_ingest_loyverse_receipt(JSONB) IS
  'Idempotent ingest of Loyverse receipt → orders/order_items/order_item_modifiers. Chains fn_deduct_order_bom for first-insert path. Called by loyverse-receipt Edge Function.';

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '199_bom_deduction_on_loyverse_ingest.sql',
  'claude-code',
  'Add stock_movements audit + loyverse_webhook_dead_letter + fn_deduct_order_bom + bom_deducted_at idempotency. Chain deduction into fn_ingest_loyverse_receipt. Lego flow T5 backend.'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
