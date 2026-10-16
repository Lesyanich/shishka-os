-- 462_matcher_skip_soft_deleted_targets.sql
-- MC 00a81c22 — follow-up to migration 459, logged by PR #597's review as a
-- one-line-per-level fix and verified independently against the live function.
--
-- WHY. 459 gave fn_approve_receipt a resolution ladder, which was the right
-- fix. But five of the ladder's levels resolve through supplier_catalog / sku
-- without filtering nomenclature.is_deleted, so the matcher can hand back a
-- soft-deleted canonical item. Confirmed live on 2026-10-16:
--
--   catalog row "Water"                     -> RAW-MORNING-GLORY (is_deleted)
--   catalog rows "Green Stem Eggplant" (x3) -> RAW-THAI-EGGPLANT (is_deleted)
--
-- This is a REGRESSION IN EFFECT, not in code: 459 did not create those bad
-- catalog rows, but before 459 a "Water" line on a receipt minted a harmless,
-- visible RAW-AUTO stub, and after 459 the ladder resolves it confidently onto
-- morning glory at level name:supplier_catalog. That is how morning glory came
-- to cost 30 THB/kg in the first place — the price of a water delivery — and
-- with 459 live the next water line would book there again, silently.
--
-- Blast radius measured: 58 supplier_catalog rows point at 35 soft-deleted
-- nomenclature items (26 of those rows carry a barcode). None of the 35 is a
-- mig-325 [MERGED->CODE] tombstone, so none of them is a redirect the ladder
-- should be following; they are simply retired items. With the filter in place
-- those rows fall through to the name levels and, failing those, mint a stub —
-- visible, and queued in unmatched_items. Safe beats silently wrong.
--
-- WHAT THIS MIGRATION DOES. fn_match_nomenclature only: adds
-- `AND n.is_deleted = false` to the five levels that lacked it ---
--   barcode:supplier_catalog, barcode:sku,
--   sku:supplier_catalog, sku:supplier_catalog_xref,
--   name:supplier_catalog (both the ambiguity count and the pick, so they stay
--   consistent — a name whose only catalog match is deleted must count as 0
--   hits, not as 1 hit that then returns nothing).
-- The levels that already filtered (barcode:purchase_logs,
-- barcode:correction_rules, sku:purchase_logs, name:nomenclature,
-- name:existing_stub, name:aliases, name:tombstone) are unchanged, as is the
-- level order and every return value.
--
-- WHAT THIS MIGRATION DOES NOT DO
--   * No data changes at all. Not one row of supplier_catalog, nomenclature,
--     purchase_logs or expense_ledger is touched. No cost is recomputed.
--   * It does not repair the poisoned catalog rows. Three of the four close as
--     a side effect of the filter because their target is soft-deleted, but
--     "Pineapple Juice _CS" -> RAW-PINEAPPLE (target NOT deleted) still
--     resolves, and juice is not fresh pineapple. Repointing it is a CEO call
--     and belongs to migration 460 (PR #597, unapplied), which disconnects it
--     and repoints the eggplant pair at RAW-EGGPLANT.
--   * It does not widen the ladder or change what counts as a match.
--
-- NUMBERING. 460 is taken by PR #597 (unapplied) and 461 is reserved there for
-- its CEO-gated Part B, so this takes 462. Applying it now leaves the database
-- at 459 + 462 with 460/461 pending — the same sanctioned applied-but-unmerged
-- gap 459 already sits in, and the migration canary's "skips ahead of max+1"
-- warning is expected here. 460 and 461 do not touch fn_match_nomenclature, so
-- they can land in either order after this.

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_match_nomenclature(
  p_supplier_id   uuid,
  p_barcode       text,
  p_supplier_sku  text,
  p_name          text,
  p_original_name text DEFAULT NULL::text
)
 RETURNS TABLE(nomenclature_id uuid, sku_id uuid, conversion_factor numeric, match_level text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
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
  IF v_barcode IS NOT NULL THEN
    -- 462: was missing n.is_deleted = false — a barcode could resolve onto a
    -- retired item (e.g. the "Water" row pointing at RAW-MORNING-GLORY).
    SELECT sc.nomenclature_id, sc.sku_id, sc.conversion_factor
      INTO v_id, v_sku_id, v_conv
      FROM supplier_catalog sc
      JOIN nomenclature n ON n.id = sc.nomenclature_id AND n.is_deleted = false
     WHERE sc.barcode = v_barcode
     ORDER BY sc.match_count DESC
     LIMIT 1;
    IF v_id IS NOT NULL THEN
      RETURN QUERY SELECT v_id, v_sku_id, v_conv, 'barcode:supplier_catalog'::TEXT;
      RETURN;
    END IF;

    -- 462: same gap on the sku table.
    SELECT s.nomenclature_id, s.id
      INTO v_id, v_sku_id
      FROM sku s
      JOIN nomenclature n ON n.id = s.nomenclature_id AND n.is_deleted = false
     WHERE s.barcode = v_barcode
     LIMIT 1;
    IF v_id IS NOT NULL THEN
      RETURN QUERY SELECT v_id, v_sku_id, NULL::NUMERIC, 'barcode:sku'::TEXT;
      RETURN;
    END IF;

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

  IF v_sku IS NOT NULL THEN
    IF p_supplier_id IS NOT NULL THEN
      -- 462: was missing n.is_deleted = false — this is the level that resolved
      -- "Green Stem Eggplant" onto the retired RAW-THAI-EGGPLANT.
      SELECT sc.nomenclature_id, sc.sku_id, sc.conversion_factor
        INTO v_id, v_sku_id, v_conv
        FROM supplier_catalog sc
        JOIN nomenclature n ON n.id = sc.nomenclature_id AND n.is_deleted = false
       WHERE sc.supplier_sku = v_sku
         AND sc.supplier_id = p_supplier_id
       ORDER BY sc.match_count DESC
       LIMIT 1;
      IF v_id IS NOT NULL THEN
        RETURN QUERY SELECT v_id, v_sku_id, v_conv, 'sku:supplier_catalog'::TEXT;
        RETURN;
      END IF;
    END IF;

    -- 462: same gap on the Makro article-number cross-check.
    SELECT sc.nomenclature_id, sc.sku_id, sc.conversion_factor
      INTO v_id, v_sku_id, v_conv
      FROM supplier_catalog sc
      JOIN nomenclature n ON n.id = sc.nomenclature_id AND n.is_deleted = false
     WHERE sc.barcode = v_sku
     ORDER BY sc.match_count DESC
     LIMIT 1;
    IF v_id IS NOT NULL THEN
      RETURN QUERY SELECT v_id, v_sku_id, v_conv, 'sku:supplier_catalog_xref'::TEXT;
      RETURN;
    END IF;

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

  IF v_norm IS NOT NULL OR v_norm_th IS NOT NULL THEN
    -- 462: the filter goes on BOTH the ambiguity count and the pick. A name
    -- whose only catalog match is a retired item must count as zero hits, so
    -- the ladder falls through to the name levels instead of returning the
    -- retired item (this is the level that booked "Water" onto morning glory).
    SELECT count(DISTINCT sc.nomenclature_id) INTO v_hits
      FROM supplier_catalog sc
      JOIN nomenclature n ON n.id = sc.nomenclature_id AND n.is_deleted = false
     WHERE (
            fn_normalize_product_name(sc.product_name)    IN (v_norm, v_norm_th)
         OR fn_normalize_product_name(sc.original_name)   IN (v_norm, v_norm_th)
         OR fn_normalize_product_name(sc.product_name_th) IN (v_norm, v_norm_th)
         OR fn_normalize_product_name(sc.full_title)      IN (v_norm, v_norm_th)
       );
    IF v_hits = 1 THEN
      SELECT sc.nomenclature_id, sc.sku_id, sc.conversion_factor
        INTO v_id, v_sku_id, v_conv
        FROM supplier_catalog sc
        JOIN nomenclature n ON n.id = sc.nomenclature_id AND n.is_deleted = false
       WHERE (
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

  RETURN QUERY SELECT NULL::UUID, NULL::UUID, NULL::NUMERIC, 'none'::TEXT;
END;
$function$;


-- Assert the fix in the same transaction, over exactly the regression surface:
-- the 58 supplier_catalog rows that currently point at a soft-deleted item.
-- (Scoped to those rows on purpose — running the ladder over all 1,434 catalog
-- rows would normalize four name columns per row per row, which is minutes of
-- work for no extra signal.) After this migration none of them may come back
-- pointing at a soft-deleted item: each must resolve to a live one or not at all.
DO $assert$
DECLARE
  v_bad INTEGER;
BEGIN
  SELECT count(*) INTO v_bad
    FROM supplier_catalog sc
    JOIN nomenclature target ON target.id = sc.nomenclature_id AND target.is_deleted = true
    CROSS JOIN LATERAL public.fn_match_nomenclature(
      sc.supplier_id, sc.barcode, sc.supplier_sku,
      COALESCE(sc.product_name, sc.original_name),
      sc.original_name
    ) m
    JOIN nomenclature hit ON hit.id = m.nomenclature_id
   WHERE hit.is_deleted = true;

  IF v_bad > 0 THEN
    RAISE EXCEPTION
      'ABORT: the matcher still returns a soft-deleted item for % supplier_catalog row(s).', v_bad;
  END IF;
END
$assert$;

-- This migration is function-only by design; assert the function stayed STABLE,
-- which is Postgres-enforced read-only and the property PR #597's stub-merge
-- map relied on when it ran the ladder over all 388 stubs.
DO $assert$
DECLARE
  v_volatility "char";
BEGIN
  SELECT p.provolatile INTO v_volatility
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'fn_match_nomenclature';
  IF v_volatility IS DISTINCT FROM 's' THEN
    RAISE EXCEPTION 'ABORT: fn_match_nomenclature must stay STABLE (read-only); found volatility %.', v_volatility;
  END IF;
END
$assert$;


INSERT INTO public.migration_log (filename, applied_by, status, notes)
VALUES ('462_matcher_skip_soft_deleted_targets.sql', 'claude-opus-session-7cb1b659', 'success',
        'MC 00a81c22 follow-up to 459. fn_match_nomenclature: added n.is_deleted = false to the five levels '
     || 'that lacked it (barcode:supplier_catalog, barcode:sku, sku:supplier_catalog, sku:supplier_catalog_xref, '
     || 'name:supplier_catalog on both the ambiguity count and the pick). 459 turned 58 supplier_catalog rows '
     || 'pointing at 35 retired items into confident wrong answers — notably "Water" -> RAW-MORNING-GLORY, which '
     || 'is why morning glory was priced as a water delivery. Those rows now fall through to a visible stub '
     || 'queued in unmatched_items. Function-only: NO data changed, NO cost recomputed. Does NOT fix '
     || '"Pineapple Juice _CS" -> RAW-PINEAPPLE (live target, CEO call, migration 460). Numbered 462 because '
     || '460 is PR #597 and 461 is reserved for its Part B.')
ON CONFLICT (filename) DO NOTHING;

COMMIT;
