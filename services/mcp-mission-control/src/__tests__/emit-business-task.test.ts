import { describe, it, expect, vi, beforeEach } from "vitest";

// Chainable supabase mock — each method returns `chain`, terminal methods (single, overlaps)
// pull the next queued result off `results`. Tests configure `results` per scenario.
const results: any[] = [];
const insertedRows: any[] = [];

const chain: any = {
  select: vi.fn(() => chain),
  eq: vi.fn(() => chain),
  insert: vi.fn((row: any) => {
    insertedRows.push(row);
    return chain;
  }),
  overlaps: vi.fn(() => Promise.resolve(results.shift() ?? { data: [], error: null })),
  single: vi.fn(() => Promise.resolve(results.shift() ?? { data: null, error: null })),
};

vi.mock("../lib/supabase.js", () => ({
  getSupabase: () => ({
    from: vi.fn(() => chain),
  }),
}));

import { emitBusinessTask } from "../tools/emit-business-task.js";

const baseArgs = {
  title: "Test task for auto-route",
  domain: "tech",
  created_by: "coo",
  related_ids: { test_run: "true" },
};

beforeEach(() => {
  results.length = 0;
  insertedRows.length = 0;
  vi.clearAllMocks();
});

describe("emitBusinessTask auto-route", () => {
  it("matches single initiative by tag overlap → sets initiative_id + matched_slug", async () => {
    // Queue: 5b overlaps query → 1 candidate, then insert → row back
    results.push({ data: [{ id: "init-brain-uuid", slug: "brain", match_tags: ["brain", "vault"] }], error: null });
    results.push({ data: { id: "task-uuid", title: baseArgs.title, domain: "tech", status: "inbox", priority: "medium", created_at: "2026-04-28T00:00:00Z" }, error: null });

    const out = await emitBusinessTask({ ...baseArgs, tags: ["brain", "knowledge-graph"] });

    expect(out.success).toBe(true);
    expect(out.auto_route).toMatchObject({ matched_slug: "brain", reason: "tag_overlap_single" });
    expect(insertedRows[0].initiative_id).toBe("init-brain-uuid");
    expect(insertedRows[0].tags).not.toContain("needs-triage");
  });

  it("zero matches → adds 'needs-triage' tag, leaves initiative_id null", async () => {
    results.push({ data: [], error: null }); // overlaps → no candidates
    results.push({ data: { id: "task-uuid", title: baseArgs.title, domain: "tech", status: "inbox", priority: "medium", created_at: "2026-04-28T00:00:00Z" }, error: null });

    const out = await emitBusinessTask({ ...baseArgs, tags: ["random-tag", "another"] });

    expect(out.success).toBe(true);
    expect(out.auto_route).toMatchObject({ reason: "no_match" });
    expect(insertedRows[0].initiative_id).toBeNull();
    expect(insertedRows[0].tags).toContain("needs-triage");
  });

  it("explicit kind:standalone → skips auto-route entirely", async () => {
    // Only insert result needed, no overlaps query expected
    results.push({ data: { id: "task-uuid", title: baseArgs.title, domain: "tech", status: "inbox", priority: "medium", created_at: "2026-04-28T00:00:00Z" }, error: null });

    const out = await emitBusinessTask({ ...baseArgs, tags: ["kind:standalone", "brain"] });

    expect(out.success).toBe(true);
    expect(out.auto_route).toBeNull();
    expect(insertedRows[0].initiative_id).toBeNull();
    expect(insertedRows[0].tags).not.toContain("needs-triage");
  });

  it("ambiguous match (≥2 candidates) → adds 'needs-triage' + 'ambiguous-epic'", async () => {
    results.push({
      data: [
        { id: "init-brain-uuid", slug: "brain", match_tags: ["brain"] },
        { id: "init-erp-uuid",   slug: "erp",   match_tags: ["erp"] },
      ],
      error: null,
    });
    results.push({ data: { id: "task-uuid", title: baseArgs.title, domain: "tech", status: "inbox", priority: "medium", created_at: "2026-04-28T00:00:00Z" }, error: null });

    const out = await emitBusinessTask({ ...baseArgs, tags: ["brain", "erp"] });

    expect(out.success).toBe(true);
    expect(out.auto_route?.reason).toMatch(/^tag_overlap_ambiguous:/);
    expect(insertedRows[0].initiative_id).toBeNull();
    expect(insertedRows[0].tags).toEqual(expect.arrayContaining(["needs-triage", "ambiguous-epic"]));
  });
});
