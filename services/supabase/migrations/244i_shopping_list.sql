-- 245: Shopping list — lightweight procurement checklist across stores
-- A flat, manually-curated list of "what to buy" (mostly Makro + other stores),
-- one row per product, with a store, product link, price and bought/needed status.
-- Seedable from the active menu's RAW ingredients via fn_seed_shopping_list_from_menu.

-- ─── Table ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.shopping_list_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  store           TEXT NOT NULL DEFAULT 'makro',   -- makro / homepro / sangdamrong / lazada / tops / other
  product_url     TEXT,
  image_url       TEXT,
  qty             NUMERIC DEFAULT 1,
  unit            TEXT,
  est_price       NUMERIC,                          -- estimated line price (THB)
  notes           TEXT,
  status          TEXT NOT NULL DEFAULT 'needed'
                    CHECK (status IN ('needed', 'bought', 'cancelled')),
  sort_order      INT DEFAULT 0,
  nomenclature_id UUID REFERENCES public.nomenclature(id) ON DELETE SET NULL,
  source          TEXT DEFAULT 'manual',            -- manual / menu_seed
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  bought_at       TIMESTAMPTZ
);

COMMENT ON TABLE public.shopping_list_items IS 'Procurement checklist: what to buy, per store, with product links (MC procurement)';

CREATE INDEX IF NOT EXISTS idx_sli_status ON public.shopping_list_items (status);
CREATE INDEX IF NOT EXISTS idx_sli_store  ON public.shopping_list_items (store);
CREATE INDEX IF NOT EXISTS idx_sli_nom    ON public.shopping_list_items (nomenclature_id);

-- ─── RLS (authenticated full access — same pattern as scheduling/stock tables) ───
-- NOTE: deliberately NOT using staff.role='owner' — that role check silently
-- breaks UI writes under the anon/authenticated session (the salad-bar RLS bug).
ALTER TABLE public.shopping_list_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY shopping_list_items_auth_full
  ON public.shopping_list_items FOR ALL TO public
  USING (fn_is_authenticated())
  WITH CHECK (fn_is_authenticated());

-- ─── updated_at trigger ──────────────────────────────────
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.shopping_list_items
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_set_updated_at();

-- ─── Seed RPC: pull RAW ingredients of the active menu into the list ───
-- Walks the BOM tree of every active SALE dish down to RAW-% leaves, joins the
-- store's supplier_catalog for name/price/link, and inserts one row per RAW
-- ingredient not already on the list with status='needed'. Idempotent (dedupe).
CREATE OR REPLACE FUNCTION public.fn_seed_shopping_list_from_menu(p_store TEXT DEFAULT 'makro')
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_inserted INT;
BEGIN
  WITH RECURSIVE bom_tree AS (
    -- roots: direct components of active SALE dishes
    SELECT bs.parent_id, bs.ingredient_id
    FROM bom_structures bs
    JOIN nomenclature root ON root.id = bs.parent_id
    WHERE root.product_code LIKE 'SALE-%'
      AND root.is_available = true
    UNION
    -- descend through PF/MOD sub-assemblies
    SELECT bs.parent_id, bs.ingredient_id
    FROM bom_structures bs
    JOIN bom_tree t ON t.ingredient_id = bs.parent_id
  ),
  raw_leaves AS (
    SELECT DISTINCT bt.ingredient_id AS nid
    FROM bom_tree bt
    JOIN nomenclature n ON n.id = bt.ingredient_id
    WHERE n.product_code LIKE 'RAW-%'
  ),
  cat AS (
    -- one catalog row per ingredient for this store (prefer priced rows)
    SELECT DISTINCT ON (sc.nomenclature_id)
      sc.nomenclature_id, sc.product_name, sc.barcode,
      sc.last_seen_price, sc.external_url, sc.image_url
    FROM supplier_catalog sc
    JOIN suppliers s ON s.id = sc.supplier_id
    WHERE s.name ILIKE p_store
      AND sc.nomenclature_id IS NOT NULL
    ORDER BY sc.nomenclature_id, sc.last_seen_price DESC NULLS LAST
  )
  INSERT INTO public.shopping_list_items
    (name, store, product_url, image_url, qty, unit, est_price, status, nomenclature_id, source)
  SELECT
    COALESCE(c.product_name, n.name),
    p_store,
    CASE
      WHEN c.external_url IS NOT NULL THEN c.external_url
      WHEN lower(p_store) = 'makro' AND c.barcode IS NOT NULL
        THEN 'https://www.makro.pro/search?q=' || c.barcode
      WHEN lower(p_store) = 'makro'
        THEN 'https://www.makro.pro/search?q=' || replace(COALESCE(c.product_name, n.name), ' ', '%20')
      ELSE NULL
    END,
    c.image_url,
    1,
    n.base_unit,
    c.last_seen_price,
    'needed',
    n.id,
    'menu_seed'
  FROM raw_leaves rl
  JOIN nomenclature n ON n.id = rl.nid
  LEFT JOIN cat c ON c.nomenclature_id = n.id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.shopping_list_items sli
    WHERE sli.nomenclature_id = n.id
      AND sli.status = 'needed'
  );

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'inserted', v_inserted);
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_seed_shopping_list_from_menu(TEXT) TO authenticated, anon;

-- ─── Self-register ───────────────────────────────────────
INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '244i_shopping_list.sql',
  'claude-code',
  NULL,
  'shopping_list_items table + fn_seed_shopping_list_from_menu (procurement checklist)'
)
ON CONFLICT DO NOTHING;
