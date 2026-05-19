-- RPC: get_channel_margins(p_channel TEXT)
-- Returns margin breakdown for a given sales channel vs walk-in.

CREATE OR REPLACE FUNCTION get_channel_margins(p_channel TEXT DEFAULT 'grab')
RETURNS TABLE (
  nomenclature_id UUID,
  product_code TEXT,
  name TEXT,
  walk_in_price NUMERIC,
  channel_price NUMERIC,
  commission_pct NUMERIC,
  cost_per_unit NUMERIC,
  walk_in_food_cost_pct NUMERIC,
  channel_food_cost_pct NUMERIC,
  walk_in_margin NUMERIC,
  channel_net_revenue NUMERIC,
  channel_margin NUMERIC
)
LANGUAGE sql STABLE
AS $$
  SELECT
    n.id AS nomenclature_id,
    n.product_code,
    n.name,
    n.price AS walk_in_price,
    COALESCE(cp.price, n.price * cp.multiplier) AS channel_price,
    cp.commission_pct,
    n.cost_per_unit,
    -- Walk-in food cost %
    CASE WHEN n.price > 0 AND n.cost_per_unit IS NOT NULL
      THEN ROUND((n.cost_per_unit / n.price) * 100, 1)
      ELSE NULL
    END AS walk_in_food_cost_pct,
    -- Channel food cost % (based on net revenue after commission)
    CASE WHEN COALESCE(cp.price, n.price * cp.multiplier) > 0
         AND n.cost_per_unit IS NOT NULL
         AND cp.commission_pct IS NOT NULL
      THEN ROUND(
        (n.cost_per_unit / (COALESCE(cp.price, n.price * cp.multiplier) * (1 - cp.commission_pct))) * 100,
        1
      )
      ELSE NULL
    END AS channel_food_cost_pct,
    -- Walk-in margin (price - cost)
    CASE WHEN n.price IS NOT NULL AND n.cost_per_unit IS NOT NULL
      THEN ROUND(n.price - n.cost_per_unit, 1)
      ELSE NULL
    END AS walk_in_margin,
    -- Channel net revenue (after commission)
    CASE WHEN COALESCE(cp.price, n.price * cp.multiplier) IS NOT NULL
         AND cp.commission_pct IS NOT NULL
      THEN ROUND(COALESCE(cp.price, n.price * cp.multiplier) * (1 - cp.commission_pct), 1)
      ELSE NULL
    END AS channel_net_revenue,
    -- Channel margin (net revenue - cost)
    CASE WHEN COALESCE(cp.price, n.price * cp.multiplier) IS NOT NULL
         AND cp.commission_pct IS NOT NULL
         AND n.cost_per_unit IS NOT NULL
      THEN ROUND(
        COALESCE(cp.price, n.price * cp.multiplier) * (1 - cp.commission_pct) - n.cost_per_unit,
        1
      )
      ELSE NULL
    END AS channel_margin
  FROM channel_pricing cp
  JOIN nomenclature n ON n.id = cp.nomenclature_id
  WHERE cp.channel = p_channel
    AND cp.is_active = true
  ORDER BY n.product_code;
$$;

COMMENT ON FUNCTION get_channel_margins IS 'Returns margin breakdown per dish for a sales channel. channel_net_revenue = channel_price × (1 - commission). channel_margin = net_revenue - cost.';

INSERT INTO migration_log (filename, applied_by, notes)
VALUES (
    '202_rpc_get_channel_margins.sql',
    'claude-code',
    'RPC get_channel_margins(channel) — returns walk-in vs channel margin breakdown'
) ON CONFLICT (filename) DO NOTHING;
