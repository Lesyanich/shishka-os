-- ═══════════════════════════════════════════════════════════════
-- Migration 057: SKU Layer — 3-Tier Product Architecture
-- Phase 10: nomenclature → sku → supplier_catalog
-- ═══════════════════════════════════════════════════════════════
-- PROBLEM: 2-tier architecture (nomenclature → supplier_catalog) causes:
--   1. Data duplication: brand/barcode/package duplicated per supplier
--   2. Inventory blindspot: inventory_balances at nomenclature level,
--      but barcodes on supplier_catalog — scanner can't work
--   3. Analytics gap: brand analytics requires aggregation through price lists
--
-- SOLUTION: Intermediate `sku` table — specific physical product
--   nomenclature = abstract ingredient ("Olive Oil", base_unit: L)
--   sku = physical product ("Monini Extra Virgin 1L", barcode: 800551...)
--   supplier_catalog = supplier offer ("Makro, 500 THB per case of 12")
--
-- UoM conversion stays on supplier_catalog (per-supplier packaging).
-- inventory_balances REPLACED by sku_balances + v_inventory_by_nomenclature.
-- ═══════════════════════════════════════════════════════════════


-- ─── 1. SKU Code Generator ───

CREATE OR REPLACE FUNCTION public.fn_generate_sku_code()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_next INT;
  v_code TEXT;
BEGIN
  -- Get next sequence number from existing sku_code values
  SELECT COALESCE(MAX(
    CASE WHEN sku_code ~ '^SKU-\d+$'
         THEN SUBSTRING(sku_code FROM 5)::INT
         ELSE 0
    END
  ), 0) + 1
  INTO v_next
  FROM public.sku;

  v_code := 'SKU-' || LPAD(v_next::TEXT, 4, '0');
  RETURN v_code;
END;
$$;

COMMENT ON FUNCTION public.fn_generate_sku_code()
  IS 'Generates next SKU code: SKU-0001, SKU-0002, etc. Phase 10.';


-- ─── 2. SKU Table ───

CREATE TABLE public.sku (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku_code          TEXT UNIQUE NOT NULL,
  nomenclature_id   UUID NOT NULL REFERENCES public.nomenclature(id) ON DELETE CASCADE,
  barcode           TEXT,
  product_name      TEXT NOT NULL,
  product_name_th   TEXT,
  full_title        TEXT,
  brand_id          UUID REFERENCES public.brands(id) ON DELETE SET NULL,
  brand             TEXT,
  package_weight    TEXT,
  package_qty       NUMERIC,
  package_unit      TEXT,
  package_type      TEXT,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.sku
  IS 'Physical product (SKU): specific brand+package of an abstract nomenclature ingredient. Phase 10. Many SKUs → one nomenclature.';

-- Indexes
CREATE UNIQUE INDEX idx_sku_barcode ON public.sku(barcode) WHERE barcode IS NOT NULL;
CREATE INDEX idx_sku_nomenclature ON public.sku(nomenclature_id);
CREATE INDEX idx_sku_brand ON public.sku(brand_id) WHERE brand_id IS NOT NULL;

-- RLS
ALTER TABLE public.sku ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sku_auth_full_access" ON public.sku FOR ALL
  USING (public.fn_is_authenticated())
  WITH CHECK (public.fn_is_authenticated());

-- updated_at trigger
CREATE TRIGGER trg_sku_updated_at
  BEFORE UPDATE ON public.sku
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

-- Auto-generate sku_code on INSERT if not provided
CREATE OR REPLACE FUNCTION public.fn_sku_set_code()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.sku_code IS NULL OR NEW.sku_code = '' THEN
    NEW.sku_code := public.fn_generate_sku_code();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sku_set_code
  BEFORE INSERT ON public.sku
  FOR EACH ROW EXECUTE FUNCTION public.fn_sku_set_code();

-- Realtime
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.sku;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ─── 3. SKU Balances Table (replaces inventory_balances) ───

CREATE TABLE public.sku_balances (
  sku_id            UUID PRIMARY KEY REFERENCES public.sku(id) ON DELETE CASCADE,
  nomenclature_id   UUID NOT NULL REFERENCES public.nomenclature(id),
  quantity          NUMERIC NOT NULL DEFAULT 0,
  last_counted_at   TIMESTAMPTZ,
  last_received_at  TIMESTAMPTZ
);

COMMENT ON TABLE public.sku_balances
  IS 'SKU-level inventory balances. Replaces inventory_balances (nomenclature-level). Use v_inventory_by_nomenclature for aggregated view. Phase 10.';

-- Indexes
CREATE INDEX idx_skub_nomenclature ON public.sku_balances(nomenclature_id);

-- RLS
ALTER TABLE public.sku_balances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "skub_auth_full_access" ON public.sku_balances FOR ALL
  USING (public.fn_is_authenticated())
  WITH CHECK (public.fn_is_authenticated());

-- Realtime
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.sku_balances;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ─── 4. Aggregating View (drop-in replacement for inventory_balances) ───

CREATE OR REPLACE VIEW public.v_inventory_by_nomenclature AS
SELECT
  nomenclature_id,
  SUM(quantity) AS quantity,
  MAX(last_counted_at) AS last_counted_at
FROM public.sku_balances
GROUP BY nomenclature_id;

COMMENT ON VIEW public.v_inventory_by_nomenclature
  IS 'Aggregated inventory by nomenclature. Drop-in replacement for inventory_balances. Phase 10.';


-- ─── 5. Extend supplier_catalog + purchase_logs with sku_id ───

ALTER TABLE public.supplier_catalog
  ADD COLUMN IF NOT EXISTS sku_id UUID REFERENCES public.sku(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sc_sku ON public.supplier_catalog(sku_id) WHERE sku_id IS NOT NULL;

ALTER TABLE public.purchase_logs
  ADD COLUMN IF NOT EXISTS sku_id UUID REFERENCES public.sku(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pl_sku ON public.purchase_logs(sku_id) WHERE sku_id IS NOT NULL;
-- Note: purchase_logs already has REVOKE UPDATE on entire table (migration 031)
-- so sku_id is automatically protected.


-- ─── 6. Data Migration: supplier_catalog → sku ───

-- 6a. Create SKUs from barcoded supplier_catalog records (one barcode = one SKU)
INSERT INTO public.sku (
  sku_code, nomenclature_id, barcode,
  product_name, product_name_th, full_title,
  brand_id, brand,
  package_weight, package_qty, package_unit, package_type
)
SELECT
  'SKU-' || LPAD(ROW_NUMBER() OVER (ORDER BY sc.barcode)::TEXT, 4, '0'),
  sc.nomenclature_id,
  sc.barcode,
  COALESCE(sc.product_name, sc.original_name, 'Unknown Product'),
  sc.product_name_th,
  sc.full_title,
  sc.brand_id,
  sc.brand,
  sc.package_weight,
  sc.package_qty,
  sc.package_unit,
  sc.package_type
FROM (
  SELECT DISTINCT ON (barcode)
    barcode, nomenclature_id,
    product_name, product_name_th, full_title,
    brand_id, brand,
    package_weight, package_qty, package_unit, package_type,
    original_name,
    verified_at, updated_at
  FROM public.supplier_catalog
  WHERE barcode IS NOT NULL
    AND nomenclature_id IS NOT NULL
  ORDER BY barcode, verified_at DESC NULLS LAST, updated_at DESC
) sc;

-- 6b. Create SKUs from non-barcoded records (deduplicate by nomenclature + brand + name)
-- Calculate offset for sku_code numbering
DO $$
DECLARE
  v_offset INT;
  v_rec RECORD;
  v_counter INT;
BEGIN
  SELECT COALESCE(MAX(
    CASE WHEN sku_code ~ '^SKU-\d+$'
         THEN SUBSTRING(sku_code FROM 5)::INT
         ELSE 0
    END
  ), 0) INTO v_offset FROM public.sku;

  v_counter := 0;
  FOR v_rec IN
    SELECT DISTINCT ON (sc.nomenclature_id, COALESCE(sc.brand_id::TEXT, '__NULL__'), sc.product_name)
      sc.nomenclature_id,
      sc.product_name,
      sc.product_name_th,
      sc.full_title,
      sc.brand_id,
      sc.brand,
      sc.package_weight,
      sc.package_qty,
      sc.package_unit,
      sc.package_type
    FROM public.supplier_catalog sc
    WHERE sc.barcode IS NULL
      AND sc.nomenclature_id IS NOT NULL
      AND sc.product_name IS NOT NULL
    ORDER BY sc.nomenclature_id, COALESCE(sc.brand_id::TEXT, '__NULL__'), sc.product_name,
             sc.verified_at DESC NULLS LAST, sc.updated_at DESC
  LOOP
    v_counter := v_counter + 1;
    INSERT INTO public.sku (
      sku_code, nomenclature_id,
      product_name, product_name_th, full_title,
      brand_id, brand,
      package_weight, package_qty, package_unit, package_type
    ) VALUES (
      'SKU-' || LPAD((v_offset + v_counter)::TEXT, 4, '0'),
      v_rec.nomenclature_id,
      v_rec.product_name,
      v_rec.product_name_th,
      v_rec.full_title,
      v_rec.brand_id,
      v_rec.brand,
      v_rec.package_weight,
      v_rec.package_qty,
      v_rec.package_unit,
      v_rec.package_type
    );
  END LOOP;
END $$;

-- 6c. Create generic SKUs for nomenclature items that have inventory but no SKU yet
DO $$
DECLARE
  v_offset INT;
  v_rec RECORD;
  v_counter INT;
BEGIN
  SELECT COALESCE(MAX(
    CASE WHEN sku_code ~ '^SKU-\d+$'
         THEN SUBSTRING(sku_code FROM 5)::INT
         ELSE 0
    END
  ), 0) INTO v_offset FROM public.sku;

  v_counter := 0;
  FOR v_rec IN
    SELECT ib.nomenclature_id, n.name, n.base_unit
    FROM public.inventory_balances ib
    JOIN public.nomenclature n ON n.id = ib.nomenclature_id
    WHERE NOT EXISTS (
      SELECT 1 FROM public.sku s WHERE s.nomenclature_id = ib.nomenclature_id
    )
  LOOP
    v_counter := v_counter + 1;
    INSERT INTO public.sku (
      sku_code, nomenclature_id, product_name, package_unit
    ) VALUES (
      'SKU-' || LPAD((v_offset + v_counter)::TEXT, 4, '0'),
      v_rec.nomenclature_id,
      v_rec.name,
      v_rec.base_unit
    );
  END LOOP;
END $$;


-- ─── 7. Backfill supplier_catalog.sku_id ───

-- 7a. Match by barcode (most reliable)
UPDATE public.supplier_catalog sc
SET sku_id = s.id
FROM public.sku s
WHERE sc.barcode IS NOT NULL
  AND s.barcode = sc.barcode;

-- 7b. Match by nomenclature + brand + product_name (non-barcoded)
UPDATE public.supplier_catalog sc
SET sku_id = s.id
FROM public.sku s
WHERE sc.sku_id IS NULL
  AND sc.nomenclature_id IS NOT NULL
  AND sc.product_name IS NOT NULL
  AND s.nomenclature_id = sc.nomenclature_id
  AND COALESCE(s.brand_id::TEXT, '__NULL__') = COALESCE(sc.brand_id::TEXT, '__NULL__')
  AND s.product_name = sc.product_name;

-- 7c. Match remaining by nomenclature_id only (fallback — first available SKU)
UPDATE public.supplier_catalog sc
SET sku_id = (
  SELECT s.id FROM public.sku s
  WHERE s.nomenclature_id = sc.nomenclature_id
  ORDER BY s.created_at ASC
  LIMIT 1
)
WHERE sc.sku_id IS NULL
  AND sc.nomenclature_id IS NOT NULL;


-- ─── 8. Migrate inventory_balances → sku_balances ───

-- For each nomenclature that has inventory, assign to primary SKU (oldest)
INSERT INTO public.sku_balances (sku_id, nomenclature_id, quantity, last_counted_at)
SELECT DISTINCT ON (ib.nomenclature_id)
  s.id,
  ib.nomenclature_id,
  ib.quantity,
  ib.last_counted_at
FROM public.inventory_balances ib
JOIN public.sku s ON s.nomenclature_id = ib.nomenclature_id
ORDER BY ib.nomenclature_id, s.created_at ASC;


-- ─── 9. Deprecation markers ───

COMMENT ON TABLE public.inventory_balances
  IS 'DEPRECATED Phase 10: use sku_balances + v_inventory_by_nomenclature. Will be dropped after RPC migration (058).';

COMMENT ON COLUMN public.nomenclature.brand_id
  IS 'DEPRECATED Phase 10: brand belongs on sku table. Stop writing to this column.';


-- ─── 10. Verification queries (run after applying) ───
-- SELECT count(*) FROM sku;                          -- should match unique products
-- SELECT count(*) FROM sku_balances;                 -- should match inventory items
-- SELECT count(*) FROM supplier_catalog WHERE sku_id IS NOT NULL;  -- all should have sku_id
-- SELECT * FROM v_inventory_by_nomenclature LIMIT 5;  -- should match old inventory_balances
-- Verify data consistency:
-- SELECT ib.nomenclature_id, ib.quantity AS old_qty, v.quantity AS new_qty
-- FROM inventory_balances ib
-- LEFT JOIN v_inventory_by_nomenclature v ON v.nomenclature_id = ib.nomenclature_id
-- WHERE COALESCE(ib.quantity, 0) <> COALESCE(v.quantity, 0);
-- ^ should return 0 rows
