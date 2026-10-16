-- 478_ru_new_allergen_tags_and_worklist_drops_dish_names.sql
-- Two new allergen tags in Russian, and the worklist stops asking for dish names (MC f91194f7).
-- Dish names are never translated (mig 473a), so listing 85 of them as "missing" in every language
-- trains the next reader to ignore the view. It now covers only what is actually translated.
--
-- APPLIED to prod 2026-10-16 as `471_ru_new_allergen_tags_and_worklist_drops_dish_names.sql`;
-- renumbered here because a parallel session took 471. migration_log is corrected in mig 479.
--
-- CONTRACT-REVIEWED: data insert + redefinition of v_translation_worklist (authenticated only,
-- not part of the public menu contract).

BEGIN;

WITH tg(slug, txt) AS (VALUES ('allergen-mustard', 'Содержит горчицу'), ('allergen-soy', 'Содержит сою'))
INSERT INTO public.content_translations (entity, entity_key, field, lang, value, source_hash)
SELECT 'tag', tg.slug, 'name', 'ru', to_jsonb(tg.txt),
       md5(public.fn_translation_source('tag', tg.slug, 'name'))
FROM tg
WHERE public.fn_translation_source('tag', tg.slug, 'name') IS NOT NULL
ON CONFLICT (entity, entity_key, field, lang) DO UPDATE
  SET value = EXCLUDED.value, source_hash = EXCLUDED.source_hash, reviewed_at = NULL, reviewed_by = NULL;

CREATE OR REPLACE VIEW public.v_translation_worklist
WITH (security_invoker = true) AS
WITH src AS (
  -- Dish NAMES are deliberately absent: they stay English in every language (mig 473a).
  SELECT 'dish'::text AS entity, m.id::text AS entity_key, f.field, f.src AS source_text
  FROM menu_public m
  CROSS JOIN LATERAL (VALUES
    ('description', m.customer_description),
    ('ingredients', m.customer_ingredients)) AS f(field, src)
  WHERE f.src IS NOT NULL
  UNION
  SELECT 'category', c.id::text, 'name', c.name
  FROM product_categories c
  WHERE c.id IN (SELECT category_id FROM menu_public UNION SELECT section_id FROM menu_public)
  UNION
  SELECT DISTINCT 'tag', tg.slug, 'name', tg.name
  FROM nomenclature_tags nt JOIN tags tg ON tg.id = nt.tag_id
  WHERE nt.nomenclature_id IN (SELECT id FROM menu_public)
  UNION
  SELECT DISTINCT 'modifier_group', mm.group_name, 'name', mm.group_name
  FROM menu_modifiers mm WHERE mm.group_name IS NOT NULL
  UNION
  SELECT DISTINCT 'modifier_option', mm.option_name, 'name', mm.option_name
  FROM menu_modifiers mm WHERE mm.option_name IS NOT NULL
  UNION
  SELECT 'price_tier', pt.tier_code, 'label', pt.label
  FROM price_tiers pt WHERE pt.bundle_dish_code IS NOT NULL AND pt.is_active AND pt.label IS NOT NULL
  UNION
  SELECT 'site_content', sc.key, 'data', sc.data::text FROM site_content sc
),
langs(lang) AS (VALUES ('ru'), ('th'), ('ar'))
SELECT s.entity, s.entity_key, s.field, l.lang, s.source_text,
       t.value AS translation,
       CASE
         WHEN t.id IS NULL                                      THEN 'missing'
         WHEN t.source_hash IS DISTINCT FROM md5(s.source_text) THEN 'stale'
         WHEN t.reviewed_at IS NULL                             THEN 'fresh'
         ELSE 'reviewed'
       END AS status,
       t.updated_at AS translated_at
FROM src s
CROSS JOIN langs l
LEFT JOIN content_translations t
  ON t.entity = s.entity AND t.entity_key = s.entity_key AND t.field = s.field AND t.lang = l.lang;

COMMENT ON VIEW public.v_translation_worklist IS
  'Every public guest-facing string that IS translated x (ru, th, ar), with status missing|stale|fresh|reviewed. Dish names are excluded: they stay English in every language (mig 473a). migs 446, 478.';

REVOKE ALL ON public.v_translation_worklist FROM anon;
GRANT SELECT ON public.v_translation_worklist TO authenticated;

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES ('478_ru_new_allergen_tags_and_worklist_drops_dish_names.sql', 'claude-opus-session-20399950', NULL,
  'RU mustard/soy allergen tags + worklist no longer lists dish names (never translated) (MC f91194f7)')
ON CONFLICT DO NOTHING;

COMMIT;
