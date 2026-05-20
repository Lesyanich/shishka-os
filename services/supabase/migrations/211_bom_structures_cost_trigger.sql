-- ============================================================
-- Migration 211: Trigger on bom_structures to auto-recalculate cost_per_unit
--
-- PROBLEM: fn_rollup_bom_costs (mig 137) cascades when cost_per_unit
-- changes on a RAW item (WAC update). But when BOM lines are added,
-- removed, or modified (quantity/yield change), nobody calls the rollup.
-- Result: dishes created via Chef MCP show cost=0 until manual rollup.
--
-- FIX: After INSERT/UPDATE/DELETE on bom_structures, call
-- fn_rollup_bom_costs(parent_id) for the affected parent(s).
-- Respects the existing recursion guard (app.bom_rollup_active).
--
-- DEPENDS ON: 137_bom_cost_rollup.sql (fn_rollup_bom_costs)
-- ============================================================


-- ─── Trigger function ───

CREATE OR REPLACE FUNCTION public.fn_bom_structure_cost_cascade()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_parent_id  UUID;
  v_in_rollup  BOOLEAN;
BEGIN
  -- Skip if already inside fn_rollup_bom_costs (it handles its own cascade)
  v_in_rollup := COALESCE(current_setting('app.bom_rollup_active', true), '') = 'true';
  IF v_in_rollup THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Determine which parent(s) need recalculation
  IF TG_OP = 'DELETE' THEN
    v_parent_id := OLD.parent_id;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Recalculate both old and new parent if parent_id changed
    IF OLD.parent_id IS DISTINCT FROM NEW.parent_id THEN
      PERFORM fn_rollup_bom_costs(OLD.parent_id);
    END IF;
    v_parent_id := NEW.parent_id;
  ELSE  -- INSERT
    v_parent_id := NEW.parent_id;
  END IF;

  PERFORM fn_rollup_bom_costs(v_parent_id);

  RETURN COALESCE(NEW, OLD);
END;
$$;

COMMENT ON FUNCTION public.fn_bom_structure_cost_cascade()
  IS 'Trigger function: recalculate parent cost_per_unit when BOM lines change (INSERT/UPDATE/DELETE). Complements trg_cascade_bom_cost from mig 137.';


-- ─── Trigger ───

DROP TRIGGER IF EXISTS trg_bom_structure_cost_cascade ON public.bom_structures;

CREATE TRIGGER trg_bom_structure_cost_cascade
  AFTER INSERT OR UPDATE OR DELETE ON public.bom_structures
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_bom_structure_cost_cascade();


-- ─── Migration log ───

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '211_bom_structures_cost_trigger.sql',
  'claude-code',
  NULL,
  'Trigger on bom_structures INSERT/UPDATE/DELETE to auto-recalculate parent cost_per_unit via fn_rollup_bom_costs. Closes gap from mig 137 where only nomenclature.cost_per_unit changes cascaded.'
) ON CONFLICT (filename) DO NOTHING;
