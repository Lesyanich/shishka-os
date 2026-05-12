/**
 * Base units that suggest the nomenclature row was created from a receipt
 * line where the parser couldn't infer the real weight unit (e.g. "5 pcs"
 * of a flour bag). These are the rows the pack-info pipeline targets for
 * auto-correction.
 *
 * Must stay in sync with the SQL array in
 * services/supabase/migrations/171_pack_info_sweep_rpc.sql (Phase 3 RPC).
 */
export const SUSPICIOUS_BASE_UNITS = new Set(['pcs', 'bag', 'bottle', 'pack']);

/**
 * data_health_rules.rule_code used by both the real-time hook and the
 * nightly sweep. The row is seeded by migration 170.
 */
export const PACK_INFO_RULE_CODE = 'NOMENCLATURE_AUTO_PACK_FILL';

/**
 * Decision-gate thresholds — shared between hook and sweep so the gate
 * behaves identically in both pipelines.
 */
export const AUTO_APPLY_CONFIDENCE = 0.9;
export const PENDING_CONFIDENCE_FLOOR = 0.5;
export const SKIP_COOLDOWN_DAYS = 7;
