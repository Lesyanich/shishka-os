import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Returns true if a skip-decision was recorded for (entity_id, field) within
 * the last `days` days. Used to avoid re-flagging cascade failures every day.
 *
 * Errors are swallowed and treated as "no cooldown" so the hook degrades open
 * (we'd rather re-evaluate than silently suppress on a transient DB error).
 */
export async function hasRecentSkipDecision(
  sb: SupabaseClient,
  entity_id: string,
  field: string,
  days: number,
): Promise<boolean> {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data, error } = await sb
    .from('data_health_decisions')
    .select('id')
    .eq('entity_id', entity_id)
    .eq('field', field)
    .eq('status', 'skip')
    .gt('decided_at', cutoff)
    .limit(1);
  if (error) return false;
  return (data?.length ?? 0) > 0;
}
