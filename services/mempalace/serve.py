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
import sys
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

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
            "/search": lambda: tool_search(
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
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        log.info("Shutting down")
        server.server_close()


if __name__ == "__main__":
    main()
