-- 464_menu_translations_owner_rights_freshness.sql
-- BUG FIX (MC f91194f7): menu_translations silently dropped translations for some public dishes.
--
-- SYMPTOM: "Cheese & Mushroom" (SALE-MANAISH_CHEESE_MUSHROOM_GF) is on the public menu and has a
-- fresh Russian name, description and ingredient list, yet /ru rendered it in English. Reading the
-- view as postgres returned 351 rows; reading it through the anon key returned 348 — exactly that
-- dish's three rows were missing.
--
-- CAUSE: the view (mig 446) checked freshness with fn_translation_source(), a plain (invoker-rights)
-- function. A security_invoker=false view gives its OWN from-list the owner's privileges, but a
-- function called inside still reads with the CALLER's privileges — so for anon the function read
-- nomenclature under anon's RLS policy `nomenclature_anon_read`
-- (product_code LIKE 'SALE-%' AND pos_status='synced' AND is_available), which is NOT the rule that
-- decides what the site shows (menu_public gates on is_web_visible). A dish that is published on the
-- site but not yet synced to the till returned NULL as its "English source", the row failed the
-- `src IS NOT NULL` test, and the guest quietly got English. It failed open, so nothing wrong was
-- ever shown — but every such dish stayed untranslated for no visible reason.
--
-- FIX: resolve the English source inside the view with ordinary LEFT JOINs, so the whole freshness
-- check runs with the view owner's privileges, exactly like the row filter next to it. Behaviour is
-- otherwise identical: stale rows (source_hash ≠ md5 of today's English) are still withheld, and
-- dish rows are still limited to dishes in menu_public.
--
-- fn_translation_source() stays: v_translation_worklist and the translation migrations call it as
-- authenticated/postgres, where invoker rights are the right thing.
--
-- CONTRACT-REVIEWED: redefines menu_translations only; same columns, same anon grant, same
-- security_invoker=false. No other contract object is touched.

BEGIN;

CREATE OR REPLACE VIEW public.menu_translations
WITH (security_invoker = false) AS
SELECT t.entity, t.entity_key, t.field, t.lang, t.value,
       (t.reviewed_at IS NOT NULL) AS is_reviewed
FROM content_translations t
LEFT JOIN nomenclature n        ON t.entity = 'dish'         AND n.id::text    = t.entity_key
LEFT JOIN product_categories pc ON t.entity = 'category'     AND pc.id::text   = t.entity_key
LEFT JOIN tags tg               ON t.entity = 'tag'          AND tg.slug       = t.entity_key
LEFT JOIN price_tiers pt        ON t.entity = 'price_tier'   AND pt.tier_code  = t.entity_key
LEFT JOIN site_content sc       ON t.entity = 'site_content' AND sc.key        = t.entity_key
CROSS JOIN LATERAL (
  SELECT CASE t.entity
    WHEN 'dish' THEN CASE t.field
                       WHEN 'name'        THEN COALESCE(n.customer_short_name, n.name)
                       WHEN 'description' THEN n.customer_description
                       WHEN 'ingredients' THEN n.customer_ingredients
                     END
    WHEN 'category'        THEN CASE WHEN t.field = 'name'  THEN pc.name END
    WHEN 'tag'             THEN CASE WHEN t.field = 'name'  THEN tg.name END
    WHEN 'modifier_group'  THEN CASE WHEN t.field = 'name'  THEN t.entity_key END
    WHEN 'modifier_option' THEN CASE WHEN t.field = 'name'  THEN t.entity_key END
    WHEN 'price_tier'      THEN CASE WHEN t.field = 'label' THEN pt.label END
    WHEN 'site_content'    THEN CASE WHEN t.field = 'data'  THEN sc.data::text END
  END AS src
) s
WHERE s.src IS NOT NULL
  AND t.source_hash = md5(s.src)
  AND (t.entity <> 'dish' OR EXISTS (SELECT 1 FROM menu_public m WHERE m.id::text = t.entity_key));

COMMENT ON VIEW public.menu_translations IS
  'Anon-facing: fresh (source_hash matches current EN) translations of public content. Stale rows are hidden so the site falls back to EN. security_invoker=false, and the freshness check is resolved by joins rather than fn_translation_source() so it runs with OWNER rights for every caller (mig 464). migs 446, 464.';

REVOKE ALL ON public.menu_translations FROM anon, authenticated;
GRANT SELECT ON public.menu_translations TO anon, authenticated;

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES ('464_menu_translations_owner_rights_freshness.sql', 'claude-opus-session-20399950', NULL,
  'menu_translations: resolve EN source by joins (owner rights) instead of the invoker-rights fn — anon RLS on nomenclature was hiding translations of web-visible but unsynced dishes (MC f91194f7)')
ON CONFLICT DO NOTHING;

COMMIT;
