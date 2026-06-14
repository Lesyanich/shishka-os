# Telegram Staff Task Tracker — Setup Runbook (Phase 2)

Bot: **@Shishka_Kitchen_bot**. Functions: `telegram-webhook` (inbound) + `telegram-push` (outbound).
All commands run from the `services/` directory (so `supabase/functions/...` resolves).

> ⚠️ The bot token must NEVER be committed. It lives only in Supabase Secrets.
> The token shared in chat should be **revoked & reissued** via @BotFather (`/revoke`)
> once setup is verified, then re-set as the `TELEGRAM_BOT_TOKEN` secret.

## 1. Set secrets (DONE 2026-06-10 — token + webhook secret are set)

```bash
cd services
WEBHOOK_SECRET=$(openssl rand -hex 32)
echo "WEBHOOK_SECRET=$WEBHOOK_SECRET"   # copy this for step 3

supabase secrets set --project-ref qcqgtcsjoacuktcewpvo \
  TELEGRAM_BOT_TOKEN='<PASTE_BOT_TOKEN>' \
  TELEGRAM_WEBHOOK_SECRET="$WEBHOOK_SECRET"

# Optional, once a staff group chat exists (add the bot, then read its chat id):
# supabase secrets set --project-ref qcqgtcsjoacuktcewpvo TELEGRAM_GROUP_CHAT_ID='-100xxxxxxxxxx'
```

## 2. Deploy functions

```bash
cd services
# Inbound webhook — Telegram can't send a JWT, so disable JWT and rely on the secret header
supabase functions deploy telegram-webhook --no-verify-jwt --project-ref qcqgtcsjoacuktcewpvo
# Outbound push — keep verify_jwt ON (admin session token + cron service-role key both pass)
supabase functions deploy telegram-push --project-ref qcqgtcsjoacuktcewpvo
```

## 3. Register the webhook with Telegram (DONE 2026-06-10)

```bash
curl -s "https://api.telegram.org/bot<PASTE_BOT_TOKEN>/setWebhook" \
  -H 'Content-Type: application/json' \
  -d "{
    \"url\": \"https://qcqgtcsjoacuktcewpvo.supabase.co/functions/v1/telegram-webhook\",
    \"secret_token\": \"$WEBHOOK_SECRET\",
    \"allowed_updates\": [\"message\", \"callback_query\"]
  }"

curl -s "https://api.telegram.org/bot<PASTE_BOT_TOKEN>/getWebhookInfo"
```

## 4. End-to-end test

1. Admin → **/staff-tasks → Telegram** tab → "Generate link" for yourself → open the
   `t.me/Shishka_Kitchen_bot?start=…` link in your Telegram → bot replies "✅ Connected".
2. Create a one-off task assigned to yourself with **Send to Telegram now** checked →
   you get a DM with **✅ Done / ⏰ Snooze** buttons.
3. Tap **✅ Done** → the message updates and the task flips to *done* live in the admin board.

## Deploy log

| Date | Function | Action | Notes |
|------|----------|--------|-------|
| 2026-06-10 | `telegram-webhook` | Initial deploy | Staff task tracker Phase 2. `--no-verify-jwt` + secret-token header. |
| 2026-06-10 | `telegram-push` | Initial deploy | Staff task tracker Phase 2. verify_jwt ON. |
