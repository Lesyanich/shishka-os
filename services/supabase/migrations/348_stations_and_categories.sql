-- 348_stations_and_categories.sql
-- Station-based stock management v1 (S1). Plan: CEO-approved 2026-07-03.
-- MC initiative 8b709aa0 (connected stock). Companion migrations: 349-354.
--
-- Stations are the first-class, combinable/splittable count-and-routing scopes
-- the CEO asked for ("Bar", "Manakish", "Salad-bar", L1 process sub-stations).
-- Design (hybrid, deliberate): each station OWNS a dedicated locations row
-- (1:1 anchor). The whole shipped engine (fn_apply_stocktake p_location_id,
-- station_par(nomenclature_id, location_id), v_stock_on_hand_by_location,
-- stock_movements.location_id, stock_transfers) is keyed on location_id, so a
-- private anchor row makes it all work UNCHANGED, while the stations table
-- carries the logical metadata a physical enum-typed table can't (floor, M2M
-- category mapping, lifecycle). Combining/splitting stations = flip is_active,
-- remap station_categories, move batches via stock_transfers; historical
-- stocktake documents keep their station_id, so the audit trail survives
-- reorgs.
--
-- station_categories maps station -> product_categories with a role:
--   consumes = the station holds/uses items of this category (drives the
--              auto-derived count checklist, v_station_checklist mig 351)
--   produces = the station MAKES items of this category (drives PF-low ->
--              production task routing; e.g. juicer is physically at the Bar,
--              doughs are made at L1 Dough & Bake).
-- L1 sub-stations map KP-* prep categories; the category tree is untouched.
--
-- station_extra_items = escape hatch for staples that appear in no mapped
-- category's BOM (bar salt, tea bags) but must still be counted at a station.

-- ── 1. Tables ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.stations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text NOT NULL UNIQUE,
  name        text NOT NULL,
  name_th     text,
  floor       text NOT NULL DEFAULT 'general' CHECK (floor IN ('L1', 'L2', 'general')),
  location_id uuid NOT NULL UNIQUE REFERENCES public.locations(id),
  is_active   boolean NOT NULL DEFAULT true,
  sort_order  int NOT NULL DEFAULT 0,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.station_categories (
  station_id  uuid NOT NULL REFERENCES public.stations(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.product_categories(id) ON DELETE CASCADE,
  role        text NOT NULL DEFAULT 'consumes' CHECK (role IN ('consumes', 'produces')),
  PRIMARY KEY (station_id, category_id, role)
);

CREATE TABLE IF NOT EXISTS public.station_extra_items (
  station_id      uuid NOT NULL REFERENCES public.stations(id) ON DELETE CASCADE,
  nomenclature_id uuid NOT NULL REFERENCES public.nomenclature(id) ON DELETE CASCADE,
  note            text,
  PRIMARY KEY (station_id, nomenclature_id)
);

ALTER TABLE public.stations           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.station_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.station_extra_items ENABLE ROW LEVEL SECURITY;

-- Flat authenticated posture (house style, matches station_par mig 329):
-- admin UI is owner-gated; DB-level role separation is the wider RBAC epic.
DROP POLICY IF EXISTS stations_read  ON public.stations;
CREATE POLICY stations_read  ON public.stations  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS stations_write ON public.stations;
CREATE POLICY stations_write ON public.stations  FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS station_categories_read  ON public.station_categories;
CREATE POLICY station_categories_read  ON public.station_categories FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS station_categories_write ON public.station_categories;
CREATE POLICY station_categories_write ON public.station_categories FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS station_extra_items_read  ON public.station_extra_items;
CREATE POLICY station_extra_items_read  ON public.station_extra_items FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS station_extra_items_write ON public.station_extra_items;
CREATE POLICY station_extra_items_write ON public.station_extra_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT ON public.stations, public.station_categories, public.station_extra_items TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.stations, public.station_categories, public.station_extra_items TO authenticated;

-- ── 2. Seed locations (private anchors + fine storage zones) ───────────────
-- Legacy Kitchen/Assembly/Storage rows are untouched (178 live batches at
-- Kitchen keep working). L2 anchors -> type 'assembly', L1 -> 'kitchen',
-- Freezer/Fridge -> 'storage' (no enum widening needed).

INSERT INTO public.locations (name, type)
SELECT v.name, v.type::location_type
FROM (VALUES
  ('Bar',                  'assembly'),
  ('Manakish Station',     'assembly'),
  ('Salad Bar Station',    'assembly'),
  ('Chocolate Counter',    'assembly'),
  ('Bread Counter',        'assembly'),
  ('L1 Proteins & Grill',  'kitchen'),
  ('L1 Hot Base',          'kitchen'),
  ('L1 Cold Prep',         'kitchen'),
  ('L1 Dough & Bake',      'kitchen'),
  ('Freezer',              'storage'),
  ('Fridge',               'storage')
) AS v(name, type)
WHERE NOT EXISTS (SELECT 1 FROM public.locations l WHERE l.name = v.name);

-- ── 3. Seed stations ────────────────────────────────────────────────────────

INSERT INTO public.stations (code, name, name_th, floor, location_id, sort_order)
SELECT v.code, v.name, v.name_th, v.floor, l.id, v.sort_order
FROM (VALUES
  ('bar',          'Bar',                'บาร์',              'L2', 'Bar',                 10),
  ('manakish',     'Manakish',           'มานาคีช',           'L2', 'Manakish Station',    20),
  ('salad-bar',    'Salad Bar',          'สลัดบาร์',           'L2', 'Salad Bar Station',   30),
  ('chocolate',    'Chocolate',          'ช็อกโกแลต',         'L2', 'Chocolate Counter',   40),
  ('bread',        'Bread',              'ขนมปัง',            'L2', 'Bread Counter',       50),
  ('l1-proteins',  'Proteins & Grill',   'โปรตีนและย่าง',      'L1', 'L1 Proteins & Grill', 60),
  ('l1-hot-base',  'Hot Base',           'ครัวร้อน',           'L1', 'L1 Hot Base',         70),
  ('l1-cold',      'Cold Prep',          'ครัวเย็น',           'L1', 'L1 Cold Prep',        80),
  ('l1-dough',     'Dough & Bake',       'แป้งและอบ',         'L1', 'L1 Dough & Bake',     90),
  ('freezer',      'Freezer',            'แช่แข็ง',            'general', 'Freezer',        100),
  ('fridge',       'Fridge',             'ตู้เย็น',            'general', 'Fridge',         110)
) AS v(code, name, name_th, floor, location_name, sort_order)
JOIN public.locations l ON l.name = v.location_name
WHERE NOT EXISTS (SELECT 1 FROM public.stations s WHERE s.code = v.code);

-- ── 4. Seed station_categories ──────────────────────────────────────────────
-- CEO decisions 2026-07-03. Seed defaults flagged for S1 review (editable
-- rows, not blockers): syrups produced at Hot Base; Proteins & Grills, Soups
-- and sale Sauces & Dressings sections consumed at Salad Bar.

-- Bar consumes every Drinks menu section (children of the Drinks parent).
INSERT INTO public.station_categories (station_id, category_id, role)
SELECT s.id, pc.id, 'consumes'
FROM public.stations s, public.product_categories pc
JOIN public.product_categories par ON par.id = pc.parent_id
WHERE s.code = 'bar' AND par.name = '🧋 Drinks'
ON CONFLICT DO NOTHING;

-- Bar makes AND holds cold-pressed juices (juicer is physically at the bar).
INSERT INTO public.station_categories (station_id, category_id, role)
SELECT s.id, pc.id, r.role
FROM public.stations s
JOIN public.product_categories pc ON pc.code = 'KP-PRP-JUI'
CROSS JOIN (VALUES ('consumes'), ('produces')) AS r(role)
WHERE s.code = 'bar'
ON CONFLICT DO NOTHING;

-- Manakish consumes its three menu subsections (Bundles deliberately unmapped
-- = excluded from stock; they are a pack format of the same manakish).
INSERT INTO public.station_categories (station_id, category_id, role)
SELECT s.id, pc.id, 'consumes'
FROM public.stations s, public.product_categories pc
JOIN public.product_categories par ON par.id = pc.parent_id
WHERE s.code = 'manakish'
  AND par.name = '🫓 Manakish' AND pc.name IN ('Classic', 'Premium', 'Signature')
ON CONFLICT DO NOTHING;

-- Salad Bar consumes the cold-line sections (+ CEO-flagged defaults).
INSERT INTO public.station_categories (station_id, category_id, role)
SELECT s.id, pc.id, 'consumes'
FROM public.stations s, public.product_categories pc
WHERE s.code = 'salad-bar'
  AND pc.name IN ('🥗 Salads', '🥟 Appetizers & Sides', '🥣 Dips',
                  '🍗 Proteins & Grills', '🍜 Soups', '🥫 Sauces & Dressings')
ON CONFLICT DO NOTHING;

-- Chocolate & Bread front counters.
INSERT INTO public.station_categories (station_id, category_id, role)
SELECT s.id, pc.id, r.role
FROM public.stations s
JOIN public.product_categories pc ON pc.name = '🍫 Chocolate'
CROSS JOIN (VALUES ('consumes'), ('produces')) AS r(role)
WHERE s.code = 'chocolate'
ON CONFLICT DO NOTHING;

INSERT INTO public.station_categories (station_id, category_id, role)
SELECT s.id, pc.id, 'consumes'
FROM public.stations s, public.product_categories pc
WHERE s.code = 'bread' AND pc.name = '🥖 Bread & Crackers'
ON CONFLICT DO NOTHING;

-- L1 process sub-stations: each consumes (holds preps + their raws on the
-- checklist) AND produces (routing target) its process categories.
INSERT INTO public.station_categories (station_id, category_id, role)
SELECT s.id, pc.id, r.role
FROM (VALUES
  ('l1-proteins', 'KP-PRP-CHK'), ('l1-proteins', 'KP-PRP-SHR'),
  ('l1-proteins', 'KP-PRP-MEA'), ('l1-proteins', 'KP-PRP-FSH'),
  ('l1-hot-base', 'KP-PRP-VEG'), ('l1-hot-base', 'KP-PRP-GRN'),
  ('l1-hot-base', 'KP-PRP-LEG'), ('l1-hot-base', 'KP-PRP-MSH'),
  ('l1-hot-base', 'KP-BSE-PUR'), ('l1-hot-base', 'KP-BSE-BRT'),
  ('l1-hot-base', 'KP-PRP-SYR'),
  ('l1-cold',     'KP-PRP-SAU'), ('l1-cold',     'KP-PRP-DRS'),
  ('l1-cold',     'KP-PRP-MRN'), ('l1-cold',     'KP-PRP-CUT'),
  ('l1-cold',     'KP-PRP-CRN'), ('l1-cold',     'KP-PRP-DAI'),
  ('l1-cold',     'F-FRM-FRM'),  ('l1-cold',     'KP-PRP-FRZ'),
  ('l1-dough',    'KP-PRP-BRD')
) AS m(station_code, category_code)
JOIN public.stations s ON s.code = m.station_code
JOIN public.product_categories pc ON pc.code = m.category_code
CROSS JOIN (VALUES ('consumes'), ('produces')) AS r(role)
ON CONFLICT DO NOTHING;

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '348_stations_and_categories.sql',
  'claude-code',
  NULL,
  'Station stock v1 S1: stations (1:1 private locations anchor, floor L1/L2/general) + station_categories (consumes|produces M2M to product_categories) + station_extra_items escape hatch. Seeds 11 locations, 11 stations, CEO category mappings (Bundles excluded).'
)
ON CONFLICT DO NOTHING;

-- DOWN (manual, for reference):
-- DELETE FROM public.stations;  -- cascades station_categories/station_extra_items
-- INTENTIONAL DROP (down-path only, never run automatically):
-- DROP TABLE IF EXISTS public.station_extra_items;  -- INTENTIONAL DROP
-- DROP TABLE IF EXISTS public.station_categories;   -- INTENTIONAL DROP
-- DROP TABLE IF EXISTS public.stations;             -- INTENTIONAL DROP
-- DELETE FROM public.locations WHERE name IN ('Bar','Manakish Station','Salad Bar Station','Chocolate Counter','Bread Counter','L1 Proteins & Grill','L1 Hot Base','L1 Cold Prep','L1 Dough & Bake','Freezer','Fridge');
