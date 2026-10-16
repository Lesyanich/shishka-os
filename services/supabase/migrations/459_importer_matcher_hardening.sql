-- 459_importer_matcher_hardening.sql
-- MC 00a81c22, items 1-5 of the revised fix order (comment of 2026-10-16).
--
-- WHY. 415 of 984 purchase_logs rows (42%, THB 67,714) sit on RAW-AUTO stubs
-- that reach no dish. October 2026 alone minted 118 distinct stubs from 125
-- rows. The audit read the LIVE functions via pg_get_functiondef and found
-- four defects, all fixed here:
--
--   1. fn_approve_receipt had NO matcher. When the payload carried no
--      nomenclature_id it inserted 'RAW-AUTO-' || substr(md5(random()),1,8)
--      with no barcode / catalog / alias / name lookup. The random suffix
--      means the same item breeds a new stub on every receipt.
--   2. The real ladder lives only in the edge function
--      (functions/_shared/nomenclature.ts) and is barcode-first, but
--      fn_approve_receipt's INSERT INTO purchase_logs omitted the `barcode`
--      column the payload supplies. So the matcher's "previously approved by
--      barcode" level could never fire and approvals never taught the system.
--      Of the 18 stub-bound rows that DO carry a barcode, 18/18 exist in
--      supplier_catalog and 16 point at a canonical item.
--   3. conversion_factor was looked up by sc.nomenclature_id AFTER the stub was
--      minted. Nothing in supplier_catalog ever points at a fresh stub, so unit
--      normalization was structurally impossible for exactly the rows that need
--      it (hence quantity=500 booked for a 600 g bag).
--   4. fn_update_cost_on_purchase rolled WAC from NEW.price_per_unit and
--      force-set cost_source='wac', so garbage OCR unit prices reached dish
--      cost and any hand-set cost died at the next receipt — contradicting the
--      mig 221 provenance design.
--
-- WHAT THIS MIGRATION DOES
--   A. fn_normalize_product_name   — shared normalizer (mirrors
--                                    fn_normalize_supplier_name, mig 386).
--   B. fn_match_nomenclature       — the resolution ladder, in the DB.
--   C. fn_approve_receipt v17      — calls the ladder before any mint, writes
--                                    barcode + sku_id, keys conversion_factor
--                                    off the catalog row, mints a DETERMINISTIC
--                                    stub as the last resort and files a
--                                    reviewable unmatched_items row.
--   D. fn_update_cost_on_purchase  — respects cost_source='manual', computes
--                                    from total_price/quantity.
--   E. fn_recalc_wac_for_product   — same two changes, so the two paths agree.
--   F. trg_purchase_log_import_guard — BEFORE INSERT: rejects a broken
--                                    quantity*price vs total, and an
--                                    out-of-range invoice_date.
--
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT DO (item 6/7, human-gated)
--   * No backfill, no mass WAC recalc, no re-dedupe of the 415 stub rows and
--     no normalization of the 20 bad-unit rows. For the spice/oil cases the
--     STORED cost is the plausible one and purchase_logs is the corrupt source
--     (a 100 g pack booked as 1 kg); fn_recalc_wac_for_product on
--     RAW-COFFEE-ESPRESSO today yields 241.67 THB/g instead of ~0.66.
--     Quantities must be normalized against the receipt images first.
--   * Nothing here changes a single cost_per_unit on apply. Asserted at the
--     end of the transaction against a snapshot taken at the start.
--
-- DESIGN NOTES
--   * The DB ladder is deliberately STRICTER than the edge function's last
--     resort. The edge function falls back to ILIKE '%name%', which is how
--     "Three Ladies rice noodles" and "Boran rice paper" got swapped (defect #2
--     in the task). Here, name levels require NORMALIZED EXACT equality and
--     refuse to guess when more than one candidate matches — the same stance
--     fn_resolve_supplier takes for suppliers. Unresolved is fine; a human
--     picks it from the unmatched_items queue.
--   * The import guard is INSERT-only on purpose. 20 rows already violate the
--     arithmetic rule and 16 the date rule; an UPDATE-time check would block
--     item 6 from ever repairing them, and would block the mig-325 repoint
--     (trg_purchase_log_correction / trg_recalc_wac_on_purchase_update) on
--     exactly the rows that need it.

BEGIN;

-- ── snapshot for the zero-cost-drift assertion at the end ──
CREATE TEMP TABLE _cost_before ON COMMIT DROP AS
SELECT id, cost_per_unit, cost_source FROM public.nomenclature;


-- ═══════════════════════════════════════════════════════════════════════════
-- A. Shared product-name normalizer
-- ═══════════════════════════════════════════════════════════════════════════
-- Same shape as fn_normalize_supplier_name (mig 386): fold case, drop every
-- separator and punctuation mark, keep latin alphanumerics and Thai. Digits
-- are KEPT on purpose — "Boncafe Espresso 600g" and "250g" are different packs
-- and must not collapse onto one another.
CREATE OR REPLACE FUNCTION public.fn_normalize_product_name(p_name TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT NULLIF(regexp_replace(lower(COALESCE(p_name, '')), '[^a-z0-9฀-๛]+', '', 'g'), '');
$function$;

COMMENT ON FUNCTION public.fn_normalize_product_name(TEXT) IS
  'Normalizes a product name for matching: lowercase, strip punctuation/whitespace, keep latin alphanumerics + Thai. Mig 459 (MC 00a81c22).';


-- ═══════════════════════════════════════════════════════════════════════════
-- B. The resolution ladder
-- ═══════════════════════════════════════════════════════════════════════════
-- Mirrors services/supabase/functions/_shared/nomenclature.ts, minus its GS1
-- level (GS1 parsing stays in the edge function, which resolves it and passes
-- nomenclature_id in the payload) and minus its ILIKE substring fallback.
--
-- Returns the conversion_factor of the SAME catalog row that matched, so the
-- caller can normalize units for a first-time purchase — the lookup no longer
-- depends on a nomenclature_id that does not exist yet.
CREATE OR REPLACE FUNCTION public.fn_match_nomenclature(
  p_supplier_id   UUID,
  p_barcode       TEXT,
  p_supplier_sku  TEXT,
  p_name          TEXT,
  p_original_name TEXT DEFAULT NULL
)
RETURNS TABLE (
  nomenclature_id   UUID,
  sku_id            UUID,
  conversion_factor NUMERIC,
  match_level       TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_barcode TEXT := NULLIF(TRIM(p_barcode), '');
  v_sku     TEXT := NULLIF(TRIM(p_supplier_sku), '');
  v_norm    TEXT := fn_normalize_product_name(p_name);
  v_norm_th TEXT := fn_normalize_product_name(p_original_name);
  v_hits    INTEGER;
  v_id      UUID;
  v_sku_id  UUID;
  v_conv    NUMERIC;
  v_code    TEXT;
BEGIN
  -- ── Level 1: barcode ──────────────────────────────────────────────────
  IF v_barcode IS NOT NULL THEN
    -- 1a. supplier_catalog by barcode
    SELECT sc.nomenclature_id, sc.sku_id, sc.conversion_factor
      INTO v_id, v_sku_id, v_conv
      FROM supplier_catalog sc
     WHERE sc.barcode = v_barcode
       AND sc.nomenclature_id IS NOT NULL
     ORDER BY sc.match_count DESC
     LIMIT 1;
    IF v_id IS NOT NULL THEN
      RETURN QUERY SELECT v_id, v_sku_id, v_conv, 'barcode:supplier_catalog'::TEXT;
      RETURN;
    END IF;

    -- 1b. sku table by barcode
    SELECT s.nomenclature_id, s.id
      INTO v_id, v_sku_id
      FROM sku s
     WHERE s.barcode = v_barcode
       AND s.nomenclature_id IS NOT NULL
     LIMIT 1;
    IF v_id IS NOT NULL THEN
      RETURN QUERY SELECT v_id, v_sku_id, NULL::NUMERIC, 'barcode:sku'::TEXT;
      RETURN;
    END IF;

    -- 1c. purchase_logs history — the level defect #2 kept switched off.
    SELECT pl.nomenclature_id, pl.sku_id
      INTO v_id, v_sku_id
      FROM purchase_logs pl
      JOIN nomenclature n ON n.id = pl.nomenclature_id AND n.is_deleted = false
     WHERE pl.barcode = v_barcode
     ORDER BY pl.invoice_date DESC
     LIMIT 1;
    IF v_id IS NOT NULL THEN
      RETURN QUERY SELECT v_id, v_sku_id, NULL::NUMERIC, 'barcode:purchase_logs'::TEXT;
      RETURN;
    END IF;

    -- 1d. correction_rules — what a human taught us by repointing a row
    --     (fn_learn_nomenclature_correction writes these).
    SELECT (cr.correction_value->>'nomenclature_id')::UUID
      INTO v_id
      FROM correction_rules cr
      JOIN nomenclature n ON n.id = (cr.correction_value->>'nomenclature_id')::UUID
                         AND n.is_deleted = false
     WHERE cr.rule_type = 'nomenclature'
       AND cr.match_field = 'barcode'
       AND cr.match_pattern = v_barcode
     ORDER BY cr.updated_at DESC NULLS LAST
     LIMIT 1;
    IF v_id IS NOT NULL THEN
      RETURN QUERY SELECT v_id, NULL::UUID, NULL::NUMERIC, 'barcode:correction_rules'::TEXT;
      RETURN;
    END IF;
  END IF;

  -- ── Level 2: supplier SKU ─────────────────────────────────────────────
  IF v_sku IS NOT NULL THEN
    -- 2a. supplier_catalog by supplier_sku + supplier
    IF p_supplier_id IS NOT NULL THEN
      SELECT sc.nomenclature_id, sc.sku_id, sc.conversion_factor
        INTO v_id, v_sku_id, v_conv
        FROM supplier_catalog sc
       WHERE sc.supplier_sku = v_sku
         AND sc.supplier_id = p_supplier_id
         AND sc.nomenclature_id IS NOT NULL
       ORDER BY sc.match_count DESC
       LIMIT 1;
      IF v_id IS NOT NULL THEN
        RETURN QUERY SELECT v_id, v_sku_id, v_conv, 'sku:supplier_catalog'::TEXT;
        RETURN;
      END IF;
    END IF;

    -- 2b. Makro-style article number stored in the barcode column
    SELECT sc.nomenclature_id, sc.sku_id, sc.conversion_factor
      INTO v_id, v_sku_id, v_conv
      FROM supplier_catalog sc
     WHERE sc.barcode = v_sku
       AND sc.nomenclature_id IS NOT NULL
     ORDER BY sc.match_count DESC
     LIMIT 1;
    IF v_id IS NOT NULL THEN
      RETURN QUERY SELECT v_id, v_sku_id, v_conv, 'sku:supplier_catalog_xref'::TEXT;
      RETURN;
    END IF;

    -- 2c. purchase_logs history keyed by the sku-as-barcode
    SELECT pl.nomenclature_id, pl.sku_id
      INTO v_id, v_sku_id
      FROM purchase_logs pl
      JOIN nomenclature n ON n.id = pl.nomenclature_id AND n.is_deleted = false
     WHERE pl.barcode = v_sku
     ORDER BY pl.invoice_date DESC
     LIMIT 1;
    IF v_id IS NOT NULL THEN
      RETURN QUERY SELECT v_id, v_sku_id, NULL::NUMERIC, 'sku:purchase_logs'::TEXT;
      RETURN;
    END IF;
  END IF;

  -- ── Level 3: normalized name, EXACT, and only when unambiguous ────────
  -- 3a. supplier_catalog, any of its four name columns.
  IF v_norm IS NOT NULL OR v_norm_th IS NOT NULL THEN
    SELECT count(DISTINCT sc.nomenclature_id) INTO v_hits
      FROM supplier_catalog sc
     WHERE sc.nomenclature_id IS NOT NULL
       AND (
            fn_normalize_product_name(sc.product_name)    IN (v_norm, v_norm_th)
         OR fn_normalize_product_name(sc.original_name)   IN (v_norm, v_norm_th)
         OR fn_normalize_product_name(sc.product_name_th) IN (v_norm, v_norm_th)
         OR fn_normalize_product_name(sc.full_title)      IN (v_norm, v_norm_th)
       );
    IF v_hits = 1 THEN
      SELECT sc.nomenclature_id, sc.sku_id, sc.conversion_factor
        INTO v_id, v_sku_id, v_conv
        FROM supplier_catalog sc
       WHERE sc.nomenclature_id IS NOT NULL
         AND (
              fn_normalize_product_name(sc.product_name)    IN (v_norm, v_norm_th)
           OR fn_normalize_product_name(sc.original_name)   IN (v_norm, v_norm_th)
           OR fn_normalize_product_name(sc.product_name_th) IN (v_norm, v_norm_th)
           OR fn_normalize_product_name(sc.full_title)      IN (v_norm, v_norm_th)
         )
       ORDER BY sc.match_count DESC
       LIMIT 1;
      RETURN QUERY SELECT v_id, v_sku_id, v_conv, 'name:supplier_catalog'::TEXT;
      RETURN;
    END IF;
  END IF;

  -- 3b. nomenclature's own name, purchasable items only (RAW-* / NF-*).
  --     Exactly one canonical match wins. Two canonicals is a refusal — the
  --     swapped "Three Ladies rice noodles" / "Boran rice paper" mapping is
  --     what guessing here costs. Several live stubs and no canonical is just
  --     the duplication this migration exists to end, so the oldest wins and
  --     the line consolidates onto it.
  IF v_norm IS NOT NULL THEN
    SELECT count(*) INTO v_hits
      FROM nomenclature n
     WHERE n.is_deleted = false
       AND (n.product_code LIKE 'RAW-%' OR n.product_code LIKE 'NF-%')
       AND n.product_code NOT LIKE 'RAW-AUTO-%'
       AND fn_normalize_product_name(n.name) = v_norm;

    IF v_hits = 1 THEN
      SELECT n.id INTO v_id
        FROM nomenclature n
       WHERE n.is_deleted = false
         AND (n.product_code LIKE 'RAW-%' OR n.product_code LIKE 'NF-%')
         AND n.product_code NOT LIKE 'RAW-AUTO-%'
         AND fn_normalize_product_name(n.name) = v_norm;
      RETURN QUERY SELECT v_id, NULL::UUID, NULL::NUMERIC, 'name:nomenclature'::TEXT;
      RETURN;
    ELSIF v_hits = 0 THEN
      SELECT n.id INTO v_id
        FROM nomenclature n
       WHERE n.is_deleted = false
         AND n.product_code LIKE 'RAW-AUTO-%'
         AND fn_normalize_product_name(n.name) = v_norm
       ORDER BY n.created_at
       LIMIT 1;
      IF v_id IS NOT NULL THEN
        RETURN QUERY SELECT v_id, NULL::UUID, NULL::NUMERIC, 'name:existing_stub'::TEXT;
        RETURN;
      END IF;
    END IF;

    -- 3c. nomenclature.aliases
    SELECT count(*) INTO v_hits
      FROM nomenclature n, unnest(COALESCE(n.aliases, ARRAY[]::TEXT[])) AS a
     WHERE n.is_deleted = false
       AND fn_normalize_product_name(a) = v_norm;
    IF v_hits = 1 THEN
      SELECT n.id INTO v_id
        FROM nomenclature n, unnest(COALESCE(n.aliases, ARRAY[]::TEXT[])) AS a
       WHERE n.is_deleted = false
         AND fn_normalize_product_name(a) = v_norm
       LIMIT 1;
      RETURN QUERY SELECT v_id, NULL::UUID, NULL::NUMERIC, 'name:aliases'::TEXT;
      RETURN;
    END IF;

    -- 3d. tombstones. Mig 325 merged a stub by setting is_deleted and
    --     prefixing the name '[MERGED->RAW-XXX] original name'. That prefix is
    --     a human merge decision; reading it back makes every past merge a
    --     permanent matcher memory instead of a one-off cleanup.
    SELECT substring(n.name FROM '^\[MERGED->([^\]]+)\]') INTO v_code
      FROM nomenclature n
     WHERE n.is_deleted = true
       AND n.name LIKE '[MERGED->%'
       AND fn_normalize_product_name(
             regexp_replace(n.name, '^\[MERGED->[^\]]+\]\s*', '')
           ) = v_norm
     LIMIT 1;
    IF v_code IS NOT NULL THEN
      SELECT n.id INTO v_id
        FROM nomenclature n
       WHERE n.product_code = v_code AND n.is_deleted = false
       LIMIT 1;
      IF v_id IS NOT NULL THEN
        RETURN QUERY SELECT v_id, NULL::UUID, NULL::NUMERIC, 'name:tombstone'::TEXT;
        RETURN;
      END IF;
    END IF;
  END IF;

  -- No match. The caller mints a deterministic stub and queues it for review.
  RETURN QUERY SELECT NULL::UUID, NULL::UUID, NULL::NUMERIC, 'none'::TEXT;
END;
$function$;

COMMENT ON FUNCTION public.fn_match_nomenclature(UUID, TEXT, TEXT, TEXT, TEXT) IS
  'Receipt line -> nomenclature resolution ladder: barcode (catalog/sku/history/corrections) -> supplier_sku -> normalized exact name (catalog/nomenclature/aliases/tombstones). Returns the matched catalog row''s conversion_factor. Refuses to guess when ambiguous. Mig 459 (MC 00a81c22).';


-- ═══════════════════════════════════════════════════════════════════════════
-- C. fn_approve_receipt v17
-- ═══════════════════════════════════════════════════════════════════════════
-- Changed vs v16 (mig 386): the date guard, the food_items loop (ladder,
-- deterministic stub, unmatched_items row, catalog-keyed conversion, the
-- arithmetic guard, barcode + sku_id in the INSERT). Everything else — the
-- supplier resolution, expense_ledger insert, capex and opex spokes, the
-- result shape — is unchanged, including the EXCEPTION handler that turns a
-- raised error into {ok:false, error:...} for the approval UI.
CREATE OR REPLACE FUNCTION public.fn_approve_receipt(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_expense_id        UUID;
  v_supplier_id       UUID;
  v_supplier_name     TEXT;
  v_category_code     INTEGER;
  v_sub_category_code INTEGER;
  v_item              JSONB;
  v_nom_id            UUID;
  v_item_name         TEXT;
  v_item_unit         TEXT;
  v_auto_count        INTEGER := 0;
  v_matched_count     INTEGER := 0;
  v_conv_factor       NUMERIC;
  v_raw_qty           NUMERIC;
  v_final_qty         NUMERIC;
  v_raw_unit_price    NUMERIC;
  v_final_unit_price  NUMERIC;
  v_total_price       NUMERIC;
  v_auto_fin_sub      INTEGER;
  v_txn_date          DATE;
  v_barcode           TEXT;
  v_supplier_sku      TEXT;
  v_original_name     TEXT;
  v_sku_id            UUID;
  v_match_level       TEXT;
  v_norm_name         TEXT;
  v_stub_code         TEXT;
  v_tolerance         NUMERIC;
  v_guard_text        TEXT;
  v_suggest_id        UUID;
  v_suggest_score     NUMERIC;
BEGIN
  -- ── Date guard (item 5). A year typo ("2046-02-26 Item N") skews every
  --    period report and any FIFO/expiry logic that trusts the date, so the
  --    whole receipt is refused and the approver fixes the date in the UI.
  v_txn_date := COALESCE((p_payload->>'transaction_date')::DATE, CURRENT_DATE);
  IF v_txn_date < CURRENT_DATE - INTERVAL '2 years'
     OR v_txn_date > CURRENT_DATE + INTERVAL '7 days' THEN
    RAISE EXCEPTION
      'Receipt date % is outside the accepted window [% .. %]. Fix the date on the receipt before approving.',
      v_txn_date, (CURRENT_DATE - INTERVAL '2 years')::DATE, (CURRENT_DATE + INTERVAL '7 days')::DATE;
  END IF;

  IF p_payload->>'supplier_id' IS NOT NULL AND p_payload->>'supplier_id' <> '' THEN
    v_supplier_id := (p_payload->>'supplier_id')::UUID;
  END IF;

  -- v16: was `name ILIKE v_supplier_name` + unconditional INSERT, which is what
  -- turned every new spelling on a chit into a new supplier.
  IF v_supplier_id IS NULL THEN
    v_supplier_name := p_payload->>'supplier_name';
    IF v_supplier_name IS NOT NULL AND v_supplier_name <> '' THEN
      v_supplier_id := public.fn_resolve_supplier(
        v_supplier_name,
        NULLIF(TRIM(p_payload->>'supplier_tax_id'), ''),
        true
      );
    END IF;
  END IF;

  v_category_code := (p_payload->>'category_code')::INTEGER;
  v_sub_category_code := (p_payload->>'sub_category_code')::INTEGER;

  IF v_category_code IS NULL AND v_supplier_id IS NOT NULL THEN
    SELECT s.category_code, s.sub_category_code
    INTO v_category_code, v_sub_category_code
    FROM suppliers s WHERE s.id = v_supplier_id;
  END IF;

  IF v_category_code IS NULL THEN
    v_category_code := 2000;
  END IF;

  -- v10: include period_start, period_end
  INSERT INTO expense_ledger (
    transaction_date, flow_type, category_code, sub_category_code,
    supplier_id, details, comments, invoice_number,
    amount_original, currency, exchange_rate,
    discount_total, vat_amount, delivery_fee,
    paid_by, payment_method, status, has_tax_invoice,
    receipt_supplier_url, receipt_bank_url, tax_invoice_url,
    period_start, period_end
  ) VALUES (
    v_txn_date,
    COALESCE(p_payload->>'flow_type', 'OpEx'),
    v_category_code,
    v_sub_category_code,
    v_supplier_id,
    COALESCE(p_payload->>'details', ''),
    p_payload->>'comments',
    p_payload->>'invoice_number',
    COALESCE((p_payload->>'amount_original')::NUMERIC, 0),
    COALESCE(p_payload->>'currency', 'THB'),
    COALESCE((p_payload->>'exchange_rate')::NUMERIC, 1),
    COALESCE((p_payload->>'discount_total')::NUMERIC, 0),
    COALESCE((p_payload->>'vat_amount')::NUMERIC, 0),
    COALESCE((p_payload->>'delivery_fee')::NUMERIC, 0),
    COALESCE(p_payload->>'paid_by', ''),
    COALESCE(p_payload->>'payment_method', 'cash'),
    COALESCE(p_payload->>'status', 'paid'),
    COALESCE((p_payload->>'has_tax_invoice')::BOOLEAN, false),
    p_payload->>'receipt_supplier_url',
    p_payload->>'receipt_bank_url',
    p_payload->>'tax_invoice_url',
    NULLIF(p_payload->>'period_start', '')::DATE,
    NULLIF(p_payload->>'period_end', '')::DATE
  )
  RETURNING id INTO v_expense_id;

  IF p_payload->'food_items' IS NOT NULL
     AND jsonb_array_length(p_payload->'food_items') > 0 THEN

    IF v_sub_category_code IS NULL THEN
      v_auto_fin_sub := NULL;
      FOR v_item IN SELECT * FROM jsonb_array_elements(p_payload->'food_items') LIMIT 1
      LOOP
        IF v_item->>'nomenclature_id' IS NOT NULL
           AND v_item->>'nomenclature_id' <> ''
           AND v_item->>'nomenclature_id' <> '__NEW__' THEN
          SELECT pc.default_fin_sub_code
          INTO v_auto_fin_sub
          FROM nomenclature n
          JOIN product_categories pc ON pc.id = n.category_id
          WHERE n.id = (v_item->>'nomenclature_id')::UUID
            AND pc.default_fin_sub_code IS NOT NULL;
        END IF;
      END LOOP;

      IF v_auto_fin_sub IS NOT NULL THEN
        UPDATE expense_ledger
        SET sub_category_code = v_auto_fin_sub
        WHERE id = v_expense_id;
        v_sub_category_code := v_auto_fin_sub;
      END IF;
    END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_payload->'food_items')
    LOOP
      v_nom_id        := NULL;
      v_sku_id        := NULL;
      v_conv_factor   := NULL;
      v_match_level   := NULL;
      v_item_name     := COALESCE(v_item->>'name', 'Unknown item');
      v_item_unit     := COALESCE(v_item->>'unit', 'pcs');
      v_barcode       := NULLIF(TRIM(COALESCE(v_item->>'barcode', '')), '');
      v_supplier_sku  := NULLIF(TRIM(COALESCE(v_item->>'supplier_sku', '')), '');
      v_original_name := NULLIF(TRIM(COALESCE(v_item->>'original_name', '')), '');

      -- The caller's own resolution still wins — the edge function has levels
      -- this ladder does not (GS1 variable-weight barcodes), and a human
      -- picking an item in the approval UI must not be second-guessed.
      IF v_item->>'nomenclature_id' IS NOT NULL
         AND v_item->>'nomenclature_id' <> ''
         AND v_item->>'nomenclature_id' <> '__NEW__' THEN
        v_nom_id := (v_item->>'nomenclature_id')::UUID;
        v_match_level := 'payload';
      END IF;

      IF v_item->>'sku_id' IS NOT NULL AND v_item->>'sku_id' <> '' THEN
        v_sku_id := (v_item->>'sku_id')::UUID;
      END IF;

      -- ── The ladder, BEFORE any mint (item 2) ──
      IF v_nom_id IS NULL THEN
        SELECT m.nomenclature_id, COALESCE(v_sku_id, m.sku_id), m.conversion_factor, m.match_level
          INTO v_nom_id, v_sku_id, v_conv_factor, v_match_level
          FROM public.fn_match_nomenclature(
                 v_supplier_id, v_barcode, v_supplier_sku, v_item_name, v_original_name
               ) m;
        IF v_nom_id IS NOT NULL THEN
          v_matched_count := v_matched_count + 1;
        END IF;
      END IF;

      -- ── Last resort: a DETERMINISTIC stub (item 2) ──
      -- The code is a hash of the normalized name, so the same item reuses one
      -- stub across receipts instead of breeding a new one each time. is_deleted
      -- rows are reused as-is rather than resurrected; the tombstone level above
      -- has already had its chance to redirect to the canonical.
      IF v_nom_id IS NULL THEN
        v_norm_name := COALESCE(public.fn_normalize_product_name(v_item_name), 'unknown');
        v_stub_code := 'RAW-AUTO-' || substr(md5(v_norm_name), 1, 8);

        SELECT n.id INTO v_nom_id
          FROM nomenclature n
         WHERE n.product_code = v_stub_code
         LIMIT 1;

        IF v_nom_id IS NULL THEN
          INSERT INTO nomenclature (product_code, name, type, base_unit)
          VALUES (v_stub_code, v_item_name, 'good', v_item_unit)
          RETURNING id INTO v_nom_id;
          v_auto_count := v_auto_count + 1;
        END IF;
        v_match_level := 'stub';

        -- Queue it for a human, with the context the reviewer needs to act.
        -- fn_nomenclature_import_guard (AFTER INSERT on nomenclature) may have
        -- already filed a bare row for a fresh stub; enrich that one instead of
        -- filing a second.
        v_guard_text := v_item_name || ' [RAW-AUTO: ' || v_stub_code || ']';

        SELECT n.id, similarity(lower(v_item_name), lower(n.name))
          INTO v_suggest_id, v_suggest_score
          FROM nomenclature n
         WHERE n.is_deleted = false
           AND n.is_available = true
           AND n.product_code LIKE 'RAW-%'
           AND n.product_code NOT LIKE 'RAW-AUTO-%'
           AND similarity(lower(v_item_name), lower(n.name)) > 0.4
         ORDER BY similarity(lower(v_item_name), lower(n.name)) DESC
         LIMIT 1;

        -- Also keeps the queue to one open row per stub: a repeat purchase of
        -- an unmatched item enriches the open row instead of filing another.
        UPDATE unmatched_items
           SET expense_id  = COALESCE(expense_id, v_expense_id),
               barcode     = COALESCE(barcode, v_barcode, v_supplier_sku),
               supplier_id = COALESCE(supplier_id, v_supplier_id)
         WHERE raw_text = v_guard_text
           AND resolved_at IS NULL;

        IF NOT FOUND THEN
          INSERT INTO unmatched_items (
            expense_id, raw_text, barcode, supplier_id, suggested_match, confidence
          ) VALUES (
            v_expense_id,
            v_guard_text,
            COALESCE(v_barcode, v_supplier_sku),
            v_supplier_id,
            v_suggest_id,
            LEAST(COALESCE(v_suggest_score, 0), 1.0)
          );
        END IF;
      END IF;

      -- ── Quantities (item 3) ──
      v_raw_qty        := COALESCE((v_item->>'quantity')::NUMERIC, 1);
      v_raw_unit_price := COALESCE((v_item->>'unit_price')::NUMERIC, 0);
      v_total_price    := COALESCE((v_item->>'total_price')::NUMERIC, 0);

      -- Fill in whichever of the pair the OCR left blank before judging them.
      IF v_raw_unit_price = 0 AND v_total_price <> 0 AND v_raw_qty <> 0 THEN
        v_raw_unit_price := v_total_price / v_raw_qty;
      ELSIF v_total_price = 0 AND v_raw_unit_price <> 0 THEN
        v_total_price := v_raw_qty * v_raw_unit_price;
      END IF;

      -- Unit confusion must fail loudly rather than feed WAC: "Boncafe Espresso
      -- 600g x1" arriving as qty=500 price=365 total=365 is a 182,135 THB lie
      -- about what was bought.
      v_tolerance := GREATEST(1.0, ABS(v_total_price) * 0.02);
      IF v_raw_qty <> 0 AND v_raw_unit_price <> 0
         AND ABS(v_raw_qty * v_raw_unit_price - v_total_price) > v_tolerance THEN
        RAISE EXCEPTION
          'Line "%": quantity % x unit price % = %, but total is %. Unit confusion (a pack booked as grams, or packs miscounted) — fix the line before approving.',
          v_item_name, v_raw_qty, v_raw_unit_price,
          ROUND(v_raw_qty * v_raw_unit_price, 2), v_total_price;
      END IF;

      -- conversion_factor now comes from the catalog row the LADDER matched
      -- (barcode / supplier_sku / name), so a first-time purchase normalizes
      -- too. v16 keyed it on sc.nomenclature_id = the just-minted stub, which
      -- nothing in supplier_catalog ever points at.
      IF v_conv_factor IS NULL AND v_supplier_id IS NOT NULL AND v_nom_id IS NOT NULL THEN
        SELECT sc.conversion_factor
          INTO v_conv_factor
          FROM supplier_catalog sc
         WHERE sc.supplier_id = v_supplier_id
           AND sc.nomenclature_id = v_nom_id
           AND sc.conversion_factor IS NOT NULL
         ORDER BY sc.match_count DESC
         LIMIT 1;
      END IF;

      IF v_conv_factor IS NOT NULL AND v_conv_factor > 0 THEN
        v_final_qty := v_raw_qty * v_conv_factor;
        IF v_final_qty > 0 THEN
          v_final_unit_price := v_total_price / v_final_qty;
        ELSE
          v_final_unit_price := v_raw_unit_price;
        END IF;
      ELSE
        v_final_qty        := v_raw_qty;
        v_final_unit_price := v_raw_unit_price;
      END IF;

      -- barcode + sku_id are the learning loop (item 1): without them
      -- fn_match_nomenclature level 1c can never fire and no approval ever
      -- teaches the system anything.
      INSERT INTO purchase_logs (
        nomenclature_id, supplier_id, quantity, price_per_unit,
        total_price, invoice_date, expense_id, notes, barcode, sku_id
      ) VALUES (
        v_nom_id,
        v_supplier_id,
        v_final_qty,
        v_final_unit_price,
        v_total_price,
        v_txn_date,
        v_expense_id,
        v_item_name,
        v_barcode,
        v_sku_id
      );
    END LOOP;
  END IF;

  IF p_payload->'capex_items' IS NOT NULL
     AND jsonb_array_length(p_payload->'capex_items') > 0 THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_payload->'capex_items')
    LOOP
      INSERT INTO capex_transactions (
        transaction_id, amount_thb, transaction_date, transaction_type,
        category_code, vendor, details, expense_id
      ) VALUES (
        'RCV-' || substr(gen_random_uuid()::TEXT, 1, 8),
        COALESCE((v_item->>'total_price')::NUMERIC, 0),
        v_txn_date,
        'purchase',
        v_category_code,
        (SELECT name FROM suppliers WHERE id = v_supplier_id),
        v_item->>'name',
        v_expense_id
      );
    END LOOP;
  END IF;

  IF p_payload->'opex_items' IS NOT NULL
     AND jsonb_array_length(p_payload->'opex_items') > 0 THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_payload->'opex_items')
    LOOP
      INSERT INTO opex_items (
        expense_id, description, quantity, unit, unit_price, total_price
      ) VALUES (
        v_expense_id,
        COALESCE(v_item->>'description', v_item->>'name', ''),
        COALESCE((v_item->>'quantity')::NUMERIC, 1),
        COALESCE(v_item->>'unit', 'pcs'),
        COALESCE((v_item->>'unit_price')::NUMERIC, 0),
        COALESCE((v_item->>'total_price')::NUMERIC, 0)
      );
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'ok',           true,
    'expense_id',   v_expense_id,
    'food_count',   COALESCE(jsonb_array_length(p_payload->'food_items'), 0),
    'capex_count',  COALESCE(jsonb_array_length(p_payload->'capex_items'), 0),
    'opex_count',   COALESCE(jsonb_array_length(p_payload->'opex_items'), 0),
    'auto_created', v_auto_count,
    'auto_matched', v_matched_count
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$function$;

COMMENT ON FUNCTION public.fn_approve_receipt(jsonb) IS
  'v17 (mig 459, MC 00a81c22): resolves each food line through fn_match_nomenclature before minting; deterministic stub code; writes barcode + sku_id; conversion_factor keyed off the matched catalog row; rejects broken qty*price vs total and out-of-range dates.';


-- ═══════════════════════════════════════════════════════════════════════════
-- D. fn_update_cost_on_purchase — AFTER INSERT on purchase_logs
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.fn_update_cost_on_purchase()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_current_qty   NUMERIC;
    v_current_cost  NUMERIC;
    v_cost_source   TEXT;
    v_new_wac       NUMERIC;
    v_line_cost     NUMERIC;
BEGIN
    SELECT COALESCE(v.quantity, 0), COALESCE(n.cost_per_unit, 0), n.cost_source
    INTO v_current_qty, v_current_cost, v_cost_source
    FROM public.nomenclature n
    LEFT JOIN public.v_inventory_by_nomenclature v ON v.nomenclature_id = n.id
    WHERE n.id = NEW.nomenclature_id;

    -- mig 221 provenance: a hand-set cost is a decision, not a guess. Before
    -- mig 459 the next receipt silently destroyed it (MC 9b091b1f's rice-paper
    -- fix was one receipt away from reverting).
    IF v_cost_source = 'manual' THEN
        RETURN NEW;
    END IF;

    -- Money actually spent / units actually received, not the OCR's unit price.
    IF NEW.total_price IS NOT NULL AND NEW.total_price <> 0 AND NEW.quantity <> 0 THEN
        v_line_cost := NEW.total_price / NEW.quantity;
    ELSE
        v_line_cost := NEW.price_per_unit;
    END IF;

    IF (v_current_qty + NEW.quantity) > 0 THEN
        v_new_wac := (v_current_qty * v_current_cost + NEW.quantity * v_line_cost)
                     / (v_current_qty + NEW.quantity);
    ELSE
        v_new_wac := v_line_cost;
    END IF;

    UPDATE public.nomenclature
    SET cost_per_unit = ROUND(v_new_wac, 4), cost_source = 'wac', updated_at = now()
    WHERE id = NEW.nomenclature_id;
    RETURN NEW;
END;
$function$;


-- ═══════════════════════════════════════════════════════════════════════════
-- E. fn_recalc_wac_for_product — same two rules, so both paths agree
-- ═══════════════════════════════════════════════════════════════════════════
-- Reached automatically from trg_recalc_wac_on_purchase_update when a row is
-- repointed, which is exactly what the item-6 re-dedupe will do at scale.
CREATE OR REPLACE FUNCTION public.fn_recalc_wac_for_product(p_nomenclature_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_new_cost    NUMERIC;
    v_cost_source TEXT;
BEGIN
    IF p_nomenclature_id IS NULL THEN RETURN NULL; END IF;

    SELECT cost_source INTO v_cost_source
    FROM public.nomenclature WHERE id = p_nomenclature_id;

    IF v_cost_source = 'manual' THEN
        RETURN (SELECT cost_per_unit FROM public.nomenclature WHERE id = p_nomenclature_id);
    END IF;

    -- SUM(total_price)/SUM(quantity): the money spent over the units received.
    -- Was SUM(price_per_unit*quantity)/SUM(quantity) — a fabricated product
    -- that reproduced any OCR error in price_per_unit.
    SELECT ROUND(SUM(total_price) / NULLIF(SUM(quantity), 0), 4)
    INTO v_new_cost
    FROM public.purchase_logs
    WHERE nomenclature_id = p_nomenclature_id
      AND quantity > 0
      AND total_price IS NOT NULL;

    UPDATE public.nomenclature
    SET cost_per_unit = v_new_cost,
        cost_source = CASE WHEN v_new_cost IS NOT NULL THEN 'wac' ELSE 'none' END,
        updated_at = now()
    WHERE id = p_nomenclature_id;
    RETURN v_new_cost;
END;
$function$;


-- ═══════════════════════════════════════════════════════════════════════════
-- F. Backstop guard on purchase_logs itself
-- ═══════════════════════════════════════════════════════════════════════════
-- fn_approve_receipt validates the payload; this catches any other writer.
-- INSERT only — see the header note on why an UPDATE-time check would block
-- the repairs item 6 has to make.
CREATE OR REPLACE FUNCTION public.fn_purchase_log_import_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_tolerance NUMERIC;
BEGIN
  IF NEW.invoice_date < CURRENT_DATE - INTERVAL '2 years'
     OR NEW.invoice_date > CURRENT_DATE + INTERVAL '7 days' THEN
    RAISE EXCEPTION
      'purchase_logs.invoice_date % is outside [% .. %].',
      NEW.invoice_date, (CURRENT_DATE - INTERVAL '2 years')::DATE, (CURRENT_DATE + INTERVAL '7 days')::DATE;
  END IF;

  v_tolerance := GREATEST(1.0, ABS(COALESCE(NEW.total_price, 0)) * 0.02);
  IF NEW.quantity <> 0 AND COALESCE(NEW.price_per_unit, 0) <> 0
     AND COALESCE(NEW.total_price, 0) <> 0
     AND ABS(NEW.quantity * NEW.price_per_unit - NEW.total_price) > v_tolerance THEN
    RAISE EXCEPTION
      'purchase_logs: quantity % x price_per_unit % = %, but total_price is % (tolerance %). Normalize the quantity to the base unit first.',
      NEW.quantity, NEW.price_per_unit,
      ROUND(NEW.quantity * NEW.price_per_unit, 2), NEW.total_price, ROUND(v_tolerance, 2);
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_purchase_log_import_guard ON public.purchase_logs;
CREATE TRIGGER trg_purchase_log_import_guard
  BEFORE INSERT ON public.purchase_logs
  FOR EACH ROW EXECUTE FUNCTION public.fn_purchase_log_import_guard();


-- ═══════════════════════════════════════════════════════════════════════════
-- Zero-cost-drift assertion — this migration changes code, never money.
-- ═══════════════════════════════════════════════════════════════════════════
DO $assert$
DECLARE
  v_drift INTEGER;
BEGIN
  SELECT count(*) INTO v_drift
  FROM _cost_before b
  JOIN public.nomenclature n ON n.id = b.id
  WHERE n.cost_per_unit IS DISTINCT FROM b.cost_per_unit
     OR n.cost_source   IS DISTINCT FROM b.cost_source;

  IF v_drift > 0 THEN
    RAISE EXCEPTION 'ABORT: % nomenclature cost rows moved. Migration 459 must not change any cost.', v_drift;
  END IF;
END
$assert$;


INSERT INTO public.migration_log (filename, applied_by, status, notes)
VALUES ('459_importer_matcher_hardening.sql', 'claude-opus-session-9bb6680e', 'success',
        'Importer hardening (MC 00a81c22 items 1-5). NEW: fn_normalize_product_name, fn_match_nomenclature '
     || '(barcode -> sku -> purchase_logs history -> correction_rules -> supplier_sku -> normalized exact name '
     || 'across supplier_catalog/nomenclature/aliases/mig-325 tombstones), trg_purchase_log_import_guard. '
     || 'fn_approve_receipt v17: ladder before any mint, deterministic stub code md5(normalized name), '
     || 'barcode + sku_id written to purchase_logs, conversion_factor keyed off the matched catalog row, '
     || 'qty*price vs total guard, invoice_date window [today-2y, today+7d], unmatched_items row on every mint. '
     || 'fn_update_cost_on_purchase + fn_recalc_wac_for_product: respect cost_source=manual, compute from '
     || 'total_price/quantity. NO data backfill, NO WAC recalc, NO re-dedupe (items 6-7, human-gated). '
     || 'Zero cost drift asserted in-transaction.');

COMMIT;
