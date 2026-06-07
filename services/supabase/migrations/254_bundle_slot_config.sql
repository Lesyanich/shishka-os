-- 254: DB-side config for the Loyverse slot-modifier bundles
-- Project: Menu Control — bundles (POS / Variant A)
--
-- The slot modifier lists themselves live in Loyverse (created via the
-- loyverse-sync edge function — see docs/modules/manakish-bundles.md and
-- scripts/loyverse/setup-bundle-modifiers.sh). This migration just sets the
-- DB-side knobs that the menu/pricing depend on, idempotently:
--   • bundle dishes have base price 0 (the price comes from the slot modifiers);
--   • every bundle slot is a mandatory single pick → drives v_public_menu.from_price
--     (From ฿200 / 400 / 600).
-- The min_select UPDATE is a no-op until the Loyverse lists have been created
-- and pulled (dish_modifier_groups populated); re-run after setup if needed.

UPDATE public.nomenclature
SET price = 0
WHERE product_code LIKE 'SALE-BUNDLE_MANAKISH_%' AND price IS DISTINCT FROM 0;

UPDATE public.dish_modifier_groups dmg
SET min_select = 1
FROM public.nomenclature n
WHERE dmg.dish_id = n.id
  AND n.product_code LIKE 'SALE-BUNDLE_MANAKISH_%'
  AND dmg.min_select <> 1;

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES ('254_bundle_slot_config.sql','claude-code',NULL,
  'Bundle dishes base price 0 + slot min_select 1 (drives from_price). Loyverse lists created via edge fn.')
ON CONFLICT DO NOTHING;
