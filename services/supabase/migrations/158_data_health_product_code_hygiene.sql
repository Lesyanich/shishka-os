-- ============================================================
-- Migration 158: data_health_rules — NOMENCLATURE_PRODUCT_CODE_HYGIENE
--
-- Problem: Some nomenclature product_codes contain spaces or special
-- characters (e.g. "RAW-WHITE VINEGAR 5%"). A canonical product_code
-- should only contain uppercase letters, digits, hyphens, and underscores.
-- Codes with spaces or other characters break downstream lookups,
-- GS1 barcode matching, and supplier_catalog cross-checks.
--
-- This rule detects violations for manual review. No auto-fix strategy
-- is registered — renaming a product_code touches FK references and
-- must be reviewed by the CEO before applying.
-- ============================================================

INSERT INTO public.data_health_rules
  (rule_code, title, description, entity_kind, metric, detect_sql, fix_strategy, severity, confidence, created_by)
VALUES
  (
    'NOMENCLATURE_PRODUCT_CODE_HYGIENE',
    'Nomenclature product_code contains spaces or special characters',
    'Canonical product_code must match [A-Z0-9_-]+ only. Codes like "RAW-WHITE VINEGAR 5%" contain spaces or percent signs that break GS1 barcode lookups, supplier_catalog joins, and URL-safe identifiers. Requires manual rename — no auto-fix.',
    'nomenclature',
    'product_code_invalid_chars',
    $sql$SELECT id AS entity_id, product_code, name,
            jsonb_build_object(
              'invalid_chars', regexp_replace(product_code, '[A-Z0-9_\-]', '', 'g'),
              'type', type
            ) AS extra_json
       FROM public.nomenclature
      WHERE is_available = TRUE
        AND product_code ~ '[^A-Z0-9_\-]'$sql$,
    NULL,
    'warn',
    1.0,
    'claude-sonnet-session-0424'
  )
ON CONFLICT (rule_code) DO NOTHING;


-- ─── migration_log self-register ───

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '158_data_health_product_code_hygiene.sql',
  'claude-code',
  'Add NOMENCLATURE_PRODUCT_CODE_HYGIENE rule: detect product_codes with spaces/special chars (e.g. "RAW-WHITE VINEGAR 5%"). Detection-only — fix requires manual CEO review.'
) ON CONFLICT (filename) DO NOTHING;
