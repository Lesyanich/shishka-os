import { getSupabase } from "../lib/supabase.js";

export async function updateMemory(args: {
  id: string;
  content?: string;
  title?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}) {
  const sb = getSupabase();

  const patch: Record<string, unknown> = {};
  if (args.content !== undefined) patch.content = args.content;
  if (args.title !== undefined) patch.title = args.title;
  if (args.tags !== undefined) patch.tags = args.tags;
  if (args.metadata !== undefined) patch.metadata = args.metadata;

  if (Object.keys(patch).length === 0) {
    return { ok: false, error: "Nothing to update — provide content, title, tags, or metadata" };
  }

  const { data, error } = await sb
    .from("agent_memory")
    .update(patch)
    .eq("id", args.id)
    .select("id, title, memory_type, updated_at")
    .single();

  if (error) return { ok: false, error: error.message };

  return { ok: true, memory: data };
}
