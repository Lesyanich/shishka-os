import { getSupabase } from "../lib/supabase.js";

interface ListCommentsArgs {
  task_id: string;
  limit?: number;
}

export async function listComments(args: ListCommentsArgs) {
  const sb = getSupabase();

  const { data, error } = await sb
    .from("task_comments")
    .select("*")
    .eq("task_id", args.task_id)
    .order("created_at", { ascending: true })
    .limit(args.limit ?? 20);

  if (error) return { error: `DB error: ${error.message}` };

  return {
    count: (data ?? []).length,
    comments: data ?? [],
  };
}
