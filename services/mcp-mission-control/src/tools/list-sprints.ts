import { getSupabase } from "../lib/supabase.js";

interface ListSprintsArgs {
  status?: string;
  limit?: number;
}

export async function listSprints(args: ListSprintsArgs) {
  const sb = getSupabase();

  let query = sb
    .from("sprints")
    .select("*")
    .order("start_date", { ascending: false })
    .limit(args.limit ?? 10);

  if (args.status) query = query.eq("status", args.status);

  const { data: sprints, error } = await query;

  if (error) return { error: `DB error: ${error.message}` };
  if (!sprints || sprints.length === 0) return { count: 0, sprints: [] };

  // For each sprint, count tasks by status
  const sprintIds = sprints.map((s) => s.id);
  const { data: tasks } = await sb
    .from("business_tasks")
    .select("sprint_id, status")
    .in("sprint_id", sprintIds);

  const countsMap: Record<string, Record<string, number>> = {};
  for (const t of tasks ?? []) {
    if (!t.sprint_id) continue;
    if (!countsMap[t.sprint_id]) countsMap[t.sprint_id] = {};
    countsMap[t.sprint_id][t.status] = (countsMap[t.sprint_id][t.status] ?? 0) + 1;
  }

  return {
    count: sprints.length,
    sprints: sprints.map((s) => {
      const c = countsMap[s.id] ?? {};
      const total = Object.values(c).reduce((sum, n) => sum + n, 0);
      return {
        ...s,
        task_counts: {
          inbox: c["inbox"] ?? 0,
          in_progress: c["in_progress"] ?? 0,
          done: c["done"] ?? 0,
          total,
        },
      };
    }),
  };
}
