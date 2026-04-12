import { getSupabase } from "../lib/supabase.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveTaskId(
  sb: ReturnType<typeof getSupabase>,
  raw: string
): Promise<{ id: string | null; error?: string }> {
  // Full UUID — use directly
  if (UUID_RE.test(raw)) return { id: raw };

  // Prefix lookup (min 8 hex chars)
  const prefix = raw.replace(/-/g, "").toLowerCase();
  if (prefix.length < 8 || !/^[0-9a-f]+$/.test(prefix)) {
    return { id: null, error: `Invalid task ID or prefix: ${raw}` };
  }

  // Pad prefix to full 32-hex UUID format for range query.
  // UUID = 32 hex chars (without dashes). Pad with 0s for lower bound, fs for upper bound.
  const lo = (prefix + "0".repeat(32 - prefix.length)).replace(
    /^(.{8})(.{4})(.{4})(.{4})(.{12})$/,
    "$1-$2-$3-$4-$5"
  );
  const hi = (prefix + "f".repeat(32 - prefix.length)).replace(
    /^(.{8})(.{4})(.{4})(.{4})(.{12})$/,
    "$1-$2-$3-$4-$5"
  );

  const { data, error } = await sb
    .from("business_tasks")
    .select("id")
    .gte("id", lo)
    .lte("id", hi)
    .limit(2);

  if (error) return { id: null, error: error.message };
  if (!data || data.length === 0)
    return { id: null, error: `No task found with prefix: ${raw}` };
  if (data.length > 1)
    return { id: null, error: `Ambiguous prefix "${raw}" — matches ${data.length} tasks. Provide more characters.` };

  return { id: data[0].id };
}

export async function getTask(args: { task_id: string }) {
  const sb = getSupabase();

  const resolved = await resolveTaskId(sb, args.task_id);
  if (!resolved.id) return { error: resolved.error };

  const { data, error } = await sb
    .from("business_tasks")
    .select("*")
    .eq("id", resolved.id)
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
    .eq("task_id", resolved.id)
    .order("created_at", { ascending: true })
    .limit(10);

  return {
    task: data,
    initiative,
    parent_task,
    comments: comments ?? [],
  };
}
