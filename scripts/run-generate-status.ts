/**
 * Standalone runner for generate_status tool.
 * Called by scripts/generate-status.sh (post-commit hook).
 * Usage: npx tsx scripts/run-generate-status.ts /path/to/repo
 */

import { generateStatus } from "../services/mcp-mission-control/src/tools/generate-status.js";

const repoRoot = process.argv[2];

if (!repoRoot) {
  console.error("[generate-status] ERROR: repo_root argument required");
  process.exit(1);
}

try {
  const result = await generateStatus({ repo_root: repoRoot });
  if ("error" in result) {
    console.error(`[generate-status] ERROR: ${result.error}`);
    process.exit(1);
  }
  console.log(`[generate-status] STATUS.md updated — ${result.summary.total} tasks`);
} catch (err) {
  console.error(`[generate-status] CRASH: ${err}`);
  process.exit(1);
}
