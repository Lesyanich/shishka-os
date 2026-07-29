-- 393_supplier_catalog_ingest.sql
-- W2 of the procurement epic sequencing (MC 31c5715e).
-- MC task: c3289714-3933-46a8-8fe5-3358786d47a5
-- Spec: docs/projects/admin/plans/spec-supplier-catalog-ingest.md
--
-- THE GAP. A supplier sends a price list of 200-700 items and there is no way to
-- turn it into rows, so it becomes a file, a markdown table, or a chat message —
-- and the Price Book compares nothing. Every write path into supplier_catalog
-- refuses that case: fn_record_supplier_quote (mig 318) takes ONE row and
-- *requires* p_nomenclature_id, so an item we have never bought cannot be
-- recorded at all; fn_approve_receipt only writes what we already bought;
-- update_tops_prices is Tops-only and keyed by EAN; useSupplierMapping writes
-- one row during receipt matching. What was left was agents hand-writing
-- INSERTs into migrations, which is the bug, not the workaround.
--
-- THE SINK. fn_import_supplier_catalog is the one write path, callable from
-- SQL, PostgREST, an Edge Function and an MCP tool. The payload is deliberately
-- dumb — a jsonb array of rows — so every front-end (paste/CSV, single-item
-- add, the Tops scraper, and later the photo/PDF Catalog Inbox) shapes the same
-- thing and inherits the same rules.
--
-- THREE RULES IT EXISTS TO ENFORCE, all of them lessons already paid for:
--
--  (a) NEVER INVENT A PACK SIZE. Migration 388 removed the
--      COALESCE(conversion_factor, 1) that silently priced a 5 kg sack as one
--      base unit — 68 of the 296 rows the Price Book served carried an invented
--      unit price. An importer that defaults the factor to 1 puts that straight
--      back. Absent => NULL, counted in pack_unknown, surfaced in
--      v_catalog_pack_missing. A factor is derived ONLY when package_unit
--      equals the linked item's base_unit, which is arithmetic on two stated
--      facts, not an assumption.
--
--  (b) NEVER FORK A SUPPLIER. Resolution goes through fn_resolve_supplier
--      (mig 386) — the function that exists because "SIAM MAKRO" on a chit
--      produced a third Makro. p_create is tied to p_dry_run, so a PREVIEW
--      never creates a supplier, never learns an alias and never bumps a
--      counter. Previewing a misspelled name must not dirty the data before a
--      human has confirmed anything.
--
--  (c) NEVER OVERWRITE A HUMAN. An import COALESCEs into conversion_factor,
--      package_qty/unit and nomenclature_id and never clears match_reviewed_at.
--      A pack size typed via fn_set_catalog_pack, or a "not ours" verdict
--      recorded via fn_dismiss_catalog_row (both mig 389), survives the next
--      price list. This is also why update_tops_prices stops doing
--      delete-then-insert in the same PR: every sweep was discarding exactly
--      these three fields.
--
-- MERGE, NOT REPLACE (CEO decision). Prices update in place; rows absent from a
-- new list are never delisted or deleted. The accepted cost is that
-- discontinued items linger, so every touched row is stamped verified_at =
-- now() and the result reports inserted/updated SEPARATELY — 600 received with
-- 4 updated means the parse or the supplier is wrong, and that must not pass
-- quietly.
--
-- ORPHANS, NOT STUBS (CEO decision). A row matching nothing lands with
-- nomenclature_id NULL and match_reviewed_at NULL, so it appears in
-- v_catalog_match_queue. No RAW-AUTO nomenclature is created; nomenclature
-- stays clean and the queue already carries a "not ours" outcome.
--
-- DEDUPE IS A LOOKUP, NOT ON CONFLICT. Only (supplier_id, barcode) has a unique
-- index (idx_sc_supplier_barcode, partial). idx_sc_sku and idx_sc_name are
-- plain, and prod already holds 15 duplicate SKU keys and 123 duplicate name
-- keys — adding the unique indexes would fail on live data. So each row does an
-- explicit lookup and updates the FRESHEST match, leaving pre-existing
-- duplicates alone; de-duplicating the existing table is MC 4275cd89, not the
-- importer's job.
--
-- SOURCE: 41 -> 5. `source` was 41 free-text values over 1378 rows (Makro alone
-- appeared 13 ways), which is why v_price_comparison had to paper over it with
-- an ILIKE ladder. It is now constrained to the ladder's own vocabulary plus
-- `pricelist`, and the free text moves to a new source_detail column — nothing
-- is thrown away. Measured backfill: pricelist 710, receipt 224, scrape 174,
-- manual 159, quote 111.
--
-- ONE APPROVED DEVIATION. v_price_comparison's ladder maps `pricelist` to
-- family `manual` — 710 rows, over half the table, would read as "manual" in
-- the Price Book. §4 below WRAPS the ladder rather than editing it: the mig 388
-- expression is preserved character-for-character as the fallback and the
-- constrained vocabulary simply wins when present. No column is added, removed
-- or reordered; unit_cost and pack_known are untouched. CEO-approved 2026-07-29
-- as an explicit exception to the handoff packet.
--
-- CONTRACT-REVIEWED: touches supplier_catalog and one admin-only view. Nothing
-- the site reads (menu_public, nomenclature_tags, site_content, menu_modifiers,
-- price_tiers) is referenced, and nothing here writes to nomenclature.
--
-- Reversible: DOWN block at the tail.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Provenance gets its own column, so `source` can become a classification
-- ---------------------------------------------------------------------------
ALTER TABLE public.supplier_catalog
  ADD COLUMN IF NOT EXISTS source_detail text;

COMMENT ON COLUMN public.supplier_catalog.source_detail IS
  'Free-form provenance: "laadthai_pricelist_2026-07-29", "tops_sweep_2026-07-29". '
  'The `source` column is a 5-value classification; anything more specific '
  'belongs here. Mig 393.';

COMMENT ON COLUMN public.supplier_catalog.source IS
  'How we learned this price: quote | receipt | scrape | pricelist | manual. '
  'Constrained by supplier_catalog_source_check. Free text goes in '
  'source_detail. Mig 393 (was 41 free-text values).';

-- ---------------------------------------------------------------------------
-- 2. Backfill, then constrain
--
-- The ladder is migration 388's, with one `pricelist` branch inserted after
-- `receipt`. Order matters only in that quote/receipt are checked before the
-- broader scrape tokens, exactly as 388 has it.
-- ---------------------------------------------------------------------------
UPDATE public.supplier_catalog
   SET source_detail = COALESCE(source_detail, source)
 WHERE source IS NOT NULL
   AND source NOT IN ('quote','receipt','scrape','pricelist','manual');

UPDATE public.supplier_catalog
   SET source = CASE
     WHEN source ILIKE '%quote%' THEN 'quote'
     WHEN source ILIKE '%receipt%' OR source ILIKE '%ocr%' THEN 'receipt'
     WHEN source ILIKE '%price_list%' OR source ILIKE '%pricelist%'
       OR source ILIKE '%price list%' THEN 'pricelist'
     WHEN source ILIKE '%makro%' OR source ILIKE '%scrape%' OR source ILIKE '%api%'
       OR source ILIKE '%web%' OR source ILIKE 'line%' OR source ILIKE '%lazada%'
       OR source ILIKE '%shopee%' OR source ILIKE '%sangdamrong%' OR source ILIKE '%tops%'
       OR source ILIKE '%homepro%' THEN 'scrape'
     ELSE 'manual'
   END
 WHERE source IS NULL
    OR source NOT IN ('quote','receipt','scrape','pricelist','manual');

-- Validated, not NOT VALID: the backfill above guarantees it holds today, and a
-- NOT VALID check would still block later UPDATEs of rows it never checked
-- (gotcha_not_valid_constraint_blocks_edits).
ALTER TABLE public.supplier_catalog
  DROP CONSTRAINT IF EXISTS supplier_catalog_source_check;

ALTER TABLE public.supplier_catalog
  ADD CONSTRAINT supplier_catalog_source_check
  CHECK (source IS NULL OR source IN ('quote','receipt','scrape','pricelist','manual'));

-- ---------------------------------------------------------------------------
-- 3. fn_import_supplier_catalog — the sink
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_import_supplier_catalog(
  p_supplier_id   uuid    DEFAULT NULL,
  p_supplier_name text    DEFAULT NULL,
  p_source        text    DEFAULT 'manual',
  p_source_detail text    DEFAULT NULL,
  p_rows          jsonb   DEFAULT '[]'::jsonb,
  p_dry_run       boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_supplier_id   uuid;
  v_probe         uuid;
  v_created       boolean := false;
  v_would_create  boolean := false;
  v_row           jsonb;
  v_idx           integer := 0;
  v_name          text;
  v_name_en       text;
  v_name_th       text;
  v_sku           text;
  v_barcode       text;
  v_price         numeric;
  v_pkg_qty       numeric;
  v_pkg_unit      text;
  v_purchase_unit text;
  v_cf            numeric;
  v_brand         text;
  v_ext_url       text;
  v_img_url       text;
  v_nom           uuid;
  v_base_unit     text;
  v_existing      uuid;
  v_key           text;
  v_keys          text[] := ARRAY[]::text[];
  v_final_nom     uuid;
  v_final_cf      numeric;
  v_inserted      integer := 0;
  v_updated       integer := 0;
  v_skipped       integer := 0;
  v_dupes         integer := 0;
  v_unlinked      integer := 0;
  v_pack_unknown  integer := 0;
  v_by_barcode    integer := 0;
  v_errors        jsonb := '[]'::jsonb;
  v_err_total     integer := 0;
  v_detail        jsonb := '[]'::jsonb;
BEGIN
  -- ── Authorization ────────────────────────────────────────────────────────
  -- The admin UI arrives as `authenticated` with a staff.app_role, so the role
  -- gate applies there. An MCP tool arrives as service_role, where auth.uid()
  -- is NULL by definition — mig 389's `auth.uid() IS NULL` guard would reject
  -- it outright, and the CEO's "the scrapers must feed this too" decision
  -- requires it to pass. `postgres` is what a migration test runs as.
  IF auth.uid() IS NOT NULL THEN
    IF NOT public.fn_has_app_role(ARRAY['owner','task_manager']) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Not authorized');
    END IF;
  ELSIF current_user NOT IN ('service_role', 'postgres') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  -- ── Payload sanity ───────────────────────────────────────────────────────
  IF p_source IS NULL
     OR p_source NOT IN ('quote','receipt','scrape','pricelist','manual') THEN
    RETURN jsonb_build_object('ok', false, 'error',
      'source must be one of quote, receipt, scrape, pricelist, manual');
  END IF;

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'rows must be a jsonb array');
  END IF;

  IF jsonb_array_length(p_rows) > 5000 THEN
    RETURN jsonb_build_object('ok', false, 'error',
      'Too many rows in one call (max 5000). Split the list.');
  END IF;

  -- ── Supplier ─────────────────────────────────────────────────────────────
  IF p_supplier_id IS NOT NULL THEN
    SELECT id INTO v_supplier_id
      FROM public.suppliers
     WHERE id = p_supplier_id AND COALESCE(is_deleted, false) = false;
    IF v_supplier_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Supplier not found');
    END IF;
  ELSIF NULLIF(TRIM(COALESCE(p_supplier_name, '')), '') IS NOT NULL THEN
    -- Probe first with p_create = false. That call is pure: no supplier row, no
    -- alias learned, no counter moved. It answers "does this name already
    -- resolve?" without side effects, which is what a preview needs and what
    -- tells us afterwards whether the commit actually created something.
    v_probe := public.fn_resolve_supplier(p_supplier_name, NULL, false);

    IF p_dry_run THEN
      -- Preview stops here even when the probe found nothing: the supplier
      -- genuinely does not exist yet and we refuse to create one before the
      -- human commits. v_supplier_id stays NULL, every supplier-scoped lookup
      -- below then matches nothing, and the run reports honest per-row parse,
      -- link and pack counts against a would-be-empty catalog.
      v_supplier_id := v_probe;
      v_would_create := v_probe IS NULL;
    ELSE
      -- The authoritative call: creates when genuinely new, and bumps
      -- times_applied on an alias hit (RULE-LEARNING-COUNTERS — counters move
      -- only inside the committing transaction).
      v_supplier_id := public.fn_resolve_supplier(p_supplier_name, NULL, true);
      IF v_supplier_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Could not resolve supplier');
      END IF;
      v_created := v_probe IS NULL;
    END IF;
  ELSE
    RETURN jsonb_build_object('ok', false, 'error',
      'Either supplier_id or supplier_name is required');
  END IF;

  -- ── Rows ─────────────────────────────────────────────────────────────────
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    v_idx := v_idx + 1;

    -- Per-row subtransaction: one unparseable number must not abort the other
    -- 599 rows. A bad row lands in errors[] and the import continues.
    BEGIN
      v_name          := NULLIF(TRIM(COALESCE(v_row->>'name', '')), '');
      v_name_en       := NULLIF(TRIM(COALESCE(v_row->>'name_en', '')), '');
      v_name_th       := NULLIF(TRIM(COALESCE(v_row->>'name_th', '')), '');
      v_sku           := NULLIF(TRIM(COALESCE(v_row->>'sku', '')), '');
      v_barcode       := NULLIF(TRIM(COALESCE(v_row->>'barcode', '')), '');
      v_purchase_unit := NULLIF(TRIM(COALESCE(v_row->>'purchase_unit', '')), '');
      v_pkg_unit      := NULLIF(TRIM(COALESCE(v_row->>'package_unit', '')), '');
      v_brand         := NULLIF(TRIM(COALESCE(v_row->>'brand', '')), '');
      v_ext_url       := NULLIF(TRIM(COALESCE(v_row->>'external_url', '')), '');
      v_img_url       := NULLIF(TRIM(COALESCE(v_row->>'image_url', '')), '');
      v_price         := NULLIF(v_row->>'price', '')::numeric;
      v_pkg_qty       := NULLIF(v_row->>'package_qty', '')::numeric;
      v_cf            := NULLIF(v_row->>'conversion_factor', '')::numeric;
      v_nom           := NULLIF(v_row->>'nomenclature_id', '')::uuid;

      -- A row with neither a name nor a barcode cannot be deduped, so writing
      -- it would guarantee a duplicate on the next import.
      IF v_name IS NULL AND v_barcode IS NULL THEN
        v_skipped := v_skipped + 1;
        v_err_total := v_err_total + 1;
        IF jsonb_array_length(v_errors) < 50 THEN
          v_errors := v_errors || jsonb_build_object(
            'row', v_idx, 'name', NULL, 'reason', 'no name and no barcode');
        END IF;
        CONTINUE;
      END IF;

      IF v_price IS NOT NULL AND v_price < 0 THEN
        v_skipped := v_skipped + 1;
        v_err_total := v_err_total + 1;
        IF jsonb_array_length(v_errors) < 50 THEN
          v_errors := v_errors || jsonb_build_object(
            'row', v_idx, 'name', v_name, 'reason', 'negative price');
        END IF;
        CONTINUE;
      END IF;

      -- Zero or negative is not a pack size; it is the divide-by-assumed-1 bug
      -- wearing a different hat.
      IF v_cf IS NOT NULL AND v_cf <= 0 THEN v_cf := NULL; END IF;
      IF v_pkg_qty IS NOT NULL AND v_pkg_qty <= 0 THEN v_pkg_qty := NULL; END IF;

      -- Caller-supplied link, validated.
      IF v_nom IS NOT NULL THEN
        SELECT base_unit INTO v_base_unit
          FROM public.nomenclature
         WHERE id = v_nom AND COALESCE(is_deleted, false) = false;
        IF NOT FOUND THEN
          v_nom := NULL;
          v_err_total := v_err_total + 1;
          IF jsonb_array_length(v_errors) < 50 THEN
            v_errors := v_errors || jsonb_build_object(
              'row', v_idx, 'name', v_name,
              'reason', 'nomenclature_id not found — imported unlinked');
          END IF;
        END IF;
      ELSE
        v_base_unit := NULL;
      END IF;

      -- ── Dedupe key: barcode -> sku -> normalized name, scoped to supplier ──
      v_existing := NULL;
      IF v_barcode IS NOT NULL THEN
        v_key := 'b:' || lower(v_barcode);
        SELECT id INTO v_existing FROM public.supplier_catalog
         WHERE supplier_id = v_supplier_id AND barcode = v_barcode
         ORDER BY updated_at DESC NULLS LAST LIMIT 1;
      ELSIF v_sku IS NOT NULL THEN
        v_key := 's:' || lower(v_sku);
      ELSE
        v_key := 'n:' || lower(v_name);
      END IF;

      IF v_existing IS NULL AND v_sku IS NOT NULL THEN
        SELECT id INTO v_existing FROM public.supplier_catalog
         WHERE supplier_id = v_supplier_id AND supplier_sku = v_sku
         ORDER BY updated_at DESC NULLS LAST LIMIT 1;
      END IF;

      IF v_existing IS NULL AND v_name IS NOT NULL THEN
        SELECT id INTO v_existing FROM public.supplier_catalog
         WHERE supplier_id = v_supplier_id
           AND lower(TRIM(COALESCE(NULLIF(original_name, ''),
                                   NULLIF(product_name, ''),
                                   full_title))) = lower(v_name)
         ORDER BY updated_at DESC NULLS LAST LIMIT 1;
      END IF;

      IF v_key = ANY(v_keys) THEN
        v_dupes := v_dupes + 1;
      ELSE
        v_keys := array_append(v_keys, v_key);
      END IF;

      -- ── Link by barcode, but only on insert and only as proof ─────────────
      -- A shared barcode is evidence, the same rule fn_suggest_catalog_matches
      -- scores at 1.0. Name similarity is NOT used: a guessed link is a wrong
      -- number in the Price Book, and the matching queue exists so a human
      -- decides.
      IF v_existing IS NULL AND v_nom IS NULL AND v_barcode IS NOT NULL THEN
        SELECT k.nomenclature_id INTO v_nom
          FROM public.sku k
          JOIN public.nomenclature n ON n.id = k.nomenclature_id
                                    AND COALESCE(n.is_deleted, false) = false
         WHERE k.barcode = v_barcode
         LIMIT 1;
        IF v_nom IS NOT NULL THEN
          v_by_barcode := v_by_barcode + 1;
          SELECT base_unit INTO v_base_unit FROM public.nomenclature WHERE id = v_nom;
        END IF;
      END IF;

      -- ── Derive a pack size only from two stated facts ─────────────────────
      -- package_unit == the item's base_unit means package_qty IS the factor.
      -- Different units ("bag" vs "kg") mean we do not know, and NULL is the
      -- honest answer (mig 388).
      IF v_cf IS NULL AND v_pkg_qty IS NOT NULL AND v_pkg_unit IS NOT NULL THEN
        IF v_base_unit IS NULL AND v_existing IS NOT NULL THEN
          SELECT n.base_unit INTO v_base_unit
            FROM public.supplier_catalog sc
            JOIN public.nomenclature n ON n.id = sc.nomenclature_id
           WHERE sc.id = v_existing;
        END IF;
        IF v_base_unit IS NOT NULL AND lower(TRIM(v_pkg_unit)) = lower(TRIM(v_base_unit)) THEN
          v_cf := v_pkg_qty;
        END IF;
      END IF;

      -- ── Write ────────────────────────────────────────────────────────────
      IF v_existing IS NOT NULL THEN
        IF NOT p_dry_run THEN
          -- COALESCE throughout: an import must never blank a pack size, a link
          -- or a name a human already recorded. match_reviewed_at is not in the
          -- SET list at all — a "not ours" verdict survives every price list.
          UPDATE public.supplier_catalog
             SET original_name     = COALESCE(v_name, original_name),
                 product_name      = COALESCE(v_name_en, product_name),
                 product_name_th   = COALESCE(v_name_th, product_name_th),
                 supplier_sku      = COALESCE(v_sku, supplier_sku),
                 barcode           = COALESCE(v_barcode, barcode),
                 last_seen_price   = COALESCE(v_price, last_seen_price),
                 package_qty       = COALESCE(v_pkg_qty, package_qty),
                 package_unit      = COALESCE(v_pkg_unit, package_unit),
                 purchase_unit     = COALESCE(v_purchase_unit, purchase_unit),
                 conversion_factor = COALESCE(v_cf, conversion_factor),
                 brand             = COALESCE(v_brand, brand),
                 external_url      = COALESCE(v_ext_url, external_url),
                 image_url         = COALESCE(v_img_url, image_url),
                 nomenclature_id   = COALESCE(v_nom, nomenclature_id),
                 source            = p_source,
                 source_detail     = COALESCE(p_source_detail, source_detail),
                 verified_at       = now(),
                 updated_at        = now()
           WHERE id = v_existing;
        END IF;
        v_updated := v_updated + 1;

        SELECT COALESCE(v_nom, sc.nomenclature_id), COALESCE(v_cf, sc.conversion_factor)
          INTO v_final_nom, v_final_cf
          FROM public.supplier_catalog sc WHERE sc.id = v_existing;
      ELSE
        IF NOT p_dry_run THEN
          INSERT INTO public.supplier_catalog (
            supplier_id, nomenclature_id, original_name, product_name,
            product_name_th, supplier_sku, barcode, last_seen_price,
            package_qty, package_unit, purchase_unit, conversion_factor,
            base_unit, brand, external_url, image_url,
            source, source_detail, verified_at, updated_at
          ) VALUES (
            v_supplier_id, v_nom, v_name, v_name_en,
            v_name_th, v_sku, v_barcode, v_price,
            v_pkg_qty, v_pkg_unit, v_purchase_unit, v_cf,
            v_base_unit, v_brand, v_ext_url, v_img_url,
            p_source, p_source_detail, now(), now()
          );
        END IF;
        v_inserted := v_inserted + 1;
        v_final_nom := v_nom;
        v_final_cf  := v_cf;
      END IF;

      IF v_final_nom IS NULL THEN v_unlinked := v_unlinked + 1; END IF;
      IF v_final_cf IS NULL OR v_final_cf = 0 THEN
        v_pack_unknown := v_pack_unknown + 1;
      END IF;

      -- Per-row classification, dry run only and capped: the preview table
      -- needs to say new/update/unlinked per line, but a 600-element array on
      -- every commit is payload nobody reads.
      IF p_dry_run AND jsonb_array_length(v_detail) < 200 THEN
        v_detail := v_detail || jsonb_build_object(
          'row', v_idx,
          'status', CASE WHEN v_existing IS NOT NULL THEN 'update' ELSE 'new' END,
          'linked', v_final_nom IS NOT NULL,
          'pack_known', COALESCE(v_final_cf, 0) > 0);
      END IF;

    EXCEPTION WHEN OTHERS THEN
      v_skipped := v_skipped + 1;
      v_err_total := v_err_total + 1;
      IF jsonb_array_length(v_errors) < 50 THEN
        v_errors := v_errors || jsonb_build_object(
          'row', v_idx, 'name', v_row->>'name', 'reason', SQLERRM);
      END IF;
    END;
  END LOOP;

  -- inserted and updated are reported separately on purpose: it is the CEO's
  -- only signal that a 600-line list parsed correctly. 600 received / 4 updated
  -- means the parse or the supplier is wrong.
  RETURN jsonb_build_object(
    'ok', true,
    'dry_run', p_dry_run,
    'supplier_id', v_supplier_id,
    'supplier_created', v_created,
    'supplier_would_be_created', v_would_create,
    'source', p_source,
    'received', jsonb_array_length(p_rows),
    'inserted', v_inserted,
    'updated', v_updated,
    'skipped', v_skipped,
    'duplicates_in_payload', v_dupes,
    'unlinked', v_unlinked,
    'pack_unknown', v_pack_unknown,
    'linked_by_barcode', v_by_barcode,
    'errors', v_errors,
    'errors_omitted', GREATEST(0, v_err_total - jsonb_array_length(v_errors)),
    'rows', v_detail
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_import_supplier_catalog(uuid, text, text, text, jsonb, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_import_supplier_catalog(uuid, text, text, text, jsonb, boolean)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_import_supplier_catalog(uuid, text, text, text, jsonb, boolean) IS
  'The single write path for supplier price lists: bulk, idempotent, merge-not-replace. '
  'nomenclature_id is NULLABLE so an item we have never bought still lands as a row. '
  'Never invents a conversion_factor, never forks a supplier (calls fn_resolve_supplier '
  'with p_create tied to p_dry_run), never clears a human-set pack size, link or '
  'match_reviewed_at. Mig 393, MC c3289714.';

-- ---------------------------------------------------------------------------
-- 4. v_price_comparison.source_family — vocabulary wins, ladder stays as fallback
--
-- CREATE OR REPLACE, not DROP: only one expression changes, so column names,
-- types and order are identical and the dependent summary view is untouched.
-- Everything other than the source_family CASE is migration 388 verbatim.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_price_comparison
WITH (security_invoker = true) AS
WITH ranked AS (
  SELECT
    sc.id AS catalog_id,
    sc.nomenclature_id,
    sc.supplier_id,
    sc.last_seen_price,
    sc.conversion_factor,
    sc.source,
    sc.verified_at,
    sc.updated_at,
    sc.product_name,
    sc.original_name,
    ROW_NUMBER() OVER (
      PARTITION BY sc.nomenclature_id, sc.supplier_id
      ORDER BY sc.updated_at DESC NULLS LAST, sc.verified_at DESC NULLS LAST
    ) AS rn
  FROM public.supplier_catalog sc
  WHERE sc.nomenclature_id IS NOT NULL
    AND sc.last_seen_price IS NOT NULL
)
SELECT
  r.nomenclature_id,
  n.product_code,
  COALESCE(NULLIF(n.customer_short_name, ''), n.name) AS item_name,
  n.base_unit,
  n.cost_per_unit AS current_cost,
  r.catalog_id,
  r.supplier_id,
  s.name AS supplier_name,
  r.last_seen_price,
  r.conversion_factor,
  (r.conversion_factor IS NOT NULL AND r.conversion_factor <> 0) AS pack_known,
  CASE
    WHEN r.conversion_factor IS NULL OR r.conversion_factor = 0 THEN NULL
    ELSE ROUND(r.last_seen_price / r.conversion_factor, 4)
  END AS unit_cost,
  -- Mig 393: `source` is now a constrained vocabulary, so it IS the family.
  -- The mig 388 ILIKE ladder is preserved verbatim as the fallback for any row
  -- that predates or escapes the constraint.
  CASE
    WHEN r.source IN ('quote','receipt','scrape','pricelist','manual') THEN r.source
    WHEN r.source ILIKE '%quote%' THEN 'quote'
    WHEN r.source ILIKE '%receipt%' OR r.source ILIKE '%ocr%' THEN 'receipt'
    WHEN r.source ILIKE '%makro%' OR r.source ILIKE '%scrape%' OR r.source ILIKE '%api%'
      OR r.source ILIKE '%web%' OR r.source ILIKE 'line%' OR r.source ILIKE '%lazada%'
      OR r.source ILIKE '%shopee%' OR r.source ILIKE '%sangdamrong%' OR r.source ILIKE '%tops%'
      OR r.source ILIKE '%homepro%' THEN 'scrape'
    ELSE 'manual'
  END AS source_family,
  r.product_name,
  r.original_name,
  r.verified_at,
  r.updated_at
FROM ranked r
JOIN public.nomenclature n ON n.id = r.nomenclature_id
JOIN public.suppliers s ON s.id = r.supplier_id
WHERE r.rn = 1
  AND (n.product_code LIKE 'RAW-%'
    OR n.product_code LIKE 'NF-PKG%'
    OR n.product_code LIKE 'GOODS-%')
  AND COALESCE(n.is_deleted, false) = false
  AND COALESCE(s.is_deleted, false) = false;

COMMENT ON VIEW public.v_price_comparison IS
  'One row per (item, supplier), freshest catalog row. unit_cost is NULL when '
  'the pack size is unknown — it is never derived from an assumed factor of 1. '
  'Check pack_known before presenting a comparison. source_family reads the '
  'constrained source vocabulary, falling back to the mig 388 ILIKE ladder. '
  'Mig 388 + 393, MC 4275cd89 + c3289714.';

-- Self-register (RULE-MIGRATION-TRACKING).
INSERT INTO public.migration_log (filename, applied_by, status, notes)
VALUES ('393_supplier_catalog_ingest.sql', 'claude-opus-session-9f66ebd8', 'success',
        'W2: fn_import_supplier_catalog — the single bulk write path for supplier price lists. nomenclature_id nullable, merge semantics, never invents a conversion_factor, resolves suppliers via fn_resolve_supplier with p_create tied to dry-run. source constrained to 5 values (was 41) with free text moved to source_detail. MC c3289714.')
ON CONFLICT DO NOTHING;

COMMIT;

-- ---------------------------------------------------------------------------
-- DOWN
-- ---------------------------------------------------------------------------
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.fn_import_supplier_catalog(uuid, text, text, text, jsonb, boolean);
-- ALTER TABLE public.supplier_catalog DROP CONSTRAINT IF EXISTS supplier_catalog_source_check;
-- UPDATE public.supplier_catalog SET source = source_detail WHERE source_detail IS NOT NULL;
-- ALTER TABLE public.supplier_catalog DROP COLUMN IF EXISTS source_detail;
-- Then re-run §1 of 388_price_comparison_honesty.sql to restore v_price_comparison.
-- COMMIT;
