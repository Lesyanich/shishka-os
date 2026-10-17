# AEO Execution Kickoff — handoff spec (2026-07-27)

> **What this is:** the execution handoff for the AEO/GEO epic — current state, the 4 CEO
> decisions that gate everything, and two sprints with acceptance criteria, packaged so a
> fresh session can pick it up with zero conversation context.
> **What this is NOT:** a replacement for the strategy. The strategy SSoT remains
> [`docs/marketing/geo-aio-plan.md`](geo-aio-plan.md) (levers, evidence, WP definitions,
> measurement protocol). Read that first; this file tells you what to do *next* and why.

**MC map:** epic `9ced1036` (AEO/GEO) · CEO decision packet `cfd30575` (human, critical) ·
Sprint A executor `8c4b50c4` (code, high) · WP-4 prerender `47b6ef32` · WP-8 measurement
`6bb7b218` · WP-1 GBP `a91c473a` · Potato-Tacos revamp (external dependency) `abe7301a`.

---

## 1. State snapshot (verified 2026-07-25 → 27)

| Fact | Status | Evidence |
|---|---|---|
| Deploy pipeline | **FIXED** — shishka.health ships again after 20 days frozen (Root Directory bug, MC `77788edc`). #34 rebrand + #35 bundle constructor are live. **WP-4 is now actually shippable** — it was moot while every build failed. | deploy-map.md § Failure signatures |
| Baseline | **On record, absent 45/45** (2026-07-15, the once-only clean measurement). Only AI-visible asset today = the Google Business Profile. A perfect website alone would have appeared in zero of the 45 answers. | plan § 5 appendix |
| GBP | Verified profile, 5.0★ (2 reviews at audit, both unanswered then), menu **32 items with photos** (uploaded Jul 15–16), false "Has toilet" removed, hours correct, category correct ("Health food restaurant" — category decision is CLOSED, do not reopen). **Address is still a Plus Code `Q8P8+XV9`** — the top remaining defect. | WP-1 `a91c473a` comments |
| menu_public (live, 2026-07-27) | **74 items** (6 `coming_soon`) in 8 sections: Salads 7 · Bundles 1 · Appetizers & Dips 8 · Bread & Crackers 3 · **Potato Tacos 8** (section already renamed in DB) · Sauces & Dressings 4 · Drinks 40 · Chocolate 3. | SQL snapshot |
| GBP ↔ DB drift | GBP menu (32, pre-revamp manakish names/prices) ≠ menu_public (74, tacos naming). Old "79-vs-24" truthfulness concern is alive as **74-vs-32**. | this file § 2 D1 |
| Tacos revamp | **In flight** (MC `abe7301a`: 2 categories, Vege 69 / Meat 89) — GBP resync must run *after* it lands. | MC |
| PR #33 | **CLOSED deliberately** (2026-07-15 CEO decision) — superseded by the plan. Its keepers (robots.txt allows, Restaurant JSON-LD, menu-JSON-as-source) carry into WP-4. **Do not reopen.** | plan § WP-0 |
| Vercel access | **PROVEN available** via Vercel MCP on the CEO's claude.ai account (used 2026-07-25 to diagnose the outage): team `team_qrm1fZ0EMm7XnL3wfxV5rQxQ`, project `shishka-web` `prj_OsHKcipkh7ZYIp3ta8i5lYh1IpY2`. WP-8's "blocked on Vercel access" is **obsolete**. | MC `77788edc` |
| Prompt-panel next run | **2026-08-01**, same 15 prompts, same method, **during service hours 09:00–18:30 ICT** (baseline ran after close — recorded caveat), from a Phuket IP, logged out. | plan § 5 |

## 2. CEO decision packet — MC `cfd30575` (blocks everything downstream)

Four decisions, ~20 minutes total. Defaults are provided — "confirm default" is a valid answer.
Answers get recorded here (fill the ✍ cells) and in the task.

| # | Decision | Recommended default | Unblocks | Answer ✍ |
|---|---|---|---|---|
| D1 | **Menu truth.** Is `menu_public` (74 items) the exact orderable list? Drinks=40 deserves a hard look — is every drink truly orderable at the counter? | Declare `menu_public` minus `coming_soon` = sellable truth; prune non-orderable items via `is_web_visible=false` (precedent: SALE-JUICE_COCONUT) | GBP resync (A1), WP-4 page data, schema truthfulness | |
| D2 | **Canonical NAP.** (a) Street address to replace Plus Code — Wongnai candidate: `46 3 ตำบล ราไวย์ อำเภอเมืองภูเก็ต ภูเก็ต 83130` — is that the actual door? (b) Juristic entity for citations. (c) Name + phone. | (b) SHISHKA HEALTHY FOOD CO., LTD. `0835568025943` (scope = "Healthy Grab-and-go"); (c) "SHiSHKA Healthy kitchen", 095 696 9059 | WP-1 address, WP-3 NAP audit, WP-7 `sameAs` | |
| D3 | **Claims sign-off.** "NO seed oils" — absolute, incl. supplier sauces/condiments? "Grass-fed beef & lamb" — supplier evidence exists? AI repeats machine-readable claims verbatim; an unverifiable claim is a durable liability. Baseline: these queries are an **unclaimed niche in Phuket** — cheapest differentiated win IF true. | Sign off only what is 100% defensible; carve out exceptions explicitly (e.g. "olive oil & grass-fed butter only, in everything we cook") | Claims in WP-4 pages + schema, GBP wording stays as-is | |
| D4 | **Keyword/slug set** for WP-4 intent pages + vocabulary. | 5 slugs: `/menu`, `/gluten-free-restaurant-phuket`, `/healthy-food-rawai`, `/no-seed-oil-restaurant-phuket`, `/clean-eating-phuket`. Keep "manakish" as searchable synonym alongside "potato tacos" in copy/FAQ (established food term; it was our near-miss query) | WP-4 slugs + copy | |

## 3. Sprint A — zero-dependency (MC `8c4b50c4`, fresh code session)

Run A1–A4 in any order; none needs the decision packet. A5 is gated on § 2.

- **A1 — GBP menu resync.** *After* revamp `abe7301a` lands: diff GBP (32 items, stale names/prices)
  vs `menu_public` (respect D1 + `stock_state`; strip emojis — GBP is a customer surface, and the
  site itself strips them too). Produce an exact add/update/delete list; apply via the CEO's
  logged-in Chrome (iframe upload technique: `~/shishka-assets/menu-photos/photo-mapping.json`,
  key `gbp_upload_technique`; photo cache in the same dir) with the CEO present, or hand her the checklist.
  *Acceptance:* GBP item count/names/prices match the D1 truth set; screenshot audit posted to `a91c473a`.
  **NOT STARTED 2026-07-27** — double-gated: revamp `abe7301a` is still `in_progress`
  (`applying-migration`, session `7385e9c3`), and the diff needs D1 to know what "orderable" means.
  Running it early would push stale names onto a customer surface twice.
- **A2 — Review replies + ask asset.** Draft EN replies in the CEO's voice for ALL unanswered
  Google reviews (2 at Jul-15 audit + ≥1 newer — re-check live), naturally restating dish +
  dietary terms. Plus a 1-line review-ask for a table/bag QR (never incentivized). CEO posts, or
  explicitly approves in-session posting. Evidence this is the cheapest lever: competitors enter
  AI answer prose with ~5 reviews; we sit at 5.0★ with 2–3. ⚠ Do not solicit from affiliated
  parties (reviewer "Mazen H" may be creditor Mazen — CEO to confirm).
  *Acceptance:* drafts delivered; replies live within 48 h.
  **DRAFTS DELIVERED 2026-07-27** → [`review-replies-2026-07.md`](review-replies-2026-07.md).
  Live count re-checked: still **2 reviews, 5.0★, both unanswered** (reply rate 0% vs WP-2's
  100%/24 h target) — no third review has landed. Nothing posted. Two blockers are CEO-only:
  posting itself, and the Mazen affiliation question (Google prohibits conflict-of-interest
  reviews — reply 1 is held until she answers).
- **A3 — AI-bot crawl-log harness** (closes the open half of WP-8). Via Vercel MCP: document a
  runnable weekly query for UA `GPTBot|ClaudeBot|PerplexityBot|OAI-SearchBot|Google-Extended`
  per path on `shishka-web`; run once; post numbers as a **comment** on WP-8 `6bb7b218` —
  do **not** claim WP-8 (owned by session `7cddafd2`; its access-blocker note is obsolete).
  *Acceptance:* query doc committed + first weekly numbers on the task.
  **DONE 2026-07-27 with a negative result** → [`ai-bot-crawl-harness.md`](ai-bot-crawl-harness.md).
  Vercel access works; the logs do not exist. `shishka-web` is a static build with zero functions,
  so it emits zero runtime logs (8 live bot-UA requests → 0 log lines in a 1 h window), and Web
  Analytics is off *and* useless for bots (JS beacon). The plan's log query is **not runnable as
  written**; a working substitute (edge middleware → Supabase sink, ~40 lines, rides in the WP-4
  branch) is designed in that doc § 4. Do not read this as "0 bot hits" — there is no instrument.
- **A4 — Bot 200-check** (WP-0 leftover). `curl -A "<bot UA>" https://shishka.health/` for
  GPTBot, ClaudeBot, PerplexityBot, OAI-SearchBot → all HTTP 200, no Vercel Firewall challenge.
  *Acceptance:* four 200s recorded below. **PASS 2026-07-27** (Phuket IP, production):

  | Bot UA | `GET /` | Body | Notes |
  |---|---|---|---|
  | GPTBot/1.2 | **200** | 677 B | `x-vercel-cache: HIT`, no challenge |
  | ClaudeBot/1.0 | **200** | 677 B | |
  | PerplexityBot/1.0 | **200** | 677 B | |
  | OAI-SearchBot/1.0 | **200** | 677 B | |
  | Google-Extended | **200** | 677 B | extra, beyond the required four |

  Two findings from the same pass, both for WP-4: (1) **677 B is the empty SPA shell** — `/menu`
  returns the identical bytes, so every bot got a 200 and learned nothing; reachability ≠ visibility.
  (2) **`/robots.txt`, `/sitemap.xml`, `/llms.txt` do not exist** — `public/` holds only `assets/`,
  and the `/(.*) → /index.html` catch-all serves the SPA for each, as `text/html` **soft-200s**.
  The PR #33 keepers were never shipped anywhere. A soft-200 at `/sitemap.xml` is worse than a 404;
  fix is dropping real files into `public/` (Vercel serves static before rewrites) inside WP-4.
- **A5 — WP-4 scaffold** (only if § 2 answered): see § 4.
  **NOT STARTED 2026-07-27** — § 2 is unanswered (`cfd30575` still `inbox`, zero comments), so the
  gate holds. WP-4 task `47b6ef32` left unclaimed and uncommented-on beyond this pointer.

**Sprint A run log — 2026-07-27** (session `70efbc72`, branch `feature/marketing/aeo-sprint-a`):
A2 ✅ drafts · A3 ✅ documented, negative result · A4 ✅ pass · **A1 not started** (gated on revamp
`abe7301a`, still `in_progress` at `applying-migration`, *and* on D1) · **A5 not started** (gated
on § 2). Nothing was posted, uploaded or deployed; every remaining step is a CEO decision or a
CEO-present action.

## 4. Sprint B — WP-4 prerendered pages (MC `47b6ef32`, gated on D1+D3+D4)

The core on-site fix: the site is a Vite CSR SPA — JS-less AI crawlers see an empty
`<div id="root">`. Full acceptance lives in plan § WP-4; execution notes that are NEW since the
plan was written:

1. Branch fresh from `Lesyanich/shishka-health` `main` — which **now already carries** the
   Potato-Tacos naming (#34) and the revived bundle constructor + `bundle_min_price` (#35).
2. Build-time prerender (extend `vite build`, e.g. vite-ssg/prerender plugin or a custom emit
   step) — **no framework migration** (MINIMAL-CORRECT-CHANGE). The `/sb` same-origin Supabase
   proxy and the `optimizedSrc` image pipeline already exist and should be reused.
3. Data source = `menu_public` only (D1 truth), fetched at build time; every deploy refreshes
   the static HTML. DB-side content changes still reach the SPA live at runtime — prerender only
   changes what *crawlers* see.
4. Pages per D4; each page: 40–60-word answer-first block, visible dishes + THB prices +
   dietary tags, visible FAQ **byte-consistent** with FAQPage JSON-LD, Restaurant/Menu schema,
   DS tokens per `shishka-health/design-system/MASTER.md`.
5. Ship via git push to `shishka-health` `main` only (deploy-map hard rule — agents never
   `vercel deploy`). Verify with the cache-busted curl fingerprint from deploy-map.
6. EN first; TH/RU + hreflang = WP-4b, later.

## 5. Guardrails (read before touching anything)

- **Do not reopen PR #33** — closed by CEO decision; keepers already harvested.
- **Do not re-litigate the GBP category** — "Health food restaurant" stays; the product signal
  lives in the GBP *menu*, not the category (decision on record, `a91c473a`).
- **Claim-gate:** WP tasks owned by other sessions (`6bb7b218`, epic `9ced1036`) get comments,
  not claims. Claim only `8c4b50c4` (Sprint A) / `47b6ef32` (if unclaimed).
- **Authenticity rules** (WP-2/5/6): zero fake reviews/threads/personas; affiliation disclosed;
  never incentivized review asks.
- **llms.txt:** keep, invest nothing further (evidence: negligible effect).
- **Deploy topology:** shishka.health = Vercel `shishka-web` ← repo `shishka-health` (git-only).
  Admin = `shishka-os`. Never cross their settings (that mistake froze prod for 20 days —
  deploy-map § Failure signatures).
- **Measurement discipline:** next panel run 2026-08-01, service hours, Phuket IP, logged out —
  else the comparison to baseline is invalid.

## 6. Sequencing at a glance

```
CEO (parallel, ~20 min): decision packet cfd30575  ──┐
Code session (now):      Sprint A A2/A3/A4           │
Code session (after abe7301a lands): A1 GBP resync   │
                                                     ▼
Code session (after packet): A5 → Sprint B WP-4 build → ship → 08-01 panel run measures it
```
