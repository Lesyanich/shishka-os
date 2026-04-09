# LightRAG Secrets

Secrets live in **GCP Secret Manager** (project `shishka-automation-hubs`). They are fetched at container startup by `start.sh` and passed as environment variables to the Docker container. Nothing is persisted to disk on the VM.

## Secret inventory

| Secret name | What | Consumer |
|-------------|------|----------|
| `lightrag-anthropic-key` | Anthropic API key for Claude 3.5 Haiku (LLM extraction + query) | `run-server.sh` → `ANTHROPIC_API_KEY` |
| `lightrag-openai-key` | OpenAI API key for text-embedding-3-small (embeddings) | `run-server.sh` → `OPENAI_API_KEY` |
| `lightrag-database-url` | Supabase PostgreSQL connection string | `run-server.sh` → `DATABASE_URL` |

## How secrets flow

```
GCP Secret Manager
  → start.sh (gcloud secrets versions access)
    → env vars (memory only)
      → docker compose (passes to container)
        → run-server.sh (reads from env)
```

No `.env` files. No local files. No clipboard. No chat/MC comments.

## Managing secrets

```bash
# Read (first 10 chars only — never pipe through sed)
gcloud secrets versions access latest --secret=lightrag-anthropic-key | head -c 10

# Rotate
echo -n "NEW_VALUE" | gcloud secrets versions add lightrag-anthropic-key --data-file=-

# Then restart the container on the VM
gcloud compute ssh shishka-production --zone=us-central1-a \
  --command='cd ~/lightrag && sudo docker compose down && ./start.sh -d'
```

## Local development

For local dev without GCP, export the env vars directly:
```bash
export ANTHROPIC_API_KEY=$(security find-generic-password -a "$USER" -s "shishka-anthropic-api-key" -w)
export OPENAI_API_KEY=$(security find-generic-password -a "$USER" -s "shishka-openAI-api-key" -w)
export DATABASE_URL=$(security find-generic-password -a "$USER" -s "shishka-database-url" -w)
./run-server.sh
```
