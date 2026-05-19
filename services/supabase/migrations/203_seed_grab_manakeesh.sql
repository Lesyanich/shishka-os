-- Seed channel_pricing for Grab: all active SALE-MANAISH_* items.
-- multiplier = 1.15 (+15% uplift), commission = 30%, no manual price override.

INSERT INTO channel_pricing (nomenclature_id, channel, price, multiplier, commission_pct)
SELECT
  id,
  'grab',
  NULL,        -- no manual override — use multiplier
  1.15,        -- +15% over walk-in
  0.30         -- Grab 30% commission
FROM nomenclature
WHERE product_code LIKE 'SALE-MANAISH_%'
  AND is_available = true
ON CONFLICT (nomenclature_id, channel) DO NOTHING;

INSERT INTO migration_log (filename, applied_by, notes)
VALUES (
    '203_seed_grab_manakeesh.sql',
    'claude-code',
    'Seed Grab channel pricing for active manakeesh: multiplier 1.15, commission 30%'
) ON CONFLICT (filename) DO NOTHING;
