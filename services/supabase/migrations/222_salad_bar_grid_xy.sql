-- 222: Salad bar — absolute grid_col/grid_row for free "Tetris" placement
-- MC: ecb1eb05 (follow-up)
--
-- The hole is re-modelled as a 16-col × 12-row grid of 88×54mm cells, so EVERY
-- GN size snaps cleanly:
--   1/1 = 6×6 · 1/2 = 3×6 · 1/3 = 2×6 · 1/4 = 3×3 · 1/6 = 2×3 · 1/9 = 2×2
-- A pan is fully described by (grid_col 0-15, grid_row 0-11, gn_size).
-- Legacy row/position/depth_pos are kept valid (derived on write by the app).

-- ─── Columns ─────────────────────────────────────────────
ALTER TABLE public.salad_bar_slots ADD COLUMN IF NOT EXISTS grid_col INT;
ALTER TABLE public.salad_bar_slots ADD COLUMN IF NOT EXISTS grid_row INT;

-- ─── Backfill from the current 8-col × 2-row (176-family) layout ──
-- grid_col = (position-1) * 2   (position 1..8 → 0,2,4,…,14)
-- grid_row = base(back=0/front=6) + cumulative GN heights before this pan,
--            within each (equipment_id, position, row) column, ordered by depth_pos.
WITH spans AS (
  SELECT id,
         CASE gn_size WHEN '1/3' THEN 6 WHEN '1/6' THEN 3 WHEN '1/9' THEN 2
                      WHEN '1/1' THEN 6 WHEN '1/2' THEN 6 WHEN '1/4' THEN 3
                      ELSE 6 END                              AS span,
         CASE row WHEN 'back' THEN 0 ELSE 6 END               AS base,
         COALESCE(depth_pos, 0)                               AS dp,
         GREATEST(COALESCE(position, 1) - 1, 0) * 2           AS gcol,
         equipment_id, position, row
  FROM public.salad_bar_slots
  WHERE grid_row IS NULL OR grid_col IS NULL
),
offs AS (
  SELECT id, gcol,
         base + COALESCE(
           SUM(span) OVER (
             PARTITION BY equipment_id, position, row
             ORDER BY dp
             ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
           ), 0) AS grow
  FROM spans
)
UPDATE public.salad_bar_slots s
SET grid_col = LEAST(o.gcol, 15),
    grid_row = LEAST(o.grow, 11)
FROM offs o
WHERE o.id = s.id;

-- Any stragglers default to top-left
UPDATE public.salad_bar_slots SET grid_col = 0 WHERE grid_col IS NULL;
UPDATE public.salad_bar_slots SET grid_row = 0 WHERE grid_row IS NULL;

-- ─── Range guards (idempotent) ───────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'salad_bar_slots_grid_col_chk') THEN
    ALTER TABLE public.salad_bar_slots
      ADD CONSTRAINT salad_bar_slots_grid_col_chk CHECK (grid_col BETWEEN 0 AND 15);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'salad_bar_slots_grid_row_chk') THEN
    ALTER TABLE public.salad_bar_slots
      ADD CONSTRAINT salad_bar_slots_grid_row_chk CHECK (grid_row BETWEEN 0 AND 11);
  END IF;
END $$;

-- ─── Self-register ───────────────────────────────────────
INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '222_salad_bar_grid_xy.sql',
  'claude-code',
  NULL,
  'Add grid_col/grid_row (16x12 grid) to salad_bar_slots for free Tetris placement; backfill from position+row+depth_pos (MC ecb1eb05)'
)
ON CONFLICT DO NOTHING;
