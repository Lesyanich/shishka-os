-- 386_supplier_alias_resolution.sql
--
-- Stop the receipt importer creating a new supplier for every new spelling.
--
-- THE BUG. `fn_approve_receipt` resolves a supplier with exactly one lookup:
--
--     SELECT id INTO v_supplier_id FROM suppliers WHERE name ILIKE v_supplier_name;
--     IF v_supplier_id IS NULL THEN INSERT INTO suppliers ... END IF;
--
-- No tax_id, no alias table, not even an `is_deleted = false` filter. So a chit
-- printed "SIAM MAKRO" produced a brand-new supplier even though Makro already
-- had aliases for "CP Extra Public Co., Ltd.", "CP Axtra" and "ซีพี เอ็กซ์ตร้า".
--
-- The alias table is not unread — `resolveSupplierWithProfile()` in the edge
-- function checks it during OCR. But that runs before approval, its result is
-- only a suggestion, and the one code path that CREATES a supplier never
-- consulted it. `fn_approve_receipt_with_learning` does look an alias up, after
-- `fn_approve_receipt` has already returned — for learning and CapEx vendor
-- naming, too late to prevent anything. And nothing anywhere bumps
-- `times_applied`, so the whole table reads as dead data (0 on all 40+ rows)
-- whether it fired or not.
--
-- Cost: per-supplier spend, the Price Book and WAC split silently across ids for
-- the same shop. Makro was 3 rows (merged in 385), HomePro is 3, MR.D.I.Y is 3.
--
-- THE FIX. One resolver, `fn_resolve_supplier`, used by both approval functions:
--
--   1. tax_id exact          — the only truly unambiguous key on a Thai receipt
--   2. name, case-insensitive
--   3. alias, case-insensitive
--   4. normalized name       — legal-form noise stripped ("CO., LTD.", "PUBLIC
--                              COMPANY LIMITED", "บริษัท … จำกัด (มหาชน)")
--   5. normalized alias
--   6. create, and record the spelling as an alias
--
-- Steps 4-5 only accept a UNIQUE match. Two suppliers normalizing to the same
-- string is exactly the case where guessing is unsafe, so it falls through to
-- creation and a human can merge later — a missed match is cheap, a wrong one
-- silently books spend against the wrong company.
--
-- Normalization is deliberately narrow: strip legal forms and punctuation, then
-- compare for equality. No trigram, no similarity threshold. "HomePro" and "Home
-- Products Center Public Company Limited" normalize to "homepro" and
-- "homeproductscenter" and stay separate, which is correct — they are different
-- legal entities and merging them is a human decision, not an importer's.
--
-- Every resolution through an alias now bumps `times_applied` / `last_applied_at`,
-- so the table stops looking dead and the fix is observable in data.
--
-- Bodies below are patched from `pg_get_functiondef` on 2026-07-28, NOT from the
-- repo copies: `fn_approve_receipt` has been redefined by a dozen migrations
-- (040, 047, 058, 085, 134a, 149, 176 …) and the live version is the only
-- authority. Outside the supplier-resolution block, `fn_approve_receipt` is
-- reproduced verbatim.
--
-- CONTRACT-REVIEWED: touches nothing the public menu reads. fn_approve_receipt,
-- fn_approve_receipt_with_learning and the suppliers/supplier_aliases tables are
-- back-office receipt intake; menu_public selects SALE-% nomenclature only.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Name normalization
-- ─────────────────────────────────────────────────────────────────────────────

-- "SIAM MAKRO PUBLIC COMPANY LIMITED" → "siammakro"
-- "บริษัท ซีพี แอ็กซ์ตร้า จำกัด (มหาชน)"     → "ซีพีแอ็กซ์ตร้า"
--
-- Latin legal forms are matched at word boundaries (\m…\M) so "ltd" inside a real
-- word survives; the Thai tokens are whole words on a receipt and need none.
--
-- "public" only ever appears as part of a legal form, never alone: dropping the
-- bare word would collapse a real trading name like "Public Bank". The first
-- draft listed only "public company limited", so "Siam Makro Public Co., Ltd."
-- normalized to "siammakropublic" and matched nothing — hence the explicit
-- public + Co., Ltd. variants below.
CREATE OR REPLACE FUNCTION public.fn_normalize_supplier_name(p_name TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT NULLIF(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          lower(COALESCE(p_name, '')),
          '\m(public\s+company\s+limited|public\s+limited\s+company|public\s+co\.?\s*,?\s*ltd\.?|limited\s+partnership|company\s+limited|co\.?\s*,?\s*ltd\.?|corporation|incorporated|ltd\.?|plc|llp|lp|inc\.?)\M',
          ' ', 'g'),
        '(บริษัท|จำกัด|มหาชน|ห้างหุ้นส่วน)', ' ', 'g'),
      '[^a-z0-9฀-๛]+', '', 'g'),
    '');
$function$;

COMMENT ON FUNCTION public.fn_normalize_supplier_name(TEXT) IS
  'Strip legal-form noise and punctuation from a supplier name so two spellings of the same company compare equal. Used by fn_resolve_supplier steps 4-5.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. The resolver
-- ─────────────────────────────────────────────────────────────────────────────

-- p_create also decides whether this call may WRITE. With p_create = false the
-- function is pure: no supplier row, no alias learned, no counter bumped. That
-- is what the OCR phase and the duplicate-check in mcp-finance want — they
-- produce a suggestion a human can still reject.
--
-- Counters only move on the p_create = true call, which runs inside
-- fn_approve_receipt's transaction. RULE-LEARNING-COUNTERS: never increment
-- fire-and-forget from an Edge Function, never outside the approval txn — an
-- alias that fired during OCR has not been confirmed by anyone yet, and if the
-- approval rolls back the count must roll back with it.
CREATE OR REPLACE FUNCTION public.fn_resolve_supplier(
  p_name    TEXT,
  p_tax_id  TEXT    DEFAULT NULL,
  p_create  BOOLEAN DEFAULT TRUE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_id    UUID;
  v_name  TEXT := NULLIF(TRIM(p_name), '');
  v_norm  TEXT;
  v_hits  INTEGER;
BEGIN
  IF v_name IS NULL THEN
    RETURN NULL;
  END IF;

  -- 1. tax_id — unambiguous when the receipt carries one
  IF NULLIF(TRIM(p_tax_id), '') IS NOT NULL THEN
    SELECT id INTO v_id
      FROM suppliers
     WHERE tax_id = TRIM(p_tax_id) AND is_deleted = false
     LIMIT 1;
  END IF;

  -- 2. exact name. Equality, not ILIKE: the old code passed the receipt name
  --    straight into an ILIKE pattern, so a '%' or '_' in it matched wildly.
  IF v_id IS NULL THEN
    SELECT id INTO v_id
      FROM suppliers
     WHERE lower(name) = lower(v_name) AND is_deleted = false
     LIMIT 1;
  END IF;

  -- 3. known alias
  IF v_id IS NULL THEN
    SELECT a.supplier_id INTO v_id
      FROM supplier_aliases a
      JOIN suppliers s ON s.id = a.supplier_id AND s.is_deleted = false
     WHERE lower(a.alias) = lower(v_name)
     LIMIT 1;

    IF v_id IS NOT NULL AND p_create THEN
      UPDATE supplier_aliases
         SET times_applied   = times_applied + 1,
             last_applied_at = now()
       WHERE lower(alias) = lower(v_name);
    END IF;
  END IF;

  v_norm := fn_normalize_supplier_name(v_name);

  -- 4. same name once the legal form is stripped — unique match only
  IF v_id IS NULL AND v_norm IS NOT NULL THEN
    SELECT count(*) INTO v_hits
      FROM suppliers
     WHERE is_deleted = false
       AND fn_normalize_supplier_name(name) = v_norm;

    IF v_hits = 1 THEN
      SELECT id INTO v_id
        FROM suppliers
       WHERE is_deleted = false
         AND fn_normalize_supplier_name(name) = v_norm;
    END IF;
  END IF;

  -- 5. same as a known alias once normalized — unique match only
  IF v_id IS NULL AND v_norm IS NOT NULL THEN
    SELECT count(DISTINCT a.supplier_id) INTO v_hits
      FROM supplier_aliases a
      JOIN suppliers s ON s.id = a.supplier_id AND s.is_deleted = false
     WHERE fn_normalize_supplier_name(a.alias) = v_norm;

    IF v_hits = 1 THEN
      SELECT a.supplier_id INTO v_id
        FROM supplier_aliases a
        JOIN suppliers s ON s.id = a.supplier_id AND s.is_deleted = false
       WHERE fn_normalize_supplier_name(a.alias) = v_norm
       LIMIT 1;

      IF p_create THEN
        UPDATE supplier_aliases
           SET times_applied   = times_applied + 1,
               last_applied_at = now()
         WHERE fn_normalize_supplier_name(alias) = v_norm
           AND supplier_id = v_id;
      END IF;
    END IF;
  END IF;

  -- 6. genuinely new
  IF v_id IS NULL AND p_create THEN
    INSERT INTO suppliers (name, category_code, tax_id)
    VALUES (v_name, 2000, NULLIF(TRIM(p_tax_id), ''))
    RETURNING id INTO v_id;
  END IF;

  -- Learn the spelling — but only on the authoritative call, so a name a human
  -- has not approved yet never enters the table. The unique index on
  -- lower(alias) keeps the first mapping if another supplier already claimed it.
  IF v_id IS NOT NULL AND p_create THEN
    INSERT INTO supplier_aliases (supplier_id, alias, source)
    VALUES (v_id, v_name, 'auto')
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN v_id;
END;
$function$;

COMMENT ON FUNCTION public.fn_resolve_supplier(TEXT, TEXT, BOOLEAN) IS
  'Single entry point for turning a receipt supplier name into a supplier id: tax_id → name → alias → normalized name → normalized alias → create. Never let a caller INSERT INTO suppliers directly; that is what produced three Makro rows.';

REVOKE ALL ON FUNCTION public.fn_resolve_supplier(TEXT, TEXT, BOOLEAN) FROM anon;
REVOKE ALL ON FUNCTION public.fn_normalize_supplier_name(TEXT) FROM anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. fn_approve_receipt — resolution block replaced, everything else verbatim
-- ─────────────────────────────────────────────────────────────────────────────

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
  v_conv_factor       NUMERIC;
  v_raw_qty           NUMERIC;
  v_final_qty         NUMERIC;
  v_raw_unit_price    NUMERIC;
  v_final_unit_price  NUMERIC;
  v_total_price       NUMERIC;
  v_auto_fin_sub      INTEGER;
BEGIN
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
    COALESCE((p_payload->>'transaction_date')::DATE, CURRENT_DATE),
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

  -- Spokes (food_items, capex_items, opex_items) — unchanged from v9
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
      v_nom_id    := NULL;
      v_item_name := COALESCE(v_item->>'name', 'Unknown item');
      v_item_unit := COALESCE(v_item->>'unit', 'pcs');

      IF v_item->>'nomenclature_id' IS NOT NULL
         AND v_item->>'nomenclature_id' <> ''
         AND v_item->>'nomenclature_id' <> '__NEW__' THEN
        v_nom_id := (v_item->>'nomenclature_id')::UUID;
      END IF;

      IF v_nom_id IS NULL THEN
        INSERT INTO nomenclature (product_code, name, type, base_unit)
        VALUES (
          'RAW-AUTO-' || substr(md5(random()::text), 1, 8),
          v_item_name,
          'good',
          v_item_unit
        )
        RETURNING id INTO v_nom_id;
        v_auto_count := v_auto_count + 1;
      END IF;

      v_conv_factor := NULL;
      IF v_supplier_id IS NOT NULL THEN
        SELECT sc.conversion_factor
        INTO v_conv_factor
        FROM supplier_catalog sc
        WHERE sc.supplier_id = v_supplier_id
          AND sc.nomenclature_id = v_nom_id
          AND sc.conversion_factor IS NOT NULL
        ORDER BY sc.match_count DESC
        LIMIT 1;
      END IF;

      v_raw_qty        := COALESCE((v_item->>'quantity')::NUMERIC, 1);
      v_raw_unit_price := COALESCE((v_item->>'unit_price')::NUMERIC, 0);
      v_total_price    := COALESCE((v_item->>'total_price')::NUMERIC, 0);

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

      INSERT INTO purchase_logs (
        nomenclature_id, supplier_id, quantity, price_per_unit,
        total_price, invoice_date, expense_id, notes
      ) VALUES (
        v_nom_id,
        v_supplier_id,
        v_final_qty,
        v_final_unit_price,
        v_total_price,
        COALESCE((p_payload->>'transaction_date')::DATE, CURRENT_DATE),
        v_expense_id,
        v_item_name
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
        COALESCE((p_payload->>'transaction_date')::DATE, CURRENT_DATE),
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
    'auto_created', v_auto_count
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. fn_approve_receipt_with_learning — same resolver, no second opinion
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_approve_receipt_with_learning(p_payload jsonb, p_inbox_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_result           JSONB;
  v_supplier_id      UUID;
  v_supplier_name    TEXT;
  v_supplier_tax_id  TEXT;
  v_rules_learned    INTEGER;
  v_item             JSONB;
  v_capex_count      INTEGER := 0;
  v_expense_id       UUID;
  v_vendor_name      TEXT;
  v_purchase_date    DATE;
  v_apply_result     JSONB;
BEGIN
  -- ── 1. Run the base approval logic ──
  v_result := public.fn_approve_receipt(p_payload);

  IF NOT (v_result->>'ok')::BOOLEAN THEN
    RETURN v_result;
  END IF;

  -- ── 2. Common fields ──
  v_supplier_name   := p_payload->>'supplier_name';
  v_supplier_tax_id := NULLIF(TRIM(p_payload->>'supplier_tax_id'), '');
  v_expense_id      := (v_result->>'expense_id')::UUID;
  v_purchase_date   := COALESCE((p_payload->>'transaction_date')::DATE, CURRENT_DATE);

  -- ── 3. Resolve supplier_id (for learning + capex vendor name) ──
  --    Was a hand-rolled tax_id → name → alias ladder that could disagree with
  --    the base function. Same resolver now, p_create = false: fn_approve_receipt
  --    has already created the row if it was genuinely new.
  IF p_payload->>'supplier_id' IS NOT NULL AND p_payload->>'supplier_id' <> '' THEN
    v_supplier_id := (p_payload->>'supplier_id')::UUID;
  ELSIF v_supplier_name IS NOT NULL AND v_supplier_name <> '' THEN
    v_supplier_id := public.fn_resolve_supplier(v_supplier_name, v_supplier_tax_id, false);
  END IF;

  IF v_supplier_id IS NOT NULL THEN
    SELECT name INTO v_vendor_name
    FROM public.suppliers
    WHERE id = v_supplier_id;
  END IF;

  v_vendor_name := COALESCE(v_vendor_name, v_supplier_name);

  -- ── 4. Auto-create capex_assets for CapEx items ──
  IF p_payload->'capex_items' IS NOT NULL
     AND jsonb_array_length(p_payload->'capex_items') > 0 THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_payload->'capex_items')
    LOOP
      INSERT INTO public.capex_assets (
        asset_name, vendor, initial_value, residual_value,
        useful_life_months, purchase_date, category_code
      ) VALUES (
        COALESCE(v_item->>'name', 'Unknown CapEx item'),
        v_vendor_name,
        COALESCE((v_item->>'total_price')::NUMERIC, 0),
        0,
        60,
        v_purchase_date,
        COALESCE((p_payload->>'category_code')::INTEGER, NULL)
      );
      v_capex_count := v_capex_count + 1;
    END LOOP;
  END IF;

  -- ── 5. Apply inbox-side rule counters (atomic with persist) ──
  IF p_inbox_id IS NOT NULL THEN
    v_apply_result := public.fn_apply_inbox_overrides(p_inbox_id, p_payload);
    v_result := v_result || jsonb_build_object('rule_counters', v_apply_result);
  END IF;

  -- ── 6. Run post-approval learning (creates new rules from diffs) ──
  IF p_inbox_id IS NOT NULL THEN
    v_rules_learned := public.fn_learn_from_approval(p_inbox_id, p_payload, v_supplier_id);
    v_result := v_result || jsonb_build_object('rules_learned', v_rules_learned);
  END IF;

  -- ── 7. Append capex_assets count to result ──
  IF v_capex_count > 0 THEN
    v_result := v_result || jsonb_build_object('capex_assets_created', v_capex_count);
  END IF;

  RETURN v_result;
END;
$function$;

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '386_supplier_alias_resolution.sql',
  'claude-code',
  NULL,
  'fn_approve_receipt no longer creates a supplier per spelling: new fn_resolve_supplier (tax_id → name → alias → normalized name → normalized alias → create) is now the single resolution path for both approval functions, and alias hits bump times_applied. Root cause behind Makro x3, HomePro x3, MR.D.I.Y x3 (MC aac8cecb).'
)
ON CONFLICT DO NOTHING;

COMMIT;
