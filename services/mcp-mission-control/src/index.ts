#!/usr/bin/env node

/**
 * Shishka Mission Control — MCP Server
 *
 * Shared task management for all Shishka OS agents.
 * Provides tools for creating, listing, reading, and updating
 * business tasks in Supabase business_tasks table.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// Tool handlers
import { emitBusinessTask } from "./tools/emit-business-task.js";
import { listTasks } from "./tools/list-tasks.js";
import { getTask } from "./tools/get-task.js";
import { updateTask } from "./tools/update-task.js";
import { createSprint } from "./tools/create-sprint.js";
import { listSprints } from "./tools/list-sprints.js";
import { updateSprint } from "./tools/update-sprint.js";
import { assignToSprint } from "./tools/assign-to-sprint.js";
import { addComment } from "./tools/add-comment.js";
import { listComments } from "./tools/list-comments.js";
import { checkMigrations } from "./tools/check-migrations.js";
import { generateStatus } from "./tools/generate-status.js";
import { getProjectState } from "./tools/get-project-state.js";

// ─── Server Setup ────────────────────────────────────────────────

const server = new McpServer({
  name: "shishka-mission-control",
  version: "1.0.0",
});

// ─── Helper ──────────────────────────────────────────────────────

function jsonResult(data: any) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

// ─── Tools ───────────────────────────────────────────────────────

server.tool(
  "emit_business_task",
  "Create a business task in Mission Control (Supabase business_tasks). " +
  "Use for completed business outcomes, discoveries, or blockers — NOT for technical sub-steps.",
  {
    title: z.string().min(5).max(200).describe(
      "Task title. Concise, business-readable. Example: 'New dish created: SALE-PUMPKIN-SOUP (margin 68%)'"
    ),
    description: z.string().max(1000).optional().describe(
      "Optional details. Price, quantities, what was found, why it's blocked."
    ),
    domain: z.enum([
      "kitchen", "procurement", "finance", "marketing",
      "ops", "sales", "strategy", "tech"
    ]).describe("Business domain. See DISPATCH_RULES.md for scope of each domain."),
    status: z.enum(["inbox", "done"]).default("inbox").describe(
      "'inbox' = needs Lesia's triage (default). 'done' = work already completed, just logging."
    ),
    priority: z.enum(["critical", "high", "medium", "low"]).default("medium").describe(
      "Follow DISPATCH_RULES.md priority algorithm. Default: medium."
    ),
    source: z.enum([
      "agent_discovery", "owner", "chef_idea",
      "customer_review", "seasonal", "market_intel"
    ]).default("agent_discovery").describe(
      "How the task was discovered. Agents use 'agent_discovery'."
    ),
    created_by: z.string().describe(
      "Who created: 'chef-agent', 'finance-agent', 'dispatcher', 'lesia', 'coo'"
    ),
    tags: z.array(z.string()).optional().describe(
      "Freeform tags for filtering. Example: ['product', 'sale', 'audit']"
    ),
    related_ids: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).describe(
      "MUST include at least one entity ID. Keys: snake_case. " +
      "Standard keys: nomenclature_id, expense_id, inbox_id, agent_session, batch_count, batch_total_thb, git_branch, pr_number, spec_file"
    ),
    initiative_id: z.string().uuid().optional().describe(
      "Link to a business_initiative if this task is part of a cross-domain project."
    ),
    parent_task_id: z.string().uuid().optional().describe(
      "Link to parent task for subtasks (e.g. cascade domain tasks from Dispatcher)."
    ),
    due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe(
      "Due date in YYYY-MM-DD format."
    ),
    notes: z.string().max(500).optional().describe(
      "Free-text notes for human triagers. Agents rarely need this — use description instead."
    ),
    executor_type: z.enum(["human", "code", "agent"]).default("human").describe(
      "Who executes: 'human' (person), 'code' (Claude Code), 'agent' (autonomous agent)."
    ),
  },
  async (args) => jsonResult(await emitBusinessTask({
    ...args,
    related_ids: args.related_ids as Record<string, string | number | boolean>,
  }))
);

server.tool(
  "list_tasks",
  "List business tasks from Mission Control with filters. Use to find tasks by domain, status, priority.",
  {
    domain: z.enum([
      "kitchen", "procurement", "finance", "marketing",
      "ops", "sales", "strategy", "tech"
    ]).optional().describe("Filter by domain"),
    status: z.enum([
      "inbox", "backlog", "in_progress", "blocked", "done", "cancelled"
    ]).optional().describe("Filter by status (default: shows all non-done)"),
    priority: z.enum(["critical", "high", "medium", "low"]).optional()
      .describe("Filter by priority"),
    created_by: z.string().optional().describe("Filter by creator (e.g. 'chef-agent')"),
    executor_type: z.enum(["human", "code", "agent"]).optional()
      .describe("Filter by executor type"),
    assigned_to: z.string().optional().describe("Filter by assignee (e.g. 'lesia', 'bas')"),
    sprint_id: z.string().uuid().optional().describe("Filter by sprint UUID"),
    limit: z.coerce.number().int().min(1).max(50).default(20).describe("Max results"),
    include_done: z.boolean().default(false)
      .describe("Include done/cancelled tasks (excluded by default)"),
  },
  async (args) => jsonResult(await listTasks(args))
);

server.tool(
  "get_task",
  "Get full details of a specific business task by ID.",
  {
    task_id: z.string().uuid().describe("UUID of the task"),
  },
  async (args) => jsonResult(await getTask(args))
);

server.tool(
  "update_task",
  "Update a business task's status, priority, or other fields. Use to move tasks through the workflow.",
  {
    task_id: z.string().uuid().describe("UUID of the task to update"),
    status: z.enum([
      "inbox", "backlog", "in_progress", "blocked", "done", "cancelled"
    ]).optional().describe("New status"),
    priority: z.enum(["critical", "high", "medium", "low"]).optional()
      .describe("New priority"),
    title: z.string().min(5).max(200).optional()
      .describe("Rename the task. Use sparingly — titles should be stable."),
    description: z.string().max(1000).optional()
      .describe("Update description (e.g. add result summary)"),
    notes: z.string().max(500).optional()
      .describe("Add notes (e.g. why blocked, what was done)"),
    due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
      .describe("Set or update due date (YYYY-MM-DD)"),
    tags: z.array(z.string()).optional()
      .describe("Replace tags array"),
    context_files: z.array(z.string()).optional()
      .describe("Scoped context: array of file paths relative to repo root for agent context loading"),
    parent_task_id: z.string().uuid().nullable().optional()
      .describe("Link to parent task (for backlinking children to initiatives). Pass null to detach."),
    related_ids: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional()
      .describe("MERGE into existing related_ids. Keys passed here add/replace; unrelated keys are preserved. Use {} to no-op."),
  },
  async (args) => jsonResult(await updateTask({
    ...args,
    related_ids: args.related_ids as Record<string, string | number | boolean> | undefined,
  }))
);

// ─── Sprint Tools ───────────────────────────────────────────────

server.tool(
  "create_sprint",
  "Create a new sprint in Mission Control.",
  {
    name: z.string().min(3).max(100).describe("Sprint name, e.g. 'Sprint 2026-W15'"),
    goal: z.string().max(500).optional().describe("Sprint goal"),
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Start date (YYYY-MM-DD)"),
    end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("End date (YYYY-MM-DD)"),
  },
  async (args) => jsonResult(await createSprint(args))
);

server.tool(
  "list_sprints",
  "List sprints with optional status filter and task counts.",
  {
    status: z.enum(["planning", "active", "review", "closed"]).optional()
      .describe("Filter by sprint status"),
    limit: z.coerce.number().int().min(1).max(50).default(10).describe("Max results"),
  },
  async (args) => jsonResult(await listSprints(args))
);

server.tool(
  "update_sprint",
  "Update a sprint's status, name, goal, or end date.",
  {
    sprint_id: z.string().uuid().describe("UUID of the sprint"),
    status: z.enum(["planning", "active", "review", "closed"]).optional()
      .describe("New status. Only one sprint can be 'active' at a time."),
    name: z.string().min(3).max(100).optional().describe("New name"),
    goal: z.string().max(500).optional().describe("New goal"),
    end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
      .describe("New end date (YYYY-MM-DD)"),
  },
  async (args) => jsonResult(await updateSprint(args))
);

server.tool(
  "assign_to_sprint",
  "Assign a task to a sprint, or unassign by passing empty sprint_id.",
  {
    task_id: z.string().uuid().describe("UUID of the task"),
    sprint_id: z.string().describe("Sprint UUID. Pass empty string or 'null' to unassign."),
  },
  async (args) => jsonResult(await assignToSprint(args))
);

// ─── Comment Tools ──────────────────────────────────────────────

server.tool(
  "add_comment",
  "Add a comment to a business task. Use for status updates, decisions, blockers.",
  {
    task_id: z.string().uuid().describe("UUID of the task"),
    author: z.string().describe("Who is commenting: 'coo', 'finance-agent', 'chef-agent', 'lesia'"),
    body: z.string().min(1).max(8000).describe("Comment text (max 8000 chars)"),
  },
  async (args) => jsonResult(await addComment(args))
);

server.tool(
  "list_comments",
  "List comments for a business task, ordered chronologically.",
  {
    task_id: z.string().uuid().describe("UUID of the task"),
    limit: z.coerce.number().int().min(1).max(100).default(20).describe("Max results"),
  },
  async (args) => jsonResult(await listComments(args))
);

// ─── Infrastructure Tools ──────────────────────────────────────────

server.tool(
  "check_migrations",
  "Compare migration files on disk vs migration_log in DB. Returns: applied, pending, failed, checksum mismatches.",
  {},
  async () => jsonResult(await checkMigrations())
);

// ─── Computed State Tools (Phase B) ──────────────────────────────

server.tool(
  "generate_status",
  "Generate STATUS.md from MC tasks + git state (HC-1). Called by post-commit hook. " +
  "Returns markdown or writes to STATUS.md if repo_root is provided.",
  {
    repo_root: z.string().optional().describe(
      "Absolute path to repo root. If provided, writes STATUS.md there. If omitted, returns markdown as text."
    ),
  },
  async (args) => jsonResult(await generateStatus(args))
);

server.tool(
  "get_project_state",
  "Get structured state for a specific project (admin/web/app). " +
  "Replaces manual reading of CURRENT.md. Returns tasks, branches, migrations as JSON.",
  {
    project: z.enum(["admin", "web", "app"]).describe("Project name"),
  },
  async (args) => jsonResult(await getProjectState(args))
);

// ─── Start ───────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`Shishka Mission Control MCP server running on stdio`);
  console.error(`   Tools: 13 (emit_business_task, list_tasks, get_task, update_task, create_sprint, list_sprints, update_sprint, assign_to_sprint, add_comment, list_comments, check_migrations, generate_status, get_project_state)`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
