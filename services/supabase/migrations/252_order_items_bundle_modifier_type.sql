-- 252: allow bundle child roles on order_items.modifier_type
-- Project: Menu Control — bundles
--
-- Bundle lines persist their chosen items as child order_items (parent_item_id
-- set) tagged with modifier_type = 'manakish' | 'sauce'. The existing
-- chk_modifier_type CHECK only permitted topping/modifier/extra/removal/side,
-- so widen it to include the bundle roles.

ALTER TABLE public.order_items DROP CONSTRAINT IF EXISTS chk_modifier_type;
ALTER TABLE public.order_items ADD CONSTRAINT chk_modifier_type CHECK (
  modifier_type IS NULL OR modifier_type = ANY (ARRAY[
    'topping', 'modifier', 'extra', 'removal', 'side', 'manakish', 'sauce'
  ])
);

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES ('252_order_items_bundle_modifier_type.sql','claude-code',NULL,
  'Widen order_items.chk_modifier_type to allow bundle child roles manakish/sauce')
ON CONFLICT DO NOTHING;
