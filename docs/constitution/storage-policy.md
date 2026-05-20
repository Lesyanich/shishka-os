# Storage Policy — Where Things Live

> Priority: Core Rules > Engineering Rules > Storage Policy (this file) > Agent Rules
>
> Origin: 2026-05-11 incident — Google Drive Shared Drive hit the 400 000-item cap because `node_modules`, Python `.venv`, and stale Claude Code worktrees were being synced. This rule prevents recurrence.

---

## Why this exists

Google Drive Shared Drives have a **hard limit of 400 000 items** (files + folders, current + trash). Active code projects blow through that limit fast:

- One `node_modules/` for a Vite + React app = ~30 000 items.
- One Python `.venv/` = 5 000–20 000 items.
- Each Claude Code worktree creates a **full filesystem copy** of the repo.

`.gitignore` does **not** protect against this — Drive's desktop client syncs everything in a watched folder, regardless of what git tracks.

---

## RULE-DRIVE-FOR-DOCS-ONLY

Google Drive Shared Drive (`Shishka healthy kitchen`) stores **non-executable, human-edited content only**:

| Allowed on Drive                              | Why                                          |
|-----------------------------------------------|----------------------------------------------|
| `docs/`, `docs/constitution/`                 | Living documentation, read by all agents     |
| `01_Business/`, `_archive/`                   | Business records, contracts, receipts        |
| `vault/`, `knowledge/`, `.obsidian/`          | Obsidian vault for the team                  |
| `Bills/`, `Industry trends/`, etc.            | Photos, PDFs, browsable content              |
| `CLAUDE.md`, `STATUS.md`, `*.md` at root      | Project meta, agent-visible                  |
| `scripts/*.sh` (small, hand-written)          | Operational scripts, no compiled artifacts   |

**Forbidden on Drive** — never create or commit, even temporarily, anywhere under the Drive folder:

- `node_modules/` (any depth)
- `venv/`, `.venv/`, `__pycache__/`, `.pytest_cache/`, `.mypy_cache/`, `.ruff_cache/`
- `dist/`, `build/`, `.next/`, `.turbo/`, `.vite/`, `.parcel-cache/`, `coverage/`
- `.claude/worktrees/` (Claude Code per-session worktrees)
- Any auto-generated artifact > 100 files

> Origin: 2026-05-11. Enforced by `.gitignore` (for git tracking) **and** by manual hygiene (for Drive sync). The clean-up script lives at `scripts/cleanup-drive-bloat.sh`.

---

## RULE-CODE-LIVES-LOCAL

Active code work — `apps/`, `services/`, `tools/`, `scripts/` — is **developed locally and pushed to GitHub**, not synced through Drive.

Recommended local layout:

```
~/code/shishka/                  ← active workdir (git clone of remote)
└── shishka-healthy-kitchen/
    ├── apps/
    ├── services/
    ├── tools/
    ├── docs/                    ← same docs as Drive, kept in sync via git
    └── .git/
```

The Drive folder remains the canonical location for docs and business content. Code on Drive (if any remains during the transition) is a **read-only mirror** — never `npm install` or `python -m venv` inside the Drive folder.

> Origin: 2026-05-11. Long-term direction: migrate `apps/` and `services/` fully out of Drive once team workflows allow.

---

## RULE-NO-WORKTREES-ON-DRIVE

Claude Code worktrees (`git worktree add`) must **not** be created under the Drive-synced folder. Each worktree is a full repo copy and accumulates fast.

If a Claude session needs an isolated worktree:

1. Prefer a path outside Drive: `~/code/shishka/.worktrees/<name>/`.
2. If a worktree was accidentally created under Drive, delete it after the session: `git worktree remove .claude/worktrees/<name>`.

> Origin: 2026-05-11. The 100 515-item bloat came from 9 stale worktrees in `.claude/worktrees/` — branches survived in `.git/refs/`, but filesystem copies were duplicated 9×.

---

## RULE-DRIVE-TRASH-IS-NOT-FREE

Deleting files from Drive moves them to **Drive Trash**, which still counts toward the 400k cap until trash is emptied.

After any large cleanup:

1. Go to <https://drive.google.com/drive/trash> (Shared Drive context).
2. Empty trash.
3. Wait 5–10 minutes for the item counter to update.

> Origin: 2026-05-11. Without this step, the cleanup looks like it did nothing.

---

## Operational hygiene

| When                              | Do                                                                |
|-----------------------------------|-------------------------------------------------------------------|
| Starting a Claude Code session    | If creating a worktree, place it under `~/code/.../.worktrees/`   |
| After `npm install` / `pip install` | Verify the install happened in a local workdir, not Drive       |
| Quarterly                         | Run `scripts/cleanup-drive-bloat.sh` (dry-run) to scan for bloat |
| When item count alert fires       | Run script with `--execute`, then empty Drive trash               |

---

## See also

- `.gitignore` — patterns excluded from git tracking
- `scripts/cleanup-drive-bloat.sh` — one-shot cleanup utility
- `docs/constitution/engineering-rules.md` — broader engineering conventions
