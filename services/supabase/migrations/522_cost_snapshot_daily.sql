-- 522 — a daily snapshot of every item's cost, so cost can be tracked over time (MC 00a81c22)
--
-- APPLIED 2026-10-17. Number claimed with claim_migration_number, not guessed.
--
-- WHY. The CEO asked how cost can be tracked over time. There was nothing to track with:
--   * nomenclature.cost_per_unit is overwritten in place, so yesterday's cost is gone the moment a
--     receipt is approved;
--   * value_change_audit is empty and does not cover costs;
--   * v_analytics_food_cost_weekly prices every past week with TODAY'S costs (it joins sales to
--     v_dish_cost_split), so when an ingredient gets dearer, last month's food cost changes
--     retroactively. History is quietly rewritten.
-- Of everything discussed, this is the only piece that cannot be added later. The history of what
-- we PAID already exists in purchase_logs and can be queried at any time. The history of what the
-- system USED does not, and every day without a snapshot is lost for good.
--
-- WHAT IT IS, kept deliberately small. One table, one function, one cron job.
--   cost_snapshot_daily      one row per non-deleted item per Bangkok day:
--                            cost_per_unit, cost_source, sale price
--   fn_snapshot_costs()      writes today's rows; idempotent, a second run the same day overwrites
--                            the first with the latest state
--   cron cost-snapshot-daily 10:55 UTC = 17:55 Bangkok, five minutes before the 18:00 close, so a
--                            snapshot reads as "the costs the system used for that trading day"
-- Today's baseline is taken at apply time so history starts today rather than tomorrow.
--
-- SIZE. About 1,085 rows a day, roughly 400 thousand a year. Negligible. PERMANENT BY DESIGN: it is
-- history, not a log, so it must not be added to the log-retention policy (MC 44278890).
--
-- ACCESS. Costs are owner-level data. RLS is on with no policy, plus REVOKE from PUBLIC, anon and
-- authenticated, so the table is closed to the whole API. Views in public are born writable by anon
-- and functions are executable by PUBLIC unless revoked (see the gotchas), so both are asserted
-- below rather than assumed. A view or an RPC with its own caller check can open it deliberately.
--
-- DELIBERATELY NOT DONE. No outlier gate on incoming prices, no "reference price", no change to
-- the costing formula. Costing stays "last paid price", as the CEO decided. The existing
-- ?unverified badge already flags a price that has drifted more than 20 percent from history
-- (quinoa +25 percent, cabbage +23 percent after one small pack each), and the price's age is
-- already derivable from last_purchase_date in v_cost_trust_nomenclature. If the snapshots later
-- show costs jumping around, a guard can be built then, on evidence.
--
-- READING IT BACK, until there is a view for it:
--   SELECT snapshot_date, cost_per_unit, cost_source FROM cost_snapshot_daily
--    WHERE product_code = 'RAW-CABBAGE' ORDER BY snapshot_date;
--
-- Applied through the Supabase connector, which wraps the whole file in one transaction.

BEGIN;

CREATE TABLE public.cost_snapshot_daily (
    snapshot_date  date        NOT NULL,
    nomenclature_id uuid       NOT NULL,
    product_code   text        NOT NULL,
    cost_per_unit  numeric,
    cost_source    text,
    price          numeric,
    taken_at       timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (snapshot_date, nomenclature_id)
);

CREATE INDEX cost_snapshot_daily_item_idx
    ON public.cost_snapshot_daily (nomenclature_id, snapshot_date DESC);

COMMENT ON TABLE public.cost_snapshot_daily IS
    'One row per non-deleted nomenclature item per Bangkok day: the cost_per_unit, cost_source and sale price the system was using at close of that day. Permanent history, do not prune. Cost history cannot be reconstructed after the fact, because nomenclature.cost_per_unit is overwritten in place. Written by fn_snapshot_costs() via cron job cost-snapshot-daily.';

ALTER TABLE public.cost_snapshot_daily ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.cost_snapshot_daily FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_snapshot_costs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_rows integer;
BEGIN
    INSERT INTO public.cost_snapshot_daily
           (snapshot_date, nomenclature_id, product_code, cost_per_unit, cost_source, price, taken_at)
    SELECT (now() AT TIME ZONE 'Asia/Bangkok')::date, n.id, n.product_code,
           n.cost_per_unit, n.cost_source, n.price, now()
      FROM public.nomenclature n
     WHERE NOT n.is_deleted
    ON CONFLICT (snapshot_date, nomenclature_id) DO UPDATE
       SET product_code = EXCLUDED.product_code,
           cost_per_unit = EXCLUDED.cost_per_unit,
           cost_source   = EXCLUDED.cost_source,
           price         = EXCLUDED.price,
           taken_at      = EXCLUDED.taken_at;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RETURN v_rows;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_snapshot_costs() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cost-snapshot-daily') THEN
        PERFORM cron.unschedule('cost-snapshot-daily');
    END IF;
    PERFORM cron.schedule('cost-snapshot-daily', '55 10 * * *', 'SELECT public.fn_snapshot_costs()');
END $$;

SELECT public.fn_snapshot_costs();

DO $$
DECLARE v_expected int; v_got int;
BEGIN
    SELECT count(*) INTO v_expected FROM public.nomenclature WHERE NOT is_deleted;
    SELECT count(*) INTO v_got FROM public.cost_snapshot_daily
     WHERE snapshot_date = (now() AT TIME ZONE 'Asia/Bangkok')::date;
    IF v_got <> v_expected OR v_got < 1000 THEN
        RAISE EXCEPTION '522 abort: baseline snapshot has % rows, expected % (and well over 1000)', v_got, v_expected;
    END IF;

    IF has_table_privilege('anon', 'public.cost_snapshot_daily', 'SELECT')
       OR has_table_privilege('authenticated', 'public.cost_snapshot_daily', 'SELECT')
       OR has_table_privilege('anon', 'public.cost_snapshot_daily', 'INSERT') THEN
        RAISE EXCEPTION '522 abort: cost_snapshot_daily is reachable by an API role';
    END IF;
    IF has_function_privilege('anon', 'public.fn_snapshot_costs()', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.fn_snapshot_costs()', 'EXECUTE') THEN
        RAISE EXCEPTION '522 abort: fn_snapshot_costs() is executable by an API role';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cost-snapshot-daily' AND active) THEN
        RAISE EXCEPTION '522 abort: cron job cost-snapshot-daily is not active';
    END IF;
END $$;

INSERT INTO public.migration_log (filename, applied_by, status, notes)
VALUES ('522_cost_snapshot_daily.sql', 'claude-opus-session-477e2227', 'success',
        'MC 00a81c22. There was no cost history anywhere: nomenclature.cost_per_unit is overwritten in place, '
     || 'value_change_audit is empty, and v_analytics_food_cost_weekly re-prices past weeks with TODAY''s costs. '
     || 'Adds cost_snapshot_daily (one row per non-deleted item per Bangkok day: cost, cost_source, sale price), '
     || 'fn_snapshot_costs() (idempotent within a day) and cron job cost-snapshot-daily at 10:55 UTC (17:55 Bangkok). '
     || 'Baseline taken at apply time. Table closed to API roles by RLS with no policy plus REVOKE; function '
     || 'revoked from PUBLIC/anon/authenticated; both asserted. Permanent history by design, not for pruning. '
     || 'Does not change any cost, price or purchase row.')
ON CONFLICT (filename) DO NOTHING;

COMMIT;
