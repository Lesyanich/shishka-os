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

## 5. Phase A — team tasks + fix the dead "Kitchen" / ngrok menu button (2026-06-25)

Phase A adds a **👥 Team tasks** view (colleagues' tasks for today, filterable by
station/person), a **🗂 Open full board** deep-link into the deployed admin panel
(role-aware: owner/task_manager → `/staff-tasks`, cook → `/kitchen/my-tasks`), and a
**▶️ Start** button on task DMs.

The reported `ERR_NGROK_3200` on a "Kitchen" button is a stale BotFather **chat menu
button** pointing at a dead free-ngrok dev tunnel. It is NOT in the repo — it was set
out-of-band. Fix it (and re-assert the webhook) with the new idempotent `setup` action:

```bash
cd services
# Redeploy the two changed functions (new menu rows, team view, setup action)
supabase functions deploy telegram-webhook --no-verify-jwt --project-ref qcqgtcsjoacuktcewpvo
supabase functions deploy telegram-push --project-ref qcqgtcsjoacuktcewpvo

# Reset the menu button to the native commands list (kills the ngrok web_app button),
# re-register /today /team /add /done commands, and re-assert the webhook + secret.
# telegram-push has verify_jwt ON, so call it with the project SERVICE_ROLE key as Bearer:
curl -s -X POST "https://qcqgtcsjoacuktcewpvo.supabase.co/functions/v1/telegram-push?action=setup" \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>"
# Response echoes menu_button_before/after — confirm `after` is { type: "commands" }.
```

Verify in Telegram: the ☰ menu now lists commands (no broken web view); tap
**👥 Team tasks** → see everyone's tasks for today with `[All][L1][L2][Gen][👤]` filters;
tap **🗂 Open full board** → opens the admin panel (sign in with name + PIN).

## Deploy log

| Date | Function | Action | Notes |
|------|----------|--------|-------|
| 2026-06-10 | `telegram-webhook` | Initial deploy | Staff task tracker Phase 2. `--no-verify-jwt` + secret-token header. |
| 2026-06-10 | `telegram-push` | Initial deploy | Staff task tracker Phase 2. verify_jwt ON. |
| 2026-06-25 | `telegram-webhook` | Phase A | Team-tasks view + filters, ▶️ Start, /team + /board, role-aware "Open full board". |
| 2026-06-25 | `telegram-push` | Phase A | `?action=setup` resets chat menu button (fixes ngrok) + re-asserts webhook. |
