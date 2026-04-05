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

  return {
    applied,
    pending,
    failed,
    drift,
    total_files: sqlFiles.length,
  };
}
