-- Migration 216: data_health rule — frozen/fresh SKU mismatch in purchase_logs
-- MC task 30c0dc64
--
-- Numbered 216 because a parallel session (task 667a3f00, agent_memory) took
-- 214+215 and applied them to the DB before merge to main. To keep the
-- repo convention of one stem per number, this rule moves to 216.
-- A corrective DELETE in this file removes the old 215 migration_log row
-- (the rule itself is row-keyed by rule_code so renaming is harmless).
--
-- BUG (from MC 82a16248 bug 3, 2026-05-22):
-- Receipt approval linked "ARO Avocado Halves Frozen 1 kg" (barcode 8851988009286)
-- to RAW-AVOCADO (fresh) because no frozen-avocado SKU existed at the time.
-- The mismatch went undetected for months and distorted WAC.
--
-- Preview against current DB (2026-05-22): 3 real candidates —
--   * ARO Grated Frozen Cheddar Cheese 1 kg → RAW-GOLD_SHREDDED_CHEDDAR (fresh)
--   * ARO Shredded Frozen Mozzarella       → RAW-CHEESE-MOZZARELLA       (fresh)
--   * ARO Frozen Salmon Steak 120-160 g    → RAW-SALMON                  (fresh "Salmon Fillet")
--
-- DESIGN:
-- Flags every purchase_logs row where `notes` matches /(frozen|freeze|frz)/i
-- but the linked nomenclature.name does not. Severity = 'warn' — does not block
-- writes; surfaces in admin DataHealthTab for human review. Fix is always the
-- same: create a frozen-* SKU if none exists, re-link purchase_logs.nomenclature_id.
-- Migration 214's trigger then auto-recomputes WAC for both OLD and NEW.
--
-- Keyword set is English-only by design — supplier note corpus is English (ARO,
-- Makro, Villa Market all label frozen items in English). If Thai/Russian frozen
-- terms appear later, expand the regex via a follow-up UPDATE.
--
-- One-way only (notes-says-frozen vs name-doesn't). The reverse case
-- (frozen-named SKU with non-frozen notes) is too rare to warrant noise.
--
-- IDEMPOTENT: ON CONFLICT (rule_code) DO UPDATE — safe to re-run.

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
)
VALUES (
    'PL_FROZEN_FRESH_MISMATCH',
    'Frozen/fresh SKU mismatch in purchase_logs',
    'purchase_logs.notes contains "frozen/freeze/frz" but the linked nomenclature is a fresh SKU. Typically caused by receipt approval auto-matching to the only existing SKU when no frozen variant exists yet.',
    'purchase_logs',
    'purchase_frozen_fresh_mismatch',
    $detect$
        SELECT
            pl.id AS entity_id,
            n.product_code,
            n.name,
            jsonb_build_object(
                'purchase_log_id',  pl.id,
                'notes',            pl.notes,
                'barcode',          pl.barcode,
                'invoice_date',     pl.invoice_date,
                'quantity',         pl.quantity,
                'price_per_unit',   pl.price_per_unit,
                'linked_product',   n.name,
                'linked_code',      n.product_code,
                'supplier_id',      pl.supplier_id,
                'expense_id',       pl.expense_id
            ) AS extra_json
        FROM public.purchase_logs pl
        JOIN public.nomenclature n ON n.id = pl.nomenclature_id
        WHERE pl.notes ~* '(frozen|freeze|frz)'
          AND n.name !~* '(frozen|freeze|frz)'
    $detect$,
    'Create a frozen-* SKU (e.g. RAW-FROZEN_*) if none exists, then UPDATE purchase_logs.nomenclature_id to the new SKU. Migration 214 trigger will auto-recompute WAC for both OLD and NEW products.',
    'warn',
    FALSE,
    0.90,
    TRUE,
    'claude-code'
)
ON CONFLICT (rule_code) DO UPDATE SET
    title         = EXCLUDED.title,
    description   = EXCLUDED.description,
    entity_kind   = EXCLUDED.entity_kind,
    metric        = EXCLUDED.metric,
    detect_sql    = EXCLUDED.detect_sql,
    fix_strategy  = EXCLUDED.fix_strategy,
    severity      = EXCLUDED.severity,
    auto_apply    = EXCLUDED.auto_apply,
    confidence    = EXCLUDED.confidence,
    is_active     = EXCLUDED.is_active,
    updated_at    = now();

-- Drop the old 215_* migration_log row — the migration was applied at 10:57
-- under the wrong number, then renamed here. Rule itself is row-keyed by
-- rule_code in data_health_rules, so renaming the migration file does not
-- affect the rule's state.
DELETE FROM migration_log
WHERE filename = '215_data_health_frozen_fresh_mismatch.sql';

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
    '216_data_health_frozen_fresh_mismatch.sql',
    'claude-code',
    NULL,
    'Add data_health rule PL_FROZEN_FRESH_MISMATCH — flags purchase_logs where notes say frozen but linked nomenclature name does not. Renumbered 215→216 to avoid collision with parallel agent_memory work. MC 30c0dc64.'
) ON CONFLICT (filename) DO NOTHING;
