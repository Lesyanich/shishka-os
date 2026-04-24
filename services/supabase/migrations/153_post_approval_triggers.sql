-- ============================================================
-- Migration 153: Post-approval learning triggers
-- Learn from DB corrections (data health, manual edits, unmatched resolution)
-- ============================================================

-- ── Trigger function: learn from purchase_logs nomenclature reassignment ──
CREATE OR REPLACE FUNCTION public.fn_learn_nomenclature_correction()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.barcode IS NOT NULL AND NEW.barcode <> '' THEN
    UPDATE public.supplier_catalog
    SET nomenclature_id = NEW.nomenclature_id,
        updated_at = now()
    WHERE barcode = NEW.barcode
      AND (nomenclature_id IS NULL OR nomenclature_id = OLD.nomenclature_id);

    INSERT INTO public.correction_rules (rule_type, supplier_id, match_pattern, match_field, correction_value, source)
    VALUES (
      'nomenclature',
      NEW.supplier_id,
      NEW.barcode,
      'barcode',
      jsonb_build_object('nomenclature_id', NEW.nomenclature_id),
      'post_approval_trigger'
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_purchase_log_correction
AFTER UPDATE OF nomenclature_id ON public.purchase_logs
FOR EACH ROW
WHEN (OLD.nomenclature_id IS DISTINCT FROM NEW.nomenclature_id
      AND NEW.nomenclature_id IS NOT NULL)
EXECUTE FUNCTION public.fn_learn_nomenclature_correction();

-- ── Trigger function: learn from expense_ledger flow_type/category changes ──
CREATE OR REPLACE FUNCTION public.fn_learn_category_correction()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item RECORD;
BEGIN
  FOR v_item IN
    SELECT notes, barcode FROM public.purchase_logs WHERE expense_id = NEW.id LIMIT 5
  LOOP
    IF v_item.notes IS NOT NULL AND v_item.notes <> '' THEN
      INSERT INTO public.category_overrides (match_pattern, flow_type, category_code, supplier_id, source)
      VALUES (
        LOWER(v_item.notes),
        NEW.flow_type,
        NEW.category_code,
        NEW.supplier_id,
        'post_approval_trigger'
      )
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_expense_correction
AFTER UPDATE OF flow_type, category_code ON public.expense_ledger
FOR EACH ROW
WHEN (OLD.flow_type IS DISTINCT FROM NEW.flow_type
      OR OLD.category_code IS DISTINCT FROM NEW.category_code)
EXECUTE FUNCTION public.fn_learn_category_correction();

-- ── Trigger function: learn from unmatched_items resolution ──
CREATE OR REPLACE FUNCTION public.fn_learn_unmatched_resolution()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.barcode IS NOT NULL AND NEW.barcode <> '' THEN
    UPDATE public.supplier_catalog
    SET nomenclature_id = NEW.resolved_to,
        updated_at = now()
    WHERE barcode = NEW.barcode
      AND nomenclature_id IS NULL;

    IF LEFT(NEW.barcode, 1) = '2' AND LENGTH(NEW.barcode) > 13 THEN
      INSERT INTO public.gs1_weight_items (base_barcode, nomenclature_id, supplier_id, description)
      VALUES (
        LEFT(NEW.barcode, 13),
        NEW.resolved_to,
        NEW.supplier_id,
        NEW.raw_text
      )
      ON CONFLICT (base_barcode) DO UPDATE SET
        nomenclature_id = EXCLUDED.nomenclature_id;
    END IF;
  END IF;

  IF NEW.raw_text IS NOT NULL AND NEW.raw_text <> '' THEN
    INSERT INTO public.correction_rules (rule_type, supplier_id, match_pattern, match_field, correction_value, source)
    VALUES (
      'nomenclature',
      NEW.supplier_id,
      LOWER(NEW.raw_text),
      'name',
      jsonb_build_object('nomenclature_id', NEW.resolved_to),
      'post_approval_trigger'
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_unmatched_resolved
AFTER UPDATE OF resolved_to ON public.unmatched_items
FOR EACH ROW
WHEN (OLD.resolved_to IS NULL AND NEW.resolved_to IS NOT NULL)
EXECUTE FUNCTION public.fn_learn_unmatched_resolution();

-- ── Migration log ──
INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '153_post_approval_triggers.sql',
  'claude-code',
  'Post-approval learning triggers: purchase_logs, expense_ledger, unmatched_items corrections auto-create rules'
) ON CONFLICT (filename) DO NOTHING;
