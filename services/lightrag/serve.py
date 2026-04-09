"""
Custom LightRAG server entrypoint with brain_query_log middleware.

Imports the stock lightrag-server app via create_app(), adds ASGI
middleware that logs every POST /query to Supabase brain_query_log,
then runs uvicorn.

Refs: MC 350a6738, spec-lightrag.md §Observability
"""

import asyncio
import json
import logging
import os
import time
from urllib.parse import urlparse, unquote

import asyncpg
import uvicorn
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger("query_logger")

# --- Cost constants (OpenAI, 2026-04 pricing) ---
# gpt-4o-mini: $0.15/1M input, $0.60/1M output
# text-embedding-3-small: $0.02/1M tokens
LLM_COST_IN = 0.15 / 1_000_000
LLM_COST_OUT = 0.60 / 1_000_000
EMBED_COST = 0.02 / 1_000_000
CHARS_PER_TOKEN = 4  # rough English estimate


def estimate_tokens(text: str) -> int:
    """Rough token count: ~4 chars per token."""
    return max(1, len(text) // CHARS_PER_TOKEN)


def parse_database_url(url: str) -> dict:
    """Parse DATABASE_URL into asyncpg connect kwargs."""
    p = urlparse(url)
    return {
        "host": p.hostname,
        "port": p.port or 5432,
        "user": unquote(p.username or ""),
        "password": unquote(p.password or ""),
        "database": (p.path or "/postgres").lstrip("/") or "postgres",
    }


class QueryLogMiddleware(BaseHTTPMiddleware):
    """Intercept POST /query, log to brain_query_log after response."""

    def __init__(self, app, db_kwargs: dict):
        super().__init__(app)
        self.db_kwargs = db_kwargs
        self._pool = None

    async def _get_pool(self) -> asyncpg.Pool:
        """Lazy pool creation — runs inside uvicorn's event loop."""
        if self._pool is None:
            self._pool = await asyncpg.create_pool(
                **self.db_kwargs, min_size=1, max_size=2
            )
            logger.info("asyncpg pool created for brain_query_log")
        return self._pool

    async def dispatch(self, request: Request, call_next):
        # Only intercept POST /query (not /query/stream, /health, etc.)
        if request.method != "POST" or request.url.path != "/query":
            return await call_next(request)

        # Read request body
        body_bytes = await request.body()
        try:
            req_data = json.loads(body_bytes)
        except (json.JSONDecodeError, UnicodeDecodeError):
            return await call_next(request)

        query_text = req_data.get("query", "")
        query_mode = req_data.get("mode", "naive")
        agent_id = request.headers.get("x-agent-id")

        # Time the request
        t0 = time.monotonic()
        response = await call_next(request)
        latency_ms = int((time.monotonic() - t0) * 1000)

        # Read response body (need to reconstruct for client)
        resp_body = b""
        async for chunk in response.body_iterator:
            if isinstance(chunk, str):
                resp_body += chunk.encode()
            else:
                resp_body += chunk

        # Parse response
        error_text = None
        chunks_returned = 0
        response_text = ""
        if response.status_code == 200:
            try:
                resp_data = json.loads(resp_body)
                response_text = resp_data.get("response", "")
                refs = resp_data.get("references") or []
                chunks_returned = len(refs)
            except (json.JSONDecodeError, UnicodeDecodeError):
                pass
        else:
            error_text = resp_body[:500].decode(errors="replace")

        # Estimate tokens
        embed_tokens = estimate_tokens(query_text)
        if query_mode == "naive":
            llm_tokens_in = 0
            llm_tokens_out = 0
        else:
            llm_tokens_in = embed_tokens + 500  # system prompt estimate
            llm_tokens_out = estimate_tokens(response_text)

        cost_usd = (
            embed_tokens * EMBED_COST
            + llm_tokens_in * LLM_COST_IN
            + llm_tokens_out * LLM_COST_OUT
        )

        # Fire-and-forget INSERT
        asyncio.create_task(
            self._log_query(
                agent_id=agent_id,
                query_mode=query_mode,
                query_preview=query_text[:200] if query_text else None,
                chunks_returned=chunks_returned,
                llm_tokens_in=llm_tokens_in,
                llm_tokens_out=llm_tokens_out,
                embed_tokens=embed_tokens,
                cost_usd=cost_usd,
                latency_ms=latency_ms,
                error=error_text,
            )
        )

        # Reconstruct response with the body we consumed
        return Response(
            content=resp_body,
            status_code=response.status_code,
            headers=dict(response.headers),
            media_type=response.media_type,
        )

    async def _log_query(self, **kwargs):
        try:
            pool = await self._get_pool()
            async with pool.acquire() as conn:
                await conn.execute(
                    """
                    INSERT INTO brain_query_log
                        (agent_id, query_mode, query_preview, chunks_returned,
                         llm_tokens_in, llm_tokens_out, embed_tokens,
                         cost_usd, latency_ms, error)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
                    """,
                    kwargs["agent_id"],
                    kwargs["query_mode"],
                    kwargs["query_preview"],
                    kwargs["chunks_returned"],
                    kwargs["llm_tokens_in"],
                    kwargs["llm_tokens_out"],
                    kwargs["embed_tokens"],
                    kwargs["cost_usd"],
                    kwargs["latency_ms"],
                    kwargs["error"],
                )
        except Exception as e:
            logger.error(f"Failed to log query: {e}")


def main():
    """Custom entrypoint: stock lightrag app + query logging middleware."""
    # Initialize lightrag config (same as stock main())
    from lightrag.api.config import initialize_config
    initialize_config()

    from lightrag.api.lightrag_server import (
        create_app,
        global_args,
        configure_logging,
        update_uvicorn_mode_config,
        display_splash_screen,
        check_env_file,
        check_and_install_dependencies,
    )

    check_env_file()
    check_and_install_dependencies()
    configure_logging()
    update_uvicorn_mode_config()
    display_splash_screen(global_args)

    # Create the stock app
    app = create_app(global_args)

    # --- Add query logging ---
    db_url = os.environ.get("DATABASE_URL", "")
    if not db_url:
        logger.warning("DATABASE_URL not set — query logging disabled")
    else:
        db_kwargs = parse_database_url(db_url)

        import ssl as _ssl
        ssl_ctx = _ssl.create_default_context(
            cafile=os.environ.get(
                "POSTGRES_SSL_ROOT_CERT", "/app/supabase-ca.pem"
            )
        )
        ssl_ctx.check_hostname = False  # verify-ca, not verify-full
        db_kwargs["ssl"] = ssl_ctx

        # Pool created lazily on first query (inside uvicorn's event loop)
        app.add_middleware(QueryLogMiddleware, db_kwargs=db_kwargs)
        logger.info("Query logging middleware active → brain_query_log")

    # Run uvicorn (same as stock main)
    uvicorn_config = {
        "app": app,
        "host": global_args.host,
        "port": global_args.port,
        "log_config": None,
    }
    uvicorn.run(**uvicorn_config)


if __name__ == "__main__":
    main()
