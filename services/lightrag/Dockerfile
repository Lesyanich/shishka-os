# LightRAG server — Anthropic Haiku (LLM) + OpenAI (embeddings)
# Phase 2 deployment to GCP VM alongside n8n.
#
# Refs: MC 350a6738, spec-lightrag.md

FROM python:3.11-slim

WORKDIR /app

# System deps for asyncpg SSL + health checks
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Pin lightrag-hku with API server support
RUN pip install --no-cache-dir 'lightrag-hku[api]==1.4.13' asyncpg

# Copy server files
COPY run-server.sh /app/run-server.sh
COPY serve.py /app/serve.py
COPY supabase-ca.pem /app/supabase-ca.pem
RUN chmod +x /app/run-server.sh

# Graph file storage (NetworkX) mounted as volume
RUN mkdir -p /var/lib/lightrag-rag-storage

EXPOSE 9621

CMD ["/app/run-server.sh"]
