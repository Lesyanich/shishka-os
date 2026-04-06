import { getSupabase } from "../lib/supabase.js";

interface UpdateTaskArgs {
  task_id: string;
  status?: string;
  priority?: string;
  description?: string;
  notes?: string;
  due_date?: string;
  tags?: string[];
  context_files?: string[];
}

export async function updateTask(args: UpdateTaskArgs) {
  const sb = getSupabase();

  // 1. Fetch current task
  const { data: current, error: fetchErr } = await sb
    .from("business_tasks")
    .select("id, title, status, priority")
    .eq("id", args.task_id)
    .single();

  if (fetchErr || !current) {
    return { error: `Task not found: ${args.task_id}` };
  }

  // 2. Build update object (only provided fields)
  const update: Record<string, any> = {};
  if (args.status) update.status = args.status;
  if (args.priority) update.priority = args.priority;
  if (args.description !== undefined) update.description = args.description;
  if (args.notes !== undefined) update.notes = args.notes;
  if (args.due_date !== undefined) update.due_date = args.due_date;
  if (args.tags !== undefined) update.tags = args.tags;
  if (args.context_files !== undefined) update.context_files = args.context_files;

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
