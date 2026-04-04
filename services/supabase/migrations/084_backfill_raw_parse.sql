-- ============================================================
-- Migration 084: Backfill raw_parse for 3 existing Makro receipts
-- Saves structured parse logs so we never need to re-read images
-- ============================================================

-- Receipt 1: Makro Feb 27 — weekly grocery (4222.25 THB)
UPDATE public.expense_ledger
SET raw_parse = '{
  "source": "backfill_084",
  "parsed_at": "2026-04-01",
  "supplier_name": "Makro Rawai",
  "invoice_number": "062501118002",
  "transaction_date": "2026-02-27",
  "total_amount": 4222.25,
  "discount_total": -40,
  "receipt_images": ["Makro_2026-02-27_p1.jpeg", "Makro_2026-02-27_p2.jpeg"],
  "food_items": [
    {"name": "Ground Paprika 200g", "qty": 1, "unit_price": 75, "total": 75},
    {"name": "McGarrett Baking Soda 1kg", "qty": 1, "unit_price": 110, "total": 110},
    {"name": "Parsley 100g", "qty": 4, "unit_price": 35, "total": 140},
    {"name": "Thai Basil 300g", "qty": 1, "unit_price": 35, "total": 35},
    {"name": "Imperial Whole Wheat Flour 1kg", "qty": 1, "unit_price": 80, "total": 80},
    {"name": "Green Apple #113 pack of 10", "qty": 1, "unit_price": 139, "total": 139},
    {"name": "Ercho Tapioca Starch 1kg", "qty": 1, "unit_price": 34, "total": 34},
    {"name": "Wetchapong Honey 760ml", "qty": 1, "unit_price": 315, "total": 315},
    {"name": "Orange-flesh Melon", "qty": 2.368, "unit_price": 89, "total": 210.75},
    {"name": "Ercho Rice Flour 1kg", "qty": 1, "unit_price": 33, "total": 33},
    {"name": "ARO Eggs mixed size 3-4 30pcs", "qty": 1, "unit_price": 105, "total": 105},
    {"name": "Ercho White Vinegar 5% 4.5L", "qty": 1, "unit_price": 74, "total": 74},
    {"name": "Lurpak Butter 2kg", "qty": 1, "unit_price": 419, "total": 419},
    {"name": "Mint Leaves 300g", "qty": 1, "unit_price": 49, "total": 49},
    {"name": "Yellow Lemon pack 4", "qty": 1, "unit_price": 69, "total": 69},
    {"name": "Smuckers Blueberry Jam 340g", "qty": 1, "unit_price": 132, "total": 132},
    {"name": "Thyme 100g", "qty": 1, "unit_price": 105, "total": 105},
    {"name": "Oregano 50g", "qty": 1, "unit_price": 45, "total": 45},
    {"name": "Knorr Cornstarch 700g", "qty": 2, "unit_price": 70, "total": 140},
    {"name": "Alpine Chickpeas 500g", "qty": 10, "unit_price": 72, "total": 720},
    {"name": "Meiji Pasteurized Milk Plain 5L", "qty": 1, "unit_price": 225.5, "total": 225.5},
    {"name": "Meiji Whipping Cream 946ml", "qty": 1, "unit_price": 205, "total": 205},
    {"name": "Watties Frozen Green Peas 1kg", "qty": 1, "unit_price": 99, "total": 99},
    {"name": "Ercho Glutinous Rice Flour 1kg", "qty": 1, "unit_price": 40, "total": 40},
    {"name": "Chinese Peeled Garlic 1kg", "qty": 3, "unit_price": 75, "total": 225}
  ],
  "opex_items": [
    {"name": "Cleaning sponge/scrub 3-color 450g (Cleanew)", "qty": 1, "unit_price": 289, "total": 289},
    {"name": "Sunlight Lemon Turbo Dish Soap 3.2L", "qty": 1, "unit_price": 149, "total": 149}
  ]
}'::jsonb
WHERE id = '4f0e5532-d985-4775-9fa9-521c9d39beb2';

-- Receipt 2: Makro Mar 30 AM — grocery morning (4204 THB)
UPDATE public.expense_ledger
SET raw_parse = '{
  "source": "backfill_084",
  "parsed_at": "2026-04-01",
  "supplier_name": "Makro Rawai",
  "invoice_number": "166501180002",
  "transaction_date": "2026-03-30",
  "total_amount": 4204,
  "discount_total": -58,
  "vat_amount": 88.71,
  "receipt_images": ["Makro_2026-03-30-AM_p1.jpeg", "Makro_2026-03-30-AM_p2.jpeg", "Makro_2026-03-30-AM_p3.jpeg"],
  "food_items": [
    {"name": "Bell Pepper 3 Color C Grade 1kg", "qty": 1, "unit_price": 139, "total": 139},
    {"name": "Cherry Tomatoes 500g", "qty": 2, "unit_price": 49, "total": 98},
    {"name": "Hand Brand Cardamom 50g", "qty": 1, "unit_price": 99, "total": 99},
    {"name": "Mint 300g", "qty": 1, "unit_price": 49, "total": 49},
    {"name": "Chinese Garlic (cut stem) 1kg", "qty": 1, "unit_price": 62, "total": 62},
    {"name": "Frilley Lettuce (Hydro) 500g", "qty": 1, "unit_price": 85, "total": 85},
    {"name": "Cape Gooseberry Royal Project 300g", "qty": 2, "unit_price": 89, "total": 178},
    {"name": "Hand Brand Dried Parsley 50g", "qty": 1, "unit_price": 69, "total": 69},
    {"name": "Red Seedless Grapes AUS", "qty": 1.08, "unit_price": 159, "total": 171.75},
    {"name": "Thai Basil 300g", "qty": 1, "unit_price": 32, "total": 32},
    {"name": "ARO Wasabi Frozen 500g", "qty": 1, "unit_price": 315, "total": 315},
    {"name": "Pineapple Trad Golden", "qty": 1, "unit_price": 45, "total": 45},
    {"name": "MDH Bombay Biryani Masala", "qty": 1, "unit_price": 66, "total": 66},
    {"name": "ARO Frozen Tahiti Lime Juice 1kg", "qty": 1, "unit_price": 135, "total": 135},
    {"name": "Mixed Beans 5 Color 500g", "qty": 1, "unit_price": 58, "total": 58},
    {"name": "Sunflower Sprouts 500g", "qty": 1, "unit_price": 78, "total": 78},
    {"name": "Dried Chrysanthemum 300g", "qty": 1, "unit_price": 189, "total": 189},
    {"name": "Radish 500g", "qty": 1, "unit_price": 79, "total": 79},
    {"name": "Pineapple Pattavia", "qty": 1, "unit_price": 39, "total": 39},
    {"name": "ARO Panang Curry Paste 250g", "qty": 1, "unit_price": 32, "total": 32},
    {"name": "Zucchini 1kg", "qty": 1, "unit_price": 99, "total": 99},
    {"name": "Chickpeas 500g", "qty": 1, "unit_price": 59, "total": 59},
    {"name": "ARO Mustard 1000g", "qty": 1, "unit_price": 89, "total": 89},
    {"name": "Heinz Apple Cider Vinegar 946ml", "qty": 1, "unit_price": 325, "total": 325},
    {"name": "Parsley 100g", "qty": 3, "unit_price": 35, "total": 105},
    {"name": "Dill 150g", "qty": 2, "unit_price": 29, "total": 58},
    {"name": "Goji Berry 300g", "qty": 1, "unit_price": 118, "total": 118},
    {"name": "ARO Red Curry Paste 250g", "qty": 1, "unit_price": 32, "total": 32},
    {"name": "Chef Pack Frozen Strawberry 1kg", "qty": 1, "unit_price": 60, "total": 60},
    {"name": "Purple Cabbage", "qty": 0.748, "unit_price": 55, "total": 41.25},
    {"name": "Vine Tomatoes 1000g", "qty": 1, "unit_price": 59, "total": 59},
    {"name": "Coriander 300g", "qty": 1, "unit_price": 52, "total": 52},
    {"name": "ARO Frozen Blueberry 1kg", "qty": 1, "unit_price": 175, "total": 175},
    {"name": "ARO Massaman Curry Paste 250g", "qty": 1, "unit_price": 32, "total": 32},
    {"name": "Red Oak Lettuce (Hydro) 500g", "qty": 1, "unit_price": 85, "total": 85},
    {"name": "Cucumber", "qty": 2.05, "unit_price": 39, "total": 80},
    {"name": "Spring Onion 300g", "qty": 1, "unit_price": 52, "total": 52},
    {"name": "Ponti Balsamic Vinegar 500ml", "qty": 1, "unit_price": 189, "total": 189},
    {"name": "Watties Frozen Edamame 1kg", "qty": 1, "unit_price": 99, "total": 99},
    {"name": "ARO Frozen Raspberry 1kg", "qty": 1, "unit_price": 268, "total": 268},
    {"name": "Ponti Red Wine Vinegar 500ml", "qty": 1, "unit_price": 109, "total": 109},
    {"name": "ARO Green Curry Paste 250g", "qty": 1, "unit_price": 32, "total": 32},
    {"name": "Chinese Kale 500g", "qty": 1, "unit_price": 25, "total": 25}
  ]
}'::jsonb
WHERE id = '3c34ebff-83d5-42b3-b768-6984143f85d9';

-- Receipt 3: Makro Mar 30 PM — grocery afternoon (1990 THB)
UPDATE public.expense_ledger
SET raw_parse = '{
  "source": "backfill_084",
  "parsed_at": "2026-04-01",
  "supplier_name": "Makro Rawai",
  "invoice_number": "166501180004",
  "transaction_date": "2026-03-30",
  "total_amount": 1990,
  "vat_amount": 61.89,
  "receipt_images": ["Makro_2026-03-30-PM.jpeg"],
  "food_items": [
    {"name": "Castello Blue Cheese (cut)", "qty": 0.196, "unit_price": 995, "total": 195},
    {"name": "Carrot pack", "qty": 1, "unit_price": 49, "total": 49},
    {"name": "ARO Almond Sliced 500g", "qty": 1, "unit_price": 229, "total": 229},
    {"name": "Potato pack 1kg", "qty": 3, "unit_price": 49, "total": 147},
    {"name": "ARO Frozen Sweet Corn 1kg", "qty": 1, "unit_price": 67, "total": 67},
    {"name": "Chef Pack Passion Fruit Seedless 1kg", "qty": 1, "unit_price": 185, "total": 185},
    {"name": "Butternut Squash (RPF)", "qty": 0.436, "unit_price": 119, "total": 52},
    {"name": "Japanese Pumpkin", "qty": 1.074, "unit_price": 55, "total": 59},
    {"name": "Mixed Fruit Juice CS", "qty": 2, "unit_price": 89, "total": 178},
    {"name": "ARO Frozen Corn Cut 1kg", "qty": 1, "unit_price": 89, "total": 89},
    {"name": "ARO Mango Nam Dok Mai Juice 1kg", "qty": 1, "unit_price": 129, "total": 129},
    {"name": "ARO Mango Nam Dok Mai Diced 1kg", "qty": 1, "unit_price": 199, "total": 199},
    {"name": "Paprika Powder 200g", "qty": 1, "unit_price": 75, "total": 75},
    {"name": "Thai Purple Sweet Potato", "qty": 1, "unit_price": 59, "total": 59},
    {"name": "White Mushrooms (Champignon) 500g", "qty": 1, "unit_price": 129, "total": 129},
    {"name": "ARO Avocado Halves Frozen 1kg", "qty": 1, "unit_price": 149, "total": 149}
  ]
}'::jsonb
WHERE id = 'c6605642-827d-46bb-858d-a67bdf929f8b';
