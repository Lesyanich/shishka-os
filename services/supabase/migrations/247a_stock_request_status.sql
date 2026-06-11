-- 247a_stock_request_status.sql
-- Replace the boolean in_stock on stock_request_lines with a 3-state status:
--   'out'  — none left          (нет)
--   'low'  — running low         (мало)
--   'in'   — have enough         (есть)
-- A line is persisted only when it's actionable (status out/low) or carries an
-- order quantity. fn_submit_stock_sheet is rewritten to accept per-line status.

BEGIN;

ALTER TABLE public.stock_request_lines
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'in'
    CHECK (status IN ('out', 'low', 'in'));

-- Carry over any legacy rows (in_stock=false → out) before dropping the column.
UPDATE public.stock_request_lines
SET status = CASE WHEN in_stock = false THEN 'out' ELSE 'in' END;

ALTER TABLE public.stock_request_lines DROP COLUMN IF EXISTS in_stock;

COMMENT ON COLUMN public.stock_request_lines.status IS
  'Staff-reported stock level: out (none) | low (running low) | in (enough).';

CREATE OR REPLACE FUNCTION public.fn_submit_stock_sheet(
  p_passcode TEXT,
  p_note     TEXT,
  p_lines    JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expected   TEXT;
  v_request_id UUID;
  v_line       JSONB;
  v_status     TEXT;
  v_count      INT := 0;
BEGIN
  SELECT value INTO v_expected FROM public.app_config WHERE key = 'stock_sheet_passcode';

  IF v_expected IS NULL OR p_passcode IS DISTINCT FROM v_expected THEN
    RETURN jsonb_build_object('ok', false, 'error', 'bad_passcode');
  END IF;

  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_lines');
  END IF;

  INSERT INTO public.stock_requests (note) VALUES (NULLIF(p_note, ''))
  RETURNING id INTO v_request_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_status := COALESCE(NULLIF(v_line->>'status', ''), 'in');
    IF v_status NOT IN ('out', 'low', 'in') THEN
      v_status := 'in';
    END IF;

    -- Persist only actionable lines: low/out, or an explicit order quantity.
    IF v_status IN ('out', 'low')
       OR COALESCE((v_line->>'order_qty')::NUMERIC, 0) > 0
    THEN
      INSERT INTO public.stock_request_lines (request_id, nomenclature_id, status, order_qty, note)
      VALUES (
        v_request_id,
        (v_line->>'nomenclature_id')::UUID,
        v_status,
        NULLIF(v_line->>'order_qty', '')::NUMERIC,
        NULLIF(v_line->>'note', '')
      );
      v_count := v_count + 1;
    END IF;
  END LOOP;

  IF v_count = 0 THEN
    DELETE FROM public.stock_requests WHERE id = v_request_id;
    RETURN jsonb_build_object('ok', false, 'error', 'nothing_marked');
  END IF;

  RETURN jsonb_build_object('ok', true, 'request_id', v_request_id, 'line_count', v_count);
END;
$$;

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '247a_stock_request_status.sql',
  'claude-code',
  'Replace stock_request_lines.in_stock boolean with 3-state status (out/low/in); rewrite fn_submit_stock_sheet to accept per-line status.'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
