import { getSupabase } from "../lib/supabase.js";

interface CreateSprintArgs {
  name: string;
  goal?: string;
  start_date: string;
  end_date: string;
}

export async function createSprint(args: CreateSprintArgs) {
  const sb = getSupabase();

  if (args.end_date <= args.start_date) {
    return { error: "end_date must be after start_date" };
  }

  const { data, error } = await sb
    .from("sprints")
    .insert({
      name: args.name,
      goal: args.goal ?? null,
      start_date: args.start_date,
      end_date: args.end_date,
    })
    .select()
    .single();

  if (error) return { error: `DB error: ${error.message}` };

  return { success: true, sprint: data };
}
