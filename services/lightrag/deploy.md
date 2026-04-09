# LightRAG GCP Deployment Runbook

> VM: `shishka-production` (`us-central1-a`, `e2-small`)
> Project: `shishka-automation-hubs`
> Port: `9621` (raw HTTP, firewall-restricted)
> Co-resident: n8n on port 5678 — DO NOT touch

## Prerequisites

1. `gcloud` CLI authenticated with `lesia@shishka.health`
2. GCP Secret Manager API enabled
3. Three secrets created (see "Secret Manager Setup" below)
4. VM service account has `roles/secretmanager.secretAccessor`

## Deploy (first time)

```bash
# 1. Copy files to VM
gcloud compute scp --recurse services/lightrag/ shishka-production:~/lightrag/ \
  --zone=us-central1-a --project=shishka-automation-hubs

# 2. SSH into VM
gcloud compute ssh shishka-production \
  --zone=us-central1-a --project=shishka-automation-hubs

# 3. On the VM: start
cd ~/lightrag
chmod +x start.sh run-server.sh
./start.sh -d

# 4. Verify
curl http://localhost:9621/health
```

## Update (subsequent deploys)

```bash
# From local machine
gcloud compute scp --recurse services/lightrag/ shishka-production:~/lightrag/ \
  --zone=us-central1-a --project=shishka-automation-hubs

# On VM
gcloud compute ssh shishka-production --zone=us-central1-a --project=shishka-automation-hubs \
  --command='cd ~/lightrag && sudo docker compose down && ./start.sh -d'
```

## Health check (from local)

```bash
curl http://34.42.151.172:9621/health
```

## Rollback

```bash
# On VM
cd ~/lightrag
sudo docker compose down
# Restore previous version from backup or git
```

## Secret Manager Setup

> CEO-gated: each `gcloud secrets create` requires CEO approval.

```bash
# 1. Enable Secret Manager API (idempotent)
gcloud services enable secretmanager.googleapis.com \
  --project=shishka-automation-hubs

# 2. Create secrets (CEO provides values interactively — never echo/log them)
# Anthropic key:
security find-generic-password -a "$USER" -s "shishka-anthropic-api-key" -w \
  | gcloud secrets create lightrag-anthropic-key --data-file=- \
    --project=shishka-automation-hubs

# OpenAI key:
security find-generic-password -a "$USER" -s "shishka-openAI-api-key" -w \
  | gcloud secrets create lightrag-openai-key --data-file=- \
    --project=shishka-automation-hubs

# Database URL:
security find-generic-password -a "$USER" -s "shishka-database-url" -w \
  | gcloud secrets create lightrag-database-url --data-file=- \
    --project=shishka-automation-hubs

# 3. Grant VM service account access
VM_SA=$(gcloud compute instances describe shishka-production \
  --zone=us-central1-a --project=shishka-automation-hubs \
  --format='value(serviceAccounts[0].email)')

for S in lightrag-anthropic-key lightrag-openai-key lightrag-database-url; do
  gcloud secrets add-iam-policy-binding $S \
    --member="serviceAccount:$VM_SA" \
    --role="roles/secretmanager.secretAccessor" \
    --project=shishka-automation-hubs
done
```

## Re-ingest knowledge base

```bash
# From local or VM — POST each file to the ingest endpoint
for f in docs/bible/*.md docs/domain/*.md; do
  curl -X POST http://34.42.151.172:9621/documents/text \
    -H "Content-Type: application/json" \
    -d "{\"text\": $(python3 -c "import json,sys; print(json.dumps(open('$f').read()))")}"
done
```

## HTTPS (Phase 2 — not yet implemented)

Phase 1 uses raw HTTP on port 9621. The VM firewall should restrict access to
trusted IPs only (VPN/IAP). For Phase 2, add:
- nginx reverse proxy with Let's Encrypt, OR
- Cloudflare Tunnel (zero-trust, no open port)

Documented as a separate MC task.

## Monitoring

- `/admin/brain/cost` dashboard in admin-panel
- `brain_query_log` table in Supabase — per-query cost tracking
- Docker logs: `sudo docker logs -f lightrag-server`
