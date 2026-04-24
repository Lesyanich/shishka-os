-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 148: production_log — structured daily kitchen production records
--
-- MC task 2f8ee412. Parent: 4e68fbd2 (Production Log feature).
--
-- PROBLEM: Kitchen team sends daily text reports (what was baked, frozen,
--          fermented + quantities). Chef Agent stores this only in MemPalace
--          text and kitchen-journal.md — no structured DB record. Cannot
--          query production history, calculate yields, or sync inventory.
--
-- SOLUTION: production_log table with product FK, quantity, storage method,
--           and batch notes. MCP tool record_production will write here.
--           Inventory sync (RAW out / PF in by BOM) is a future phase.
--
-- DEPENDS ON: nomenclature (product FK), staff (created_by FK)
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. Storage method enum ───

DO $$ BEGIN
  CREATE TYPE public.storage_method AS ENUM (
    'fridge',       -- cooled, short shelf life (1-3 days)
    'freezer',      -- frozen storage (-18°C)
    'fermented',    -- fermentation process (kimchi, sourdough, etc.)
    'ambient'       -- room temperature (dehydrated, shelf-stable)
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TYPE public.storage_method
  IS 'How the produced item is stored after production. Determines shelf life expectations.';

-- ─── 2. production_log table ───

CREATE TABLE IF NOT EXISTS public.production_log (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id        UUID NOT NULL
                      REFERENCES public.nomenclature(id) ON DELETE RESTRICT,
  production_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  quantity          NUMERIC NOT NULL CHECK (quantity > 0),
  unit              TEXT NOT NULL DEFAULT 'g',
  storage           public.storage_method NOT NULL DEFAULT 'fridge',
  batch_notes       TEXT,
  created_by        UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.production_log
  IS 'Daily kitchen production records. Each row = one product batch produced. Source: Chef Agent via record_production MCP tool or manual entry.';
COMMENT ON COLUMN public.production_log.product_id
  IS 'FK to nomenclature — typically PF (semi-finished) or SALE items.';
COMMENT ON COLUMN public.production_log.production_date
  IS 'Date of production (may differ from created_at if logged next day).';
COMMENT ON COLUMN public.production_log.quantity
  IS 'Amount produced in the specified unit.';
COMMENT ON COLUMN public.production_log.unit
  IS 'Unit of measure (g, kg, pcs, ml, L). Must match nomenclature.base_unit.';
COMMENT ON COLUMN public.production_log.storage
  IS 'Storage method after production — fridge, freezer, fermented, ambient.';
COMMENT ON COLUMN public.production_log.batch_notes
  IS 'Free-text notes: yield observations, deviations, quality remarks.';
COMMENT ON COLUMN public.production_log.created_by
  IS 'Staff member who performed the production (nullable for agent-logged entries).';

-- ─── 3. Indexes ───

CREATE INDEX IF NOT EXISTS idx_prodlog_product_date
  ON public.production_log (product_id, production_date DESC);

CREATE INDEX IF NOT EXISTS idx_prodlog_date
  ON public.production_log (production_date DESC);

-- ─── 4. RLS ───

ALTER TABLE public.production_log ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read all production logs
CREATE POLICY prodlog_select_authenticated
  ON public.production_log FOR SELECT
  TO authenticated
  USING (true);

-- Anon (admin panel) can read all production logs
CREATE POLICY prodlog_select_anon
  ON public.production_log FOR SELECT
  TO anon
  USING (true);

-- Service role (MCP servers) can insert
CREATE POLICY prodlog_insert_service
  ON public.production_log FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Service role can update (corrections)
CREATE POLICY prodlog_update_service
  ON public.production_log FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Anon (admin panel) can also insert for manual entries
CREATE POLICY prodlog_insert_anon
  ON public.production_log FOR INSERT
  TO anon
  WITH CHECK (true);

-- Anon can update for corrections via admin panel
CREATE POLICY prodlog_update_anon
  ON public.production_log FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

-- ── Self-register in migration_log ──
INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '148_production_log.sql',
  'claude-code',
  'production_log table — structured daily kitchen production records with storage_method enum (fridge/freezer/fermented/ambient). RLS: service_role + anon write, all read.'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
