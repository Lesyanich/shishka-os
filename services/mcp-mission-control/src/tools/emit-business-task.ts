import { getSupabase } from "../lib/supabase.js";

interface EmitBusinessTaskArgs {
  title: string;
  description?: string;
  domain: string;
  status?: string;
  priority?: string;
  source?: string;
  created_by: string;
  tags?: string[];
  related_ids: Record<string, string | number | boolean>;
  initiative_id?: string;
  parent_task_id?: string;
  due_date?: string;
  notes?: string;
  executor_type?: string;
}

export async function emitBusinessTask(args: EmitBusinessTaskArgs) {
  const sb = getSupabase();

  // ── Validation ──────────────────────────────────────────

  // 1. related_ids must have at least one key
  if (!args.related_ids || Object.keys(args.related_ids).length === 0) {
    return {
      error: "related_ids must include at least one entity ID. " +
             "Standard keys: nomenclature_id, expense_id, inbox_id, agent_session"
    };
  }

  // 2. related_ids values must be primitives (no nested objects)
  for (const [key, val] of Object.entries(args.related_ids)) {
    if (val !== null && typeof val === "object") {
      return {
        error: `related_ids.${key} must be a primitive (string, number, boolean), got object`
      };
    }
  }

  // 3. If initiative_id provided, verify it exists
  if (args.initiative_id) {
    const { data: initiative } = await sb
      .from("business_initiatives")
      .select("id, title")
      .eq("id", args.initiative_id)
      .single();
    if (!initiative) {
      return { error: `Initiative not found: ${args.initiative_id}` };
    }
  }

  // 4. If parent_task_id provided, verify it exists
  if (args.parent_task_id) {
    const { data: parent } = await sb
      .from("business_tasks")
      .select("id, title")
      .eq("id", args.parent_task_id)
      .single();
    if (!parent) {
      return { error: `Parent task not found: ${args.parent_task_id}` };
    }
  }

  // 5. Agents cannot assign work (assigned_to always null)
  //    — enforced by NOT accepting assigned_to in the schema at all

  // ── Auto-route to initiative (only when caller didn't specify) ──────────
  // RULE-EPIC-ON-CREATE (docs/constitution/agent-rules.md):
  //   Every task must end up with either initiative_id set OR kind:standalone tag.
  //   This block tries to set initiative_id automatically; failing that, it
  //   adds 'needs-triage' so COO can resolve weekly.

  let workingTags = [...(args.tags ?? [])];
  let autoRoute: { matched_slug?: string; matched_id?: string; reason: string } | null = null;
  const isStandalone = workingTags.includes("kind:standalone");

  if (!args.initiative_id && !isStandalone) {
    // 5a. Explicit epic:<slug> tag → direct slug lookup
    const explicitEpicTag = workingTags.find((t) => t.startsWith("epic:"));
    if (explicitEpicTag) {
      const slug = explicitEpicTag.slice("epic:".length);
      const { data: initiative } = await sb
        .from("business_initiatives")
        .select("id, slug")
        .eq("slug", slug)
        .single();
      if (initiative) {
        args.initiative_id = initiative.id;
        autoRoute = {
          matched_slug: initiative.slug,
          matched_id: initiative.id,
          reason: "explicit_epic_tag",
        };
      } else {
        autoRoute = { reason: `unknown_epic_slug:${slug}` };
      }
    }

    // 5b. Tag-overlap match against active initiatives
    if (!args.initiative_id && workingTags.length > 0) {
      const { data: candidates } = await sb
        .from("business_initiatives")
        .select("id, slug, match_tags")
        .eq("status", "active")
        .overlaps("match_tags", workingTags);

      if (candidates && candidates.length === 1) {
        args.initiative_id = candidates[0].id;
        autoRoute = {
          matched_slug: candidates[0].slug,
          matched_id: candidates[0].id,
          reason: "tag_overlap_single",
        };
      } else if (candidates && candidates.length > 1) {
        const slugs = candidates.map((c) => c.slug).join(",");
        if (!workingTags.includes("needs-triage")) workingTags.push("needs-triage");
        if (!workingTags.includes("ambiguous-epic")) workingTags.push("ambiguous-epic");
        autoRoute = { reason: `tag_overlap_ambiguous:${slugs}` };
      } else {
        if (!workingTags.includes("needs-triage")) workingTags.push("needs-triage");
        autoRoute = { reason: "no_match" };
      }
    } else if (!args.initiative_id) {
      if (!workingTags.includes("needs-triage")) workingTags.push("needs-triage");
      autoRoute = { reason: "no_tags" };
    }
  }

  // ── Insert ──────────────────────────────────────────────

  const row = {
    title:          args.title,
    description:    args.description ?? null,
    domain:         args.domain,
    status:         args.status ?? "inbox",
    priority:       args.priority ?? "medium",
    source:         args.source ?? "agent_discovery",
    created_by:     args.created_by,
    assigned_to:    null,              // agents NEVER assign
    tags:           workingTags,
    related_ids:    args.related_ids,
    initiative_id:  args.initiative_id ?? null,
    parent_task_id: args.parent_task_id ?? null,
    due_date:       args.due_date ?? null,
    notes:          args.notes ?? null,
    executor_type:  args.executor_type ?? "human",
  };

  const { data, error } = await sb
    .from("business_tasks")
    .insert(row)
    .select("id, title, domain, status, priority, created_at")
    .single();

  if (error) {
    return { error: `DB error: ${error.message}` };
  }

  // ── Response ────────────────────────────────────────────

  const routingNote = autoRoute
    ? autoRoute.matched_slug
      ? ` → auto-attached to epic:${autoRoute.matched_slug}`
      : ` → ${autoRoute.reason} (tag 'needs-triage' added)`
    : "";

  return {
    success: true,
    task: {
      id:         data.id,
      title:      data.title,
      domain:     data.domain,
      status:     data.status,
      priority:   data.priority,
      created_at: data.created_at,
    },
    auto_route: autoRoute,
    message: `Task created in Mission Control: [${data.domain}] ${data.priority} — "${data.title}"${routingNote}`,
  };
}
