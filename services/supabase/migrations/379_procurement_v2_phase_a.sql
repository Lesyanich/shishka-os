-- 379_procurement_v2_phase_a.sql
-- Procurement v2 Phase A: editable POs (fn_update_po), per-station destinations,
-- receipt<->PO link, supplier links-hub groundwork, supplier_files inbox table,
-- supplier-files Storage bucket, v_order_builder view.
-- Spec: docs/projects/admin/plans/spec-procurement-v2-mint-handoff.md §5 Phase A / §8.1
-- MC task: 6df2f888-bbcf-4d20-8a51-cf15aa88d9da
-- Verified before writing (2026-07-27): stations live (11 active); po_lines.total_expected
-- is GENERATED (qty * COALESCE(price,0)); trg_po_lines_rollup already folds delivery_fee
-- into grand_total (no rollup extension needed); fn_create_purchase_order signature is
-- (p_payload jsonb) so CREATE OR REPLACE keeps identity (no overload trap).

-- ============================================================
-- 1. suppliers: links hub fields
-- ============================================================
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS line_id text,
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS default_delivery_fee numeric;

-- ============================================================
-- 2. purchase_orders: delivery window + deliver-to station
-- ============================================================
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS delivery_window text,
  ADD COLUMN IF NOT EXISTS deliver_to_station_id uuid REFERENCES public.stations(id);

CREATE INDEX IF NOT EXISTS idx_po_deliver_to_station
  ON public.purchase_orders (deliver_to_station_id)
  WHERE deliver_to_station_id IS NOT NULL;

-- ============================================================
-- 3. po_lines: per-line destination station
-- ============================================================
ALTER TABLE public.po_lines
  ADD COLUMN IF NOT EXISTS destination_station_id uuid REFERENCES public.stations(id);

CREATE INDEX IF NOT EXISTS idx_po_lines_destination_station
  ON public.po_lines (destination_station_id)
  WHERE destination_station_id IS NOT NULL;

-- ============================================================
-- 4. receipt_inbox: receipt <-> PO link (linked rows are excluded
--    from the standalone receipt flow in app code, Phase B)
-- ============================================================
ALTER TABLE public.receipt_inbox
  ADD COLUMN IF NOT EXISTS po_id uuid REFERENCES public.purchase_orders(id);

CREATE INDEX IF NOT EXISTS idx_receipt_inbox_po
  ON public.receipt_inbox (po_id)
  WHERE po_id IS NOT NULL;

-- ============================================================
-- 5. stock_requests / stock_request_lines: requester + station +
--    need->order linkage (drives requester-visible status chips)
-- ============================================================
ALTER TABLE public.stock_requests
  ADD COLUMN IF NOT EXISTS requested_by uuid REFERENCES public.staff(id),
  ADD COLUMN IF NOT EXISTS station_id uuid REFERENCES public.stations(id);

CREATE INDEX IF NOT EXISTS idx_stock_requests_station
  ON public.stock_requests (station_id)
  WHERE station_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_stock_requests_requested_by
  ON public.stock_requests (requested_by)
  WHERE requested_by IS NOT NULL;

-- ON DELETE SET NULL: fn_update_po may delete PO lines; the request line then
-- falls back to "requested" instead of breaking on a dangling FK.
ALTER TABLE public.stock_request_lines
  ADD COLUMN IF NOT EXISTS po_line_id uuid REFERENCES public.po_lines(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_stock_request_lines_po_line
  ON public.stock_request_lines (po_line_id)
  WHERE po_line_id IS NOT NULL;

-- ============================================================
-- 6. staff: ordering-role toggle (UI surface lands in task 6e4b56bf)
-- ============================================================
ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS can_create_orders boolean NOT NULL DEFAULT false;

-- ============================================================
-- 7. supplier_files: catalog files + Catalog Inbox queue
-- ============================================================
CREATE TABLE IF NOT EXISTS public.supplier_files (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id       uuid REFERENCES public.suppliers(id),
  supplier_name_raw text,            -- for new-supplier uploads (find-or-create at digitize time)
  kind              text NOT NULL CHECK (kind IN ('pdf','image','link')),
  title             text,
  storage_path      text,            -- path inside the supplier-files bucket
  url               text,            -- Drive or external link (kind='link')
  uploaded_by       uuid,
  ingest_status     text NOT NULL DEFAULT 'library'
                    CHECK (ingest_status IN ('library','new','to_digitize','digitized','rejected')),
  reviewed_at       timestamptz,
  digitized_at      timestamptz,
  digitized_rows    integer,
  review_note       text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.supplier_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS supplier_files_auth_all ON public.supplier_files;
CREATE POLICY supplier_files_auth_all ON public.supplier_files
  FOR ALL TO authenticated
  USING (fn_is_authenticated())
  WITH CHECK (fn_is_authenticated());

CREATE INDEX IF NOT EXISTS idx_supplier_files_supplier
  ON public.supplier_files (supplier_id)
  WHERE supplier_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_supplier_files_status
  ON public.supplier_files (ingest_status);

-- ============================================================
-- 8. Storage: private supplier-files bucket + policies
--    (quals mirror the receipts bucket: read/insert/update for
--    authenticated, delete owner-only)
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('supplier-files', 'supplier-files', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS supplier_files_select_authenticated ON storage.objects;
CREATE POLICY supplier_files_select_authenticated ON storage.objects
  FOR SELECT USING (bucket_id = 'supplier-files' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS supplier_files_insert_authenticated ON storage.objects;
CREATE POLICY supplier_files_insert_authenticated ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'supplier-files' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS supplier_files_update_authenticated ON storage.objects;
CREATE POLICY supplier_files_update_authenticated ON storage.objects
  FOR UPDATE USING (bucket_id = 'supplier-files' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS supplier_files_delete_owner_only ON storage.objects;
CREATE POLICY supplier_files_delete_owner_only ON storage.objects
  FOR DELETE USING (bucket_id = 'supplier-files' AND fn_is_owner());

-- ============================================================
-- 9. fn_update_po: edit header + upsert/delete lines while the
--    order is still active (draft/submitted/confirmed)
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

  -- Validate ALL upsert lines BEFORE any write (mirror fn_create_purchase_order)
  IF p_patch ? 'lines_upsert' THEN
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_patch->'lines_upsert')
    LOOP
      IF (v_line->>'id') IS NULL THEN
        -- new line: product + qty required
        IF (v_line->>'nomenclature_id') IS NULL OR (v_line->>'nomenclature_id') = '' THEN
          RETURN jsonb_build_object('ok', false, 'error', 'New lines must reference a product');
        END IF;
        v_qty := (v_line->>'qty_ordered')::numeric;
        IF v_qty IS NULL OR v_qty <= 0 THEN
          RETURN jsonb_build_object('ok', false, 'error', 'Quantity must be greater than 0 for every line');
        END IF;
      ELSE
        -- existing line: must belong to this PO; qty (when patched) must be > 0
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

  -- Header patch: apply only keys present in p_patch
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

  -- Deletes (scoped to this PO; stock_request_lines.po_line_id falls back to NULL via FK)
  IF p_patch ? 'lines_delete' THEN
    DELETE FROM public.po_lines
    WHERE po_id = p_po_id
      AND id IN (SELECT (jsonb_array_elements_text(p_patch->'lines_delete'))::uuid);
  END IF;

  -- Upserts
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
          CASE WHEN v_line->>'sku_id' IS NOT NULL AND v_line->>'sku_id' <> ''
               THEN (v_line->>'sku_id')::uuid ELSE NULL END,
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

  -- Final totals reconcile. trg_po_lines_rollup covers line ops, but a
  -- header-only patch (delivery_fee) fires no po_lines trigger — recompute here.
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

  SELECT COUNT(*)::int INTO v_line_count FROM public.po_lines WHERE po_id = p_po_id;
  SELECT po.subtotal, po.grand_total INTO v_subtotal, v_grand
  FROM public.purchase_orders po WHERE po.id = p_po_id;

  RETURN jsonb_build_object(
    'ok', true, 'po_id', p_po_id, 'line_count', v_line_count,
    'subtotal', v_subtotal, 'grand_total', v_grand
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$function$;

-- ============================================================
-- 10. fn_create_purchase_order: extend (same signature — no overload).
--     New optional payload keys, all backward compatible:
--     header: deliver_to_station_id, delivery_window, delivery_fee
--     line:   destination_station_id (falls back to header station),
--             request_line_ids uuid[] -> sets stock_request_lines.po_line_id
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
BEGIN
  -- 1. Validate supplier
  IF p_payload->>'supplier_id' IS NULL OR p_payload->>'supplier_id' = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'supplier_id is required');
  END IF;

  -- 1b. Validate lines present
  IF p_payload->'lines' IS NULL OR jsonb_array_length(p_payload->'lines') = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'At least one line item is required');
  END IF;

  -- 1c. Validate every line BEFORE inserting anything (no orphan header)
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

  -- 2. INSERT purchase_orders (po_number auto-generated by trigger)
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

  -- 3. INSERT po_lines (qty already validated > 0)
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_payload->'lines')
  LOOP
    v_sort := v_sort + 1;
    v_unit_price := (v_line->>'unit_price_expected')::NUMERIC;

    IF v_unit_price IS NULL THEN
      SELECT sc.last_seen_price INTO v_unit_price
      FROM public.supplier_catalog sc
      WHERE sc.supplier_id = (p_payload->>'supplier_id')::UUID
        AND (
          (v_line->>'sku_id' IS NOT NULL AND sc.sku_id = (v_line->>'sku_id')::UUID)
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
      CASE WHEN v_line->>'sku_id' IS NOT NULL AND v_line->>'sku_id' <> ''
           THEN (v_line->>'sku_id')::UUID ELSE NULL END,
      (v_line->>'qty_ordered')::NUMERIC,
      COALESCE(v_line->>'unit', 'pcs'),
      v_unit_price,
      COALESCE(NULLIF(v_line->>'destination_station_id', '')::UUID, v_station),
      v_sort,
      v_line->>'notes'
    )
    RETURNING id INTO v_line_id;

    -- need->order linkage: request lines this PO line fulfils
    IF v_line ? 'request_line_ids' AND jsonb_array_length(v_line->'request_line_ids') > 0 THEN
      UPDATE public.stock_request_lines
      SET po_line_id = v_line_id
      WHERE id IN (SELECT (jsonb_array_elements_text(v_line->'request_line_ids'))::uuid);
    END IF;

    v_line_count := v_line_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true, 'po_id', v_po_id, 'po_number', v_po_number, 'line_count', v_line_count
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$function$;

-- ============================================================
-- 11. v_order_builder: catalog rows joined to nomenclature +
--     product_categories for the Order Builder tab (Phase D reads it)
-- ============================================================
CREATE OR REPLACE VIEW public.v_order_builder
WITH (security_invoker = true) AS
SELECT
  sc.id                 AS catalog_id,
  sc.supplier_id,
  s.name                AS supplier_name,
  s.min_order_thb,
  sc.nomenclature_id,
  n.product_code,
  COALESCE(n.name, sc.product_name, sc.original_name) AS display_name,
  sc.product_name_th,
  sc.brand,
  sc.image_url,
  sc.external_url,
  sc.supplier_sku,
  sc.purchase_unit,
  sc.package_qty,
  sc.package_unit,
  sc.conversion_factor,
  sc.base_unit          AS catalog_base_unit,
  n.base_unit           AS nomenclature_base_unit,
  sc.last_seen_price,
  CASE WHEN sc.conversion_factor IS NOT NULL AND sc.conversion_factor > 0
            AND sc.last_seen_price IS NOT NULL
       THEN round(sc.last_seen_price / sc.conversion_factor, 4)
  END                   AS unit_cost_base,
  sc.verified_at,
  sc.category_code      AS supplier_category_code,
  sc.sub_category_code  AS supplier_sub_category_code,
  pc.id                 AS category_id,
  pc.code               AS category_code,
  pc.name               AS category_name
FROM public.supplier_catalog sc
JOIN public.suppliers s
  ON s.id = sc.supplier_id AND s.is_deleted = false
LEFT JOIN public.nomenclature n
  ON n.id = sc.nomenclature_id AND n.is_deleted = false
LEFT JOIN public.product_categories pc
  ON pc.id = n.category_id;

-- ============================================================
-- 12. Self-register (RULE-MIGRATION-TRACKING, checksum NULL)
-- ============================================================
INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '379_procurement_v2_phase_a.sql',
  'claude-code',
  NULL,
  'Procurement v2 Phase A: editable POs (fn_update_po), station destinations, receipt_inbox.po_id, supplier_files + bucket, v_order_builder (MC 6df2f888)'
)
ON CONFLICT DO NOTHING;
