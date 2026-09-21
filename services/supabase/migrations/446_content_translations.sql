-- 446_content_translations.sql
-- One home for every guest-facing translation on shishka.health (MC f91194f7).
--
-- WHY
--   The public site is English-only. Russian ships first, Thai and Arabic follow. The only
--   translations in the DB today are nomenclature.customer_description_ru/_th (mig 425, for
--   the printed A4 menu) — one field of one entity, as extra columns. Menu names, categories,
--   tags, modifier options, bundle labels and site copy have nowhere to live, and adding
--   _ru/_th/_ar columns to six tables does not scale to four languages.
--
-- WHAT
--   1. content_translations — one row per (entity, entity_key, field, lang). English is the
--      canonical source and is NEVER stored here; it stays on the source row.
--      source_hash = md5 of the English text the translation was made from. When the English
--      changes, the hash stops matching and the translation is STALE: the public view drops it
--      and the site falls back to English. That matters for safety, not only style — a stale
--      translation can carry an allergen claim the English already corrected (mig 443).
--   2. fn_translation_source(entity, key, field) — the current English text for a key.
--   3. menu_translations (anon) — fresh, public translations only. security_invoker=false on
--      purpose: it reads nomenclature, which anon cannot SELECT (see mig 352 note).
--   4. v_translation_worklist (authenticated) — every translatable public string x language
--      with status missing | stale | fresh | reviewed. The offline translation job and the
--      phase-2 admin editor both work off this list.
--   5. Two-way mirror with nomenclature.customer_description_ru/_th. The A4 menu generator
--      reads those columns and other sessions still write them (migs 432, 440-442). Writes on
--      either side land on the other, so neither the print menu nor a parallel migration is
--      silently lost. pg_trigger_depth() stops the ping-pong. Retire the columns once the A4
--      generator reads menu_translations.
--   6. Backfill the existing RU/TH descriptions (52 live dishes).
--
-- entity_key conventions
--   dish            nomenclature.id::text        fields: name, description, ingredients
--   category        product_categories.id::text  field:  name   (sections are categories too)
--   tag             tags.slug                    field:  name
--   modifier_group  the English group_name       field:  name   (menu_modifiers has no stable id)
--   modifier_option the English option_name      field:  name
--   price_tier      price_tiers.tier_code        field:  label
--   site_content    site_content.key             field:  data   (value = partial jsonb, merged over EN)
-- value is jsonb: a JSON string for text fields, an object for site_content.data.

-- CONTRACT-REVIEWED: additive only. Reads menu_public / menu_modifiers / nomenclature_tags / price_tiers /
--   site_content and the customer_* columns but alters none of them; menu_public is not redefined.
--   The one write path onto nomenclature is the RU/TH description mirror, which never touches EN
--   text, price or visibility. contract-check.mjs green before apply (2026-09-21).

BEGIN;

-- 1. Table ------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.content_translations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity       text NOT NULL CHECK (entity IN
                 ('dish','category','tag','modifier_group','modifier_option','price_tier','site_content')),
  entity_key   text NOT NULL,
  field        text NOT NULL,
  lang         text NOT NULL CHECK (lang ~ '^[a-z]{2}$' AND lang <> 'en'),
  value        jsonb NOT NULL,
  source_hash  text,
  reviewed_at  timestamptz,
  reviewed_by  text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT content_translations_uniq UNIQUE (entity, entity_key, field, lang),
  CONSTRAINT content_translations_value_shape CHECK (
    (entity = 'site_content' AND jsonb_typeof(value) = 'object')
    OR (entity <> 'site_content' AND jsonb_typeof(value) = 'string')
  )
);

COMMENT ON TABLE public.content_translations IS
  'Guest-facing translations (non-English). EN stays on the source row. source_hash = md5 of the EN text at translation time; mismatch = stale. MC f91194f7, mig 446.';

DROP TRIGGER IF EXISTS trg_content_translations_updated_at ON public.content_translations;
CREATE TRIGGER trg_content_translations_updated_at
  BEFORE UPDATE ON public.content_translations
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

ALTER TABLE public.content_translations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS content_translations_read ON public.content_translations;
CREATE POLICY content_translations_read ON public.content_translations
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS content_translations_owner_write ON public.content_translations;
CREATE POLICY content_translations_owner_write ON public.content_translations
  FOR ALL TO authenticated USING (public.fn_is_owner()) WITH CHECK (public.fn_is_owner());

REVOKE ALL ON public.content_translations FROM anon;

-- 2. Current English source for a key --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_translation_source(p_entity text, p_key text, p_field text)
RETURNS text
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT CASE p_entity
    WHEN 'dish' THEN (
      SELECT CASE p_field
               WHEN 'name'        THEN COALESCE(n.customer_short_name, n.name)
               WHEN 'description' THEN n.customer_description
               WHEN 'ingredients' THEN n.customer_ingredients
             END
      FROM nomenclature n WHERE n.id::text = p_key)
    WHEN 'category' THEN
      (SELECT c.name FROM product_categories c WHERE c.id::text = p_key AND p_field = 'name')
    WHEN 'tag' THEN
      (SELECT t.name FROM tags t WHERE t.slug = p_key AND p_field = 'name')
    WHEN 'modifier_group'  THEN CASE WHEN p_field = 'name' THEN p_key END
    WHEN 'modifier_option' THEN CASE WHEN p_field = 'name' THEN p_key END
    WHEN 'price_tier' THEN
      (SELECT pt.label FROM price_tiers pt WHERE pt.tier_code = p_key AND p_field = 'label')
    WHEN 'site_content' THEN
      (SELECT sc.data::text FROM site_content sc WHERE sc.key = p_key AND p_field = 'data')
  END
$$;

COMMENT ON FUNCTION public.fn_translation_source(text, text, text) IS
  'Current English text behind a content_translations key; NULL = the source is gone (orphan). mig 446.';

-- 3. Public view: fresh translations of public content only ----------------------------------
CREATE OR REPLACE VIEW public.menu_translations
WITH (security_invoker = false) AS
SELECT t.entity, t.entity_key, t.field, t.lang, t.value, (t.reviewed_at IS NOT NULL) AS is_reviewed
FROM content_translations t
CROSS JOIN LATERAL (SELECT public.fn_translation_source(t.entity, t.entity_key, t.field) AS src) s
WHERE s.src IS NOT NULL
  AND t.source_hash = md5(s.src)
  AND (t.entity <> 'dish' OR EXISTS (SELECT 1 FROM menu_public m WHERE m.id::text = t.entity_key));

COMMENT ON VIEW public.menu_translations IS
  'Anon-facing: fresh (source_hash matches current EN) translations of public content. Stale rows are hidden so the site falls back to EN. security_invoker=false on purpose. mig 446.';

REVOKE ALL ON public.menu_translations FROM anon, authenticated;
GRANT SELECT ON public.menu_translations TO anon, authenticated;

-- 4. Worklist: every public string x language, with status ------------------------------------
CREATE OR REPLACE VIEW public.v_translation_worklist
WITH (security_invoker = true) AS
WITH src AS (
  SELECT 'dish'::text AS entity, m.id::text AS entity_key, f.field, f.src AS source_text
  FROM menu_public m
  CROSS JOIN LATERAL (VALUES
    ('name',        COALESCE(m.customer_short_name, m.name)),
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
         WHEN t.id IS NULL                             THEN 'missing'
         WHEN t.source_hash IS DISTINCT FROM md5(s.source_text) THEN 'stale'
         WHEN t.reviewed_at IS NULL                    THEN 'fresh'
         ELSE 'reviewed'
       END AS status,
       t.updated_at AS translated_at
FROM src s
CROSS JOIN langs l
LEFT JOIN content_translations t
  ON t.entity = s.entity AND t.entity_key = s.entity_key AND t.field = s.field AND t.lang = l.lang;

COMMENT ON VIEW public.v_translation_worklist IS
  'Every public guest-facing string x (ru, th, ar) with status missing|stale|fresh|reviewed. Drives offline translation + the phase-2 admin editor. mig 446.';

REVOKE ALL ON public.v_translation_worklist FROM anon;
GRANT SELECT ON public.v_translation_worklist TO authenticated;

-- 5. Two-way mirror with nomenclature.customer_description_ru/_th ------------------------------
-- 5a. content_translations -> nomenclature columns
CREATE OR REPLACE FUNCTION public.fn_mirror_translation_to_nomenclature()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.content_translations;
  v text;
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NULL; END IF;
  IF TG_OP = 'DELETE' THEN
    r := OLD;
  ELSE
    r := NEW;
    v := NEW.value #>> '{}';
  END IF;
  IF r.entity <> 'dish' OR r.field <> 'description' OR r.lang NOT IN ('ru','th') THEN
    RETURN NULL;
  END IF;
  IF r.lang = 'ru' THEN
    UPDATE nomenclature SET customer_description_ru = v
    WHERE id::text = r.entity_key AND customer_description_ru IS DISTINCT FROM v;
  ELSE
    UPDATE nomenclature SET customer_description_th = v
    WHERE id::text = r.entity_key AND customer_description_th IS DISTINCT FROM v;
  END IF;
  RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS trg_mirror_translation_to_nomenclature ON public.content_translations;
CREATE TRIGGER trg_mirror_translation_to_nomenclature
  AFTER INSERT OR UPDATE OR DELETE ON public.content_translations
  FOR EACH ROW EXECUTE FUNCTION public.fn_mirror_translation_to_nomenclature();

-- 5b. nomenclature columns -> content_translations
CREATE OR REPLACE FUNCTION public.fn_mirror_nomenclature_description_translations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  l text;
  v text;
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NULL; END IF;
  FOREACH l IN ARRAY ARRAY['ru','th'] LOOP
    v := CASE l WHEN 'ru' THEN NEW.customer_description_ru ELSE NEW.customer_description_th END;
    IF TG_OP = 'UPDATE' AND v IS NOT DISTINCT FROM
       (CASE l WHEN 'ru' THEN OLD.customer_description_ru ELSE OLD.customer_description_th END) THEN
      CONTINUE;
    END IF;
    IF v IS NULL THEN
      DELETE FROM content_translations
      WHERE entity = 'dish' AND entity_key = NEW.id::text AND field = 'description' AND lang = l;
    ELSE
      -- Written alongside the EN (the usual migration pattern), so it matches today's EN.
      INSERT INTO content_translations (entity, entity_key, field, lang, value, source_hash)
      VALUES ('dish', NEW.id::text, 'description', l, to_jsonb(v), md5(NEW.customer_description))
      ON CONFLICT (entity, entity_key, field, lang) DO UPDATE
        SET value = EXCLUDED.value, source_hash = EXCLUDED.source_hash,
            reviewed_at = NULL, reviewed_by = NULL;
    END IF;
  END LOOP;
  RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS trg_mirror_nomenclature_description_translations ON public.nomenclature;
CREATE TRIGGER trg_mirror_nomenclature_description_translations
  AFTER INSERT OR UPDATE OF customer_description_ru, customer_description_th ON public.nomenclature
  FOR EACH ROW EXECUTE FUNCTION public.fn_mirror_nomenclature_description_translations();

-- 6. Backfill existing RU/TH descriptions --------------------------------------------------------
-- Hashed against today's EN: mig 442 (2026-09-09) is the last edit to both sides. The offline
-- RU pass re-reads every one of these against the EN before it is marked reviewed.
INSERT INTO public.content_translations
  (entity, entity_key, field, lang, value, source_hash, reviewed_at, reviewed_by)
SELECT 'dish', n.id::text, 'description', x.lang, to_jsonb(x.txt), md5(n.customer_description),
       n.translation_reviewed_at, n.translation_reviewed_by
FROM nomenclature n
CROSS JOIN LATERAL (VALUES ('ru', n.customer_description_ru), ('th', n.customer_description_th)) x(lang, txt)
WHERE x.txt IS NOT NULL AND n.customer_description IS NOT NULL
ON CONFLICT (entity, entity_key, field, lang) DO NOTHING;

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '446_content_translations.sql',
  'claude-opus-session-6699d2ee',
  NULL,
  'content_translations + menu_translations (anon, fresh only) + v_translation_worklist + two-way mirror with nomenclature.customer_description_ru/_th + backfill (MC f91194f7)'
)
ON CONFLICT DO NOTHING;

COMMIT;
