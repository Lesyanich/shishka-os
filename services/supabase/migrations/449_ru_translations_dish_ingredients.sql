-- 449_ru_translations_dish_ingredients.sql
-- Russian ingredient lists (customer_ingredients) for all 80 live dishes that have one.
-- MC f91194f7, table from mig 446. Translated offline in-session.
--
-- SAFETY: ingredient lists are allergen-bearing copy. Every ingredient and every "Contains …"
-- clause is translated literally, one-for-one, in the same order — nothing added, merged or
-- dropped. If the EN list changes, source_hash stops matching and the site falls back to EN.
--
-- CONTRACT-REVIEWED: data-only inserts into content_translations; no contract object is altered.

BEGIN;

WITH t(product_code, txt) AS (VALUES
  ('SALE-BOWL_MANGO_SALMON_TUNA',   'Жасминовый рис, лосось, тунец для сашими, спелое манго, авокадо, салат вакамэ, эдамаме, черри, огурец'),
  ('SALE-BRK_CHEESE_EGG',           'Три яйца, расплавленный сыр, тост из 19 злаков, овощи с бара'),
  ('SALE-BRK_DOUBLE_PROTEIN',       'Три яйца, хумус, кунжут, тост из 19 злаков, овощи с бара'),
  ('SALE-BRK_EGGS_YOUR_WAY',        'Три жареных яйца, тост из 19 злаков, бесплатные овощи с бара. Сыр или ветчина — за доплату.'),
  ('SALE-BRK_GUACAMOLE_EGG',        'Три яйца, гуакамоле, тост из 19 злаков, овощи с бара'),
  ('SALE-CAESAR_CHICKEN',           'Салат айсберг, курица шиш-таук на гриле, черри, гренки с травами, сыр пармезан, соус «Цезарь»'),
  ('SALE-CAESAR_SHRIMP',            'Салат айсберг, креветки на гриле, черри, гренки с травами, сыр пармезан, соус «Цезарь»'),
  ('SALE-CHICKEN_MEXICAN_SALAD',    'Салат айсберг и ромэн, краснокочанная капуста, курица на гриле (в красном маринаде таук), гуакамоле, сальса из манго, пико-де-гальо, красная фасоль, сладкая кукуруза, болгарский перец, морковь, красный лук, маринованный халапеньо'),
  ('SALE-CHOC_COCONUT_SQ',          'Кокос, молоко, мёд, тёмный шоколад 70%. Содержит молоко.'),
  ('SALE-CHOC_PREACTIVE_SQ',        'Овсяные хлопья, арахис, мёд, кокос, миндаль, тёмный шоколад 70%. Содержит арахис, миндаль, глютен (овёс).'),
  ('SALE-CHOC_RECOVERY_SQ',         'Финики, миндаль, тахини, тыквенные семечки, арахис, семечки подсолнечника, тёмный шоколад 100%. Веганский. Содержит арахис, миндаль, кунжут.'),
  ('SALE-COFFEE_AMERICANO',         'Эспрессо, вода'),
  ('SALE-COFFEE_CAPPUCCINO',        'Эспрессо, молоко'),
  ('SALE-COFFEE_CARAMEL_LATTE',     'Эспрессо, молоко, карамельный сироп'),
  ('SALE-COFFEE_ESPRESSO',          'Эспрессо'),
  ('SALE-COFFEE_ESPRESSO_TONIC',    'Эспрессо, тоник, лёд'),
  ('SALE-COFFEE_ICED_AMERICANO',    'Эспрессо, вода, лёд'),
  ('SALE-COFFEE_ICED_CAPPUCCINO',   'Эспрессо, молоко, лёд'),
  ('SALE-COFFEE_ICED_CARAMEL_LATTE','Эспрессо, молоко, карамельный сироп, лёд'),
  ('SALE-COFFEE_ICED_LATTE',        'Эспрессо, молоко, лёд'),
  ('SALE-COFFEE_LATTE',             'Эспрессо, молоко'),
  ('SALE-COFFEE_ORANGE',            'Двойной эспрессо, свежевыжатый апельсиновый сок, лёд, долька апельсина'),
  ('SALE-COFFEE_PASSION_FRUIT',     'Двойной эспрессо, маракуйя, лёд'),
  ('SALE-CUP_SHRIMP_CRAB_SEAWEED',  'Отварная киноа, креветки на гриле, крабовая палочка, салат вакамэ, сладкая кукуруза, огурец, болгарский перец, кунжут'),
  ('SALE-CUP_TOFU_CHICKPEA',        'Отварная киноа, хрустящий плотный тофу, нут, запечённая тыква, авокадо, салат «зелёный дуб», кунжут'),
  ('SALE-FATTOUSH',                 'Салат айсберг и ромэн, краснокочанная капуста, томат, огурец, болгарский перец, красный лук, редис, петрушка, мята, зелёный лук, зёрна граната, заправка с сумахом, крекеры из семян, лимон'),
  ('SALE-GREEK_SALAD',              'Болгарский перец, огурец, сыр фета, чёрные оливки, лук-шалот'),
  ('SALE-HUMMUS_BEETROOT',          'Нут, свёкла, тахини, лимон, чеснок, оливковое масло'),
  ('SALE-HUMMUS_PLAIN',             'Нут, тахини, лимон, чеснок, оливковое масло extra virgin'),
  ('SALE-HUMMUS_TAWOOK',            'Хумус (нут, тахини, лимон, чеснок), табуле (петрушка, киноа, томат, красный лук, зелёный лук, мята, гранат, заправка с сумахом), курица на гриле (в красном маринаде таук), запечённая тыква, маринованный огурец, гренки с травами, белый и чёрный кунжут'),
  ('SALE-JUICE_CARROT',             'Морковь холодного отжима'),
  ('SALE-JUICE_GLOW',               'Морковь, апельсин, имбирь, куркума'),
  ('SALE-JUICE_GUAVA',              'Гуава холодного отжима'),
  ('SALE-JUICE_ORANGE',             'Апельсин холодного отжима'),
  ('SALE-JUICE_ORANGE_CARROT',      'Апельсин, морковь'),
  ('SALE-JUICE_PINEAPPLE',          'Ананас холодного отжима'),
  ('SALE-MANAISH_BEEF_GF',          'Безглютеновое картофельное тесто, говядина травяного откорма, томат, красный лук с сумахом, петрушка, соус тахини, гранатовая патока, маринованный корнишон, кунжут'),
  ('SALE-MANAISH_CHEESE_GF',        'Безглютеновое картофельное тесто, смесь трёх сыров, сливочный сыр, кунжут'),
  ('SALE-MANAISH_FALAFEL_GF',       'Безглютеновое картофельное тесто, нут, хумус, оливковое масло extra virgin, смесь специй, кунжут'),
  ('SALE-MANAISH_LAMB_GF',          'Безглютеновое картофельное тесто, баранина травяного откорма, томат, красный лук с сумахом, петрушка, соус тахини, маринованный корнишон, кунжут'),
  ('SALE-MANAISH_PUMPKIN_CHEESE_MIX_GF','Безглютеновое картофельное тесто, карамелизованная тыква, смесь трёх сыров, салат из капусты и моркови, соус тахини, кунжут'),
  ('SALE-MANAISH_SALAMI_GF',        'Безглютеновое картофельное тесто, говяжья салями, смесь трёх сыров, домашняя паста чили, салат айсберг, горчица, кунжут'),
  ('SALE-MANAISH_ZAATAR_GF',        'Безглютеновое картофельное тесто, оливковое масло extra virgin, заатар (тимьян, сумах, кунжут), кунжут'),
  ('SALE-MATCHA_ICED_DIRTY',        'Эспрессо, молоко, японская матча, лёд'),
  ('SALE-MATCHA_ICED_LATTE',        'Молоко, японская матча, лёд'),
  ('SALE-MATCHA_LATTE',             'Молоко, японская матча'),
  ('SALE-MATCHA_ORANGE',            'Свежевыжатый апельсиновый сок, японская матча, лёд'),
  ('SALE-MATCHA_PASSION_FRUIT',     'Маракуйя, японская матча, лёд'),
  ('SALE-MUHAMMARA',                'Запечённый красный перец, грецкие орехи, лук, тахини (кунжут), гранатовая патока, томат, оливковое масло extra virgin, паприка, морская соль, петрушка'),
  ('SALE-MUTABAL',                  'Запечённый баклажан, тахини, йогурт, лимон, чеснок'),
  ('SALE-NO_SHELL_COCONUT',         'Молодой кокос (вода и нежная мякоть)'),
  ('SALE-PROTEIN_MEAL_BEEF',        'Кебаб из говядины травяного откорма, лепёшка, петрушка, красный лук с сумахом, хумус, салат из томатов и огурцов, маринованные корнишоны, соус тахини'),
  ('SALE-PROTEIN_MEAL_CHICKEN',     '2 шпажки куриного шиш-таука, лепёшка, петрушка, красный лук с сумахом, хумус, табуле, соус тахини'),
  ('SALE-PROTEIN_MEAL_SHRIMP',      '2 шпажки креветок, лепёшка, коул-слоу, маринованные корнишоны, хумус с запечённой свёклой, соус тахини'),
  ('SALE-PUMPKIN_BEETROOT_FETA',    'Салат айсберг, запечённая тыква, запечённая свёкла, сыр фета, грецкие орехи, вяленая клюква'),
  ('SALE-SALAD_THAI_NOODLE',        'Лапша ширатаки из конжака, заправка на арахисовой пасте, капуста, морковь, дайкон, эдамаме, жареный арахис, кинза, кунжут'),
  ('SALE-SAUCE_HUMMUS',             'Нут, тахини, лимон, чеснок'),
  ('SALE-SAUCE_MANGO',              'Манго, сок лайма, свежий имбирь, мёд, рисовый и красный винный уксус, кинза, мята'),
  ('SALE-SAUCE_STRAWBERRY',         'Клубника, оливковое масло extra virgin, мёд, белый уксус, морская соль, чёрный перец'),
  ('SALE-SAUCE_TAHINI_TAMARIND',    'Тахини, яблочный уксус, лимонный сок, кунжут, морская соль'),
  ('SALE-SAUCE_YOGURT_TAHINI',      'Греческий йогурт, тахини, лимон, чеснок, петрушка'),
  ('SALE-SMOKED_SALMON_SALAD',      'Салат айсберг и ромэн, копчёная лососевая форель, яйцо, авокадо, огурец, красный лук, укроп'),
  ('SALE-SMOOTHIE_CHOCO_AVO',       'Авокадо, кокосовое молоко, банан, финики, паста из кешью, сырое какао, вода, лёд'),
  ('SALE-SMOOTHIE_CUSTOM',          'Выберите основу (вода, молоко, кокосовое молоко или йогурт), фрукты и добавки'),
  ('SALE-SMOOTHIE_ISLAND_GREEN',    'Банан, киви, шпинат, мята, вода, лёд'),
  ('SALE-SMOOTHIE_MANGO_STRAWBERRY','Манго, клубника, банан, вода, лёд'),
  ('SALE-SMOOTHIE_MATCHA_GREEN',    'Банан, йогурт, миндальное молоко, шпинат, матча, семена чиа, мёд, лёд'),
  ('SALE-SMOOTHIE_MIXED_BERRY',     'Молоко, клубника, банан, голубика, семена чиа, лёд'),
  ('SALE-SMOOTHIE_PASSION_MANGO',   'Манго, маракуйя, вода, лёд'),
  ('SALE-SMOOTHIE_PEACH_APRICOT',   'Персик, абрикос, банан, молоко, нежирный йогурт (без добавленного сахара), миндаль, лёд'),
  ('SALE-SMOOTHIE_PROTEIN_PEACH',   'Персик, банан, молоко, нежирный йогурт (без добавленного сахара), сывороточный протеин, арахисовая паста, лёд'),
  ('SALE-SMOOTHIE_STRAWBERRY_BANANA','Молоко, клубника, банан, семена чиа, лёд'),
  ('SALE-SUMMER_ROLLS_CHICKEN',     'Куриная грудка на гриле, рисовая бумага, рисовая лапша, манго, морковь, огурец, салат баттерхед, мята, кинза, манговый соус'),
  ('SALE-SUMMER_ROLLS_SHRIMP',      'Креветки, рисовая бумага, рисовая лапша, манго, морковь, огурец, салат баттерхед, мята, кинза, манговый соус'),
  ('SALE-SUMMER_ROLLS_TUNA_CORN',   'Тунец, сладкая кукуруза, рисовая бумага, рисовая лапша, манго, морковь, огурец, салат баттерхед, мята, кинза, манговый соус'),
  ('SALE-SUMMER_ROLLS_VEGGIE',      'Рисовая бумага, рисовая лапша, манго, морковь, огурец, салат баттерхед, мята, кинза, манговый соус'),
  ('SALE-TABBOULEH',                'Петрушка, отварная киноа, томат, красный лук, зелёный лук, мята, гранат, заправка с сумахом, лимон'),
  ('SALE-TOAST_CHICKEN_TAWOOK',     'Цельнозерновая лепёшка, курица шиш-таук на гриле, коул-слоу с йогуртом и тахини, хумус, салат айсберг, маринованные корнишоны'),
  ('SALE-TOAST_SALMON_GOAT_CHEESE', 'Хлеб из 19 злаков, гуакамоле, копчёная лососевая форель, козий сыр, укроп, лимон'),
  ('SALE-TOAST_SHRIMP_GUACAMOLE',   'Хлеб из 19 злаков, гуакамоле, креветки, пико-де-гальо, сальса из манго, лимон')
),
r AS (
  SELECT n.id::text AS entity_key, t.txt
  FROM t JOIN public.nomenclature n ON n.product_code = t.product_code
)
INSERT INTO public.content_translations (entity, entity_key, field, lang, value, source_hash)
SELECT 'dish', r.entity_key, 'ingredients', 'ru', to_jsonb(r.txt),
       md5(public.fn_translation_source('dish', r.entity_key, 'ingredients'))
FROM r
WHERE public.fn_translation_source('dish', r.entity_key, 'ingredients') IS NOT NULL
ON CONFLICT (entity, entity_key, field, lang) DO UPDATE
  SET value = EXCLUDED.value, source_hash = EXCLUDED.source_hash,
      reviewed_at = NULL, reviewed_by = NULL;

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES ('449_ru_translations_dish_ingredients.sql', 'claude-opus-session-6699d2ee', NULL,
  'RU ingredient lists for 80 live dishes, allergen clauses literal (MC f91194f7)')
ON CONFLICT DO NOTHING;

COMMIT;
