# Supabase Edge Functions — Deployment Guide

## Prerequisites

- `OPENAI_API_KEY` must be set in Supabase Secrets:
  ```bash
  supabase secrets set OPENAI_API_KEY=sk-proj-YOUR_KEY_HERE
  ```

## Deploy: parse-receipts

### Option A: Supabase Dashboard (Recommended)

1. Go to https://supabase.com/dashboard/project/qcqgtcsjoacuktcewpvo/functions
2. Click **"Create a new function"**
3. Name: `parse-receipts`
4. Paste contents of `parse-receipts/index.ts`
5. Click **"Deploy"**
6. Verify JWT: **enabled** (default)

### Option B: Supabase CLI

```bash
# Install CLI if needed
npm install -g supabase

# Link to project
supabase link --project-ref qcqgtcsjoacuktcewpvo

# Deploy function
supabase functions deploy parse-receipts --project-ref qcqgtcsjoacuktcewpvo
```

## Test with curl

```bash
curl -X POST \
  'https://qcqgtcsjoacuktcewpvo.supabase.co/functions/v1/parse-receipts' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "image_urls": [
      "https://qcqgtcsjoacuktcewpvo.supabase.co/storage/v1/object/public/receipts/supplier/test.jpg"
    ]
  }'
```

## Expected Response

```json
{
  "supplier_name": "Makro Food Service",
  "invoice_number": "INV-2026-0342",
  "total_amount": 4520.00,
  "currency": "THB",
  "transaction_date": "2026-03-10",
  "food_items": [...],
  "capex_items": [...],
  "opex_items": [...]
}
```
