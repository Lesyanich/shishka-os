-- 258: bundle manakish pool = the KP-FIN-MAN subtree
-- Project: Menu Control — bundles
--
-- A parallel taxonomy change (mig 257 / PR #321) split the live manakish out of
-- the flat KP-FIN-MAN category into price-tier leaves Classic / Signature /
-- Premium (KP-FIN-MAN-CLA / -SIG / -PRE) under the KP-FIN-MAN umbrella. Our
-- bundle pricing keyed on the EXACT code 'KP-FIN-MAN', so v_dish_tier_prices went
-- empty. Match a tier's category by PREFIX so it covers the umbrella + its leaves.
--
-- (create-order, the site manakish-pool filter and bundles.ts get the same
--  prefix treatment in their respective commits.)

CREATE OR REPLACE VIEW public.v_dish_tier_prices AS
SELECT n.id AS dish_id, n.product_code, pt.tier_code, pt.discount_pct,
       round(n.price * (1 - pt.discount_pct / 100)) AS effective_price
FROM public.nomenclature n
JOIN public.product_categories c ON c.id = n.category_id
JOIN public.price_tiers pt
  ON (pt.category_code IS NULL OR c.code LIKE pt.category_code || '%')
WHERE n.is_available AND n.price IS NOT NULL AND pt.is_active
  AND (pt.valid_from IS NULL OR pt.valid_from <= CURRENT_DATE)
  AND (pt.valid_to   IS NULL OR pt.valid_to   >= CURRENT_DATE);

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES ('258a_bundle_pool_subtree.sql','claude-code',NULL,
  'v_dish_tier_prices matches manakish category by prefix (KP-FIN-MAN subtree) after taxonomy split')
ON CONFLICT DO NOTHING;
