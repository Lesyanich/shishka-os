import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Migration number allocation (MC c520decf, migration 483).
 *
 * Numbers used to be picked as "max + 1 at the moment I look" — by eyeballing
 * `ls services/supabase/migrations` or the max in origin/main. With many sessions
 * in parallel worktrees, two read the same max inside the same minute and take the
 * same number; the canary then blocks EVERY session in the repo from committing a
 * migration until someone renumbers by hand. That happened four times on
 * 2026-10-16 alone.
 *
 * origin/main is not authoritative: numbers are consumed at APPLY time, so an
 * unmerged branch can already have burned numbers above main's max. Only prod
 * knows. fn_claim_migration_number() claims one atomically under an advisory
 * lock, backed by a PRIMARY KEY that makes a double-issue physically impossible.
 */

export const MIGRATIONS_DIR = "services/supabase/migrations";

export interface ClaimMigrationNumberArgs {
  slug: string;
  session_id: string;
  git_branch?: string;
  mc_task_id?: string;
}

export interface ClaimMigrationNumberResult {
  number: number;
  filename: string;
  path: string;
  self_register_sql: string;
  reminder: string;
}

/** Repo-relative path for a claimed migration filename. */
export function migrationPath(filename: string): string {
  return `${MIGRATIONS_DIR}/${filename}`;
}

/**
 * The self-register INSERT every migration must end with (RULE-MIGRATION-TRACKING).
 * Handed back with the number so the caller does not have to remember the shape —
 * and so the checksum stays NULL, which the canary requires.
 */
export function selfRegisterSql(filename: string, sessionId: string): string {
  return (
    `INSERT INTO migration_log (filename, applied_by, checksum, notes)\n` +
    `VALUES ('${filename}', '${sessionId}', NULL, '<what this migration does>');`
  );
}

export async function claimMigrationNumber(
  args: ClaimMigrationNumberArgs,
  client?: SupabaseClient
): Promise<ClaimMigrationNumberResult> {
  const slug = (args.slug ?? "").trim();
  if (!slug) {
    throw new Error("slug is required (e.g. 'retire_potato_tacos')");
  }
  const sessionId = (args.session_id ?? "").trim();
  if (!sessionId) {
    throw new Error(
      "session_id is required — it is how an abandoned claim is traced back to a session"
    );
  }

  // Imported lazily so the pure logic above stays unit-testable with an injected
  // client, without pulling the Supabase driver into the test process.
  const sb = client ?? (await import("../lib/supabase.js")).getSupabase();
  const { data, error } = await sb.rpc("fn_claim_migration_number", {
    p_slug: slug,
    p_session_id: sessionId,
    p_git_branch: args.git_branch ?? null,
    p_mc_task_id: args.mc_task_id ?? null,
  });

  if (error) {
    throw new Error(`fn_claim_migration_number failed: ${error.message}`);
  }

  // The RPC is RETURNS TABLE, so supabase-js hands back an array of one row.
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row.number !== "number" || !row.filename) {
    throw new Error(
      `fn_claim_migration_number returned no number (got ${JSON.stringify(data)})`
    );
  }

  return {
    number: row.number,
    filename: row.filename,
    path: migrationPath(row.filename),
    self_register_sql: selfRegisterSql(row.filename, sessionId),
    reminder:
      "This number is now yours and is never reissued. Do not renumber the file " +
      "by hand: prod rejects a duplicate at apply time. If you abandon the work, " +
      "the number stays burned — that is intentional (gap numbers are never reused).",
  };
}
