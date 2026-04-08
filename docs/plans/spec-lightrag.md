# Spec: LightRAG Integration for Shishka OS Agent Knowledge

> MC Task: `2e0cb037-7877-49e1-81d5-d0be5e779359`
> Priority: high
> Status: research-complete
> Branch: `feature/shared/lightrag-research`
> Related: `docs/plans/spec-ai-native-ops.md` (Phase D3)

## 1. What Is LightRAG

**LightRAG** (HKUDS/LightRAG, 23k+ GitHub stars) — graph+vector hybrid RAG framework. Published at EMNLP 2025 ("Simple and Fast Retrieval-Augmented Generation", arXiv:2410.05779).

Core idea: instead of searching only vector chunks (standard RAG), LightRAG extracts entities and relationships from documents into a knowledge graph, then combines graph-based retrieval with vector similarity. This enables cross-document reasoning that plain vector search cannot do.

### How It Differs from Standard RAG

```
Standard RAG:  docs → chunk → embed → vector search → LLM answer
LightRAG:      docs → chunk → LLM extract entities/relations → graph + vector → hybrid search → LLM answer
```

The graph layer connects knowledge across document boundaries. A question like "which suppliers provide ingredients used in our highest-margin dishes?" requires joining supplier data, BOM data, and financial data — something vector search alone fails at.

## 2. Technical Architecture

### 2.1 Ingestion Pipeline

```
Document → Chunking (1200 tokens, 100 overlap)
         → LLM Entity/Relation Extraction (gpt-4o-mini or equivalent)
         → Deduplication + Graph Merge (union-based, incremental)
         → Three Vector DBs: entities_vdb, relationships_vdb, chunks_vdb
         → Seven KV Stores (entity↔chunk mappings, descriptions, etc.)
```

**Key property**: Incremental updates. New documents merge into existing graph via set union — no full rebuild required (unlike Microsoft GraphRAG).

### 2.2 Query Modes

| Mode | Queries | Best For |
|------|---------|----------|
| `naive` | chunks_vdb only | Simple fact lookup |
| `local` | entities_vdb | Entity-focused ("what is RAW-CARROT?") |
| `global` | relationships_vdb | Relationship queries ("who supplies what?") |
| `hybrid` | entity + relationship VDBs | Multi-aspect queries |
| `mix` | All three VDBs (recommended) | General use, best accuracy |
| `bypass` | Direct LLM, no retrieval | Conversation-only |

### 2.3 Storage Backends (Production-Ready)

| Backend | Role | Notes |
|---------|------|-------|
| **PostgreSQL + pgvector** | Vector + KV | Native support via `PGKVStorage` + `PGVectorStorage` |
| Neo4j | Graph storage | Optional, for dedicated graph layer |
| JSON / NanoVectorDB | File-based | Dev only |

**Shishka fit**: PostgreSQL with pgvector is natively supported. Can share our Supabase PostgreSQL instance with namespace isolation, or use a dedicated instance.

### 2.4 LLM Requirements

| Phase | Minimum | Recommended |
|-------|---------|-------------|
| Entity extraction (ingestion) | 32B params, 32K context | gpt-4o-mini, 64K context |
| Embedding | Any embedding model | BAAI/bge-m3, text-embedding-3-large |
| Query answering | Same as extraction | Same or larger model |

**Constraint**: Embedding model cannot be changed after indexing without dropping and recreating vector tables.

### 2.5 API Interface

- **Python SDK**: `pip install lightrag-hku[api]` (v1.4.13, March 2026)
- **REST API**: FastAPI server with endpoints for ingestion, query, streaming, graph visualization
- **No native TypeScript SDK** — REST API is language-agnostic
- **MCP server**: Community `@g99/lightrag-mcp-server` exists but immature (0 stars, 17 commits). Build our own.

## 3. How It Fits Shishka OS Agents

### 3.1 Knowledge Sources to Index

| Source | Volume | Agent Users | Value from Graph |
|--------|--------|-------------|-----------------|
| `docs/bible/` (9 files) | ~50KB | All agents | Cross-reference brand identity with operations |
| `docs/domain/` (6 files) | ~30KB | Chef, Finance | Link nomenclature ↔ suppliers ↔ financial codes |
| `docs/constitution/` (rules) | ~20KB | All agents | Rule applicability per context |
| `knowledge/cooking/` (193 books) | 1.9GB | Chef | Recipe techniques, ingredient knowledge |
| `knowledge/industry/` (reports) | ~100MB | Strategy | Market data cross-referenced with our targets |
| Agent guidelines (`agents/*/AGENT.md`) | ~10KB | Respective agents | Agent capability → task routing |

**Priority**: Start with `docs/bible/` + `docs/domain/` (~80KB total). This is where cross-document reasoning adds most value. Cooking library is Phase 2.

### 3.2 Agent Use Cases

**Chef Agent** (`search_knowledge` in existing spec-ai-native-ops.md):
- "Which ingredients appear in multiple SALE dishes?" → graph traversal across BOM
- "What equipment is needed for dishes in the autumn menu?" → entity linking
- "Find cooking techniques for fermented vegetables from our library" → hybrid search

**Finance Agent**:
- "Which supplier provides the cheapest RAW for SALE-BORSCH?" → supplier ↔ ingredient ↔ dish graph
- "What financial code applies to this expense category?" → domain knowledge retrieval

**Dispatcher**:
- "Which agent handles tasks about BOM cost alerts?" → agent capability graph
- "Route this idea to the right domain" → domain classification via knowledge graph

### 3.3 Integration Architecture

```
┌─────────────────────────────────────────────┐
│               Shishka OS Agents             │
│  (Chef MCP, Finance MCP, Dispatcher MCP)    │
└──────────┬──────────────────────────────────┘
           │  MCP tool: search_knowledge(query, mode, agent)
           ▼
┌─────────────────────────────────────────────┐
│          LightRAG MCP Wrapper               │
│  (TypeScript, calls REST API)               │
│  - Namespace isolation per agent            │
│  - Query mode selection                     │
│  - Response formatting                      │
└──────────┬──────────────────────────────────┘
           │  HTTP REST
           ▼
┌─────────────────────────────────────────────┐
│          LightRAG Server (Python)           │
│  - FastAPI with OAuth2/API key auth         │
│  - Entity extraction pipeline              │
│  - Graph + vector hybrid retrieval         │
└──────────┬──────────────────────────────────┘
           │  SQL + pgvector
           ▼
┌─────────────────────────────────────────────┐
│          Supabase PostgreSQL                │
│  - pgvector for embeddings                 │
│  - Dedicated schema: lightrag_*            │
│  - Namespace-isolated tables per workspace │
└─────────────────────────────────────────────┘
```

## 4. Pros/Cons vs Alternatives

### 4.1 vs Plain pgvector (Current Option)

| Dimension | pgvector Only | LightRAG + pgvector |
|-----------|--------------|---------------------|
| Setup | Minimal | Moderate (Python server + LLM pipeline) |
| Query latency | 5-20ms | ~80ms (mix mode) |
| Cross-doc reasoning | None (isolated chunks) | Strong (knowledge graph links entities) |
| Compositional questions | Fails | Handles via graph traversal |
| Ingestion cost | Embedding only | Embedding + LLM extraction tokens |
| Accuracy at scale | Degrades 30% on large collections | Maintains quality via graph structure |
| Incremental updates | Trivial | Supported (union-based merge) |

**Verdict**: pgvector alone is sufficient for simple lookup (duplicate detection, similar items). LightRAG adds value when questions span multiple knowledge domains — which is exactly what Shishka agents need.

### 4.2 vs Microsoft GraphRAG

| Dimension | GraphRAG | LightRAG |
|-----------|----------|----------|
| Token cost per query | ~610,000 tokens | <100 tokens |
| Incremental updates | Full rebuild required | Union-based merge |
| Quality (benchmarks) | Good | Equal or better (50-55% win rate) |
| Infrastructure | Complex (Azure-centric) | Simple (single Python server) |

**Verdict**: GraphRAG is 6000x more expensive per query with no quality advantage. Not viable for Shishka's scale.

### 4.3 vs No RAG (Current State)

Currently agents load entire files via CLAUDE.md routing (L0/L1/L2 layers). Problems:
- Token waste: loading full files when only a paragraph is needed
- No cross-reference: chef can't easily find finance-domain knowledge
- No cooking library access: 193 books are too large to load

LightRAG solves all three while keeping the existing L0/L1/L2 routing as fallback.

## 5. Risks and Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| Query latency 15-25s (reported in v1.4.x) | HIGH | Benchmark with our data; pin to known-good version; cache frequent queries |
| LLM ingestion cost for 1.9GB cooking library | MEDIUM | Phase ingestion: bible/domain first (80KB, cheap), cooking library later |
| Python-only SDK (our stack is TypeScript) | LOW | REST API wrapper in TypeScript MCP; Python server runs as Docker sidecar |
| Version migration downtime (reported 12+ hours) | MEDIUM | Pin version; test migrations in staging before production |
| Embedding model lock-in | LOW | Choose embedding model carefully upfront (BAAI/bge-m3 recommended) |
| Single point of failure (LightRAG server) | MEDIUM | Agents fall back to current L2 file loading if LightRAG is down |

## 6. Recommended Implementation Phases

### Phase 1: Foundation (1 sprint)
- Deploy LightRAG server (Docker) with PostgreSQL/pgvector backend
- Connect to Supabase PostgreSQL (dedicated `lightrag` schema)
- Index `docs/bible/` + `docs/domain/` (~80KB)
- Validate query quality with 10 test questions per agent domain
- Benchmark latency

#### Phase 1 completion status (2026-04-08)

**Indexed: 18 docs via Ollama pipeline + 1 doc (operations.md) via Option E custom_kg injection.**
- All 8 `docs/domain/*.md` files processed via standard `gemma4:e2b` extraction.
- 10 of 11 `docs/bible/*.md` files processed via standard `gemma4:e2b` extraction.
- **`docs/bible/operations.md`** — added via **Option E** (Claude-pre-extracted custom_kg, COO decision `1ab81a16`). Bypasses both upstream failure modes documented below. See "Option E delivery" subsection.

**Stack as shipped:**
- Local Python venv (`venv/`) + `lightrag-hku[api]` 1.4.13
- Extraction LLM: `gemma4:e2b` via Ollama (local, ~9.6GB)
- Embedding: `bge-m3` via Ollama (1024-dim, multilingual) — **permanently locked**
- Storage: Supabase PostgreSQL + pgvector, tables `public.lightrag_*`, workspace `lightrag` (migration `099_lightrag_pgvector.sql`)
- Graph: NetworkX file (`services/lightrag/rag_storage/`)
- Ingest tuning: `MAX_PARALLEL_INSERT=1`, `TIMEOUT=600` (COO decision `d532e8ff`)

**Note on schema location**: LightRAG-hku hardcodes the `public` schema in `postgres_impl.py` (~line 1608). A dedicated `lightrag` schema is not feasible without forking. Drop-safe boundary is preserved via the `lightrag_` table prefix + `workspace='lightrag'` row discriminator.

##### Known limitation: `docs/bible/operations.md` excluded

File is excluded from the LightRAG index. Both authorized local models walled out on it:

| Model | Failure | Root cause |
|-------|---------|------------|
| `gemma4:e2b` | `ggml-metal-context.m:235 fatal error, command buffer 1 failed status 1` | Upstream llama.cpp Metal kernel bug, triggered deterministically by dense equipment codes (`L1-SPM-FRG-200-25`) + markdown tables. Not a timeout, not a contention issue — reproducible across 4 attempts with `MAX_PARALLEL_INSERT=1` and a fresh `ollama serve`. |
| `qwen3:4b` (targeted fallback) | `httpcore.ReadTimeout` inside ollama SDK | `TIMEOUT=1800` env var does not propagate into `httpx.AsyncClient` used by the `ollama` python SDK. Qwen3 enters thinking mode, streams nothing for >300s, httpx default read-gap trips. Fix requires monkey-patching the ollama SDK — out of Phase 1 scope. |

Forbidden escape routes under COO decision `6b845073` / `58080b93`:
- ❌ `gemma3:12b` and any >5GB model (OOM-class, explicitly rejected)
- ❌ Embedding swap (`bge-m3` permanently locked)
- ❌ Chunk size changes (would force re-ingest of 18 working files)
- ❌ Subscription proxies for Claude (ToS violation)

**Agent fallback**: when any agent needs `operations.md` content it falls back to direct `Read(docs/bible/operations.md)` via the normal L2 file-loading path. `kind:*` skills routing already covers this file for ops-domain tasks.

**Graph drift on the remaining 18 files**: `gemma4:e2b` frequently writes markdown tables instead of the `name|type|desc|source` delimiter format LightRAG expects. VDB chunks (via `bge-m3`) are fine; the graph layer is sparser than the framework assumes. Accepted as a Phase 1 limitation — model capability ceiling, not a config bug.

**Phase 1.5 staged** (trigger only if Q2 cross-doc synthesis fails quality gate):
- `$5` Anthropic prepay → `ANTHROPIC_API_KEY` → Apple Keychain → LightRAG extractor swap → `DELETE /documents` → re-ingest via Haiku 4.5 (~`$0.40`, ~10 min)
- Claude used **only at ingest**. Queries stay on `gemma4:e2b` ($0 ongoing).
- Fixes graph drift on the 18 Ollama-indexed files in a single pass. (operations.md is already covered by Option E.)

##### Option E delivery: operations.md via Claude-pre-extracted custom_kg

After both local extractors walled out, COO decision `1ab81a16` shipped Option E: have Claude (this conversation, free under existing subscription) read `docs/bible/operations.md`, hand-extract entities/relationships/chunks into `custom_kg` JSON shape (verified against `LightRAG.ainsert_custom_kg` source — see comment `da533813`), and inject via the Python API.

**Artifacts:**
- `services/lightrag/custom_kg_operations.json` — 4 chunks, 28 entities, 18 relationships. Schema validated against `ainsert_custom_kg`. All entity/relation `source_id`s match a `chunks[].source_id`.
- `services/lightrag/inject_ops_kg.py` — one-shot Python injector. Mirrors `run-server.sh` env setup (DATABASE_URL parsing, SSL verify-ca with Supabase CA, all PG\* + `LIGHTRAG_*_STORAGE` env vars). Imports `LightRAG`, calls `ainsert_custom_kg(kg, full_doc_id="doc-operations-md-claude")`.

**Critical gotcha encountered**: `lightrag-server` constructs `EmbeddingFunc(model_name=os.environ["EMBEDDING_MODEL"])` ⇒ `bge-m3` ⇒ tables suffixed `_bge_m3_1024d`. The stock `from lightrag.llm.ollama import ollama_embed` singleton ships with `model_name="bge-m3:latest"` ⇒ would yield `_bge_m3_latest_1024d`. `PGVectorStorage._generate_collection_suffix` derives the table name from `embedding_func.model_name`, NOT from env, so passing `ollama_embed` directly creates a parallel table family the running server cannot see. The injector therefore wraps `ollama_embed.func` in a fresh `EmbeddingFunc(model_name="bge-m3", ...)` to land in the correct tables. Documented inline in `inject_ops_kg.py`.

**ainsert_custom_kg writes nothing to `lightrag_doc_status` / `lightrag_doc_full`** — operations.md does NOT show in `GET /documents` and has no `doc-*` id. Use the synthetic `doc-operations-md-claude` id only as a label inside the graph; reversibility is via `/documents/delete_entity` + `delete_relation` per id, or workspace nuke. Logged here so future sessions don't waste time looking for it under `/documents`.

**Status counts after Option E**: `{"processed":18,"all":18}` (unchanged — Option E injects directly into VDB + graph, not into the doc pipeline). Graph file: 43 entity nodes, 18 relationship edges (was 15/0 after Ollama-only ingest — operations.md added 28 entities + 18 relations and rescued the previously-empty relations layer).

**Smoke checks (read-only):**
- `GET /graph/entity/exists?name=L1%20KITCHEN` → `{"exists":true}`
- `GET /graph/entity/exists?name=L1-BL-FRZ-790-66` → `{"exists":true}`
- `GET /graph/entity/exists?name=COOK-CHILL%20ALGORITHM` → `{"exists":true}`
- `GET /graph/entity/exists?name=PHUKET%20WATER` → `{"exists":true}`
- `POST /query {"mode":"hybrid", "query":"What is L1 in our context?"}` → returns L1 KITCHEN, L1 Infrastructure, L1 DAILY BATCH SCHEDULE, CENTRAL KITCHEN MODEL, ZONE 1 LOGISTICS, HACCP, L2, L1-D-MIX-10KG entities (all from operations.md content)
- `POST /query {"mode":"naive", "query":"how often does L1 deliver to L2 by motorbike"}` → returns the actual operations.md chunk citing morning batch + 3x/day delivery + 5min motorbike trip. `bge-m3` chunk vectors are retrievable.

Quality gate `b4c4b023` Q3-A ("what is L1") is now valid again.

### Phase 2: MCP Integration (1 sprint)
- Build `search_knowledge` MCP tool (TypeScript wrapper over REST API)
- Integrate into Chef MCP and Finance MCP
- Namespace isolation: `chef-kb`, `finance-kb`, `shared-kb`
- Add to CLAUDE.md L2 routing: "If agent has LightRAG access, prefer it over full file load"

### Phase 3: Knowledge Expansion (2 sprints)
- Index `knowledge/cooking/` library (193 books, 1.9GB) — chef namespace
- Index `knowledge/industry/` reports — strategy namespace
- Evaluate ingestion cost and optimize (chunk size, extraction model)

### Phase 4: Agent Autonomy (1 sprint)
- Dispatcher uses LightRAG for task routing (domain classification)
- Agents can write `field_notes` that auto-index into LightRAG
- Knowledge graph visualization for CEO/COO review

## 7. Decision: Recommended or Not?

**Recommended: YES, with phased approach.**

Rationale:
1. Shishka agents already need cross-domain knowledge retrieval (spec-ai-native-ops Phase D3)
2. The 1.9GB cooking library is unusable without RAG — too large for context loading
3. LightRAG's PostgreSQL/pgvector backend fits our Supabase stack natively
4. Graph+vector hybrid solves the exact problem our agents face: questions that span bible, domain, and operational knowledge
5. Cost is dramatically lower than GraphRAG (~6000x cheaper per query)

Start with Phase 1 (bible + domain indexing) to validate quality and latency before committing to larger knowledge bases.
