#!/usr/bin/env python
"""
Option E injection — feed Claude-pre-extracted operations.md custom_kg into
the running Supabase-backed LightRAG workspace.

Why this script exists:
  docs/bible/operations.md deterministically crashed both local extractors on
  this Mac — gemma4:e2b hit a ggml-metal command-buffer fatal on dense
  equipment codes (upstream llama.cpp bug), and qwen3:4b walled out on an
  httpx.ReadTimeout inside the ollama SDK (TIMEOUT env does not propagate
  into httpx.AsyncClient). Both are upstream, out-of-scope to patch.

  Per COO decision 1ab81a16 (2026-04-08), the fallback is Option E: have
  Claude do the entity/relation extraction in-conversation, dump to JSON,
  and inject via LightRAG.ainsert_custom_kg — bypassing the Ollama
  extractor entirely for this one file. The existing 18 bible+domain docs
  indexed via gemma4:e2b are NOT touched.

  lightrag-hku 1.4.13 does NOT expose /insert_custom_kg over REST, so this
  has to go through the Python API. lightrag-server holds a write-lock on
  the NetworkX graph file, so the server MUST be stopped before running.

Pre-flight:
  1. `pkill -f lightrag-server` (release NetworkX graph lock)
  2. `ollama serve` still running on :11434
  3. services/lightrag/db-url.local populated with session-pooler URI :5432
  4. services/lightrag/custom_kg_operations.json present
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
from pathlib import Path
from urllib.parse import unquote, urlparse

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent.parent
DB_URL_FILE = SCRIPT_DIR / "db-url.local"
CA_FILE = SCRIPT_DIR / "supabase-ca.pem"
WORKING_DIR = SCRIPT_DIR / "rag_storage"
KG_FILE = SCRIPT_DIR / "custom_kg_operations.json"

FULL_DOC_ID = "doc-operations-md-claude"


def _load_database_url() -> str:
    if not DB_URL_FILE.exists():
        sys.exit(f"ERROR: {DB_URL_FILE} not found")
    for line in DB_URL_FILE.read_text().splitlines():
        line = line.strip()
        if line.startswith("DATABASE_URL"):
            val = line.split("=", 1)[1].strip().strip('"').strip("'")
            return val
    sys.exit(f"ERROR: DATABASE_URL not in {DB_URL_FILE}")


def _populate_env() -> None:
    """Mirror run-server.sh env setup so LightRAG PG* storages read the
    same Supabase pooler, same workspace, same bindings."""
    db_url = _load_database_url()
    p = urlparse(db_url)
    if p.scheme not in ("postgres", "postgresql"):
        sys.exit(f"ERROR: unexpected scheme {p.scheme!r} in DATABASE_URL")

    os.environ["DATABASE_URL"] = db_url
    os.environ["POSTGRES_HOST"] = p.hostname or ""
    os.environ["POSTGRES_PORT"] = str(p.port or 5432)
    os.environ["POSTGRES_USER"] = unquote(p.username or "")
    os.environ["POSTGRES_PASSWORD"] = unquote(p.password or "")
    os.environ["POSTGRES_DATABASE"] = (p.path or "/postgres").lstrip("/") or "postgres"
    os.environ["POSTGRES_WORKSPACE"] = "lightrag"

    # Supabase pooler private CA — same as run-server.sh
    os.environ["POSTGRES_SSL_MODE"] = "verify-ca"
    os.environ["POSTGRES_SSL_ROOT_CERT"] = str(CA_FILE)

    # Storage backends — identical to run-server.sh
    os.environ["LIGHTRAG_KV_STORAGE"] = "PGKVStorage"
    os.environ["LIGHTRAG_VECTOR_STORAGE"] = "PGVectorStorage"
    os.environ["LIGHTRAG_DOC_STATUS_STORAGE"] = "PGDocStatusStorage"
    os.environ["LIGHTRAG_GRAPH_STORAGE"] = "NetworkXStorage"

    # LLM + embedding bindings — gemma4:e2b is NOT actually called during
    # ainsert_custom_kg (Claude already did the extraction), but the
    # LightRAG instance still requires a valid llm_model_func to construct.
    os.environ["LLM_BINDING"] = "ollama"
    os.environ["LLM_BINDING_HOST"] = "http://localhost:11434"
    os.environ["LLM_MODEL"] = "gemma4:e2b"
    os.environ["EMBEDDING_BINDING"] = "ollama"
    os.environ["EMBEDDING_BINDING_HOST"] = "http://localhost:11434"
    os.environ["EMBEDDING_MODEL"] = "bge-m3"
    os.environ["EMBEDDING_DIM"] = "1024"

    os.environ["MAX_PARALLEL_INSERT"] = "1"
    os.environ["TIMEOUT"] = "600"


async def _main() -> None:
    _populate_env()

    # Import AFTER env is set — several LightRAG modules read env at import.
    from lightrag import LightRAG
    from lightrag.kg.shared_storage import initialize_pipeline_status
    from lightrag.llm.ollama import ollama_embed, ollama_model_complete
    from lightrag.utils import EmbeddingFunc

    # CRITICAL: PGVectorStorage derives the table suffix from
    # embedding_func.model_name (see postgres_impl.py::_generate_collection_suffix).
    # The stock `ollama_embed` singleton ships with model_name="bge-m3:latest"
    # which yields tables `LIGHTRAG_VDB_*_bge_m3_latest_1024d`. The running
    # lightrag-server, however, wraps the embed call inside a fresh
    # EmbeddingFunc(model_name=os.environ["EMBEDDING_MODEL"]) — producing
    # `LIGHTRAG_VDB_*_bge_m3_1024d`. If we don't match that exactly the
    # custom_kg lands in a parallel table family the server can't see.
    embed_func = EmbeddingFunc(
        embedding_dim=1024,
        func=ollama_embed.func,
        max_token_size=ollama_embed.max_token_size,
        model_name="bge-m3",
    )

    if not KG_FILE.exists():
        sys.exit(f"ERROR: {KG_FILE} not found")
    kg_raw: dict = json.loads(KG_FILE.read_text())
    meta = kg_raw.pop("_meta", {})

    n_chunks = len(kg_raw.get("chunks", []))
    n_entities = len(kg_raw.get("entities", []))
    n_rels = len(kg_raw.get("relationships", []))
    print(
        f"[inject] loaded custom_kg: chunks={n_chunks} entities={n_entities} "
        f"relationships={n_rels}"
    )
    if meta:
        print(f"[inject] _meta (stripped before insert): {meta}")

    WORKING_DIR.mkdir(exist_ok=True)

    rag = LightRAG(
        working_dir=str(WORKING_DIR),
        workspace="lightrag",
        kv_storage="PGKVStorage",
        vector_storage="PGVectorStorage",
        doc_status_storage="PGDocStatusStorage",
        graph_storage="NetworkXStorage",
        llm_model_func=ollama_model_complete,
        llm_model_name="gemma4:e2b",
        llm_model_kwargs={"host": "http://localhost:11434"},
        embedding_func=embed_func,
    )
    await rag.initialize_storages()
    await initialize_pipeline_status()
    try:
        print(
            f"[inject] ainsert_custom_kg full_doc_id={FULL_DOC_ID!r} ..."
        )
        await rag.ainsert_custom_kg(kg_raw, full_doc_id=FULL_DOC_ID)
        print("[inject] ainsert_custom_kg OK")
    finally:
        await rag.finalize_storages()
    print("[inject] done")


if __name__ == "__main__":
    asyncio.run(_main())
