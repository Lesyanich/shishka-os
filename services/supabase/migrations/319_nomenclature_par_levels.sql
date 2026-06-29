-- 319_nomenclature_par_levels.sql
-- Phase 3 (Stock & Reorder): ingredient-level reorder thresholds on nomenclature.
--
-- Par levels live on nomenclature (NOT sku/sku_balances): the owner reasons in
-- ingredients ("keep 5 kg chicken breast on hand"), base_unit is the natural
-- threshold unit, and these sit in the same family as shelf_life_days /
-- storage_location / stock_state / in_stock_sheet. The PO builder converts the
-- base_unit reorder qty -> supplier pack qty at order time.
--
-- Pure additive: 4 nullable columns + 1 partial index. No CHECK constraint —
-- par >= min is enforced softly in the UI (a NOT-VALID CHECK would block a
-- half-entered row mid inline-edit; see repo gotcha).

ALTER TABLE public.nomenclature
  ADD COLUMN IF NOT EXISTS min_stock           numeric(12,3),   -- reorder trigger (base_unit)
  ADD COLUMN IF NOT EXISTS par_stock           numeric(12,3),   -- target on-hand after restock
  ADD COLUMN IF NOT EXISTS reorder_qty         numeric(12,3),   -- fixed pack/round qty; NULL => par - on_hand
  ADD COLUMN IF NOT EXISTS default_supplier_id uuid
      REFERENCES public.suppliers(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.nomenclature.min_stock IS
  'Phase 3: reorder point in base_unit. on_hand <= min_stock => low-stock.';
COMMENT ON COLUMN public.nomenclature.par_stock IS
  'Phase 3: target on-hand after restock, base_unit.';
COMMENT ON COLUMN public.nomenclature.reorder_qty IS
  'Phase 3: fixed reorder qty (pack rounding). NULL => suggest (par_stock - on_hand).';
COMMENT ON COLUMN public.nomenclature.default_supplier_id IS
  'Phase 3: preferred supplier for auto-generated reorder PO lines.';

-- Only rows that opt into reorder tracking. Keeps the low-stock scan cheap.
CREATE INDEX IF NOT EXISTS idx_nomenclature_reorder_tracked
  ON public.nomenclature (id)
  WHERE min_stock IS NOT NULL AND COALESCE(is_deleted, false) = false;

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '319_nomenclature_par_levels.sql',
  'claude-code',
  NULL,
  'Phase 3 Stock & Reorder: add min_stock/par_stock/reorder_qty/default_supplier_id to nomenclature + partial index idx_nomenclature_reorder_tracked. No CHECK (par>=min enforced in UI).'
)
ON CONFLICT DO NOTHING;

-- DOWN (manual, for reference):
-- DROP INDEX IF EXISTS public.idx_nomenclature_reorder_tracked;
-- ALTER TABLE public.nomenclature
--   DROP COLUMN IF EXISTS min_stock,
--   DROP COLUMN IF EXISTS par_stock,
--   DROP COLUMN IF EXISTS reorder_qty,
--   DROP COLUMN IF EXISTS default_supplier_id;
