import { getSupabase } from "../lib/supabase.js";

interface UpdateSprintArgs {
  sprint_id: string;
  status?: string;
  goal?: string;
  name?: string;
  end_date?: string;
}

export async function updateSprint(args: UpdateSprintArgs) {
  const sb = getSupabase();

  // Verify sprint exists
  const { data: existing, error: fetchErr } = await sb
    .from("sprints")
    .select("id, status")
    .eq("id", args.sprint_id)
    .single();

  if (fetchErr || !existing) {
    return { error: `Sprint not found: ${args.sprint_id}` };
  }

  // If activating, check no other active sprint (DB unique index enforces this too)
  if (args.status === "active" && existing.status !== "active") {
    const { data: activeSprints } = await sb
      .from("sprints")
      .select("id, name")
      .eq("status", "active");

    if (activeSprints && activeSprints.length > 0) {
      return {
        error: `Cannot activate: sprint "${activeSprints[0].name}" (${activeSprints[0].id}) is already active`,
      };
    }
  }

  const update: Record<string, any> = {};
  if (args.status) update.status = args.status;
  if (args.goal !== undefined) update.goal = args.goal;
  if (args.name) update.name = args.name;
  if (args.end_date) update.end_date = args.end_date;

  if (Object.keys(update).length === 0) {
    return { error: "No fields to update" };
  }

  const { data, error } = await sb
    .from("sprints")
    .update(update)
    .eq("id", args.sprint_id)
    .select()
    .single();

  if (error) return { error: `DB error: ${error.message}` };

  return { success: true, sprint: data };
}
