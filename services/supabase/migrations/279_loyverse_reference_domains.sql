-- Migration 279 — additional Loyverse reference domains (suppliers, taxes, discounts, merchant)
-- Why: завершаем охват Loyverse — справочники, которые расшифровывают/дополняют чеки и
-- смены. Все маленькие, full-refresh поллером. /inventory не тянем (свой склад).

BEGIN;

CREATE TABLE IF NOT EXISTS public.loyverse_suppliers (
  id TEXT PRIMARY KEY, name TEXT, email TEXT, phone TEXT, address TEXT,
  raw JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.loyverse_taxes (
  id TEXT PRIMARY KEY, name TEXT, type TEXT, rate NUMERIC,
  raw JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.loyverse_discounts (
  id TEXT PRIMARY KEY, name TEXT, type TEXT,
  discount_amount NUMERIC, discount_percent NUMERIC,
  raw JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.loyverse_merchant (
  id TEXT PRIMARY KEY, business_name TEXT, email TEXT, country TEXT, currency TEXT,
  raw JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.loyverse_suppliers IS 'Mirror of Loyverse GET /suppliers. Refreshed by loyverse-pull.';
COMMENT ON TABLE public.loyverse_taxes     IS 'Mirror of Loyverse GET /taxes. Refreshed by loyverse-pull.';
COMMENT ON TABLE public.loyverse_discounts IS 'Mirror of Loyverse GET /discounts. Refreshed by loyverse-pull.';
COMMENT ON TABLE public.loyverse_merchant  IS 'Mirror of Loyverse GET /merchant (single row). Refreshed by loyverse-pull.';

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['loyverse_suppliers','loyverse_taxes','loyverse_discounts','loyverse_merchant'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format(
      'CREATE POLICY auth_full_access ON public.%I USING (fn_is_authenticated()) WITH CHECK (fn_is_authenticated());', t);
  END LOOP;
END $$;

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '279_loyverse_reference_domains.sql',
  'claude-code',
  'Add loyverse_suppliers/taxes/discounts/merchant mirror tables with RLS. Populated by loyverse-pull reference action.'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
