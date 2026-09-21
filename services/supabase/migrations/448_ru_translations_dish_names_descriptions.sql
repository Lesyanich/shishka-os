-- 448_ru_translations_dish_names_descriptions.sql
-- Russian dish names (all 86 live dishes) + the 30 descriptions that had no RU yet
-- (drinks: coffee, matcha, smoothies, juices). MC f91194f7, table from mig 446.
-- Translated offline in-session. Rows are keyed by product_code here for readability and
-- resolved to nomenclature.id; source_hash = md5 of the current EN (fresh on insert).
--
-- Naming rule (CEO 2026-09-21): Middle-Eastern / brand names are transliterated
-- (манакиш, табуле, фаттуш, мухаммара, мутабаль, шиш-таук, заатар, матча), descriptive
-- names are translated. Emoji prefixes mirror the EN; the site strips them anyway.
-- Description writes also land in nomenclature.customer_description_ru via the mig 446 mirror,
-- so the A4 print menu picks them up too.
--
-- CONTRACT-REVIEWED: data-only. Inserts into content_translations; the mirror writes only
-- customer_description_ru (never EN, price or visibility).

BEGIN;

WITH t(product_code, field, txt) AS (VALUES
  -- names -------------------------------------------------------------------------------------
  ('SALE-TABBOULEH',                   'name', 'Табуле «Энергия зелени»'),
  ('SALE-FATTOUSH',                    'name', 'Фаттуш «Зелёный хруст»'),
  ('SALE-CAESAR_CHICKEN',              'name', 'Цезарь с курицей'),
  ('SALE-GREEK_SALAD',                 'name', 'Греческий салат'),
  ('SALE-CAESAR_SHRIMP',               'name', 'Цезарь с креветками'),
  ('SALE-SMOKED_SALMON_SALAD',         'name', '«Роза» с копчёным лососем'),
  ('SALE-PUMPKIN_BEETROOT_FETA',       'name', 'Тыква и корнеплоды'),
  ('SALE-CUP_TOFU_CHICKPEA',           'name', 'Тофу и нут «Сила растений»'),
  ('SALE-SALAD_THAI_NOODLE',           'name', 'Тайская лапша «Энергия»'),
  ('SALE-CUP_SHRIMP_CRAB_SEAWEED',     'name', '«Океан»: краб, креветки и водоросли'),
  ('SALE-BOWL_MANGO_SALMON_TUNA',      'name', 'Тропический боул: манго, лосось и тунец'),
  ('SALE-HUMMUS_TAWOOK',               'name', 'Хумус «Протеиновый заряд»'),
  ('SALE-CHICKEN_MEXICAN_SALAD',       'name', 'Настоящий мексиканский боул'),
  ('SALE-TOAST_CHICKEN_TAWOOK',        'name', 'Протеиновый ролл с курицей таук'),
  ('SALE-TOAST_KEBAB',                 'name', 'Кебаб из говядины с хумусом'),
  ('SALE-SUMMER_ROLLS_CHICKEN',        'name', 'Роллы в рисовой бумаге с курицей'),
  ('SALE-SUMMER_ROLLS_SHRIMP',         'name', 'Роллы в рисовой бумаге с креветками'),
  ('SALE-SUMMER_ROLLS_VEGGIE',         'name', 'Овощные роллы в рисовой бумаге'),
  ('SALE-SUMMER_ROLLS_TUNA_CORN',      'name', 'Роллы в рисовой бумаге с тунцом и кукурузой'),
  ('SALE-PROTEIN_MEAL_CHICKEN',        'name', 'Шиш-таук из курицы с табуле'),
  ('SALE-PROTEIN_MEAL_BEEF',           'name', 'Кебаб из говядины травяного откорма'),
  ('SALE-PROTEIN_MEAL_SHRIMP',         'name', 'Креветки на гриле с коул-слоу'),
  ('SALE-SAUCE_TAHINI_TAMARIND',       'name', 'Заправка с тахини'),
  ('SALE-SAUCE_YOGURT_TAHINI',         'name', 'Йогуртовый соус с тахини'),
  ('SALE-SAUCE_MANGO',                 'name', 'Манговый соус'),
  ('SALE-SAUCE_HUMMUS',                'name', 'Соус хумус'),
  ('SALE-SAUCE_STRAWBERRY',            'name', 'Клубничная заправка'),
  ('SALE-HUMMUS_BEETROOT',             'name', 'Хумус с запечённой свёклой'),
  ('SALE-HUMMUS_PLAIN',                'name', 'Хумус'),
  ('SALE-MUHAMMARA',                   'name', 'Копчёный перец и грецкий орех · мухаммара'),
  ('SALE-MUTABAL',                     'name', 'Дип из копчёного баклажана · мутабаль'),
  ('SALE-BRK_EGGS_YOUR_WAY',           'name', 'Яйца на ваш вкус'),
  ('SALE-BRK_CHEESE_EGG',              'name', 'Расплавленный сыр и яйцо'),
  ('SALE-BRK_GUACAMOLE_EGG',           'name', 'Гуакамоле и яйцо'),
  ('SALE-BRK_DOUBLE_PROTEIN',          'name', 'Двойной протеин'),
  ('SALE-TOAST_SHRIMP_GUACAMOLE',      'name', 'Тост с креветками и гуакамоле'),
  ('SALE-TOAST_SALMON_GOAT_CHEESE',    'name', 'Тост с копчёным лососем'),
  ('SALE-MANAISH_ZAATAR_GF',           'name', 'Заатар'),
  ('SALE-MANAISH_CHEESE_GF',           'name', '6 сыров'),
  ('SALE-MANAISH_FALAFEL_GF',          'name', 'Фалафель'),
  ('SALE-MANAISH_PUMPKIN_CHEESE_MIX_GF','name', 'Тыква'),
  ('SALE-MANAISH_LAMB_GF',             'name', 'Баранина'),
  ('SALE-MANAISH_BEEF_GF',             'name', 'Говядина'),
  ('SALE-MANAISH_SALAMI_GF',           'name', 'Салями'),
  ('SALE-TOAST_19GRAIN_1',             'name', 'Мультизерновой тост (1 ломтик)'),
  ('SALE-WRAP_WHOLEGRAIN',             'name', 'Цельнозерновая лепёшка (1 шт.)'),
  ('SALE-CHOC_DARK_70',                'name', 'Тёмный шоколад 70%, 100 г'),
  ('SALE-CHOC_DARK_70_ALMOND',         'name', 'Тёмный шоколад 70% с жареным миндалём, 100 г'),
  ('SALE-CHOC_COCONUT_SQ',             'name', 'Кокосовый квадрат'),
  ('SALE-CHOC_PREACTIVE_SQ',           'name', 'Энергетический квадрат перед тренировкой'),
  ('SALE-CHOC_HIGH_COCOA_MILK',        'name', 'Молочный шоколад с высоким содержанием какао, 100 г'),
  ('SALE-CHOC_RECOVERY_SQ',            'name', 'Веганский квадрат после тренировки'),
  ('SALE-COFFEE_ORANGE',               'name', '🍊 Апельсиновый кофе'),
  ('SALE-COFFEE_ICED_AMERICANO',       'name', '🧊 Айс американо'),
  ('SALE-COFFEE_CARAMEL_LATTE',        'name', '🍮 Карамельный латте'),
  ('SALE-COFFEE_ICED_CARAMEL_LATTE',   'name', '🧊 Айс карамельный латте'),
  ('SALE-COFFEE_PASSION_FRUIT',        'name', 'Кофе с маракуйей'),
  ('SALE-COFFEE_ESPRESSO_TONIC',       'name', '🥤 Эспрессо-тоник'),
  ('SALE-COFFEE_LATTE',                'name', '🥛 Латте'),
  ('SALE-COFFEE_CAPPUCCINO',           'name', '🫧 Капучино'),
  ('SALE-COFFEE_ICED_LATTE',           'name', '🧊 Айс латте'),
  ('SALE-COFFEE_ICED_CAPPUCCINO',      'name', '🧊 Айс капучино'),
  ('SALE-COFFEE_AMERICANO',            'name', '☕ Американо'),
  ('SALE-COFFEE_ESPRESSO',             'name', '⚡ Эспрессо'),
  ('SALE-SMOOTHIE_CHOCO_AVO',          'name', 'Смузи шоколад-авокадо'),
  ('SALE-SMOOTHIE_PROTEIN_PEACH',      'name', 'Протеиновый персиковый смузи'),
  ('SALE-SMOOTHIE_PEACH_APRICOT',      'name', 'Смузи персик-абрикос'),
  ('SALE-SMOOTHIE_MIXED_BERRY',        'name', 'Ягодный смузи'),
  ('SALE-SMOOTHIE_ISLAND_GREEN',       'name', 'Смузи «Зелёный лёд»'),
  ('SALE-SMOOTHIE_PASSION_MANGO',      'name', 'Смузи маракуйя-манго'),
  ('SALE-SMOOTHIE_STRAWBERRY_BANANA',  'name', 'Смузи клубника-банан'),
  ('SALE-SMOOTHIE_MANGO_STRAWBERRY',   'name', 'Смузи манго-клубника'),
  ('SALE-SMOOTHIE_CUSTOM',             'name', 'Смузи на ваш выбор (соберите сами)'),
  ('SALE-JUICE_ORANGE',                'name', 'Свежевыжатый апельсиновый сок'),
  ('SALE-JUICE_PINEAPPLE',             'name', 'Свежевыжатый ананасовый сок'),
  ('SALE-NO_SHELL_COCONUT',            'name', 'Кокос без скорлупы'),
  ('SALE-JUICE_GLOW',                  'name', 'Сок «Сияние» (морковь, апельсин, имбирь, куркума)'),
  ('SALE-JUICE_CARROT',                'name', 'Свежевыжатый морковный сок'),
  ('SALE-JUICE_GUAVA',                 'name', 'Свежевыжатый сок гуавы'),
  ('SALE-JUICE_ORANGE_CARROT',         'name', 'Свежевыжатый сок: апельсин и морковь'),
  ('SALE-SMOOTHIE_MATCHA_GREEN',       'name', 'Зелёный смузи с матчей'),
  ('SALE-MATCHA_ORANGE',               'name', '🍊 Апельсиновая матча'),
  ('SALE-MATCHA_PASSION_FRUIT',        'name', 'Матча с маракуйей'),
  ('SALE-MATCHA_LATTE',                'name', 'Горячий матча-латте'),
  ('SALE-MATCHA_ICED_DIRTY',           'name', 'Айс дёрти матча (с эспрессо)'),
  ('SALE-MATCHA_ICED_LATTE',           'name', 'Айс матча-латте'),

  -- descriptions that had no RU ------------------------------------------------------------------
  ('SALE-COFFEE_AMERICANO', 'description',
   'Чистый, насыщенный шот спешелти-эспрессо, разбавленный горячей водой, — яркий, мягкий и без сахара.'),
  ('SALE-COFFEE_CAPPUCCINO', 'description',
   'Спешелти-эспрессо под плотным облаком бархатной молочной пены — классика, баланс и уют. По желанию — на кокосовом молоке.'),
  ('SALE-COFFEE_CARAMEL_LATTE', 'description',
   'Наш спешелти-эспрессо и шелковистое вспененное молоко с порцией карамельного сиропа — мягко, сладко и уютно. По желанию — на кокосовом молоке.'),
  ('SALE-COFFEE_ESPRESSO', 'description',
   'Насыщенный, интенсивный шот нашего спешелти-эспрессо Boncafe — чистый, ароматный и бодрящий. Идеально, чтобы взбодриться.'),
  ('SALE-COFFEE_ESPRESSO_TONIC', 'description',
   'Наш фирменный освежающий напиток: шот эспрессо поверх игристого тоника со льдом — горьковато-сладкий, шипучий и неожиданно яркий.'),
  ('SALE-COFFEE_ICED_AMERICANO', 'description',
   'Чистый, насыщенный шот спешелти-эспрессо, разбавленный холодной водой, со льдом — яркий, мягкий и без сахара.'),
  ('SALE-COFFEE_ICED_CAPPUCCINO', 'description',
   'Наш капучино со льдом — крепкий эспрессо и холодная молочная пена, освежающе мягкий. По желанию — на кокосовом молоке.'),
  ('SALE-COFFEE_ICED_CARAMEL_LATTE', 'description',
   'Наш спешелти-эспрессо с холодным молоком, льдом и порцией карамельного сиропа — мягко, сладко и освежающе. По желанию — на кокосовом молоке.'),
  ('SALE-COFFEE_ICED_LATTE', 'description',
   'Охлаждённый спешелти-эспрессо поверх холодного молока со льдом — мягкий, нежный и освежающий. По желанию — на кокосовом молоке.'),
  ('SALE-COFFEE_LATTE', 'description',
   'Наш спешелти-эспрессо в шелковистом вспененном молоке — мягкий, сливочный и уютный. По желанию — на кокосовом молоке.'),
  ('SALE-COFFEE_ORANGE', 'description',
   'Наш яркий фирменный напиток: двойной шот спешелти-эспрессо поверх свежевыжатого апельсинового сока со льдом и долькой свежего апельсина — цитрусовый, бодрящий и неожиданно затягивающий.'),
  ('SALE-COFFEE_PASSION_FRUIT', 'description',
   'Наш тропический твист: двойной шот спешелти-эспрессо поверх кисловатой маракуйи со льдом, сверху — мякоть свежей маракуйи. Ярко, свежо, с приятной кислинкой.'),
  ('SALE-JUICE_GUAVA', 'description',
   'Спелая гуава холодного отжима — ароматная, тропическая и богатая витамином C. 100% фрукты, без добавленного сахара.'),
  ('SALE-JUICE_PINEAPPLE', 'description',
   'Спелый ананас холодного отжима — яркий, сочный и освежающе кисловатый. 100% фрукты, без добавленного сахара.'),
  ('SALE-MATCHA_ICED_DIRTY', 'description',
   'Японская матча каменного помола встречается с шотом эспрессо на льду — землистый, насыщенный вкус, много антиоксидантов и прохлада одновременно.'),
  ('SALE-MATCHA_ICED_LATTE', 'description',
   'Японская матча церемониального качества, взбитая и налитая на лёд с холодным молоком и каплей мёда, — освежает, мягкая и спокойно бодрит. По желанию — на кокосовом молоке.'),
  ('SALE-MATCHA_LATTE', 'description',
   'Японская матча церемониального качества, взбитая с шелковистым вспененным молоком, — мягкая, травянисто-сладкая и спокойно бодрит. По желанию — на кокосовом молоке.'),
  ('SALE-MATCHA_ORANGE', 'description',
   'Японская матча каменного помола поверх свежевыжатого апельсинового сока со льдом — яркая, цитрусовая, без молочных продуктов и с природными антиоксидантами.'),
  ('SALE-MATCHA_PASSION_FRUIT', 'description',
   'Японская матча каменного помола поверх кисловатой маракуйи со льдом — тропическая, яркая и освежающая, без молочных продуктов и богатая антиоксидантами.'),
  ('SALE-NO_SHELL_COCONUT', 'description',
   'Целый молодой кокос, свежеочищенный и с трубочкой, — чистая кокосовая вода и нежная мякоть. Ничего лишнего.'),
  ('SALE-SMOOTHIE_CHOCO_AVO', 'description',
   'Бархатный авокадо и нежное кокосовое молоко с бананом, сырым какао и капелькой фиников — насыщенное шоколадное лакомство, в котором на самом деле только полезные жиры и клетчатка. Без молочных продуктов и добавленного сахара.'),
  ('SALE-SMOOTHIE_CUSTOM', 'description',
   'Соберите сами: выберите основу, фрукты и добавки для своего идеального смузи — взбиваем при вас. Калории пересчитываются по мере выбора.'),
  ('SALE-SMOOTHIE_ISLAND_GREEN', 'description',
   'Яркий тропический микс из банана, кисловатого киви и шпината с прохладной свежей мятой — освежает, заряжает витаминами и натурально сладкий. Без молочных продуктов.'),
  ('SALE-SMOOTHIE_MANGO_STRAWBERRY', 'description',
   'Спелое манго и сочная клубника с бананом — только фрукты, натуральная сладость, без добавленного сахара. Без молочных продуктов.'),
  ('SALE-SMOOTHIE_MATCHA_GREEN', 'description',
   'Зелёный заряд из японской матчи, спелого банана и шпината, взбитых до кремовой текстуры с йогуртом и миндальным молоком. Сверху — семена чиа и капля мёда: много антиоксидантов, лёгкая сладость и естественная бодрость.'),
  ('SALE-SMOOTHIE_MIXED_BERRY', 'description',
   'Клубника, голубика и банан с семенами чиа — много антиоксидантов, нежно и полезно. Ягодный заряд в каждом глотке.'),
  ('SALE-SMOOTHIE_PASSION_MANGO', 'description',
   'Ароматное манго и кисловатая маракуйя — яркий тропический дуэт, только фрукты и натуральная сладость. Без молочных продуктов.'),
  ('SALE-SMOOTHIE_PEACH_APRICOT', 'description',
   'Нежный персик и абрикос с бананом, сливочным йогуртом и миндалём — мягко, слегка сладко, без добавленного сахара.'),
  ('SALE-SMOOTHIE_PROTEIN_PEACH', 'description',
   'Наш герой после тренировки: персик и банан с сывороточным протеином, йогуртом и арахисовой пастой — много белка, натуральная сладость и настоящая сытость.'),
  ('SALE-SMOOTHIE_STRAWBERRY_BANANA', 'description',
   'Вечная классика — сладкая клубника и спелый банан с семенами чиа. Нежно, полезно и нравится всем, от мала до велика.')
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

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES ('448_ru_translations_dish_names_descriptions.sql', 'claude-opus-session-6699d2ee', NULL,
  'RU dish names (86) + 30 missing RU descriptions (drinks); descriptions mirror to customer_description_ru (MC f91194f7)')
ON CONFLICT DO NOTHING;

COMMIT;
