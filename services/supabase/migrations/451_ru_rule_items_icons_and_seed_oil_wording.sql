-- 451_ru_rule_items_icons_and_seed_oil_wording.sql
-- Fix the RU "the rule" block from mig 447 (MC f91194f7):
--   1. "seed oils" was rendered «растительных масел из семян». After the site's «без» that reads
--      as "no plant oils" — false: we cook with olive oil, which is a plant oil. The claim is
--      about oils pressed from SEEDS, so: «масел из семян».
--   2. BrandRule.jsx picks each line's icon by matching the ENGLISH item text; a Russian string
--      matches nothing and fell back to a plain cross. Items become objects carrying the
--      English icon key (the component already supports {label, icon, deny}).
--
-- CONTRACT-REVIEWED: data-only update of one content_translations row.

BEGIN;

UPDATE public.content_translations
SET value = jsonb_set(value, '{items}', jsonb_build_array(
      jsonb_build_object('label', 'масел из семян',         'icon', 'seed oils'),
      jsonb_build_object('label', 'Есть блюда БЕЗ глютена', 'icon', 'industrial gluten', 'deny', false),
      jsonb_build_object('label', 'ненастоящей еды',        'icon', 'fake food'),
      jsonb_build_object('label', 'консервантов',           'icon', 'preservatives'),
      jsonb_build_object('label', 'глутамата натрия (MSG)', 'icon', 'msg'))),
    source_hash = md5(public.fn_translation_source('site_content', 'rule', 'data')),
    reviewed_at = NULL, reviewed_by = NULL
WHERE entity = 'site_content' AND entity_key = 'rule' AND field = 'data' AND lang = 'ru';

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES ('451_ru_rule_items_icons_and_seed_oil_wording.sql', 'claude-opus-session-6699d2ee', NULL,
  'RU rule block: «масел из семян» (not «растительных» — olive oil is a plant oil) + icon keys on items (MC f91194f7)')
ON CONFLICT DO NOTHING;

COMMIT;
