-- 476_th_ingredients_part1.sql
-- Thai ingredient lists, part 1 of 2 (MC f91194f7). Item for item, same order as the English,
-- parentheses kept; "Contains …" clauses translated literally (allergen copy).
-- Also fills the two allergen tags that had no tags.name_th (mustard, soy).
--
-- APPLIED to prod 2026-10-16 as `469_th_ingredients_part1.sql`; renumbered here because a
-- parallel session took 469. migration_log is corrected in mig 479.
--
-- CONTRACT-REVIEWED: data-only inserts into content_translations.

BEGIN;

WITH t(product_code, txt) AS (VALUES
  ('SALE-BOWL_MANGO_SALMON_TUNA', 'ข้าวหอมมะลิ แซลมอน ทูน่าเกรดซาชิมิ มะม่วงสุก อะโวคาโด สลัดสาหร่ายวากาเมะ ถั่วแระญี่ปุ่น มะเขือเทศเชอร์รี แตงกวา'),
  ('SALE-BRK_CHEESE_EGG', 'ไข่สามฟอง ชีสละลาย ขนมปัง 19 ธัญพืชปิ้ง ผักจากบาร์ผัก'),
  ('SALE-BRK_DOUBLE_PROTEIN', 'ไข่สามฟอง ฮัมมูส งา ขนมปัง 19 ธัญพืชปิ้ง ผักจากบาร์ผัก'),
  ('SALE-BRK_EGGS_YOUR_WAY', 'ไข่ดาวสามฟอง ขนมปัง 19 ธัญพืชปิ้ง ผักจากบาร์ผักฟรี ชีสหรือแฮมคิดเงินเพิ่ม'),
  ('SALE-BRK_GUACAMOLE_EGG', 'ไข่สามฟอง กัวคาโมเล ขนมปัง 19 ธัญพืชปิ้ง ผักจากบาร์ผัก'),
  ('SALE-CAESAR_CHICKEN', 'ผักกาดแก้ว ไก่ชิชทาวุกย่าง มะเขือเทศเชอร์รี ครูตองสมุนไพร ชีสพาร์เมซาน น้ำสลัดซีซาร์'),
  ('SALE-CAESAR_SHRIMP', 'ผักกาดแก้ว กุ้งย่าง มะเขือเทศเชอร์รี ครูตองสมุนไพร ชีสพาร์เมซาน น้ำสลัดซีซาร์'),
  ('SALE-CHICKEN_MEXICAN_SALAD', 'ผักกาดแก้วและผักกาดคอส กะหล่ำปลีม่วง ไก่ย่าง (หมักทาวุกแดง) กัวคาโมเล ซัลซ่ามะม่วง ปิโกเดอกัลโย ถั่วแดง ข้าวโพดหวาน พริกหวาน แครอท หอมแดง ฮาลาปีโญดอง'),
  ('SALE-CHOC_COCONUT_SQ', 'มะพร้าว นม น้ำผึ้ง ดาร์กช็อกโกแลต 70% มีนม'),
  ('SALE-CHOC_PREACTIVE_SQ', 'ข้าวโอ๊ต ถั่วลิสง น้ำผึ้ง มะพร้าว อัลมอนด์ ดาร์กช็อกโกแลต 70% มีถั่วลิสง อัลมอนด์ และกลูเตน (ข้าวโอ๊ต)'),
  ('SALE-CHOC_RECOVERY_SQ', 'อินทผลัม อัลมอนด์ ตาฮินี เมล็ดฟักทอง ถั่วลิสง เมล็ดทานตะวัน ดาร์กช็อกโกแลต 100% วีแกน มีถั่วลิสง อัลมอนด์ และงา'),
  ('SALE-COFFEE_AMERICANO', 'เอสเพรสโซ น้ำ'),
  ('SALE-COFFEE_CAPPUCCINO', 'เอสเพรสโซ นม'),
  ('SALE-COFFEE_CARAMEL_LATTE', 'เอสเพรสโซ นม ไซรัปคาราเมล'),
  ('SALE-COFFEE_ESPRESSO', 'เอสเพรสโซ'),
  ('SALE-COFFEE_ESPRESSO_TONIC', 'เอสเพรสโซ โทนิก น้ำแข็ง'),
  ('SALE-COFFEE_ICED_AMERICANO', 'เอสเพรสโซ น้ำ น้ำแข็ง'),
  ('SALE-COFFEE_ICED_CAPPUCCINO', 'เอสเพรสโซ นม น้ำแข็ง'),
  ('SALE-COFFEE_ICED_CARAMEL_LATTE', 'เอสเพรสโซ นม ไซรัปคาราเมล น้ำแข็ง'),
  ('SALE-COFFEE_ICED_LATTE', 'เอสเพรสโซ นม น้ำแข็ง'),
  ('SALE-COFFEE_LATTE', 'เอสเพรสโซ นม'),
  ('SALE-COFFEE_ORANGE', 'เอสเพรสโซสองช็อต น้ำส้มคั้นสด น้ำแข็ง ส้มสไลซ์'),
  ('SALE-COFFEE_PASSION_FRUIT', 'เอสเพรสโซสองช็อต เสาวรส น้ำแข็ง'),
  ('SALE-CUP_SHRIMP_CRAB_SEAWEED', 'ควินัวสุก กุ้งย่าง ปูอัด สลัดสาหร่ายวากาเมะ ข้าวโพดหวาน แตงกวา พริกหวาน งา'),
  ('SALE-CUP_TOFU_CHICKPEA', 'ควินัวสุก เต้าหู้แข็งทอดกรอบ ถั่วลูกไก่ ฟักทองอบ อะโวคาโด ผักกรีนโอ๊ค งา'),
  ('SALE-FATTOUSH', 'ผักกาดแก้วและผักกาดคอส กะหล่ำปลีม่วง มะเขือเทศ แตงกวา พริกหวาน หอมแดง แรดิช พาร์สลีย์ มินต์ ต้นหอม เมล็ดทับทิม น้ำสลัดซูแมค แครกเกอร์เมล็ดพืช มะนาวเหลือง'),
  ('SALE-GREEK_SALAD', 'พริกหวาน แตงกวา ชีสเฟต้า มะกอกดำ หอมแดง'),
  ('SALE-HUMMUS_BEETROOT', 'ถั่วลูกไก่ บีทรูท ตาฮินี มะนาวเหลือง กระเทียม น้ำมันมะกอก'),
  ('SALE-HUMMUS_PLAIN', 'ถั่วลูกไก่ ตาฮินี มะนาวเหลือง กระเทียม น้ำมันมะกอกเอ็กซ์ตร้าเวอร์จิ้น'),
  ('SALE-HUMMUS_TAWOOK', 'ฮัมมูส (ถั่วลูกไก่ ตาฮินี มะนาวเหลือง กระเทียม) ส่วนผสมทาบูเล่ (พาร์สลีย์ ควินัว มะเขือเทศ หอมแดง ต้นหอม มินต์ ทับทิม น้ำสลัดซูแมค) ไก่ย่าง (หมักทาวุกแดง) ฟักทองอบ แตงกวาดอง ครูตองสมุนไพร งาขาวและงาดำ'),
  ('SALE-JUICE_CARROT', 'แครอทสกัดเย็น'),
  ('SALE-JUICE_GLOW', 'แครอท ส้ม ขิง ขมิ้น'),
  ('SALE-JUICE_GUAVA', 'ฝรั่งสกัดเย็น'),
  ('SALE-JUICE_ORANGE', 'ส้มสกัดเย็น'),
  ('SALE-JUICE_ORANGE_CARROT', 'ส้ม แครอท'),
  ('SALE-JUICE_PINEAPPLE', 'สับปะรดสกัดเย็น'),
  ('SALE-MATCHA_ICED_DIRTY', 'เอสเพรสโซ นม มัทฉะญี่ปุ่น น้ำแข็ง'),
  ('SALE-MATCHA_ICED_LATTE', 'นม มัทฉะญี่ปุ่น น้ำแข็ง'),
  ('SALE-MATCHA_LATTE', 'นม มัทฉะญี่ปุ่น'),
  ('SALE-MATCHA_ORANGE', 'น้ำส้มคั้นสด มัทฉะญี่ปุ่น น้ำแข็ง')
),
r AS (SELECT n.id::text AS entity_key, t.txt FROM t JOIN public.nomenclature n ON n.product_code = t.product_code)
INSERT INTO public.content_translations (entity, entity_key, field, lang, value, source_hash)
SELECT 'dish', r.entity_key, 'ingredients', 'th', to_jsonb(r.txt),
       md5(public.fn_translation_source('dish', r.entity_key, 'ingredients'))
FROM r
WHERE public.fn_translation_source('dish', r.entity_key, 'ingredients') IS NOT NULL
ON CONFLICT (entity, entity_key, field, lang) DO UPDATE
  SET value = EXCLUDED.value, source_hash = EXCLUDED.source_hash, reviewed_at = NULL, reviewed_by = NULL;

WITH tg(slug, txt) AS (VALUES ('allergen-mustard', 'มีมัสตาร์ด'), ('allergen-soy', 'มีถั่วเหลือง'))
INSERT INTO public.content_translations (entity, entity_key, field, lang, value, source_hash)
SELECT 'tag', tg.slug, 'name', 'th', to_jsonb(tg.txt),
       md5(public.fn_translation_source('tag', tg.slug, 'name'))
FROM tg
WHERE public.fn_translation_source('tag', tg.slug, 'name') IS NOT NULL
ON CONFLICT (entity, entity_key, field, lang) DO UPDATE
  SET value = EXCLUDED.value, source_hash = EXCLUDED.source_hash, reviewed_at = NULL, reviewed_by = NULL;

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES ('476_th_ingredients_part1.sql', 'claude-opus-session-20399950', NULL,
  'TH ingredient lists 1/2 (40 dishes) + allergen tags mustard/soy (MC f91194f7)')
ON CONFLICT DO NOTHING;

COMMIT;
