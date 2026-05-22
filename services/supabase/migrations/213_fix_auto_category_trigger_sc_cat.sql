-- Migration 213: Fix fn_auto_assign_category — drop broken supplier_catalog lookup
-- MC task 82a16248
--
-- BUG: Migration 210 referenced `supplier_catalog.category_id`, but that column
-- does not exist on supplier_catalog (the table has `category_code` → fin_categories,
-- not category_id → product_categories). Every INSERT into nomenclature with a
-- RAW-* product_code and NULL category_id crashed with:
--   ERROR: column sc_cat.category_id does not exist
-- This blocked ALL create_product calls for RAW items.
--
-- FIX: Drop the supplier_catalog hint block. Keep keyword pattern matching only.
-- If keyword doesn't match → NULL → human review via data_health (as designed).
--
-- IDEMPOTENT: CREATE OR REPLACE. Safe to re-run.

CREATE OR REPLACE FUNCTION public.fn_auto_assign_category()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_cat_code TEXT;
  v_cat_id   UUID;
BEGIN
  -- Skip if category already assigned
  IF NEW.category_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Only auto-assign for RAW items
  IF NEW.product_code NOT LIKE 'RAW-%' THEN
    RETURN NEW;
  END IF;

  -- ── Keyword pattern matching on name ──
  v_cat_code := CASE
    -- Dairy
    WHEN lower(NEW.name) ~ '(cheese|cheddar|mozzarella|parmesan|feta|gouda|emmental|ricotta|halloumi|brie|camembert)' THEN 'F-DAI-CHZ'
    WHEN lower(NEW.name) ~ '(butter|margarine|ghee)' THEN 'F-DAI-BTR'
    WHEN lower(NEW.name) ~ '(milk|cream|whipping|condensed milk|evaporated)' THEN 'F-DAI-MLK'
    WHEN lower(NEW.name) ~ '(yogurt|yoghurt|kefir|labneh)' THEN 'F-DAI-YGT'
    WHEN lower(NEW.name) ~ '(olive oil|coconut oil|sesame oil|sunflower oil|vegetable oil|cooking oil|canola|avocado oil)' THEN 'F-DAI-OIL'

    -- Protein
    WHEN lower(NEW.name) ~ '(chicken|duck|turkey|poultry)' THEN 'F-PRO-PLT'
    WHEN lower(NEW.name) ~ '(beef|lamb|mutton|veal|pork|meat|sausage|bacon)' THEN 'F-PRO-RED'
    WHEN lower(NEW.name) ~ '(shrimp|prawn|fish|salmon|tuna|squid|crab|mussel|clam|seafood|anchovy|sardine|mackerel)' THEN 'F-PRO-SEA'
    WHEN lower(NEW.name) ~ '(egg|eggs)' THEN 'F-PRO-EGG'
    WHEN lower(NEW.name) ~ '(tofu|tempeh|seitan|soy protein|plant protein)' THEN 'F-PRO-VEG'

    -- Produce
    WHEN lower(NEW.name) ~ '(mushroom|shiitake|oyster mushroom|lion.s mane|enoki|portobello|champignon)' THEN 'F-PRD-MSH'
    WHEN lower(NEW.name) ~ '(basil|cilantro|parsley|mint|dill|rosemary|thyme|oregano|chive|coriander|fresh herb)' THEN 'F-PRD-HRB'
    WHEN lower(NEW.name) ~ '(apple|banana|orange|mango|pineapple|berry|strawberry|blueberry|kiwi|grape|pomegranate|lemon|lime|watermelon|melon|papaya|avocado|fig|date|raisin|cranberry|apricot|peach|plum|pear)' THEN 'F-PRD-FRU'
    WHEN lower(NEW.name) ~ '(frozen|freeze)' THEN 'F-PRD-FRZ'
    WHEN lower(NEW.name) ~ '(onion|garlic|tomato|potato|carrot|cucumber|pepper|capsicum|zucchini|eggplant|pumpkin|squash|broccoli|cauliflower|spinach|lettuce|cabbage|celery|beetroot|sweet potato|corn|leek|asparagus|radish|seaweed|kale|arugula|rocket)' THEN 'F-PRD-VEG'

    -- Grains
    WHEN lower(NEW.name) ~ '(flour|semolina|cornmeal)' THEN 'F-BKR-FLR'
    WHEN lower(NEW.name) ~ '(bread|pita|tortilla|wrap|bun|bagel|croissant|naan)' THEN 'F-BKR-BRD'
    WHEN lower(NEW.name) ~ '(baking powder|baking soda|yeast|vanilla extract|cocoa powder)' THEN 'F-BKR-BKP'
    WHEN lower(NEW.name) ~ '(pasta|spaghetti|penne|fusilli|macaroni|noodle|lasagna|fettuccine)' THEN 'F-BKR-PST'
    WHEN lower(NEW.name) ~ '(rice|quinoa|bulgur|couscous|freekeh|buckwheat|millet)' THEN 'F-GRN-RIC'
    WHEN lower(NEW.name) ~ '(oat|granola|cereal|muesli|porridge)' THEN 'F-GRN-OAT'
    WHEN lower(NEW.name) ~ '(lentil|chickpea|bean|hummus|fava|edamame)' THEN 'F-GRN-LGM'

    -- Nuts & Seeds
    WHEN lower(NEW.name) ~ '(almond|walnut|cashew|pistachio|pecan|hazelnut|macadamia|peanut|pine nut)' THEN 'F-NTS-NUT'
    WHEN lower(NEW.name) ~ '(nut butter|peanut butter|almond butter|tahini)' THEN 'F-NTS-BUT'
    WHEN lower(NEW.name) ~ '(seed|chia|flax|sesame|sunflower seed|pumpkin seed|hemp seed)' THEN 'F-NTS-SDS'

    -- Spices & Seasonings
    WHEN lower(NEW.name) ~ '(salt|rock salt|himalayan|sea salt)' THEN 'F-SPC-SLT'
    WHEN lower(NEW.name) ~ '(sugar|honey|maple|agave|stevia|sweetener|syrup|molasses)' THEN 'F-SPC-SWT'
    WHEN lower(NEW.name) ~ '(vinegar|citric acid|lemon juice)' THEN 'F-SPC-VNG'
    WHEN lower(NEW.name) ~ '(starch|cornstarch|tapioca|gelatin|agar|xanthan|pectin)' THEN 'F-SPC-STR'
    WHEN lower(NEW.name) ~ '(cumin|turmeric|paprika|cinnamon|nutmeg|cardamom|coriander powder|black pepper|white pepper|chili powder|cayenne|za.atar|sumac|baharat|allspice|clove|saffron|ginger powder|garlic powder|onion powder|mixed spice|curry|oregano dried|thyme dried|rosemary dried|bay leaf)' THEN 'F-SPC-DRY'

    -- Sauces
    WHEN lower(NEW.name) ~ '(soy sauce|tamari|teriyaki|miso)' THEN 'F-SAU-SOY'
    WHEN lower(NEW.name) ~ '(fish sauce|oyster sauce|nam pla)' THEN 'F-SAU-FSH'
    WHEN lower(NEW.name) ~ '(chili sauce|sriracha|hot sauce|sambal|harissa|gochujang)' THEN 'F-SAU-CHI'
    WHEN lower(NEW.name) ~ '(paste|curry paste|tom yum|miso paste)' THEN 'F-SAU-PST'
    WHEN lower(NEW.name) ~ '(dressing|mayo|mayonnaise|mustard|ketchup|bbq sauce|worcestershire)' THEN 'F-SAU-DRS'

    -- Beverages
    WHEN lower(NEW.name) ~ '(coffee|espresso|cacao|cocoa bean)' THEN 'F-BEV-COF'
    WHEN lower(NEW.name) ~ '(tea|matcha|chamomile|herbal tea|green tea)' THEN 'F-BEV-TEA'

    -- Preserved
    WHEN lower(NEW.name) ~ '(canned|tinned|conserve)' THEN 'F-FRM-CND'
    WHEN lower(NEW.name) ~ '(pickle|kimchi|sauerkraut)' THEN 'F-FRM-PKL'
    WHEN lower(NEW.name) ~ '(fermented|kombucha|tempeh)' THEN 'F-FRM-FRM'

    -- Non-food: Packaging
    WHEN lower(NEW.name) ~ '(container|bowl|cup|lid|tray)' AND NEW.product_code LIKE 'RAW-%' THEN 'NF-PKG-CNT'
    WHEN lower(NEW.name) ~ '(bag|wrap|cling|film|foil)' AND NEW.product_code LIKE 'RAW-%' THEN 'NF-PKG-BAG'

    -- Non-food: Cleaning
    WHEN lower(NEW.name) ~ '(detergent|soap|dishwash|cleaning)' THEN 'NF-CLN-DSH'
    WHEN lower(NEW.name) ~ '(sanitizer|disinfectant|alcohol spray)' THEN 'NF-CLN-SAN'

    -- Non-food: Disposables
    WHEN lower(NEW.name) ~ '(glove|gloves)' THEN 'NF-DSP-GLV'
    WHEN lower(NEW.name) ~ '(tissue|paper towel|napkin)' THEN 'NF-DSP-PPR'

    ELSE NULL
  END;

  IF v_cat_code IS NOT NULL THEN
    SELECT id INTO v_cat_id
    FROM product_categories
    WHERE code = v_cat_code AND is_active;

    IF v_cat_id IS NOT NULL THEN
      NEW.category_id := v_cat_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_auto_assign_category() IS
  'BEFORE INSERT trigger on nomenclature: auto-assigns category_id by keyword matching product name to L3 product_categories. Only fires for RAW-* items with NULL category_id. Falls back to NULL for human review. (mig 213: removed broken supplier_catalog lookup that referenced non-existent sc_cat.category_id column.)';

INSERT INTO migration_log (filename, applied_by, notes)
VALUES (
    '213_fix_auto_category_trigger_sc_cat.sql',
    'claude-code',
    'Drop broken supplier_catalog.category_id lookup from fn_auto_assign_category. Keyword matching only. MC 82a16248.'
) ON CONFLICT (filename) DO NOTHING;
