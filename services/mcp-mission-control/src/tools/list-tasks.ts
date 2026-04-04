import { getSupabase } from "../lib/supabase.js";

const PRIORITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

interface ListTasksArgs {
  domain?: string;
  status?: string;
  priority?: string;
  created_by?: string;
  limit?: number;
  include_done?: boolean;
}

export async function listTasks(args: ListTasksArgs) {
  const sb = getSupabase();

  let query = sb
    .from("business_tasks")
    .select(
      "id, title, description, domain, status, priority, source, created_by, due_date, tags, related_ids, created_at, updated_at"
    )
    .order("created_at", { ascending: false })
    .limit(args.limit ?? 20);

  if (args.domain) query = query.eq("domain", args.domain);
  if (args.status) query = query.eq("status", args.status);
  if (args.priority) query = query.eq("priority", args.priority);
  if (args.created_by) query = query.eq("created_by", args.created_by);

  if (!args.include_done) {
    query = query.not("status", "in", '("done","cancelled")');
  }

  const { data, error } = await query;

  if (error) return { error: `DB error: ${error.message}` };

  // Sort by priority in JS (critical > high > medium > low)
  const sorted = (data ?? []).sort(
    (a, b) =>
      (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9)
  );

  return {
    count: sorted.length,
    tasks: sorted.map((t) => ({
      id: t.id,
      title: t.title,
      domain: t.domain,
      status: t.status,
      priority: t.priority,
      created_by: t.created_by,
      due_date: t.due_date,
      tags: t.tags,
      spec_file: (t.related_ids as Record<string, any>)?.spec_file ?? null,
      created_at: t.created_at,
    })),
  };
}
