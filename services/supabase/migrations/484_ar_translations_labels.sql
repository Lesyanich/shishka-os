-- 484_ar_translations_labels.sql
-- Arabic labels: categories, allergen tags, modifier groups/options, site copy (MC f91194f7).
--
-- Fourth site language, after RU (mig 450 ff) and TH (migs 474-477). Arabic is written
-- right-to-left; nothing about that is stored here — the direction is a rendering concern
-- (shishka-health sets dir="rtl" from the <html lang>), so these rows are plain text like
-- any other language.
--
-- Dish NAMES are not translated in any language (mig 473a, CEO) — the guest orders by the
-- name the till shows, and a translated name is a problem at the counter. Arabic descriptions
-- and ingredient lists follow in 485.
--
-- tags has name_th but no name_ar, so unlike the Thai import (mig 474) the allergen labels
-- are given literally here. They are SAFETY copy: each "Contains X" keeps its allergen list
-- complete and in the English order. Standard Arabic food-labelling terms are used
-- (يحتوي على = contains).
--
-- Numbers 484/485 were claimed through fn_claim_migration_number (mig 483's atomic
-- allocator, applied earlier today), not guessed from max+1. They had to be: this session
-- first wrote 481/482 and lost BOTH to parallel sessions within minutes — exactly the
-- collision class the allocator was built for.
--
-- CONTRACT-REVIEWED: data-only inserts into content_translations. No schema change, no
-- table/view/function touched, so vault/Database/Schema.md needs no edit.

BEGIN;

-- Categories. The leading emoji is part of the stored name and is kept verbatim
-- (shishka.health strips emojis at render time); only the words are translated.
WITH c(entity_key, txt) AS (VALUES
  ('4017ae91-baad-468d-8667-75e74467fd28', '☕ قهوة'),
  ('cda9f4a1-e6a6-493b-bc9d-6da30565cca0', '🌯 راب القمح الكامل'),
  ('e187f37e-3b17-451a-baa2-c73fe1b35d48', '🍜 سلطانيات'),
  ('e79b447c-ec23-4eb6-b17d-a5183ddb815c', '🍢 أطباق البروتين'),
  ('3cd6c1cf-89d4-45c7-a4c0-92cf47676f2f', '🍫 شوكولاتة'),
  ('f8e8aa0d-e549-42d7-bf5b-de70c2f9cbbb', '🍳 فطور طوال اليوم'),
  ('c1181117-e67e-4563-aa8b-8c42dd09bb61', '🍳 البيض'),
  ('53412569-b9ad-46fa-9b96-8ad02a074980', '🍵 ماتشا'),
  ('1675790d-6198-425d-8bbe-0051a3347c6e', '🍽️ إضافات'),
  ('f8fc367e-f8da-4aa9-a2a5-c19f991a31ca', '🥗 سلطات'),
  ('e1820bb8-7c12-457f-9cd1-7c42ae97e7a1', '🥤 سموذي'),
  ('4c1cda8b-7ba5-4535-b258-32add856c300', '🥪 توست'),
  ('ce2f9959-92af-4985-a2c1-270626fd02ad', '🥫 صوصات وتغميسات'),
  ('7ed1ef53-f781-43da-ba37-684009a16fed', '🧃 عصائر')
)
INSERT INTO public.content_translations (entity, entity_key, field, lang, value, source_hash)
SELECT 'category', c.entity_key, 'name', 'ar', to_jsonb(c.txt),
       md5(public.fn_translation_source('category', c.entity_key, 'name'))
FROM c
WHERE public.fn_translation_source('category', c.entity_key, 'name') IS NOT NULL
ON CONFLICT (entity, entity_key, field, lang) DO UPDATE
  SET value = EXCLUDED.value, source_hash = EXCLUDED.source_hash, reviewed_at = NULL, reviewed_by = NULL;

-- Allergen tags — safety copy. Keyed by slug; the English wording is "Contains X".
WITH g(entity_key, txt) AS (VALUES
  ('allergen-dairy',     'يحتوي على الألبان'),
  ('allergen-eggs',      'يحتوي على البيض'),
  ('allergen-fish',      'يحتوي على الأسماك'),
  ('allergen-gluten',    'يحتوي على الغلوتين'),
  ('allergen-mustard',   'يحتوي على الخردل'),
  ('allergen-nuts',      'يحتوي على المكسرات'),
  ('allergen-sesame',    'يحتوي على السمسم'),
  ('allergen-shellfish', 'يحتوي على المحاريات'),
  ('allergen-soy',       'يحتوي على الصويا')
)
INSERT INTO public.content_translations (entity, entity_key, field, lang, value, source_hash)
SELECT 'tag', g.entity_key, 'name', 'ar', to_jsonb(g.txt),
       md5(public.fn_translation_source('tag', g.entity_key, 'name'))
FROM g
WHERE public.fn_translation_source('tag', g.entity_key, 'name') IS NOT NULL
ON CONFLICT (entity, entity_key, field, lang) DO UPDATE
  SET value = EXCLUDED.value, source_hash = EXCLUDED.source_hash, reviewed_at = NULL, reviewed_by = NULL;

-- Modifier groups and options. entity_key IS the English string (fn_translation_source
-- echoes the key back for these two entities), so the hash is md5 of the key itself.
WITH m(entity, entity_key, txt) AS (VALUES
  ('modifier_group', 'Base Upgrade (from Milk)',   'ترقية الأساس (من الحليب)'),
  ('modifier_group', 'Base Upgrade (from Water)',  'ترقية الأساس (من الماء)'),
  ('modifier_group', 'Base Upgrade (from Yogurt)', 'ترقية الأساس (من الزبادي)'),
  ('modifier_group', 'Boosters',                   'معزِّزات'),
  ('modifier_group', 'Coffee Boosters',            'معزِّزات القهوة'),
  ('modifier_group', 'Extra Fruit',                'فواكه إضافية'),
  ('modifier_group', 'Milk',                       'الحليب'),
  ('modifier_group', 'Nuts, Seeds & Butters',      'مكسرات وبذور وزبدات'),
  ('modifier_group', 'Pick Fruits',                'اختر الفواكه'),
  ('modifier_group', 'Served with bread',          'يُقدَّم مع الخبز'),
  ('modifier_group', 'Temperature',                'درجة الحرارة'),
  ('modifier_group', 'Temperature +10',            'درجة الحرارة (+10)'),
  ('modifier_option', 'Add Cashew Butter (15g)',  'زبدة الكاجو (15 غ)'),
  ('modifier_option', 'Add Peanut Butter (15g)',  'زبدة الفول السوداني (15 غ)'),
  ('modifier_option', 'Almond Milk',              'حليب اللوز'),
  ('modifier_option', 'Almond Slices',            'شرائح اللوز'),
  ('modifier_option', 'Apricot',                  'مشمش'),
  ('modifier_option', 'Avocado',                  'أفوكادو'),
  ('modifier_option', 'Banana',                   'موز'),
  ('modifier_option', 'Blueberry',                'بلوبيري'),
  ('modifier_option', 'Caramel Syrup',            'شراب الكراميل'),
  ('modifier_option', 'Chia Seeds',               'بذور الشيا'),
  ('modifier_option', 'Coconut Milk',             'حليب جوز الهند'),
  ('modifier_option', 'Cow Milk',                 'حليب البقر'),
  ('modifier_option', 'Creatine',                 'كرياتين'),
  ('modifier_option', 'Extra Espresso Shot',      'جرعة إسبريسو إضافية'),
  ('modifier_option', 'Greek Yogurt',             'زبادي يوناني'),
  ('modifier_option', 'Hazelnut Syrup',           'شراب البندق'),
  ('modifier_option', 'Hot',                      'ساخن'),
  ('modifier_option', 'Iced',                     'مثلج'),
  ('modifier_option', 'Kiwi',                     'كيوي'),
  ('modifier_option', 'Mango',                    'مانجو'),
  ('modifier_option', 'Maple Syrup',              'شراب القيقب'),
  ('modifier_option', 'MCT Oil',                  'زيت MCT'),
  ('modifier_option', 'Mint Syrup',               'شراب النعناع'),
  ('modifier_option', 'Multigrain Toast',         'توست متعدد الحبوب'),
  ('modifier_option', 'No bread',                 'بدون خبز'),
  ('modifier_option', 'Oat Milk',                 'حليب الشوفان'),
  ('modifier_option', 'Passion Fruit',            'باشن فروت'),
  ('modifier_option', 'Peach',                    'خوخ'),
  ('modifier_option', 'Pineapple',                'أناناس'),
  ('modifier_option', 'Spinach',                  'سبانخ'),
  ('modifier_option', 'Strawberry',               'فراولة'),
  ('modifier_option', 'Vanilla Protein',          'بروتين فانيلا'),
  ('modifier_option', 'Vanilla Syrup',            'شراب الفانيلا'),
  ('modifier_option', 'Water',                    'ماء'),
  ('modifier_option', 'Whey Protein',             'بروتين واي'),
  ('modifier_option', 'Wholewheat Wrap',          'راب القمح الكامل')
)
INSERT INTO public.content_translations (entity, entity_key, field, lang, value, source_hash)
SELECT m.entity, m.entity_key, 'name', 'ar', to_jsonb(m.txt),
       md5(public.fn_translation_source(m.entity, m.entity_key, 'name'))
FROM m
WHERE public.fn_translation_source(m.entity, m.entity_key, 'name') IS NOT NULL
ON CONFLICT (entity, entity_key, field, lang) DO UPDATE
  SET value = EXCLUDED.value, source_hash = EXCLUDED.source_hash, reviewed_at = NULL, reviewed_by = NULL;

-- site_content: partial objects merged over the English row (see i18n/localize.js), so only
-- the translatable keys appear. hoursTime / whatsappUrl / instagramUrl / style /
-- afterCategory stay English-side, and the hero eyebrow "SHiSHKA · Healthy Kitchen" is the
-- brand lockup — never translated.
--
-- The 'rule' items mirror the Thai shape: each entry an object with label + icon, and the
-- gluten line keeps deny=false so it renders as something we HAVE, not something we lack
-- (CEO: we do not publish our own weaknesses). The gluten CLAIMS on the AEO pages are a
-- separate, still-open decision (MC 98e1ef8d) and are not translated at all.
WITH s(entity_key, val) AS (VALUES
  ('hero', jsonb_build_object(
      'banner', 'طعام نظيف',
      'title', 'صادق. لذيذ. بلا زيف',
      'sub', E'بلا زيوت بذور · بلا غلوتامات أحادية الصوديوم · لا شيء فائق التصنيع\nمكوّنات طازجة فقط')),
  ('rule', jsonb_build_object(
      'eyebrow', 'القاعدة',
      'lead', 'طعام نظيف، إحساس أفضل',
      'items', jsonb_build_array(
        jsonb_build_object('label', 'زيوت البذور', 'icon', 'seed oils'),
        jsonb_build_object('label', 'أصناف خالية من الغلوتين', 'icon', 'industrial gluten', 'deny', false),
        jsonb_build_object('label', 'طعام مزيف', 'icon', 'fake food'),
        jsonb_build_object('label', 'مواد حافظة', 'icon', 'preservatives'),
        jsonb_build_object('label', 'غلوتامات أحادية الصوديوم (MSG)', 'icon', 'msg')))),
  ('cta', jsonb_build_object(
      'eyebrow', 'زورونا في فوكيت',
      'title', 'تعالوا وأنتم جائعون.',
      'sub', 'طعام حقيقي يُحضَّر طازجًا كل يوم — مرّوا على مطبخنا في فوكيت.',
      'hoursLabel', 'مفتوح يوميًا')),
  ('sectionIntros', jsonb_build_object(
      'Manakish', 'المناقيش خبز مسطّح تقليدي من الشرق الأوسط — بيتزا المنطقة الصغيرة. أعدنا ابتكاره خاليًا من الغلوتين على عجينتنا المصنوعة من البطاطس.'))
)
INSERT INTO public.content_translations (entity, entity_key, field, lang, value, source_hash)
SELECT 'site_content', s.entity_key, 'data', 'ar', s.val,
       md5(public.fn_translation_source('site_content', s.entity_key, 'data'))
FROM s
WHERE public.fn_translation_source('site_content', s.entity_key, 'data') IS NOT NULL
ON CONFLICT (entity, entity_key, field, lang) DO UPDATE
  SET value = EXCLUDED.value, source_hash = EXCLUDED.source_hash, reviewed_at = NULL, reviewed_by = NULL;

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES ('484_ar_translations_labels.sql', 'claude-code', NULL,
  'AR: 14 categories, 9 allergen tags, 12 modifier groups + 36 options, 4 site_content blocks. Fourth site language; dish names stay English per mig 473a (MC f91194f7)')
ON CONFLICT DO NOTHING;

COMMIT;
