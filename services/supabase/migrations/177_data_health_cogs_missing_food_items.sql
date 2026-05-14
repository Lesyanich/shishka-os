-- ============================================================
-- Migration 177: Data Health rule — COGS receipts with missing food_items
--
-- Detects COGS expenses where hub-spoke variance exceeds 20%,
-- meaning most line items were not written to purchase_logs.
-- This was the root cause of zero WAC on 294 items (56,655 THB).
-- ============================================================

INSERT INTO public.data_health_rules (
  rule_code,
  title,
  description,
  entity_kind,
  metric,
  detect_sql,
  fix_strategy,
  severity,
  auto_apply,
  confidence,
  is_active,
  created_by
) VALUES (
  'cogs_missing_food_items',
  'COGS expense with >20% hub-spoke variance (missing food_items)',
  'Detects COGS receipts where the sum of purchase_logs + opex_items + capex_transactions is less than 80% of the expense_ledger amount. This means food_items were not properly written to purchase_logs, causing zero WAC on affected ingredients.',
  'expense',
  'cogs_spoke_variance',
  $detect$
    SELECT
      el.id AS entity_id,
      jsonb_build_object(
        'expense_id', el.id,
        'date', el.transaction_date,
        'hub_amount', el.amount_original,
        'spoke_total', COALESCE(pl.total, 0) + COALESCE(ox.total, 0) + COALESCE(cx.total, 0),
        'variance_pct', ROUND(
          (1 - (COALESCE(pl.total, 0) + COALESCE(ox.total, 0) + COALESCE(cx.total, 0))
               / NULLIF(el.amount_original, 0)) * 100
        ),
        'supplier', s.name
      ) AS extra
    FROM public.expense_ledger el
    LEFT JOIN public.suppliers s ON s.id = el.supplier_id
    LEFT JOIN LATERAL (
      SELECT SUM(total_price) AS total FROM public.purchase_logs WHERE expense_id = el.id
    ) pl ON true
    LEFT JOIN LATERAL (
      SELECT SUM(total_price) AS total FROM public.opex_items WHERE expense_id = el.id
    ) ox ON true
    LEFT JOIN LATERAL (
      SELECT SUM(amount_thb) AS total FROM public.capex_transactions WHERE expense_id = el.id
    ) cx ON true
    WHERE el.flow_type = 'COGS'
      AND el.amount_original > 0
      AND (COALESCE(pl.total, 0) + COALESCE(ox.total, 0) + COALESCE(cx.total, 0))
          < el.amount_original * 0.8
  $detect$,
  'Re-process receipt from receipt_inbox.parsed_payload — extract unmatched food_items and run through reconciliation script or re-approve with v15 which creates RAW-AUTO fallback.',
  'warn',
  FALSE,
  0.95,
  TRUE,
  'claude-code'
)
ON CONFLICT (rule_code) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  detect_sql = EXCLUDED.detect_sql,
  fix_strategy = EXCLUDED.fix_strategy,
  updated_at = now();

-- ── Self-register in migration_log ──
INSERT INTO public.migration_log (filename, applied_by, description)
VALUES (
  '177_data_health_cogs_missing_food_items.sql',
  'claude-code',
  'Data health rule: flag COGS expenses with >20% hub-spoke variance (missing food_items not written to purchase_logs).'
) ON CONFLICT (filename) DO NOTHING;
