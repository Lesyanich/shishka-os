-- 303_guard_no_delete_referenced_ingredient.sql
-- Anti-recurrence guard for the dangling-BOM drift fixed in mig 302 (task 12074d5f).
-- Blocks soft-deleting (is_deleted false->true) any nomenclature row that is still
-- referenced as an ingredient by a BOM line whose parent is NOT deleted. Forces the
-- dedup flow to re-point / remove recipe lines first.
--
-- Override hatch for legitimate delete-then-repoint-in-one-txn flows:
--   SELECT set_config('app.allow_bom_orphan_delete','true', true);  -- per-txn
--
-- Also adds v_dangling_bom as a monitoring backstop.
-- NOTE: the cost/nutrition rollups + v_dish_assembly_components are intentionally NOT
-- changed here — they must keep counting is_deleted children until 0 dangling lines
-- remain (currently 2: RAW-LIONS-MANE on draft dishes, deferred). Flip that filter in
-- a later migration once those are resolved.

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_guard_no_delete_referenced_ingredient()
RETURNS trigger LANGUAGE plpgsql AS $function$
DECLARE
  v_uses integer;
BEGIN
  -- override hatch for intentional dedup flows
  IF COALESCE(current_setting('app.allow_bom_orphan_delete', true), '') = 'true' THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_uses
  FROM bom_structures b
  JOIN nomenclature p ON p.id = b.parent_id
  WHERE b.ingredient_id = NEW.id
    AND COALESCE(p.is_deleted, false) = false;

  IF v_uses > 0 THEN
    RAISE EXCEPTION
      'Cannot soft-delete % (%): still used as an ingredient in % active BOM recipe(s). Re-point or remove those lines first, or set app.allow_bom_orphan_delete=true to override.',
      NEW.product_code, NEW.name, v_uses;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_guard_no_delete_referenced_ingredient ON public.nomenclature;
CREATE TRIGGER trg_guard_no_delete_referenced_ingredient
  BEFORE UPDATE ON public.nomenclature
  FOR EACH ROW
  WHEN (NEW.is_deleted = true AND COALESCE(OLD.is_deleted, false) = false)
  EXECUTE FUNCTION public.fn_guard_no_delete_referenced_ingredient();

CREATE OR REPLACE VIEW public.v_dangling_bom AS
SELECT b.id          AS bom_id,
       p.product_code AS parent_code,
       p.pos_status,
       i.product_code AS deleted_ingredient_code,
       i.name         AS deleted_ingredient_name
FROM bom_structures b
JOIN nomenclature p ON p.id = b.parent_id AND COALESCE(p.is_deleted, false) = false
JOIN nomenclature i ON i.id = b.ingredient_id AND i.is_deleted = true;

INSERT INTO migration_log (filename, status)
VALUES ('303_guard_no_delete_referenced_ingredient.sql', 'success')
ON CONFLICT (filename) DO NOTHING;

COMMIT;
