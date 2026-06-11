-- 245_stock_order_sheet.sql
-- Staff stock-order sheet: a PIN-gated, mobile, public page where kitchen staff
-- (who have no email accounts) mark which curated items are in stock / running out
-- and how much to order. Submissions land in stock_requests and feed procurement.
--
-- Security model:
--   * Reads  → cost-free view v_stock_sheet_items, GRANT SELECT to anon.
--   * Writes → fn_submit_stock_sheet (SECURITY DEFINER) validates a shared passcode
--              server-side; anon has NO direct write to the request tables.
--   * app_config / stock_requests / stock_request_lines have RLS enabled with
--     authenticated-only policies (blocks anon even though default privileges may
--     grant anon table-level SELECT — RLS denies without a matching policy).

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. app_config — minimal single-value settings store (none existed before).
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.app_config (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.app_config IS
  'Single-value application settings (key/value). Sensitive values are read only via SECURITY DEFINER RPCs, never by anon directly.';

INSERT INTO public.app_config (key, value)
VALUES ('stock_sheet_passcode', '2468')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_config FROM anon;

DROP POLICY IF EXISTS app_config_auth_all ON public.app_config;
CREATE POLICY app_config_auth_all ON public.app_config
  FOR ALL TO authenticated
  USING (public.fn_is_authenticated())
  WITH CHECK (public.fn_is_authenticated());

-- ───────────────────────────────────────────────────────────────────────────
-- 2. nomenclature: curation flag + storage location for the sheet.
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.nomenclature
  ADD COLUMN IF NOT EXISTS in_stock_sheet   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS storage_location TEXT;

COMMENT ON COLUMN public.nomenclature.in_stock_sheet IS
  'Item appears on the staff stock-order sheet (/stock). Curated by owner — the full catalog is too large to show staff.';
COMMENT ON COLUMN public.nomenclature.storage_location IS
  'Where the item lives for stock-taking: bar | dry | fridge | freezer (rendered bilingual in UI). NULL = unset.';

-- Best-effort day-one seed matching the CEO's existing Google sheet so the page
-- is non-empty. Owner refines via the curation UI. Tombstoned/merged rows excluded.
UPDATE public.nomenclature
SET in_stock_sheet = true
WHERE COALESCE(is_deleted, false) = false
  AND type IN ('raw_ingredient', 'good')
  AND name NOT ILIKE '[MERGED%'
  AND name NOT ILIKE '#%'
  AND (
       name ILIKE '%frozen%strawberr%' OR name ILIKE '%frozen%mango%'
    OR name ILIKE '%frozen%peach%'      OR name ILIKE '%frozen%apricot%'
    OR name ILIKE '%frozen%blueberr%'   OR name ILIKE '%frozen%kiwi%'
    OR name ILIKE '%frozen%spinach%'    OR name ILIKE '%frozen%avocado%'
    OR name ILIKE '%frozen%passion%'    OR name ILIKE '%frozen%pomegranate%'
    OR name ILIKE '%oat milk%'          OR name ILIKE '%almond milk%'
    OR name ILIKE '%coconut milk%'      OR name ILIKE '%soy milk%'
    OR name ILIKE '%chia%'              OR name ILIKE '%matcha%'
    OR name ILIKE '%cashew%'            OR name ILIKE '%whey%'
    OR name ILIKE '%almond sliced%'     OR name ILIKE '%almond powder%'
    OR name ILIKE '%espresso%'          OR name ILIKE '%coffee bean%'
    OR name ILIKE '%cocoa%'             OR name ILIKE '%cacao%'
    OR name ILIKE '%yogurt%'            OR name ILIKE '%yoghurt%'
    OR name ILIKE '%honey%'             OR name ILIKE '%raisin%'
  );

-- ───────────────────────────────────────────────────────────────────────────
-- 3. v_stock_sheet_items — cost-free, curated, category-joined view for anon.
-- ───────────────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.v_stock_sheet_items;
-- security_invoker: the view respects the caller's RLS instead of the owner's,
-- so anon only ever sees rows its own policies allow (no privilege escalation).
-- Safe here because nomenclature/product_categories both have permissive
-- public-read policies (USING true).
CREATE VIEW public.v_stock_sheet_items
  WITH (security_invoker = true)
AS
  SELECT
    n.id,
    COALESCE(NULLIF(n.customer_short_name, ''), n.name) AS name,
    n.emoji,
    n.base_unit,
    n.storage_location,
    n.category_id,
    pc.code     AS category_code,
    COALESCE(pc.name, 'Other')      AS category_name,
    COALESCE(pc.name_th, 'อื่น ๆ')   AS category_name_th,
    COALESCE(pc.sort_order, 9999)   AS category_sort
  FROM public.nomenclature n
  LEFT JOIN public.product_categories pc ON pc.id = n.category_id
  WHERE n.in_stock_sheet = true
    AND COALESCE(n.is_deleted, false) = false;

COMMENT ON VIEW public.v_stock_sheet_items IS
  'Curated, cost-free item list for the public staff stock-order sheet (/stock). No price/cost columns.';

GRANT SELECT ON public.v_stock_sheet_items TO anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. stock_requests + stock_request_lines — submissions.
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.stock_requests (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  note         TEXT,
  status       TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'converted', 'archived')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.stock_requests IS
  'One staff submission of the stock-order sheet. status: open → converted (turned into a PO) / archived.';

CREATE TABLE IF NOT EXISTS public.stock_request_lines (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id      UUID NOT NULL REFERENCES public.stock_requests(id) ON DELETE CASCADE,
  nomenclature_id UUID NOT NULL REFERENCES public.nomenclature(id),
  in_stock        BOOLEAN NOT NULL DEFAULT true,
  order_qty       NUMERIC,
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_request_lines_request
  ON public.stock_request_lines(request_id);

COMMENT ON TABLE public.stock_request_lines IS
  'Per-item marks within a stock_requests submission: in_stock flag + requested order_qty.';

ALTER TABLE public.stock_requests      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_request_lines ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.stock_requests      FROM anon;
REVOKE ALL ON public.stock_request_lines FROM anon;

DROP POLICY IF EXISTS stock_requests_auth_all ON public.stock_requests;
CREATE POLICY stock_requests_auth_all ON public.stock_requests
  FOR ALL TO authenticated
  USING (public.fn_is_authenticated())
  WITH CHECK (public.fn_is_authenticated());

DROP POLICY IF EXISTS stock_request_lines_auth_all ON public.stock_request_lines;
CREATE POLICY stock_request_lines_auth_all ON public.stock_request_lines
  FOR ALL TO authenticated
  USING (public.fn_is_authenticated())
  WITH CHECK (public.fn_is_authenticated());

-- ───────────────────────────────────────────────────────────────────────────
-- 5. fn_submit_stock_sheet — passcode-gated submission (anon-callable).
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_submit_stock_sheet(
  p_passcode TEXT,
  p_note     TEXT,
  p_lines    JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expected   TEXT;
  v_request_id UUID;
  v_line       JSONB;
  v_count      INT := 0;
BEGIN
  SELECT value INTO v_expected FROM public.app_config WHERE key = 'stock_sheet_passcode';

  IF v_expected IS NULL OR p_passcode IS DISTINCT FROM v_expected THEN
    RETURN jsonb_build_object('ok', false, 'error', 'bad_passcode');
  END IF;

  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_lines');
  END IF;

  INSERT INTO public.stock_requests (note) VALUES (NULLIF(p_note, ''))
  RETURNING id INTO v_request_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    -- Only persist lines that carry a signal: out of stock, or an order qty.
    IF COALESCE((v_line->>'in_stock')::BOOLEAN, true) = false
       OR COALESCE((v_line->>'order_qty')::NUMERIC, 0) > 0
    THEN
      INSERT INTO public.stock_request_lines (request_id, nomenclature_id, in_stock, order_qty, note)
      VALUES (
        v_request_id,
        (v_line->>'nomenclature_id')::UUID,
        COALESCE((v_line->>'in_stock')::BOOLEAN, true),
        NULLIF(v_line->>'order_qty', '')::NUMERIC,
        NULLIF(v_line->>'note', '')
      );
      v_count := v_count + 1;
    END IF;
  END LOOP;

  IF v_count = 0 THEN
    -- Nothing actionable was marked; drop the empty request.
    DELETE FROM public.stock_requests WHERE id = v_request_id;
    RETURN jsonb_build_object('ok', false, 'error', 'nothing_marked');
  END IF;

  RETURN jsonb_build_object('ok', true, 'request_id', v_request_id, 'line_count', v_count);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_submit_stock_sheet(TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_submit_stock_sheet(TEXT, TEXT, JSONB) TO anon, authenticated;

COMMENT ON FUNCTION public.fn_submit_stock_sheet IS
  'Public (anon) staff stock-sheet submission. Validates shared passcode against app_config, inserts stock_requests + lines. Returns {ok, request_id, line_count} or {ok:false, error}.';

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '245_stock_order_sheet.sql',
  'claude-code',
  'Staff stock-order sheet: app_config + passcode, nomenclature.in_stock_sheet/storage_location, v_stock_sheet_items view, stock_requests + lines, fn_submit_stock_sheet RPC.'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
