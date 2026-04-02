-- ═══════════════════════════════════════════════════════════════
-- Migration 051: Order Item Modifiers (Self-Referencing FK)
-- Phase 7.1: DB Architecture Audit — Issue #4 (OMS Architecture)
-- ═══════════════════════════════════════════════════════════════
-- PROBLEM: order_items is flat (order_id, nomenclature_id, quantity).
--          Can't distinguish which topping/modifier belongs to which
--          dish in a multi-item order. KDS assembly station can't
--          group modifiers under parent dishes.
--
-- EXAMPLE:
--   Order: "Waffle" + "Syrniki" + "Salmon topping"
--   Without parent_item_id: unclear if salmon goes on waffle or syrniki.
--   With parent_item_id: salmon.parent_item_id = waffle.id → clear.
--
-- SOLUTION: Self-referencing FK parent_item_id + modifier_type column.
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. ALTER order_items ───

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS parent_item_id UUID
    REFERENCES public.order_items(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS modifier_type TEXT;

COMMENT ON COLUMN public.order_items.parent_item_id
  IS 'Self-ref FK. NULL = main dish. Non-NULL = modifier/topping of the parent item.';
COMMENT ON COLUMN public.order_items.modifier_type
  IS 'Modifier classification: topping, modifier, extra, removal, side. NULL for main items.';

-- ─── 2. Index for parent-child lookups ───

CREATE INDEX IF NOT EXISTS idx_oi_parent ON public.order_items(parent_item_id)
  WHERE parent_item_id IS NOT NULL;

-- ─── 3. CHECK constraint for valid modifier_type values ───

ALTER TABLE public.order_items
  ADD CONSTRAINT chk_modifier_type CHECK (
    modifier_type IS NULL
    OR modifier_type IN ('topping', 'modifier', 'extra', 'removal', 'side')
  );
