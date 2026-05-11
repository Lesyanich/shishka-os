import type { SupabaseClient } from '@supabase/supabase-js';
import type { ResolverResult } from '../pack-info-resolver/types.js';

export interface AutoApplyArgs {
  run_id: string;
  rule_id: string;
  result: ResolverResult;
  supplier_id: string;
  current_base_unit: string | null;
  current_cost_per_unit: number | null;
}

export interface PendingArgs {
  run_id: string;
  rule_id: string;
  result: ResolverResult;
  current_base_unit: string | null;
}

export interface SkipArgs {
  run_id: string;
  rule_id: string;
  nomenclature_id: string;
  current_base_unit: string | null;
  reason: string;
}

function summarize(result: ResolverResult): Record<string, unknown> {
  return {
    source: result.source,
    confidence: result.confidence,
    conflicts: result.conflicts,
    evidence: result.evidence,
  };
}

export async function writeAutoApply(sb: SupabaseClient, args: AutoApplyArgs): Promise<void> {
  const { run_id, rule_id, result, supplier_id, current_base_unit, current_cost_per_unit } = args;
  if (!result.resolved) return;
  const resolved = result.resolved;

  if (current_base_unit !== resolved.base_unit) {
    await sb
      .from('nomenclature')
      .update({ base_unit: resolved.base_unit, updated_at: new Date().toISOString() })
      .eq('id', result.nomenclature_id);

    await sb.from('data_health_decisions').insert({
      run_id,
      rule_id,
      entity_kind: 'nomenclature',
      entity_id: result.nomenclature_id,
      field: 'base_unit',
      old_value: current_base_unit ?? '',
      new_value: resolved.base_unit,
      decision_source: 'rule_auto',
      decided_by: 'pack-info-hook',
      confidence_score: result.confidence,
      source_payload: summarize(result),
      status: 'applied',
    });
  }

  // Phase 2 limitation: write unconditionally — caller passes one supplier_id per
  // receipt line, so the cache stays warm. Phase 3 sweep may need a change-guard
  // (load current pack_* into AutoApplyArgs) to avoid noisy updated_at churn.
  await sb
    .from('supplier_catalog')
    .update({
      package_weight: resolved.package_weight,
      package_qty: resolved.package_qty,
      package_unit: resolved.package_unit,
      // updated_at omitted: trg_sc_updated_at (BEFORE UPDATE) sets it automatically
    })
    .eq('nomenclature_id', result.nomenclature_id)
    .eq('supplier_id', supplier_id);

  if (resolved.cost_per_kg != null) {
    await sb.from('data_health_decisions').insert({
      run_id,
      rule_id,
      entity_kind: 'nomenclature',
      entity_id: result.nomenclature_id,
      field: 'cost_per_unit',
      old_value: current_cost_per_unit != null ? String(current_cost_per_unit) : '',
      new_value: String(resolved.cost_per_kg),
      decision_source: 'rule_auto_cost_pending',
      decided_by: 'pack-info-hook',
      confidence_score: result.confidence,
      source_payload: summarize(result),
      status: 'pending',
    });
  }
}

export async function writePending(sb: SupabaseClient, args: PendingArgs): Promise<void> {
  const { run_id, rule_id, result, current_base_unit } = args;
  const decision_source = result.conflicts.length > 0 ? 'rule_auto_conflict' : 'rule_auto';
  await sb.from('data_health_decisions').insert({
    run_id,
    rule_id,
    entity_kind: 'nomenclature',
    entity_id: result.nomenclature_id,
    field: 'base_unit',
    old_value: current_base_unit ?? '',
    new_value: result.resolved?.base_unit ?? '',
    decision_source,
    decided_by: 'pack-info-hook',
    confidence_score: result.confidence,
    source_payload: summarize(result),
    status: 'pending',
  });
}

export async function writeSkip(sb: SupabaseClient, args: SkipArgs): Promise<void> {
  await sb.from('data_health_decisions').insert({
    run_id: args.run_id,
    rule_id: args.rule_id,
    entity_kind: 'nomenclature',
    entity_id: args.nomenclature_id,
    field: 'base_unit',
    old_value: args.current_base_unit ?? '',
    new_value: '',
    decision_source: 'skip',
    decided_by: 'pack-info-hook',
    confidence_score: 0,
    source_payload: { reason: args.reason },
    status: 'skip',
    notes: args.reason,
  });
}
