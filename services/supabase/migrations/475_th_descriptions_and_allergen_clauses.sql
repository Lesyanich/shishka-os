-- 475_th_descriptions_and_allergen_clauses.sql
-- Thai dish descriptions (MC f91194f7), two parts.
--
-- PART A — the 39 descriptions that had no Thai at all (drinks + the new wraps).
-- PART B — safety fix: the mig 425 Thai prose was written for the printed A4 menu, which prints
-- its own CONTAINS line, so every "Contains …" clause was dropped. On the website the description
-- is the only text a guest reads, so 15 Thai descriptions were missing an allergen warning their
-- English carries. The clause is appended, in the same order as the English. (The Russian side of
-- the same gap was fixed in mig 450.)
--
-- APPLIED to prod 2026-10-16 as `468_th_descriptions_and_allergen_clauses.sql`; renumbered here
-- because a parallel session took 468. migration_log is corrected in mig 479.
--
-- CONTRACT-REVIEWED: data-only writes into content_translations.

BEGIN;

WITH t(product_code, txt) AS (VALUES
  ('SALE-COFFEE_AMERICANO', 'เอสเพรสโซสเปเชียลตี้ช็อตเข้มเนื้อแน่น เติมน้ำร้อน — เข้ม นุ่ม และไม่มีน้ำตาล'),
  ('SALE-COFFEE_CAPPUCCINO', 'เอสเพรสโซสเปเชียลตี้ใต้ฟองนมหนานุ่มดุจกำมะหยี่ — คลาสสิก สมดุล และอบอุ่น ขอเปลี่ยนเป็นนมมะพร้าวได้'),
  ('SALE-COFFEE_CARAMEL_LATTE', 'เอสเพรสโซสเปเชียลตี้ของเรากับนมสตีมเนื้อเนียน เติมไซรัปคาราเมล — นุ่ม หวาน และอบอุ่น ขอเปลี่ยนเป็นนมมะพร้าวได้'),
  ('SALE-COFFEE_ESPRESSO', 'เอสเพรสโซสเปเชียลตี้ Boncafe ช็อตเข้มข้น — บริสุทธิ์ หอม และกระตุ้นความสดชื่น เหมาะที่สุดสำหรับเรียกพลัง'),
  ('SALE-COFFEE_ESPRESSO_TONIC', 'เครื่องดื่มซิกเนเจอร์ของเรา: เอสเพรสโซหนึ่งช็อตบนโทนิกซ่าและน้ำแข็ง — ขมอมหวาน ซ่า และสดใสกว่าที่คิด'),
  ('SALE-COFFEE_ICED_AMERICANO', 'เอสเพรสโซสเปเชียลตี้ช็อตเข้มเนื้อแน่น เติมน้ำเย็นบนน้ำแข็ง — เข้ม นุ่ม และไม่มีน้ำตาล'),
  ('SALE-COFFEE_ICED_CAPPUCCINO', 'คาปูชิโนของเราแบบเย็น — เอสเพรสโซเข้มกับฟองนมเย็น นุ่มและสดชื่น ขอเปลี่ยนเป็นนมมะพร้าวได้'),
  ('SALE-COFFEE_ICED_CARAMEL_LATTE', 'เอสเพรสโซสเปเชียลตี้ของเราบนนมเย็นและน้ำแข็ง เติมไซรัปคาราเมล — นุ่ม หวาน และสดชื่น ขอเปลี่ยนเป็นนมมะพร้าวได้'),
  ('SALE-COFFEE_ICED_LATTE', 'เอสเพรสโซสเปเชียลตี้เย็นรินบนนมเย็นและน้ำแข็ง — นุ่ม ละมุน และสดชื่น ขอเปลี่ยนเป็นนมมะพร้าวได้'),
  ('SALE-COFFEE_LATTE', 'เอสเพรสโซสเปเชียลตี้ของเราผสานกับนมสตีมเนื้อเนียน — นุ่ม ครีมมี่ และอบอุ่น ขอเปลี่ยนเป็นนมมะพร้าวได้'),
  ('SALE-COFFEE_ORANGE', 'ซิกเนเจอร์รสสดใสของเรา: เอสเพรสโซสเปเชียลตี้สองช็อตบนน้ำส้มคั้นสดและน้ำแข็ง ตกแต่งด้วยส้มสดหนึ่งชิ้น — สดชื่น กลิ่นซิตรัส และติดใจเกินคาด'),
  ('SALE-COFFEE_PASSION_FRUIT', 'ทวิสต์เขตร้อนของเรา: เอสเพรสโซสเปเชียลตี้สองช็อตบนเสาวรสรสเปรี้ยวและน้ำแข็ง ท็อปด้วยเนื้อเสาวรสสด — สดใส เปรี้ยวกำลังดี และสดชื่น'),
  ('SALE-JUICE_GUAVA', 'ฝรั่งสุกสกัดเย็น — หอม สดชื่นแบบเขตร้อน และอุดมด้วยวิตามินซี ผลไม้ 100% ไม่เติมน้ำตาล'),
  ('SALE-JUICE_PINEAPPLE', 'สับปะรดสุกสกัดเย็น — สดใส ฉ่ำ และเปรี้ยวกำลังดี ผลไม้ 100% ไม่เติมน้ำตาล'),
  ('SALE-MATCHA_ICED_DIRTY', 'มัทฉะญี่ปุ่นบดหินพบกับเอสเพรสโซหนึ่งช็อตบนน้ำแข็ง — กลิ่นดินละมุน เข้ม อุดมสารต้านอนุมูลอิสระ และเย็นสดชื่นในแก้วเดียว'),
  ('SALE-MATCHA_ICED_LATTE', 'มัทฉะญี่ปุ่นเกรดพิธีชงตีฟองแล้วรินบนน้ำแข็งกับนมเย็นและน้ำผึ้งเล็กน้อย — สดชื่น นุ่ม และให้พลังอย่างสงบ ขอเปลี่ยนเป็นนมมะพร้าวได้'),
  ('SALE-MATCHA_LATTE', 'มัทฉะญี่ปุ่นเกรดพิธีชงตีเข้ากับนมสตีมเนื้อเนียน — นุ่ม หอมหญ้าอ่อนหวาน และให้พลังอย่างสงบ ขอเปลี่ยนเป็นนมมะพร้าวได้'),
  ('SALE-MATCHA_ORANGE', 'มัทฉะญี่ปุ่นบดหินบนน้ำส้มคั้นสดและน้ำแข็ง — สดใส กลิ่นซิตรัสเด่น ไม่มีนม พร้อมสารต้านอนุมูลอิสระจากธรรมชาติ'),
  ('SALE-MATCHA_PASSION_FRUIT', 'มัทฉะญี่ปุ่นบดหินรินบนเสาวรสรสเปรี้ยวและน้ำแข็ง — สดชื่นแบบเขตร้อน สดใส ไม่มีนม และอุดมสารต้านอนุมูลอิสระ'),
  ('SALE-NO_SHELL_COCONUT', 'มะพร้าวน้ำหอมลูกอ่อนทั้งลูก ปอกสดและเสิร์ฟพร้อมหลอด — น้ำมะพร้าวแท้ชื่นใจพร้อมเนื้ออ่อนนุ่ม ไม่เติมอะไรเลย'),
  ('SALE-SMOOTHIE_CHOCO_AVO', 'อะโวคาโดเนื้อนุ่มและนมมะพร้าวเข้มข้นปั่นกับกล้วย ผงคาเคาดิบ และอินทผลัมเล็กน้อย — ของหวานรสช็อกโกแลตเข้มที่แท้จริงแล้วมีแต่ไขมันดีและไฟเบอร์ ไม่มีนมวัว ไม่เติมน้ำตาล'),
  ('SALE-SMOOTHIE_CUSTOM', 'ปั่นเองตามใจ: เลือกเบส ผลไม้ และตัวเสริมสำหรับสมูทตี้แก้วที่ใช่ ปั่นสดใหม่ แคลอรีจะอัปเดตตามที่คุณเลือก'),
  ('SALE-SMOOTHIE_ISLAND_GREEN', 'ส่วนผสมเขตร้อนสดใสของกล้วย กีวีรสเปรี้ยว และผักโขม เติมความเย็นด้วยมินต์สด — สดชื่น เต็มไปด้วยวิตามิน และหวานธรรมชาติ ไม่มีนม'),
  ('SALE-SMOOTHIE_MANGO_STRAWBERRY', 'มะม่วงสุกหวานและสตรอว์เบอร์รีฉ่ำปั่นกับกล้วย — ผลไม้ล้วน หวานธรรมชาติ ไม่เติมน้ำตาล ไม่มีนม'),
  ('SALE-SMOOTHIE_MATCHA_GREEN', 'แก้วเขียวให้พลังจากมัทฉะญี่ปุ่น กล้วยสุก และผักโขม ปั่นเนื้อครีมกับโยเกิร์ตและนมอัลมอนด์ โรยเมล็ดเจียและน้ำผึ้งเล็กน้อย — อุดมสารต้านอนุมูลอิสระ หวานอ่อน ๆ และกระปรี้กระเปร่าอย่างเป็นธรรมชาติ'),
  ('SALE-SMOOTHIE_MIXED_BERRY', 'สตรอว์เบอร์รี บลูเบอร์รี และกล้วยปั่นกับเมล็ดเจีย — อุดมสารต้านอนุมูลอิสระ เนื้อครีม และดีต่อร่างกาย ได้พลังเบอร์รีในทุกอึก'),
  ('SALE-SMOOTHIE_PASSION_MANGO', 'มะม่วงหอมหวานและเสาวรสรสเปรี้ยว — คู่หูเขตร้อนสดใส ผลไม้ล้วนและหวานธรรมชาติ ไม่มีนม'),
  ('SALE-SMOOTHIE_PEACH_APRICOT', 'พีชและแอปริคอตรสละมุนปั่นกับกล้วย โยเกิร์ตเนื้อครีม และอัลมอนด์ — นุ่ม หวานอ่อน ๆ ไม่เติมน้ำตาล'),
  ('SALE-SMOOTHIE_PROTEIN_PEACH', 'แก้วโปรดหลังออกกำลังกาย: พีชและกล้วยปั่นกับเวย์โปรตีน โยเกิร์ต และเนยถั่วลิสง — โปรตีนแน่น หวานธรรมชาติ และอิ่มจริง'),
  ('SALE-SMOOTHIE_STRAWBERRY_BANANA', 'คลาสสิกตลอดกาล — สตรอว์เบอร์รีหวานและกล้วยสุกปั่นกับเมล็ดเจีย เนื้อครีม ดีต่อร่างกาย และถูกใจทุกวัย'),
  ('SALE-WRAP_FOLD_CHICKEN_AVOCADO', 'อกไก่ย่างกับอะโวคาโดสไลซ์ มอสซาเรลลาและเชดดาร์ละลาย ห่อในแผ่นแรปโฮลวีตกับผักกาดแก้วกรอบ — เสิร์ฟพร้อมครีมกระเทียมและกัวคาโมเล'),
  ('SALE-WRAP_FOLD_CHICKEN_FAJITA', 'อกไก่ย่างกับพริกหวานสามสีและหอมใหญ่ ห่อในแผ่นแรปโฮลวีตกับสลัดกะหล่ำโยเกิร์ตตาฮินี — เสิร์ฟพร้อมซอสฮันนีมัสตาร์ดและปิโกเดอกัลโย'),
  ('SALE-WRAP_FOLD_EGGS_FAJITA', 'ไข่คนกับพริกหวานสามสีและหอมใหญ่ย่าง ห่อในแผ่นแรปโฮลวีตกับสลัดกะหล่ำโยเกิร์ตตาฮินี — เสิร์ฟพร้อมมายองเนสน้ำมันมะกอกและปิโกเดอกัลโย'),
  ('SALE-WRAP_FOLD_FALAFEL', 'ฟาลาเฟลถั่วลูกไก่อบบนฮัมมูส ห่อในแผ่นแรปโฮลวีตกับมะเขือเทศ แตงกวา แตงกวาดอง หัวไชเท้า และผักกาดแก้ว โรยตาฮินีและซูแมค — เสิร์ฟพร้อมฮัมมูสและตาฮินี'),
  ('SALE-WRAP_FOLD_LAMB_TRUFFLE', 'เนื้อแกะย่างกับเห็ดและหอมใหญ่ใต้มอสซาเรลลาและเชดดาร์ละลาย ห่อในแผ่นแรปโฮลวีต — เสิร์ฟพร้อมมายองเนสทรัฟเฟิลและครีมกระเทียม'),
  ('SALE-WRAP_FOLD_SHRIMP_FAJITA', 'กุ้งย่างกับพริกหวานสามสีและหอมใหญ่ ห่อในแผ่นแรปโฮลวีตกับสลัดกะหล่ำโยเกิร์ตตาฮินี — เสิร์ฟพร้อมซอสไดนาไมต์และกัวคาโมเล'),
  ('SALE-WRAP_OPEN_CHEESE', 'แผ่นแรปโฮลวีตคลี่แบนอบใต้มอสซาเรลลา เชดดาร์ และครีมชีสละลาย โรยงาขาวและงาดำ — เสิร์ฟพร้อมมะเขือเทศเชอร์รี แตงกวา มะกอก และมินต์'),
  ('SALE-WRAP_OPEN_ZAATAR', 'แผ่นแรปโฮลวีตคลี่แบนอบกับซาอาตาร์และน้ำมันมะกอก โรยงาขาวและงาดำ — เสิร์ฟพร้อมมะเขือเทศเชอร์รี แตงกวา มะกอก และมินต์'),
  ('SALE-WRAP_OPEN_ZAATAR_CHEESE', 'ครึ่งซาอาตาร์ ครึ่งชีส: แผ่นแรปโฮลวีตหนึ่งแผ่นคลี่แบน อบด้วยซาอาตาร์กับน้ำมันมะกอกด้านหนึ่ง มอสซาเรลลาและเชดดาร์อีกด้านหนึ่ง — เสิร์ฟพร้อมมะเขือเทศเชอร์รี แตงกวา มะกอก และมินต์')
),
r AS (SELECT n.id::text AS entity_key, t.txt FROM t JOIN public.nomenclature n ON n.product_code = t.product_code)
INSERT INTO public.content_translations (entity, entity_key, field, lang, value, source_hash)
SELECT 'dish', r.entity_key, 'description', 'th', to_jsonb(r.txt),
       md5(public.fn_translation_source('dish', r.entity_key, 'description'))
FROM r
WHERE public.fn_translation_source('dish', r.entity_key, 'description') IS NOT NULL
ON CONFLICT (entity, entity_key, field, lang) DO UPDATE
  SET value = EXCLUDED.value, source_hash = EXCLUDED.source_hash, reviewed_at = NULL, reviewed_by = NULL;

-- PART B: append the dropped allergen clauses.
WITH a(product_code, clause) AS (VALUES
  ('SALE-BOWL_MANGO_SALMON_TUNA',  'มีปลา งา และถั่วเหลือง'),
  ('SALE-BRK_CHEESE_EGG',          'มีนม ไข่ และกลูเตน'),
  ('SALE-BRK_DOUBLE_PROTEIN',      'มีนม ไข่ กลูเตน และงา'),
  ('SALE-BRK_EGGS_YOUR_WAY',       'มีไข่ กลูเตน และนม'),
  ('SALE-BRK_GUACAMOLE_EGG',       'มีนม ไข่ และกลูเตน'),
  ('SALE-CHOC_RECOVERY_SQ',        'มีถั่วลิสง'),
  ('SALE-CUP_SHRIMP_CRAB_SEAWEED', 'มีสัตว์น้ำมีเปลือก หอย ปลา กลูเตน งา และถั่วเหลือง'),
  ('SALE-CUP_TOFU_CHICKPEA',       'มีงาและถั่วเหลือง'),
  ('SALE-GREEK_SALAD',             'มีนม'),
  ('SALE-MUTABAL',                 'มีนมและงา'),
  ('SALE-PROTEIN_MEAL_BEEF',       'มีกลูเตน มัสตาร์ด และงา'),
  ('SALE-PROTEIN_MEAL_CHICKEN',    'มีกลูเตนและงา'),
  ('SALE-PROTEIN_MEAL_SHRIMP',     'มีกลูเตน นม งา และหอย'),
  ('SALE-PUMPKIN_BEETROOT_FETA',   'มีนมและถั่วเปลือกแข็ง'),
  ('SALE-SALAD_THAI_NOODLE',       'มีกลูเตน ถั่วลิสง งา และถั่วเหลือง')
)
UPDATE public.content_translations c
SET value = to_jsonb((c.value #>> '{}') || ' ' || a.clause),
    source_hash = md5(public.fn_translation_source('dish', c.entity_key, 'description')),
    reviewed_at = NULL, reviewed_by = NULL
FROM a, public.nomenclature n
WHERE n.product_code = a.product_code
  AND c.entity = 'dish' AND c.entity_key = n.id::text AND c.field = 'description' AND c.lang = 'th'
  AND (c.value #>> '{}') NOT LIKE '%' || a.clause || '%';

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES ('475_th_descriptions_and_allergen_clauses.sql', 'claude-opus-session-20399950', NULL,
  'TH: 39 missing dish descriptions + appended the allergen clauses mig 425 dropped on 15 dishes (MC f91194f7)')
ON CONFLICT DO NOTHING;

COMMIT;
