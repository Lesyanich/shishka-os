-- ============================================================
-- Migration 154: Data Health — Self-Learning Loop Infrastructure
--
-- Problem: Data Health checks (v_data_health_items) detect issues but
-- have no memory of WHAT RULES caught them or WHAT DECISIONS were taken.
-- Each cleanup pass starts from scratch — no learning across runs.
--
-- Solution: Two tables form a learning loop:
--   1. data_health_rules     — declarative registry of detection rules
--                              (rule_code, detect_sql, fix_strategy, confidence)
--   2. data_health_decisions — append-only log of every
--                              (field, old_value, new_value, rule_id, source)
--
-- Boundary vs correction_rules (mig 150):
--   correction_rules is forward-looking — learns from receipt approval diffs
--     to prevent bad data from entering via OCR parsing.
--   data_health_rules is backward-looking — audits existing rows for
--     naming/unit/classification drift and drives cleanup runs.
--   Complementary systems, different data sources, intentionally separate.
--
-- Learning feedback loop:
--   - Each cleanup run reads active rules, proposes fixes
--   - CEO approves/rejects → decisions logged with source='ceo_review'
--   - trigger_count + last_triggered_at updated per rule
--   - Rules with auto_apply=TRUE skip CEO step on next run
--   - New patterns discovered during a run → new rule inserted for next time
-- ============================================================

-- ─── 1. Rules registry ───

CREATE TABLE IF NOT EXISTS public.data_health_rules (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_code         TEXT UNIQUE NOT NULL,
  title             TEXT NOT NULL,
  description       TEXT,

  -- What the rule scans
  entity_kind       TEXT NOT NULL,
  metric            TEXT NOT NULL,
  detect_sql        TEXT NOT NULL,

  -- How to remediate
  fix_strategy      TEXT,
  severity          TEXT NOT NULL CHECK (severity IN ('info','warn','block')),
  auto_apply        BOOLEAN NOT NULL DEFAULT FALSE,
  confidence        NUMERIC CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),

  -- Learning signal
  trigger_count     INTEGER NOT NULL DEFAULT 0,
  last_triggered_at TIMESTAMPTZ,

  -- Lifecycle
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_by        TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.data_health_rules IS
  'Declarative registry of data health detection rules. Each rule has a detect_sql that returns (entity_id, extra_json) for violating rows. Complements correction_rules (receipt learning, forward-looking) — this table is audit-focused (backward-looking).';

COMMENT ON COLUMN public.data_health_rules.detect_sql IS
  'SQL SELECT returning columns: entity_id UUID, product_code TEXT, name TEXT, extra_json JSONB. Used by tools/data-health runners and v_data_health_items.';

COMMENT ON COLUMN public.data_health_rules.auto_apply IS
  'When TRUE, cleanup runner applies fix without CEO review. Promote a rule here only after N consecutive ceo_review decisions with identical fix_strategy.';

CREATE INDEX IF NOT EXISTS idx_data_health_rules_entity_metric
  ON public.data_health_rules (entity_kind, metric) WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_data_health_rules_active
  ON public.data_health_rules (is_active, severity);


-- ─── 2. Decisions log (append-only) ───

CREATE TABLE IF NOT EXISTS public.data_health_decisions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id          UUID NOT NULL,
  rule_id         UUID REFERENCES public.data_health_rules(id) ON DELETE SET NULL,

  -- What was touched
  entity_kind     TEXT NOT NULL,
  entity_id       UUID NOT NULL,
  field           TEXT NOT NULL,

  -- Value change
  old_value       TEXT,
  new_value       TEXT,

  -- Who/how decided
  decision_source TEXT NOT NULL CHECK (decision_source IN ('rule_auto','ceo_review','manual_edit','skip')),
  decided_by      TEXT NOT NULL,
  decided_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes           TEXT
);

COMMENT ON TABLE public.data_health_decisions IS
  'Append-only audit + training log. Every cleanup decision (auto or human) is recorded here. Future agents/scripts can query to learn naming conventions, preferred base_units per category, etc.';

COMMENT ON COLUMN public.data_health_decisions.run_id IS
  'Groups decisions from a single cleanup batch. Allows batch rollback and rule-effectiveness analysis.';

CREATE INDEX IF NOT EXISTS idx_data_health_decisions_run
  ON public.data_health_decisions (run_id);

CREATE INDEX IF NOT EXISTS idx_data_health_decisions_entity
  ON public.data_health_decisions (entity_kind, entity_id);

CREATE INDEX IF NOT EXISTS idx_data_health_decisions_rule
  ON public.data_health_decisions (rule_id) WHERE rule_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_data_health_decisions_decided_at
  ON public.data_health_decisions (decided_at DESC);


-- ─── 3. RLS — authenticated read, service_role write ───

ALTER TABLE public.data_health_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_health_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "data_health_rules_authenticated_read"
  ON public.data_health_rules FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "data_health_rules_service_role_write"
  ON public.data_health_rules FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "data_health_decisions_authenticated_read"
  ON public.data_health_decisions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "data_health_decisions_service_role_write"
  ON public.data_health_decisions FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);


-- ─── 4. Seed initial rules (the 3 patterns found in this session) ───

INSERT INTO public.data_health_rules
  (rule_code, title, description, entity_kind, metric, detect_sql, fix_strategy, severity, confidence, created_by)
VALUES
  (
    'NOMENCLATURE_NAME_WEIGHT_TAIL',
    'Nomenclature name ends with package weight (legacy OCR artifact)',
    'Names like "Dried Roselle, 200g" have pack weight embedded. Weight belongs on sku.package_qty/unit and supplier_catalog.package_weight, never in nomenclature.name (which represents the abstract ingredient).',
    'nomenclature',
    'name_has_weight_tail',
    $sql$SELECT id AS entity_id, product_code, name,
            jsonb_build_object(
              'tail',      substring(name from '[,\s]*\d+\s*(g|kg|ml|l|G|KG|ML|L)\s*$'),
              'base_unit', base_unit
            ) AS extra_json
       FROM public.nomenclature
      WHERE is_available = TRUE
        AND name ~* '\d+\s*(g|kg|ml|l)\s*$'$sql$,
    'strip_weight_tail',
    'warn',
    0.95,
    'claude-opus-session-0424'
  ),
  (
    'NOMENCLATURE_INVALID_BASE_UNIT',
    'Nomenclature base_unit not in canonical set (kg|g|L|ml|pcs|portion)',
    'base_unit must be one of kg/g/L/ml/pcs/portion (migration 138 added portion). Values like pack/bag/bottle/box/m reflect supplier packaging, not canonical unit. Infer from name tail or SKU package_unit; default to category convention (kg for herbs/veg, L for liquids, pcs for items).',
    'nomenclature',
    'invalid_base_unit',
    $sql$SELECT id AS entity_id, product_code, name,
            jsonb_build_object('current', base_unit) AS extra_json
       FROM public.nomenclature
      WHERE is_available = TRUE
        AND (base_unit IS NULL
             OR base_unit NOT IN ('kg','g','L','ml','pcs','portion'))$sql$,
    'set_base_unit_from_name_or_category',
    'warn',
    0.85,
    'claude-opus-session-0424'
  ),
  (
    'NOMENCLATURE_LOWERCASE_L',
    'Nomenclature base_unit uses lowercase "l" instead of canonical "L"',
    'Canonical volume unit is uppercase L to avoid visual confusion with digit 1. Pure case fix.',
    'nomenclature',
    'lowercase_unit',
    $sql$SELECT id AS entity_id, product_code, name,
            jsonb_build_object('current', base_unit) AS extra_json
       FROM public.nomenclature
      WHERE is_available = TRUE
        AND base_unit = 'l'$sql$,
    'uppercase_L',
    'info',
    1.0,
    'claude-opus-session-0424'
  )
ON CONFLICT (rule_code) DO NOTHING;


-- ─── 5. migration_log self-register ───

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '154_data_health_learning_loop.sql',
  'claude-code',
  'Data Health learning loop: data_health_rules (registry) + data_health_decisions (audit log) + 3 seed rules. Complements correction_rules (forward-looking receipt learning).'
) ON CONFLICT (filename) DO NOTHING;
