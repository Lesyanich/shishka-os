-- 227: Order-code generator + KDS status mutation (QR menu MVP)
-- NOTE: file authored for review — NOT yet applied to the live project.
-- Depends on 225 (orders.order_code, status enum from 022).

-- ─── 1. Daily order-code counter ─────────────────────────────
-- Codes reset each day (Asia/Bangkok). Format: zero-padded number e.g. 001, 042, 237.
-- Daily reuse is safe because the active-only unique index (mig 225) only guards
-- live orders, and delivered/cancelled orders free the code.

CREATE TABLE IF NOT EXISTS public.order_code_counters (
    day     DATE PRIMARY KEY,
    last_n  INTEGER NOT NULL DEFAULT 0
);

COMMENT ON TABLE public.order_code_counters IS 'Per-day counter backing fn_next_order_code (QR menu orders)';

CREATE OR REPLACE FUNCTION public.fn_next_order_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_today DATE := (now() AT TIME ZONE 'Asia/Bangkok')::date;
    v_n     INTEGER;
BEGIN
    INSERT INTO public.order_code_counters (day, last_n)
    VALUES (v_today, 1)
    ON CONFLICT (day) DO UPDATE
        SET last_n = public.order_code_counters.last_n + 1
    RETURNING last_n INTO v_n;

    -- 001..999 then widen automatically (FM = no leading space, 000 = min 3 digits)
    RETURN to_char(v_n, 'FM000');
END $$;

COMMENT ON FUNCTION public.fn_next_order_code() IS 'Returns the next daily order code (Asia/Bangkok reset), e.g. 042. Called by the create-order edge function.';

-- ─── 2. KDS status mutation ──────────────────────────────────
-- The KDS/cashier can only advance an order to preparing/ready/delivered.
-- SECURITY DEFINER so authenticated staff (KDS PIN session) can call it without
-- broad UPDATE rights on orders.

CREATE OR REPLACE FUNCTION public.fn_kds_set_order_status(
    p_order_id UUID,
    p_status   public.order_status
)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_row public.orders;
BEGIN
    IF p_status NOT IN ('preparing', 'ready', 'delivered') THEN
        RAISE EXCEPTION 'fn_kds_set_order_status: only preparing/ready/delivered allowed, got %', p_status;
    END IF;

    UPDATE public.orders
    SET status = p_status
    WHERE id = p_order_id
    RETURNING * INTO v_row;

    IF v_row.id IS NULL THEN
        RAISE EXCEPTION 'fn_kds_set_order_status: order % not found', p_order_id;
    END IF;

    RETURN v_row;
END $$;

COMMENT ON FUNCTION public.fn_kds_set_order_status(UUID, public.order_status) IS 'KDS/cashier order status advance (preparing/ready/delivered only)';

GRANT EXECUTE ON FUNCTION public.fn_kds_set_order_status(UUID, public.order_status) TO authenticated;

-- ─── 3. Self-register ────────────────────────────────────────

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '224c_order_code_and_status.sql',
  'claude-code',
  NULL,
  'Add fn_next_order_code (daily reset) + order_code_counters + fn_kds_set_order_status (QR menu MVP)'
)
ON CONFLICT DO NOTHING;
