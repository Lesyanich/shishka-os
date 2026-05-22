import { getSupabase } from "../lib/supabase.js";

export async function storeMemory(args: {
  agent_id: string;
  memory_type: string;
  title: string;
  content: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  source?: string;
  session_id?: string;
  created_by?: string;
}) {
  const sb = getSupabase();

  const { data, error } = await sb
    .from("agent_memory")
    .insert({
      agent_id: args.agent_id,
      memory_type: args.memory_type,
      title: args.title,
      content: args.content,
      tags: args.tags ?? [],
      metadata: args.metadata ?? {},
      source: args.source ?? "agent",
      session_id: args.session_id ?? null,
      created_by: args.created_by ?? "agent",
    })
    .select("id, title, memory_type, created_at")
    .single();

  if (error) return { ok: false, error: error.message };

  return { ok: true, memory: data };
}
