import type { SupabaseClient } from '@supabase/supabase-js';
import { resolve, type PackInfoDataProvider, type ResolverResult } from '../pack-info-resolver/index.js';
import { hasRecentSkipDecision } from '../pack-info-hook/cooldown.js';
import { writeAutoApply, writePending, writeSkip } from '../pack-info-hook/decisions-writer.js';
import {
  SUSPICIOUS_BASE_UNITS,
  PACK_INFO_RULE_CODE,
  AUTO_APPLY_CONFIDENCE,
  PENDING_CONFIDENCE_FLOOR,
  SKIP_COOLDOWN_DAYS,
} from '../pack-info-hook/shared-constants.js';
import type { CorrectionReport, ErrorReport } from '../pack-info-hook/hook.js';
import { fetchSweepCandidates } from './candidates.js';

export interface SweepOpts {
  /** Max nomenclature rows to sweep in this run. Defaults to 100. */
  limit?: number;
  /** Optional fixed run_id (UUID). Defaults to a freshly-generated UUID. */
  runId?: string;
}

export interface SweepResult {
  run_id: string;
  total_candidates: number;
  auto_applied: CorrectionReport[];
  pending: CorrectionReport[];
  skipped: Array<{ nomenclature_id: string; reason: string }>;
  errors: ErrorReport[];
}

const DEFAULT_LIMIT = 100;

export async function runPackInfoSweep(
  sb: SupabaseClient,
  provider: PackInfoDataProvider,
  opts: SweepOpts = {},
): Promise<SweepResult> {
  const run_id = opts.runId ?? crypto.randomUUID();
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const auto_applied: CorrectionReport[] = [];
  const pending: CorrectionReport[] = [];
  const skipped: Array<{ nomenclature_id: string; reason: string }> = [];
  const errors: ErrorReport[] = [];

  // 1. Fetch candidates via RPC
  const fetched = await fetchSweepCandidates(sb, limit);
  if (!fetched.ok) {
    errors.push({ stage: 'sweep-fetch', message: fetched.error });
    return { run_id, total_candidates: 0, auto_applied, pending, skipped, errors };
  }
  const candidates = fetched.candidates;
  if (candidates.length === 0) {
    return { run_id, total_candidates: 0, auto_applied, pending, skipped, errors };
  }

  // 2. Resolve rule_id once
  const { data: ruleRow, error: ruleErr } = (await sb
    .from('data_health_rules')
    .select('id')
    .eq('rule_code', PACK_INFO_RULE_CODE)
    .single()) as unknown as { data: { id: string } | null; error: { message: string } | null };

  if (ruleErr || !ruleRow) {
    errors.push({ stage: 'fetch-rule', message: ruleErr?.message ?? `rule ${PACK_INFO_RULE_CODE} not found` });
    return { run_id, total_candidates: candidates.length, auto_applied, pending, skipped, errors };
  }
  const rule_id = ruleRow.id;

  // 3. Iterate
  for (const c of candidates) {
    if (!SUSPICIOUS_BASE_UNITS.has(c.base_unit)) {
      // RPC already filters but double-check guards against schema drift
      continue;
    }

    if (await hasRecentSkipDecision(sb, c.nomenclature_id, 'base_unit', SKIP_COOLDOWN_DAYS)) {
      // No DB write: a prior skip row is still in its cooldown window. Reported only.
      skipped.push({ nomenclature_id: c.nomenclature_id, reason: '7d-cooldown' });
      continue;
    }

    let result: ResolverResult;
    try {
      result = await resolve(
        {
          nomenclature_id: c.nomenclature_id,
          supplier_id: c.recent_supplier_id,
          barcode: c.recent_barcode ?? undefined,
          last_price_thb: c.recent_price_per_unit ?? undefined,
          name: c.name ?? undefined,
          onMakroError: (err, level) => {
            errors.push({
              stage: 'makro',
              level,
              nomenclature_id: c.nomenclature_id,
              message: err.message,
            });
          },
        },
        provider,
      );
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      errors.push({ stage: 'resolve', nomenclature_id: c.nomenclature_id, message: error.message });
      continue;
    }

    // Defensive invariant — matches hook.ts logic
    if (result.confidence >= AUTO_APPLY_CONFIDENCE && !result.resolved && result.conflicts.length === 0) {
      errors.push({
        stage: 'resolve',
        nomenclature_id: c.nomenclature_id,
        message: 'invariant violated: high-confidence result has no resolved pack info and no conflicts',
      });
      continue;
    }

    try {
      if (
        result.conflicts.length > 0 ||
        (result.confidence >= PENDING_CONFIDENCE_FLOOR && result.confidence < AUTO_APPLY_CONFIDENCE)
      ) {
        await writePending(sb, { run_id, rule_id, result, current_base_unit: c.base_unit });
        pending.push({
          nomenclature_id: c.nomenclature_id,
          action: 'pending',
          source: result.source,
          confidence: result.confidence,
          resolved_base_unit: result.resolved?.base_unit,
        });
      } else if (result.confidence >= AUTO_APPLY_CONFIDENCE && result.resolved) {
        await writeAutoApply(sb, {
          run_id,
          rule_id,
          result,
          supplier_id: c.recent_supplier_id,
          current_base_unit: c.base_unit,
          current_cost_per_unit: c.cost_per_unit,
        });
        auto_applied.push({
          nomenclature_id: c.nomenclature_id,
          action: 'auto-applied',
          source: result.source,
          confidence: result.confidence,
          resolved_base_unit: result.resolved.base_unit,
        });
      } else {
        await writeSkip(sb, {
          run_id,
          rule_id,
          nomenclature_id: c.nomenclature_id,
          current_base_unit: c.base_unit,
          reason: 'cascade-fail',
        });
        skipped.push({ nomenclature_id: c.nomenclature_id, reason: 'cascade-fail' });
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      errors.push({ stage: 'write', nomenclature_id: c.nomenclature_id, message: error.message });
    }
  }

  return { run_id, total_candidates: candidates.length, auto_applied, pending, skipped, errors };
}
