/**
 * Standalone runner for generate_status tool.
 * Called by scripts/generate-status.sh (post-commit hook).
 * Usage: npx tsx scripts/run-generate-status.ts /path/to/repo [--git-only]
 *
 * --git-only enables offline mode: missing Supabase credentials or DB errors
 * degrade to a git-only STATUS.md with an offline banner instead of failing.
 */

import { generateStatus } from "../services/mcp-mission-control/src/tools/generate-status.js";

const args = process.argv.slice(2);
const repoRoot = args.find((a) => !a.startsWith("--"));
const gitOnly = args.includes("--git-only");

if (!repoRoot) {
  console.error("[generate-status] ERROR: repo_root argument required");
  process.exit(1);
}

async function main() {
  try {
    const result = await generateStatus({ repo_root: repoRoot, allow_offline: gitOnly });
    if ("error" in result) {
      console.error(`[generate-status] ERROR: ${result.error}`);
      process.exit(1);
    }
    const mode = gitOnly ? " (offline)" : "";
    console.log(`[generate-status] STATUS.md updated${mode} — ${result.summary.total} tasks`);
  } catch (err) {
    console.error(`[generate-status] CRASH: ${err}`);
    process.exit(1);
  }
}

main();
