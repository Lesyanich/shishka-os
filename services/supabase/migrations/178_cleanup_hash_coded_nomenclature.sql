-- ═══════════════════════════════════════════════════════════════
-- Migration 178: Cleanup hash-coded nomenclature items
-- Task: MC ddfc76a2 — merge RAW-AUTO + RAW-{hash} duplicates
-- ═══════════════════════════════════════════════════════════════
-- PROBLEM: 95 active nomenclature items with unreadable codes:
--   RAW-AUTO-{hex8} — auto-created by approve_receipt v12-v15
--   RAW-{hex8}      — created by early receipt parsing
-- SOLUTION: Merge duplicates, rename uniques, deactivate non-food,
--           add sheriff rule to prevent future hash-coded items.
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- ─── Helper: cascade merge function ───
CREATE OR REPLACE FUNCTION pg_temp.do_merge(p_from UUID, p_to UUID)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE purchase_logs    SET nomenclature_id = p_to WHERE nomenclature_id = p_from;
  UPDATE supplier_catalog SET nomenclature_id = p_to WHERE nomenclature_id = p_from;
  UPDATE sku              SET nomenclature_id = p_to WHERE nomenclature_id = p_from;
  UPDATE bom_structures   SET ingredient_id   = p_to WHERE ingredient_id   = p_from;
  UPDATE nomenclature     SET is_available    = false WHERE id = p_from;
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- STEP 1: DEACTIVATE non-food items
-- ═══════════════════════════════════════════════════════════════
UPDATE nomenclature SET is_available = false
WHERE product_code IN (
  'RAW-AUTO-8547deb8',  -- #1P01964 CENTRA ROCK 200 ml (unknown non-food)
  'RAW-AUTO-1c68ee99',  -- MAKRO Shopping Bag 60x56 cm
  'RAW-AUTO-d09a3238',  -- Chai Dee Paper Bag
  'RAW-AUTO-de50c44f',  -- Singha Drinking Water 1.5L X 6
  'RAW-AUTO-fbd884f6',  -- Ice 1 kg
  'RAW-AUTO-4cec0b11'   -- Unknown item (verify from photo)
) AND is_available = true;

-- ═══════════════════════════════════════════════════════════════
-- STEP 2: MERGE into existing curated items
-- ═══════════════════════════════════════════════════════════════

-- Red Onion pack 1 kg → RAW-RED_ONION
SELECT pg_temp.do_merge(
  (SELECT id FROM nomenclature WHERE product_code = 'RAW-AUTO-e57dcdd5'),
  (SELECT id FROM nomenclature WHERE product_code = 'RAW-RED_ONION')
) WHERE EXISTS (SELECT 1 FROM nomenclature WHERE product_code = 'RAW-AUTO-e57dcdd5' AND is_available = true);

-- Heritage Baked Pumpkin Seeds → RAW-PUMPKIN-SEEDS
SELECT pg_temp.do_merge(
  (SELECT id FROM nomenclature WHERE product_code = 'RAW-AUTO-32db4709'),
  (SELECT id FROM nomenclature WHERE product_code = 'RAW-PUMPKIN-SEEDS')
) WHERE EXISTS (SELECT 1 FROM nomenclature WHERE product_code = 'RAW-AUTO-32db4709' AND is_available = true);

-- Three Color Bell Peppers Grade C → RAW-BELL-PEPPER-RED (Tricolor)
SELECT pg_temp.do_merge(
  (SELECT id FROM nomenclature WHERE product_code = 'RAW-de20f0de'),
  (SELECT id FROM nomenclature WHERE product_code = 'RAW-BELL-PEPPER-RED')
) WHERE EXISTS (SELECT 1 FROM nomenclature WHERE product_code = 'RAW-de20f0de' AND is_available = true);

-- Perfecta Pizzarella Cheese → RAW-CHEESE-MOZZARELLA
SELECT pg_temp.do_merge(
  (SELECT id FROM nomenclature WHERE product_code = 'RAW-AUTO-b95dc02f'),
  (SELECT id FROM nomenclature WHERE product_code = 'RAW-CHEESE-MOZZARELLA')
) WHERE EXISTS (SELECT 1 FROM nomenclature WHERE product_code = 'RAW-AUTO-b95dc02f' AND is_available = true);

-- ═══════════════════════════════════════════════════════════════
-- STEP 3: MERGE internal duplicates (hash → hash, keep one)
-- ═══════════════════════════════════════════════════════════════

-- Rice flour: Bai Yok → ARO (ARO gets renamed later to RAW-FLOUR-RICE)
SELECT pg_temp.do_merge(
  (SELECT id FROM nomenclature WHERE product_code = 'RAW-AUTO-fd6d1046'),
  (SELECT id FROM nomenclature WHERE product_code = 'RAW-d9cd5a8b')
) WHERE EXISTS (SELECT 1 FROM nomenclature WHERE product_code = 'RAW-AUTO-fd6d1046' AND is_available = true);

-- Orange melon: RAW-6ecf6d76 → RAW-7506749a (winner gets renamed)
SELECT pg_temp.do_merge(
  (SELECT id FROM nomenclature WHERE product_code = 'RAW-6ecf6d76'),
  (SELECT id FROM nomenclature WHERE product_code = 'RAW-7506749a')
) WHERE EXISTS (SELECT 1 FROM nomenclature WHERE product_code = 'RAW-6ecf6d76' AND is_available = true);

-- Mixed Fruit Juice: RAW-5d2b58eb → RAW-a70fb4ac (winner gets renamed)
SELECT pg_temp.do_merge(
  (SELECT id FROM nomenclature WHERE product_code = 'RAW-5d2b58eb'),
  (SELECT id FROM nomenclature WHERE product_code = 'RAW-a70fb4ac')
) WHERE EXISTS (SELECT 1 FROM nomenclature WHERE product_code = 'RAW-5d2b58eb' AND is_available = true);

-- Red Oak Lettuce: RAW-bc8e7fa0 → RAW-c0178053 (winner gets renamed)
SELECT pg_temp.do_merge(
  (SELECT id FROM nomenclature WHERE product_code = 'RAW-bc8e7fa0'),
  (SELECT id FROM nomenclature WHERE product_code = 'RAW-c0178053')
) WHERE EXISTS (SELECT 1 FROM nomenclature WHERE product_code = 'RAW-bc8e7fa0' AND is_available = true);

-- Japanese Pumpkin: RAW-AUTO-dae3ff66 → RAW-AUTO-eea34843 (winner gets renamed)
SELECT pg_temp.do_merge(
  (SELECT id FROM nomenclature WHERE product_code = 'RAW-AUTO-dae3ff66'),
  (SELECT id FROM nomenclature WHERE product_code = 'RAW-AUTO-eea34843')
) WHERE EXISTS (SELECT 1 FROM nomenclature WHERE product_code = 'RAW-AUTO-dae3ff66' AND is_available = true);

-- Sweet Corn: RAW-d27ee219 (Kernel) → RAW-d94f4168 (Cut) — same product
SELECT pg_temp.do_merge(
  (SELECT id FROM nomenclature WHERE product_code = 'RAW-d27ee219'),
  (SELECT id FROM nomenclature WHERE product_code = 'RAW-d94f4168')
) WHERE EXISTS (SELECT 1 FROM nomenclature WHERE product_code = 'RAW-d27ee219' AND is_available = true);

-- Cantaloupe: RAW-bd7bfa65 → RAW-7506749a (orange melon winner) — same fruit
SELECT pg_temp.do_merge(
  (SELECT id FROM nomenclature WHERE product_code = 'RAW-bd7bfa65'),
  (SELECT id FROM nomenclature WHERE product_code = 'RAW-7506749a')
) WHERE EXISTS (SELECT 1 FROM nomenclature WHERE product_code = 'RAW-bd7bfa65' AND is_available = true);

-- AP Flour: RED LOTUS → KITE (winner gets renamed to RAW-FLOUR-AP)
SELECT pg_temp.do_merge(
  (SELECT id FROM nomenclature WHERE product_code = 'RAW-7bf108e5'),
  (SELECT id FROM nomenclature WHERE product_code = 'RAW-432c49a2')
) WHERE EXISTS (SELECT 1 FROM nomenclature WHERE product_code = 'RAW-7bf108e5' AND is_available = true);

-- Tamarind paste: RAW-eef302e0 (wet) → RAW-b8042655 (with seeds) — merge if same
-- Actually keeping separate: "with seeds" ≠ "wet paste". Both get renamed.

-- ═══════════════════════════════════════════════════════════════
-- STEP 4: RENAME remaining hash-coded items to readable codes
-- ═══════════════════════════════════════════════════════════════
-- Using a mapping table for atomic bulk update

UPDATE nomenclature n
SET    product_code = m.new_code,
       updated_at   = now()
FROM (VALUES
  -- Cheese
  ('RAW-AUTO-53290016', 'RAW-CHEESE-SHREDDED'),
  ('RAW-21c7ab11',      'RAW-CHEESE-GOUDA-SHREDDED'),
  ('RAW-c94f8857',      'RAW-CHEESE-BLUE'),
  ('RAW-AUTO-7caaf89b', 'RAW-CHEESE-LAUGHING-COW'),
  -- Flour
  ('RAW-d9cd5a8b',      'RAW-FLOUR-RICE'),
  ('RAW-432c49a2',      'RAW-FLOUR-AP'),
  ('RAW-d41ec6e2',      'RAW-FLOUR-SEMOLINA'),
  ('RAW-5a458281',      'RAW-FLOUR-FARINA'),
  -- Curry paste
  ('RAW-e5f926c0',      'RAW-CURRY-PASTE-GREEN'),
  ('RAW-ec2280e0',      'RAW-CURRY-PASTE-MASSAMAN'),
  ('RAW-79574efd',      'RAW-CURRY-PASTE-PANANG'),
  ('RAW-5febf4ff',      'RAW-CURRY-PASTE-RED'),
  -- Meat
  ('RAW-AUTO-7ce97a61', 'RAW-BEEF-ANGUS'),
  ('RAW-AUTO-a20dac44', 'RAW-BEEF-PICANHA'),
  ('RAW-AUTO-376a513a', 'RAW-LAMB-SHOULDER'),
  ('RAW-d72776b0',      'RAW-CHICKEN-LIVER'),
  ('RAW-ecbba865',      'RAW-CHICKEN-TENDERLOIN'),
  ('RAW-bf468c3d',      'RAW-CHICKEN-CUT'),
  ('RAW-AUTO-20d14ed2', 'RAW-CHICKEN-BREAST-DISCOUNT'),
  ('RAW-66e4ff1b',      'RAW-SALAMI'),
  -- Vegetables
  ('RAW-d94f4168',      'RAW-FROZEN-SWEET-CORN'),
  ('RAW-AUTO-87b8976e', 'RAW-FROZEN-VEG-MIXED'),
  ('RAW-AUTO-eea34843', 'RAW-PUMPKIN-JAPANESE'),
  ('RAW-AUTO-93d2e23d', 'RAW-SWEET-POTATO-JAPANESE'),
  ('RAW-2d52ff15',      'RAW-SQUASH-BUTTERNUT'),
  ('RAW-27010776',      'RAW-OKRA'),
  ('RAW-AUTO-12b3daba', 'RAW-TOMATO-FRESH'),
  ('RAW-AUTO-d9bf0b95', 'RAW-TOMATO-ROMA'),
  ('RAW-c0178053',      'RAW-LETTUCE-RED-OAK'),
  ('RAW-f47ac144',      'RAW-SPROUTS-SUNFLOWER'),
  ('RAW-AUTO-9672fa0b', 'RAW-TOFU'),
  -- Onion / Garlic
  ('RAW-AUTO-5d958735', 'RAW-ONION-YELLOW'),
  ('RAW-AUTO-155a445a', 'RAW-GARLIC-CHINESE'),
  -- Fruit
  ('RAW-7506749a',      'RAW-MELON-CANTALOUPE'),
  ('RAW-AUTO-b8cb8858', 'RAW-APPLE-GALA'),
  ('RAW-AUTO-323030b4', 'RAW-APPLE-GREEN'),
  ('RAW-AUTO-c5b0329c', 'RAW-KIWI-GREEN'),
  ('RAW-AUTO-549be19b', 'RAW-POMEGRANATE'),
  ('RAW-AUTO-5e3f15d2', 'RAW-BLUEBERRY-FRESH'),
  ('RAW-3f6f48c3',      'RAW-GRAPES-RED'),
  ('RAW-AUTO-9c68ac92', 'RAW-BANANA-EGG'),
  ('RAW-AUTO-7bec2a73', 'RAW-ORANGE-WOGAN'),
  ('RAW-AUTO-39ce9966', 'RAW-MYROBALAN'),
  ('RAW-353197e1',      'RAW-GOOSEBERRY-CAPE'),
  ('RAW-78e9a14d',      'RAW-GOJI-BERRY'),
  -- Herbs & Spices
  ('RAW-544760e1',      'RAW-BAY-LEAVES'),
  ('RAW-AUTO-bee0362b', 'RAW-MINT-LEAVES'),
  ('RAW-8334e00e',      'RAW-SAGE'),
  ('RAW-b79d2072',      'RAW-CHRYSANTHEMUM'),
  ('RAW-e474ce73',      'RAW-LONG-PEPPER'),
  ('RAW-2212552b',      'RAW-CHILI-GROUND'),
  ('RAW-ca46435e',      'RAW-SPICE-BIRYANI-MASALA'),
  ('RAW-c0073b1b',      'RAW-SPICE-TANDOORI-MASALA'),
  -- Condiments & Sauces
  ('RAW-3a07ab4c',      'RAW-VINEGAR-RED-WINE'),
  ('RAW-a565e6f7',      'RAW-MUSTARD-WHOLEGRAIN'),
  ('RAW-08c4acb9',      'RAW-TRUFFLE-SAUCE'),
  ('RAW-b8042655',      'RAW-TAMARIND-PASTE-SEEDS'),
  ('RAW-eef302e0',      'RAW-TAMARIND-PASTE-WET'),
  ('RAW-343ec0e8',      'RAW-JAM-BLUEBERRY'),
  -- Dairy & Drinks
  ('RAW-AUTO-a634eb9a', 'RAW-HONEY-ARO'),
  ('RAW-AUTO-729b6157', 'RAW-MILK-FRESH'),
  ('RAW-AUTO-0272dbb3', 'RAW-WINE-CHARDONNAY'),
  ('RAW-a70fb4ac',      'RAW-JUICE-MIXED-FRUIT'),
  ('RAW-7c858f0b',      'RAW-COFFEE-ESPRESSO'),
  ('RAW-3101cd04',      'RAW-COFFEE-INSTANT'),
  -- Dry goods & Nuts
  ('RAW-AUTO-ced0f70c', 'RAW-DRIED-APRICOTS'),
  ('RAW-AUTO-186c4e64', 'RAW-DRIED-CRANBERRIES'),
  ('RAW-AUTO-ab05eaf0', 'RAW-DRIED-EGGPLANT'),
  ('RAW-8386791e',      'RAW-COCONUT-DESICCATED'),
  ('RAW-9cdbf2cb',      'RAW-PEANUTS'),
  ('RAW-ff4c0714',      'RAW-CHESTNUTS-ROASTED'),
  ('RAW-7e746599',      'RAW-BEANS-MIXED'),
  ('RAW-ea320d81',      'RAW-ROSELLE-DRIED'),
  -- Misc
  ('RAW-AUTO-556dbee1', 'RAW-SUGAR'),
  ('RAW-d401646d',      'RAW-SALT-SEA-COARSE'),
  ('RAW-5f801d01',      'RAW-WASABI-PASTE'),
  ('RAW-AUTO-5fbccb02', 'RAW-LUK-SA'),
  -- Pineapple juice (product_code based)
  ('RAW-AUTO-385517f9', 'RAW-JUICE-PINEAPPLE')
) AS m(old_code, new_code)
WHERE n.product_code = m.old_code
  AND n.is_available = true;

-- ═══════════════════════════════════════════════════════════════
-- STEP 5: Also cascade-merge inactive bell pepper duplicates
-- (from user's original table — these may be is_available=false
--  but still have dangling purchase_logs FKs)
-- ═══════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_target UUID;
  v_dup    RECORD;
BEGIN
  SELECT id INTO v_target FROM nomenclature WHERE product_code = 'RAW-BELL-PEPPER-RED';
  IF v_target IS NULL THEN RETURN; END IF;

  FOR v_dup IN
    SELECT id FROM nomenclature
    WHERE product_code ~ '^RAW-AUTO-' AND name ILIKE '%bell pepper%' AND id != v_target
  LOOP
    UPDATE purchase_logs    SET nomenclature_id = v_target WHERE nomenclature_id = v_dup.id;
    UPDATE supplier_catalog SET nomenclature_id = v_target WHERE nomenclature_id = v_dup.id;
    UPDATE sku              SET nomenclature_id = v_target WHERE nomenclature_id = v_dup.id;
    UPDATE bom_structures   SET ingredient_id   = v_target WHERE ingredient_id   = v_dup.id;
    UPDATE nomenclature     SET is_available    = false    WHERE id = v_dup.id;
  END LOOP;
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- STEP 6: Add sheriff rule — catch future hash-coded items
-- ═══════════════════════════════════════════════════════════════
INSERT INTO data_health_rules (rule_code, title, description, entity_kind, metric, detect_sql, fix_strategy, severity, auto_apply, created_by)
VALUES (
  'HASH_CODED_PRODUCT_CODE',
  'Hash-coded nomenclature items need human-readable codes',
  'Nomenclature items with auto-generated hash codes (RAW-AUTO-{hex} or RAW-{hex8}) should be renamed to human-readable codes or merged into existing items.',
  'nomenclature',
  'naming_convention',
  $detect$
    SELECT id, product_code, name, cost_per_unit
    FROM   nomenclature
    WHERE  product_code ~ '^RAW-(AUTO-)?[0-9a-f]{8}$'
      AND  is_available = true
    ORDER  BY name;
  $detect$,
  'Manual: merge into existing curated item or rename to RAW-{READABLE-NAME}',
  'warn',
  false,
  'migration_178'
)
ON CONFLICT (rule_code) DO UPDATE
SET title       = EXCLUDED.title,
    description = EXCLUDED.description,
    detect_sql  = EXCLUDED.detect_sql;

-- ═══════════════════════════════════════════════════════════════
-- Self-register in migration_log
-- ═══════════════════════════════════════════════════════════════
INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '178_cleanup_hash_coded_nomenclature.sql',
  'claude-code',
  NULL,
  'Cleanup 95 hash-coded nomenclature: 6 deactivated, 12 merged, 77 renamed, 1 sheriff rule added'
);

COMMIT;
