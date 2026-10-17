-- 477_th_ingredients_part2.sql
-- Thai ingredient lists, part 2 of 2 (MC f91194f7). Same rules as part 1.
--
-- APPLIED to prod 2026-10-16 as `470_th_ingredients_part2.sql`; renumbered here because a
-- parallel session took 470. migration_log is corrected in mig 479.
--
-- CONTRACT-REVIEWED: data-only inserts into content_translations.

BEGIN;

WITH t(product_code, txt) AS (VALUES
  ('SALE-MATCHA_PASSION_FRUIT', 'เสาวรส มัทฉะญี่ปุ่น น้ำแข็ง'),
  ('SALE-MUTABAL', 'มะเขือย่าง ตาฮินี โยเกิร์ต มะนาวเหลือง กระเทียม'),
  ('SALE-NO_SHELL_COCONUT', 'มะพร้าวน้ำหอมลูกอ่อน (น้ำมะพร้าวและเนื้ออ่อน)'),
  ('SALE-PROTEIN_MEAL_BEEF', 'เคบับเนื้อวัวเลี้ยงหญ้า แป้งแผ่น พาร์สลีย์ หอมแดงคลุกซูแมค ฮัมมูส สลัดมะเขือเทศและแตงกวา แตงกวาดอง ซอสตาฮินี'),
  ('SALE-PROTEIN_MEAL_CHICKEN', 'ไก่ชิชทาวุกเสียบไม้ 2 ไม้ แป้งแผ่น พาร์สลีย์ หอมแดงคลุกซูแมค ฮัมมูส ทาบูเล่ ซอสตาฮินี'),
  ('SALE-PROTEIN_MEAL_SHRIMP', 'กุ้งเสียบไม้ 2 ไม้ แป้งแผ่น สลัดกะหล่ำ แตงกวาดอง ฮัมมูสบีทรูทอบ ซอสตาฮินี'),
  ('SALE-PUMPKIN_BEETROOT_FETA', 'ผักกาดแก้ว ฟักทองอบ บีทรูทอบ ชีสเฟต้า วอลนัท แครนเบอร์รีอบแห้ง'),
  ('SALE-SALAD_THAI_NOODLE', 'เส้นบุกชิราทากิ น้ำสลัดเนยถั่วลิสง กะหล่ำปลี แครอท หัวไชเท้า ถั่วแระญี่ปุ่น ถั่วลิสงคั่ว ผักชี งา'),
  ('SALE-SAUCE_HUMMUS', 'ถั่วลูกไก่ ตาฮินี มะนาวเหลือง กระเทียม'),
  ('SALE-SAUCE_TAHINI_TAMARIND', 'ตาฮินี น้ำส้มสายชูหมักแอปเปิล น้ำมะนาวเหลือง งา เกลือทะเล'),
  ('SALE-SAUCE_YOGURT_TAHINI', 'กรีกโยเกิร์ต ตาฮินี มะนาวเหลือง กระเทียม พาร์สลีย์'),
  ('SALE-SMOKED_SALMON_SALAD', 'ผักกาดแก้วและผักกาดโรเมน เทราต์แซลมอนรมควัน ไข่ อะโวคาโด แตงกวา หอมแดง ดิล'),
  ('SALE-SMOOTHIE_CHOCO_AVO', 'อะโวคาโด นมมะพร้าว กล้วย อินทผลัม เนยมะม่วงหิมพานต์ คาเคาดิบ น้ำ น้ำแข็ง'),
  ('SALE-SMOOTHIE_CUSTOM', 'เลือกเบสของคุณ (น้ำ นม นมมะพร้าว หรือโยเกิร์ต) ผลไม้ และตัวเสริม'),
  ('SALE-SMOOTHIE_ISLAND_GREEN', 'กล้วย กีวี ผักโขม มินต์ น้ำ น้ำแข็ง'),
  ('SALE-SMOOTHIE_MANGO_STRAWBERRY', 'มะม่วง สตรอว์เบอร์รี กล้วย น้ำ น้ำแข็ง'),
  ('SALE-SMOOTHIE_MATCHA_GREEN', 'กล้วย โยเกิร์ต นมอัลมอนด์ ผักโขม มัทฉะ เมล็ดเจีย น้ำผึ้ง น้ำแข็ง'),
  ('SALE-SMOOTHIE_MIXED_BERRY', 'นม สตรอว์เบอร์รี กล้วย บลูเบอร์รี เมล็ดเจีย น้ำแข็ง'),
  ('SALE-SMOOTHIE_PASSION_MANGO', 'มะม่วง เสาวรส น้ำ น้ำแข็ง'),
  ('SALE-SMOOTHIE_PEACH_APRICOT', 'พีช แอปริคอต กล้วย นม โยเกิร์ตไขมันต่ำ (ไม่เติมน้ำตาล) อัลมอนด์ น้ำแข็ง'),
  ('SALE-SMOOTHIE_PROTEIN_PEACH', 'พีช กล้วย นม โยเกิร์ตไขมันต่ำ (ไม่เติมน้ำตาล) เวย์โปรตีน เนยถั่วลิสง น้ำแข็ง'),
  ('SALE-SMOOTHIE_STRAWBERRY_BANANA', 'นม สตรอว์เบอร์รี กล้วย เมล็ดเจีย น้ำแข็ง'),
  ('SALE-SUMMER_ROLLS_CHICKEN', 'อกไก่ย่าง แผ่นแป้งข้าว เส้นหมี่ มะม่วง แครอท แตงกวา ผักกาดหอมบัตเตอร์เฮด มินต์ ผักชี น้ำจิ้มมะม่วง'),
  ('SALE-SUMMER_ROLLS_SHRIMP', 'กุ้ง แผ่นแป้งข้าว เส้นหมี่ มะม่วง แครอท แตงกวา ผักกาดหอมบัตเตอร์เฮด มินต์ ผักชี น้ำจิ้มมะม่วง'),
  ('SALE-SUMMER_ROLLS_TUNA_CORN', 'ทูน่า ข้าวโพดหวาน แผ่นแป้งข้าว เส้นหมี่ มะม่วง แครอท แตงกวา ผักกาดหอมบัตเตอร์เฮด มินต์ ผักชี น้ำจิ้มมะม่วง'),
  ('SALE-SUMMER_ROLLS_VEGGIE', 'แผ่นแป้งข้าว เส้นหมี่ มะม่วง แครอท แตงกวา ผักกาดหอมบัตเตอร์เฮด มินต์ ผักชี น้ำจิ้มมะม่วง'),
  ('SALE-TABBOULEH', 'พาร์สลีย์ ควินัวสุก มะเขือเทศ หอมแดง ต้นหอม มินต์ ทับทิม น้ำสลัดซูแมค มะนาวเหลือง'),
  ('SALE-TOAST_CHICKEN_TAWOOK', 'แผ่นแรปโฮลเกรน ไก่ชิชทาวุกย่าง สลัดกะหล่ำโยเกิร์ตตาฮินี ฮัมมูส ผักกาดแก้ว แตงกวาดอง'),
  ('SALE-TOAST_SALMON_GOAT_CHEESE', 'ขนมปัง 19 ธัญพืช กัวคาโมเล เทราต์แซลมอนรมควัน ชีสแพะ ดิล มะนาวเหลือง'),
  ('SALE-TOAST_SHRIMP_GUACAMOLE', 'ขนมปัง 19 ธัญพืช กัวคาโมเล กุ้ง ปิโกเดอกัลโย ซัลซ่ามะม่วง มะนาวเหลือง'),
  ('SALE-WRAP_FOLD_CHICKEN_AVOCADO', 'แผ่นแรปโฮลวีต อกไก่ อะโวคาโด มอสซาเรลลา เชดดาร์ ผักกาดแก้ว ครีมกระเทียม (ซาวร์ครีม มายองเนสน้ำมันมะกอก กระเทียม) กัวคาโมเล (อะโวคาโด มะนาว หอมใหญ่ ผักชี)'),
  ('SALE-WRAP_FOLD_CHICKEN_FAJITA', 'แผ่นแรปโฮลวีต อกไก่ พริกหวาน หอมใหญ่ สลัดกะหล่ำ (กะหล่ำปลี โยเกิร์ต ตาฮินี) ซอสฮันนีมัสตาร์ด (มายองเนสน้ำมันมะกอก มัสตาร์ด น้ำผึ้ง) ปิโกเดอกัลโย (มะเขือเทศ หอมแดง มะนาว ผักชี)'),
  ('SALE-WRAP_FOLD_EGGS_FAJITA', 'แผ่นแรปโฮลวีต ไข่ พริกหวาน หอมใหญ่ สลัดกะหล่ำ (กะหล่ำปลี โยเกิร์ต ตาฮินี) ซอสฮันนีมัสตาร์ด มายองเนสน้ำมันมะกอก ปิโกเดอกัลโย (มะเขือเทศ หอมแดง มะนาว ผักชี)'),
  ('SALE-WRAP_FOLD_FALAFEL', 'แผ่นแรปโฮลวีต ฟาลาเฟล (ถั่วลูกไก่ พาร์สลีย์ ผักชี กระเทียม ยี่หร่า) ฮัมมูส (ถั่วลูกไก่ ตาฮินี มะนาวเหลือง) ตาฮินี มะเขือเทศ แตงกวา แตงกวาดอง แรดิช ผักกาดแก้ว พาร์สลีย์ ซูแมค'),
  ('SALE-WRAP_FOLD_LAMB_TRUFFLE', 'แผ่นแรปโฮลวีต เนื้อแกะ เห็ดกระดุม หอมใหญ่ มอสซาเรลลา เชดดาร์ มายองเนสทรัฟเฟิล (มายองเนสน้ำมันมะกอก ซอสทรัฟเฟิลดำ) ครีมกระเทียม (ซาวร์ครีม มายองเนสน้ำมันมะกอก กระเทียม)'),
  ('SALE-WRAP_FOLD_SHRIMP_FAJITA', 'แผ่นแรปโฮลวีต กุ้ง พริกหวาน หอมใหญ่ สลัดกะหล่ำ (กะหล่ำปลี โยเกิร์ต ตาฮินี) ซอสฮันนีมัสตาร์ด ซอสไดนาไมต์ (มายองเนสน้ำมันมะกอก ศรีราชา) กัวคาโมเล (อะโวคาโด มะนาว หอมใหญ่ ผักชี)'),
  ('SALE-WRAP_OPEN_CHEESE', 'แผ่นแรปโฮลวีต มอสซาเรลลา เชดดาร์ ครีมชีส งาขาวและงาดำ มะเขือเทศเชอร์รี แตงกวา มะกอก มินต์'),
  ('SALE-WRAP_OPEN_ZAATAR', 'แผ่นแรปโฮลวีต ซาอาตาร์ น้ำมันมะกอก งาขาวและงาดำ มะเขือเทศเชอร์รี แตงกวา มะกอก มินต์'),
  ('SALE-WRAP_OPEN_ZAATAR_CHEESE', 'แผ่นแรปโฮลวีต ซาอาตาร์ น้ำมันมะกอก มอสซาเรลลา เชดดาร์ งาขาวและงาดำ มะเขือเทศเชอร์รี แตงกวา มะกอก มินต์')
),
r AS (SELECT n.id::text AS entity_key, t.txt FROM t JOIN public.nomenclature n ON n.product_code = t.product_code)
INSERT INTO public.content_translations (entity, entity_key, field, lang, value, source_hash)
SELECT 'dish', r.entity_key, 'ingredients', 'th', to_jsonb(r.txt),
       md5(public.fn_translation_source('dish', r.entity_key, 'ingredients'))
FROM r
WHERE public.fn_translation_source('dish', r.entity_key, 'ingredients') IS NOT NULL
ON CONFLICT (entity, entity_key, field, lang) DO UPDATE
  SET value = EXCLUDED.value, source_hash = EXCLUDED.source_hash, reviewed_at = NULL, reviewed_by = NULL;

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES ('477_th_ingredients_part2.sql', 'claude-opus-session-20399950', NULL,
  'TH ingredient lists 2/2 (39 dishes) — Thai data complete except dish names, which stay English by policy (MC f91194f7)')
ON CONFLICT DO NOTHING;

COMMIT;
