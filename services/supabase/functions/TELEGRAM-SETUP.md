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

## 6. Phase B — AI menu Q&A (2026-06-26)

Staff can now send the bot a free-text question and it answers from the DB. New function
`telegram-ai` does the slow LLM work (intent classify + answer) so the webhook can ack
instantly. The webhook's free-text branch sends a "💭" ack and fires `telegram-ai` in the
background — so **`telegram-ai` must be deployed together with the updated webhook**, or
free-text messages get only the ack with no answer.

Prereq: `ANTHROPIC_API_KEY` secret must be set (already used by `ocr-receipt`). Verify:
```bash
supabase secrets list --project-ref qcqgtcsjoacuktcewpvo | grep ANTHROPIC_API_KEY
```

Deploy (new function is server-to-server; no JWT, guarded by the shared secret header):
```bash
cd services
supabase functions deploy telegram-ai --no-verify-jwt --project-ref qcqgtcsjoacuktcewpvo
supabase functions deploy telegram-webhook --no-verify-jwt --project-ref qcqgtcsjoacuktcewpvo
```

Model: `claude-haiku` (cheap/fast). Menu answers read **only `menu_public`** (price / КБЖУ /
ingredients — never cost/margin). Every call logs to `api_cost_log` (`feature='telegram-ai'`).
Task-intake and report-to-owner messages get a "coming soon" reply (Phases C / D).

Verify in Telegram (as a linked staff member): send "сколько калорий в хумусе?" or
"what's in the falafel wrap?" → a concise answer in your language within a few seconds.
Then check a row landed: `select * from api_cost_log where feature='telegram-ai' order by ts desc limit 3;`

## 7. Phase C — AI task intake + owner approval (2026-06-26)

Staff describe a task in free text → the AI structures it → an owner/task_manager
approves & assigns it from Telegram with one tap.

**Apply migration 315 FIRST** (adds the `draft` status; without it the draft insert
fails and the proposer gets an error):
```bash
# via your normal migration flow, or:
psql "$DATABASE_URL" -f services/supabase/migrations/315_staff_tasks_draft_status.sql
```
Then redeploy (same two functions as Phase B):
```bash
cd services
supabase functions deploy telegram-ai --no-verify-jwt --project-ref qcqgtcsjoacuktcewpvo
supabase functions deploy telegram-webhook --no-verify-jwt --project-ref qcqgtcsjoacuktcewpvo
```

Flow: free text classified as `task_intake` → `claude-haiku` extracts
{title, title_th, station, assignee, category, priority, due_date, due_time} (staff
roster injected for name-matching) → inserts a `staff_tasks` row with `status='draft'`
→ DMs every linked **owner/task_manager** a card with `[✅ Approve] [❌ Discard]`.
Approve → if the AI matched an assignee it assigns immediately; otherwise it shows a
person picker → flips `draft`→`todo`, sets `assigned_to`, and DMs the assignee the task
with Start/Done/Snooze. Only owner/task_manager callbacks are honoured.

Drafts are hidden from staff views (today/team exclude `draft`); they may appear on the
admin board only under the "All statuses" filter until approved/discarded.

Verify: as a cook, send "Hein нужно помыть холодильник L1 завтra в 9". As the owner you
get a draft card → Approve → Hein receives the task DM and the row shows on `/staff-tasks`.

## Deploy log

| Date | Function | Action | Notes |
|------|----------|--------|-------|
| 2026-06-10 | `telegram-webhook` | Initial deploy | Staff task tracker Phase 2. `--no-verify-jwt` + secret-token header. |
| 2026-06-10 | `telegram-push` | Initial deploy | Staff task tracker Phase 2. verify_jwt ON. |
| 2026-06-25 | `telegram-webhook` | Phase A | Team-tasks view + filters, ▶️ Start, /team + /board, role-aware "Open full board". |
| 2026-06-25 | `telegram-push` | Phase A | `?action=setup` resets chat menu button (fixes ngrok) + re-asserts webhook. |
| 2026-06-26 | `telegram-ai` | Phase B | NEW. Intent classify + menu Q&A from menu_public via claude-haiku; cost→api_cost_log. |
| 2026-06-26 | `telegram-webhook` | Phase B | Free-text → 💭 ack + fire-and-forget to telegram-ai. |
| 2026-06-26 | mig 315 | Phase C | Add `draft` status to staff_tasks (apply before deploying). |
| 2026-06-26 | `telegram-ai` | Phase C | task_intake → extract + insert draft + DM owners a card. |
| 2026-06-26 | `telegram-webhook` | Phase C | appr/asg/disc draft callbacks (owner/task_manager) → assign DM. |
