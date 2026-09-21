-- 452_ru_wraps_spring_rolls_wording.sql
-- CEO corrections (2026-09-21, MC f91194f7). 1) «Белковые блюда» → «Протеиновые блюда». 2) In Russia «роллы» means sushi rolls. Russian menus call
-- rice-paper rolls «спринг-роллы» and tortilla wraps «врапы». Fixes the section/category names,
-- the 5 affected dish names and the 4 rice-paper descriptions from migs 447/448.
-- EN is unchanged, so source_hash stays as is (rows remain fresh). Description writes also reach
-- nomenclature.customer_description_ru via the mig 446 mirror (A4 print menu).
--
-- CONTRACT-REVIEWED: data-only updates of content_translations.

BEGIN;

WITH t(entity, entity_key, field, txt) AS (VALUES
  ('category', 'cda9f4a1-e6a6-493b-bc9d-6da30565cca0', 'name', '🌯 Врапы'),
  ('category', 'fb58763a-1e64-4da3-b040-839eb22af81e', 'name', '🍃 Спринг-роллы'),
  ('category', 'f9a0abe8-88a9-4093-b669-4bc1debdf8a1', 'name', '🫓 В тортилье'),
  ('category', 'e79b447c-ec23-4eb6-b17d-a5183ddb815c', 'name', '🍢 Протеиновые блюда'),
  ('dish', 'd3a7fe21-e6d1-42b4-a59b-9ba6d5781464', 'name', 'Протеиновый врап с курицей таук'),
  ('dish', '3f4dc520-a1ba-46dc-91a7-e55ba976c646', 'name', 'Спринг-роллы с курицей'),
  ('dish', '1573295f-c5a4-44fb-b9fd-d2659f99a104', 'name', 'Спринг-роллы с креветками'),
  ('dish', 'd691b4fb-c0d4-4bea-8a86-5363f32dd5a4', 'name', 'Овощные спринг-роллы'),
  ('dish', '3dc7416d-6a99-451e-aa78-2738b1cb7ee2', 'name', 'Спринг-роллы с тунцом и кукурузой'),
  ('dish', '3f4dc520-a1ba-46dc-91a7-e55ba976c646', 'description',
   'Спринг-роллы в рисовой бумаге с курицей су-вид, рисовой лапшой, свежими травами, манго и хрустящими овощами — с манговым соусом.'),
  ('dish', '1573295f-c5a4-44fb-b9fd-d2659f99a104', 'description',
   'Спринг-роллы в рисовой бумаге с припущенными креветками, рисовой лапшой, свежими травами, манго и хрустящими овощами — с манговым соусом.'),
  ('dish', 'd691b4fb-c0d4-4bea-8a86-5363f32dd5a4', 'description',
   'Спринг-роллы в рисовой бумаге со свежими овощами, манго, рисовой лапшой и травами — с манговым соусом.'),
  ('dish', '3dc7416d-6a99-451e-aa78-2738b1cb7ee2', 'description',
   'Спринг-роллы в рисовой бумаге с тунцом, сладкой кукурузой, рисовой лапшой, свежими травами и манго — с манговым соусом.'),
  ('dish', 'd3a7fe21-e6d1-42b4-a59b-9ba6d5781464', 'description',
   'Маринованная курица шиш-таук с гриля, капустный салат с йогуртом и тахини, листья салата и хумус в цельнозерновой тортилье, обжаренной на гриле. Корнишоны отдельно.')
)
UPDATE public.content_translations c
SET value = to_jsonb(t.txt), reviewed_at = NULL, reviewed_by = NULL
FROM t
WHERE c.entity = t.entity AND c.entity_key = t.entity_key AND c.field = t.field AND c.lang = 'ru';

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES ('452_ru_wraps_spring_rolls_wording.sql', 'claude-opus-session-6699d2ee', NULL,
  'RU: роллы → спринг-роллы (rice paper) / врапы (tortilla) per CEO; 4 categories (+ Протеиновые блюда), 5 names, 5 descriptions (MC f91194f7)')
ON CONFLICT DO NOTHING;

COMMIT;
