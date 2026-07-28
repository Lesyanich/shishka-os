-- 382_procurement_v2_hardening.sql
-- Procurement v2 — hardening pass after the code review of PR #540.
-- Fixes review findings #6 and #7 (blocking, security), plus four smaller
-- integrity gaps found in the same review.
-- Spec: docs/projects/admin/plans/spec-procurement-v2-mint-handoff.md
-- MC task: 6df2f888-bbcf-4d20-8a51-cf15aa88d9da
--
-- Verified before writing (2026-07-27): purchase_orders 0 rows, po_lines 0 rows,
-- stock_request_lines 0 rows, no negative prices or fees -> every CHECK below
-- validates immediately, no NOT VALID needed.
-- Numbered 382: drafted as 380, but parallel sessions took 380 and 381 while
-- this SQL was waiting for CEO approval. Re-checked free at apply time.
--
-- SECTION MAP (each is independent — any section can be struck before applying):
--   1. #7  auth guard on fn_create_purchase_order + EXECUTE revoked from anon/PUBLIC
--   2. #6  request_line_ids UPDATE scoped
--   3. M3  reject a patch that both deletes and updates the same line
--   4. M4  an order must keep at least one line
--   5. DUP friendly message when a product is added to the same order twice
--   6. M5  no negative prices / delivery fees (DB-level)
--   7. M6  supplier-files bucket: size limit + MIME allow-list, matching receipts
--   8. L11 can_create_orders seeded for owners + task_manager (lockout guard)

-- ============================================================
-- 1+2+5. fn_create_purchase_order — auth guard, scoped request
--        linkage, friendly duplicate message.
--        CREATE OR REPLACE, same (p_payload jsonb) signature.
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_create_purchase_order(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_po_id       UUID;
  v_po_number   TEXT;
  v_line        JSONB;
  v_line_id     UUID;
  v_line_count  INTEGER := 0;
  v_sort        SMALLINT := 0;
  v_unit_price  NUMERIC;
  v_qty         NUMERIC;
  v_station     UUID;
  v_constraint  TEXT;
BEGIN
  -- #7: this function is SECURITY DEFINER and therefore bypasses RLS.
  -- Without this guard anon could mint purchase orders via /rest/v1/rpc.
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  IF p_payload->>'supplier_id' IS NULL OR p_payload->>'supplier_id' = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'supplier_id is required');
  END IF;

  IF p_payload->'lines' IS NULL OR jsonb_array_length(p_payload->'lines') = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'At least one line item is required');
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_payload->'lines')
  LOOP
    IF (v_line->>'nomenclature_id') IS NULL OR (v_line->>'nomenclature_id') = '' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Each line item must reference a product');
    END IF;
    v_qty := (v_line->>'qty_ordered')::NUMERIC;
    IF v_qty IS NULL OR v_qty <= 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Quantity must be greater than 0 for every line item');
    END IF;
  END LOOP;

  v_station := NULLIF(p_payload->>'deliver_to_station_id', '')::UUID;

  INSERT INTO public.purchase_orders (
    supplier_id, expected_date, notes, created_by,
    deliver_to_station_id, delivery_window, delivery_fee
  ) VALUES (
    (p_payload->>'supplier_id')::UUID,
    (p_payload->>'expected_date')::DATE,
    p_payload->>'notes',
    auth.uid(),
    v_station,
    NULLIF(p_payload->>'delivery_window', ''),
    COALESCE((p_payload->>'delivery_fee')::NUMERIC, 0)
  )
  RETURNING id, po_number INTO v_po_id, v_po_number;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_payload->'lines')
  LOOP
    v_sort := v_sort + 1;
    v_unit_price := (v_line->>'unit_price_expected')::NUMERIC;

    IF v_unit_price IS NULL THEN
      SELECT sc.last_seen_price INTO v_unit_price
      FROM public.supplier_catalog sc
      WHERE sc.supplier_id = (p_payload->>'supplier_id')::UUID
        AND (
          (NULLIF(v_line->>'sku_id', '') IS NOT NULL AND sc.sku_id = (v_line->>'sku_id')::UUID)
          OR sc.nomenclature_id = (v_line->>'nomenclature_id')::UUID
        )
      ORDER BY
        CASE WHEN sc.sku_id IS NOT NULL THEN 0 ELSE 1 END,
        sc.match_count DESC
      LIMIT 1;
    END IF;

    INSERT INTO public.po_lines (
      po_id, nomenclature_id, sku_id,
      qty_ordered, unit, unit_price_expected,
      destination_station_id, sort_order, notes
    ) VALUES (
      v_po_id,
      (v_line->>'nomenclature_id')::UUID,
      NULLIF(v_line->>'sku_id', '')::UUID,
      (v_line->>'qty_ordered')::NUMERIC,
      COALESCE(NULLIF(v_line->>'unit', ''), 'pcs'),
      v_unit_price,
      COALESCE(NULLIF(v_line->>'destination_station_id', '')::UUID, v_station),
      v_sort,
      v_line->>'notes'
    )
    RETURNING id INTO v_line_id;

    -- #6: was an unscoped `WHERE id IN (...)`, which let any caller re-point
    -- EVERY stock_request_line in the DB at their own PO line (RLS is bypassed
    -- here). Now: only lines that are still unlinked, and only where the
    -- product actually matches the line that claims to fulfil them.
    IF v_line ? 'request_line_ids' AND jsonb_array_length(v_line->'request_line_ids') > 0 THEN
      UPDATE public.stock_request_lines srl
      SET po_line_id = v_line_id
      WHERE srl.id IN (SELECT (jsonb_array_elements_text(v_line->'request_line_ids'))::uuid)
        AND srl.po_line_id IS NULL
        AND srl.nomenclature_id = (v_line->>'nomenclature_id')::UUID;
    END IF;

    v_line_count := v_line_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true, 'po_id', v_po_id, 'po_number', v_po_number, 'line_count', v_line_count
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

-- ============================================================
-- 3+4+5. fn_update_po — reject delete/update of the same line in
--        one patch, keep at least one line, friendly duplicate.
-- ============================================================
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
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_po_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Purchase order not found');
  END IF;

  IF v_po.status NOT IN ('draft', 'submitted', 'confirmed') THEN
    RETURN jsonb_build_object('ok', false,
      'error', 'Order is not editable in status ' || v_po.status::text);
  END IF;

  -- M3: deleting and updating the same line in one patch used to return
  -- ok:true while the UPDATE silently matched zero rows (the DELETE ran first).
  -- The caller was told the edit landed; it had not.
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

  -- M4: fn_create_purchase_order refuses to create an order with no lines;
  -- update had no such floor, so a patch could empty a submitted order.
  -- RAISE (not RETURN) so the exception block rolls back everything above.
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

-- ============================================================
-- 1b. #7 — take EXECUTE away from anon and PUBLIC.
--     Verified pre-migration ACL on BOTH functions:
--       =X/postgres (PUBLIC), anon=X, authenticated=X, service_role=X
--     PUBLIC must be revoked too, otherwise anon inherits through it.
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.fn_create_purchase_order(jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_update_po(uuid, jsonb)       FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.fn_create_purchase_order(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_update_po(uuid, jsonb)       TO authenticated, service_role;

-- ============================================================
-- 6. M5 — prices and fees cannot go negative.
--    qty is defended by two CHECKs already; price had none, and a negative
--    grand_total would be sent to a supplier by the Copy-order text.
--    Tables are empty (verified), so these validate immediately.
-- ============================================================
ALTER TABLE public.po_lines
  ADD CONSTRAINT po_lines_unit_price_non_negative
  CHECK (unit_price_expected IS NULL OR unit_price_expected >= 0);

ALTER TABLE public.purchase_orders
  ADD CONSTRAINT purchase_orders_money_non_negative
  CHECK (
    COALESCE(delivery_fee, 0)   >= 0 AND
    COALESCE(discount_total, 0) >= 0 AND
    COALESCE(vat_amount, 0)     >= 0
  );

-- ============================================================
-- 7. M6 — supplier-files bucket config now matches receipts.
--    379 claimed parity but only the POLICY quals matched; the bucket itself
--    had no size limit and no MIME allow-list (unbounded upload + arbitrary
--    MIME on the storage origin, which Phase C will hand out signed URLs for).
-- ============================================================
UPDATE storage.buckets
SET file_size_limit   = 15728640,  -- 15 MB, same as receipts
    allowed_mime_types = ARRAY['application/pdf','image/jpeg','image/png','image/webp']
WHERE id = 'supplier-files';

-- ============================================================
-- 8. L11 — seed the ordering toggle so Phase B's gate cannot lock out the
--    people who are supposed to order. Every active staff row is currently
--    false, including both owners and Mint (task_manager).
-- ============================================================
UPDATE public.staff
SET can_create_orders = true
WHERE is_active = true
  AND app_role IN ('owner', 'task_manager');

-- ============================================================
-- 9. Self-register (RULE-MIGRATION-TRACKING, checksum NULL)
-- ============================================================
INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '382_procurement_v2_hardening.sql',
  'claude-code',
  NULL,
  'Procurement v2 hardening: auth guard + anon revoke on PO RPCs, scoped request_line_ids, duplicate/empty-order guards, non-negative money, supplier-files bucket limits, ordering toggle seed (MC 6df2f888)'
)
ON CONFLICT DO NOTHING;
