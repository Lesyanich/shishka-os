-- 447_ru_translations_labels.sql
-- Russian for the short guest-facing labels on shishka.health (MC f91194f7, table from mig 446):
-- menu categories/sections, allergen tags, modifier groups + options, bundle labels, site copy.
-- Translated offline in-session (no runtime LLM). source_hash is taken from the CURRENT English
-- via fn_translation_source, so each row is fresh on insert and goes stale if the EN moves.
--
-- Style: brand dish/food names that Russian guests know are transliterated (манакиш, матча);
-- everything else is translated. Emoji prefixes mirror the EN (the site strips them anyway).
-- site_content values are PARTIAL objects merged over the EN row: URLs and hours are not repeated.
-- modifier_* keys are the English text itself (menu_modifiers has no stable id).
--
-- CONTRACT-REVIEWED: data-only inserts into content_translations; no contract object is altered.

BEGIN;

WITH t(entity, entity_key, field, value) AS (VALUES
  -- categories / sections
  ('category', '4017ae91-baad-468d-8667-75e74467fd28', 'name', to_jsonb('☕ Кофе'::text)),
  ('category', '7d09cb76-3490-4de7-9278-b4ac6775517c', 'name', to_jsonb('🌮 Картофельные тако · с мясом'::text)),
  ('category', '8c1a05dd-dca3-4341-a1de-bf3fe38c097b', 'name', to_jsonb('🌮 Картофельные тако · вегетарианские'::text)),
  ('category', 'cda9f4a1-e6a6-493b-bc9d-6da30565cca0', 'name', to_jsonb('🌯 Роллы'::text)),
  ('category', 'fb58763a-1e64-4da3-b040-839eb22af81e', 'name', to_jsonb('🍃 Роллы в рисовой бумаге'::text)),
  ('category', 'e187f37e-3b17-451a-baa2-c73fe1b35d48', 'name', to_jsonb('🍜 Боулы'::text)),
  ('category', 'e79b447c-ec23-4eb6-b17d-a5183ddb815c', 'name', to_jsonb('🍢 Белковые блюда'::text)),
  ('category', '3cd6c1cf-89d4-45c7-a4c0-92cf47676f2f', 'name', to_jsonb('🍫 Шоколад'::text)),
  ('category', 'f8e8aa0d-e549-42d7-bf5b-de70c2f9cbbb', 'name', to_jsonb('🍳 Завтраки весь день'::text)),
  ('category', 'c1181117-e67e-4563-aa8b-8c42dd09bb61', 'name', to_jsonb('🍳 Яйца'::text)),
  ('category', '53412569-b9ad-46fa-9b96-8ad02a074980', 'name', to_jsonb('🍵 Матча'::text)),
  ('category', '1675790d-6198-425d-8bbe-0051a3347c6e', 'name', to_jsonb('🥖 Хлеб и крекеры'::text)),
  ('category', 'f8fc367e-f8da-4aa9-a2a5-c19f991a31ca', 'name', to_jsonb('🥗 Салаты'::text)),
  ('category', '570d2bf8-6a5f-4491-b9aa-ff3bbb0b327d', 'name', to_jsonb('🥣 Дипы'::text)),
  ('category', 'e1820bb8-7c12-457f-9cd1-7c42ae97e7a1', 'name', to_jsonb('🥤 Смузи'::text)),
  ('category', '4c1cda8b-7ba5-4535-b258-32add856c300', 'name', to_jsonb('🥪 Тосты'::text)),
  ('category', 'ce2f9959-92af-4985-a2c1-270626fd02ad', 'name', to_jsonb('🥫 Соусы и заправки'::text)),
  ('category', '7ed1ef53-f781-43da-ba37-684009a16fed', 'name', to_jsonb('🧃 Соки'::text)),
  ('category', 'f9a0abe8-88a9-4093-b669-4bc1debdf8a1', 'name', to_jsonb('🫓 Роллы в тортилье'::text)),

  -- allergen tags (safety copy: literal, no marketing)
  ('tag', 'allergen-dairy',     'name', to_jsonb('Содержит молочные продукты'::text)),
  ('tag', 'allergen-eggs',      'name', to_jsonb('Содержит яйца'::text)),
  ('tag', 'allergen-fish',      'name', to_jsonb('Содержит рыбу'::text)),
  ('tag', 'allergen-gluten',    'name', to_jsonb('Содержит глютен'::text)),
  ('tag', 'allergen-nuts',      'name', to_jsonb('Содержит орехи'::text)),
  ('tag', 'allergen-sesame',    'name', to_jsonb('Содержит кунжут'::text)),
  ('tag', 'allergen-shellfish', 'name', to_jsonb('Содержит ракообразных'::text)),

  -- modifier groups
  ('modifier_group', 'Base Upgrade (from Milk)',   'name', to_jsonb('Замена основы (вместо молока)'::text)),
  ('modifier_group', 'Base Upgrade (from Water)',  'name', to_jsonb('Замена основы (вместо воды)'::text)),
  ('modifier_group', 'Base Upgrade (from Yogurt)', 'name', to_jsonb('Замена основы (вместо йогурта)'::text)),
  ('modifier_group', 'Boosters',                   'name', to_jsonb('Добавки'::text)),
  ('modifier_group', 'Coffee Boosters',            'name', to_jsonb('Добавки к кофе'::text)),
  ('modifier_group', 'Extra Fruit',                'name', to_jsonb('Больше фруктов'::text)),
  ('modifier_group', 'Milk',                       'name', to_jsonb('Молоко'::text)),
  ('modifier_group', 'Nuts, Seeds & Butters',      'name', to_jsonb('Орехи, семена и пасты'::text)),
  ('modifier_group', 'Pick Fruits',                'name', to_jsonb('Выберите фрукты'::text)),
  ('modifier_group', 'Served with bread',          'name', to_jsonb('Подаётся с хлебом'::text)),
  ('modifier_group', 'Temperature',                'name', to_jsonb('Температура'::text)),
  ('modifier_group', 'Temperature +10',            'name', to_jsonb('Температура +10'::text)),

  -- modifier options
  ('modifier_option', 'Add Cashew Butter (15g)',  'name', to_jsonb('Паста из кешью (15 г)'::text)),
  ('modifier_option', 'Add Peanut Butter (15g)',  'name', to_jsonb('Арахисовая паста (15 г)'::text)),
  ('modifier_option', 'Almond Milk',              'name', to_jsonb('Миндальное молоко'::text)),
  ('modifier_option', 'Almond Slices',            'name', to_jsonb('Миндальные лепестки'::text)),
  ('modifier_option', 'Apricot',                  'name', to_jsonb('Абрикос'::text)),
  ('modifier_option', 'Avocado',                  'name', to_jsonb('Авокадо'::text)),
  ('modifier_option', 'Banana',                   'name', to_jsonb('Банан'::text)),
  ('modifier_option', 'Blueberry',                'name', to_jsonb('Голубика'::text)),
  ('modifier_option', 'Caramel Syrup',            'name', to_jsonb('Карамельный сироп'::text)),
  ('modifier_option', 'Chia Seeds',               'name', to_jsonb('Семена чиа'::text)),
  ('modifier_option', 'Coconut Milk',             'name', to_jsonb('Кокосовое молоко'::text)),
  ('modifier_option', 'Cow Milk',                 'name', to_jsonb('Коровье молоко'::text)),
  ('modifier_option', 'Creatine',                 'name', to_jsonb('Креатин'::text)),
  ('modifier_option', 'Extra Espresso Shot',      'name', to_jsonb('Дополнительный шот эспрессо'::text)),
  ('modifier_option', 'Greek Yogurt',             'name', to_jsonb('Греческий йогурт'::text)),
  ('modifier_option', 'Hazelnut Syrup',           'name', to_jsonb('Ореховый сироп (фундук)'::text)),
  ('modifier_option', 'Hot',                      'name', to_jsonb('Горячий'::text)),
  ('modifier_option', 'Iced',                     'name', to_jsonb('Со льдом'::text)),
  ('modifier_option', 'Kiwi',                     'name', to_jsonb('Киви'::text)),
  ('modifier_option', 'Mango',                    'name', to_jsonb('Манго'::text)),
  ('modifier_option', 'Maple Syrup',              'name', to_jsonb('Кленовый сироп'::text)),
  ('modifier_option', 'MCT Oil',                  'name', to_jsonb('Масло MCT'::text)),
  ('modifier_option', 'Mint Syrup',               'name', to_jsonb('Мятный сироп'::text)),
  ('modifier_option', 'Multigrain Toast',         'name', to_jsonb('Мультизерновой тост'::text)),
  ('modifier_option', 'No bread',                 'name', to_jsonb('Без хлеба'::text)),
  ('modifier_option', 'Oat Milk',                 'name', to_jsonb('Овсяное молоко'::text)),
  ('modifier_option', 'Passion Fruit',            'name', to_jsonb('Маракуйя'::text)),
  ('modifier_option', 'Peach',                    'name', to_jsonb('Персик'::text)),
  ('modifier_option', 'Pineapple',                'name', to_jsonb('Ананас'::text)),
  ('modifier_option', 'Spinach',                  'name', to_jsonb('Шпинат'::text)),
  ('modifier_option', 'Strawberry',               'name', to_jsonb('Клубника'::text)),
  ('modifier_option', 'Vanilla Protein',          'name', to_jsonb('Ванильный протеин'::text)),
  ('modifier_option', 'Vanilla Syrup',            'name', to_jsonb('Ванильный сироп'::text)),
  ('modifier_option', 'Water',                    'name', to_jsonb('Вода'::text)),
  ('modifier_option', 'Whey Protein',             'name', to_jsonb('Сывороточный протеин'::text)),
  ('modifier_option', 'Wholewheat Wrap',          'name', to_jsonb('Цельнозерновая лепёшка'::text)),

  -- bundle labels
  ('price_tier', 'bundle4', 'label', to_jsonb('Набор из 4 картофельных тако + 1 соус в подарок'::text)),
  ('price_tier', 'bundle8', 'label', to_jsonb('Набор из 8 картофельных тако + 2 соуса в подарок'::text)),

  -- site copy (partial objects, merged over the EN row)
  ('site_content', 'hero', 'data', jsonb_build_object(
      'sub', 'свежая, необработанная, настоящая еда — готовим каждый день.')),
  ('site_content', 'rule', 'data', jsonb_build_object(
      'eyebrow', 'наше правило',
      'lead', 'ешь чисто — чувствуй себя хорошо',
      'items', jsonb_build_array(
        'растительных масел из семян',
        jsonb_build_object('deny', false, 'icon', 'industrial gluten', 'label', 'Есть блюда БЕЗ глютена'),
        'ненастоящей еды',
        'консервантов',
        'глутамата натрия (MSG)'))),
  ('site_content', 'cta', 'data', jsonb_build_object(
      'eyebrow', 'ждём вас на пхукете',
      'title', 'приходите голодными.',
      'sub', 'Настоящая еда, свежая каждый день — заглядывайте на нашу кухню на Пхукете.',
      'hoursLabel', 'открыто ежедневно')),
  ('site_content', 'sectionIntros', 'data', jsonb_build_object(
      'Manakish', 'Манакиш — традиционная ближневосточная лепёшка, местная мини-пицца. Мы переосмыслили её без глютена — на собственном тесте на основе картофеля.'))
)
INSERT INTO public.content_translations (entity, entity_key, field, lang, value, source_hash)
SELECT t.entity, t.entity_key, t.field, 'ru', t.value,
       md5(public.fn_translation_source(t.entity, t.entity_key, t.field))
FROM t
WHERE public.fn_translation_source(t.entity, t.entity_key, t.field) IS NOT NULL
ON CONFLICT (entity, entity_key, field, lang) DO UPDATE
  SET value = EXCLUDED.value, source_hash = EXCLUDED.source_hash,
      reviewed_at = NULL, reviewed_by = NULL;

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '447_ru_translations_labels.sql',
  'claude-opus-session-6699d2ee',
  NULL,
  'RU for categories, allergen tags, modifier groups/options, bundle labels, site_content (MC f91194f7)'
)
ON CONFLICT DO NOTHING;

COMMIT;
