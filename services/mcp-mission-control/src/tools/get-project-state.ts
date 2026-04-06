import { getSupabase } from "../lib/supabase.js";
import { execSync } from "child_process";

/**
 * get_project_state — returns structured JSON for a specific project.
 *
 * Replaces manual reading of CURRENT.md.
 * Queries: MC tasks filtered by domain/tags + git branches + migration_log.
 */

const PROJECT_DOMAINS: Record<string, string[]> = {
  admin: ["tech", "ops", "kitchen", "finance"],
  web: ["tech", "marketing", "sales"],
  app: ["tech", "ops"],
};

const PROJECT_BRANCH_PREFIX: Record<string, string> = {
  admin: "feature/admin/",
  web: "feature/web/",
  app: "feature/app/",
};

function gitCommand(cmd: string): string {
  try {
    return execSync(cmd, { encoding: "utf-8", timeout: 5000 }).trim();
  } catch {
    return "";
  }
}

export async function getProjectState(args: { project: string }) {
  const project = args.project.toLowerCase();

  if (!PROJECT_DOMAINS[project]) {
    return {
      error: `Unknown project: ${project}. Valid: admin, web, app`,
    };
  }

  const sb = getSupabase();

  // 1. Tasks related to this project (by tags containing project name)
  const { data: tasks, error } = await sb
    .from("business_tasks")
    .select("id, title, domain, status, priority, assigned_to, executor_type, tags, related_ids, updated_at, context_files")
    .not("status", "in", '("cancelled")')
    .order("updated_at", { ascending: false })
    .limit(50);

  if (error) {
    return { error: `DB error: ${error.message}` };
  }

  const allTasks = tasks ?? [];

  // Filter tasks relevant to this project:
  // - tags contain project name, OR
  // - related_ids has git_branch starting with project prefix, OR
  // - related_ids has spec_file containing project path
  const branchPrefix = PROJECT_BRANCH_PREFIX[project];
  const projectTasks = allTasks.filter((t) => {
    const tags = t.tags as string[] | null;
    const relatedIds = t.related_ids as Record<string, any> | null;

    if (tags?.includes(project)) return true;
    if (relatedIds?.git_branch?.startsWith(branchPrefix)) return true;
    if (relatedIds?.spec_file?.includes(`projects/${project}/`)) return true;

    // Also include if domain matches project's primary domains
    if (project === "admin" && t.domain === "tech") return true;

    return false;
  });

  // Group by status
  const byStatus: Record<string, typeof projectTasks> = {};
  for (const t of projectTasks) {
    if (!byStatus[t.status]) byStatus[t.status] = [];
    byStatus[t.status].push(t);
  }

  // 2. Git branches for this project
  const allBranches = gitCommand("git branch -a --format='%(refname:short)'");
  const projectBranches = allBranches
    .split("\n")
    .filter((b) => b.includes(branchPrefix))
    .slice(0, 10);

  // 3. Recent commits on project branches
  const recentCommits = gitCommand(
    `git log --all --oneline -10 --grep="${project}" 2>/dev/null || echo "(no project commits)"`
  );

  // 4. Migrations tagged with this project (if any)
  const { data: migrations } = await sb
    .from("migration_log")
    .select("version, name, status, applied_at")
    .order("version", { ascending: false })
    .limit(5);

  const projectMigrations = (migrations ?? []).filter(
    (m) => m.name?.toLowerCase().includes(project) ||
           m.name?.toLowerCase().includes(project === "admin" ? "kitchen" : project)
  );

  return {
    project,
    tasks: {
      in_progress: (byStatus["in_progress"] ?? []).map(taskBrief),
      blocked: (byStatus["blocked"] ?? []).map(taskBrief),
      inbox: (byStatus["inbox"] ?? []).map(taskBrief),
      backlog: (byStatus["backlog"] ?? []).map(taskBrief),
      done_recent: (byStatus["done"] ?? []).slice(0, 5).map(taskBrief),
    },
    counts: {
      in_progress: (byStatus["in_progress"] ?? []).length,
      blocked: (byStatus["blocked"] ?? []).length,
      inbox: (byStatus["inbox"] ?? []).length,
      backlog: (byStatus["backlog"] ?? []).length,
      done: (byStatus["done"] ?? []).length,
    },
    branches: projectBranches,
    recent_commits: recentCommits,
    migrations: projectMigrations,
  };
}

function taskBrief(t: any) {
  return {
    id: t.id,
    title: t.title,
    domain: t.domain,
    priority: t.priority,
    status: t.status,
    assigned_to: t.assigned_to,
    context_files: t.context_files,
  };
}
