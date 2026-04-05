import { getSupabase } from "../lib/supabase.js";

interface AddCommentArgs {
  task_id: string;
  author: string;
  body: string;
}

export async function addComment(args: AddCommentArgs) {
  const sb = getSupabase();

  // Verify task exists
  const { data: task, error: taskErr } = await sb
    .from("business_tasks")
    .select("id")
    .eq("id", args.task_id)
    .single();

  if (taskErr || !task) {
    return { error: `Task not found: ${args.task_id}` };
  }

  const { data, error } = await sb
    .from("task_comments")
    .insert({
      task_id: args.task_id,
      author: args.author,
      body: args.body,
    })
    .select()
    .single();

  if (error) return { error: `DB error: ${error.message}` };

  return { success: true, comment: data };
}
