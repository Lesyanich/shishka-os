#!/usr/bin/env python3
"""
MemPalace HTTP API — thin REST wrapper over MCP tool functions.

Mirrors the LightRAG serve.py pattern: local HTTP server that the
admin-panel can query from the browser.

Usage:
    cd services/mempalace
    .venv/bin/python serve.py          # default :9622
    .venv/bin/python serve.py --port 9622

Endpoints (all GET, JSON responses):
    /health
    /status
    /wings
    /rooms?wing=X
    /taxonomy
    /drawers?wing=X&room=Y
    /search?q=TEXT&wing=X&room=Y&limit=N
"""

import argparse
import json
import logging
import os
import sys
import threading
import time
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from urllib.request import Request as HttpReq, urlopen
from urllib.error import URLError

# Add parent venv's packages to path
from mempalace.mcp_server import (
    tool_status,
    tool_list_wings,
    tool_list_rooms,
    tool_get_taxonomy,
    tool_search,
    _get_collection,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s", stream=sys.stderr)
log = logging.getLogger("mempalace-api")

DEFAULT_PORT = 9622

# ── Brain query logging (L1) ────────────────────────────────────────

_SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
_SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")


def _compute_quality_score(results: list) -> tuple[int, bool]:
    """Heuristic quality score for L1 search results (spec §3 Tier 0)."""
    if not results:
        return 1, True
    best_sim = results[0].get("similarity", -1.0)
    # ChromaDB cosine distance: closer to 0 = better match, negative = distance
    if best_sim > -0.3:
        score = 5
    elif best_sim > -0.5:
        score = 4
    elif best_sim > -0.7:
        score = 3
    elif best_sim > -0.9:
        score = 2
    else:
        score = 1
    if len(results) < 2:
        score = max(1, score - 1)
    return score, score <= 2


def _log_l1_query(query: str, results: list, latency_ms: int):
    """Fire-and-forget INSERT into brain_query_log via Supabase REST API."""
    if not _SUPABASE_URL or not _SUPABASE_KEY:
        return

    quality_score, is_gap = _compute_quality_score(results)
    first_text = results[0].get("text", "")[:500] if results else None

    row = {
        "layer": "L1",
        "agent_id": None,
        "query_mode": "semantic",
        "query_preview": query[:200] if query else None,
        "chunks_returned": len(results),
        "response_preview": first_text,
        "quality_score": quality_score,
        "quality_source": "heuristic",
        "is_gap": is_gap,
        "latency_ms": latency_ms,
        "llm_tokens_in": 0,
        "llm_tokens_out": 0,
        "embed_tokens": max(1, len(query) // 4) if query else 0,
        "cost_usd": 0,
    }

    def _do_insert():
        try:
            url = f"{_SUPABASE_URL}/rest/v1/brain_query_log"
            body = json.dumps(row).encode()
            req = HttpReq(url, data=body, method="POST")
            req.add_header("apikey", _SUPABASE_KEY)
            req.add_header("Authorization", f"Bearer {_SUPABASE_KEY}")
            req.add_header("Content-Type", "application/json")
            req.add_header("Prefer", "return=minimal")
            urlopen(req, timeout=5)
        except (URLError, OSError) as e:
            log.warning("L1 query log failed: %s", e)

    threading.Thread(target=_do_insert, daemon=True).start()


def _list_drawers(wing: str = None, room: str = None):
    """List all drawers with metadata and content preview."""
    col = _get_collection()
    if not col:
        return {"error": "No palace found"}

    kwargs = {"include": ["metadatas", "documents"]}
    where_clauses = []
    if wing:
        where_clauses.append({"wing": wing})
    if room:
        where_clauses.append({"room": room})

    if len(where_clauses) == 2:
        kwargs["where"] = {"$and": where_clauses}
    elif len(where_clauses) == 1:
        kwargs["where"] = where_clauses[0]

    try:
        results = col.get(**kwargs)
    except Exception as e:
        return {"error": str(e)}

    drawers = []
    for i, drawer_id in enumerate(results["ids"]):
        meta = results["metadatas"][i]
        doc = results["documents"][i]
        drawers.append({
            "id": drawer_id,
            "wing": meta.get("wing", "unknown"),
            "room": meta.get("room", "unknown"),
            "source_file": meta.get("source_file", ""),
            "added_by": meta.get("added_by", ""),
            "filed_at": meta.get("filed_at", ""),
            "content_preview": doc[:200] if doc else "",
            "content": doc or "",
        })

    drawers.sort(key=lambda d: d.get("filed_at", ""), reverse=True)
    return {"drawers": drawers, "count": len(drawers)}


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/")
        params = parse_qs(parsed.query)

        def p(key, default=None):
            vals = params.get(key, [])
            return vals[0] if vals else default

        routes = {
            "/health": lambda: {"status": "ok", "service": "mempalace-api"},
            "/status": tool_status,
            "/wings": tool_list_wings,
            "/rooms": lambda: tool_list_rooms(wing=p("wing")),
            "/taxonomy": tool_get_taxonomy,
            "/drawers": lambda: _list_drawers(wing=p("wing"), room=p("room")),
            "/search": lambda: self._search_with_log(
                query=p("q", ""),
                limit=int(p("limit", "10")),
                wing=p("wing"),
                room=p("room"),
            ),
        }

        handler = routes.get(path)
        if not handler:
            self._json(404, {"error": "not found", "endpoints": list(routes.keys())})
            return

        try:
            result = handler()
            # Strip protocol/aaak from status to save bandwidth
            if path == "/status" and isinstance(result, dict):
                result.pop("protocol", None)
                result.pop("aaak_dialect", None)
            self._json(200, result)
        except Exception as e:
            log.exception("Handler error")
            self._json(500, {"error": str(e)})

    def _search_with_log(self, query: str, limit: int, wing: str = None, room: str = None):
        t0 = time.monotonic()
        result = tool_search(query=query, limit=limit, wing=wing, room=room)
        latency_ms = int((time.monotonic() - t0) * 1000)
        results_list = result.get("results", []) if isinstance(result, dict) else []
        _log_l1_query(query, results_list, latency_ms)
        return result

    def _json(self, code, data):
        body = json.dumps(data, ensure_ascii=False, default=str).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        log.info(f"{self.address_string()} {fmt % args}")


def main():
    parser = argparse.ArgumentParser(description="MemPalace HTTP API")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    args = parser.parse_args()

    server = HTTPServer(("127.0.0.1", args.port), Handler)
    log.info(f"MemPalace API listening on http://127.0.0.1:{args.port}")
    if _SUPABASE_URL and _SUPABASE_KEY:
        log.info("L1 query logging active → brain_query_log")
    else:
        log.warning("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not set — L1 query logging disabled")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        log.info("Shutting down")
        server.server_close()


if __name__ == "__main__":
    main()
