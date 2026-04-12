import { getSupabase } from "../lib/supabase.js";

interface AddCommentArgs {
  task_id: string;
  author: string;
  body: string;
}

// RULE-HANDOFF-PACKET required sections (case-insensitive header match)
const HANDOFF_REQUIRED_SECTIONS = [
  "Lane",
  "Scope — files",
  "Scope — excluded",
  "Commit/PR plan",
  "Commit message template",
  "Steps",
  "Skills to load",
  "Acceptance criteria",
  "FORBIDDEN",
  "Blocks / blocked-by",
] as const;

function validateHandoffPacket(body: string): string[] {
  const missing: string[] = [];
  for (const section of HANDOFF_REQUIRED_SECTIONS) {
    // Match as markdown heading (## or **) or standalone label with colon
    const escaped = section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(
      `(^|\\n)\\s*(#{1,4}\\s*${escaped}|\\*\\*${escaped}\\**)\\s*[:：]?`,
      "i"
    );
    if (!pattern.test(body)) {
      missing.push(section);
    }
  }
  return missing;
}

export async function addComment(args: AddCommentArgs) {
  const sb = getSupabase();

  // Validate [HANDOFF] packets per RULE-HANDOFF-PACKET
  if (args.body.trimStart().startsWith("[HANDOFF]")) {
    const missing = validateHandoffPacket(args.body);
    if (missing.length > 0) {
      return {
        error: `RULE-HANDOFF-PACKET violation — missing: ${missing.join(", ")}. Rewrite required.`,
        missing_fields: missing,
      };
    }
  }

  // Verify task exists
  const { data: task, error: taskErr } = await sb
    .from("business_tasks")
    .select("id")
    .eq("id", args.task_id)
    .single();

  if (taskErr || !task) {
    return { error: `Task not found: ${args.task_id}` };
  }

  const { data, error } = await sb
    .from("task_comments")
    .insert({
      task_id: args.task_id,
      author: args.author,
      body: args.body,
    })
    .select()
    .single();

  if (error) return { error: `DB error: ${error.message}` };

  return { success: true, comment: data };
}
