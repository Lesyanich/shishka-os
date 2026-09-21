-- 450_ru_descriptions_restore_allergen_clauses.sql
-- Restore the "Contains …" allergen clauses (and the chocolate nutrition disclaimer) that the
-- mig 425 RU descriptions left out. MC f91194f7.
--
-- WHY: the 425 translations were written for the printed A4 menu, which prints its own CONTAINS
-- line and so dropped the clause from the prose. On shishka.health the description IS the text
-- a guest reads — a RU description without "Contains peanuts" (After Workout Square) silently
-- drops an anaphylaxis-grade warning that the EN carries. The RU must say everything the EN says.
-- Also fixes one mistranslation: Mutabal is finished "in a stone bowl", not a mortar.
--
-- SIDE EFFECT (accepted): via the mig 446 mirror these texts land in
-- nomenclature.customer_description_ru, so the A4 generator (design/menu-a4, unmerged) will print
-- the clause in the RU prose AND its own CONTAINS line. Duplicate allergen info on paper is the
-- safe failure; a missing one on the web is not. Flagged on MC f91194f7.
--
-- CONTRACT-REVIEWED: data-only upserts into content_translations; the mirror writes only
-- customer_description_ru.

BEGIN;

WITH t(product_code, txt) AS (VALUES
  ('SALE-BOWL_MANGO_SALMON_TUNA',
   'Тунец и лосось сашими-качества на жасминовом рисе со спелым манго, авокадо и приправленной вакаме — самая щедрая чаша в меню и единственная на сырой рыбе. Содержит рыбу, кунжут и сою.'),
  ('SALE-BRK_CHEESE_EGG',
   'Три яйца, размятые с расплавленным трио сыров, на поджаренном хлебе из 19 злаков, с огурцом, томатом и оливковым маслом — 41 грамм белка и самое уютное блюдо завтрака. Содержит молочные продукты, яйца и глютен.'),
  ('SALE-BRK_DOUBLE_PROTEIN',
   'Три размятых яйца поверх нежного хумуса на поджаренном хлебе из 19 злаков, с кунжутом, оливковым маслом, свежим огурцом и томатом — яйца и нут вместе дают 35 граммов белка. Содержит молочные продукты, яйца, глютен и кунжут.'),
  ('SALE-BRK_EGGS_YOUR_WAY',
   'Три яйца, пожаренные как вам нравится, на поджаренном хлебе из 19 злаков с огурцом и томатом, плюс свободный доступ к овощному бару — просто, быстро и 30 граммов белка. Содержит яйца, глютен и молочные продукты.'),
  ('SALE-BRK_GUACAMOLE_EGG',
   'Три размятых яйца на поджаренном хлебе из 19 злаков под густым слоем гуакамоле из авокадо с лаймом и кинзой, с огурцом и томатом — полезные жиры, 31 грамм белка и сытость до обеда. Содержит молочные продукты, яйца и глютен.'),
  ('SALE-CHOC_COCONUT_SQ',
   'Насыщенный тёмный шоколад 70% со сладким сливочным кокосом. Из тайского какао и тайского кокоса. Два квадратика в коробке. Сделано Barada Chocolate, Пхукет. Пищевая ценность рассчитана по составу, лабораторно не проверялась.'),
  ('SALE-CHOC_PREACTIVE_SQ',
   'Сбалансированная смесь овса, арахиса, мёда, кокоса и миндаля в насыщенном тёмном шоколаде 70%. Ровная природная энергия перед любой тренировкой. Два квадратика в коробке. Сделано Barada Chocolate, Пхукет. Пищевая ценность рассчитана по составу, лабораторно не проверялась.'),
  ('SALE-CHOC_RECOVERY_SQ',
   'Финики, хрустящий миндаль, нежная тахини, тыквенные и подсолнечные семечки в насыщенном тёмном шоколаде 100%. Питательный перекус после тренировки. Веганский. Содержит арахис. Два квадратика в коробке. Сделано Barada Chocolate, Пхукет. Пищевая ценность рассчитана по составу, лабораторно не проверялась.'),
  ('SALE-CUP_SHRIMP_CRAB_SEAWEED',
   'Креветки с лава-гриля и крабовые палочки на киноа с приправленной вакаме, сладкой кукурузой и тонко нарезанной капустой — самая лёгкая чаша в меню, 119 калорий. Содержит ракообразных, моллюсков, рыбу, глютен, кунжут и сою.'),
  ('SALE-CUP_TOFU_CHICKPEA',
   'Обжаренный плотный тофу и нут на киноа с карамелизованной тыквой, авокадо и салатом грин оук — полностью растительная и самая выгодная чаша в меню. Содержит кунжут и сою.'),
  ('SALE-MUTABAL',
   'Дымные баклажаны с углей, смешанные с тахини, йогуртом, свежим лимоном и чесноком — деревенский, насыщенный и кремовый вкус, доводится вручную в каменной миске. Содержит молочные продукты и кунжут.'),
  ('SALE-PROTEIN_MEAL_BEEF',
   'Два шампура пряного кебаба из говядины травяного откорма на тёплой лепёшке с петрушкой и красным луком в сумахе, с нежным хумусом, салатом из томатов и огурцов и соусом тахини — 58 г белка на одной тарелке. Салат или хумус можно бесплатно заменить на мини-фаттуш, мини-табуле, рис, бурый рис, печёный картофель или гречку. Содержит глютен, горчицу и кунжут.'),
  ('SALE-PROTEIN_MEAL_CHICKEN',
   'Два шампура курицы шиш-таук на тёплой лепёшке с петрушкой и красным луком в сумахе, нежный хумус, порция табуле и соус тахини — 62 г белка на одной тарелке. Салат или хумус можно бесплатно заменить на мини-фаттуш, мини-табуле, рис, бурый рис, печёный картофель или гречку. Содержит глютен и кунжут.'),
  ('SALE-PROTEIN_MEAL_SHRIMP',
   'Два шампура креветок гриль на тёплой лепёшке с капустным салатом на йогурте и тахини, хумус с запечённой свёклой, корнишоны и соус тахини — 45 г белка и самое лёгкое из белковых блюд. Капустный салат или хумус можно бесплатно заменить на мини-фаттуш, мини-табуле, рис, бурый рис, печёный картофель или гречку. Содержит глютен, молоко, кунжут и моллюсков.'),
  ('SALE-PUMPKIN_BEETROOT_FETA',
   'Карамелизованная запечённая тыква и сладкая свёкла на хрустящем айсберге с нежной фетой, обжаренными грецкими орехами и вяленой клюквой — землистый, яркий и натурально сладкий вкус. Содержит молочные продукты и орехи.'),
  ('SALE-SALAD_THAI_NOODLE',
   'Лапша ширатаки из конжака в арахисовой заправке с имбирём и чесноком, с тонко нарезанной капустой, дайконом и морковью, с жареным арахисом и кинзой — лапша без углеводов под по-настоящему насыщенным соусом. Содержит глютен, арахис, кунжут и сою.')
),
r AS (
  SELECT n.id::text AS entity_key, t.txt
  FROM t JOIN public.nomenclature n ON n.product_code = t.product_code
)
INSERT INTO public.content_translations (entity, entity_key, field, lang, value, source_hash)
SELECT 'dish', r.entity_key, 'description', 'ru', to_jsonb(r.txt),
       md5(public.fn_translation_source('dish', r.entity_key, 'description'))
FROM r
WHERE public.fn_translation_source('dish', r.entity_key, 'description') IS NOT NULL
ON CONFLICT (entity, entity_key, field, lang) DO UPDATE
  SET value = EXCLUDED.value, source_hash = EXCLUDED.source_hash,
      reviewed_at = NULL, reviewed_by = NULL;

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES ('450_ru_descriptions_restore_allergen_clauses.sql', 'claude-opus-session-6699d2ee', NULL,
  'RU descriptions: restore the Contains clauses + nutrition disclaimer dropped by mig 425 (16 dishes); fix Mutabal stone bowl (MC f91194f7)')
ON CONFLICT DO NOTHING;

COMMIT;
