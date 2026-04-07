/**
 * emit-task — Tier 1 business task emitter
 *
 * Writes meaningful business outcomes to Supabase `business_tasks` table.
 * These appear in Mission Control UI (Kanban board).
 *
 * See docs/constitution/agent-rules.md for the full protocol.
 * NEVER use this for technical sub-steps (SQL fixes, TS errors, retries).
 */

import { getSupabase } from "./supabase.js";

type TaskDomain =
  | "kitchen"
  | "procurement"
  | "finance"
  | "marketing"
  | "ops"
  | "sales"
  | "strategy"
  | "tech";

type TaskStatus =
  | "inbox"
  | "backlog"
  | "in_progress"
  | "blocked"
  | "done"
  | "cancelled";

type TaskPriority = "critical" | "high" | "medium" | "low";

export interface EmitTaskArgs {
  title: string;
  domain: TaskDomain;
  created_by: string;
  description?: string;
  priority?: TaskPriority;
  status?: TaskStatus;
  source?: string;
  tags?: string[];
  related_ids?: Record<string, unknown>;
  parent_task_id?: string;
  notes?: string;
}

export async function emitBusinessTask(
  args: EmitTaskArgs
): Promise<{ ok: true; task_id: string } | { ok: false; error: string }> {
  try {
    const sb = getSupabase();

    const { data, error } = await sb
      .from("business_tasks")
      .insert({
        title: args.title,
        description: args.description ?? null,
        domain: args.domain,
        status: args.status ?? "inbox",
        priority: args.priority ?? "medium",
        source: args.source ?? "agent_discovery",
        created_by: args.created_by,
        assigned_to: null,
        tags: args.tags ?? [],
        related_ids: args.related_ids ?? {},
        parent_task_id: args.parent_task_id ?? null,
        notes: args.notes ?? null,
      })
      .select("id")
      .single();

    if (error) {
      console.error("[emit-task] insert error:", error.message);
      return { ok: false, error: error.message };
    }

    return { ok: true, task_id: data.id };
  } catch (err: any) {
    // Never crash on tracking failure — log and continue
    console.error("[emit-task] unexpected error:", err.message);
    return { ok: false, error: err.message };
  }
}
