# Spec: Knowledge Base Consolidation

> **Task:** Knowledge base audit: consolidate vault + 04_Knowledge, eliminate duplication
> **MC Task:** d01e9767-21bc-470b-8f6d-b6ddde72d76b
> **Priority:** high | **Domain:** ops
> **Created:** 2026-04-06 | **Author:** COO

## Problem

Knowledge is spread across 4 locations with significant duplication between `vault/` and `04_Knowledge/`. Agents route to specific files via CLAUDE.md, but the duplication creates confusion about which copy is canonical.

## Current State

### Layer Map

| Location | Purpose | Size | Status |
|----------|---------|------|--------|
| `docs/bible/` | Business SSoT (9 files) | ~50K | Clean, no changes needed |
| `docs/domain/` | Technical domains (6 files) | ~30K | Clean, no changes needed |
| `docs/constitution/` | System rules (6 files) | ~20K | Clean, no changes needed |
| `vault/` | Obsidian legacy + Architecture | ~500K | Has duplicates |
| `04_Knowledge/` | Reorganized vault + unique content | ~1.9GB | Has duplicates + unique |

### Duplication Matrix

| Content | vault/ location | 04_Knowledge/ location | Keep |
|---------|----------------|----------------------|------|
| Architecture (6 files) | `vault/Architecture/` | `04_Knowledge/Architecture/` | vault/ (referenced in CLAUDE.md L3) |
| Phase 7-10 docs | root of vault/ | `04_Knowledge/Phases/` | knowledge/phases/ |
| Handover | `vault/Handover/` | `04_Knowledge/Handover/` | vault/Handover/ |
| Agent Skills | root of vault/ | root of 04_Knowledge/ | vault/ (referenced in CLAUDE.md L3) |
| Menu .md (RAW/PF/MOD/SALE) | `vault/_Archive/01_Menu/` | `04_Knowledge/_Archive/01_Menu/` | _archive/ (replaced by Supabase) |
| Equipment .md | `vault/_Archive/03_Infrastructure/` | `04_Knowledge/_Archive/03_Infrastructure/` | _archive/ (replaced by Supabase) |
| Blueprints, Logs | `vault/_Archive/` | `04_Knowledge/_Archive/` | _archive/ (historical) |
| STATE-legacy.md (109K) | `vault/_Archive/` | `04_Knowledge/_Archive/` | _archive/ (snapshot) |

### Unique to 04_Knowledge (NOT duplicated)

| Content | Location | Size | Action |
|---------|----------|------|--------|
| AI Learning research | `04_Knowledge/AI_Learning/` | 564K | Move to knowledge/ai-learning/ |
| 193 cookbooks | `04_Knowledge/Cooking_Lessons/` | 1.9GB | Move to knowledge/cooking/ |
| Industry reports | `04_Knowledge/Industry/` | 13MB | Move to knowledge/industry/ |

## Target Structure

```
vault/                         ← ARCHITECTURE REFERENCE (cleaned)
├── Architecture/              ← 6 docs (SSoT for DB schema, ledger, etc.)
├── Handover/                  ← Handover history
└── _Archive/                  ← Only Logs/ and Blueprints/ (historical value)

knowledge/                     ← RENAMED from 04_Knowledge/ (human + RAG ready)
├── ai-learning/               ← AI/Agent research (unique)
├── cooking/                   ← 193 culinary books (unique, 1.9GB)
├── industry/                  ← Market reports (unique)
└── phases/                    ← Phase history (7-10)

_archive/                      ← GLOBAL ARCHIVE (root level)
├── vault-legacy/              ← Phase files, Agent Skills from vault/ root
├── menu-obsidian/             ← RAW/PF/MOD/SALE .md files (replaced by Supabase)
├── equipment-obsidian/        ← Equipment .md files (replaced by Supabase)
├── state-snapshots/           ← STATE-legacy.md, 00_HUB.md
└── knowledge-archive/         ← Old _Archive/ content from 04_Knowledge/
```

## Execution Steps

### Phase 1: Create target directories
```bash
mkdir -p knowledge/{ai-learning,cooking,industry,phases}
mkdir -p _archive/{vault-legacy,menu-obsidian,equipment-obsidian,state-snapshots,knowledge-archive}
```

### Phase 2: Move unique content from 04_Knowledge/
```bash
mv 04_Knowledge/AI_Learning/* knowledge/ai-learning/
mv 04_Knowledge/Cooking_Lessons/* knowledge/cooking/
mv 04_Knowledge/Industry/* knowledge/industry/
mv 04_Knowledge/Phases/* knowledge/phases/
```

### Phase 3: Archive obsolete content
```bash
# From vault/
mv vault/Phase*.md _archive/vault-legacy/
mv vault/"Agent Skills & Capabilities.md" _archive/vault-legacy/
mv vault/_Archive/01_Menu/ _archive/menu-obsidian/
mv vault/_Archive/03_Infrastructure/ _archive/equipment-obsidian/
mv vault/_Archive/STATE-legacy.md _archive/state-snapshots/
mv vault/_Archive/00_HUB.md _archive/state-snapshots/
mv vault/_Archive/PF_MIREPOIX_SAUTE.md _archive/state-snapshots/
mv vault/_Archive/5519013d*.md _archive/state-snapshots/
mv vault/_Archive/Untitled.canvas _archive/state-snapshots/

# Keep vault/_Archive/Blueprints/ and vault/_Archive/Logs/ in place (historical)
```

### Phase 4: Remove 04_Knowledge/ (now empty except .obsidian)
```bash
# Verify all unique content moved
# Archive remaining 04_Knowledge/ duplicates
mv 04_Knowledge/_Archive/ _archive/knowledge-archive/
mv 04_Knowledge/Architecture/ /dev/null  # duplicate of vault/Architecture/
mv 04_Knowledge/Handover/ /dev/null      # duplicate of vault/Handover/
mv 04_Knowledge/"Agent Skills & Capabilities.md" /dev/null  # duplicate
rm -rf 04_Knowledge/  # or archive .obsidian/ config if needed
```

### Phase 5: Update CLAUDE.md routing
Add to L1 or LK level:
```markdown
## Knowledge Base (human knowledge + RAG source)
| Topic | File | Domains |
|-------|------|---------|
| AI Learning | knowledge/ai-learning/ | tech, strategy |
| Culinary Library | knowledge/cooking/ | kitchen |
| Industry Reports | knowledge/industry/ | strategy, marketing |
| Phase History | knowledge/phases/ | all |
```

### Phase 6: Update docs/domain/db-schema-summary.md
Verify reference to `vault/Architecture/Database Schema.md` still correct (it should be — vault/Architecture/ stays).

## Success Criteria

- [ ] No duplicate files between vault/ and knowledge/
- [ ] 04_Knowledge/ directory removed
- [ ] All unique content preserved in knowledge/
- [ ] CLAUDE.md routes updated
- [ ] vault/ contains only Architecture/, Handover/, and cleaned _Archive/
- [ ] Root _archive/ contains all obsolete content (nothing deleted)

## Risk

- 1.9GB of cookbooks — `mv` operation may take time
- Obsidian .obsidian/ config in both vaults — archive, don't delete (in case Obsidian is still used)
- Wikilinks in vault/ files may reference moved files — check after migration

## Notes

This is a file reorganization task. No code changes. No database changes. Executor: Claude Code or manual.
