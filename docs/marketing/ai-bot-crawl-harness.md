# AI-bot crawl harness — WP-8 measurement (A3)

> Companion to [`geo-aio-plan.md`](geo-aio-plan.md) § 5 ("AI-bot crawl logs") and
> [`aeo-kickoff-2026-07.md`](aeo-kickoff-2026-07.md) § 3 A3. Owning task: WP-8 `6bb7b218`
> (this doc is a contribution, not a claim). First run: 2026-07-27.

## TL;DR

**The harness the plan specified — "Vercel request logs filtered to UA `GPTBot|ClaudeBot|…`" —
is not runnable on `shishka-web` as the project stands.** Vercel access itself is fine; the logs
simply do not exist. `shishka-web` is a pure static Vite build with zero functions, so it emits
zero runtime logs, and static/edge request logs are not queryable on this plan. A working
substitute is designed in § 4 and costs ~40 lines of code inside the WP-4 branch.

Until that lands, bot *reachability* is measured by the A4 curl check (§ 3), and bot *behaviour*
is not measured at all. Do not report "0 bot hits" as a finding — we have no instrument.

## 1. What was verified (2026-07-27, ~06:00 UTC / 13:00 ICT)

| Check | Result |
|---|---|
| Vercel MCP auth | **OK** — team `team_qrm1fZ0EMm7XnL3wfxV5rQxQ` ("lesyanich's projects") resolves |
| Project resolves | **OK** — `shishka-web` `prj_OsHKcipkh7ZYIp3ta8i5lYh1IpY2`, framework `vite`, domains incl. `shishka.health` |
| Runtime logs, `since: 7d`, `group_by: requestPath` | **empty table** — zero rows |
| Runtime logs, `since: 30d`, unfiltered | "No logs found… window likely exceeds your plan's runtime-log retention" |
| Runtime logs, `since: 1h`, unfiltered | **"No logs found"** — despite 8 real requests fired at the origin minutes earlier (§ 3) |
| Web Analytics | **404 `Web Analytics not found`** — not enabled on the project |

**Root cause is architectural, not permissions.** Vercel *runtime* logs capture function
invocations (serverless / edge / middleware). `shishka-web` has none: `vercel.json` is a static
build plus two rewrites (`/sb/:path*` → Supabase, `/(.*)` → `/index.html`). Every request is a
static-asset hit served from the edge cache, which never produces a runtime log line. The 1-hour
window is the decisive evidence — eight requests, zero lines, no retention excuse.

Web Analytics would not help even if enabled: it is a client-side JS beacon, and AI crawlers do
not execute JS. It measures humans, by construction.

## 2. The query, for the record

If Observability Plus is ever purchased (§ 4c), this is the call — it stays correct, it just has
nothing to return today. Via Vercel MCP:

```jsonc
// tool: get_runtime_logs
{
  "teamId":      "team_qrm1fZ0EMm7XnL3wfxV5rQxQ",
  "projectId":   "prj_OsHKcipkh7ZYIp3ta8i5lYh1IpY2",
  "environment": "production",
  "since":       "7d",
  "query":       "GPTBot",        // repeat per bot — the API takes one full-text term
  "group_by":    "requestPath"    // → hits per path; drop it for individual lines
}
```

Bots to sweep, one call each: `GPTBot` · `ClaudeBot` · `PerplexityBot` · `OAI-SearchBot` ·
`Google-Extended`. Success signal per plan § 5 = hits on `/menu` and the intent pages, **not
just `/`**.

## 3. First numbers (2026-07-27)

Nothing to report from logs — see § 1. What *is* measurable today is reachability (item A4),
run from a Phuket IP against production:

| Bot UA | `GET https://shishka.health/` | Body |
|---|---|---|
| GPTBot/1.2 | **200** | 677 B |
| ClaudeBot/1.0 | **200** | 677 B |
| PerplexityBot/1.0 | **200** | 677 B |
| OAI-SearchBot/1.0 | **200** | 677 B |
| Google-Extended | **200** | 677 B |

No Vercel Firewall challenge, no 403, `x-vercel-cache: HIT`, `server: Vercel`. **WP-0's bot-200
acceptance criterion passes.**

Two findings fell out of the same pass, both material to WP-4:

1. **677 bytes is the empty SPA shell.** `<div id="root"></div>` plus a module script — no menu,
   no prices, no text, no JSON-LD. `/menu` returns the identical 677 bytes. This is the plan's
   core diagnosis, re-confirmed on live production 12 days later. Reachability without content is
   not visibility: every bot above got a 200 and learned nothing.
2. **`/robots.txt`, `/sitemap.xml` and `/llms.txt` all return that same HTML with
   `content-type: text/html`.** They do not exist. `public/` in `shishka-health` contains only
   `assets/`, and the `/(.*) → /index.html` catch-all rewrite serves the SPA for every unmatched
   path — so these are *soft-200s*, not 404s. The PR #33 "keepers" (robots.txt AI-crawler allows,
   llms.txt) were never shipped anywhere; they exist only as a harvest list. A soft-200 HTML body
   at `/sitemap.xml` is worse than absence — it is an unparseable answer to a well-formed
   question. Fix is trivial (drop real files into `public/`; Vercel serves static before
   rewrites) and belongs in the WP-4 branch.

## 4. Recommended harness — edge middleware → Supabase sink

Ranked options; (a) is the recommendation.

**(a) Middleware + Supabase table.** Add `middleware.ts` to `shishka-health`; on an AI-bot UA,
fire-and-forget an insert into a Supabase table. Unlimited retention, plain SQL, zero recurring
cost, and it produces the per-path breakdown the plan actually asked for.

```ts
// middleware.ts — sketch, not yet implemented
export const config = { matcher: ['/((?!assets|sb|_vercel|.*\\.[a-z0-9]+$).*)'] }

const BOTS = /GPTBot|ClaudeBot|PerplexityBot|OAI-SearchBot|Google-Extended|Applebot-Extended|CCBot|Bytespider/i

export default function middleware(req: Request) {
  const ua = req.headers.get('user-agent') ?? ''
  const bot = ua.match(BOTS)?.[0]
  if (bot) {
    // fire-and-forget; never block or slow the response
    fetch(`${SUPABASE_URL}/rest/v1/ai_bot_hits`, {
      method: 'POST',
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ bot, path: new URL(req.url).pathname, ua }),
    }).catch(() => {})
  }
}
```

```sql
-- table (migration to be written in the shishka-os repo)
create table public.ai_bot_hits (
  id      bigserial primary key,
  hit_at  timestamptz not null default now(),
  bot     text        not null,
  path    text        not null,
  ua      text
);
create index on public.ai_bot_hits (hit_at desc);
-- writes come from the edge with an insert-only role; nobody else writes this table

-- THE WEEKLY QUERY (run every Monday; log the output on WP-8)
select bot,
       path,
       count(*) as hits,
       max(hit_at) as last_seen
from public.ai_bot_hits
where hit_at >= now() - interval '7 days'
group by bot, path
order by hits desc;
```

Caveats to respect when implementing: keep the `matcher` narrow so middleware does not run on
every asset (cost + latency); never await the insert; the insert role must be insert-only, not
`service_role`; and this is a **new** runtime surface on a site that currently has none — it must
ship and be verified inside the WP-4 branch, via git push to `Lesyanich/shishka-health` `main`
only (deploy-map hard rule).

**(b) Vercel Log Drains** → needs Pro plus an external sink to run and pay for. Strictly more
moving parts than (a) for the same answer.

**(c) Observability Plus** (paid Vercel add-on) → makes § 2's query work against edge requests
with no code at all. Cleanest if the budget is already there; a CEO call, not an agent call.

**(d) Do nothing, rely on the prompt panel.** The panel measures outcomes (are we in the answer?),
which is what actually matters; crawl logs only diagnose *why*. Defensible if (a) slips — but then
say so explicitly rather than leaving a checkbox looking satisfied.

## 5. Cadence

Weekly, Mondays, alongside the monthly prompt-panel run (next: **2026-08-01**, service hours
09:00–18:30 ICT, Phuket IP, logged out). Post each week's table as a comment on WP-8 `6bb7b218`.
Re-run the A4 curl check monthly — a Firewall rule added later would silently undo it.
