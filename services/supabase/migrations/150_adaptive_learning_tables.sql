-- ============================================================
-- Migration 150: Adaptive Receipt Learning System tables
-- Tables: supplier_aliases, category_overrides, gs1_weight_items, correction_rules
-- ============================================================

-- ── supplier_aliases: instant supplier name resolution ──
CREATE TABLE IF NOT EXISTS public.supplier_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  source TEXT DEFAULT 'auto',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_supplier_aliases_alias_lower
  ON public.supplier_aliases (LOWER(alias));

CREATE INDEX IF NOT EXISTS idx_supplier_aliases_supplier
  ON public.supplier_aliases (supplier_id);

-- ── category_overrides: learned classification corrections ──
CREATE TABLE IF NOT EXISTS public.category_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_pattern TEXT NOT NULL,
  match_field TEXT DEFAULT 'name',
  supplier_id UUID REFERENCES public.suppliers(id),
  flow_type TEXT NOT NULL,
  category_code INTEGER,
  times_applied INTEGER DEFAULT 0,
  source TEXT DEFAULT 'approval_diff',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_category_overrides_pattern
  ON public.category_overrides (LOWER(match_pattern));

-- ── gs1_weight_items: variable-weight barcode → base item mapping ──
CREATE TABLE IF NOT EXISTS public.gs1_weight_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_barcode TEXT NOT NULL UNIQUE,
  nomenclature_id UUID REFERENCES public.nomenclature(id),
  supplier_id UUID REFERENCES public.suppliers(id),
  unit TEXT DEFAULT 'kg',
  divisor INTEGER DEFAULT 1000,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gs1_base_barcode
  ON public.gs1_weight_items (base_barcode);

-- ── correction_rules: generic learning rules from approval diffs ──
CREATE TABLE IF NOT EXISTS public.correction_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_type TEXT NOT NULL,
  supplier_id UUID REFERENCES public.suppliers(id),
  match_pattern TEXT NOT NULL,
  match_field TEXT NOT NULL,
  correction_value JSONB NOT NULL,
  confidence NUMERIC DEFAULT 1.0,
  times_applied INTEGER DEFAULT 0,
  source TEXT DEFAULT 'approval_diff',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_correction_rules_type
  ON public.correction_rules (rule_type);
CREATE INDEX IF NOT EXISTS idx_correction_rules_pattern
  ON public.correction_rules (LOWER(match_pattern));

-- ── Seed existing supplier names as aliases ──
INSERT INTO public.supplier_aliases (supplier_id, alias, source)
SELECT id, name, 'manual' FROM public.suppliers
WHERE name IS NOT NULL AND name <> ''
ON CONFLICT DO NOTHING;

-- ── Migration log ──
INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '150_adaptive_learning_tables.sql',
  'claude-code',
  'Adaptive learning: supplier_aliases, category_overrides, gs1_weight_items, correction_rules tables'
) ON CONFLICT (filename) DO NOTHING;
