import { getSupabase } from "../lib/supabase.js";

interface UpdateTaskArgs {
  task_id: string;
  status?: string;
  priority?: string;
  title?: string;
  description?: string;
  notes?: string;
  due_date?: string;
  tags?: string[];
  context_files?: string[];
  parent_task_id?: string | null;
  related_ids?: Record<string, string | number | boolean>;
}

export async function updateTask(args: UpdateTaskArgs) {
  const sb = getSupabase();

  // 1. Fetch current task (need related_ids for merge semantics)
  const { data: current, error: fetchErr } = await sb
    .from("business_tasks")
    .select("id, title, status, priority, related_ids")
    .eq("id", args.task_id)
    .single();

  if (fetchErr || !current) {
    return { error: `Task not found: ${args.task_id}` };
  }

  // 2. If parent_task_id provided and non-null, verify it exists (and no self-cycle)
  if (args.parent_task_id) {
    if (args.parent_task_id === args.task_id) {
      return { error: "parent_task_id cannot equal task_id (self-cycle)" };
    }
    const { data: parent } = await sb
      .from("business_tasks")
      .select("id")
      .eq("id", args.parent_task_id)
      .single();
    if (!parent) {
      return { error: `Parent task not found: ${args.parent_task_id}` };
    }
  }

  // 3. Validate related_ids primitives (same rule as emit_business_task)
  if (args.related_ids) {
    for (const [key, val] of Object.entries(args.related_ids)) {
      if (val !== null && typeof val === "object") {
        return {
          error: `related_ids.${key} must be a primitive (string, number, boolean), got object`
        };
      }
    }
  }

  // 4. Build update object (only provided fields)
  const update: Record<string, any> = {};
  if (args.status) update.status = args.status;
  if (args.priority) update.priority = args.priority;
  if (args.title !== undefined) update.title = args.title;
  if (args.description !== undefined) update.description = args.description;
  if (args.notes !== undefined) update.notes = args.notes;
  if (args.due_date !== undefined) update.due_date = args.due_date;
  if (args.tags !== undefined) update.tags = args.tags;
  if (args.context_files !== undefined) update.context_files = args.context_files;
  if (args.parent_task_id !== undefined) update.parent_task_id = args.parent_task_id;

  // related_ids: merge with existing (JSONB bag semantics — add/replace keys,
  // do NOT wipe unrelated keys). Pass {} to explicitly clear.
  if (args.related_ids !== undefined) {
    const base = (current.related_ids as Record<string, unknown>) ?? {};
    update.related_ids = { ...base, ...args.related_ids };
  }

  if (Object.keys(update).length === 0) {
    return { error: "No fields to update. Provide at least one field." };
  }

  // 3. Update
  const { data, error } = await sb
    .from("business_tasks")
    .update(update)
    .eq("id", args.task_id)
    .select("id, title, status, priority, updated_at")
    .single();

  if (error) return { error: `DB error: ${error.message}` };

  return {
    success: true,
    task: data,
    change: `${current.status} → ${data.status}`,
    message: `Updated task: "${data.title}" [${data.status}]`,
  };
}
