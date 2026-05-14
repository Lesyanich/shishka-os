-- 174: Financial Dashboard tables (T1: read-only MVP)
-- Tables: cash_snapshots, financial_obligations
-- RLS: owner-only access via app_roles

-- ══════════════════════════════════════════════════════════
-- 1. cash_snapshots — daily cash position records
-- ══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS cash_snapshots (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date date NOT NULL UNIQUE,
  business_cash_thb  numeric(12,2) NOT NULL DEFAULT 0,
  business_bank_thb  numeric(12,2) NOT NULL DEFAULT 0,
  personal_reserve_thb numeric(12,2) NOT NULL DEFAULT 0,
  notes         text,
  recorded_by   uuid REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE cash_snapshots IS 'Daily cash position snapshots for financial dashboard';
COMMENT ON COLUMN cash_snapshots.personal_reserve_thb IS 'Isolated personal reserve — shown but NOT counted in business runway';

-- ══════════════════════════════════════════════════════════
-- 2. financial_obligations — creditor obligations tracker
-- ══════════════════════════════════════════════════════════

CREATE TYPE obligation_status AS ENUM ('pending', 'partial', 'paid', 'overdue', 'on_hold', 'cancelled');
CREATE TYPE obligation_priority AS ENUM ('critical', 'high', 'medium', 'low');

CREATE TABLE IF NOT EXISTS financial_obligations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creditor      text NOT NULL,
  description   text,
  amount_thb    numeric(12,2) NOT NULL,
  paid_thb      numeric(12,2) NOT NULL DEFAULT 0,
  due_date      date,
  priority      obligation_priority NOT NULL DEFAULT 'medium',
  status        obligation_status NOT NULL DEFAULT 'pending',
  source        text,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  paid_at       timestamptz
);

COMMENT ON TABLE financial_obligations IS 'Outstanding obligations and debts for financial dashboard';

-- ══════════════════════════════════════════════════════════
-- 3. RLS — owner-only access
-- ══════════════════════════════════════════════════════════

ALTER TABLE cash_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_obligations ENABLE ROW LEVEL SECURITY;

-- cash_snapshots: owner can SELECT, INSERT, UPDATE
CREATE POLICY "owner_select_cash" ON cash_snapshots FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM staff WHERE auth_user_id = auth.uid() AND app_role = 'owner'
  ));

CREATE POLICY "owner_insert_cash" ON cash_snapshots FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM staff WHERE auth_user_id = auth.uid() AND app_role = 'owner'
  ));

CREATE POLICY "owner_update_cash" ON cash_snapshots FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM staff WHERE auth_user_id = auth.uid() AND app_role = 'owner'
  ));

-- financial_obligations: owner can SELECT, INSERT, UPDATE
CREATE POLICY "owner_select_obligations" ON financial_obligations FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM staff WHERE auth_user_id = auth.uid() AND app_role = 'owner'
  ));

CREATE POLICY "owner_insert_obligations" ON financial_obligations FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM staff WHERE auth_user_id = auth.uid() AND app_role = 'owner'
  ));

CREATE POLICY "owner_update_obligations" ON financial_obligations FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM staff WHERE auth_user_id = auth.uid() AND app_role = 'owner'
  ));

-- ══════════════════════════════════════════════════════════
-- 4. Seed initial obligations from baseline (2026-05-14)
-- ══════════════════════════════════════════════════════════

INSERT INTO financial_obligations (creditor, description, amount_thb, paid_thb, due_date, priority, status, source, notes) VALUES
  ('Tops Daily (Central)', 'L2 rent — March + April overdue', 60000, 60000, '2026-05-13', 'critical', 'paid', 'baseline-06e84930', 'Paid from CEO personal savings ($3k USD). Director''s loan — must be recorded.'),
  ('Tops Daily (Central)', 'L2 rent — May (current month)', 30000, 0, '2026-06-01', 'critical', 'pending', 'baseline-06e84930', 'Regular monthly rent. Central group corporate landlord.'),
  ('Richie', 'Friend/investor loan balance', 70000, 10000, '2026-07-13', 'high', 'partial', 'baseline-06e84930', '10k partial paid 2026-05-14. Balance ~60k on 60-day schedule. Terms flexible.'),
  ('Sign-board vendor', 'Sign-board production debt', 30000, 0, NULL, 'low', 'on_hold', 'baseline-06e84930', 'Creditor non-responsive multiple times. Hold, do not pay proactively.'),
  ('Alex + Hein', 'Monthly salaries (2 cooks)', 30000, 0, '2026-05-31', 'critical', 'pending', 'baseline-06e84930', 'End of month deadline. Must be covered by revenue or reserve.'),
  ('Loyverse / POS', 'Phase A: receipt printer', 3000, 0, '2026-05-18', 'high', 'pending', 'procurement-4f144895', 'Thermal printer for L1 kitchen. Loyverse path selected.')
ON CONFLICT DO NOTHING;

-- Seed initial cash snapshot
INSERT INTO cash_snapshots (snapshot_date, business_cash_thb, business_bank_thb, personal_reserve_thb, notes) VALUES
  ('2026-05-14', 20000, 0, 33000, '$5k USD inbound (not yet received, ~165k THB). Personal: ~$1k crypto + 100k RUB stocks (earmarked for house rent). Tops 60k paid from personal stash.')
ON CONFLICT (snapshot_date) DO NOTHING;

-- ══════════════════════════════════════════════════════════
-- 5. Self-register migration
-- ══════════════════════════════════════════════════════════

INSERT INTO migration_log (version, name, checksum)
VALUES (174, '174_financial_dashboard', md5(pg_read_file('174_financial_dashboard.sql')))
ON CONFLICT (version) DO NOTHING;
