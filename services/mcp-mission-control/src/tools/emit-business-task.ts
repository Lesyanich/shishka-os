import { getSupabase } from "../lib/supabase.js";

interface EmitBusinessTaskArgs {
  title: string;
  description?: string;
  domain: string;
  status?: string;
  priority?: string;
  source?: string;
  created_by: string;
  tags?: string[];
  related_ids: Record<string, string | number | boolean>;
  initiative_id?: string;
  parent_task_id?: string;
  due_date?: string;
  notes?: string;
}

export async function emitBusinessTask(args: EmitBusinessTaskArgs) {
  const sb = getSupabase();

  // ── Validation ──────────────────────────────────────────

  // 1. related_ids must have at least one key
  if (!args.related_ids || Object.keys(args.related_ids).length === 0) {
    return {
      error: "related_ids must include at least one entity ID. " +
             "Standard keys: nomenclature_id, expense_id, inbox_id, agent_session"
    };
  }

  // 2. related_ids values must be primitives (no nested objects)
  for (const [key, val] of Object.entries(args.related_ids)) {
    if (val !== null && typeof val === "object") {
      return {
        error: `related_ids.${key} must be a primitive (string, number, boolean), got object`
      };
    }
  }

  // 3. If initiative_id provided, verify it exists
  if (args.initiative_id) {
    const { data: initiative } = await sb
      .from("business_initiatives")
      .select("id, title")
      .eq("id", args.initiative_id)
      .single();
    if (!initiative) {
      return { error: `Initiative not found: ${args.initiative_id}` };
    }
  }

  // 4. If parent_task_id provided, verify it exists
  if (args.parent_task_id) {
    const { data: parent } = await sb
      .from("business_tasks")
      .select("id, title")
      .eq("id", args.parent_task_id)
      .single();
    if (!parent) {
      return { error: `Parent task not found: ${args.parent_task_id}` };
    }
  }

  // 5. Agents cannot assign work (assigned_to always null)
  //    — enforced by NOT accepting assigned_to in the schema at all

  // ── Insert ──────────────────────────────────────────────

  const row = {
    title:          args.title,
    description:    args.description ?? null,
    domain:         args.domain,
    status:         args.status ?? "inbox",
    priority:       args.priority ?? "medium",
    source:         args.source ?? "agent_discovery",
    created_by:     args.created_by,
    assigned_to:    null,              // agents NEVER assign
    tags:           args.tags ?? [],
    related_ids:    args.related_ids,
    initiative_id:  args.initiative_id ?? null,
    parent_task_id: args.parent_task_id ?? null,
    due_date:       args.due_date ?? null,
    notes:          args.notes ?? null,
  };

  const { data, error } = await sb
    .from("business_tasks")
    .insert(row)
    .select("id, title, domain, status, priority, created_at")
    .single();

  if (error) {
    return { error: `DB error: ${error.message}` };
  }

  // ── Response ────────────────────────────────────────────

  return {
    success: true,
    task: {
      id:         data.id,
      title:      data.title,
      domain:     data.domain,
      status:     data.status,
      priority:   data.priority,
      created_at: data.created_at,
    },
    message: `Task created in Mission Control: [${data.domain}] ${data.priority} — "${data.title}"`,
  };
}
