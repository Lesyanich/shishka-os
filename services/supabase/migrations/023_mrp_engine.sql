-- ============================================================
-- Migration 023: Enterprise MRP Engine & Scenario Planning
-- Phase 5.2 — Master Production Schedule
-- ============================================================
-- Tables: production_plans, plan_targets
-- RPCs:   fn_run_mrp (recursive BOM explosion with inventory deduction)
--         fn_approve_plan (creates production_tasks from MRP output)
-- ============================================================

-- ════════════════════════════════════════════════════════════
-- PART 1: ENUM + TABLES + INDEXES + TRIGGER
-- ════════════════════════════════════════════════════════════

-- 1.1 Enum: plan_status
DO $$ BEGIN
  CREATE TYPE plan_status AS ENUM ('draft', 'active', 'completed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 1.2 Table: production_plans (scenario container)
CREATE TABLE IF NOT EXISTS production_plans (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  target_date   DATE NOT NULL,
  status        plan_status NOT NULL DEFAULT 'draft',
  mrp_result    JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 1.3 Table: plan_targets (SALE items + desired qty)
CREATE TABLE IF NOT EXISTS plan_targets (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id           UUID NOT NULL REFERENCES production_plans(id) ON DELETE CASCADE,
  nomenclature_id   UUID NOT NULL REFERENCES nomenclature(id) ON DELETE RESTRICT,
  target_qty        INTEGER NOT NULL CHECK (target_qty > 0),
  UNIQUE(plan_id, nomenclature_id)
);

-- 1.4 Indexes
CREATE INDEX IF NOT EXISTS idx_plan_targets_plan ON plan_targets(plan_id);
CREATE INDEX IF NOT EXISTS idx_production_plans_status ON production_plans(status);
CREATE INDEX IF NOT EXISTS idx_production_plans_date ON production_plans(target_date);

-- 1.5 Updated_at trigger (reuses fn_set_updated_at from migration 021)
DROP TRIGGER IF EXISTS trg_production_plans_updated_at ON production_plans;
CREATE TRIGGER trg_production_plans_updated_at
  BEFORE UPDATE ON production_plans
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

COMMENT ON TABLE production_plans IS 'MRP scenario plans with cached results';
COMMENT ON TABLE plan_targets IS 'Target SALE quantities per plan';
COMMENT ON COLUMN production_plans.mrp_result IS 'Cached JSON: {prep_schedule, procurement_list, calculated_at}';


-- ════════════════════════════════════════════════════════════
-- PART 2: fn_run_mrp — THE MRP ENGINE (core algorithm)
-- ════════════════════════════════════════════════════════════
-- Algorithm:
--   1. Read plan_targets (SALE items + desired quantities)
--   2. Explode SALE → PF/MOD children via bom_structures
--   3. Deduct "live" PF/MOD inventory (inventory_batches: sealed/opened, not expired)
--   4. Net PF/MOD → explode to RAW children via bom_structures
--   5. Also collect direct SALE → RAW links
--   6. Deduct RAW inventory (inventory_balances)
--   7. Return JSON: {prep_schedule (PF/MOD to make), procurement_list (RAW to buy)}
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION fn_run_mrp(p_plan_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_target_date DATE;
  v_prep  JSONB;
  v_proc  JSONB;
BEGIN
  -- ── 0. Validate plan ──────────────────────────────────
  SELECT target_date INTO v_target_date
  FROM production_plans WHERE id = p_plan_id;

  IF v_target_date IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Plan not found');
  END IF;

  -- ── 1. Prep requirements (PF + MOD) ───────────────────
  DROP TABLE IF EXISTS _mrp_prep;
  CREATE TEMP TABLE _mrp_prep ON COMMIT DROP AS
  WITH prep_gross AS (
    SELECT
      bs.ingredient_id AS nid,
      SUM(pt.target_qty * bs.quantity_per_unit) AS gross
    FROM plan_targets pt
    JOIN bom_structures bs ON bs.parent_id = pt.nomenclature_id
    JOIN nomenclature n ON n.id = bs.ingredient_id
    WHERE pt.plan_id = p_plan_id
      AND (n.product_code LIKE 'PF-%' OR n.product_code LIKE 'MOD-%')
    GROUP BY bs.ingredient_id
  ),
  prep_stock AS (
    SELECT
      ib.nomenclature_id AS nid,
      COALESCE(SUM(ib.weight), 0) AS avail
    FROM inventory_batches ib
    WHERE ib.status IN ('sealed', 'opened')
      AND (ib.expires_at IS NULL OR ib.expires_at > v_target_date::TIMESTAMPTZ)
      AND ib.nomenclature_id IN (SELECT nid FROM prep_gross)
    GROUP BY ib.nomenclature_id
  )
  SELECT
    g.nid,
    g.gross,
    COALESCE(s.avail, 0) AS on_hand,
    GREATEST(g.gross - COALESCE(s.avail, 0), 0) AS net
  FROM prep_gross g
  LEFT JOIN prep_stock s ON s.nid = g.nid;

  -- ── 2. RAW requirements (from PF/MOD net + direct SALE→RAW) ──
  DROP TABLE IF EXISTS _mrp_raw;
  CREATE TEMP TABLE _mrp_raw ON COMMIT DROP AS
  WITH raw_sources AS (
    -- RAW from PF/MOD that need preparation
    SELECT
      bs.ingredient_id AS nid,
      SUM(p.net * bs.quantity_per_unit) AS gross
    FROM _mrp_prep p
    JOIN bom_structures bs ON bs.parent_id = p.nid
    JOIN nomenclature n ON n.id = bs.ingredient_id
    WHERE p.net > 0
      AND n.product_code LIKE 'RAW-%'
    GROUP BY bs.ingredient_id

    UNION ALL

    -- RAW directly linked to SALE items
    SELECT
      bs.ingredient_id AS nid,
      SUM(pt.target_qty * bs.quantity_per_unit) AS gross
    FROM plan_targets pt
    JOIN bom_structures bs ON bs.parent_id = pt.nomenclature_id
    JOIN nomenclature n ON n.id = bs.ingredient_id
    WHERE pt.plan_id = p_plan_id
      AND n.product_code LIKE 'RAW-%'
    GROUP BY bs.ingredient_id
  ),
  raw_agg AS (
    SELECT nid, SUM(gross) AS gross
    FROM raw_sources
    GROUP BY nid
  ),
  raw_stock AS (
    SELECT
      ib.nomenclature_id AS nid,
      COALESCE(ib.quantity, 0) AS avail
    FROM inventory_balances ib
    WHERE ib.nomenclature_id IN (SELECT nid FROM raw_agg)
  )
  SELECT
    a.nid,
    a.gross,
    COALESCE(s.avail, 0) AS on_hand,
    GREATEST(a.gross - COALESCE(s.avail, 0), 0) AS net
  FROM raw_agg a
  LEFT JOIN raw_stock s ON s.nid = a.nid;

  -- ── 3. Build prep_schedule JSON ───────────────────────
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'nomenclature_id', p.nid,
    'product_code',    n.product_code,
    'name',            n.name,
    'gross_qty',       ROUND(p.gross, 3),
    'on_hand',         ROUND(p.on_hand, 3),
    'net_qty',         ROUND(p.net, 3),
    'base_unit',       n.base_unit
  ) ORDER BY n.product_code), '[]'::jsonb)
  INTO v_prep
  FROM _mrp_prep p
  JOIN nomenclature n ON n.id = p.nid
  WHERE p.net > 0;

  -- ── 4. Build procurement_list JSON ────────────────────
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'nomenclature_id', r.nid,
    'product_code',    n.product_code,
    'name',            n.name,
    'gross_qty',       ROUND(r.gross, 3),
    'on_hand',         ROUND(r.on_hand, 3),
    'net_qty',         ROUND(r.net, 3),
    'base_unit',       n.base_unit,
    'cost_per_unit',   COALESCE(n.cost_per_unit, 0),
    'estimated_cost',  ROUND(r.net * COALESCE(n.cost_per_unit, 0), 2)
  ) ORDER BY n.product_code), '[]'::jsonb)
  INTO v_proc
  FROM _mrp_raw r
  JOIN nomenclature n ON n.id = r.nid
  WHERE r.net > 0;

  -- ── 5. Cache results on the plan ──────────────────────
  UPDATE production_plans
  SET mrp_result = jsonb_build_object(
    'prep_schedule',    v_prep,
    'procurement_list', v_proc,
    'calculated_at',    now()
  )
  WHERE id = p_plan_id;

  RETURN jsonb_build_object(
    'success',          true,
    'prep_schedule',    v_prep,
    'procurement_list', v_proc
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

COMMENT ON FUNCTION fn_run_mrp(UUID) IS 'MRP Engine: explodes SALE targets → PF/MOD prep schedule + RAW procurement list, deducting live inventory';


-- ════════════════════════════════════════════════════════════
-- PART 3: fn_approve_plan — Send prep_schedule → Kitchen
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION fn_approve_plan(p_plan_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_plan   RECORD;
  v_item   JSONB;
  v_tasks  INTEGER := 0;
BEGIN
  SELECT id, name, target_date, status, mrp_result
  INTO v_plan
  FROM production_plans WHERE id = p_plan_id;

  IF v_plan.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Plan not found');
  END IF;

  IF v_plan.status != 'draft' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Plan is not in draft status');
  END IF;

  IF v_plan.mrp_result IS NULL OR v_plan.mrp_result->'prep_schedule' = '[]'::jsonb THEN
    RETURN jsonb_build_object('success', false, 'error', 'Run MRP calculation first');
  END IF;

  -- Create production tasks from prep_schedule
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_plan.mrp_result->'prep_schedule')
  LOOP
    INSERT INTO production_tasks (description, status, scheduled_start, expected_duration_min)
    VALUES (
      format('MRP [%s]: %s x%s %s',
        v_plan.name,
        v_item->>'name',
        v_item->>'net_qty',
        v_item->>'base_unit'
      ),
      'pending',
      v_plan.target_date::TIMESTAMPTZ,
      60  -- default 60 min for MRP-generated tasks
    );
    v_tasks := v_tasks + 1;
  END LOOP;

  -- Activate plan
  UPDATE production_plans SET status = 'active' WHERE id = p_plan_id;

  RETURN jsonb_build_object(
    'success',       true,
    'tasks_created', v_tasks
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

COMMENT ON FUNCTION fn_approve_plan(UUID) IS 'Converts MRP prep_schedule into real production_tasks for KDS';


-- ════════════════════════════════════════════════════════════
-- PART 4: RLS + REALTIME
-- ════════════════════════════════════════════════════════════

-- RLS: production_plans
ALTER TABLE production_plans ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY production_plans_select ON production_plans FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY production_plans_insert ON production_plans FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY production_plans_update ON production_plans FOR UPDATE USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY production_plans_delete ON production_plans FOR DELETE USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- RLS: plan_targets
ALTER TABLE plan_targets ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY plan_targets_select ON plan_targets FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY plan_targets_insert ON plan_targets FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY plan_targets_update ON plan_targets FOR UPDATE USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY plan_targets_delete ON plan_targets FOR DELETE USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Realtime
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE production_plans;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE plan_targets;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
