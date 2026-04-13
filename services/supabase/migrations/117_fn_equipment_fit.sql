-- Migration 117: Equipment availability check with contamination-aware buffer
-- Returns available slot for requested equipment, accounting for capacity and cleaning time.

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_find_equipment_slot(
  p_equipment_id UUID,
  p_desired_start TIMESTAMPTZ,
  p_duration_min INT,
  p_capacity_needed INT DEFAULT 1,
  p_product_category TEXT DEFAULT NULL
)
RETURNS TABLE (
  slot_start TIMESTAMPTZ,
  slot_end TIMESTAMPTZ,
  buffer_min INT,
  buffer_reason TEXT,
  shifted BOOLEAN
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_equip RECORD;
  v_prev_booking RECORD;
  v_buffer INT := 10; -- default buffer
  v_buffer_reason TEXT := 'standard';
  v_desired_end TIMESTAMPTZ;
  v_conflict_end TIMESTAMPTZ := NULL;
BEGIN
  -- Get equipment details
  SELECT e.max_parallel, e.cleaning_time_min, e.product_category_group
  INTO v_equip
  FROM public.equipment e
  WHERE e.id = p_equipment_id;

  -- Check previous booking for contamination
  SELECT eb.product_category, eb.slot_end
  INTO v_prev_booking
  FROM public.equipment_bookings eb
  WHERE eb.equipment_id = p_equipment_id
    AND eb.slot_end <= p_desired_start
  ORDER BY eb.slot_end DESC
  LIMIT 1;

  -- Determine buffer based on contamination
  IF v_prev_booking.product_category IS NOT NULL
    AND p_product_category IS NOT NULL
    AND v_prev_booking.product_category != p_product_category
  THEN
    v_buffer := COALESCE(v_equip.cleaning_time_min, 30);
    v_buffer_reason := 'category_change: ' || v_prev_booking.product_category || ' → ' || p_product_category;
  END IF;

  -- Check for overlapping bookings
  v_desired_end := p_desired_start + (p_duration_min || ' minutes')::INTERVAL;

  SELECT MAX(eb.slot_end) INTO v_conflict_end
  FROM public.equipment_bookings eb
  WHERE eb.equipment_id = p_equipment_id
    AND eb.slot_start < v_desired_end
    AND eb.slot_end > p_desired_start;

  -- If conflict exists, shift start after conflict + buffer
  IF v_conflict_end IS NOT NULL THEN
    slot_start := v_conflict_end + (v_buffer || ' minutes')::INTERVAL;
    slot_end := slot_start + (p_duration_min || ' minutes')::INTERVAL;
    buffer_min := v_buffer;
    buffer_reason := v_buffer_reason;
    shifted := true;
  ELSE
    slot_start := p_desired_start;
    slot_end := v_desired_end;
    buffer_min := v_buffer;
    buffer_reason := v_buffer_reason;
    shifted := false;
  END IF;

  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.fn_find_equipment_slot(UUID, TIMESTAMPTZ, INT, INT, TEXT) IS
  'Finds available equipment slot with contamination-aware buffer calculation';

INSERT INTO public.migration_log (filename, notes, checksum)
VALUES ('117_fn_equipment_fit.sql', 'Equipment slot finder with contamination-aware buffer', NULL)
ON CONFLICT (filename) DO NOTHING;

COMMIT;
