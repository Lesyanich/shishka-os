-- 383_po_editable_until_received.sql
-- CEO ruling 2026-07-27: a purchase order stays editable until `received`.
-- Resolves the spec's internal contradiction — §4.3 / §6.2 / §4.8 said "until
-- received", §8.1 said draft/submitted/confirmed, and the latter was what 379
-- implemented. §8.1 is the one that was wrong.
-- MC task: 6df2f888-bbcf-4d20-8a51-cf15aa88d9da
--
-- Why it matters: a shipped order is exactly when a quantity correction or an
-- unload destination is learned. Under the old guard Mint could not fix either
-- once the truck left the supplier.
--
-- Widening the window means edits can now land on orders that ALREADY have
-- receiving activity, so this migration adds the two guards that were not
-- needed before:
--   G1. A line's qty_ordered may not drop below what has already been received
--       against it (otherwise qty_remaining goes negative and the receiving
--       screen shows nonsense).
--   G2. A line that has receiving activity may not be deleted. Without this the
--       FK receiving_lines.po_line_id -> po_lines(id) ON DELETE SET NULL would
--       silently orphan the received quantities from the order they belong to
--       — verified live: that FK really is ON DELETE SET NULL, and
--       receiving_lines currently holds 361 rows.
--
-- Everything else in fn_update_po is carried over unchanged from 382.

CREATE OR REPLACE FUNCTION public.fn_update_po(p_po_id uuid, p_patch jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_po          public.purchase_orders%ROWTYPE;
  v_line        jsonb;
  v_qty         numeric;
  v_exists      boolean;
  v_sort        smallint;
  v_line_count  integer;
  v_subtotal    numeric;
  v_grand       numeric;
  v_constraint  text;
  v_received    numeric;
  v_name        text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_po_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Purchase order not found');
  END IF;

  -- CEO ruling: editable until `received`. Excluded: received, reconciled,
  -- cancelled — past those the order is financial history.
  IF v_po.status NOT IN ('draft', 'submitted', 'confirmed', 'shipped', 'partially_received') THEN
    RETURN jsonb_build_object('ok', false,
      'error', 'Order is not editable in status ' || v_po.status::text);
  END IF;

  IF p_patch ? 'lines_delete' AND p_patch ? 'lines_upsert' THEN
    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(p_patch->'lines_delete') d(id)
      JOIN jsonb_array_elements(p_patch->'lines_upsert') u(line)
        ON (u.line->>'id') = d.id
    ) THEN
      RETURN jsonb_build_object('ok', false,
        'error', 'The same line cannot be edited and removed in one change');
    END IF;
  END IF;

  -- G2: refuse to delete a line that has already been received against.
  IF p_patch ? 'lines_delete' THEN
    SELECT n.name INTO v_name
    FROM public.po_lines pl
    JOIN public.nomenclature n ON n.id = pl.nomenclature_id
    WHERE pl.po_id = p_po_id
      AND pl.id IN (SELECT (jsonb_array_elements_text(p_patch->'lines_delete'))::uuid)
      AND EXISTS (
        SELECT 1 FROM public.receiving_lines rl
        WHERE rl.po_line_id = pl.id
          AND COALESCE(rl.qty_received, 0) > 0
      )
    LIMIT 1;

    IF v_name IS NOT NULL THEN
      RETURN jsonb_build_object('ok', false,
        'error', v_name || ' has already been received — it cannot be removed from the order');
    END IF;
  END IF;

  IF p_patch ? 'lines_upsert' THEN
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_patch->'lines_upsert')
    LOOP
      IF (v_line->>'id') IS NULL THEN
        IF (v_line->>'nomenclature_id') IS NULL OR (v_line->>'nomenclature_id') = '' THEN
          RETURN jsonb_build_object('ok', false, 'error', 'New lines must reference a product');
        END IF;
        v_qty := (v_line->>'qty_ordered')::numeric;
        IF v_qty IS NULL OR v_qty <= 0 THEN
          RETURN jsonb_build_object('ok', false, 'error', 'Quantity must be greater than 0 for every line');
        END IF;
      ELSE
        SELECT EXISTS (
          SELECT 1 FROM public.po_lines
          WHERE id = (v_line->>'id')::uuid AND po_id = p_po_id
        ) INTO v_exists;
        IF NOT v_exists THEN
          RETURN jsonb_build_object('ok', false, 'error', 'Line does not belong to this order');
        END IF;
        IF v_line ? 'qty_ordered' THEN
          v_qty := (v_line->>'qty_ordered')::numeric;
          IF v_qty IS NULL OR v_qty <= 0 THEN
            RETURN jsonb_build_object('ok', false, 'error', 'Quantity must be greater than 0 for every line');
          END IF;

          -- G1: never below what has already been received against this line.
          SELECT COALESCE(SUM(rl.qty_received), 0) INTO v_received
          FROM public.receiving_lines rl
          WHERE rl.po_line_id = (v_line->>'id')::uuid;

          IF v_received > 0 AND v_qty < v_received THEN
            SELECT n.name INTO v_name
            FROM public.po_lines pl
            JOIN public.nomenclature n ON n.id = pl.nomenclature_id
            WHERE pl.id = (v_line->>'id')::uuid;

            RETURN jsonb_build_object('ok', false,
              'error', COALESCE(v_name, 'This line') || ': ' || v_received::text ||
                       ' already received, quantity cannot be set below that');
          END IF;
        END IF;
      END IF;
    END LOOP;
  END IF;

  UPDATE public.purchase_orders SET
    expected_date         = CASE WHEN p_patch ? 'expected_date'
                                 THEN NULLIF(p_patch->>'expected_date', '')::date
                                 ELSE expected_date END,
    delivery_window       = CASE WHEN p_patch ? 'delivery_window'
                                 THEN NULLIF(p_patch->>'delivery_window', '')
                                 ELSE delivery_window END,
    notes                 = CASE WHEN p_patch ? 'notes'
                                 THEN p_patch->>'notes'
                                 ELSE notes END,
    delivery_fee          = CASE WHEN p_patch ? 'delivery_fee'
                                 THEN COALESCE((p_patch->>'delivery_fee')::numeric, 0)
                                 ELSE delivery_fee END,
    deliver_to_station_id = CASE WHEN p_patch ? 'deliver_to_station_id'
                                 THEN NULLIF(p_patch->>'deliver_to_station_id', '')::uuid
                                 ELSE deliver_to_station_id END
  WHERE id = p_po_id;

  IF p_patch ? 'lines_delete' THEN
    DELETE FROM public.po_lines
    WHERE po_id = p_po_id
      AND id IN (SELECT (jsonb_array_elements_text(p_patch->'lines_delete'))::uuid);
  END IF;

  IF p_patch ? 'lines_upsert' THEN
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_patch->'lines_upsert')
    LOOP
      IF (v_line->>'id') IS NOT NULL THEN
        UPDATE public.po_lines SET
          qty_ordered            = CASE WHEN v_line ? 'qty_ordered'
                                        THEN (v_line->>'qty_ordered')::numeric
                                        ELSE qty_ordered END,
          unit                   = CASE WHEN v_line ? 'unit'
                                        THEN COALESCE(NULLIF(v_line->>'unit', ''), unit)
                                        ELSE unit END,
          unit_price_expected    = CASE WHEN v_line ? 'unit_price_expected'
                                        THEN NULLIF(v_line->>'unit_price_expected', '')::numeric
                                        ELSE unit_price_expected END,
          destination_station_id = CASE WHEN v_line ? 'destination_station_id'
                                        THEN NULLIF(v_line->>'destination_station_id', '')::uuid
                                        ELSE destination_station_id END,
          notes                  = CASE WHEN v_line ? 'notes'
                                        THEN v_line->>'notes'
                                        ELSE notes END
        WHERE id = (v_line->>'id')::uuid AND po_id = p_po_id;
      ELSE
        SELECT COALESCE(MAX(sort_order), 0) + 1 INTO v_sort
        FROM public.po_lines WHERE po_id = p_po_id;

        INSERT INTO public.po_lines (
          po_id, nomenclature_id, sku_id, qty_ordered, unit,
          unit_price_expected, destination_station_id, sort_order, notes
        ) VALUES (
          p_po_id,
          (v_line->>'nomenclature_id')::uuid,
          NULLIF(v_line->>'sku_id', '')::uuid,
          (v_line->>'qty_ordered')::numeric,
          COALESCE(NULLIF(v_line->>'unit', ''), 'pcs'),
          NULLIF(v_line->>'unit_price_expected', '')::numeric,
          COALESCE(
            NULLIF(v_line->>'destination_station_id', '')::uuid,
            (SELECT deliver_to_station_id FROM public.purchase_orders WHERE id = p_po_id)
          ),
          v_sort,
          v_line->>'notes'
        );
      END IF;
    END LOOP;
  END IF;

  SELECT COUNT(*)::int INTO v_line_count FROM public.po_lines WHERE po_id = p_po_id;

  IF v_line_count = 0 THEN
    RAISE EXCEPTION 'An order must keep at least one line — cancel the order instead';
  END IF;

  UPDATE public.purchase_orders po
  SET subtotal    = roll.s,
      grand_total = roll.s
                    - COALESCE(po.discount_total, 0)
                    + COALESCE(po.vat_amount, 0)
                    + COALESCE(po.delivery_fee, 0)
  FROM (
    SELECT COALESCE(SUM(pl.total_expected), 0) AS s
    FROM public.po_lines pl
    WHERE pl.po_id = p_po_id
  ) roll
  WHERE po.id = p_po_id;

  SELECT po.subtotal, po.grand_total INTO v_subtotal, v_grand
  FROM public.purchase_orders po WHERE po.id = p_po_id;

  RETURN jsonb_build_object(
    'ok', true, 'po_id', p_po_id, 'line_count', v_line_count,
    'subtotal', v_subtotal, 'grand_total', v_grand
  );

EXCEPTION
  WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint = 'idx_pol_unique_item' THEN
      RETURN jsonb_build_object('ok', false,
        'error', 'This product is already on the order — change the quantity on the existing line instead of adding it twice');
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$function$;

-- Self-register (RULE-MIGRATION-TRACKING, checksum NULL)
INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '383_po_editable_until_received.sql',
  'claude-code',
  NULL,
  'PO editable until received (CEO ruling): fn_update_po accepts shipped + partially_received, and gains guards against dropping qty below what was received or deleting an already-received line (MC 6df2f888)'
)
ON CONFLICT DO NOTHING;
