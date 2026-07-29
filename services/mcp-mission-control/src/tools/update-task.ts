import { getSupabase } from "../lib/supabase.js";

interface UpdateTaskArgs {
  task_id: string;
  status?: string;
  priority?: string;
  title?: string;
  description?: string;
  notes?: string;
  due_date?: string;
  tags?: string[];
  context_files?: string[];
  parent_task_id?: string | null;
  initiative_id?: string | null;
  related_ids?: Record<string, string | number | boolean>;
  assigned_to?: string;
}

interface InitiativeRef {
  id: string;
  title: string;
  status: string;
}

export async function updateTask(args: UpdateTaskArgs) {
  const sb = getSupabase();

  // 1. Fetch current task (need related_ids for merge semantics, tags +
  //    initiative_id for the RULE-EPIC-ON-CREATE detach check)
  const { data: current, error: fetchErr } = await sb
    .from("business_tasks")
    .select("id, title, status, priority, related_ids, initiative_id, tags")
    .eq("id", args.task_id)
    .single();

  if (fetchErr || !current) {
    return { error: `Task not found: ${args.task_id}` };
  }

  // 2. If parent_task_id provided and non-null, verify it exists (and no self-cycle)
  if (args.parent_task_id) {
    if (args.parent_task_id === args.task_id) {
      return { error: "parent_task_id cannot equal task_id (self-cycle)" };
    }
    const { data: parent } = await sb
      .from("business_tasks")
      .select("id")
      .eq("id", args.parent_task_id)
      .single();
    if (!parent) {
      return { error: `Parent task not found: ${args.parent_task_id}` };
    }
  }

  // 3. If initiative_id provided and non-null, verify it exists
  //    (same guard as emit_business_task). Reuse the fetched row for the
  //    response so re-filing costs no extra query.
  let initiative: InitiativeRef | null = null;
  if (args.initiative_id) {
    const { data: init } = await sb
      .from("business_initiatives")
      .select("id, title, status")
      .eq("id", args.initiative_id)
      .single();
    if (!init) {
      return { error: `Initiative not found: ${args.initiative_id}` };
    }
    initiative = init as InitiativeRef;
  }

  // 4. Validate related_ids primitives (same rule as emit_business_task)
  if (args.related_ids) {
    for (const [key, val] of Object.entries(args.related_ids)) {
      if (val !== null && typeof val === "object") {
        return {
          error: `related_ids.${key} must be a primitive (string, number, boolean), got object`
        };
      }
    }
  }

  // 5. Build update object (only provided fields)
  const update: Record<string, any> = {};
  if (args.status) update.status = args.status;
  if (args.priority) update.priority = args.priority;
  if (args.title !== undefined) update.title = args.title;
  if (args.description !== undefined) update.description = args.description;
  if (args.notes !== undefined) update.notes = args.notes;
  if (args.due_date !== undefined) update.due_date = args.due_date;
  if (args.tags !== undefined) update.tags = args.tags;
  if (args.context_files !== undefined) update.context_files = args.context_files;
  if (args.parent_task_id !== undefined) update.parent_task_id = args.parent_task_id;
  if (args.initiative_id !== undefined) update.initiative_id = args.initiative_id;
  if (args.assigned_to !== undefined) update.assigned_to = args.assigned_to;

  // related_ids: merge with existing (JSONB bag semantics — add/replace keys,
  // do NOT wipe unrelated keys). Pass {} to explicitly clear.
  if (args.related_ids !== undefined) {
    const base = (current.related_ids as Record<string, unknown>) ?? {};
    update.related_ids = { ...base, ...args.related_ids };
  }

  if (Object.keys(update).length === 0) {
    return { error: "No fields to update. Provide at least one field." };
  }

  // 6. Update
  const { data, error } = await sb
    .from("business_tasks")
    .update(update)
    .eq("id", args.task_id)
    .select("id, title, status, priority, initiative_id, assigned_to, updated_at")
    .single();

  if (error) return { error: `DB error: ${error.message}` };

  // 7. Epic re-filing report. `initiative` is returned only when this call
  //    touched initiative_id — the common update (status/phase/notes) stays a
  //    single round-trip. Shape mirrors get_task's `initiative`.
  const refiled = args.initiative_id !== undefined;
  const initiativeChanged = refiled && args.initiative_id !== current.initiative_id;

  let epicNote = "";
  if (initiativeChanged) {
    epicNote = args.initiative_id
      ? ` → re-filed under initiative "${initiative?.title ?? args.initiative_id}"`
      : " → detached from initiative";
  }

  // RULE-EPIC-ON-CREATE: a task must end up either linked to an initiative or
  // tagged kind:standalone. Detaching without that tag creates the forbidden
  // third state — warn rather than silently allow it.
  const effectiveTags: string[] =
    (args.tags ?? (current.tags as string[] | null) ?? []);
  const warning =
    refiled && !args.initiative_id && !effectiveTags.includes("kind:standalone")
      ? "RULE-EPIC-ON-CREATE: task now has neither an initiative nor a 'kind:standalone' tag. " +
        "Add the tag or link an initiative."
      : undefined;

  return {
    success: true,
    task: data,
    ...(refiled ? { initiative: data.initiative_id ? initiative : null } : {}),
    ...(warning ? { warning } : {}),
    change: `${current.status} → ${data.status}`,
    message: `Updated task: "${data.title}" [${data.status}]${epicNote}`,
  };
}
