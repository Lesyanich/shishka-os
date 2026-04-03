-- ============================================================
-- Migration 060: Procurement & Receiving ENUM Types
-- Phase 11.1 — Foundation for Purchase Orders & Receiving
-- ============================================================

-- Purchase Order lifecycle
DO $$ BEGIN
  CREATE TYPE po_status AS ENUM (
    'draft',               -- PO created, not yet sent to supplier
    'submitted',           -- Sent to supplier (WhatsApp/email)
    'confirmed',           -- Supplier acknowledged
    'shipped',             -- In transit
    'partially_received',  -- Some items received, PO stays open for backorder
    'received',            -- All items received (may have discrepancies)
    'reconciled',          -- Financial reconciliation complete (Owner approved)
    'cancelled'            -- PO cancelled
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Source of receiving record
DO $$ BEGIN
  CREATE TYPE receiving_source AS ENUM (
    'purchase_order',  -- Path B: goods received against a PO
    'receipt'          -- Path A: receipt scan (physical purchase at Makro/market)
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Reason for rejecting/reporting issue on a received line
DO $$ BEGIN
  CREATE TYPE reject_reason AS ENUM (
    'short_delivery',   -- Supplier sent fewer than ordered
    'damaged',          -- Goods arrived damaged
    'wrong_item',       -- Different product than ordered
    'quality_reject',   -- Does not meet quality standards
    'expired'           -- Product already expired or near expiry
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
