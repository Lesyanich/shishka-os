# Spec: MemPalace — L1 Conversation Memory (Phase 2)

> MC Task: TBD (blocked by `3cc98121` MC RPC bugfix)
> Priority: high (critical path for AI-native ops)
> Status: storage-locked, awaiting LightRAG Phase 1 merge
> Parent: `docs/plans/spec-shishka-brain.md`
> Branch: `feature/shared/mempalace-phase2`
> Upstream: https://github.com/milla-jovovich/mempalace
> Blocks: Brain View (`efebcbb1`) L1 tab

## 1. What MemPalace Is

A local conversation memory service for AI agents. Python CLI + native MCP server. Stores **verbatim transcripts** (no summarisation on write) in ChromaDB (vectors) + SQLite (knowledge graph). Retrieves via semantic search. 19 MCP tools. Published LongMemEval score 96.6% R@5; authors publicly retracted overclaims on AAAK compression mode — an integrity signal worth noting.

### 1.1 The "Palace" Metaphor (UX layer only)
Under the hood it's ChromaDB + SQLite. The metaphor is a navigation aid for agents:

- **Wings** — people or projects (e.g. `Shishka`, `Personal`)
- **Rooms** — topics inside a wing (e.g. `Kitchen Philosophy`, `LightRAG`, `Suppliers`)
- **Halls** — memory types (`facts`, `events`, `decisions`, `preferences`)
- **Closets** — summaries with pointers back to originals
- **Drawers** — verbatim raw content
- **Tunnels** — cross-references between rooms

### 1.2 Wake-Up Protocol
On session start, MemPalace loads ~170 tokens of critical facts for the active Wing. This is the automated, semantic replacement for our current `MEMORY.md` index.

### 1.3 Why Not Just Use `~/.claude/.../memory/`?
That layer is Claude-private, shared only with the Claude Code CLI. MemPalace is shared across all agents (Chef, Finance, COO, Code) through MCP. We need a neutral, cross-agent memory that Finance can query without knowing what Chef learned, and vice versa.

## 2. Dependencies and Prerequisites

- Python 3.11+ (check `python3 --version`)
- `brew install age` (for backup encryption)
- FileVault enabled on Mac (✅ verified 2026-04-08)
- LightRAG Phase 1 PR #29 **merged** (don't start Phase 2 on an un-merged upstream — the running LightRAG service would be in an inconsistent state)
- MemPalace upstream repo verified — `milla-jovovich/mempalace` is a friend-of-friend project per CEO, not a squatter
- `graphifyy` naming gotcha does **not** apply here — MemPalace pip name to be verified during spike step 1

## 3. Storage Strategy — **LOCKED**

```
LIVE DATA       ~/.mempalace/                    macOS FileVault (✅ on)
                ↓ nightly cron 03:00
ENCRYPTED       _backups/mempalace/*.tar.age     age encryption (open source)
BACKUP          (on GDrive, encrypted)
                ↑
KEY STORAGE     Apple Keychain → Secure Note     "MemPalace age private key"
                                                  Touch ID unlock
```

### 3.1 Hard Rules
- ❌ **DO NOT put the live DB on Google Drive.** SQLite + ChromaDB use lock-files and multi-file transactions. GDrive sync corrupts them within days. Conflict copies multiply. The shared drive also leaks verbatim business conversations to anyone with drive access.
- ❌ **DO NOT put the live DB in the repo working tree** — same GDrive problem because the whole repo lives there.
- ✅ **DO put it in `~/.mempalace/`** — outside GDrive, inside FileVault boundary.
- ✅ **DO back up nightly** — Mac dies, work survives.
- ✅ **DO encrypt backups before they touch GDrive** — shared drive is hostile storage.

### 3.2 One-Time Setup (during spike)
```bash
brew install age
age-keygen -o ~/.mempalace-key.txt
# Open Keychain Access → New Secure Note → "MemPalace age private key"
# Paste contents of ~/.mempalace-key.txt
security find-generic-password -s "MemPalace age private key"  # verify
shred -u ~/.mempalace-key.txt  # delete plaintext
# Public key goes in repo at services/mempalace/age-recipient.txt (not secret)
```

### 3.3 Backup Script (to be written during spike)
```bash
# services/mempalace/backup.sh
set -euo pipefail
SRC="$HOME/.mempalace"
DST="/path/to/GDrive/_backups/mempalace"
STAMP=$(date +%Y%m%d-%H%M)
RECIPIENT=$(cat services/mempalace/age-recipient.txt)
tar c "$SRC" | age -r "$RECIPIENT" > "$DST/mempalace-$STAMP.tar.age"
find "$DST" -name 'mempalace-*.tar.age' -mtime +30 -delete
```
Scheduled via `launchd` or `cron @ 03:00` local time.

### 3.4 Restore Script
```bash
# services/mempalace/restore.sh
security find-generic-password -s "MemPalace age private key" -w \
  | age -d -i - "$1" \
  | tar x -C "$HOME"
```

## 4. Pre-Ingest Filter — REQUIRED, OWED

Before any verbatim conversation is stored, it must pass through a regex filter that strips or masks:

- **Credentials and tokens:** AWS keys, Supabase service keys, OAuth tokens, JWTs, API keys, private keys
- **Personal identifiers:** passport numbers, national IDs, addresses, phone numbers where not business-essential
- **Financial sensitivities:** salary amounts, individual payroll, supplier-price-to-name pairs (structural prices fine; named supplier rates not)
- **Raw DB dumps:** anything that looks like a row of customer or staff data

### 4.1 Filter design principles
- Drop, not redact — redaction invites false sense of security when regex misses a variant
- Hard-fail on detection: reject the ingest and surface to CEO rather than silently storing a half-cleaned version
- Keep a blocklist file at `services/mempalace/pre-ingest-blocklist.yaml` so new patterns can be added without code change
- Test with a known-secret fixture before first real ingest — commit the fixture, never commit the expected "clean" output that contains secrets

### 4.2 Known patterns to block at minimum (draft, expand during spike)
- `VITE_SUPABASE_SERVICE_ROLE_KEY=` and its value
- `sbp_[a-zA-Z0-9]{32,}` (Supabase service role JWT prefix)
- `sk-ant-[a-zA-Z0-9-_]{40,}` (Anthropic API keys)
- `ya29\.[a-zA-Z0-9_-]{50,}` (Google OAuth tokens)
- Passport number patterns for relevant jurisdictions (TH, RU, at minimum)
- Staff salary lines from payroll docs (pattern TBD when we have real payroll data)

## 5. Spike Plan — 1 Working Day Timebox

### Step 0 — Verify upstream (15 min)
- [ ] `pip index versions mempalace` — resolve the real package name and current version
- [ ] Read repo README and CHANGELOG end to end
- [ ] Verify license is OSS-compatible
- [ ] Verify the MCP server registers cleanly — no hard-coded telemetry, no phone-home

### Step 1 — Install in isolated venv (30 min)
- [ ] `python3 -m venv services/mempalace/.venv` (the venv directory is fine on GDrive — only the data directory needs to live elsewhere)
- [ ] `source services/mempalace/.venv/bin/activate`
- [ ] `pip install <verified-package-name>`
- [ ] Initial `mempalace init` targeting `~/.mempalace/`
- [ ] `mempalace --help` — sanity check CLI

### Step 2 — Wire MCP server (1 hour)
- [ ] Start MCP server locally
- [ ] Register in Claude Code config as `shishka-mempalace` (matching our `shishka-*` naming convention)
- [ ] Restart Claude Code, confirm tools appear via ToolSearch

### Step 3 — Storage setup (1 hour)
- [ ] Run one-time `age` setup from §3.2
- [ ] Write and commit `services/mempalace/backup.sh` and `restore.sh`
- [ ] Test one full backup → delete `~/.mempalace/` → restore → verify round-trip
- [ ] Schedule cron or launchd job

### Step 4 — Pre-ingest filter (1.5 hours)
- [ ] Draft `services/mempalace/pre-ingest-blocklist.yaml` from §4.2
- [ ] Write filter wrapper: any ingest goes through the filter before hitting MemPalace API
- [ ] Test with fixture of known secrets
- [ ] Document how to add new patterns

### Step 5 — First real ingest (1 hour)
- [ ] Ingest: this session's running log comments on MemPalace itself (meta, fitting)
- [ ] Ingest: `docs/bible/kitchen-philosophy.md` — except this is L2 content, not L1; **re-consider** — L1 is conversations, not reference docs
- [ ] Correct Step 5: ingest 3 Session 5 COO Running Log comments as the first L1 conversation entries
- [ ] Verify retrieval: "What did COO decide about MemPalace storage?" — expect to get §3 back

### Step 6 — Quality gate (30 min)
Three CEO questions that MemPalace must answer from just-ingested session data:
- [ ] Q1: "What storage strategy did we pick for MemPalace and why?" → expect Option B+ with reasoning about SQLite/GDrive corruption
- [ ] Q2: "Is 1Password decided?" → expect "deferred, Apple Keychain baseline, revisit conditions"
- [ ] Q3: "Why did we pivot Phase 2 from Graphify to MemPalace?" → expect "bigger pain bitten, cross-session context loss"

PASS = all three retrieved correctly with source attribution.
FAIL = debug retrieval config, re-ingest if needed, one more round; if still FAIL, park as blocker and raise to CEO.

### Step 7 — Agent wiring (1 hour)
- [ ] Add §"Memory" section to each of `agents/coo/AGENT.md`, `agents/chef/AGENT.md`, `agents/finance/AGENT.md` — document which queries go to MemPalace vs LightRAG
- [ ] Update CLAUDE.md L0 session start protocol — add optional step "query MemPalace for active threads" before reading Running Log manually
- [ ] Update `agents/coo/AGENT.md` — mark Running Log as "interim until MemPalace ships, then read-only archive"

### Step 8 — Close (30 min)
- [ ] Update `docs/plans/spec-shishka-brain.md` §4 Phase 2 status to `done`
- [ ] Update STATUS.md via post-commit hook
- [ ] MC task close with `context_files` pointing to this spec and the spike result doc
- [ ] Comment on COO Running Log with spike outcome, gotchas, and any follow-ups

## 6. Quality Gate — Final Acceptance

MemPalace is "done" when:
1. It answers all three Step 6 questions with correct source attribution
2. Backup round-trip works end-to-end
3. Pre-ingest filter rejects the known-secret fixture and lets clean content through
4. All three agents (Chef, Finance, COO) have documented routing in their `AGENT.md`
5. A fresh Claude Code session can start, query MemPalace, and recover last session's context **without reading MC Running Log**

## 7. Known Risks and Mitigations

| Risk | Mitigation |
|---|---|
| ChromaDB schema drift between MemPalace versions | Pin version in `requirements.txt`, back up before any upgrade |
| Regex filter misses a secret variant | Hard-fail on partial match, prefer false-positives; test with fixtures |
| `~/.mempalace/` grows unbounded | Monitor size nightly in backup script; alert CEO at 5 GB |
| Backup encryption key lost | Printed recovery card in CEO's safe (low-tech, high-reliability) |
| MemPalace author abandons project | We own the data in ChromaDB + SQLite — extract via direct file reads if upstream dies |
| MCP tool name collision with other `shishka-*` servers | Namespace as `mempalace__*` tools explicitly |

## 8. Explicit Non-Goals for Phase 2

- ❌ Multi-user access (single CEO phase)
- ❌ Cloud hosting (stays on Mac)
- ❌ Automated ingest of all MC comments historically — spike ingests only forward-looking session data
- ❌ Replacing LightRAG for bible/domain queries — wrong layer
- ❌ Replacing MC tasks — MemPalace is memory, MC is action ledger
- ❌ Building Brain View L1 tab — that's `efebcbb1`, separate task

## 9. Follow-Up Tasks (post-spike, not scoped here)

- Regex filter expansion as new secret types appear
- MemPalace metrics (storage size, query latency, hit rate) on admin dashboard
- Cross-layer routing intelligence — "which layer should answer this?" — belongs to Phase 4 shishka-brain gateway
- Export/import protocol for team members when we hire staff

## 10. Provenance

Decisions captured in COO Running Log Session 5 (2026-04-08):
- `25fea4a3` — MemPalace introduced, Phase 2 pivot from Graphify accepted
- `d45d0fc2` — Storage, FileVault, Apple Keychain, `age` encryption locked
- `1e7d385a` + `9fdf8b6f` — Session 5 final handoff
- CEO explicit approval of B+ storage strategy, FileVault confirmed on, Apple Keychain as baseline
