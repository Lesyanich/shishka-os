-- Phase 1 — Editable supplier directory: structured contacts + delivery.
--
-- The suppliers table only carried a single freetext `contact_info` blob. The
-- procurement section needs phone / contact person / delivery schedule / lead
-- time / payment terms as first-class, inline-editable fields. Every column
-- added here is nullable (or safe-defaulted) and additive — no backfill, no
-- breakage, and `contact_info` is preserved untouched so OCR / receipt approval
-- (fn_approve_receipt) keep reading it.
--
-- Down migration = DROP COLUMN for each (nothing references these — no FKs,
-- views, or policies), so this is cleanly reversible.

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS contact_person  text,
  ADD COLUMN IF NOT EXISTS phone           text,
  ADD COLUMN IF NOT EXISTS delivery_days   text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS delivery_window text,
  ADD COLUMN IF NOT EXISTS lead_time_days  integer,
  ADD COLUMN IF NOT EXISTS min_order_thb   numeric(12,2),
  ADD COLUMN IF NOT EXISTS payment_terms   text,
  ADD COLUMN IF NOT EXISTS notes           text;

COMMENT ON COLUMN public.suppliers.contact_person IS
  'Primary ordering contact name.';
COMMENT ON COLUMN public.suppliers.phone IS
  'Primary phone / messaging contact for placing orders.';
COMMENT ON COLUMN public.suppliers.delivery_days IS
  'Weekday codes the supplier delivers on: mon,tue,wed,thu,fri,sat,sun. Validated app-side (plain text[] for dependency-free rollback).';
COMMENT ON COLUMN public.suppliers.delivery_window IS
  'Free-text delivery time window, e.g. "09:00-12:00".';
COMMENT ON COLUMN public.suppliers.lead_time_days IS
  'Typical days between placing an order and delivery.';
COMMENT ON COLUMN public.suppliers.min_order_thb IS
  'Minimum order value the supplier requires, in THB.';
COMMENT ON COLUMN public.suppliers.payment_terms IS
  'Free-text payment terms, e.g. "cash on delivery", "net 7".';
COMMENT ON COLUMN public.suppliers.contact_info IS
  'LEGACY freetext contact blob; preserved for OCR / receipt back-compat. Prefer the structured contact_person/phone/delivery fields.';

-- Renumbered 317 -> 317a (2026-06-27) to deconflict the 317 collision with
-- 317_staff_task_multi_assignee.sql (both applied same day). See migration 322
-- for the migration_log.filename UPDATE. Precedent: RENUMBERING-2026-06-11.md.
INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '317a_supplier_directory_fields.sql',
  'claude-code',
  NULL,
  'Widen suppliers with structured contact/delivery fields (contact_person, phone, delivery_days[], delivery_window, lead_time_days, min_order_thb, payment_terms, notes) for the procurement Supplier Directory; contact_info preserved for OCR'
)
ON CONFLICT DO NOTHING;

-- DOWN (manual, for reference):
-- ALTER TABLE public.suppliers
--   DROP COLUMN IF EXISTS contact_person,
--   DROP COLUMN IF EXISTS phone,
--   DROP COLUMN IF EXISTS delivery_days,
--   DROP COLUMN IF EXISTS delivery_window,
--   DROP COLUMN IF EXISTS lead_time_days,
--   DROP COLUMN IF EXISTS min_order_thb,
--   DROP COLUMN IF EXISTS payment_terms,
--   DROP COLUMN IF EXISTS notes;
