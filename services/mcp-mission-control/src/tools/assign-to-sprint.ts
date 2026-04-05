import { getSupabase } from "../lib/supabase.js";

interface AssignToSprintArgs {
  task_id: string;
  sprint_id: string;
}

export async function assignToSprint(args: AssignToSprintArgs) {
  const sb = getSupabase();

  // Verify task exists
  const { data: task, error: taskErr } = await sb
    .from("business_tasks")
    .select("id, title")
    .eq("id", args.task_id)
    .single();

  if (taskErr || !task) {
    return { error: `Task not found: ${args.task_id}` };
  }

  // Unassign if empty string or "null"
  const sprintId = args.sprint_id === "" || args.sprint_id === "null" ? null : args.sprint_id;

  // Verify sprint exists (if assigning)
  if (sprintId) {
    const { data: sprint, error: sprintErr } = await sb
      .from("sprints")
      .select("id, name")
      .eq("id", sprintId)
      .single();

    if (sprintErr || !sprint) {
      return { error: `Sprint not found: ${sprintId}` };
    }
  }

  const { data, error } = await sb
    .from("business_tasks")
    .update({ sprint_id: sprintId })
    .eq("id", args.task_id)
    .select()
    .single();

  if (error) return { error: `DB error: ${error.message}` };

  return { success: true, task: data };
}
