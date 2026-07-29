-- 389_catalog_matching_queue.sql
-- W3 of the procurement epic sequencing (MC 31c5715e).
-- MC task: 4275cd89-c351-4185-aafc-7bb035d5d261 (part b)
--
-- Migration 388 made the Price Book stop lying about what it knows. This one
-- gives the CEO a way to make it know more. 832 catalog rows hold a real
-- supplier price with no link to an item we stock, so they can be neither
-- compared (v_price_comparison needs the link) nor ordered
-- (po_lines.nomenclature_id is NOT NULL). Another 101 rows ARE linked and
-- priced but carry no pack size, which is exactly what 388 stopped inventing.
--
-- THE "NOT OURS" OUTCOME IS LOAD-BEARING. Sampling the real orphans shows many
-- have no match by design — Ovaltine, collagen powder, dishwashing liquid.
-- A queue whose only outcome is "link it" would never empty, so it would be
-- abandoned and the data would stay broken. `match_reviewed_at` records that a
-- human looked and decided we do not stock it. The row LEAVES THE QUEUE BUT
-- STAYS IN THE CATALOG: it is still a real price from a real supplier, and
-- "what else does this supplier sell?" depends on it.
--
-- Suggestions are a FUNCTION, not a view. 832 orphans x ~600 purchasable items
-- is a cross product that would be recomputed on every page load, for
-- candidates nobody asked to see. It runs when a row is opened.
--
-- CONTRACT-REVIEWED: touches supplier_catalog and admin-only views only.
-- Nothing the site reads (menu_public, nomenclature_tags, site_content,
-- menu_modifiers, price_tiers) is referenced, and nothing here writes to
-- nomenclature. `node scripts/contract-check.mjs` green before and after.
--
-- Reversible: DOWN block at the tail.

-- ---------------------------------------------------------------------------
-- 1. "Reviewed, not ours"
-- ---------------------------------------------------------------------------
ALTER TABLE public.supplier_catalog
  ADD COLUMN IF NOT EXISTS match_reviewed_at timestamptz;

COMMENT ON COLUMN public.supplier_catalog.match_reviewed_at IS
  'A human looked at this unlinked row and decided it maps to nothing we stock. '
  'It leaves the matching queue but STAYS in the catalog - it is still a real '
  'price from a real supplier, and "what else does this supplier sell" needs '
  'it. Mig 389.';

-- Trigram index: fn_suggest_catalog_matches scans every purchasable item per
-- opened row, and similarity() without this is a sequential scan each time.
CREATE INDEX IF NOT EXISTS idx_nomenclature_name_trgm
  ON public.nomenclature USING gin (lower(name) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_supplier_catalog_unlinked_queue
  ON public.supplier_catalog (supplier_id)
  WHERE nomenclature_id IS NULL AND match_reviewed_at IS NULL;

-- ---------------------------------------------------------------------------
-- 2. Candidates for one row, on demand
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_suggest_catalog_matches(
  p_catalog_id uuid,
  p_limit integer DEFAULT 5
)
RETURNS TABLE (nomenclature_id uuid, product_code text, item_name text,
               base_unit text, cost_per_unit numeric, score numeric)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH src AS (
    SELECT lower(COALESCE(NULLIF(sc.product_name, ''), sc.original_name, sc.full_title)) AS raw_name,
           sc.barcode
    FROM public.supplier_catalog sc WHERE sc.id = p_catalog_id
  )
  SELECT n.id, n.product_code, n.name, n.base_unit, n.cost_per_unit,
         ROUND(GREATEST(
           similarity(src.raw_name, lower(n.name)),
           -- A shared barcode is proof, not a guess: scored above any name
           -- similarity so it always sorts first.
           CASE WHEN src.barcode IS NOT NULL AND EXISTS (
                  SELECT 1 FROM public.sku k
                   WHERE k.nomenclature_id = n.id AND k.barcode = src.barcode)
                THEN 1.0 ELSE 0 END
         )::numeric, 3) AS score
  FROM public.nomenclature n, src
  WHERE COALESCE(n.is_deleted, false) = false
    AND (n.product_code LIKE 'RAW-%' OR n.product_code LIKE 'NF-PKG%'
      OR n.product_code LIKE 'GOODS-%')
    AND src.raw_name IS NOT NULL
  ORDER BY score DESC, n.name
  LIMIT GREATEST(1, p_limit);
$function$;

GRANT EXECUTE ON FUNCTION public.fn_suggest_catalog_matches(uuid, integer) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Link an orphan (optionally capturing the pack size in the same move)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_link_catalog_row(
  p_catalog_id       uuid,
  p_nomenclature_id  uuid,
  p_package_qty      numeric DEFAULT NULL,
  p_package_unit     text    DEFAULT NULL,
  p_conversion_factor numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_base_unit text;
  v_name      text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;
  IF p_conversion_factor IS NOT NULL AND p_conversion_factor <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Pack size must be greater than 0');
  END IF;

  SELECT base_unit, name INTO v_base_unit, v_name
    FROM public.nomenclature
   WHERE id = p_nomenclature_id AND COALESCE(is_deleted, false) = false;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Item not found');
  END IF;

  -- COALESCE throughout: linking must never blank a pack size somebody already
  -- recorded, and the caller may legitimately pass none.
  UPDATE public.supplier_catalog
     SET nomenclature_id   = p_nomenclature_id,
         base_unit         = COALESCE(base_unit, v_base_unit),
         package_qty       = COALESCE(p_package_qty, package_qty),
         package_unit      = COALESCE(p_package_unit, package_unit),
         conversion_factor = COALESCE(p_conversion_factor, conversion_factor),
         match_reviewed_at = now(),
         verified_at       = now(),
         updated_at        = now()
   WHERE id = p_catalog_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Catalog row not found');
  END IF;

  -- `pack_known` tells the caller whether this row is now comparable or merely
  -- visible — linking alone does not make a price comparable.
  RETURN jsonb_build_object('ok', true, 'linked_to', v_name,
    'pack_known', COALESCE(p_conversion_factor, 0) > 0);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.fn_link_catalog_row(uuid, uuid, numeric, text, numeric) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. "Not something we stock" — leaves the queue, stays in the catalog
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_dismiss_catalog_row(p_catalog_id uuid, p_reviewed boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;
  -- Guarded to unlinked rows: this must never silently un-review a row that
  -- has since been matched.
  UPDATE public.supplier_catalog
     SET match_reviewed_at = CASE WHEN p_reviewed THEN now() ELSE NULL END,
         updated_at = now()
   WHERE id = p_catalog_id AND nomenclature_id IS NULL;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Unlinked catalog row not found');
  END IF;
  RETURN jsonb_build_object('ok', true, 'reviewed', p_reviewed);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.fn_dismiss_catalog_row(uuid, boolean) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Pack size for the rows migration 388 stopped inventing a price for
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_set_catalog_pack(
  p_catalog_id       uuid,
  p_conversion_factor numeric,
  p_package_qty      numeric DEFAULT NULL,
  p_package_unit     text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;
  -- Zero or NULL would put us straight back to the divide-by-assumed-1 bug.
  IF p_conversion_factor IS NULL OR p_conversion_factor <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Pack size must be greater than 0');
  END IF;
  UPDATE public.supplier_catalog
     SET conversion_factor = p_conversion_factor,
         package_qty  = COALESCE(p_package_qty, package_qty),
         package_unit = COALESCE(p_package_unit, package_unit),
         verified_at  = now(),
         updated_at   = now()
   WHERE id = p_catalog_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Catalog row not found');
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.fn_set_catalog_pack(uuid, numeric, numeric, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. The two work queues
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_catalog_match_queue
WITH (security_invoker = true) AS
SELECT sc.id AS catalog_id, sc.supplier_id, s.name AS supplier_name,
       COALESCE(NULLIF(sc.product_name, ''), sc.original_name, sc.full_title) AS raw_name,
       sc.supplier_sku, sc.barcode, sc.last_seen_price,
       sc.package_qty, sc.package_unit, sc.source, sc.updated_at
FROM public.supplier_catalog sc
JOIN public.suppliers s ON s.id = sc.supplier_id
WHERE sc.nomenclature_id IS NULL
  AND sc.match_reviewed_at IS NULL
  AND COALESCE(s.is_deleted, false) = false;

GRANT SELECT ON public.v_catalog_match_queue TO authenticated;

CREATE OR REPLACE VIEW public.v_catalog_pack_missing
WITH (security_invoker = true) AS
SELECT sc.id AS catalog_id, sc.supplier_id, s.name AS supplier_name,
       sc.nomenclature_id, n.product_code, n.name AS item_name, n.base_unit,
       COALESCE(NULLIF(sc.product_name, ''), sc.original_name, sc.full_title) AS raw_name,
       sc.last_seen_price, sc.package_qty, sc.package_unit, sc.updated_at
FROM public.supplier_catalog sc
JOIN public.suppliers s ON s.id = sc.supplier_id
JOIN public.nomenclature n ON n.id = sc.nomenclature_id
WHERE sc.last_seen_price IS NOT NULL
  AND (sc.conversion_factor IS NULL OR sc.conversion_factor = 0)
  AND COALESCE(s.is_deleted, false) = false
  AND COALESCE(n.is_deleted, false) = false;

GRANT SELECT ON public.v_catalog_pack_missing TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. v_catalog_health — so this is monitored, not re-audited by hand
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_catalog_health
WITH (security_invoker = true) AS
SELECT
  (SELECT count(*) FROM supplier_catalog) AS rows_total,
  (SELECT count(*) FROM supplier_catalog WHERE nomenclature_id IS NOT NULL) AS rows_linked,
  (SELECT count(*) FROM v_catalog_match_queue) AS queue_pending,
  (SELECT count(*) FROM supplier_catalog
    WHERE nomenclature_id IS NULL AND match_reviewed_at IS NOT NULL) AS reviewed_not_stocked,
  (SELECT count(*) FROM v_catalog_pack_missing) AS pack_missing,
  -- The number that actually matters: linked AND priced AND pack-normalised.
  (SELECT count(*) FROM supplier_catalog
    WHERE nomenclature_id IS NOT NULL AND last_seen_price IS NOT NULL
      AND conversion_factor IS NOT NULL AND conversion_factor <> 0) AS rows_comparable,
  (SELECT count(*) FROM supplier_catalog WHERE last_seen_price IS NOT NULL
      AND COALESCE(verified_at, updated_at) < now() - interval '90 days') AS rows_stale_90d,
  (SELECT count(*) FROM (
      SELECT nomenclature_id FROM v_price_comparison WHERE unit_cost IS NOT NULL
       GROUP BY nomenclature_id HAVING count(DISTINCT supplier_id) >= 2) t) AS items_with_2plus_offers,
  (SELECT count(*) FROM nomenclature
    WHERE COALESCE(is_deleted, false) = false
      AND (product_code LIKE 'RAW-%' OR product_code LIKE 'NF-PKG%'
        OR product_code LIKE 'GOODS-%')) AS purchasable_items;

GRANT SELECT ON public.v_catalog_health TO authenticated;

COMMENT ON VIEW public.v_catalog_health IS
  'One-row scorecard for supplier_catalog usability: how much of it is linked, '
  'priced per unit, fresh, and how many items have a real multi-supplier '
  'comparison. Mig 389, MC 4275cd89b.';

-- Self-register (RULE-MIGRATION-TRACKING).
INSERT INTO public.migration_log (filename, applied_by, status, notes)
VALUES ('389_catalog_matching_queue.sql', 'claude-opus-session-087dae10', 'success',
        'W3: orphan matching queue + pack-size capture + v_catalog_health. MC 4275cd89 part b.')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- DOWN
-- ---------------------------------------------------------------------------
-- DROP VIEW IF EXISTS public.v_catalog_health;
-- DROP VIEW IF EXISTS public.v_catalog_pack_missing;
-- DROP VIEW IF EXISTS public.v_catalog_match_queue;
-- DROP FUNCTION IF EXISTS public.fn_set_catalog_pack(uuid, numeric, numeric, text);
-- DROP FUNCTION IF EXISTS public.fn_dismiss_catalog_row(uuid, boolean);
-- DROP FUNCTION IF EXISTS public.fn_link_catalog_row(uuid, uuid, numeric, text, numeric);
-- DROP FUNCTION IF EXISTS public.fn_suggest_catalog_matches(uuid, integer);
-- DROP INDEX IF EXISTS public.idx_supplier_catalog_unlinked_queue;
-- DROP INDEX IF EXISTS public.idx_nomenclature_name_trgm;
-- ALTER TABLE public.supplier_catalog DROP COLUMN IF EXISTS match_reviewed_at;
