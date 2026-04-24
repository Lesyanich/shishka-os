-- ============================================================
-- Migration 152: Wire fn_learn_from_approval into approval flow
-- fn_approve_receipt_with_learning wraps fn_approve_receipt + learning
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_approve_receipt_with_learning(
  p_payload JSONB,
  p_inbox_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
  v_supplier_id UUID;
  v_supplier_name TEXT;
  v_rules_learned INTEGER;
BEGIN
  -- Run the existing approval logic
  v_result := public.fn_approve_receipt(p_payload);

  -- If approval failed, return immediately
  IF NOT (v_result->>'ok')::BOOLEAN THEN
    RETURN v_result;
  END IF;

  -- Extract supplier_id for learning
  v_supplier_name := p_payload->>'supplier_name';
  IF v_supplier_name IS NOT NULL AND v_supplier_name <> '' THEN
    SELECT id INTO v_supplier_id
    FROM public.suppliers
    WHERE name ILIKE v_supplier_name
    LIMIT 1;

    -- If not found by exact name, try aliases
    IF v_supplier_id IS NULL THEN
      SELECT supplier_id INTO v_supplier_id
      FROM public.supplier_aliases
      WHERE LOWER(alias) = LOWER(v_supplier_name)
      LIMIT 1;
    END IF;

    -- Auto-save supplier alias
    IF v_supplier_id IS NOT NULL THEN
      INSERT INTO public.supplier_aliases (supplier_id, alias, source)
      VALUES (v_supplier_id, v_supplier_name, 'auto')
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  -- Run learning if we have inbox_id
  IF p_inbox_id IS NOT NULL THEN
    v_rules_learned := public.fn_learn_from_approval(p_inbox_id, p_payload, v_supplier_id);
    v_result := v_result || jsonb_build_object('rules_learned', v_rules_learned);
  END IF;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.fn_approve_receipt_with_learning(JSONB, UUID)
  IS 'Wrapper: runs fn_approve_receipt then fn_learn_from_approval. Pass inbox_id to enable learning.';

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '152_approve_receipt_v15_learning.sql',
  'claude-code',
  'fn_approve_receipt_with_learning: wrapper that adds learning to approval flow'
) ON CONFLICT (filename) DO NOTHING;
