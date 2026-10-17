-- 335 — Clean culinary names for pantry-label items (Jars & Bottles tab)
--
-- RAW items carry their PROCUREMENT name (brand + pack size, e.g. "ARO Ground
-- White Pepper 500 g") because they're minted from invoices — right for
-- purchasing/WAC, wrong for a kitchen jar label. `nomenclature.customer_short_name`
-- is the codebase's established "clean culinary label" (useDishCard, BOM trees,
-- ShelfLifeEditor all render `customer_short_name || name`), so we seed it with a
-- clean name for the pantry set. The procurement `name` is left untouched.
--
-- Only fills rows that are still blank (idempotent; never clobbers a curated
-- value). Already-clean names (e.g. "Tahini", "Soy Sauce", "Olive Oil (Extra
-- Virgin)") are intentionally left to fall back to `name`.

BEGIN;

UPDATE nomenclature AS n
SET customer_short_name = v.clean
FROM (
  VALUES
    ('RAW-ALMOND_POWDER', 'Almond Powder'),
    ('RAW-PEPPER-BLACK', 'Black Pepper'),
    ('RAW-CASHEWS', 'Cashews'),
    ('RAW-WHITE VINEGAR 5%', 'White Vinegar'),
    ('RAW-CURRY-PASTE-GREEN', 'Green Curry Paste'),
    ('RAW-PEPPER_WHITE', 'Ground White Pepper'),
    ('RAW-VINEGAR_RICE', 'Rice Vinegar'),
    ('RAW-CURRY-PASTE-MASSAMAN', 'Massaman Curry Paste'),
    ('RAW-MUSTARD-DIJON', 'Dijon Mustard'),
    ('RAW-CURRY-PASTE-PANANG', 'Panang Curry Paste'),
    ('RAW-CURRY-PASTE-RED', 'Red Curry Paste'),
    ('RAW-FLOUR-RICE', 'Rice Flour'),
    ('RAW-STARCH-TAPIOCA', 'Tapioca Starch'),
    ('RAW-QUINOA', 'Quinoa'),
    ('RAW-SESAME-SEEDS-BLACK', 'Black Sesame'),
    ('RAW-MOLASSES_BLACKSTRAP', 'Blackstrap Molasses'),
    ('RAW-AQUAFABA', 'Aquafaba'),
    ('RAW-CHIPOTLE_ADOBO', 'Chipotle in Adobo'),
    ('RAW-CHRYSANTHEMUM', 'Chrysanthemum'),
    ('RAW-CRESPO_BLACK_PITTED_OLIVE', 'Black Olives (Pitted)'),
    ('RAW-CUMIN-POWDER', 'Cumin Powder'),
    ('RAW-CUMIN-SEEDS', 'Cumin Seeds'),
    ('RAW-FLOUR-SEMOLINA', 'Semolina'),
    ('RAW-FLOUR-FARINA', 'Farina Flour'),
    ('RAW-FENUGREEK', 'Fenugreek Seeds'),
    ('RAW-MINT_DRIED', 'Dried Mint'),
    ('RAW-TRUFFLE-SAUCE', 'Black Truffle Sauce'),
    ('RAW-CINNAMON-POWDER', 'Ground Cinnamon'),
    ('RAW-CORIANDER-POWDER', 'Ground Coriander'),
    ('RAW-GALANGAL', 'Ground Galangal'),
    ('RAW-NUTMEG', 'Ground Nutmeg'),
    ('RAW-PUMPKIN-SEEDS', 'Pumpkin Seeds (Roasted)'),
    ('RAW-SUNFLOWER-SEEDS', 'Sunflower Seeds (Roasted)'),
    ('RAW-HERITAGE_RAW_PISTACHIOS', 'Pistachios'),
    ('RAW-FLOUR-WW', 'Whole Wheat Flour'),
    ('RAW-JADE_LEAF_POTATO_STARCH', 'Potato Starch'),
    ('RAW-JADE_LEAF_RICE_FLOUR', 'Rice Flour'),
    ('RAW-KHUNSHINE_ROASTED_RICE', 'Roasted Rice'),
    ('RAW-FLOUR-AP', 'All-Purpose Flour'),
    ('RAW-LIN_ICING_SUGAR', 'Icing Sugar'),
    ('RAW-LONG-PEPPER', 'Long Pepper'),
    ('RAW-BAKING-SODA', 'Baking Soda'),
    ('RAW-SPICE-BIRYANI-MASALA', 'Biryani Masala'),
    ('RAW-SUGAR', 'Sugar'),
    ('RAW-BEANS-MIXED', 'Mixed Beans'),
    ('RAW-COFFEE-INSTANT', 'Instant Coffee'),
    ('RAW-BAY-LEAVES', 'Bay Leaves'),
    ('RAW-CARDAMOM', 'Cardamom'),
    ('RAW-OREGANO-DRIED', 'Oregano'),
    ('RAW-FLOUR-VENUS', 'Bread Flour (White)'),
    ('RAW-NUTELLA_HAZELNUT_CHOCOLATE_SPREAD', 'Hazelnut Chocolate Spread'),
    ('RAW-PAPRIKA', 'Paprika'),
    ('RAW-POMEGRANATE_MOLASSES', 'Pomegranate Molasses'),
    ('RAW-VINEGAR-RED-WINE', 'Red Wine Vinegar'),
    ('RAW-RED-KIDNEY-BEANS', 'Red Kidney Beans'),
    ('RAW-7bf108e5', 'Wheat Flour'),
    ('RAW-SALT-SEA-COARSE', 'Coarse Sea Salt'),
    ('RAW-JAM-STRAWBERRY', 'Strawberry Jam'),
    ('RAW-CURRY-POWDER', 'Curry Powder'),
    ('RAW-THYME', 'Thyme'),
    ('RAW-TURMERIC', 'Turmeric Powder'),
    ('RAW-ROSELLE-DRIED', 'Dried Roselle'),
    ('RAW-TAMARIND-PASTE-WET', 'Wet Tamarind Paste'),
    ('RAW-RICE-WHITE', 'White Rice'),
    ('RAW-FLOUR-BREAD-WHITESWAN', 'Bread Flour'),
    ('RAW-MUSTARD-WHOLEGRAIN', 'Wholegrain Mustard')
) AS v(product_code, clean)
WHERE n.product_code = v.product_code
  AND NULLIF(TRIM(n.customer_short_name), '') IS NULL;

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '335_pantry_clean_label_names.sql', 'claude-code', NULL,
  'Seed clean culinary customer_short_name for pantry-label RAW items (jar/bottle labels show "Ground White Pepper" not "ARO Ground White Pepper 500 g"). Only fills blank values; procurement name untouched.'
)
ON CONFLICT DO NOTHING;

COMMIT;

-- DOWN: UPDATE nomenclature SET customer_short_name = NULL WHERE product_code IN (<the codes above>);
