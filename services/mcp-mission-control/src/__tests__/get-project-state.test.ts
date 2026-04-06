import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFrom = vi.fn();

vi.mock("../lib/supabase.js", () => ({
  getSupabase: () => ({
    from: mockFrom,
  }),
}));

vi.mock("child_process", () => ({
  execSync: vi.fn((cmd: string) => {
    if (cmd.includes("branch -a")) return "feature/admin/kitchen-ux\nfeature/admin/guard-rails\nfeature/web/landing\nmain";
    if (cmd.includes("git log")) return "abc1234 feat(admin): kitchen UX";
    return "";
  }),
}));

import { getProjectState } from "../tools/get-project-state.js";

describe("getProjectState", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    const taskResult = {
      data: [
        { id: "t1", title: "Kitchen UX", domain: "tech", status: "in_progress", priority: "critical", assigned_to: "coo", executor_type: "code", tags: ["admin"], related_ids: {}, updated_at: "2026-04-06T10:00:00Z", context_files: null },
        { id: "t2", title: "Web landing", domain: "marketing", status: "backlog", priority: "medium", assigned_to: null, executor_type: "code", tags: ["web"], related_ids: {}, updated_at: "2026-04-06T09:00:00Z", context_files: null },
        { id: "t3", title: "Receipt inbox", domain: "tech", status: "inbox", priority: "high", assigned_to: null, executor_type: "code", tags: [], related_ids: { git_branch: "feature/admin/receipt-inbox" }, updated_at: "2026-04-06T08:00:00Z", context_files: ["docs/plans/spec-inbox.md"] },
      ],
      error: null,
    };

    const migResult = {
      data: [
        { version: 96, name: "kitchen_ux_v2_foundation", status: "applied", applied_at: "2026-04-05" },
      ],
      error: null,
    };

    mockFrom.mockImplementation((table: string) => {
      if (table === "business_tasks") {
        return {
          select: vi.fn().mockReturnValue({
            not: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue(taskResult),
              }),
            }),
          }),
        };
      }
      if (table === "migration_log") {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue(migResult),
            }),
          }),
        };
      }
      return { select: vi.fn() };
    });
  });

  it("returns admin project state with filtered tasks", async () => {
    const result = await getProjectState({ project: "admin" });

    expect(result).toHaveProperty("project", "admin");
    expect(result.counts.in_progress).toBe(1); // t1 (tag:admin)
    expect(result.counts.inbox).toBe(1); // t3 (branch prefix + domain:tech)
  });

  it("returns branches filtered by project", async () => {
    const result = await getProjectState({ project: "admin" });
    expect(result.branches).toContain("feature/admin/kitchen-ux");
    expect(result.branches).toContain("feature/admin/guard-rails");
    expect(result.branches).not.toContain("feature/web/landing");
  });

  it("returns error for unknown project", async () => {
    const result = await getProjectState({ project: "unknown" });
    expect(result).toHaveProperty("error");
    expect(result.error).toContain("Unknown project");
  });

  it("includes kitchen migrations for admin project", async () => {
    const result = await getProjectState({ project: "admin" });
    expect(result.migrations).toHaveLength(1);
    expect(result.migrations[0].name).toContain("kitchen");
  });

  it("returns web project with marketing tasks", async () => {
    const result = await getProjectState({ project: "web" });
    expect(result.counts.backlog).toBe(1); // t2 (tag:web)
  });
});
