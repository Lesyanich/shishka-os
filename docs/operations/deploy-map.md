# Deploy Map — what serves what (Vercel)

> **Read this before touching anything deploy-related.** One team, TWO Vercel projects,
> TWO repos. Deploying the right code to the wrong project is exactly how the live
> customer site got clobbered on 2026-07-11.

## Topology (verified 2026-07-11 via Vercel MCP)

| What | Domain(s) | Vercel project | Builds from |
|---|---|---|---|
| **LIVE customer site** (brand + menu) | `shishka.health`, `www.shishka.health` | `shishka-web` (`prj_OsHKcipkh7ZYIp3ta8i5lYh1IpY2`) | GitHub `Lesyanich/shishka-health` → `main`, auto-deploy on push. Local checkout: `~/code/shishka-health` |
| **Admin panel** | `shishka-os.vercel.app` | `shishka-os` (`prj_jqAkqZhSKUecsYlAXYNtNaJqmIfL`) | GitHub `Lesyanich/shishka-os` → `main`, root dir `apps/admin-panel` (own `vercel.json`: chef api functions, SPA rewrites) |
| QR order-intake app (`apps/web`) | — none yet | — no project yet | **Not deployed.** Ships with initiative `52efcf1e`; when the time comes it needs its OWN Vercel project — never `shishka-web` |
| KDS (`apps/kds`) | — | — | Not deployed to Vercel |

Team: `lesyanichs-projects` (`team_qrm1fZ0EMm7XnL3wfxV5rQxQ`). The Vercel MCP is
authorized on the CEO's claude.ai account — `get_project` / `list_deployments` work by
slug + teamId (note: `list_projects` returns empty on this connector; query by slug).

## Hard rules

1. **Agents NEVER run `vercel deploy` / `vercel --prod`** (CLI upload) against any
   project, and never re-point domains, without an explicit CEO instruction *naming the
   target project*. Live-site changes ship ONLY via git push to `Lesyanich/shishka-health`
   `main`. (Same spirit as the CEO-only edge-function deploy rule.)
2. **Code for the live site belongs in the `shishka-health` repo.** `shishka-os/apps/web`
   is a different product (QR ordering). "The UI looks the same" ≠ same deployment target.
3. **Rollback = Promote a previous git deployment** (instant, no rebuild) — not a hot-fix
   commit under time pressure, and never a CLI deploy.

## Incident runbook — "the site is broken"

Symptom-first, diff-second. The diff is a honeypot: reason **domain → project →
deployment → repo**, never code → domain.

1. **Fingerprint (30 s):**
   `curl -s https://shishka.health/ | grep -o '<title>[^<]*</title>'`
   Known-good title: `Shishka Healthy Kitchen — Menu`. A different title means a
   different APP is deployed — not a styling bug. Also note the bundle hash
   (`/assets/index-*.js`) and `etag` from `curl -sI`.
2. **Topology before code.** What is the CURRENT production deployment of `shishka-web`,
   when was it created, and what is its SOURCE (git commit sha vs `vercel deploy` CLI)?
   - Vercel MCP: `get_project(projectId: "shishka-web", teamId: "team_qrm1fZ0EMm7XnL3wfxV5rQxQ")`,
     then `list_deployments(...)` for history.
   - ⚠️ `latestDeployment` in `get_project` = most recently **created** deployment,
     NOT what the domain serves. The domain follows the *promoted* deployment — check
     the dashboard "Current" badge or the deployments list.
   - Dashboard: `vercel.com/lesyanichs-projects/shishka-web` → Deployments. The source
     column shows a commit sha for git deploys vs `vercel deploy` for CLI uploads.
3. **Restore:** Promote the last-good **git** deployment (row ⋯ → Promote). The confirm
   dialog must list `shishka.health` in the re-aliased domains. Takes seconds, no rebuild.
4. **Only now** do git forensics / reverts — in the repo that actually feeds the project.
5. **Verify:** title + etag changed on the domain; grep the served JS for the offending
   strings (`curl -s https://shishka.health$JS_PATH | grep -o '<marker>'`).
6. **Two-poll rule:** a verification poll returning the identical result twice in a row →
   STOP polling. Your topology assumption is wrong — go back to step 2.
7. **Log it:** MC task + agent memory; update this file if the topology changed.

> Origin: 2026-07-11. A parallel session built salads + a mini-game in
> `shishka-os/apps/web` and pushed it onto the live site with CLI `vercel deploy`
> (3 failed prod deploys, the 4th replaced shishka.health entirely). Recovery was a
> one-click Promote of `10a01aa` (Jul 5) — but diagnosis cost ~25 extra minutes because
> this map didn't exist and reasoning ran code→domain. Post-mortem PRs: os#495 (git
> revert of the stray code), this doc.

## Failure signatures (seen in the wild)

### All builds ERROR at the clone step — `Root Directory "apps/web" does not exist`

Origin: 2026-07-25 (MC `77788edc`). shishka.health was frozen on the 2026-07-05 build
for ~3 weeks: EVERY git build of `shishka-health` had silently ERRORed since mid-July,
at the very first step —

```
Cloning github.com/Lesyanich/shishka-health …
The specified Root Directory "apps/web" does not exist. Please update your Project Settings.
```

- **Cause:** the `shishka-web` project's **Root Directory** setting was set to `apps/web` —
  a `shishka-os`-shaped path (that repo has `apps/web`; `shishka-health` is a FLAT Vite app
  built from the repo root). Almost certainly a spillover from the 2026-07-11 CLI-incident
  cleanup, when the two repos/projects were confused.
- **Why it hid for weeks:** the build dies *before* install/vite runs, so (a) the `errorsOnly`
  build-log filter returns NOTHING — you must read the full log **tail**; (b) local
  `npm run build` is CLEAN (Root Directory is a Vercel-only setting, absent locally);
  (c) DB-driven content (`menu_public`) keeps updating live at runtime, so only CODE/COPY
  silently froze while the menu still looked fresh.
- **Fix (CEO-only):** Settings → Build & Deployment → **Root Directory → clear it**
  (empty = repo root) → Save → Redeploy latest `main`. `vercel.json` at the repo root already
  carries buildCommand/outputDirectory/framework, so clearing Root Directory is necessary AND
  sufficient — `vercel.json` can override build/install/output but NOT Root Directory (that's
  resolved before `vercel.json` is read).
- **Verify:** `curl -s "https://shishka.health/?cb=$(date +%s)"` → new `/assets/index-*.js`
  hash + expected copy; `x-vercel-cache: MISS` confirms it's fresh, not edge-cached.
