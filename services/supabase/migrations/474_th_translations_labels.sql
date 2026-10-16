-- 474_th_translations_labels.sql
-- Thai labels: categories, allergen tags, modifier groups/options, site copy (MC f91194f7).
--
-- Tag names are imported from tags.name_th (curated earlier); categories reuse
-- product_categories.name_th where it still matches the English, and are translated where the
-- English was renamed since (Extras, Whole Wheat Wraps) or no Thai existed.
--
-- Dish NAMES are not translated in any language (mig 473a) — the guest orders by the name the
-- till shows. Thai descriptions and ingredient lists follow in 475-477.
--
-- APPLIED to prod 2026-10-16 as `467_th_translations_labels.sql`; renumbered to 474 here because
-- 467 was taken by a parallel session the same hour. migration_log is corrected in mig 479.
--
-- CONTRACT-REVIEWED: data-only inserts into content_translations.

BEGIN;

WITH c(entity_key, txt) AS (VALUES
  ('4017ae91-baad-468d-8667-75e74467fd28', '☕ กาแฟ'),
  ('cda9f4a1-e6a6-493b-bc9d-6da30565cca0', '🌯 แรปโฮลวีต'),
  ('fb58763a-1e64-4da3-b040-839eb22af81e', '🍃 ปอเปี๊ยะสด'),
  ('e187f37e-3b17-451a-baa2-c73fe1b35d48', '🍜 โบว์ล'),
  ('e79b447c-ec23-4eb6-b17d-a5183ddb815c', '🍢 เมนูโปรตีน'),
  ('3cd6c1cf-89d4-45c7-a4c0-92cf47676f2f', '🍫 ช็อกโกแลต'),
  ('f8e8aa0d-e549-42d7-bf5b-de70c2f9cbbb', '🍳 อาหารเช้าทั้งวัน'),
  ('c1181117-e67e-4563-aa8b-8c42dd09bb61', '🍳 ไข่'),
  ('53412569-b9ad-46fa-9b96-8ad02a074980', '🍵 มัทฉะ'),
  ('1675790d-6198-425d-8bbe-0051a3347c6e', '🍽️ ของเพิ่มเติม'),
  ('f8fc367e-f8da-4aa9-a2a5-c19f991a31ca', '🥗 สลัด'),
  ('e1820bb8-7c12-457f-9cd1-7c42ae97e7a1', '🥤 สมูทตี้'),
  ('4c1cda8b-7ba5-4535-b258-32add856c300', '🥪 ขนมปังปิ้ง'),
  ('ce2f9959-92af-4985-a2c1-270626fd02ad', '🥫 ซอส น้ำสลัด และดิป'),
  ('7ed1ef53-f781-43da-ba37-684009a16fed', '🧃 น้ำผลไม้')
)
INSERT INTO public.content_translations (entity, entity_key, field, lang, value, source_hash)
SELECT 'category', c.entity_key, 'name', 'th', to_jsonb(c.txt),
       md5(public.fn_translation_source('category', c.entity_key, 'name'))
FROM c
WHERE public.fn_translation_source('category', c.entity_key, 'name') IS NOT NULL
ON CONFLICT (entity, entity_key, field, lang) DO UPDATE
  SET value = EXCLUDED.value, source_hash = EXCLUDED.source_hash, reviewed_at = NULL, reviewed_by = NULL;

-- Allergen tags: straight from the curated tags.name_th.
INSERT INTO public.content_translations (entity, entity_key, field, lang, value, source_hash)
SELECT 'tag', t.slug, 'name', 'th', to_jsonb(t.name_th), md5(t.name)
FROM tags t
WHERE t.name_th IS NOT NULL AND t.name_th <> '' AND t.name IS NOT NULL
  AND t.id IN (SELECT tag_id FROM nomenclature_tags WHERE nomenclature_id IN (SELECT id FROM menu_public))
ON CONFLICT (entity, entity_key, field, lang) DO UPDATE
  SET value = EXCLUDED.value, source_hash = EXCLUDED.source_hash, reviewed_at = NULL, reviewed_by = NULL;

WITH m(entity, entity_key, txt) AS (VALUES
  ('modifier_group', 'Base Upgrade (from Milk)',   'เปลี่ยนเบส (จากนม)'),
  ('modifier_group', 'Base Upgrade (from Water)',  'เปลี่ยนเบส (จากน้ำ)'),
  ('modifier_group', 'Base Upgrade (from Yogurt)', 'เปลี่ยนเบส (จากโยเกิร์ต)'),
  ('modifier_group', 'Boosters',                   'ตัวเสริม'),
  ('modifier_group', 'Coffee Boosters',            'ตัวเสริมสำหรับกาแฟ'),
  ('modifier_group', 'Extra Fruit',                'เพิ่มผลไม้'),
  ('modifier_group', 'Milk',                       'นม'),
  ('modifier_group', 'Nuts, Seeds & Butters',      'ถั่ว เมล็ดพืช และเนยถั่ว'),
  ('modifier_group', 'Pick Fruits',                'เลือกผลไม้'),
  ('modifier_group', 'Served with bread',          'เสิร์ฟพร้อมขนมปัง'),
  ('modifier_group', 'Temperature',                'อุณหภูมิ'),
  ('modifier_group', 'Temperature +10',            'อุณหภูมิ (+10)'),
  ('modifier_option', 'Add Cashew Butter (15g)',  'เนยมะม่วงหิมพานต์ (15 ก.)'),
  ('modifier_option', 'Add Peanut Butter (15g)',  'เนยถั่วลิสง (15 ก.)'),
  ('modifier_option', 'Almond Milk',              'นมอัลมอนด์'),
  ('modifier_option', 'Almond Slices',            'อัลมอนด์สไลซ์'),
  ('modifier_option', 'Apricot',                  'แอปริคอต'),
  ('modifier_option', 'Avocado',                  'อะโวคาโด'),
  ('modifier_option', 'Banana',                   'กล้วย'),
  ('modifier_option', 'Blueberry',                'บลูเบอร์รี'),
  ('modifier_option', 'Caramel Syrup',            'ไซรัปคาราเมล'),
  ('modifier_option', 'Chia Seeds',               'เมล็ดเจีย'),
  ('modifier_option', 'Coconut Milk',             'นมมะพร้าว'),
  ('modifier_option', 'Cow Milk',                 'นมวัว'),
  ('modifier_option', 'Creatine',                 'ครีเอทีน'),
  ('modifier_option', 'Extra Espresso Shot',      'เพิ่มช็อตเอสเพรสโซ'),
  ('modifier_option', 'Greek Yogurt',             'กรีกโยเกิร์ต'),
  ('modifier_option', 'Hazelnut Syrup',           'ไซรัปเฮเซลนัท'),
  ('modifier_option', 'Hot',                      'ร้อน'),
  ('modifier_option', 'Iced',                     'เย็น'),
  ('modifier_option', 'Kiwi',                     'กีวี'),
  ('modifier_option', 'Mango',                    'มะม่วง'),
  ('modifier_option', 'Maple Syrup',              'ไซรัปเมเปิล'),
  ('modifier_option', 'MCT Oil',                  'น้ำมัน MCT'),
  ('modifier_option', 'Mint Syrup',               'ไซรัปมินต์'),
  ('modifier_option', 'Multigrain Toast',         'ขนมปังโฮลเกรนปิ้ง'),
  ('modifier_option', 'No bread',                 'ไม่เอาขนมปัง'),
  ('modifier_option', 'Oat Milk',                 'นมข้าวโอ๊ต'),
  ('modifier_option', 'Passion Fruit',            'เสาวรส'),
  ('modifier_option', 'Peach',                    'พีช'),
  ('modifier_option', 'Pineapple',                'สับปะรด'),
  ('modifier_option', 'Spinach',                  'ผักโขม'),
  ('modifier_option', 'Strawberry',               'สตรอว์เบอร์รี'),
  ('modifier_option', 'Vanilla Protein',          'โปรตีนวานิลลา'),
  ('modifier_option', 'Vanilla Syrup',            'ไซรัปวานิลลา'),
  ('modifier_option', 'Water',                    'น้ำ'),
  ('modifier_option', 'Whey Protein',             'เวย์โปรตีน'),
  ('modifier_option', 'Wholewheat Wrap',          'แผ่นแรปโฮลวีต')
)
INSERT INTO public.content_translations (entity, entity_key, field, lang, value, source_hash)
SELECT m.entity, m.entity_key, 'name', 'th', to_jsonb(m.txt), md5(m.entity_key)
FROM m
ON CONFLICT (entity, entity_key, field, lang) DO UPDATE
  SET value = EXCLUDED.value, source_hash = EXCLUDED.source_hash, reviewed_at = NULL, reviewed_by = NULL;

-- Site copy. Partial objects merged over the English row; URLs and hours are not repeated.
WITH s(entity_key, val) AS (VALUES
  ('hero', jsonb_build_object(
      'banner', 'อาหารสะอาด',
      'title', 'จริงใจ อร่อย ไม่มีของเทียม',
      'sub', E'ไม่ใช้น้ำมันจากเมล็ดพืช · ไม่ใส่ผงชูรส · ไม่มีอาหารแปรรูปสูง\nใช้วัตถุดิบสดเท่านั้น')),
  ('rule', jsonb_build_object(
      'eyebrow', 'กฎของเรา',
      'lead', 'กินสะอาด รู้สึกดี',
      'items', jsonb_build_array(
        jsonb_build_object('label', 'น้ำมันจากเมล็ดพืช', 'icon', 'seed oils'),
        jsonb_build_object('label', 'มีเมนูปราศจากกลูเตน', 'icon', 'industrial gluten', 'deny', false),
        jsonb_build_object('label', 'อาหารเทียม', 'icon', 'fake food'),
        jsonb_build_object('label', 'วัตถุกันเสีย', 'icon', 'preservatives'),
        jsonb_build_object('label', 'ผงชูรส (MSG)', 'icon', 'msg')))),
  ('cta', jsonb_build_object(
      'eyebrow', 'แวะมาหาเราที่ภูเก็ต',
      'title', 'มาแบบหิว ๆ',
      'sub', 'อาหารจริง ทำสดใหม่ทุกวัน — แวะมาที่ครัวของเราในภูเก็ต',
      'hoursLabel', 'เปิดทุกวัน')),
  ('sectionIntros', jsonb_build_object(
      'Manakish', 'มานาเอิช คือขนมปังแผ่นแบบดั้งเดิมของตะวันออกกลาง เปรียบได้กับพิซซ่าชิ้นเล็กของภูมิภาคนี้ เราทำใหม่ให้ปราศจากกลูเตน บนแป้งมันฝรั่งสูตรของเราเอง'))
)
INSERT INTO public.content_translations (entity, entity_key, field, lang, value, source_hash)
SELECT 'site_content', s.entity_key, 'data', 'th', s.val,
       md5(public.fn_translation_source('site_content', s.entity_key, 'data'))
FROM s
WHERE public.fn_translation_source('site_content', s.entity_key, 'data') IS NOT NULL
ON CONFLICT (entity, entity_key, field, lang) DO UPDATE
  SET value = EXCLUDED.value, source_hash = EXCLUDED.source_hash, reviewed_at = NULL, reviewed_by = NULL;

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES ('474_th_translations_labels.sql', 'claude-opus-session-20399950', NULL,
  'TH: 15 categories, allergen tags imported from tags.name_th, 12 modifier groups + 36 options, 4 site_content blocks (MC f91194f7)')
ON CONFLICT DO NOTHING;

COMMIT;
