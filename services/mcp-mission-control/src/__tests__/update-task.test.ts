import { describe, it, expect, vi, beforeEach } from "vitest";

// Chainable supabase mock — mirrors emit-business-task.test.ts. Every builder
// method returns `chain`; the terminal `single()` pulls the next queued result
// off `results`. `updates` captures each payload handed to `.update(...)`.
const results: any[] = [];
const updates: any[] = [];
const fromTables: string[] = [];

const chain: any = {
  select: vi.fn(() => chain),
  eq: vi.fn(() => chain),
  update: vi.fn((row: any) => {
    updates.push(row);
    return chain;
  }),
  single: vi.fn(() => Promise.resolve(results.shift() ?? { data: null, error: null })),
};

vi.mock("../lib/supabase.js", () => ({
  getSupabase: () => ({
    from: vi.fn((table: string) => {
      fromTables.push(table);
      return chain;
    }),
  }),
}));

import { updateTask } from "../tools/update-task.js";

const TASK_ID = "fa83d290-0000-4000-8000-000000000001";
const OLD_INIT = "8ee586b9-0000-4000-8000-000000000002";
const NEW_INIT = "2a8b06a4-0000-4000-8000-000000000003";

/** Result row for the initial "fetch current task" query. */
function currentTask(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      id: TASK_ID,
      title: "Re-file me",
      status: "in_progress",
      priority: "medium",
      related_ids: { phase: "implementation" },
      initiative_id: OLD_INIT,
      tags: ["kind:cleanup"],
      ...overrides,
    },
    error: null,
  };
}

/** Result row for the terminal UPDATE ... RETURNING query. */
function updatedTask(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      id: TASK_ID,
      title: "Re-file me",
      status: "in_progress",
      priority: "medium",
      initiative_id: OLD_INIT,
      updated_at: "2026-07-29T12:00:00Z",
      ...overrides,
    },
    error: null,
  };
}

beforeEach(() => {
  results.length = 0;
  updates.length = 0;
  fromTables.length = 0;
  vi.clearAllMocks();
});

describe("updateTask initiative_id", () => {
  it("re-files a task under another initiative and returns that initiative", async () => {
    results.push(currentTask());
    results.push({
      data: { id: NEW_INIT, title: "Code Cleanup & Security Hardening", status: "active" },
      error: null,
    });
    results.push(updatedTask({ initiative_id: NEW_INIT }));

    const out: any = await updateTask({ task_id: TASK_ID, initiative_id: NEW_INIT });

    expect(out.error).toBeUndefined();
    expect(out.success).toBe(true);
    expect(updates[0].initiative_id).toBe(NEW_INIT);
    expect(fromTables).toContain("business_initiatives");
    expect(out.initiative).toMatchObject({
      id: NEW_INIT,
      title: "Code Cleanup & Security Hardening",
      status: "active",
    });
    expect(out.message).toContain("Code Cleanup & Security Hardening");
  });

  it("rejects an unknown initiative_id and writes nothing", async () => {
    results.push(currentTask());
    results.push({ data: null, error: { message: "no rows" } });

    const out: any = await updateTask({ task_id: TASK_ID, initiative_id: NEW_INIT });

    expect(out.error).toContain(NEW_INIT);
    expect(out.error).toMatch(/[Ii]nitiative not found/);
    expect(updates).toHaveLength(0);
  });

  it("detaches when initiative_id is null and reports initiative: null", async () => {
    results.push(currentTask({ tags: ["kind:standalone"] }));
    results.push(updatedTask({ initiative_id: null }));

    const out: any = await updateTask({ task_id: TASK_ID, initiative_id: null });

    expect(out.success).toBe(true);
    expect(updates[0]).toHaveProperty("initiative_id", null);
    expect(out.initiative).toBeNull();
    // kind:standalone is the sanctioned second state — no warning expected.
    expect(out.warning).toBeUndefined();
  });

  it("warns when detaching leaves neither an initiative nor kind:standalone", async () => {
    results.push(currentTask());
    results.push(updatedTask({ initiative_id: null }));

    const out: any = await updateTask({ task_id: TASK_ID, initiative_id: null });

    expect(out.success).toBe(true);
    expect(out.warning).toMatch(/RULE-EPIC-ON-CREATE/);
  });

  it("honours a kind:standalone tag set in the same call as the detach", async () => {
    results.push(currentTask());
    results.push(updatedTask({ initiative_id: null }));

    const out: any = await updateTask({
      task_id: TASK_ID,
      initiative_id: null,
      tags: ["kind:standalone"],
    });

    expect(out.success).toBe(true);
    expect(out.warning).toBeUndefined();
  });

  it("leaves initiative_id untouched when the field is omitted", async () => {
    results.push(currentTask());
    results.push(updatedTask({ status: "done" }));

    const out: any = await updateTask({ task_id: TASK_ID, status: "done" });

    expect(out.success).toBe(true);
    expect(updates[0]).not.toHaveProperty("initiative_id");
    // No re-file happened → no extra lookup, no initiative key in the response.
    expect(fromTables).not.toContain("business_initiatives");
    expect(out).not.toHaveProperty("initiative");
  });

  it("accepts initiative_id as the only field (does not trip the no-op guard)", async () => {
    results.push(currentTask());
    results.push({ data: { id: NEW_INIT, title: "Epic", status: "active" }, error: null });
    results.push(updatedTask({ initiative_id: NEW_INIT }));

    const out: any = await updateTask({ task_id: TASK_ID, initiative_id: NEW_INIT });

    expect(out.error).toBeUndefined();
    expect(out.success).toBe(true);
  });
});
