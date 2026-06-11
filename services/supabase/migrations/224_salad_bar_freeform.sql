-- 224: Salad bar — free-form placement (real mm coords + rotation)
-- MC: ecb1eb05 (follow-up)
--
-- The owner wants to ROTATE pans. GN side lengths (176 vs 325 mm) are
-- incommensurable, so a clean snap-grid + rotation is impossible. We switch to
-- free placement: each pan stores its real position (x_mm, y_mm of its top-left,
-- inside the fixed 1408×650 mm hole) and a rotation (0 or 90°). Width/height come
-- from gn_size + rotation. Legacy grid_col/grid_row/row/position/depth_pos are
-- kept valid (derived on write) for backward compatibility.

ALTER TABLE public.salad_bar_slots ADD COLUMN IF NOT EXISTS x_mm INT;
ALTER TABLE public.salad_bar_slots ADD COLUMN IF NOT EXISTS y_mm INT;
ALTER TABLE public.salad_bar_slots ADD COLUMN IF NOT EXISTS rotation INT NOT NULL DEFAULT 0;

-- Backfill from the 16×12 grid (cell = 88 × 54 mm).
UPDATE public.salad_bar_slots
SET x_mm = COALESCE(grid_col, 0) * 88,
    y_mm = COALESCE(grid_row, 0) * 54
WHERE x_mm IS NULL OR y_mm IS NULL;

UPDATE public.salad_bar_slots SET x_mm = 0 WHERE x_mm IS NULL;
UPDATE public.salad_bar_slots SET y_mm = 0 WHERE y_mm IS NULL;

-- Guards (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'salad_bar_slots_rotation_chk') THEN
    ALTER TABLE public.salad_bar_slots
      ADD CONSTRAINT salad_bar_slots_rotation_chk CHECK (rotation IN (0, 90));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'salad_bar_slots_xy_chk') THEN
    ALTER TABLE public.salad_bar_slots
      ADD CONSTRAINT salad_bar_slots_xy_chk CHECK (x_mm BETWEEN 0 AND 1408 AND y_mm BETWEEN 0 AND 650);
  END IF;
END $$;

-- ─── Self-register ───────────────────────────────────────
INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '224_salad_bar_freeform.sql',
  'claude-code',
  NULL,
  'Add x_mm/y_mm/rotation to salad_bar_slots for free-form placement + rotation; backfill from grid_col/grid_row (MC ecb1eb05)'
)
ON CONFLICT DO NOTHING;
