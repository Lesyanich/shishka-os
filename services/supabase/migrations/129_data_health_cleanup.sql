-- ============================================================
-- Migration 129: Data Health Cleanup
-- Supplier merge, type fix, category assignment, expense reclass
-- ============================================================

-- ── 1. Merge Makro Rawai → Makro ──────────────────────────────
UPDATE public.purchase_logs
  SET supplier_id = 'c548db19-8a70-4f34-96af-d66162793cbf'
  WHERE supplier_id = '9e168318-6dd5-41b2-a5f6-43a0a26b5dc6';

-- supplier_catalog: delete duplicates first (unique constraint on supplier_id+barcode)
DELETE FROM public.supplier_catalog sc_rawai
WHERE sc_rawai.supplier_id = '9e168318-6dd5-41b2-a5f6-43a0a26b5dc6'
  AND EXISTS (
    SELECT 1 FROM public.supplier_catalog sc_makro
    WHERE sc_makro.supplier_id = 'c548db19-8a70-4f34-96af-d66162793cbf'
      AND sc_makro.barcode = sc_rawai.barcode
  );

UPDATE public.supplier_catalog
  SET supplier_id = 'c548db19-8a70-4f34-96af-d66162793cbf'
  WHERE supplier_id = '9e168318-6dd5-41b2-a5f6-43a0a26b5dc6';

-- expense_ledger: delete duplicates first (unique constraint on supplier_id+invoice_number)
DELETE FROM public.expense_ledger el_rawai
WHERE el_rawai.supplier_id = '9e168318-6dd5-41b2-a5f6-43a0a26b5dc6'
  AND EXISTS (
    SELECT 1 FROM public.expense_ledger el_makro
    WHERE el_makro.supplier_id = 'c548db19-8a70-4f34-96af-d66162793cbf'
      AND el_makro.invoice_number = el_rawai.invoice_number
  );

UPDATE public.expense_ledger
  SET supplier_id = 'c548db19-8a70-4f34-96af-d66162793cbf'
  WHERE supplier_id = '9e168318-6dd5-41b2-a5f6-43a0a26b5dc6';

-- suppliers table uses is_deleted (not is_active)
UPDATE public.suppliers
  SET is_deleted = true, name = '[MERGED] Makro Rawai'
  WHERE id = '9e168318-6dd5-41b2-a5f6-43a0a26b5dc6';

-- ── 2. Fix nomenclature type mismatch ─────────────────────────
UPDATE public.nomenclature
  SET type = 'raw_ingredient'
  WHERE product_code LIKE 'RAW-%'
    AND type != 'raw_ingredient';

-- ── 3. Category assignment via keyword mapping ────────────────

-- Vegetables
UPDATE nomenclature SET category_id = (SELECT id FROM product_categories WHERE code = 'F-PRD-VEG')
WHERE category_id IS NULL AND product_code LIKE 'RAW-%' AND is_available = true
  AND (lower(name) ~* '(pepper|tomato|potato|onion|garlic|carrot|zucchini|cucumber|lettuce|spinach|arugula|asparagus|broccoli|cauliflower|celery|corn|eggplant|leek|pea|radish|cabbage|kale|beetroot|pumpkin|squash|bean sprout|spring onion|shallot|chili)');

-- Fruit
UPDATE nomenclature SET category_id = (SELECT id FROM product_categories WHERE code = 'F-PRD-FRU')
WHERE category_id IS NULL AND product_code LIKE 'RAW-%' AND is_available = true
  AND (lower(name) ~* '(apple|banana|mango|pineapple|watermelon|melon|grape|orange|lemon|lime|pomegranate|berry|blueberry|strawberry|raspberry|avocado|dragon.?fruit|passion.?fruit|papaya|kiwi|coconut|date|fig|grapefruit)');

-- Fresh Herbs
UPDATE nomenclature SET category_id = (SELECT id FROM product_categories WHERE code = 'F-PRD-HRB')
WHERE category_id IS NULL AND product_code LIKE 'RAW-%' AND is_available = true
  AND (lower(name) ~* '(basil|cilantro|coriander|dill|mint|parsley|rosemary|thyme|oregano|sage|lemongrass|chive|bay leaf|tarragon)');

-- Mushrooms
UPDATE nomenclature SET category_id = (SELECT id FROM product_categories WHERE code = 'F-PRD-MSH')
WHERE category_id IS NULL AND product_code LIKE 'RAW-%' AND is_available = true
  AND (lower(name) ~* '(mushroom|shiitake|enoki|oyster mushroom|portobello|champignon)');

-- Poultry
UPDATE nomenclature SET category_id = (SELECT id FROM product_categories WHERE code = 'F-PRO-PLT')
WHERE category_id IS NULL AND product_code LIKE 'RAW-%' AND is_available = true
  AND (lower(name) ~* '(chicken|turkey|duck|poultry)');

-- Red Meat
UPDATE nomenclature SET category_id = (SELECT id FROM product_categories WHERE code = 'F-PRO-RED')
WHERE category_id IS NULL AND product_code LIKE 'RAW-%' AND is_available = true
  AND (lower(name) ~* '(beef|lamb|pork|veal|goat|wagyu)');

-- Seafood
UPDATE nomenclature SET category_id = (SELECT id FROM product_categories WHERE code = 'F-PRO-SEA')
WHERE category_id IS NULL AND product_code LIKE 'RAW-%' AND is_available = true
  AND (lower(name) ~* '(salmon|tuna|shrimp|prawn|squid|fish|crab|lobster|scallop|mussel|oyster|clam|seabass|mackerel|sardine|anchov)');

-- Eggs
UPDATE nomenclature SET category_id = (SELECT id FROM product_categories WHERE code = 'F-PRO-EGG')
WHERE category_id IS NULL AND product_code LIKE 'RAW-%' AND is_available = true
  AND (lower(name) ~* '(^egg |eggs| egg$|egg |quail egg)');

-- Cheese
UPDATE nomenclature SET category_id = (SELECT id FROM product_categories WHERE code = 'F-DAI-CHZ')
WHERE category_id IS NULL AND product_code LIKE 'RAW-%' AND is_available = true
  AND (lower(name) ~* '(cheese|parmesan|mozzarella|feta|cheddar|halloumi|ricotta|mascarpone|gouda|brie|camembert|cream cheese)');

-- Milk & Cream
UPDATE nomenclature SET category_id = (SELECT id FROM product_categories WHERE code = 'F-DAI-MLK')
WHERE category_id IS NULL AND product_code LIKE 'RAW-%' AND is_available = true
  AND (lower(name) ~* '(milk|cream|half.and.half|whipping cream|oat milk|almond milk|soy milk|coconut milk)');

-- Butter
UPDATE nomenclature SET category_id = (SELECT id FROM product_categories WHERE code = 'F-DAI-BTR')
WHERE category_id IS NULL AND product_code LIKE 'RAW-%' AND is_available = true
  AND (lower(name) ~* '(butter|ghee|margarine)');

-- Yogurt
UPDATE nomenclature SET category_id = (SELECT id FROM product_categories WHERE code = 'F-DAI-YGT')
WHERE category_id IS NULL AND product_code LIKE 'RAW-%' AND is_available = true
  AND (lower(name) ~* '(yogurt|yoghurt|labneh|kefir)');

-- Cooking Oils
UPDATE nomenclature SET category_id = (SELECT id FROM product_categories WHERE code = 'F-DAI-OIL')
WHERE category_id IS NULL AND product_code LIKE 'RAW-%' AND is_available = true
  AND (lower(name) ~* '(olive oil|coconut oil|sesame oil|vegetable oil|sunflower oil|canola oil|avocado oil|oil \d|oil$)');

-- Legumes
UPDATE nomenclature SET category_id = (SELECT id FROM product_categories WHERE code = 'F-GRN-LGM')
WHERE category_id IS NULL AND product_code LIKE 'RAW-%' AND is_available = true
  AND (lower(name) ~* '(chickpea|lentil|black bean|kidney bean|hummus|fava|edamame)');

-- Rice & Pseudocereals
UPDATE nomenclature SET category_id = (SELECT id FROM product_categories WHERE code = 'F-GRN-RIC')
WHERE category_id IS NULL AND product_code LIKE 'RAW-%' AND is_available = true
  AND (lower(name) ~* '(rice|quinoa|bulgur|couscous|freekeh|buckwheat)');

-- Oats & Cereals
UPDATE nomenclature SET category_id = (SELECT id FROM product_categories WHERE code = 'F-GRN-OAT')
WHERE category_id IS NULL AND product_code LIKE 'RAW-%' AND is_available = true
  AND (lower(name) ~* '(oat|granola|cereal|muesli)');

-- Flours
UPDATE nomenclature SET category_id = (SELECT id FROM product_categories WHERE code = 'F-BKR-FLR')
WHERE category_id IS NULL AND product_code LIKE 'RAW-%' AND is_available = true
  AND (lower(name) ~* '(flour|cornstarch|semolina)');

-- Bread & Tortillas
UPDATE nomenclature SET category_id = (SELECT id FROM product_categories WHERE code = 'F-BKR-BRD')
WHERE category_id IS NULL AND product_code LIKE 'RAW-%' AND is_available = true
  AND (lower(name) ~* '(bread|pita|tortilla|wrap|naan|flatbread|lavash|baguette|bun|croissant)');

-- Pasta & Noodles
UPDATE nomenclature SET category_id = (SELECT id FROM product_categories WHERE code = 'F-BKR-PST')
WHERE category_id IS NULL AND product_code LIKE 'RAW-%' AND is_available = true
  AND (lower(name) ~* '(pasta|spaghetti|penne|fettuccine|noodle|macaroni|linguine|fusilli|lasagna)');

-- Baking Agents
UPDATE nomenclature SET category_id = (SELECT id FROM product_categories WHERE code = 'F-BKR-BKP')
WHERE category_id IS NULL AND product_code LIKE 'RAW-%' AND is_available = true
  AND (lower(name) ~* '(baking powder|baking soda|yeast|gelatin|agar)');

-- Tree Nuts
UPDATE nomenclature SET category_id = (SELECT id FROM product_categories WHERE code = 'F-NTS-NUT')
WHERE category_id IS NULL AND product_code LIKE 'RAW-%' AND is_available = true
  AND (lower(name) ~* '(almond|walnut|cashew|pistachio|pecan|hazelnut|macadamia|pine nut|peanut)');

-- Nut Butters
UPDATE nomenclature SET category_id = (SELECT id FROM product_categories WHERE code = 'F-NTS-BUT')
WHERE category_id IS NULL AND product_code LIKE 'RAW-%' AND is_available = true
  AND (lower(name) ~* '(almond butter|peanut butter|tahini|cashew butter|nut butter)');

-- Seeds
UPDATE nomenclature SET category_id = (SELECT id FROM product_categories WHERE code = 'F-NTS-SDS')
WHERE category_id IS NULL AND product_code LIKE 'RAW-%' AND is_available = true
  AND (lower(name) ~* '(chia|flax|hemp seed|sunflower seed|pumpkin seed|sesame seed|poppy seed)');

-- Dry Spices & Herbs
UPDATE nomenclature SET category_id = (SELECT id FROM product_categories WHERE code = 'F-SPC-DRY')
WHERE category_id IS NULL AND product_code LIKE 'RAW-%' AND is_available = true
  AND (lower(name) ~* '(cumin|turmeric|paprika|cinnamon|cardamom|coriander powder|nutmeg|clove|allspice|sumac|za.?atar|curry|garam masala|cayenne|saffron|bay leaf dried|star anise|chili powder|chili flake|pepper.*(ground|black|white)|dried oregano|dried basil|dried thyme|dried parsley)');

-- Salt
UPDATE nomenclature SET category_id = (SELECT id FROM product_categories WHERE code = 'F-SPC-SLT')
WHERE category_id IS NULL AND product_code LIKE 'RAW-%' AND is_available = true
  AND (lower(name) ~* '(salt|himalayan|fleur de sel|sea salt|rock salt)');

-- Sweeteners
UPDATE nomenclature SET category_id = (SELECT id FROM product_categories WHERE code = 'F-SPC-SWT')
WHERE category_id IS NULL AND product_code LIKE 'RAW-%' AND is_available = true
  AND (lower(name) ~* '(sugar|honey|maple syrup|agave|stevia|molasses|date syrup|monk fruit|erythritol)');

-- Vinegar & Acids
UPDATE nomenclature SET category_id = (SELECT id FROM product_categories WHERE code = 'F-SPC-VNG')
WHERE category_id IS NULL AND product_code LIKE 'RAW-%' AND is_available = true
  AND (lower(name) ~* '(vinegar|lemon juice|lime juice|citric acid|balsamic)');

-- Sauces: Soy-based
UPDATE nomenclature SET category_id = (SELECT id FROM product_categories WHERE code = 'F-SAU-SOY')
WHERE category_id IS NULL AND product_code LIKE 'RAW-%' AND is_available = true
  AND (lower(name) ~* '(soy sauce|tamari|miso|teriyaki)');

-- Sauces: Pastes
UPDATE nomenclature SET category_id = (SELECT id FROM product_categories WHERE code = 'F-SAU-PST')
WHERE category_id IS NULL AND product_code LIKE 'RAW-%' AND is_available = true
  AND (lower(name) ~* '(tomato paste|curry paste|harissa|gochujang|chipotle paste|truffle sauce)');

-- Sauces: Fish & Oyster
UPDATE nomenclature SET category_id = (SELECT id FROM product_categories WHERE code = 'F-SAU-FSH')
WHERE category_id IS NULL AND product_code LIKE 'RAW-%' AND is_available = true
  AND (lower(name) ~* '(fish sauce|oyster sauce|nam pla|worcestershire)');

-- Sauces: Dressings
UPDATE nomenclature SET category_id = (SELECT id FROM product_categories WHERE code = 'F-SAU-DRS')
WHERE category_id IS NULL AND product_code LIKE 'RAW-%' AND is_available = true
  AND (lower(name) ~* '(mayonnaise|mayo|ketchup|mustard|ranch|vinaigrette|dressing)');

-- Sauces: Chili & Hot
UPDATE nomenclature SET category_id = (SELECT id FROM product_categories WHERE code = 'F-SAU-CHI')
WHERE category_id IS NULL AND product_code LIKE 'RAW-%' AND is_available = true
  AND (lower(name) ~* '(sriracha|hot sauce|tabasco|sambal|chili sauce|sweet chili)');

-- Canned Goods
UPDATE nomenclature SET category_id = (SELECT id FROM product_categories WHERE code = 'F-FRM-CND')
WHERE category_id IS NULL AND product_code LIKE 'RAW-%' AND is_available = true
  AND (lower(name) ~* '(canned|tinned|can of|tomato.*can)');

-- Fermented
UPDATE nomenclature SET category_id = (SELECT id FROM product_categories WHERE code = 'F-FRM-FRM')
WHERE category_id IS NULL AND product_code LIKE 'RAW-%' AND is_available = true
  AND (lower(name) ~* '(kimchi|sauerkraut|kombucha|tempeh|natto)');

-- Pickled
UPDATE nomenclature SET category_id = (SELECT id FROM product_categories WHERE code = 'F-FRM-PKL')
WHERE category_id IS NULL AND product_code LIKE 'RAW-%' AND is_available = true
  AND (lower(name) ~* '(pickle|olive|caper|gherkin|jalape)');

-- Coffee & Cacao
UPDATE nomenclature SET category_id = (SELECT id FROM product_categories WHERE code = 'F-BEV-COF')
WHERE category_id IS NULL AND product_code LIKE 'RAW-%' AND is_available = true
  AND (lower(name) ~* '(coffee|cacao|cocoa|chocolate)');

-- Tea & Herbal
UPDATE nomenclature SET category_id = (SELECT id FROM product_categories WHERE code = 'F-BEV-TEA')
WHERE category_id IS NULL AND product_code LIKE 'RAW-%' AND is_available = true
  AND (lower(name) ~* '(tea |matcha|chamomile|herbal tea|green tea|black tea)');

-- Superfoods
UPDATE nomenclature SET category_id = (SELECT id FROM product_categories WHERE code = 'F-SUP-SPF')
WHERE category_id IS NULL AND product_code LIKE 'RAW-%' AND is_available = true
  AND (lower(name) ~* '(spirulina|chlorella|wheatgrass|acai|goji|moringa|maca)');

-- Adaptogens
UPDATE nomenclature SET category_id = (SELECT id FROM product_categories WHERE code = 'F-SUP-ADT')
WHERE category_id IS NULL AND product_code LIKE 'RAW-%' AND is_available = true
  AND (lower(name) ~* '(ashwagandha|reishi|lion.s mane|cordyceps|chaga|rhodiola)');

-- Collagen & Aminos
UPDATE nomenclature SET category_id = (SELECT id FROM product_categories WHERE code = 'F-SUP-COL')
WHERE category_id IS NULL AND product_code LIKE 'RAW-%' AND is_available = true
  AND (lower(name) ~* '(collagen|whey|protein powder|bcaa|amino)');

-- Starches & Thickeners
UPDATE nomenclature SET category_id = (SELECT id FROM product_categories WHERE code = 'F-SPC-STR')
WHERE category_id IS NULL AND product_code LIKE 'RAW-%' AND is_available = true
  AND (lower(name) ~* '(starch|tapioca|arrowroot|xanthan|psyllium)');

-- Frozen Produce
UPDATE nomenclature SET category_id = (SELECT id FROM product_categories WHERE code = 'F-PRD-FRZ')
WHERE category_id IS NULL AND product_code LIKE 'RAW-%' AND is_available = true
  AND (lower(name) ~* '(frozen)');

-- Plant Protein
UPDATE nomenclature SET category_id = (SELECT id FROM product_categories WHERE code = 'F-PRO-VEG')
WHERE category_id IS NULL AND product_code LIKE 'RAW-%' AND is_available = true
  AND (lower(name) ~* '(tofu|seitan|beyond|impossible|plant.based)');

-- ── 4. Reclassify non-food expenses ──────────────────────────
UPDATE public.expense_ledger SET flow_type = 'OpEx'
WHERE supplier_id IN (
  'd394d574-6a99-49db-af21-b19ab2eceed2',  -- Teun Gas and Ice Shop
  'cac0a1aa-d19b-496a-bcd5-92a74751084a',  -- Gas Installation Supplier
  '5cd67613-63e7-48df-a361-8b2f9122c201',  -- Sunshine Kitchenware Store
  '19b68c3e-9956-452a-8b19-153b36ad94de',  -- Bike fix
  'adb98b55-8fdb-47c2-908a-005221b46e7a',  -- Water delivery
  '1ba6f98e-8918-46fb-88fd-5081cb84498c'   -- Provincial Waterworks Authority
) AND flow_type = 'COGS';

-- ── 5. Fix garbage dates ──────────────────────────────────────
UPDATE public.expense_ledger
  SET transaction_date = '2026-02-26'
  WHERE transaction_date = '2046-02-26';

-- ── Self-register ─────────────────────────────────────────────
INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '129_data_health_cleanup.sql',
  'claude-code',
  NULL,
  'Data health cleanup: merge Makro Rawai → Makro, fix RAW-% type mismatches, keyword-based category assignment for 200+ items, reclassify 6 non-food suppliers COGS → OpEx, fix garbage date 2046-02-26.'
);
