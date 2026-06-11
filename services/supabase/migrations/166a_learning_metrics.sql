-- ============================================================
-- Migration 165: Self-learning metrics infrastructure
--
-- WS-4 of Shishka OS Brain Reorganization (parent MC: 75e735e5,
-- child: 30808669). Council Audit (2026-05-04) finding #4:
-- self-learning loops record patterns but have no feedback
-- validation — can't tell if system is improving or reinforcing
-- errors.
--
-- Adds:
--   - correction_rules.times_overridden — counter for manual
--     overrides of an auto-applied rule
--   - correction_rules.last_applied_at — timestamp of most recent
--     auto-application (nullable for never-used rules)
--   - v_learning_metrics view — single-row aggregate of system-wide
--     learning health: total rules, used rules, total applications,
--     total overrides, override_rate (% of applications that were
--     overridden), last_activity timestamp
--
-- Application-side wiring (incrementing the counters when rules
-- fire / get overridden) is OUT OF SCOPE for this migration —
-- handled in a follow-up that touches the approve_receipt RPC.
-- This migration is the schema foundation; the view returns zeros
-- until the wiring lands, and that's the correct behavior.
--
-- Idempotent: safe to re-run. Uses ADD COLUMN IF NOT EXISTS and
-- CREATE OR REPLACE VIEW.
-- ============================================================

-- ── 1. Add counter columns to correction_rules ─────────────────
ALTER TABLE public.correction_rules
  ADD COLUMN IF NOT EXISTS times_overridden INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_applied_at  TIMESTAMPTZ;

COMMENT ON COLUMN public.correction_rules.times_applied IS
  'How many times this rule was auto-applied during ingestion. Incremented by approve_receipt flow when match fires.';
COMMENT ON COLUMN public.correction_rules.times_overridden IS
  'How many times an auto-applied value from this rule was manually overridden by CEO/admin. High ratio vs times_applied = bad rule.';
COMMENT ON COLUMN public.correction_rules.last_applied_at IS
  'Timestamp of most recent auto-application. NULL = never used. Helps prune stale rules.';

-- ── 2. Aggregate view for /health ──────────────────────────────
-- Single-row view: system-wide learning metrics. Override rate is
-- NULL when nothing has been applied yet (avoids divide-by-zero
-- and signals "no data yet" honestly to /health).
CREATE OR REPLACE VIEW public.v_learning_metrics AS
SELECT
  COUNT(*)                                                AS total_rules,
  COUNT(*) FILTER (WHERE times_applied > 0)               AS used_rules,
  COALESCE(SUM(times_applied), 0)                         AS sum_applied,
  COALESCE(SUM(times_overridden), 0)                      AS sum_overridden,
  CASE
    WHEN COALESCE(SUM(times_applied), 0) = 0 THEN NULL
    ELSE ROUND(
      100.0 * COALESCE(SUM(times_overridden), 0)
        / NULLIF(SUM(times_applied), 0),
      1
    )
  END                                                     AS override_rate_pct,
  MAX(last_applied_at)                                    AS last_activity
FROM public.correction_rules;

COMMENT ON VIEW public.v_learning_metrics IS
  'WS-4 self-learning health: counts and override rate for OCR correction rules. Override rate > 30 = the system is learning the wrong thing — review high-override rules in correction_rules ORDER BY times_overridden DESC.';

-- Make the view readable by service-role and anon (anon for
-- read-only /health scripts; values are aggregate, no PII).
GRANT SELECT ON public.v_learning_metrics TO anon, authenticated, service_role;

-- ── 3. Self-register ───────────────────────────────────────────
INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '166a_learning_metrics.sql',
  'claude-code',
  NULL,
  'WS-4 self-learning metrics infra (MC 30808669): counter columns on correction_rules + v_learning_metrics view. App-side wiring to increment counters is a follow-up.'
)
ON CONFLICT DO NOTHING;
