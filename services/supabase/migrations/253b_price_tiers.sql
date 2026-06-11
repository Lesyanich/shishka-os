-- 255: channel/promo price tiers (bundles first; future: Grab, happy-hour, …)
-- Project: Menu Control — pricing
--
-- One product, many prices. The regular price stays on nomenclature.price; every
-- other context (bundle ×4/×8/×12, later Grab/delivery, timed promos) is a row
-- here. No product duplication: the website renders the right tier by context,
-- and the bundle discount GROWS with size (more you buy → bigger discount).
--
-- valid_from/valid_to are reserved for time-bounded promos (logic comes later) —
-- NULL means "always on".

CREATE TABLE IF NOT EXISTS public.price_tiers (
  tier_code     text PRIMARY KEY,                 -- 'bundle4' | 'bundle8' | 'bundle12' | future: 'grab' | …
  label         text NOT NULL,
  discount_pct  numeric NOT NULL CHECK (discount_pct >= 0 AND discount_pct < 100),
  category_code text,                              -- applies to this category's SALE dishes; NULL = all
  valid_from    date,                              -- NULL = no start (always)
  valid_to      date,                              -- NULL = no end
  is_active     boolean NOT NULL DEFAULT true,
  sort_order    integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Bundle tiers: discount escalates with size.
INSERT INTO public.price_tiers (tier_code, label, discount_pct, category_code, sort_order) VALUES
  ('bundle4',  'Bundle ×4',  10, 'KP-FIN-MAN', 1),
  ('bundle8',  'Bundle ×8',  15, 'KP-FIN-MAN', 2),
  ('bundle12', 'Bundle ×12', 20, 'KP-FIN-MAN', 3)
ON CONFLICT (tier_code) DO NOTHING;

-- Effective per-dish price for each currently-valid tier (anon-safe: no cost data).
CREATE OR REPLACE VIEW public.v_dish_tier_prices AS
SELECT
  n.id           AS dish_id,
  n.product_code,
  pt.tier_code,
  pt.discount_pct,
  round(n.price * (1 - pt.discount_pct / 100)) AS effective_price
FROM public.nomenclature n
JOIN public.product_categories c ON c.id = n.category_id
JOIN public.price_tiers pt
  ON (pt.category_code IS NULL OR pt.category_code = c.code)
WHERE n.is_available
  AND n.price IS NOT NULL
  AND pt.is_active
  AND (pt.valid_from IS NULL OR pt.valid_from <= CURRENT_DATE)
  AND (pt.valid_to   IS NULL OR pt.valid_to   >= CURRENT_DATE);

-- RLS: anyone may read the tiers (needed by the public site); only authenticated
-- staff may change them.
ALTER TABLE public.price_tiers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS price_tiers_read ON public.price_tiers;
CREATE POLICY price_tiers_read ON public.price_tiers FOR SELECT USING (true);
DROP POLICY IF EXISTS price_tiers_write ON public.price_tiers;
CREATE POLICY price_tiers_write ON public.price_tiers FOR ALL
  USING (public.fn_is_authenticated()) WITH CHECK (public.fn_is_authenticated());

GRANT SELECT ON public.price_tiers, public.v_dish_tier_prices TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.price_tiers TO authenticated;

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES ('253b_price_tiers.sql','claude-code',NULL,
  'Add price_tiers (bundle4/8/12 = 10/15/20%, date-ready) + v_dish_tier_prices')
ON CONFLICT DO NOTHING;
