-- 463_ru_translations_catch_up_wraps.sql
-- Catch the Russian translations up with a month of menu changes (MC f91194f7).
--
-- The staleness guard from mig 446 did its job: every string below was either missing or had
-- gone stale after its English source changed, so /ru fell back to English instead of showing
-- an outdated translation. This migration closes the gap:
--   • 10 new dishes (6 fold wraps, 3 open wraps, Cheese & Mushroom manakish) — name,
--     description and ingredient list;
--   • 2 new categories (🌮 Healthy Potato Tacos, Classic);
--   • 3 renamed categories (Extras, Whole Wheat Wraps, Sauce/Dressing and Dips);
--   • 3 renamed dishes (Chicken ShishTawook Wrap, Daynamite Sauce, Honey-Mustard Sauce);
--   • site_content "rule": the English row gained `style`/`afterCategory` keys but the five rule
--     items are unchanged, so the Russian text stands — only its source_hash is refreshed.
--
-- Wording follows the CEO rules from mig 452: «врап» for a tortilla wrap (never «ролл», which in
-- Russian means sushi), Middle-Eastern names transliterated (заатар, шиш-таук, фалафель).
-- Ingredient lists are translated item for item, in the same order, parentheses included.
--
-- CONTRACT-REVIEWED: data-only upserts into content_translations.

BEGIN;

-- 1. Dishes, keyed by product_code for readability -------------------------------------------
WITH t(product_code, field, txt) AS (VALUES
  -- names
  ('SALE-MANAISH_CHEESE_MUSHROOM_GF', 'name', 'Сыр и грибы'),
  ('SALE-PROTEIN_MEAL_CHICKEN',       'name', 'Врап с курицей шиш-таук'),
  ('SALE-SAUCE_HUMMUS',               'name', 'Соус «Динамит»'),
  ('SALE-SAUCE_YOGURT_TAHINI',        'name', 'Медово-горчичный соус'),
  ('SALE-WRAP_FOLD_CHICKEN_AVOCADO',  'name', 'Врап с курицей и авокадо'),
  ('SALE-WRAP_FOLD_CHICKEN_FAJITA',   'name', 'Врап фахита с курицей'),
  ('SALE-WRAP_FOLD_EGGS_FAJITA',      'name', 'Врап фахита с яйцом'),
  ('SALE-WRAP_FOLD_FALAFEL',          'name', 'Врап с фалафелем'),
  ('SALE-WRAP_FOLD_LAMB_TRUFFLE',     'name', 'Врап с бараниной, трюфелем и сыром'),
  ('SALE-WRAP_FOLD_SHRIMP_FAJITA',    'name', 'Врап фахита с креветками'),
  ('SALE-WRAP_OPEN_CHEESE',           'name', 'Сырный врап'),
  ('SALE-WRAP_OPEN_ZAATAR',           'name', 'Врап с заатаром'),
  ('SALE-WRAP_OPEN_ZAATAR_CHEESE',    'name', 'Врап с заатаром и сыром'),

  -- descriptions
  ('SALE-MANAISH_CHEESE_MUSHROOM_GF', 'description',
   'Землистые шиитаке и расплавленное трио сыров на нашей картофельной основе без глютена — насыщенный вкус умами и настоящая сытость.'),
  ('SALE-WRAP_FOLD_CHICKEN_AVOCADO', 'description',
   'Куриная грудка на гриле с ломтиками авокадо, расплавленной моцареллой и чеддером, завёрнутая в цельнозерновую лепёшку с хрустящим айсбергом — подаётся с чесночным кремом и гуакамоле.'),
  ('SALE-WRAP_FOLD_CHICKEN_FAJITA', 'description',
   'Куриная грудка на гриле с трёхцветным болгарским перцем и луком, завёрнутая в цельнозерновую лепёшку с капустным салатом на йогурте и тахини — подаётся с медово-горчичным соусом и пико-де-гальо.'),
  ('SALE-WRAP_FOLD_EGGS_FAJITA', 'description',
   'Яичница-болтунья с трёхцветным болгарским перцем и луком с гриля, завёрнутая в цельнозерновую лепёшку с капустным салатом на йогурте и тахини — подаётся с майонезом на оливковом масле и пико-де-гальо.'),
  ('SALE-WRAP_FOLD_FALAFEL', 'description',
   'Запечённый фалафель из нута на хумусе, завёрнутый в цельнозерновую лепёшку с томатом, огурцом, корнишонами, редисом и айсбергом, с тахини и сумахом — подаётся с хумусом и тахини.'),
  ('SALE-WRAP_FOLD_LAMB_TRUFFLE', 'description',
   'Баранина на гриле с грибами и луком под расплавленной моцареллой и чеддером, завёрнутая в цельнозерновую лепёшку — подаётся с трюфельным майонезом и чесночным кремом.'),
  ('SALE-WRAP_FOLD_SHRIMP_FAJITA', 'description',
   'Креветки на гриле с трёхцветным болгарским перцем и луком, завёрнутые в цельнозерновую лепёшку с капустным салатом на йогурте и тахини — подаются с соусом «Динамит» и гуакамоле.'),
  ('SALE-WRAP_OPEN_CHEESE', 'description',
   'Цельнозерновая лепёшка, раскрытая и запечённая под расплавленной моцареллой, чеддером и сливочным сыром, с белым и чёрным кунжутом — подаётся с черри, огурцом, оливками и мятой.'),
  ('SALE-WRAP_OPEN_ZAATAR', 'description',
   'Цельнозерновая лепёшка, раскрытая и запечённая с заатаром и оливковым маслом, с белым и чёрным кунжутом — подаётся с черри, огурцом, оливками и мятой.'),
  ('SALE-WRAP_OPEN_ZAATAR_CHEESE', 'description',
   'Половина с заатаром, половина с сыром: одна цельнозерновая лепёшка, раскрытая и запечённая — с одной стороны заатар с оливковым маслом, с другой моцарелла и чеддер — подаётся с черри, огурцом, оливками и мятой.'),

  -- ingredient lists (item for item, same order)
  ('SALE-MANAISH_CHEESE_MUSHROOM_GF', 'ingredients',
   'Безглютеновое картофельное тесто, грибы шиитаке, смесь трёх сыров, сливочный сыр, кунжут'),
  ('SALE-WRAP_FOLD_CHICKEN_AVOCADO', 'ingredients',
   'Цельнозерновая лепёшка, куриная грудка, авокадо, моцарелла, чеддер, салат айсберг, чесночный крем (сметана, майонез на оливковом масле, чеснок), гуакамоле (авокадо, лайм, лук, кинза)'),
  ('SALE-WRAP_FOLD_CHICKEN_FAJITA', 'ingredients',
   'Цельнозерновая лепёшка, куриная грудка, болгарский перец, лук, капустный салат (капуста, йогурт, тахини), медово-горчичный соус (майонез на оливковом масле, горчица, мёд), пико-де-гальо (томат, красный лук, лайм, кинза)'),
  ('SALE-WRAP_FOLD_EGGS_FAJITA', 'ingredients',
   'Цельнозерновая лепёшка, яйцо, болгарский перец, лук, капустный салат (капуста, йогурт, тахини), медово-горчичный соус, майонез на оливковом масле, пико-де-гальо (томат, красный лук, лайм, кинза)'),
  ('SALE-WRAP_FOLD_FALAFEL', 'ingredients',
   'Цельнозерновая лепёшка, фалафель (нут, петрушка, кинза, чеснок, зира), хумус (нут, тахини, лимон), тахини, томат, огурец, маринованный корнишон, редис, салат айсберг, петрушка, сумах'),
  ('SALE-WRAP_FOLD_LAMB_TRUFFLE', 'ingredients',
   'Цельнозерновая лепёшка, баранина, шампиньоны, лук, моцарелла, чеддер, трюфельный майонез (майонез на оливковом масле, соус из чёрного трюфеля), чесночный крем (сметана, майонез на оливковом масле, чеснок)'),
  ('SALE-WRAP_FOLD_SHRIMP_FAJITA', 'ingredients',
   'Цельнозерновая лепёшка, креветки, болгарский перец, лук, капустный салат (капуста, йогурт, тахини), медово-горчичный соус, соус «Динамит» (майонез на оливковом масле, шрирача), гуакамоле (авокадо, лайм, лук, кинза)'),
  ('SALE-WRAP_OPEN_CHEESE', 'ingredients',
   'Цельнозерновая лепёшка, моцарелла, чеддер, сливочный сыр, белый и чёрный кунжут, черри, огурец, оливки, мята'),
  ('SALE-WRAP_OPEN_ZAATAR', 'ingredients',
   'Цельнозерновая лепёшка, заатар, оливковое масло, белый и чёрный кунжут, черри, огурец, оливки, мята'),
  ('SALE-WRAP_OPEN_ZAATAR_CHEESE', 'ingredients',
   'Цельнозерновая лепёшка, заатар, оливковое масло, моцарелла, чеддер, белый и чёрный кунжут, черри, огурец, оливки, мята')
),
r AS (
  SELECT n.id::text AS entity_key, t.field, t.txt
  FROM t JOIN public.nomenclature n ON n.product_code = t.product_code
)
INSERT INTO public.content_translations (entity, entity_key, field, lang, value, source_hash)
SELECT 'dish', r.entity_key, r.field, 'ru', to_jsonb(r.txt),
       md5(public.fn_translation_source('dish', r.entity_key, r.field))
FROM r
WHERE public.fn_translation_source('dish', r.entity_key, r.field) IS NOT NULL
ON CONFLICT (entity, entity_key, field, lang) DO UPDATE
  SET value = EXCLUDED.value, source_hash = EXCLUDED.source_hash,
      reviewed_at = NULL, reviewed_by = NULL;

-- 2. Categories ------------------------------------------------------------------------------
WITH c(entity_key, txt) AS (VALUES
  ('bbe7936f-a629-48de-9b06-3f1efc00576b', '🌮 Картофельные тако'),
  ('5bd33cc9-5d8f-4c1b-8703-93444d12a085', 'Классические'),
  ('1675790d-6198-425d-8bbe-0051a3347c6e', '🍽️ Дополнительно'),
  ('cda9f4a1-e6a6-493b-bc9d-6da30565cca0', '🌯 Цельнозерновые врапы'),
  ('ce2f9959-92af-4985-a2c1-270626fd02ad', '🥫 Соусы, заправки и дипы')
)
INSERT INTO public.content_translations (entity, entity_key, field, lang, value, source_hash)
SELECT 'category', c.entity_key, 'name', 'ru', to_jsonb(c.txt),
       md5(public.fn_translation_source('category', c.entity_key, 'name'))
FROM c
WHERE public.fn_translation_source('category', c.entity_key, 'name') IS NOT NULL
ON CONFLICT (entity, entity_key, field, lang) DO UPDATE
  SET value = EXCLUDED.value, source_hash = EXCLUDED.source_hash,
      reviewed_at = NULL, reviewed_by = NULL;

-- 3. site_content "rule": text unchanged, only the hash is re-pinned to today's English -------
UPDATE public.content_translations
SET source_hash = md5(public.fn_translation_source('site_content', 'rule', 'data'))
WHERE entity = 'site_content' AND entity_key = 'rule' AND field = 'data' AND lang = 'ru';

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES ('463_ru_translations_catch_up_wraps.sql', 'claude-opus-session-20399950', NULL,
  'RU catch-up: 10 new dishes (wraps + mushroom manakish), 5 categories, 3 renamed dishes, rule hash re-pin (MC f91194f7)')
ON CONFLICT DO NOTHING;

COMMIT;
