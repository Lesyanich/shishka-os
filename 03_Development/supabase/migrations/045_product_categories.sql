-- ═══════════════════════════════════════════════════════════════
-- Migration 045: Product Categories + Brands + Tags
-- Phase 7.0: FMCG + Restaurant Hybrid Categorization System
-- ═══════════════════════════════════════════════════════════════
-- PURPOSE: Introduce a proper 3-level product classification hierarchy
--          independent of financial categories (fin_categories).
--
-- ARCHITECTURE:
--   nomenclature.category_id  → product_categories  (WHAT is it?)
--   nomenclature.brand_id     → brands              (WHO makes it?)
--   nomenclature_tags         → tags                 (WHAT properties?)
--   product_categories.default_fin_sub_code → fin_sub_categories (auto-derive finance)
--
-- STANDARDS REFERENCED:
--   GS1 GPC (Segment→Family→Class→Brick)
--   ECR Category Management (Russian FMCG: Магнит/Лента)
--   Restaurant365 (3-level item categories)
--   USDA FoodData Central (14 main groups)
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- ──────────────────────────────────────────────────────────────
-- Part A: CREATE TYPE tag_group
-- ──────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE tag_group AS ENUM (
    'dietary',
    'allergen',
    'functional',
    'storage',
    'quality',
    'cuisine',
    'technique'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ──────────────────────────────────────────────────────────────
-- Part B: CREATE TABLE product_categories
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS product_categories (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code               TEXT UNIQUE NOT NULL,
  name               TEXT NOT NULL,
  name_th            TEXT,
  parent_id          UUID REFERENCES product_categories(id) ON DELETE RESTRICT,
  level              SMALLINT NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 3),
  sort_order         INTEGER NOT NULL DEFAULT 0,
  default_fin_sub_code INTEGER REFERENCES fin_sub_categories(sub_code),
  is_active          BOOLEAN NOT NULL DEFAULT true,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pc_parent ON product_categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_pc_level  ON product_categories(level);

ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pc_select" ON product_categories FOR SELECT USING (true);
CREATE POLICY "pc_insert" ON product_categories FOR INSERT WITH CHECK (true);
CREATE POLICY "pc_update" ON product_categories FOR UPDATE USING (true);

CREATE TRIGGER trg_pc_updated_at
  BEFORE UPDATE ON product_categories
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

COMMENT ON TABLE product_categories IS 'Self-referencing 3-level product classification hierarchy. Separate from fin_categories (financial reporting).';
COMMENT ON COLUMN product_categories.code IS 'Hierarchical text code: F (L1), F-PRD (L2), F-PRD-VEG (L3)';
COMMENT ON COLUMN product_categories.default_fin_sub_code IS 'Default financial sub-category. Auto-derive: product_category → fin_sub_category for expense routing.';

-- ──────────────────────────────────────────────────────────────
-- Part C: CREATE TABLE brands
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS brands (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT UNIQUE NOT NULL,
  name_th     TEXT,
  country     TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE brands ENABLE ROW LEVEL SECURITY;
CREATE POLICY "brands_select" ON brands FOR SELECT USING (true);
CREATE POLICY "brands_insert" ON brands FOR INSERT WITH CHECK (true);
CREATE POLICY "brands_update" ON brands FOR UPDATE USING (true);

CREATE TRIGGER trg_brands_updated_at
  BEFORE UPDATE ON brands
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

COMMENT ON TABLE brands IS 'Normalized brand directory. Referenced by nomenclature and supplier_products.';

-- ──────────────────────────────────────────────────────────────
-- Part D: CREATE TABLE tags + nomenclature_tags
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tags (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL,
  name_th     TEXT,
  tag_group   tag_group NOT NULL,
  color       TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tags_group ON tags(tag_group);

ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tags_select" ON tags FOR SELECT USING (true);
CREATE POLICY "tags_insert" ON tags FOR INSERT WITH CHECK (true);
CREATE POLICY "tags_update" ON tags FOR UPDATE USING (true);

COMMENT ON TABLE tags IS 'Cross-cutting product attributes: dietary, allergen, storage, functional, quality, cuisine, technique.';

CREATE TABLE IF NOT EXISTS nomenclature_tags (
  nomenclature_id UUID NOT NULL REFERENCES nomenclature(id) ON DELETE CASCADE,
  tag_id          UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (nomenclature_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_nt_tag ON nomenclature_tags(tag_id);

ALTER TABLE nomenclature_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nt_select" ON nomenclature_tags FOR SELECT USING (true);
CREATE POLICY "nt_insert" ON nomenclature_tags FOR INSERT WITH CHECK (true);
CREATE POLICY "nt_delete" ON nomenclature_tags FOR DELETE USING (true);

COMMENT ON TABLE nomenclature_tags IS 'Junction: nomenclature ↔ tags (many-to-many).';

-- ══════════════════════════════════════════════════════════════
-- Part E: SEED product_categories (3 L1 + 16 L2 + 56 L3)
-- ══════════════════════════════════════════════════════════════

-- ── L1: Sectors ──
INSERT INTO product_categories (code, name, name_th, level, sort_order) VALUES
  ('F',  'Food',              'อาหาร',           1, 1),
  ('NF', 'Non-Food',          'สินค้าไม่ใช่อาหาร', 1, 2),
  ('KP', 'Kitchen Production', 'ผลิตภัณฑ์ครัว',    1, 3)
ON CONFLICT (code) DO NOTHING;

-- ── L2: Groups under FOOD ──
INSERT INTO product_categories (code, name, name_th, parent_id, level, sort_order) VALUES
  ('F-PRD', 'Produce',              'ผักผลไม้',     (SELECT id FROM product_categories WHERE code='F'), 2, 1),
  ('F-PRO', 'Proteins',             'โปรตีน',       (SELECT id FROM product_categories WHERE code='F'), 2, 2),
  ('F-GRN', 'Grains',               'ธัญพืช',       (SELECT id FROM product_categories WHERE code='F'), 2, 3),
  ('F-DAI', 'Dairy & Fats',         'นม/ไขมัน',     (SELECT id FROM product_categories WHERE code='F'), 2, 4),
  ('F-NTS', 'Nuts & Seeds',         'ถั่ว/เมล็ด',    (SELECT id FROM product_categories WHERE code='F'), 2, 5),
  ('F-SPC', 'Spices & Pantry',      'เครื่องเทศ',    (SELECT id FROM product_categories WHERE code='F'), 2, 6),
  ('F-BKR', 'Bakery',               'เบเกอรี่',      (SELECT id FROM product_categories WHERE code='F'), 2, 7),
  ('F-FRM', 'Fermented & Preserved','หมักดอง',       (SELECT id FROM product_categories WHERE code='F'), 2, 8),
  ('F-SAU', 'Sauces & Condiments',  'ซอส/เครื่องปรุง', (SELECT id FROM product_categories WHERE code='F'), 2, 9),
  ('F-BEV', 'Beverages',            'เครื่องดื่ม',    (SELECT id FROM product_categories WHERE code='F'), 2, 10),
  ('F-SNK', 'Snacks',               'ขนม',          (SELECT id FROM product_categories WHERE code='F'), 2, 11),
  ('F-SUP', 'Superfoods & Functional','ซุปเปอร์ฟู้ด', (SELECT id FROM product_categories WHERE code='F'), 2, 12)
ON CONFLICT (code) DO NOTHING;

-- ── L2: Groups under NON-FOOD ──
INSERT INTO product_categories (code, name, name_th, parent_id, level, sort_order) VALUES
  ('NF-CLN', 'Cleaning',    'ทำความสะอาด',  (SELECT id FROM product_categories WHERE code='NF'), 2, 1),
  ('NF-PKG', 'Packaging',   'บรรจุภัณฑ์',    (SELECT id FROM product_categories WHERE code='NF'), 2, 2),
  ('NF-DSP', 'Disposables', 'วัสดุสิ้นเปลือง', (SELECT id FROM product_categories WHERE code='NF'), 2, 3),
  ('NF-OFC', 'Office',      'สำนักงาน',      (SELECT id FROM product_categories WHERE code='NF'), 2, 4)
ON CONFLICT (code) DO NOTHING;

-- ── L2: Groups under KITCHEN PRODUCTION ──
INSERT INTO product_categories (code, name, name_th, parent_id, level, sort_order) VALUES
  ('KP-BSE', 'Bases & Stocks',    'น้ำซุป/เบส',   (SELECT id FROM product_categories WHERE code='KP'), 2, 1),
  ('KP-PRP', 'Prep Components',   'วัตถุดิบเตรียม', (SELECT id FROM product_categories WHERE code='KP'), 2, 2),
  ('KP-FIN', 'Finished Dishes',   'อาหารสำเร็จ',   (SELECT id FROM product_categories WHERE code='KP'), 2, 3),
  ('KP-DRK', 'Drinks',            'เครื่องดื่มสำเร็จ',(SELECT id FROM product_categories WHERE code='KP'), 2, 4),
  ('KP-TOP', 'Toppings & Modifiers','ท็อปปิ้ง',     (SELECT id FROM product_categories WHERE code='KP'), 2, 5)
ON CONFLICT (code) DO NOTHING;

-- ── L3: FOOD → Produce ──
INSERT INTO product_categories (code, name, name_th, parent_id, level, sort_order, default_fin_sub_code) VALUES
  ('F-PRD-VEG', 'Vegetables',       'ผัก',         (SELECT id FROM product_categories WHERE code='F-PRD'), 3, 1, 4101),
  ('F-PRD-FRU', 'Fruit',            'ผลไม้',       (SELECT id FROM product_categories WHERE code='F-PRD'), 3, 2, 4101),
  ('F-PRD-HRB', 'Fresh Herbs',      'สมุนไพรสด',   (SELECT id FROM product_categories WHERE code='F-PRD'), 3, 3, 4101),
  ('F-PRD-MSH', 'Mushrooms',        'เห็ด',        (SELECT id FROM product_categories WHERE code='F-PRD'), 3, 4, 4101),
  ('F-PRD-FRZ', 'Frozen Produce',   'แช่แข็ง',     (SELECT id FROM product_categories WHERE code='F-PRD'), 3, 5, 4101)
ON CONFLICT (code) DO NOTHING;

-- ── L3: FOOD → Proteins ──
INSERT INTO product_categories (code, name, name_th, parent_id, level, sort_order, default_fin_sub_code) VALUES
  ('F-PRO-PLT', 'Poultry',          'สัตว์ปีก',    (SELECT id FROM product_categories WHERE code='F-PRO'), 3, 1, 4102),
  ('F-PRO-RED', 'Red Meat',         'เนื้อแดง',    (SELECT id FROM product_categories WHERE code='F-PRO'), 3, 2, 4102),
  ('F-PRO-SEA', 'Seafood',          'อาหารทะเล',  (SELECT id FROM product_categories WHERE code='F-PRO'), 3, 3, 4102),
  ('F-PRO-EGG', 'Eggs',             'ไข่',         (SELECT id FROM product_categories WHERE code='F-PRO'), 3, 4, 4102),
  ('F-PRO-VEG', 'Plant Protein',    'โปรตีนพืช',   (SELECT id FROM product_categories WHERE code='F-PRO'), 3, 5, 4102)
ON CONFLICT (code) DO NOTHING;

-- ── L3: FOOD → Grains ──
INSERT INTO product_categories (code, name, name_th, parent_id, level, sort_order, default_fin_sub_code) VALUES
  ('F-GRN-RIC', 'Rice & Pseudocereals', 'ข้าว/ควินัว', (SELECT id FROM product_categories WHERE code='F-GRN'), 3, 1, 4103),
  ('F-GRN-OAT', 'Oats & Cereals',       'ข้าวโอ๊ต',    (SELECT id FROM product_categories WHERE code='F-GRN'), 3, 2, 4103),
  ('F-GRN-LGM', 'Legumes',              'ถั่ว',        (SELECT id FROM product_categories WHERE code='F-GRN'), 3, 3, 4103)
ON CONFLICT (code) DO NOTHING;

-- ── L3: FOOD → Dairy & Fats ──
INSERT INTO product_categories (code, name, name_th, parent_id, level, sort_order, default_fin_sub_code) VALUES
  ('F-DAI-MLK', 'Milk & Cream',     'นม/ครีม',     (SELECT id FROM product_categories WHERE code='F-DAI'), 3, 1, 4104),
  ('F-DAI-CHZ', 'Cheese',           'ชีส',         (SELECT id FROM product_categories WHERE code='F-DAI'), 3, 2, 4104),
  ('F-DAI-BTR', 'Butter',           'เนย',         (SELECT id FROM product_categories WHERE code='F-DAI'), 3, 3, 4104),
  ('F-DAI-YGT', 'Yogurt',           'โยเกิร์ต',    (SELECT id FROM product_categories WHERE code='F-DAI'), 3, 4, 4104),
  ('F-DAI-OIL', 'Cooking Oils',     'น้ำมันปรุงอาหาร',(SELECT id FROM product_categories WHERE code='F-DAI'), 3, 5, 4104)
ON CONFLICT (code) DO NOTHING;

-- ── L3: FOOD → Nuts & Seeds ──
INSERT INTO product_categories (code, name, name_th, parent_id, level, sort_order, default_fin_sub_code) VALUES
  ('F-NTS-NUT', 'Tree Nuts',        'ถั่วเปลือกแข็ง', (SELECT id FROM product_categories WHERE code='F-NTS'), 3, 1, 4105),
  ('F-NTS-SDS', 'Seeds',            'เมล็ดพันธุ์',    (SELECT id FROM product_categories WHERE code='F-NTS'), 3, 2, 4105),
  ('F-NTS-BUT', 'Nut Butters',      'เนยถั่ว',       (SELECT id FROM product_categories WHERE code='F-NTS'), 3, 3, 4105)
ON CONFLICT (code) DO NOTHING;

-- ── L3: FOOD → Spices & Pantry ──
INSERT INTO product_categories (code, name, name_th, parent_id, level, sort_order, default_fin_sub_code) VALUES
  ('F-SPC-DRY', 'Dry Spices & Herbs', 'เครื่องเทศแห้ง',  (SELECT id FROM product_categories WHERE code='F-SPC'), 3, 1, 4106),
  ('F-SPC-SLT', 'Salt',               'เกลือ',          (SELECT id FROM product_categories WHERE code='F-SPC'), 3, 2, 4106),
  ('F-SPC-SWT', 'Sweeteners',         'สารให้ความหวาน',  (SELECT id FROM product_categories WHERE code='F-SPC'), 3, 3, 4106),
  ('F-SPC-VNG', 'Vinegar & Acids',    'น้ำส้มสายชู',     (SELECT id FROM product_categories WHERE code='F-SPC'), 3, 4, 4106),
  ('F-SPC-STR', 'Starches & Thickeners','แป้ง/สารข้น',   (SELECT id FROM product_categories WHERE code='F-SPC'), 3, 5, 4106)
ON CONFLICT (code) DO NOTHING;

-- ── L3: FOOD → Bakery ──
INSERT INTO product_categories (code, name, name_th, parent_id, level, sort_order, default_fin_sub_code) VALUES
  ('F-BKR-FLR', 'Flours',           'แป้ง',        (SELECT id FROM product_categories WHERE code='F-BKR'), 3, 1, 4107),
  ('F-BKR-BKP', 'Baking Agents',    'ผงฟู/ยีสต์',  (SELECT id FROM product_categories WHERE code='F-BKR'), 3, 2, 4107),
  ('F-BKR-BRD', 'Bread & Tortillas','ขนมปัง',      (SELECT id FROM product_categories WHERE code='F-BKR'), 3, 3, 4107),
  ('F-BKR-PST', 'Pasta & Noodles',  'พาสต้า/เส้น',  (SELECT id FROM product_categories WHERE code='F-BKR'), 3, 4, 4107)
ON CONFLICT (code) DO NOTHING;

-- ── L3: FOOD → Fermented & Preserved ──
INSERT INTO product_categories (code, name, name_th, parent_id, level, sort_order, default_fin_sub_code) VALUES
  ('F-FRM-FRM', 'Fermented',        'หมัก',       (SELECT id FROM product_categories WHERE code='F-FRM'), 3, 1, 4108),
  ('F-FRM-PKL', 'Pickled',          'ดอง',        (SELECT id FROM product_categories WHERE code='F-FRM'), 3, 2, 4108),
  ('F-FRM-CND', 'Canned Goods',     'กระป๋อง',    (SELECT id FROM product_categories WHERE code='F-FRM'), 3, 3, 4108)
ON CONFLICT (code) DO NOTHING;

-- ── L3: FOOD → Sauces & Condiments ──
INSERT INTO product_categories (code, name, name_th, parent_id, level, sort_order, default_fin_sub_code) VALUES
  ('F-SAU-CHI', 'Chili & Hot Sauces','ซอสพริก',      (SELECT id FROM product_categories WHERE code='F-SAU'), 3, 1, 4111),
  ('F-SAU-SOY', 'Soy-based',         'ซอสถั่วเหลือง', (SELECT id FROM product_categories WHERE code='F-SAU'), 3, 2, 4111),
  ('F-SAU-FSH', 'Fish & Oyster Sauce','น้ำปลา',       (SELECT id FROM product_categories WHERE code='F-SAU'), 3, 3, 4111),
  ('F-SAU-DRS', 'Dressings',         'น้ำสลัด',       (SELECT id FROM product_categories WHERE code='F-SAU'), 3, 4, 4111),
  ('F-SAU-PST', 'Pastes',            'พริกแกง',       (SELECT id FROM product_categories WHERE code='F-SAU'), 3, 5, 4111)
ON CONFLICT (code) DO NOTHING;

-- ── L3: FOOD → Beverages ──
INSERT INTO product_categories (code, name, name_th, parent_id, level, sort_order, default_fin_sub_code) VALUES
  ('F-BEV-TEA', 'Tea & Herbal',     'ชา',         (SELECT id FROM product_categories WHERE code='F-BEV'), 3, 1, 4110),
  ('F-BEV-COF', 'Coffee & Cacao',   'กาแฟ/โกโก้', (SELECT id FROM product_categories WHERE code='F-BEV'), 3, 2, 4110),
  ('F-BEV-POW', 'Powders & Mixes',  'ผงเครื่องดื่ม', (SELECT id FROM product_categories WHERE code='F-BEV'), 3, 3, 4110),
  ('F-BEV-JCE', 'Juice Bases',      'น้ำผลไม้',    (SELECT id FROM product_categories WHERE code='F-BEV'), 3, 4, 4110)
ON CONFLICT (code) DO NOTHING;

-- ── L3: FOOD → Snacks ──
INSERT INTO product_categories (code, name, name_th, parent_id, level, sort_order, default_fin_sub_code) VALUES
  ('F-SNK-BAR', 'Energy Bars',      'บาร์พลังงาน', (SELECT id FROM product_categories WHERE code='F-SNK'), 3, 1, 4109),
  ('F-SNK-CHP', 'Chips & Crackers', 'ขนมกรอบ',    (SELECT id FROM product_categories WHERE code='F-SNK'), 3, 2, 4109)
ON CONFLICT (code) DO NOTHING;

-- ── L3: FOOD → Superfoods ──
INSERT INTO product_categories (code, name, name_th, parent_id, level, sort_order, default_fin_sub_code) VALUES
  ('F-SUP-ADT', 'Adaptogens',       'สมุนไพรปรับสมดุล', (SELECT id FROM product_categories WHERE code='F-SUP'), 3, 1, 4103),
  ('F-SUP-SPF', 'Superfoods',       'ซุปเปอร์ฟู้ด',     (SELECT id FROM product_categories WHERE code='F-SUP'), 3, 2, 4103),
  ('F-SUP-COL', 'Collagen & Aminos','คอลลาเจน',        (SELECT id FROM product_categories WHERE code='F-SUP'), 3, 3, 4103)
ON CONFLICT (code) DO NOTHING;

-- ── L3: NON-FOOD → Cleaning ──
INSERT INTO product_categories (code, name, name_th, parent_id, level, sort_order, default_fin_sub_code) VALUES
  ('NF-CLN-DSH', 'Dishwashing',     'ล้างจาน',     (SELECT id FROM product_categories WHERE code='NF-CLN'), 3, 1, NULL),
  ('NF-CLN-SRF', 'Surface Cleaners','ทำความสะอาดพื้นผิว',(SELECT id FROM product_categories WHERE code='NF-CLN'), 3, 2, NULL),
  ('NF-CLN-SAN', 'Sanitizers',      'ฆ่าเชื้อ',    (SELECT id FROM product_categories WHERE code='NF-CLN'), 3, 3, NULL)
ON CONFLICT (code) DO NOTHING;

-- ── L3: NON-FOOD → Packaging ──
INSERT INTO product_categories (code, name, name_th, parent_id, level, sort_order, default_fin_sub_code) VALUES
  ('NF-PKG-CNT', 'Containers & Bowls','กล่อง/ชาม',   (SELECT id FROM product_categories WHERE code='NF-PKG'), 3, 1, 4200),
  ('NF-PKG-CTL', 'Cutlery & Napkins', 'ช้อนส้อม/ผ้าเช็ด',(SELECT id FROM product_categories WHERE code='NF-PKG'), 3, 2, 4200),
  ('NF-PKG-BAG', 'Bags & Wrap',       'ถุง/ฟิล์ม',    (SELECT id FROM product_categories WHERE code='NF-PKG'), 3, 3, 4200)
ON CONFLICT (code) DO NOTHING;

-- ── L3: NON-FOOD → Disposables ──
INSERT INTO product_categories (code, name, name_th, parent_id, level, sort_order, default_fin_sub_code) VALUES
  ('NF-DSP-GLV', 'Gloves',          'ถุงมือ',      (SELECT id FROM product_categories WHERE code='NF-DSP'), 3, 1, NULL),
  ('NF-DSP-PPR', 'Paper Products',  'กระดาษ',      (SELECT id FROM product_categories WHERE code='NF-DSP'), 3, 2, NULL),
  ('NF-DSP-FLM', 'Film & Foil',     'ฟิล์ม/ฟอยล์', (SELECT id FROM product_categories WHERE code='NF-DSP'), 3, 3, NULL)
ON CONFLICT (code) DO NOTHING;

-- ── L3: NON-FOOD → Office ──
INSERT INTO product_categories (code, name, name_th, parent_id, level, sort_order, default_fin_sub_code) VALUES
  ('NF-OFC-GEN', 'General Office',   'เครื่องเขียน', (SELECT id FROM product_categories WHERE code='NF-OFC'), 3, 1, NULL)
ON CONFLICT (code) DO NOTHING;

-- ── L3: KITCHEN PRODUCTION → Bases ──
INSERT INTO product_categories (code, name, name_th, parent_id, level, sort_order) VALUES
  ('KP-BSE-BRT', 'Broths & Stocks',  'น้ำซุป',    (SELECT id FROM product_categories WHERE code='KP-BSE'), 3, 1),
  ('KP-BSE-SAU', 'Base Sauces',      'ซอสเบส',   (SELECT id FROM product_categories WHERE code='KP-BSE'), 3, 2),
  ('KP-BSE-PUR', 'Purees & Pastes',  'เพียวเร่',   (SELECT id FROM product_categories WHERE code='KP-BSE'), 3, 3)
ON CONFLICT (code) DO NOTHING;

-- ── L3: KITCHEN PRODUCTION → Prep Components ──
INSERT INTO product_categories (code, name, name_th, parent_id, level, sort_order) VALUES
  ('KP-PRP-CUT', 'Cut Vegetables',   'ผักหั่น',       (SELECT id FROM product_categories WHERE code='KP-PRP'), 3, 1),
  ('KP-PRP-MRN', 'Marinades & Mixes','มาริเนด',      (SELECT id FROM product_categories WHERE code='KP-PRP'), 3, 2),
  ('KP-PRP-RCK', 'Cooked Components','วัตถุดิบสุกแล้ว', (SELECT id FROM product_categories WHERE code='KP-PRP'), 3, 3)
ON CONFLICT (code) DO NOTHING;

-- ── L3: KITCHEN PRODUCTION → Finished Dishes ──
INSERT INTO product_categories (code, name, name_th, parent_id, level, sort_order) VALUES
  ('KP-FIN-BWL', 'Bowls',           'โบว์ล',    (SELECT id FROM product_categories WHERE code='KP-FIN'), 3, 1),
  ('KP-FIN-SLD', 'Salads',          'สลัด',     (SELECT id FROM product_categories WHERE code='KP-FIN'), 3, 2),
  ('KP-FIN-SOU', 'Soups',           'ซุป',      (SELECT id FROM product_categories WHERE code='KP-FIN'), 3, 3),
  ('KP-FIN-WRP', 'Wraps & Sandwiches','แรป',    (SELECT id FROM product_categories WHERE code='KP-FIN'), 3, 4)
ON CONFLICT (code) DO NOTHING;

-- ── L3: KITCHEN PRODUCTION → Drinks ──
INSERT INTO product_categories (code, name, name_th, parent_id, level, sort_order) VALUES
  ('KP-DRK-JCE', 'Juices',          'น้ำผลไม้คั้น', (SELECT id FROM product_categories WHERE code='KP-DRK'), 3, 1),
  ('KP-DRK-SMT', 'Smoothies',       'สมูทตี้',      (SELECT id FROM product_categories WHERE code='KP-DRK'), 3, 2),
  ('KP-DRK-HOT', 'Hot Drinks',      'เครื่องดื่มร้อน', (SELECT id FROM product_categories WHERE code='KP-DRK'), 3, 3)
ON CONFLICT (code) DO NOTHING;

-- ── L3: KITCHEN PRODUCTION → Toppings ──
INSERT INTO product_categories (code, name, name_th, parent_id, level, sort_order) VALUES
  ('KP-TOP-CRN', 'Crunchy Toppings', 'ท็อปปิ้งกรอบ',  (SELECT id FROM product_categories WHERE code='KP-TOP'), 3, 1),
  ('KP-TOP-SFT', 'Soft Toppings',    'ท็อปปิ้งนิ่ม',   (SELECT id FROM product_categories WHERE code='KP-TOP'), 3, 2),
  ('KP-TOP-SAU', 'Sauce Toppings',   'ซอสท็อปปิ้ง',   (SELECT id FROM product_categories WHERE code='KP-TOP'), 3, 3),
  ('KP-TOP-BST', 'Boosters',         'บูสเตอร์',      (SELECT id FROM product_categories WHERE code='KP-TOP'), 3, 4)
ON CONFLICT (code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════
-- Part F: SEED brands (from existing supplier_products.brand)
-- ══════════════════════════════════════════════════════════════

INSERT INTO brands (name, country) VALUES
  ('MAKRO',    'TH'),
  ('KNORR',    'TH'),
  ('IMPERIAL', 'TH'),
  ('ALLOWRIE', 'AU'),
  ('ARO',      'TH'),
  ('McGarrett', 'TH'),
  ('Ovaltine',  'TH'),
  ('Wanthip',   'TH'),
  ('Sunlight',  'TH'),
  ('WATTIE''S', 'NZ')
ON CONFLICT (name) DO NOTHING;

-- ══════════════════════════════════════════════════════════════
-- Part G: SEED tags (~37 core tags)
-- ══════════════════════════════════════════════════════════════

-- Dietary
INSERT INTO tags (slug, name, tag_group, sort_order) VALUES
  ('vegan',       'Vegan',        'dietary', 1),
  ('vegetarian',  'Vegetarian',   'dietary', 2),
  ('keto',        'Keto-Friendly','dietary', 3),
  ('paleo',       'Paleo',        'dietary', 4),
  ('whole30',     'Whole30',      'dietary', 5),
  ('halal',       'Halal',        'dietary', 6),
  ('gluten-free', 'Gluten-Free',  'dietary', 7),
  ('dairy-free',  'Dairy-Free',   'dietary', 8)
ON CONFLICT (slug) DO NOTHING;

-- Allergens (Big 8 + sesame)
INSERT INTO tags (slug, name, tag_group, color, sort_order) VALUES
  ('allergen-gluten',    'Contains Gluten',    'allergen', '#E53E3E', 1),
  ('allergen-dairy',     'Contains Dairy',     'allergen', '#E53E3E', 2),
  ('allergen-nuts',      'Contains Nuts',      'allergen', '#E53E3E', 3),
  ('allergen-soy',       'Contains Soy',       'allergen', '#E53E3E', 4),
  ('allergen-eggs',      'Contains Eggs',      'allergen', '#E53E3E', 5),
  ('allergen-fish',      'Contains Fish',      'allergen', '#E53E3E', 6),
  ('allergen-shellfish', 'Contains Shellfish', 'allergen', '#E53E3E', 7),
  ('allergen-sesame',    'Contains Sesame',    'allergen', '#E53E3E', 8)
ON CONFLICT (slug) DO NOTHING;

-- Storage
INSERT INTO tags (slug, name, tag_group, color, sort_order) VALUES
  ('storage-frozen',  'Frozen',       'storage', '#3182CE', 1),
  ('storage-chilled', 'Chilled (0-4°C)','storage', '#38A169', 2),
  ('storage-ambient', 'Ambient',      'storage', '#D69E2E', 3),
  ('storage-dry',     'Dry Storage',  'storage', '#A0AEC0', 4)
ON CONFLICT (slug) DO NOTHING;

-- Quality
INSERT INTO tags (slug, name, tag_group, color, sort_order) VALUES
  ('organic',  'Organic',       'quality', '#48BB78', 1),
  ('non-gmo',  'Non-GMO',       'quality', '#48BB78', 2),
  ('local-th', 'Local (Thai)',   'quality', '#48BB78', 3)
ON CONFLICT (slug) DO NOTHING;

-- Functional
INSERT INTO tags (slug, name, tag_group, color, sort_order) VALUES
  ('high-protein',       'High Protein',       'functional', '#805AD5', 1),
  ('low-carb',           'Low Carb',           'functional', '#805AD5', 2),
  ('probiotic',          'Probiotic',          'functional', '#805AD5', 3),
  ('antioxidant',        'Antioxidant-Rich',   'functional', '#805AD5', 4),
  ('anti-inflammatory',  'Anti-Inflammatory',  'functional', '#805AD5', 5),
  ('adaptogenic',        'Adaptogenic',        'functional', '#805AD5', 6)
ON CONFLICT (slug) DO NOTHING;

-- Technique (from CEO Books.xlsx type 8001)
INSERT INTO tags (slug, name, tag_group, sort_order) VALUES
  ('technique-fermented', 'Fermented',  'technique', 1),
  ('technique-raw',       'Raw',        'technique', 2),
  ('technique-roasted',   'Roasted',    'technique', 3),
  ('technique-steamed',   'Steamed',    'technique', 4),
  ('technique-smoked',    'Smoked',     'technique', 5),
  ('technique-sousvide',  'Sous Vide',  'technique', 6)
ON CONFLICT (slug) DO NOTHING;

-- Cuisine (from CEO Books.xlsx type 7001)
INSERT INTO tags (slug, name, tag_group, sort_order) VALUES
  ('cuisine-thai',          'Thai',           'cuisine', 1),
  ('cuisine-japanese',      'Japanese',       'cuisine', 2),
  ('cuisine-mediterranean', 'Mediterranean',  'cuisine', 3),
  ('cuisine-indian',        'Indian',         'cuisine', 4),
  ('cuisine-georgian',      'Georgian',       'cuisine', 5),
  ('cuisine-arabic',        'Arabic',         'cuisine', 6),
  ('cuisine-nordic',        'Nordic',         'cuisine', 7)
ON CONFLICT (slug) DO NOTHING;

COMMIT;
