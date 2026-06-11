-- 267_renumber_collision_log_sync.sql
-- Renames migration_log rows to match the repo-side renumbering of 37 colliding
-- migration files (MC task 7e4f0f9c, audit-2026-06-11). The files were already
-- applied to prod under their old names; only the filename bookkeeping changes.
-- Old->new mapping doc: services/supabase/migrations/RENUMBERING-2026-06-11.md
-- 5 of the 37 renamed files have no migration_log row (never self-registered);
-- they are repo-only renames and need no UPDATE here.

UPDATE migration_log SET filename = '081a_backfill_sku_barcodes.sql',
  notes = COALESCE(notes, '') || ' [renamed from 081_backfill_sku_barcodes.sql, renumber 2026-06-11]'
  WHERE filename = '081_backfill_sku_barcodes.sql';

UPDATE migration_log SET filename = '083a_backfill_barcodes_from_raw_parse.sql',
  notes = COALESCE(notes, '') || ' [renamed from 083_backfill_barcodes_from_raw_parse.sql, renumber 2026-06-11]'
  WHERE filename = '083_backfill_barcodes_from_raw_parse.sql';

UPDATE migration_log SET filename = '092a_receipt_inbox_delete_policy.sql',
  notes = COALESCE(notes, '') || ' [renamed from 092_receipt_inbox_delete_policy.sql, renumber 2026-06-11]'
  WHERE filename = '092_receipt_inbox_delete_policy.sql';

UPDATE migration_log SET filename = '128a_data_health_infra.sql',
  notes = COALESCE(notes, '') || ' [renamed from 128_data_health_infra.sql, renumber 2026-06-11]'
  WHERE filename = '128_data_health_infra.sql';

UPDATE migration_log SET filename = '134a_approve_receipt_v13.sql',
  notes = COALESCE(notes, '') || ' [renamed from 130_approve_receipt_v13.sql, renumber 2026-06-11]'
  WHERE filename = '130_approve_receipt_v13.sql';

UPDATE migration_log SET filename = '140a_writeback_kds_anon_rls.sql',
  notes = COALESCE(notes, '') || ' [renamed from 140_writeback_kds_anon_rls.sql, renumber 2026-06-11]'
  WHERE filename = '140_writeback_kds_anon_rls.sql';

UPDATE migration_log SET filename = '148a_production_log.sql',
  notes = COALESCE(notes, '') || ' [renamed from 148_production_log.sql, renumber 2026-06-11]'
  WHERE filename = '148_production_log.sql';

UPDATE migration_log SET filename = '165a_categorize_40_new_sale_items.sql',
  notes = COALESCE(notes, '') || ' [renamed from 163_categorize_40_new_sale_items.sql, renumber 2026-06-11]'
  WHERE filename = '163_categorize_40_new_sale_items.sql';

UPDATE migration_log SET filename = '165b_data_health_equipment_missing_specs.sql',
  notes = COALESCE(notes, '') || ' [renamed from 164_data_health_equipment_missing_specs.sql, renumber 2026-06-11]'
  WHERE filename = '164_data_health_equipment_missing_specs.sql';

UPDATE migration_log SET filename = '165c_data_health_new_metrics.sql',
  notes = COALESCE(notes, '') || ' [renamed from 165_data_health_new_metrics.sql, renumber 2026-06-11]'
  WHERE filename = '165_data_health_new_metrics.sql';

UPDATE migration_log SET filename = '166a_learning_metrics.sql',
  notes = COALESCE(notes, '') || ' [renamed from 165_learning_metrics.sql, renumber 2026-06-11]'
  WHERE filename = '165_learning_metrics.sql';

UPDATE migration_log SET filename = '166b_learning_counters_atomic_apply.sql',
  notes = COALESCE(notes, '') || ' [renamed from 166_learning_counters_atomic_apply.sql, renumber 2026-06-11]'
  WHERE filename = '166_learning_counters_atomic_apply.sql';

UPDATE migration_log SET filename = '167a_salad_bar_aliases_and_notes.sql',
  notes = COALESCE(notes, '') || ' [renamed from 167_salad_bar_aliases_and_notes.sql, renumber 2026-06-11]'
  WHERE filename = '167_salad_bar_aliases_and_notes.sql';

UPDATE migration_log SET filename = '170a_hr_payroll_foundation.sql',
  notes = COALESCE(notes, '') || ' [renamed from 168_hr_payroll_foundation.sql, renumber 2026-06-11]'
  WHERE filename = '168_hr_payroll_foundation.sql';

UPDATE migration_log SET filename = '171a_hr_payroll_rpcs.sql',
  notes = COALESCE(notes, '') || ' [renamed from 169_hr_payroll_rpcs.sql, renumber 2026-06-11]'
  WHERE filename = '169_hr_payroll_rpcs.sql';

UPDATE migration_log SET filename = '177a_hr_add_helper_role_nono.sql',
  notes = COALESCE(notes, '') || ' [renamed from 176_hr_add_helper_role_nono.sql, renumber 2026-06-11]'
  WHERE filename = '176_hr_add_helper_role_nono.sql';

UPDATE migration_log SET filename = '200a_add_goat_cheese_villa_market.sql',
  notes = COALESCE(notes, '') || ' [renamed from 198_add_goat_cheese_villa_market.sql, renumber 2026-06-11]'
  WHERE filename = '198_add_goat_cheese_villa_market.sql';

UPDATE migration_log SET filename = '200b_fix_cream_cheese_zaatar_shiitake.sql',
  notes = COALESCE(notes, '') || ' [renamed from 199_fix_cream_cheese_zaatar_shiitake.sql, renumber 2026-06-11]'
  WHERE filename = '199_fix_cream_cheese_zaatar_shiitake.sql';

UPDATE migration_log SET filename = '216a_add_external_url_to_supplier_catalog.sql',
  notes = COALESCE(notes, '') || ' [renamed from 214_add_external_url_to_supplier_catalog.sql, renumber 2026-06-11]'
  WHERE filename = '214_add_external_url_to_supplier_catalog.sql';

UPDATE migration_log SET filename = '215a_wac_recalc_on_purchase_update.sql',
  notes = COALESCE(notes, '') || ' [renamed from 214_wac_recalc_on_purchase_update.sql, renumber 2026-06-11]'
  WHERE filename = '214_wac_recalc_on_purchase_update.sql';

UPDATE migration_log SET filename = '219a_salad_bar_slots.sql',
  notes = COALESCE(notes, '') || ' [renamed from 218_salad_bar_slots.sql, renumber 2026-06-11]'
  WHERE filename = '218_salad_bar_slots.sql';

UPDATE migration_log SET filename = '244e_seed_raw_cost_from_catalog.sql',
  notes = COALESCE(notes, '') || ' [renamed from 221_seed_raw_cost_from_catalog.sql, renumber 2026-06-11]'
  WHERE filename = '221_seed_raw_cost_from_catalog.sql';

UPDATE migration_log SET filename = '244c_add_loyverse_synced_at.sql',
  notes = COALESCE(notes, '') || ' [renamed from 236_add_loyverse_synced_at.sql, renumber 2026-06-11]'
  WHERE filename = '236_add_loyverse_synced_at.sql';

UPDATE migration_log SET filename = '236a_v_dish_assembly_components_drinks_raw.sql',
  notes = COALESCE(notes, '') || ' [renamed from 236_v_dish_assembly_components_drinks_raw.sql, renumber 2026-06-11]'
  WHERE filename = '236_v_dish_assembly_components_drinks_raw.sql';

UPDATE migration_log SET filename = '244d_loyverse_sync_dish_allow_resync.sql',
  notes = COALESCE(notes, '') || ' [renamed from 237_loyverse_sync_dish_allow_resync.sql, renumber 2026-06-11]'
  WHERE filename = '237_loyverse_sync_dish_allow_resync.sql';

UPDATE migration_log SET filename = '243a_modifier_mirror_rls_read.sql',
  notes = COALESCE(notes, '') || ' [renamed from 237_modifier_mirror_rls_read.sql, renumber 2026-06-11]'
  WHERE filename = '237_modifier_mirror_rls_read.sql';

UPDATE migration_log SET filename = '244a_modifier_option_price_override.sql',
  notes = COALESCE(notes, '') || ' [renamed from 238_modifier_option_price_override.sql, renumber 2026-06-11]'
  WHERE filename = '238_modifier_option_price_override.sql';

UPDATE migration_log SET filename = '244b_modifier_sync_state.sql',
  notes = COALESCE(notes, '') || ' [renamed from 239_modifier_sync_state.sql, renumber 2026-06-11]'
  WHERE filename = '239_modifier_sync_state.sql';

UPDATE migration_log SET filename = '247a_stock_request_status.sql',
  notes = COALESCE(notes, '') || ' [renamed from 246_stock_request_status.sql, renumber 2026-06-11]'
  WHERE filename = '246_stock_request_status.sql';

UPDATE migration_log SET filename = '247b_stock_sheet_filters.sql',
  notes = COALESCE(notes, '') || ' [renamed from 247_stock_sheet_filters.sql, renumber 2026-06-11]'
  WHERE filename = '247_stock_sheet_filters.sql';

UPDATE migration_log SET filename = '250a_v_dish_modifier_options_nutrition.sql',
  notes = COALESCE(notes, '') || ' [renamed from 249_v_dish_modifier_options_nutrition.sql, renumber 2026-06-11]'
  WHERE filename = '249_v_dish_modifier_options_nutrition.sql';

UPDATE migration_log SET filename = '253a_nutrition_rollup_food_only.sql',
  notes = COALESCE(notes, '') || ' [renamed from 250_nutrition_rollup_food_only.sql, renumber 2026-06-11]'
  WHERE filename = '250_nutrition_rollup_food_only.sql';


-- Self-register (RULE-MIGRATION-TRACKING)
INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '267_renumber_collision_log_sync.sql',
  'claude-code',
  NULL,
  'Rename 32 migration_log rows to renumbered filenames; collision cleanup (MC 7e4f0f9c)'
)
ON CONFLICT (filename) DO NOTHING;
