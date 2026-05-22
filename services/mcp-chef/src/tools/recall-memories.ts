import { getSupabase } from "../lib/supabase.js";

export async function recallMemories(args: {
  agent_id: string;
  topic?: string;
  memory_type?: string;
  tags?: string[];
  limit?: number;
}) {
  const sb = getSupabase();
  const limit = args.limit ?? 10;

  let query = sb
    .from("agent_memory")
    .select("id, agent_id, memory_type, title, content, tags, metadata, source, created_by, created_at")
    .eq("agent_id", args.agent_id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (args.memory_type) {
    query = query.eq("memory_type", args.memory_type);
  }

  if (args.tags && args.tags.length > 0) {
    query = query.overlaps("tags", args.tags);
  }

  if (args.topic) {
    // Search across both title and content using plainto_tsquery
    query = query.or(
      `title.plfts(english).${args.topic},content.plfts(english).${args.topic}`
    );
  }

  const { data, error } = await query;

  if (error) return { ok: false, error: error.message };

  return { ok: true, count: data.length, memories: data };
}
