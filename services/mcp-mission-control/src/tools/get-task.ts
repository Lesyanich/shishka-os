import { getSupabase } from "../lib/supabase.js";

export async function getTask(args: { task_id: string }) {
  const sb = getSupabase();

  const { data, error } = await sb
    .from("business_tasks")
    .select("*")
    .eq("id", args.task_id)
    .single();

  if (error) return { error: `Task not found: ${args.task_id}` };

  // If initiative_id exists, fetch initiative title
  let initiative = null;
  if (data.initiative_id) {
    const { data: init } = await sb
      .from("business_initiatives")
      .select("id, title, status")
      .eq("id", data.initiative_id)
      .single();
    initiative = init;
  }

  // If parent_task_id exists, fetch parent task title
  let parent_task = null;
  if (data.parent_task_id) {
    const { data: parent } = await sb
      .from("business_tasks")
      .select("id, title, status")
      .eq("id", data.parent_task_id)
      .single();
    parent_task = parent;
  }

  // Fetch recent comments
  const { data: comments } = await sb
    .from("task_comments")
    .select("*")
    .eq("task_id", args.task_id)
    .order("created_at", { ascending: true })
    .limit(10);

  return {
    task: data,
    initiative,
    parent_task,
    comments: comments ?? [],
  };
}
