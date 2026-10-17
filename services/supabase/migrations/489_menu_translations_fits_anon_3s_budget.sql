-- 489_menu_translations_fits_anon_3s_budget.sql
-- menu_translations times out for the guest. Make the dish-visibility check local (MC 40971685).
--
-- SYMPTOM: the Arabic preview rendered the page chrome and zero dishes. The browser console showed
--   menu_translations unavailable, showing English: {code: 57014, canceling statement due to statement timeout}
-- and then the whole menu fetch aborting. The `anon` role carries statement_timeout = 3s, so a slow
-- read here does not degrade — it returns nothing.
--
-- CAUSE: the view asked `EXISTS (SELECT 1 FROM menu_public m WHERE m.id::text = t.entity_key)`.
-- menu_public is itself a 3-join view whose select list carries a correlated aggregate over
-- price_tiers (bundle_min_price). The guest never reads that column, but the PLANNER still expands
-- and costs the whole thing, and that dominated the query:
--
--            planning   execution   buffers
--   before     735 ms     123 ms      385     (and 1254 ms / 1450 ms on a cold catalog cache)
--   after       82 ms     111 ms      142
--
-- Planning, not execution, was eating the 3s budget — which is why it looked like an outage
-- aftershock rather than a query problem, and why it worsened as languages were added.
--
-- FIX: nomenclature is ALREADY left-joined as `n` for the dish source text, so the visibility test
-- can read that row directly instead of re-deriving it through menu_public. The predicates below are
-- menu_public's WHERE clause verbatim; its two LEFT JOINs to product_categories cannot remove rows,
-- so `EXISTS (menu_public)` and this test accept exactly the same dishes.
--
-- VERIFIED equal before applying, as full set comparison in both directions across all 4 languages:
--   menu_translations EXCEPT candidate -> 0 rows
--   candidate EXCEPT menu_translations -> 0 rows   (691 rows each side)
--
-- UNCHANGED: security_invoker = false is load-bearing — anon's RLS on nomenclature gates on
-- pos_status = 'synced' while publishing gates on is_web_visible, so an invoker-rights read here
-- silently drops rows (see [[gotcha_invoker_fn_inside_definer_view]], mig 464). The staleness rule is
-- also untouched: a row is withheld while source_hash <> md5(current English), so edited English copy
-- falls back to English rather than showing a stale translation.
--
-- NUMBER: claimed via fn_claim_migration_number() (mig 483), not by eyeballing the tree — 488 was
-- taken by another session between writing this and applying it.
--
-- CONTRACT-REVIEWED: menu_translations is in contracts/menu-contract.json. Column list, column
-- types, row set and grants are all unchanged; only the plan is cheaper.

BEGIN;

CREATE OR REPLACE VIEW public.menu_translations
WITH (security_invoker = false) AS
SELECT t.entity, t.entity_key, t.field, t.lang, t.value,
       (t.reviewed_at IS NOT NULL) AS is_reviewed
FROM public.content_translations t
  LEFT JOIN public.nomenclature n        ON t.entity = 'dish'         AND n.id::text      = t.entity_key
  LEFT JOIN public.product_categories pc ON t.entity = 'category'     AND pc.id::text     = t.entity_key
  LEFT JOIN public.tags tg               ON t.entity = 'tag'          AND tg.slug         = t.entity_key
  LEFT JOIN public.price_tiers pt        ON t.entity = 'price_tier'   AND pt.tier_code    = t.entity_key
  LEFT JOIN public.site_content sc       ON t.entity = 'site_content' AND sc.key          = t.entity_key
  CROSS JOIN LATERAL (
    SELECT CASE t.entity
      WHEN 'dish' THEN CASE t.field
          WHEN 'name'        THEN COALESCE(n.customer_short_name, n.name)
          WHEN 'description' THEN n.customer_description
          WHEN 'ingredients' THEN n.customer_ingredients
          ELSE NULL END
      WHEN 'category'        THEN CASE WHEN t.field = 'name'  THEN pc.name        ELSE NULL END
      WHEN 'tag'             THEN CASE WHEN t.field = 'name'  THEN tg.name        ELSE NULL END
      WHEN 'modifier_group'  THEN CASE WHEN t.field = 'name'  THEN t.entity_key   ELSE NULL END
      WHEN 'modifier_option' THEN CASE WHEN t.field = 'name'  THEN t.entity_key   ELSE NULL END
      WHEN 'price_tier'      THEN CASE WHEN t.field = 'label' THEN pt.label       ELSE NULL END
      WHEN 'site_content'    THEN CASE WHEN t.field = 'data'  THEN sc.data::text  ELSE NULL END
      ELSE NULL END AS src) s
WHERE s.src IS NOT NULL
  -- Staleness gate: withhold a translation whose English source has since been edited.
  AND t.source_hash = md5(s.src)
  -- Dish rows must still be on the public menu. menu_public's WHERE clause, read off `n` directly.
  AND (t.entity <> 'dish'
       OR (n.product_code LIKE 'SALE-%'
           AND n.is_web_visible = true
           AND COALESCE(n.is_deleted, false) = false
           AND (n.name IS NULL OR n.name NOT ILIKE '[ARCHIVED]%')));

COMMENT ON VIEW public.menu_translations IS
  'Anon-readable translations for the public menu: only rows whose source_hash still matches the current English, and for dishes only those live on menu_public. Dish names are never translated (mig 473a). Definer rights are deliberate (mig 464). The dish-visibility test is inlined rather than an EXISTS over menu_public, which cost ~700ms of planning and blew anon''s 3s statement_timeout (mig 489). migs 446, 464, 489.';

GRANT SELECT ON public.menu_translations TO anon, authenticated;

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES ('489_menu_translations_fits_anon_3s_budget.sql', 'claude-opus-session-6699d2ee', NULL,
  'menu_translations: inline the dish-visibility test instead of EXISTS over menu_public. Planning 735ms -> 82ms; fixes anon 57014 statement timeout that showed 0 dishes on /ar. Row set verified identical (MC 40971685)')
ON CONFLICT DO NOTHING;

COMMIT;
