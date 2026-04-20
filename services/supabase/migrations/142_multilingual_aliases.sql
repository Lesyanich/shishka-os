-- Migration 142: Add multilingual aliases to equipment and nomenclature
-- Enables chef agent to find items by Russian/Arabic/Thai names
-- Example: equipment "Lava Grill Gas" gets aliases ["лава-гриль", "شواية حمم", "เตาลาวา"]

-- 1. Add aliases column to equipment
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS aliases text[] DEFAULT '{}';

-- 2. Add aliases column to nomenclature
ALTER TABLE nomenclature ADD COLUMN IF NOT EXISTS aliases text[] DEFAULT '{}';

-- 3. GIN index for fast array containment / overlap queries
CREATE INDEX IF NOT EXISTS idx_equipment_aliases_gin ON equipment USING GIN (aliases);
CREATE INDEX IF NOT EXISTS idx_nomenclature_aliases_gin ON nomenclature USING GIN (aliases);

-- 4. Seed critical equipment aliases (Russian + Arabic + Thai)
UPDATE equipment SET aliases = ARRAY['духовка', 'конвекционная печь', 'فرن حراري', 'เตาอบ']
  WHERE equipment_code = 'L-1-K-EL-CON-OVEN-83-20';

UPDATE equipment SET aliases = ARRAY['духовка', 'конвекционная печь', 'فرن حراري', 'เตาอบ']
  WHERE equipment_code = 'L-1-K-EL-CON-OVEN-83';

UPDATE equipment SET aliases = ARRAY['лава-гриль', 'лава гриль', 'гриль', 'شواية حمم', 'เตาลาวา', 'lava rock grill']
  WHERE equipment_code = 'L-1-K-LAVA-GRILL-650-33';

UPDATE equipment SET aliases = ARRAY['вакууматор', 'вакуумный упаковщик', 'вакуум', 'ماكينة تغليف', 'เครื่องซีลสูญญากาศ', 'vacuum sealer']
  WHERE equipment_code = 'L-1-K-VAC-500-67';

UPDATE equipment SET aliases = ARRAY['меричеф', 'скоростная печь', 'فرن سريع', 'เตาความเร็วสูง', 'merrychef', 'speed oven']
  WHERE equipment_code = 'L-2-S-HS-OVN-MCs1s-39';

UPDATE equipment SET aliases = ARRAY['газовая плита', 'плита', 'موقد غاز', 'เตาแก๊ส']
  WHERE equipment_code = 'L-1-K-GAS-RNG-570-32';

UPDATE equipment SET aliases = ARRAY['бласт чиллер', 'шоковая заморозка', 'شوك فريزر', 'ตู้แช่เย็นเร็ว', 'blast chiller', 'shock freezer']
  WHERE equipment_code = 'L-1-K-BL-FRZ-790-66';

UPDATE equipment SET aliases = ARRAY['блендер', 'خلاط', 'เครื่องปั่น']
  WHERE name = 'Blender';

UPDATE equipment SET aliases = ARRAY['тестомес', 'миксер для теста', 'عجانة', 'เครื่องนวดแป้ง']
  WHERE equipment_code = 'L-1-K-D-MIX-10KG-18';

UPDATE equipment SET aliases = ARRAY['контактный гриль', 'пресс-гриль', 'شواية ضغط', 'เตาย่างกด']
  WHERE equipment_code = 'L-2-S-GRIILL-CNT-48';

UPDATE equipment SET aliases = ARRAY['индукция', 'индукционная плита', 'موقد حثي', 'เตาแม่เหล็กไฟฟ้า']
  WHERE equipment_code = 'L-2-S-INDCT-BRN-2-6';

UPDATE equipment SET aliases = ARRAY['индукция', 'индукционная плита', 'موقد حثي', 'เตาแม่เหล็กไฟฟ้า']
  WHERE equipment_code = 'L-2-S-INDCT-BRN-2-65';

UPDATE equipment SET aliases = ARRAY['коптильня', 'смокер', 'مدخنة', 'เครื่องรมควัน']
  WHERE equipment_code = 'L-1-K--62';

UPDATE equipment SET aliases = ARRAY['йогуртница', 'صانعة زبادي', 'เครื่องทำโยเกิร์ต']
  WHERE equipment_code = 'L-1-K-YOG-10L-17';

UPDATE equipment SET aliases = ARRAY['эспрессо', 'кофемашина', 'ماكينة قهوة', 'เครื่องชงกาแฟ']
  WHERE equipment_code = 'L-2-S-COF-ESP-CHINA-16';

UPDATE equipment SET aliases = ARRAY['соковыжималка', 'عصارة', 'เครื่องคั้นน้ำผลไม้']
  WHERE equipment_code = 'L-1-K-JUIC-EXTR-CHINA-15';

UPDATE equipment SET aliases = ARRAY['весы 30кг', 'ميزان 30 كيلو', 'ตาชั่ง 30 กก.']
  WHERE equipment_code = 'L-1-K--46';

UPDATE equipment SET aliases = ARRAY['весы 5кг', 'ميزان 5 كيلو', 'ตาชั่ง 5 กก.']
  WHERE equipment_code = 'L-1-K--47';

-- 5. Seed nomenclature aliases (SALE dishes)
UPDATE nomenclature SET aliases = ARRAY['борщ', 'свекольный суп', 'شوربة بنجر', 'ซุปบีทรูท']
  WHERE product_code = 'SALE-BORSCH_BIOACTIVE';

UPDATE nomenclature SET aliases = ARRAY['хумус', 'حمص', 'ฮัมมัส']
  WHERE product_code = 'SALE-HUMMUS_CLASSIC';

UPDATE nomenclature SET aliases = ARRAY['квашеная капуста', 'краут', 'ملفوف مخلل', 'กะหล่ำดอง']
  WHERE product_code = 'SALE-KRAUT_SIDE';

UPDATE nomenclature SET aliases = ARRAY['тыквенный суп', 'суп из тыквы', 'شوربة يقطين', 'ซุปฟักทอง']
  WHERE product_code = 'SALE-PUMPKIN_SOUP';

UPDATE nomenclature SET aliases = ARRAY['манакиш', 'манаиш', 'مناقيش', 'มานาอิช']
  WHERE product_code LIKE 'SALE-MANAISH%';

-- 6. Seed nomenclature aliases (PF semi-finished)
UPDATE nomenclature SET aliases = ARRAY['борщевая база', 'основа борща', 'قاعدة البورش']
  WHERE product_code = 'PF-BORSCH_BASE';

UPDATE nomenclature SET aliases = ARRAY['курица гриль', 'دجاج مشوي', 'ไก่ย่าง']
  WHERE product_code = 'PF-CHICKEN_GRILL_NEUTRAL';

UPDATE nomenclature SET aliases = ARRAY['шиш тавук', 'курица тавук', 'شيش طاووق', 'ไก่ชิชทาวุก']
  WHERE product_code = 'PF-CHICKEN_GRILL_TAWOOK';

UPDATE nomenclature SET aliases = ARRAY['нут вареный', 'حمص مطبوخ', 'ถั่วชิกพีต้ม']
  WHERE product_code = 'PF-CHICKPEAS_COOKED';

UPDATE nomenclature SET aliases = ARRAY['хумус база', 'основа хумуса', 'قاعدة حمص']
  WHERE product_code = 'PF-HUMMUS_BASE';

UPDATE nomenclature SET aliases = ARRAY['печеная тыква', 'يقطين مشوي', 'ฟักทองอบ']
  WHERE product_code = 'PF-BAKED_PUMPKIN';

UPDATE nomenclature SET aliases = ARRAY['печеная свёкла', 'بنجر مشوي', 'บีทรูทอบ']
  WHERE product_code = 'PF-BAKED_BEETROOT';

UPDATE nomenclature SET aliases = ARRAY['квашеная капуста пф', 'ملفوف مخمر', 'กะหล่ำหมัก']
  WHERE product_code = 'PF-FERMENTED_CABBAGE';

UPDATE nomenclature SET aliases = ARRAY['овощной бульон', 'مرق خضار', 'น้ำซุปผัก']
  WHERE product_code = 'PF-VEGETABLE_BROTH';

UPDATE nomenclature SET aliases = ARRAY['йогурт домашний', 'زبادي منزلي', 'โยเกิร์ตโฮมเมด']
  WHERE product_code = 'PF-YOGURT_HOMEMADE';

UPDATE nomenclature SET aliases = ARRAY['тесто для манакиш', 'عجينة مناقيش', 'แป้งมานาอิช']
  WHERE product_code = 'PF-MANAISH-DOUGH';

UPDATE nomenclature SET aliases = ARRAY['закваска', 'خميرة طبيعية', 'ซาวร์โดว์สตาร์ทเตอร์']
  WHERE product_code = 'PF-SOURDOUGH-STARTER';

-- 7. Seed key RAW ingredient aliases (most searched)
UPDATE nomenclature SET aliases = ARRAY['картошка', 'картофель', 'بطاطس', 'มันฝรั่ง']
  WHERE name ILIKE '%potato%' AND product_code LIKE 'RAW-%';

UPDATE nomenclature SET aliases = ARRAY['курица', 'куриное филе', 'دجاج', 'ไก่']
  WHERE name ILIKE '%chicken%' AND product_code LIKE 'RAW-%';

UPDATE nomenclature SET aliases = ARRAY['лук', 'بصل', 'หัวหอม']
  WHERE name ILIKE '%onion%' AND product_code LIKE 'RAW-%' AND name NOT ILIKE '%green%';

UPDATE nomenclature SET aliases = ARRAY['морковь', 'جزر', 'แครอท']
  WHERE name ILIKE '%carrot%' AND product_code LIKE 'RAW-%';

UPDATE nomenclature SET aliases = ARRAY['свёкла', 'بنجر', 'บีทรูท']
  WHERE name ILIKE '%beetroot%' AND product_code LIKE 'RAW-%';

UPDATE nomenclature SET aliases = ARRAY['тыква', 'يقطين', 'ฟักทอง']
  WHERE name ILIKE '%pumpkin%' AND product_code LIKE 'RAW-%';

UPDATE nomenclature SET aliases = ARRAY['молоко', 'حليب', 'นม']
  WHERE name ILIKE '%milk%' AND product_code LIKE 'RAW-%' AND name NOT ILIKE '%coconut%';

UPDATE nomenclature SET aliases = ARRAY['кокосовое молоко', 'حليب جوز هند', 'กะทิ']
  WHERE name ILIKE '%coconut milk%' AND product_code LIKE 'RAW-%';

UPDATE nomenclature SET aliases = ARRAY['масло сливочное', 'زبدة', 'เนย']
  WHERE name ILIKE '%butter%' AND product_code LIKE 'RAW-%';

UPDATE nomenclature SET aliases = ARRAY['оливковое масло', 'زيت زيتون', 'น้ำมันมะกอก']
  WHERE name ILIKE '%olive oil%' AND product_code LIKE 'RAW-%';

UPDATE nomenclature SET aliases = ARRAY['чеснок', 'ثوم', 'กระเทียม']
  WHERE name ILIKE '%garlic%' AND product_code LIKE 'RAW-%';

UPDATE nomenclature SET aliases = ARRAY['соль', 'ملح', 'เกลือ']
  WHERE name ILIKE '%salt%' AND product_code LIKE 'RAW-%' AND name NOT ILIKE '%himalayan%';

UPDATE nomenclature SET aliases = ARRAY['мука', 'طحين', 'แป้ง']
  WHERE name ILIKE '%flour%' AND product_code LIKE 'RAW-%';

UPDATE nomenclature SET aliases = ARRAY['рис', 'أرز', 'ข้าว']
  WHERE name ILIKE '%rice%' AND product_code LIKE 'RAW-%' AND name NOT ILIKE '%paper%';

-- 8. Self-register migration
INSERT INTO migration_log (filename, applied_by, notes)
VALUES ('142_multilingual_aliases.sql', 'claude', 'Add aliases text[] to equipment and nomenclature for multilingual search')
ON CONFLICT DO NOTHING;
