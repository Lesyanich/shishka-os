import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock supabase before importing the module
const mockSelect = vi.fn();
const mockOrder = vi.fn();
const mockLimit = vi.fn();
const mockNot = vi.fn();
const mockFrom = vi.fn();

vi.mock("../lib/supabase.js", () => ({
  getSupabase: () => ({
    from: mockFrom,
  }),
}));

// Mock child_process
vi.mock("child_process", () => ({
  execSync: vi.fn((cmd: string) => {
    if (cmd.includes("branch --show-current")) return "feature/shared/computed-state";
    if (cmd.includes("log --oneline")) return "abc1234 feat: test commit\ndef5678 fix: another commit";
    if (cmd.includes("describe --tags")) return "v1.0.0";
    return "";
  }),
}));

// Mock fs (don't actually write)
vi.mock("fs", () => ({
  writeFileSync: vi.fn(),
}));

import { generateStatus } from "../tools/generate-status.js";

describe("generateStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default chain: from().select().not().order().limit() → tasks
    // and from().select().order().limit() → migration_log
    const taskResult = {
      data: [
        { id: "t1", title: "Build feature X", domain: "tech", status: "in_progress", priority: "critical", assigned_to: "coo", executor_type: "code", due_date: null, tags: ["test"], related_ids: {}, updated_at: "2026-04-06T10:00:00Z" },
        { id: "t2", title: "Fix bug Y", domain: "finance", status: "blocked", priority: "high", assigned_to: null, executor_type: "code", due_date: null, tags: [], related_ids: {}, updated_at: "2026-04-06T09:00:00Z" },
        { id: "t3", title: "Review Z", domain: "kitchen", status: "inbox", priority: "medium", assigned_to: null, executor_type: "human", due_date: null, tags: [], related_ids: {}, updated_at: "2026-04-06T08:00:00Z" },
      ],
      error: null,
    };

    const migrationResult = {
      data: [{ version: 96, name: "kitchen_ux_v2_foundation", status: "applied", applied_at: "2026-04-05T12:00:00Z" }],
      error: null,
    };

    // Chain for business_tasks
    mockLimit.mockReturnValue(taskResult);
    mockOrder.mockReturnValue({ limit: mockLimit });
    mockNot.mockReturnValue({ order: mockOrder });
    mockSelect.mockReturnValue({ not: mockNot });

    // Chain for migration_log
    const migLimit = vi.fn().mockReturnValue(migrationResult);
    const migOrder = vi.fn().mockReturnValue({ limit: migLimit });
    const migSelect = vi.fn().mockReturnValue({ order: migOrder });

    mockFrom.mockImplementation((table: string) => {
      if (table === "business_tasks") return { select: mockSelect };
      if (table === "migration_log") return { select: migSelect };
      return { select: mockSelect };
    });
  });

  it("returns structured summary without repo_root", async () => {
    const result = await generateStatus({});

    expect(result).toHaveProperty("success", true);
    expect(result).toHaveProperty("markdown");
    expect(result).toHaveProperty("summary");
    expect(result.summary).toEqual({
      in_progress: 1,
      blocked: 1,
      inbox: 1,
      backlog: 0,
      done: 0,
      total: 3,
    });
  });

  it("markdown contains HC-1 warning", async () => {
    const result = await generateStatus({});
    expect(result.markdown).toContain("DO NOT EDIT MANUALLY (HC-1)");
  });

  it("markdown contains active work section", async () => {
    const result = await generateStatus({});
    expect(result.markdown).toContain("Build feature X");
    expect(result.markdown).toContain("in_progress");
  });

  it("markdown contains blocked section", async () => {
    const result = await generateStatus({});
    expect(result.markdown).toContain("Blocked");
    expect(result.markdown).toContain("Fix bug Y");
  });

  it("markdown contains git info", async () => {
    const result = await generateStatus({});
    expect(result.markdown).toContain("feature/shared/computed-state");
    expect(result.markdown).toContain("abc1234");
  });

  it("writes to file when repo_root provided", async () => {
    const { writeFileSync } = await import("fs");
    const result = await generateStatus({ repo_root: "/tmp/test-repo" });

    expect(result).toHaveProperty("success", true);
    expect(result).toHaveProperty("wrote_to", "/tmp/test-repo/STATUS.md");
    expect(writeFileSync).toHaveBeenCalledOnce();
  });

  it("returns error on DB failure", async () => {
    mockSelect.mockReturnValue({
      not: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({ data: null, error: { message: "connection refused" } }),
        }),
      }),
    });

    const result = await generateStatus({});
    expect(result).toHaveProperty("error");
    expect(result.error).toContain("connection refused");
  });
});
