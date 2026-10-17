import { createHash } from "crypto";
import { readdir, readFile } from "fs/promises";
import { join, resolve } from "path";
import { getSupabase } from "../lib/supabase.js";

interface MigrationStatus {
  applied: number;
  pending: string[];
  failed: string[];
  drift: string[];
  total_files: number;
  /**
   * Next number safe to use for a NEW migration. Advisory only — do not write a
   * file at this number from this field. Claim it with claim_migration_number,
   * which reserves it atomically; this value can go stale between two sessions
   * reading it, which is the bug the allocator exists to fix (MC c520decf).
   */
  next_free_number: number | null;
  /**
   * Duplicate numeric prefixes among the files ON DISK. This is what
   * migration-canary.sh --check-numbering fails on, so a non-empty list here
   * means every session in the repo is blocked from committing a migration.
   */
  tree_duplicates: { prefix: string; filenames: string[] }[];
  /**
   * Duplicate numbers in migration_log that formed AFTER the apply-time guard
   * went live (migration 483). The guard makes these impossible, so anything
   * here means the trigger was disabled. Pre-guard history is excluded — there
   * were 50 such frozen rows on 2026-10-16, and they block nothing because the
   * canary reads the tree, not the log.
   */
  log_collisions: { prefix: string; filenames: string[] }[];
}

export async function checkMigrations(): Promise<MigrationStatus> {
  // Resolve migrations dir: env override or relative to repo root
  const migrationsDir = process.env.MIGRATIONS_DIR
    ?? resolve(process.cwd(), "services/supabase/migrations");

  // 1. List .sql files on disk
  const allFiles = await readdir(migrationsDir);
  const sqlFiles = allFiles.filter((f) => f.endsWith(".sql")).sort();

  // 2. Compute checksums for each file
  const fileChecksums = new Map<string, string>();
  for (const file of sqlFiles) {
    const content = await readFile(join(migrationsDir, file), "utf-8");
    const md5 = createHash("md5").update(content).digest("hex");
    fileChecksums.set(file, md5);
  }

  // 3. Query migration_log from Supabase
  const sb = getSupabase();
  const { data: logs, error } = await sb
    .from("migration_log")
    .select("filename, status, checksum");

  if (error) {
    throw new Error(`DB error querying migration_log: ${error.message}`);
  }

  // Duplicate prefixes on disk — the canary's own check, mirrored here so a
  // session sees the repo-wide blocker without having to run the hook.
  // 466 and 466a are distinct, matching migration-canary.sh.
  const byPrefix = new Map<string, string[]>();
  for (const file of sqlFiles) {
    const m = /^([0-9]+[a-z]?)_/.exec(file);
    if (!m) continue;
    const list = byPrefix.get(m[1]) ?? [];
    list.push(file);
    byPrefix.set(m[1], list);
  }
  const tree_duplicates = [...byPrefix.entries()]
    .filter(([, files]) => files.length > 1)
    .map(([prefix, filenames]) => ({ prefix, filenames }))
    .sort((a, b) => a.prefix.localeCompare(b.prefix));

  const logMap = new Map(
    (logs ?? []).map((r) => [r.filename, { status: r.status as string, checksum: r.checksum as string | null }])
  );

  // 4. Diff
  const pending: string[] = [];
  const failed: string[] = [];
  const drift: string[] = [];
  let applied = 0;

  for (const file of sqlFiles) {
    const entry = logMap.get(file);
    if (!entry) {
      pending.push(file);
    } else if (entry.status === "failed") {
      failed.push(file);
    } else if (entry.status === "success") {
      applied++;
      if (entry.checksum && fileChecksums.get(file) !== entry.checksum) {
        drift.push(file);
      }
    }
  }

  // Also check for failed entries that may not have a file on disk
  for (const [filename, entry] of logMap) {
    if (entry.status === "failed" && !failed.includes(filename)) {
      failed.push(filename);
    }
  }

  // Allocator state. Both are best-effort: migration 483 may not be applied in
  // whatever database this is pointed at, and check_migrations must still work.
  let next_free_number: number | null = null;
  let log_collisions: { prefix: string; filenames: string[] }[] = [];

  const { data: highWater } = await sb.rpc("fn_migration_number_high_water");
  if (typeof highWater === "number") {
    next_free_number = highWater + 1;
  }

  const { data: collisions } = await sb
    .from("v_migration_collisions")
    .select("prefix, filenames, is_pre_guard")
    .eq("is_pre_guard", false);
  if (collisions) {
    log_collisions = collisions.map((r) => ({
      prefix: r.prefix as string,
      filenames: (r.filenames ?? []) as string[],
    }));
  }

  return {
    applied,
    pending,
    failed,
    drift,
    total_files: sqlFiles.length,
    next_free_number,
    tree_duplicates,
    log_collisions,
  };
}
