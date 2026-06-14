-- Migration 277 — Loyverse cash movements (pay-in / pay-out) as queryable rows
-- Why: персонал берёт деньги из кассы (доставка, докупка) и вносит наличные — Loyverse
-- пишет это в cash_movements внутри смены. Данные уже сохранялись в loyverse_shifts.raw,
-- но не были structured. Разворачиваем каждую операцию в отдельную строку для отчётов
-- (мелкие траты = фактический petty-cash расход).
--
-- Loyverse cash_movements не имеют стабильного id → дедуп через DELETE+reinsert по смене
-- при каждом upsert (смены маленькие, full-refresh). Идемпотентно.

BEGIN;

CREATE TABLE IF NOT EXISTS public.loyverse_cash_movements (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loyverse_shift_id  TEXT NOT NULL,
  type               TEXT,             -- PAY_IN | PAY_OUT
  money_amount       NUMERIC,
  comment            TEXT,
  employee_id        TEXT,
  created_at         TIMESTAMPTZ,
  raw                JSONB NOT NULL,
  ingested_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lcm_shift   ON public.loyverse_cash_movements(loyverse_shift_id);
CREATE INDEX IF NOT EXISTS idx_lcm_type    ON public.loyverse_cash_movements(type);
CREATE INDEX IF NOT EXISTS idx_lcm_created ON public.loyverse_cash_movements(created_at DESC);

COMMENT ON TABLE public.loyverse_cash_movements IS
  'Pay-in / pay-out cash drawer operations from Loyverse shifts (e.g. cash taken to pay delivery / buy supplies). One row per movement; rebuilt per shift on each pull.';

ALTER TABLE public.loyverse_cash_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY auth_full_access ON public.loyverse_cash_movements
  USING (fn_is_authenticated()) WITH CHECK (fn_is_authenticated());

-- fn_upsert_loyverse_shift v2: upsert the shift, then rebuild its cash movements.
CREATE OR REPLACE FUNCTION public.fn_upsert_loyverse_shift(p JSONB)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_shift_id TEXT := p->>'id';
BEGIN
  INSERT INTO public.loyverse_shifts (
    loyverse_shift_id, store_id, pos_device_id, opened_by_employee, closed_by_employee,
    opened_at, closed_at, opening_money, cash_payments, cash_refunds, paid_in, paid_out,
    expected_cash, actual_cash, difference, gross_sales, net_sales, raw, updated_at
  ) VALUES (
    v_shift_id, p->>'store_id', p->>'pos_device_id', p->>'opened_by_employee', p->>'closed_by_employee',
    NULLIF(p->>'opened_at','')::timestamptz, NULLIF(p->>'closed_at','')::timestamptz,
    NULLIF(p->>'opening_money','')::numeric, NULLIF(p->>'cash_payments','')::numeric,
    NULLIF(p->>'cash_refunds','')::numeric, NULLIF(p->>'paid_in','')::numeric,
    NULLIF(p->>'paid_out','')::numeric, NULLIF(p->>'expected_cash','')::numeric,
    NULLIF(p->>'actual_cash','')::numeric, NULLIF(p->>'difference','')::numeric,
    NULLIF(p->>'gross_sales','')::numeric, NULLIF(p->>'net_sales','')::numeric, p, now()
  )
  ON CONFLICT (loyverse_shift_id) DO UPDATE SET
    store_id=EXCLUDED.store_id, pos_device_id=EXCLUDED.pos_device_id,
    opened_by_employee=EXCLUDED.opened_by_employee, closed_by_employee=EXCLUDED.closed_by_employee,
    opened_at=EXCLUDED.opened_at, closed_at=EXCLUDED.closed_at,
    opening_money=EXCLUDED.opening_money, cash_payments=EXCLUDED.cash_payments,
    cash_refunds=EXCLUDED.cash_refunds, paid_in=EXCLUDED.paid_in, paid_out=EXCLUDED.paid_out,
    expected_cash=EXCLUDED.expected_cash, actual_cash=EXCLUDED.actual_cash,
    difference=EXCLUDED.difference, gross_sales=EXCLUDED.gross_sales, net_sales=EXCLUDED.net_sales,
    raw=EXCLUDED.raw, updated_at=now();

  -- Rebuild cash movements for this shift (idempotent).
  DELETE FROM public.loyverse_cash_movements WHERE loyverse_shift_id = v_shift_id;
  INSERT INTO public.loyverse_cash_movements (
    loyverse_shift_id, type, money_amount, comment, employee_id, created_at, raw
  )
  SELECT v_shift_id, cm->>'type', NULLIF(cm->>'money_amount','')::numeric,
         cm->>'comment', cm->>'employee_id', NULLIF(cm->>'created_at','')::timestamptz, cm
  FROM jsonb_array_elements(COALESCE(p->'cash_movements', '[]'::jsonb)) AS cm;
END;
$$;

COMMENT ON FUNCTION public.fn_upsert_loyverse_shift(JSONB) IS
  'Idempotent upsert of a Loyverse shift; also rebuilds loyverse_cash_movements (pay-in/pay-out) for that shift.';

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '277_loyverse_cash_movements.sql',
  'claude-code',
  'Add loyverse_cash_movements table (pay-in/pay-out from shifts) + extend fn_upsert_loyverse_shift to explode cash_movements per shift. Petty-cash visibility.'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
