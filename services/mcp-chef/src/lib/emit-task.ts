/**
 * Lightweight task emitter for inline use by Chef tools.
 * Full Mission Control MCP is at services/mcp-mission-control/.
 * This is a fire-and-forget helper so Chef tools can log outcomes
 * without depending on the MC MCP server being connected.
 */

import { getSupabase } from "./supabase.js";

interface EmitTaskArgs {
  title: string;
  description?: string;
  domain: string;
  status?: string;
  priority?: string;
  source?: string;
  created_by: string;
  tags?: string[];
  related_ids: Record<string, string | number | boolean>;
}

export async function emitBusinessTask(args: EmitTaskArgs): Promise<void> {
  try {
    const sb = getSupabase();
    await sb.from("business_tasks").insert({
      title: args.title,
      description: args.description ?? null,
      domain: args.domain,
      status: args.status ?? "inbox",
      priority: args.priority ?? "medium",
      source: args.source ?? "agent_discovery",
      created_by: args.created_by,
      assigned_to: null,
      tags: args.tags ?? [],
      related_ids: args.related_ids,
    });
  } catch {
    // Fire-and-forget: don't crash the tool if task emission fails
    console.error("[emit-task] Failed to emit business task:", args.title);
  }
}
