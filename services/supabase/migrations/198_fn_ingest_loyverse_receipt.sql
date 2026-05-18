-- Migration 198 — fn_ingest_loyverse_receipt RPC
-- Idempotent ingest of a Loyverse receipt payload into orders + order_items + order_item_modifiers.
-- SECURITY DEFINER; called by T5 webhook handler with the full Loyverse receipt JSON.

BEGIN;

CREATE OR REPLACE FUNCTION fn_ingest_loyverse_receipt(p_receipt JSONB)
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
  SELECT id INTO v_order_id FROM orders WHERE loyverse_receipt_id = v_receipt_id;
  IF v_order_id IS NOT NULL THEN RETURN v_order_id; END IF;

  -- Insert the order row.
  INSERT INTO orders (source, status, loyverse_receipt_id, loyverse_raw,
                      received_at, total_amount)
  VALUES ('loyverse', 'received', v_receipt_id, p_receipt, now(),
          COALESCE(NULLIF(p_receipt->>'total_money', '')::numeric, 0))
  RETURNING id INTO v_order_id;

  -- Process each line item.
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_receipt->'line_items')
  LOOP
    v_order_item_id := NULL;
    INSERT INTO order_items (order_id, nomenclature_id, quantity, price_at_purchase)
    SELECT v_order_id, n.id,
           (v_line->>'quantity')::numeric,
           COALESCE(NULLIF(v_line->>'price', '')::numeric, 0)
    FROM nomenclature n
    WHERE n.loyverse_item_id = v_line->>'item_id'
    RETURNING id INTO v_order_item_id;

    -- If no nomenclature mapping exists for this Loyverse item, skip modifiers
    -- entirely; otherwise we'd attach them to a stale order_item_id from a prior
    -- loop iteration or violate the NOT NULL FK.
    IF v_order_item_id IS NULL THEN
      CONTINUE;
    END IF;

    -- Process each modifier on the line item.
    FOR v_mod IN SELECT * FROM jsonb_array_elements(
      COALESCE(v_line->'line_modifiers', '[]'::jsonb))
    LOOP
      -- Attempt to join against the admin-panel mapping.
      INSERT INTO order_item_modifiers (
        order_item_id, modifier_option_id, modifier_id, slot,
        quantity, price_delta_paid,
        loyverse_modifier_id, loyverse_modifier_name
      )
      SELECT v_order_item_id, nmo.id, nmo.modifier_id, nmo.slot,
             COALESCE((v_mod->>'quantity')::numeric, 1),
             COALESCE((v_mod->>'total_price')::numeric, 0),
             v_mod->>'modifier_option_id',
             v_mod->>'name'
      FROM nomenclature_modifier_options nmo
      WHERE nmo.loyverse_modifier_id = v_mod->>'modifier_option_id'
      LIMIT 1;

      -- If mapping missing: row is still written with NULL modifier_option_id,
      -- modifier_id, slot — Loyverse snapshots preserved for backfill.
      IF NOT FOUND THEN
        INSERT INTO order_item_modifiers (
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

  RETURN v_order_id;
END;
$$;

INSERT INTO migration_log (filename, applied_by, notes)
VALUES (
  '198_fn_ingest_loyverse_receipt.sql',
  'claude-code',
  'Idempotent RPC to ingest Loyverse receipt JSONB into orders + order_items + order_item_modifiers. Lego flow M4.'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
