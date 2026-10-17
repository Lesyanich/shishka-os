import { describe, it, expect, vi } from "vitest";
import {
  claimMigrationNumber,
  migrationPath,
  selfRegisterSql,
  MIGRATIONS_DIR,
} from "../tools/claim-migration-number.js";

/** Minimal stand-in for the one SupabaseClient method this tool uses. */
function fakeClient(impl: (fn: string, params: unknown) => unknown) {
  return { rpc: vi.fn(async (fn: string, params: unknown) => impl(fn, params)) } as never;
}

describe("migrationPath", () => {
  it("puts the file in the migrations directory", () => {
    expect(migrationPath("484_my_change.sql")).toBe(`${MIGRATIONS_DIR}/484_my_change.sql`);
  });
});

describe("selfRegisterSql", () => {
  it("emits a NULL checksum, which the canary requires", () => {
    const sql = selfRegisterSql("484_my_change.sql", "session-A");
    expect(sql).toContain("INSERT INTO migration_log");
    expect(sql).toContain("'484_my_change.sql'");
    expect(sql).toContain("'session-A'");
    expect(sql).toContain("NULL");
    // md5('filename') is explicitly rejected by migration-canary.sh
    expect(sql).not.toContain("md5(");
  });
});

describe("claimMigrationNumber", () => {
  it("returns the number, filename and repo path from the RPC", async () => {
    const client = fakeClient(() => ({
      data: [{ number: 484, filename: "484_my_change.sql" }],
      error: null,
    }));
    const res = await claimMigrationNumber(
      { slug: "my_change", session_id: "session-A" },
      client
    );
    expect(res.number).toBe(484);
    expect(res.filename).toBe("484_my_change.sql");
    expect(res.path).toBe(`${MIGRATIONS_DIR}/484_my_change.sql`);
    expect(res.reminder).toMatch(/never reissued/);
  });

  it("passes branch and task through, nulling them when absent", async () => {
    let seen: Record<string, unknown> = {};
    const client = fakeClient((_fn, params) => {
      seen = params as Record<string, unknown>;
      return { data: [{ number: 1, filename: "001_x.sql" }], error: null };
    });
    await claimMigrationNumber({ slug: "x", session_id: "s" }, client);
    expect(seen.p_git_branch).toBeNull();
    expect(seen.p_mc_task_id).toBeNull();

    await claimMigrationNumber(
      { slug: "x", session_id: "s", git_branch: "feature/y", mc_task_id: "mc-1" },
      client
    );
    expect(seen.p_git_branch).toBe("feature/y");
    expect(seen.p_mc_task_id).toBe("mc-1");
  });

  it("calls the allocator RPC, never a bare max() query", async () => {
    const client = fakeClient(() => ({
      data: [{ number: 484, filename: "484_x.sql" }],
      error: null,
    }));
    await claimMigrationNumber({ slug: "x", session_id: "s" }, client);
    expect((client as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc)
      .toHaveBeenCalledWith("fn_claim_migration_number", expect.anything());
  });

  it("requires a slug", async () => {
    const client = fakeClient(() => ({ data: null, error: null }));
    await expect(
      claimMigrationNumber({ slug: "  ", session_id: "s" }, client)
    ).rejects.toThrow(/slug is required/);
  });

  it("requires a session_id, so an abandoned claim stays traceable", async () => {
    const client = fakeClient(() => ({ data: null, error: null }));
    await expect(
      claimMigrationNumber({ slug: "x", session_id: "" }, client)
    ).rejects.toThrow(/session_id is required/);
  });

  it("surfaces an RPC error rather than inventing a number", async () => {
    const client = fakeClient(() => ({ data: null, error: { message: "boom" } }));
    await expect(
      claimMigrationNumber({ slug: "x", session_id: "s" }, client)
    ).rejects.toThrow(/fn_claim_migration_number failed: boom/);
  });

  it("fails loudly on an empty result instead of returning undefined", async () => {
    const client = fakeClient(() => ({ data: [], error: null }));
    await expect(
      claimMigrationNumber({ slug: "x", session_id: "s" }, client)
    ).rejects.toThrow(/returned no number/);
  });
});
