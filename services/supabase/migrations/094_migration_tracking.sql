-- Migration 094: Migration Tracking System
-- Creates migration_log table and seeds all existing migrations as baseline.

BEGIN;

-- 1. Create migration_log table
CREATE TABLE IF NOT EXISTS public.migration_log (
  id          SERIAL PRIMARY KEY,
  filename    TEXT NOT NULL UNIQUE,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_by  TEXT NOT NULL DEFAULT 'manual',
  status      TEXT NOT NULL DEFAULT 'success'
              CHECK (status IN ('success', 'failed', 'rolled_back')),
  error_msg   TEXT,
  checksum    TEXT,
  notes       TEXT
);

COMMENT ON TABLE public.migration_log IS 'Registry of applied SQL migrations. Baseline seeded by 094.';

-- RLS: allow service_role full access, anon/authenticated read-only
ALTER TABLE public.migration_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "migration_log_read" ON public.migration_log
  FOR SELECT USING (true);

CREATE POLICY "migration_log_service_write" ON public.migration_log
  FOR ALL USING (auth.role() = 'service_role');

-- 2. Seed all 83 existing migrations as baseline
INSERT INTO migration_log (filename, applied_by, status, checksum, notes) VALUES
  ('014_admin_panel_rls.sql',                    'manual', 'success', '7ec345cc95275d38045494b170aec5bb', 'baseline seed'),
  ('015_seeds_production_flow.sql',              'manual', 'success', 'ad75ac6eebf3366511e71ded19833465', 'baseline seed'),
  ('016_kds_scheduling.sql',                     'manual', 'success', '45fe88d9e4f435af8868159435e8422c', 'baseline seed'),
  ('017_inventory_waste.sql',                    'manual', 'success', '4a2c41edcf25f9230cb8c86fcb3a5924', 'baseline seed'),
  ('018_batches_and_locations.sql',              'manual', 'success', 'b5e93bac0afb2e2ef2abdcf8326f59aa', 'baseline seed'),
  ('019_nomenclature_cost_notes.sql',            'manual', 'success', '16a799842bbe96eef340b2a86bbdf8e6', 'baseline seed'),
  ('020_storefront_pricing.sql',                 'manual', 'success', '00791572058b16c112292ade4febb647', 'baseline seed'),
  ('021_procurement.sql',                        'manual', 'success', '5f02bc3af67ad8c47ab5808e93de8a46', 'baseline seed'),
  ('022_orders_pipeline.sql',                    'manual', 'success', 'c309fffef8b3a0611afd640cf589a973', 'baseline seed'),
  ('023_mrp_engine.sql',                         'manual', 'success', 'e77d4661bf6898102d75426214059124', 'baseline seed'),
  ('024_expense_ledger.sql',                     'manual', 'success', 'f59a2ccc91d101a515e99f70edc60d2a', 'baseline seed'),
  ('025_import_expenses.sql',                    'manual', 'success', '8e7a001ab839bc3c6773e1688a66caad', 'baseline seed'),
  ('026_data_cleanup_comments_tax.sql',          'manual', 'success', 'b029b14549b9beccf242af9d2cfc4c09', 'baseline seed'),
  ('027_supplier_mapping_fix.sql',               'manual', 'success', 'f95973ed6c1e42c8a53e48bc171d3c21', 'baseline seed'),
  ('028_rls_fin_categories_select.sql',          'manual', 'success', 'ad8808810f398d4e923472f487ea840a', 'baseline seed'),
  ('029_rls_suppliers_select_fix.sql',           'manual', 'success', '72c39b3db7935a649fa837e0785cfbe5', 'baseline seed'),
  ('030_smart_receipt_routing.sql',              'manual', 'success', '81386f663d60409901380629e641bb51', 'baseline seed'),
  ('031_security_audit_column_privileges.sql',   'manual', 'success', '5a30e76b86d110dc86ee71f18544c81d', 'baseline seed'),
  ('032_fix_ledger_visibility.sql',              'manual', 'success', '12aef3bc4d64a9a7f149db19af609d35', 'baseline seed'),
  ('033_fix_makro_supplier.sql',                 'manual', 'success', 'e55d3be61385ed9a069788752977beb2', 'baseline seed'),
  ('034_zero_data_loss.sql',                     'manual', 'success', '5d484ea49578bcda3922aede35a56eb4', 'baseline seed'),
  ('035_supplier_item_mapping.sql',              'manual', 'success', 'b3dd09c27eefa287d954506d3c1ac991', 'baseline seed'),
  ('036_receipt_jobs.sql',                       'manual', 'success', 'a3b3cd50d6f5d00c0531e84daa82a564', 'baseline seed'),
  ('037_receipt_jobs_ocr_text.sql',              'manual', 'success', '961db14e765474999d7d99979a689172', 'baseline seed'),
  ('038_reconciliation.sql',                     'manual', 'success', '1cf48de934ea661db45fad8a5de0b9d5', 'baseline seed'),
  ('039_uom_conversion.sql',                     'manual', 'success', '46dea8efc07b3f01d92daed6bcdff2b5', 'baseline seed'),
  ('040_approve_receipt_uom.sql',                'manual', 'success', '4ee2e6441e1ce3866c2c2f6acc1dadcb', 'baseline seed'),
  ('041_delivery_fee.sql',                       'manual', 'success', 'e5ea0dcdeb8678adf5b97ef0cd1b4029', 'baseline seed'),
  ('042_supplier_products.sql',                  'manual', 'success', '23bbcbec86d13cbc63571ad1590bf20d', 'baseline seed'),
  ('043_product_catalog_overhaul.sql',           'manual', 'success', '75403cb5128be9a9b2da6dd82f438a27', 'baseline seed'),
  ('044_nomenclature_dedup.sql',                 'manual', 'success', 'f492240c72270beda08d03308bd59945', 'baseline seed'),
  ('045_product_categories.sql',                 'manual', 'success', '125908694b8e9c2427e2b8cb70b8ba47', 'baseline seed'),
  ('046_nomenclature_categories.sql',            'manual', 'success', 'b6baf87778ad9b473545cfa3f7ea27d7', 'baseline seed'),
  ('047_approve_receipt_v8.sql',                 'manual', 'success', '9e9c041b45900e014e3e26a8de0e7878', 'baseline seed'),
  ('048_production_outputs.sql',                 'manual', 'success', '32dc17292abe3edc3560042cfb45337c', 'baseline seed'),
  ('049_supplier_catalog.sql',                   'manual', 'success', '5fbb177c10ff36d039d160e66e921111', 'baseline seed'),
  ('050_wac_costing.sql',                        'manual', 'success', '3ed1ef9a7d79c07b9ff8b57f45dcbe8e', 'baseline seed'),
  ('051_order_modifiers.sql',                    'manual', 'success', '2b8ed6370f6a4a3080b2a32bf865294e', 'baseline seed'),
  ('052_accountability_cleanup.sql',             'manual', 'success', '9f80cf7c94c382347193be7142248f8f', 'baseline seed'),
  ('053_security_prep.sql',                      'manual', 'success', '8e0afaa0c1f2ee8e5ab123e43dfe492d', 'baseline seed'),
  ('054_auth_rls.sql',                           'manual', 'success', '68e494e81a582e23ef74aa6bbc264383', 'baseline seed'),
  ('055_created_by_tracking.sql',                'manual', 'success', 'fe5e9025c0725a69c3c0bf5eeafb0a90', 'baseline seed'),
  ('056_ghost_rpc_rewrite.sql',                  'manual', 'success', '0ee603e04431f999550586aa9f970d2b', 'baseline seed'),
  ('057_sku_layer.sql',                          'manual', 'success', '526c7a438f969105249eaaced3c09fc3', 'baseline seed'),
  ('058_rpc_sku_aware.sql',                      'manual', 'success', '7c503b67ad590d532f356723e5c01fc1', 'baseline seed'),
  ('059_cleanup_deprecated_columns.sql',         'manual', 'success', 'fc6e2dec7ce5bfa9629f49b1fba52114', 'baseline seed'),
  ('060_procurement_enums.sql',                  'manual', 'success', 'afa83f9bb45032be9d0f92fa57e39f90', 'baseline seed'),
  ('061_purchase_orders.sql',                    'manual', 'success', '214b0c69517a6429d9c77c8f7c78ca02', 'baseline seed'),
  ('062_receiving.sql',                          'manual', 'success', '23c640a1fc7ba2ad429f9f934b3f1f96', 'baseline seed'),
  ('063_procurement_links.sql',                  'manual', 'success', 'af7763d3e0d3c4c01626bf1ed5e78aa9', 'baseline seed'),
  ('064_procurement_rpcs.sql',                   'manual', 'success', '5fa04fe518e96986e428f6a4d2e00b45', 'baseline seed'),
  ('065_approve_receipt_v11.sql',                'manual', 'success', '674fb22b68bdcc2220e0d785a765cfbc', 'baseline seed'),
  ('066_syrve_integration.sql',                  'manual', 'success', '91a1d625a47ec8e879917540d8d07f68', 'baseline seed'),
  ('067_normalize_seed_data.sql',                'manual', 'success', '911071ee5c4153d8b1fc3793a13c20e9', 'baseline seed'),
  ('067a_extend_tag_group_enum.sql',             'manual', 'success', '1fc19f5660501982e1455b95dd2770bb', 'baseline seed'),
  ('068_data_quality.sql',                       'manual', 'success', '58adad7bac27be2a8d31b7298cfd1e7f', 'baseline seed'),
  ('069_staff_schedule.sql',                     'manual', 'success', 'cb57212101ff842bd5605609666cffca', 'baseline seed'),
  ('070_equipment_enrichment.sql',               'manual', 'success', '1a2364f6ff278cce91c6d72199b6285a', 'baseline seed'),
  ('071_nomenclature_type_normalize.sql',        'manual', 'success', '876a61f89d576e4ef8632249dcf30a50', 'baseline seed'),
  ('072_fix_nutrition_per_base_unit.sql',         'manual', 'success', '5a62ed521c7d8e46350598c5fc9cd437', 'baseline seed'),
  ('073_chicken_grill_recipe_flow.sql',          'manual', 'success', '5cdc15dd426bdfc1777b1a360bc23190', 'baseline seed'),
  ('074_recipes_flow_v2.sql',                    'manual', 'success', '9f2e1c7f6c35d28d955dd10b7b72ffee', 'baseline seed'),
  ('075_production_orders.sql',                  'manual', 'success', '59b36db2ce3393ee068d8d15a42c7848', 'baseline seed'),
  ('076_equipment_slots_enrich.sql',             'manual', 'success', 'f5b32bef5ddae93a1a16351f6d0fd2bc', 'baseline seed'),
  ('077_fix_is_passive_verify.sql',              'manual', 'success', '7f81515b75631bd056c997003a3df1ef', 'baseline seed'),
  ('078_equipment_location.sql',                 'manual', 'success', '96e23dc93102b91272850be99f8cb20b', 'baseline seed'),
  ('079_equipment_maintenance.sql',              'manual', 'success', 'b233f6c51b76338ebb9885741e9b20e5', 'baseline seed'),
  ('080_receipt_pages.sql',                      'manual', 'success', '23cd07f3c3e07c87360371d45e93f060', 'baseline seed'),
  ('081_allow_credit_notes.sql',                 'manual', 'success', '5c4229fbc8cd311c60fc28421d794e59', 'baseline seed'),
  ('081_backfill_sku_barcodes.sql',              'manual', 'success', '680f0c5c87366c6f3910d05c790d2dd0', 'baseline seed'),
  ('082_backfill_sku_suppliers_barcodes.sql',    'manual', 'success', '56ce33177179e7c7759e970e54b748d2', 'baseline seed'),
  ('083_backfill_barcodes_from_raw_parse.sql',   'manual', 'success', 'f9f415c9312bc19f6a9f91b6fbc59704', 'baseline seed'),
  ('083_raw_parse_column.sql',                   'manual', 'success', 'ad7370dcab22ea81e25bdaa257872f09', 'baseline seed'),
  ('084_backfill_raw_parse.sql',                 'manual', 'success', '8a5c30e80f77d486b96142368cbf03bb', 'baseline seed'),
  ('085_approve_receipt_v12.sql',                'manual', 'success', 'ae762faac90330edae8bf0a8c9fb2c14', 'baseline seed'),
  ('086_receipt_inbox.sql',                      'manual', 'success', '0b5805b9d167e6f4f1d5ef1828311a72', 'baseline seed'),
  ('087_backfill_purchase_logs_barcodes.sql',    'manual', 'success', '420fbe2636007f5b562a3eaee22329db', 'baseline seed'),
  ('088_fix_barcode_conflicts_and_sync.sql',     'manual', 'success', '1cd1507f5b8a3356b56aed0a717787b7', 'baseline seed'),
  ('089_fix_duplicates_and_return.sql',          'manual', 'success', '7697ecb8b46bc9d722cb8a14625788fc', 'baseline seed'),
  ('090_add_parsed_payload_to_receipt_inbox.sql','manual', 'success', '35a88e4310a90fa6917080384bb6a1cc', 'baseline seed'),
  ('091_business_tasks.sql',                     'manual', 'success', '48c4090468e47c21364e3fd58c53ef14', 'baseline seed'),
  ('092_inbox_management.sql',                   'manual', 'success', '28b8f4ca6440d755434eea2047c0818f', 'baseline seed'),
  ('092_receipt_inbox_delete_policy.sql',        'manual', 'success', '83330f13f222f71a1e0bfbd03144430b', 'baseline seed'),
  ('093_mc_agile.sql',                           'manual', 'success', '6eba276f0f358692b9d56dbe35a1aa15', 'baseline seed');

-- 3. Self-register this migration
INSERT INTO migration_log (filename, applied_by, checksum)
VALUES ('094_migration_tracking.sql', 'manual', '611637850ee92c868c0ef5d98c7a3c18');

COMMIT;
