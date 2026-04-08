# MemPalace — L1 Conversation Memory

Local, MCP-native conversation memory for Shishka Brain v2. Stores verbatim agent conversations in ChromaDB (vectors) + SQLite (knowledge graph) and exposes retrieval via MCP tools.

- **Spec:** [`docs/plans/spec-mempalace-phase2.md`](../../docs/plans/spec-mempalace-phase2.md)
- **Umbrella:** [`docs/plans/spec-shishka-brain.md`](../../docs/plans/spec-shishka-brain.md)
- **Upstream:** https://github.com/milla-jovovich/mempalace (MIT)
- **Pinned version:** `mempalace==3.0.0` (see `requirements.txt`)

## Storage layout

| Path | Purpose | Backup |
|---|---|---|
| `~/.mempalace/` | Live data (ChromaDB + SQLite). **Outside repo, outside GDrive**, inside FileVault. | `backup.sh` |
| `_backups/mempalace/*.tar.age` | Nightly encrypted backups on GDrive | rotated 30d |
| Apple Keychain Secure Note `MemPalace age private key` | Private key for decrypting backups | Touch ID gated |
| `services/mempalace/age-recipient.txt` | Public key (safe to commit) | — |

**Hard rule:** never put `~/.mempalace/` inside the repo tree or GDrive — SQLite lock files and ChromaDB multi-file transactions corrupt under GDrive sync. See spec §3.1.

## Install (first time)

```bash
cd services/mempalace
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
export ANONYMIZED_TELEMETRY=False          # disable chromadb PostHog telemetry
mempalace status                           # triggers ~/.mempalace/ creation
```

Telemetry note: `mempalace` itself has no phone-home; its transitive dep `chromadb` ships anonymized PostHog telemetry that we disable via the env var above. This must be set in every shell that touches the palace.

## Daily operation

```bash
source services/mempalace/.venv/bin/activate
export ANONYMIZED_TELEMETRY=False
mempalace status                                  # what's filed
mempalace wake-up --wing Shishka                  # ~170 tokens of critical facts
mempalace search "storage decision" --wing Shishka
mempalace mine <path> --mode convos               # ingest new conversation dump
```

All writes MUST pass through `filter.py` first — see §Pre-ingest filter below.

## Pre-ingest filter (REQUIRED)

`filter.py` wraps every `mempalace mine` call. It reads `pre-ingest-blocklist.yaml` and hard-fails on any match (drop, not redact — spec §4.1).

```bash
python filter.py <path-to-content>     # prints OK or raises + exits non-zero
```

To add a new block pattern: edit `pre-ingest-blocklist.yaml`, add a fixture line to `tests/fixtures/known-secrets.txt`, re-run `python filter.py tests/fixtures/known-secrets.txt` — it must still hard-fail on the fixture.

## Backup / Restore

```bash
# one-time age setup (documented in §3.2 of spec)
brew install age
age-keygen -o ~/.mempalace-key.txt
# open Keychain Access → New Secure Note → "MemPalace age private key" → paste contents
security find-generic-password -s "MemPalace age private key"   # verify
shred -u ~/.mempalace-key.txt
# copy the public key line into services/mempalace/age-recipient.txt

# nightly
bash services/mempalace/backup.sh

# disaster recovery
bash services/mempalace/restore.sh _backups/mempalace/mempalace-YYYYMMDD-HHMM.tar.age
```

## MCP server

Exposed as `shishka-mempalace` in the Claude Code MCP config. Tool namespace is `mempalace__*` (spec §7) to avoid collision with other `shishka-*` servers.

To start standalone (debug):

```bash
source services/mempalace/.venv/bin/activate
export ANONYMIZED_TELEMETRY=False
python -m mempalace.mcp_server
```

## Runbook — common failures

| Symptom | Cause | Fix |
|---|---|---|
| `mempalace status` → `No palace found` | `~/.mempalace/` wiped | `restore.sh <latest backup>` |
| MCP tools not appearing in ToolSearch | Claude Code not restarted after config change | Full restart |
| `chromadb` errors about locked DB | Something mounted `~/.mempalace/` on GDrive | STOP, check path, never on GDrive |
| Filter hard-fails on clean-looking content | New blocklist pattern matches | Inspect content, refine pattern, re-run |
| Backup restore fails decryption | Private key missing from Keychain | Recovery card in CEO safe |

## Non-goals (Phase 2)

See spec §8. TL;DR: no multi-user, no cloud hosting, no historical backfill beyond Session 5 bootstrap, no LightRAG/Graphify overlap.
