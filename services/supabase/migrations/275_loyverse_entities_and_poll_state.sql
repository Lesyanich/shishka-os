-- Migration 275 — Loyverse entity mirrors + poll cursor state
-- Why: «собирать всё, что происходит в Loyverse». Помимо чеков (orders), тянем смены
-- (cash management), кассиров и клиентов в зеркальные таблицы, плюс reference-справочники
-- для расшифровки id в чеках. loyverse_poll_state хранит высоководный курсор по каждому
-- ресурсу, чтобы поллер забирал только новое.
--
-- Все таблицы — зеркало Loyverse API: уникальность по loyverse id, полный объект в raw.
-- Заполняются edge-функцией loyverse-pull через SECURITY DEFINER upsert-RPC.

BEGIN;

-- ─── Poll cursor state (one row per resource) ───
CREATE TABLE IF NOT EXISTS public.loyverse_poll_state (
  resource     TEXT PRIMARY KEY,          -- 'receipts' | 'shifts' | 'employees' | 'customers'
  cursor       TEXT,                       -- high-water-mark (ISO updated_at) or null = backfill
  last_run_at  TIMESTAMPTZ,
  last_status  TEXT,                        -- 'ok' | 'error'
  last_count   INT,
  last_error   TEXT,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.loyverse_poll_state IS
  'High-water-mark cursor per Loyverse resource for the loyverse-pull poller. cursor NULL = full backfill on next run.';

-- ─── Shifts (cash management) ───
CREATE TABLE IF NOT EXISTS public.loyverse_shifts (
  loyverse_shift_id      TEXT PRIMARY KEY,
  store_id               TEXT,
  pos_device_id          TEXT,
  opened_by_employee     TEXT,
  closed_by_employee     TEXT,
  opened_at              TIMESTAMPTZ,
  closed_at              TIMESTAMPTZ,
  opening_money          NUMERIC,
  cash_payments          NUMERIC,
  cash_refunds           NUMERIC,
  paid_in                NUMERIC,
  paid_out               NUMERIC,
  expected_cash          NUMERIC,
  actual_cash            NUMERIC,
  difference             NUMERIC,
  gross_sales            NUMERIC,
  net_sales              NUMERIC,
  raw                    JSONB NOT NULL,
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.loyverse_shifts IS 'Mirror of Loyverse GET /shifts (cash management). Refreshed by loyverse-pull.';

-- ─── Employees ───
CREATE TABLE IF NOT EXISTS public.loyverse_employees (
  loyverse_employee_id   TEXT PRIMARY KEY,
  name                   TEXT,
  email                  TEXT,
  phone                  TEXT,
  is_owner               BOOLEAN,
  stores                 JSONB,
  raw                    JSONB NOT NULL,
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.loyverse_employees IS 'Mirror of Loyverse GET /employees. Refreshed by loyverse-pull.';

-- ─── Customers (loyalty) ───
CREATE TABLE IF NOT EXISTS public.loyverse_customers (
  loyverse_customer_id   TEXT PRIMARY KEY,
  name                   TEXT,
  email                  TEXT,
  phone                  TEXT,
  total_points           NUMERIC,
  total_spent            NUMERIC,
  total_visits           INT,
  first_visit            TIMESTAMPTZ,
  last_visit             TIMESTAMPTZ,
  raw                    JSONB NOT NULL,
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.loyverse_customers IS 'Mirror of Loyverse GET /customers. Refreshed by loyverse-pull.';

-- ─── Reference dimensions (small, full refresh) ───
CREATE TABLE IF NOT EXISTS public.loyverse_payment_types (
  id TEXT PRIMARY KEY, name TEXT, type TEXT, raw JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.loyverse_pos_devices (
  id TEXT PRIMARY KEY, name TEXT, store_id TEXT, raw JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.loyverse_stores (
  id TEXT PRIMARY KEY, name TEXT, raw JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── RLS: authenticated may read/write; service role (SECURITY DEFINER RPC) bypasses ───
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'loyverse_poll_state','loyverse_shifts','loyverse_employees','loyverse_customers',
    'loyverse_payment_types','loyverse_pos_devices','loyverse_stores'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format(
      'CREATE POLICY auth_full_access ON public.%I USING (fn_is_authenticated()) WITH CHECK (fn_is_authenticated());',
      t);
  END LOOP;
END $$;

-- ─── Upsert RPCs (idempotent on loyverse id) ───
CREATE OR REPLACE FUNCTION public.fn_upsert_loyverse_shift(p JSONB)
RETURNS VOID LANGUAGE sql SECURITY DEFINER AS $$
  INSERT INTO public.loyverse_shifts (
    loyverse_shift_id, store_id, pos_device_id, opened_by_employee, closed_by_employee,
    opened_at, closed_at, opening_money, cash_payments, cash_refunds, paid_in, paid_out,
    expected_cash, actual_cash, difference, gross_sales, net_sales, raw, updated_at
  ) VALUES (
    p->>'id', p->>'store_id', p->>'pos_device_id', p->>'opened_by_employee', p->>'closed_by_employee',
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
$$;

CREATE OR REPLACE FUNCTION public.fn_upsert_loyverse_employee(p JSONB)
RETURNS VOID LANGUAGE sql SECURITY DEFINER AS $$
  INSERT INTO public.loyverse_employees (
    loyverse_employee_id, name, email, phone, is_owner, stores, raw, updated_at
  ) VALUES (
    p->>'id', p->>'name', p->>'email', p->>'phone_number',
    NULLIF(p->>'is_owner','')::boolean, p->'stores', p, now()
  )
  ON CONFLICT (loyverse_employee_id) DO UPDATE SET
    name=EXCLUDED.name, email=EXCLUDED.email, phone=EXCLUDED.phone,
    is_owner=EXCLUDED.is_owner, stores=EXCLUDED.stores, raw=EXCLUDED.raw, updated_at=now();
$$;

CREATE OR REPLACE FUNCTION public.fn_upsert_loyverse_customer(p JSONB)
RETURNS VOID LANGUAGE sql SECURITY DEFINER AS $$
  INSERT INTO public.loyverse_customers (
    loyverse_customer_id, name, email, phone, total_points, total_spent, total_visits,
    first_visit, last_visit, raw, updated_at
  ) VALUES (
    p->>'id', p->>'name', p->>'email', p->>'phone_number',
    NULLIF(p->>'total_points','')::numeric, NULLIF(p->>'total_spent','')::numeric,
    NULLIF(p->>'total_visits','')::int,
    NULLIF(p->>'first_visit','')::timestamptz, NULLIF(p->>'last_visit','')::timestamptz, p, now()
  )
  ON CONFLICT (loyverse_customer_id) DO UPDATE SET
    name=EXCLUDED.name, email=EXCLUDED.email, phone=EXCLUDED.phone,
    total_points=EXCLUDED.total_points, total_spent=EXCLUDED.total_spent,
    total_visits=EXCLUDED.total_visits, first_visit=EXCLUDED.first_visit,
    last_visit=EXCLUDED.last_visit, raw=EXCLUDED.raw, updated_at=now();
$$;

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '275_loyverse_entities_and_poll_state.sql',
  'claude-code',
  'Add loyverse_poll_state cursor + mirror tables (shifts/employees/customers + payment_types/pos_devices/stores) with RLS + idempotent upsert RPCs. Consumed by loyverse-pull poller.'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
