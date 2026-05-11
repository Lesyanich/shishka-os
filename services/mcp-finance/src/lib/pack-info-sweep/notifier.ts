import type { SupabaseClient } from '@supabase/supabase-js';
import type { SweepResult } from './sweep.js';

export interface NotifierInput {
  /** MC task UUID for the per-run comment, or null to skip the comment. */
  task_id: string | null;
  result: SweepResult;
}

/**
 * Builds the human-readable comment body posted to MC.
 * Exported separately for unit testing.
 */
export function formatSummaryBody(r: SweepResult): string {
  const lines: string[] = [];
  lines.push(`## Pack-info sweep — run ${r.run_id}`);
  lines.push('');
  lines.push(
    `Scanned ${r.total_candidates} candidates → ${r.auto_applied.length} auto-applied, ` +
      `${r.pending.length} pending, ${r.skipped.length} skipped.`,
  );

  if (r.auto_applied.length > 0) {
    lines.push('');
    lines.push('### Auto-applied');
    for (const c of r.auto_applied) {
      lines.push(
        `- ${c.nomenclature_id} → ${c.resolved_base_unit ?? '?'} (source: ${c.source ?? 'n/a'}, conf=${c.confidence})`,
      );
    }
  }

  if (r.pending.length > 0) {
    lines.push('');
    lines.push('### Pending review');
    for (const c of r.pending) {
      lines.push(
        `- ${c.nomenclature_id} → ${c.resolved_base_unit ?? '?'} (source: ${c.source ?? 'n/a'}, conf=${c.confidence})`,
      );
    }
  }

  if (r.skipped.length > 0) {
    lines.push('');
    lines.push('### Skipped');
    for (const s of r.skipped) {
      lines.push(`- ${s.nomenclature_id}: ${s.reason}`);
    }
  }

  if (r.errors.length > 0) {
    lines.push('');
    lines.push(`### Errors (${r.errors.length})`);
    for (const e of r.errors) {
      const nid = e.nomenclature_id ? ` (${e.nomenclature_id})` : '';
      lines.push(`- [${e.stage}]${nid} ${e.message}`);
    }
  }

  return lines.join('\n');
}

/**
 * Emits a structured JSON line to stdout (captured by GitHub Actions log)
 * and optionally inserts a task_comments row for human-readable visibility
 * in Mission Control.
 *
 * Failures to post the MC comment are logged to stderr but do not throw —
 * the sweep itself is the source of truth via data_health_decisions.
 */
export async function postSweepSummary(
  sb: SupabaseClient | null,
  input: NotifierInput,
): Promise<void> {
  const json = {
    event: 'pack_info_sweep_summary',
    run_id: input.result.run_id,
    counts: {
      candidates: input.result.total_candidates,
      auto_applied: input.result.auto_applied.length,
      pending: input.result.pending.length,
      skipped: input.result.skipped.length,
      errors: input.result.errors.length,
    },
    errors: input.result.errors,
  };
  console.log(JSON.stringify(json));

  if (!sb || !input.task_id) return;

  const { error } = await sb.from('task_comments').insert({
    task_id: input.task_id,
    author: 'pack-info-sweep',
    body: formatSummaryBody(input.result),
  });
  if (error) {
    console.error(
      `[pack-info-sweep] failed to post MC comment to ${input.task_id}: ${error.message}`,
    );
  }
}
