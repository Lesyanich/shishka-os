# GEO/AIO Orchestration Plan — Shishka Healthy Kitchen

> Authored by the Fable orchestrator session, 2026-07-15. Source of truth for the GEO/AIO
> initiative until work packages are synced to Mission Control (MC was unreachable from the
> authoring session — see Access Gaps). Executors: Opus sessions (`[OPUS]`) and the owner (`[HUMAN]`).

## Goal

Get Shishka Healthy Kitchen (Rawai / Nai Harn, Phuket, soft opening ~24 SKU) cited in AI answers
for local intents: `healthy food rawai`, `gluten-free restaurant phuket`, `полезная еда пхукет`,
`clean eating phuket` and neighboring queries. Input: PR `lesyanich/shishka-health#33` + the GEO Epic.

## Access Gaps (from the authoring session)

| Gap | Impact | Workaround used |
|---|---|---|
| Mission Control MCP / Supabase key absent | Epic unread; WPs not filed to MC | **Root cause fixed 2026-07-15**: `.mcp.json` now uses repo-relative paths and launch scripts prefer env vars over macOS Keychain. Remaining step: owner adds `SUPABASE_SERVICE_ROLE_KEY` to the remote environment (see `docs/keys-config.md` § Remote Sessions), then next session syncs WPs to MC |
| Session network policy blocked `shishka.health` | No live prod raw-HTML audit | Audited `main` branch `index.html` + PR #33 diff via public github.com; prod check moved into WP-0 acceptance |
| `shishka-health` repo not in session scope | Could not build/fix the failing deploy | PR read via public GitHub pages; the fix is WP-0 |

---

## 1. Diagnosis

### Reality check (verified 2026-07-15)

- **The premise "Next.js repo with SSR" is FALSE.** `main` branch `index.html` body is
  `<div id="root"></div>` + one module script — a Vite React SPA. A non-JS crawler sees an empty
  page: no menu, no dishes, no prices, no text, no JSON-LD. This is the single biggest gap:
  levers 4 (HTML menu) and 6 (on-site structure) currently score **zero**.
- **PR #33 state:** open, no reviews, **Vercel preview deploy fails with a build error** — as
  written it ships nothing. Created 2026-07-15, branch `feature/web/aeo-optimization`, 7 files:
  `index.html` (head-only Restaurant + FAQPage JSON-LD, OG/Twitter meta), `scripts/aeo.mjs`
  (build-time Menu JSON-LD injection, 79 dishes with prices/macros/diet flags), `public/robots.txt`
  (explicit allows for GPTBot, ClaudeBot, PerplexityBot, OAI-SearchBot, Google-Extended et al.),
  `public/sitemap.xml` (a single URL), `public/llms.txt`, `package.json` script, `.gitignore`.
- **Trilingual EN/TH/RU:** not present — one sitemap URL, no locale routes, no hreflang.
- **24 SKU vs 79 dishes:** the Menu JSON-LD advertises 79 dishes; the business is at ~24 SKU soft
  opening. If schema promises dishes guests can't order, AI answers create bad first visits →
  negative review sentiment, which is the #2 ranking input. Must be reconciled (Inputs #1).

### 2026 factor verification (fresh search, key deltas)

- Google **Ask Maps** (launched 2026-03-12, Gemini-powered) recommends **one** restaurant, reading
  GBP fields, review sentiment, menu section, attributes, photos. GBP ≈36% of local ranking weight,
  reviews ≈20% and rising. Review **language quality beats volume** (80 descriptive reviews
  outrank 300 generic 5-star). Confirms levers 1–2 as top priority.
- **Reddit** is the #1 cited domain across ChatGPT, Google AI Mode, Gemini, Perplexity (Peec AI
  30M-source study). Caveat: after Reddit sued Perplexity (Oct 2025), Perplexity's Reddit citations
  dropped ~86%, partially replaced by YouTube — hedge the community lever across Reddit +
  TripAdvisor + Wongnai + YouTube, not Reddit alone.
- **llms.txt:** near-zero effect — Google explicitly doesn't use it (Illyes, Mueller); ~97% of
  llms.txt files are never fetched; statistical zero citation effect. Its only real audience is
  coding agents. Confirms lowest priority: keep the file, invest nothing further.
- **ChatGPT:** Wikipedia ≈48% of citations; wins come from entity consistency + brand mentions on
  stable sources (and the Bing index).

### PR #33 verdict, per artifact

> **Update 2026-07-15:** CEO decided to close PR #33 without merge (see WP-0). Verdicts below are
> preserved as the harvest list for WP-4: KEEP = carry into the WP-4 branch, REWORK = rebuild there.

| Artifact | Verdict | Why |
|---|---|---|
| Vercel build error | **MOOT** | PR closed without merge; WP-4 starts fresh from `main` |
| `index.html` Restaurant JSON-LD (NAP, geo, hours, cuisines) | **KEEP** | Correct entity-disambiguation layer (lever 7); add `sameAs` once profiles are claimed (WP-3/WP-7) |
| `index.html` FAQPage JSON-LD (10 Q&A, head-only) | **REWORK** | Schema describing content that doesn't exist on the page violates Google structured-data guidelines (spam risk) and gives text-reading LLM crawlers nothing. The Q&A are good — render them as visible HTML (WP-4) and keep schema in sync |
| `scripts/aeo.mjs` Menu JSON-LD injection (79 dishes) | **REWORK** | Right data source, wrong output: emit **visible HTML menu pages** at build time from the same JSON (lever 4), with Menu schema alongside. Fix 79-vs-24 truthfulness first |
| `robots.txt` AI-crawler allows | **KEEP** | Correct and cheap. Add the WP-0 check that Vercel Firewall isn't silently 403-ing the same bots at the edge |
| `sitemap.xml` (1 URL) | **REWORK** | Regenerate at build with per-intent pages + locales once WP-4 lands |
| `public/llms.txt` | **KEEP AS-IS** | Evidence says negligible effect; it's done, costs nothing, don't invest further |
| Overall architecture bet | **REBALANCE** | The PR spends effort on levers 7–8 (schema, llms.txt) while levers 1–5 (GBP, reviews, NAP, HTML menu, photos) are untouched and the SPA renders levers 4/6 at zero. Off-site levers are `[HUMAN]`-owned so the PR isn't "wrong" — but on-site, prerendered visible HTML must come before more schema |

---

## 2. Work Packages

### WP-0 `[OPUS]` Close PR #33, harvest the keepers into WP-4
> CEO decision 2026-07-15: PR #33 is closed without merge (broken build, head-only FAQPage,
> 79-vs-24 dish mismatch). Its useful pieces are carried into the WP-4 branch instead.
- **Goal:** retire PR #33 cleanly; preserve the 3 salvageable artifacts for WP-4.
- **Impact/Effort:** H / L
- **Acceptance (binary):**
  - [ ] PR #33 closed with an explanatory comment linking to this plan
  - [ ] Keepers staged for WP-4: `robots.txt` AI-crawler allows; Restaurant JSON-LD (after
        fact-check of NAP, hours, claims); menu-JSON-as-single-data-source concept
  - [ ] WP-4 branch starts fresh from `main` (no dependency on the PR #33 branch)
  - [ ] Prod checks moved to WP-4 acceptance: GPTBot / ClaudeBot / PerplexityBot / OAI-SearchBot
        each get HTTP 200 (not 403) from `shishka.health` — Vercel Firewall has no AI-bot challenge rule
- **Brief:** post verdict comment on PR #33, close it. WP-4 executor copies the keepers with
  fact-checked data (Input #1: real SKU list; Input #5: claims sign-off). Outputs: closed PR,
  keeper checklist inside the WP-4 brief.

### WP-1 `[HUMAN]` Google Business Profile overhaul
- **Goal:** make GBP the machine-readable source Ask Maps reads: categories, dietary attributes,
  menu section with real dishes + prices, hours, description answering real diner questions, fresh photos.
- **Impact/Effort:** H / M
- **Acceptance:**
  - [ ] Primary category = Health food restaurant (or closest available)
  - [ ] ≥3 dietary attributes set (vegan / vegetarian / gluten-free options)
  - [ ] GBP menu section lists every real SKU with price
  - [ ] Description ≤750 chars mentioning Rawai, Nai Harn, gluten-free, healthy, no-seed-oils
  - [ ] ≥15 photos newer than 90 days; hours match reality and site schema exactly
- **Brief:** owner fills every field above; dish names/prices sourced from the same menu JSON as
  the site so all surfaces agree. Output: completed screenshot audit checklist.

### WP-2 `[HUMAN]` Review engine (ongoing)
- **Goal:** steady flow of descriptive reviews naming dishes and dietary tags; owner replies within
  24h. Review sentiment is the AI's source of truth.
- **Impact/Effort:** H / M (ongoing)
- **Acceptance (monthly):**
  - [ ] ≥8 new Google reviews; ≥50% mention a specific dish or dietary need
  - [ ] 100% of reviews get owner replies <24h
  - [ ] ≥2 new TripAdvisor + ≥2 Wongnai reviews
- **Brief:** table QR "enjoyed it? tell others what you ate" (never incentivized/scripted —
  platform policies), reply playbook that naturally restates dish + dietary terms ("glad the
  gluten-free shakshuka worked for you"). Output: monthly counts in the measurement appendix.

### WP-3 `[HUMAN]` Entity / NAP consistency
- **Goal:** one identical name, address, phone, description across GBP, Google Maps, TripAdvisor,
  Wongnai, Apple Maps (Business Connect), Foodpanda, Grab, Facebook, Instagram; all profiles claimed.
- **Impact/Effort:** H / M
- **Acceptance:**
  - [ ] Canonical NAP string documented
  - [ ] Every listed platform matches char-for-char (address romanization included)
  - [ ] All profiles claimed/verified; profile URL table handed to Opus for `sameAs` (WP-7)
- **Brief:** fix canonical NAP (Input #2), audit each platform, correct or create listings.
  Output: table platform → URL → status.

### WP-4 `[OPUS]` Prerendered HTML menu + intent pages (core on-site WP)
- **Goal:** real crawlable pages in raw server HTML, one per intent, generated at build from the
  existing menu JSON (`scripts/aeo.mjs` data source): `/menu` (full, prices + dietary tags),
  `/gluten-free-restaurant-phuket`, `/vegan-rawai`, `/healthy-food-rawai`, `/clean-eating-phuket`
  (adjust to final keyword set — Input #8).
- **Impact/Effort:** H / M-H
- **Acceptance (each page, via curl without JS):**
  - [ ] Answer-first block of 40–60 words directly answering the intent
  - [ ] Visible dish names + THB prices + dietary tags
  - [ ] Visible FAQ section byte-consistent with FAQPage JSON-LD
  - [ ] H2/H3 entity hierarchy; Menu/Restaurant schema present
  - [ ] Sitemap lists all pages; the rest of the app stays a SPA (prerender only, no framework migration)
  - [ ] Design system tokens from `shishka-health` `design-system/MASTER.md` used
- **Brief:** extend the build (vite-ssg / prerender plugin, or extend `aeo.mjs` to emit static
  HTML) rather than migrating to Next.js — MINIMAL-CORRECT-CHANGE. EN first; TH/RU with hreflang
  as WP-4b (effort M). Branch starts fresh from `main`; carry the WP-0 keepers (robots.txt,
  fact-checked Restaurant JSON-LD, menu-JSON source). Inputs: WP-0 keeper list, confirmed SKU
  list, keyword sign-off. Output: live URLs + raw-HTML audit.

### WP-5 `[OPUS]` Community-intent page: "Where to eat clean & healthy in Rawai — an honest local guide"
- **Goal:** discussion-shaped page for community-flavored queries: real trade-offs, limitations,
  named alternatives (competitors included). `reddit` in title/slug is allowed only because the
  page genuinely delivers what that modifier seeks: unpolished comparison, warnings, lived experience.
- **Impact/Effort:** M-H / M
- **Acceptance:**
  - [ ] Names ≥3 non-Shishka alternatives with honest one-line assessments
  - [ ] States ≥2 real Shishka limitations (e.g. hours, limited soft-opening menu)
  - [ ] Zero fabricated threads/comments/upvotes/personas
  - [ ] Affiliation disclosed on the page itself
  - [ ] Answer-first block present; page in sitemap
- **Brief:** interview owner for real trade-offs + local knowledge (Input #4); write as a local's
  guide, not adcopy. Depends on WP-4 infrastructure. Output: live page.

### WP-6 `[HUMAN]` Authentic community presence (Reddit / TripAdvisor / Wongnai)
- **Goal:** be present where LLMs source "real people's opinions", hedged across platforms given
  Perplexity–Reddit volatility.
- **Impact/Effort:** H / M (ongoing)
- **Acceptance:**
  - [ ] Human-run account active in r/phuket + r/ThailandTourism answering healthy/GF/vegan food questions on merit
  - [ ] Affiliation disclosed in every self-referencing comment; zero fake accounts/reviews
  - [ ] TripAdvisor + Wongnai profiles claimed, complete, with photos
  - [ ] ≥2 substantive community contributions/month
- **Brief:** answer real questions usefully; mention Shishka only where genuinely relevant, with
  disclosure ("I run Shishka in Rawai — …"). Imitation is detected and punished publicly;
  authenticity compounds. Output: monthly contribution log.

### WP-7 `[OPUS]` Schema layer v2: `sameAs` + `AggregateRating`
- **Goal:** close the entity loop once WP-3 delivers profile URLs and real reviews exist.
- **Impact/Effort:** M / L
- **Acceptance:**
  - [ ] Restaurant schema carries `sameAs` array with all claimed profiles
  - [ ] `AggregateRating` matches the live Google rating (never fabricated; auto-updated or reviewed monthly)
  - [ ] Google Rich Results Test passes
- **Brief:** small PR after WP-3. Inputs: profile URL table. Output: merged PR + validator screenshot.

### WP-8 `[OPUS setup / HUMAN cycle]` Measurement harness
- **Goal:** know whether any of this works (see §5).
- **Impact/Effort:** M (steering value H) / L-M
- **Acceptance:**
  - [ ] Prompt panel doc committed; baseline recorded with date
  - [ ] Vercel log query for AI bots documented and runnable
  - [ ] Monthly review scheduled with owner
- **Brief:** create the appendix table below, run baseline (§5), document the Vercel log filter.

### WP-9 `[HUMAN shoots / OPUS wires]` Photo pipeline
- **Goal:** Vision AI reads image content; photos are a ranking input for visual search and Ask Maps.
- **Impact/Effort:** M / L-M
- **Acceptance:**
  - [ ] ≥15 photos on GBP newer than 90 days covering dishes / interior / menu board
  - [ ] Site menu pages show real dish photos with descriptive alt text + `ImageObject` schema
  - [ ] Monthly photo refresh cadence agreed
- **Brief:** owner shoots per a shot list Opus provides (dish close-ups in natural light, dietary
  hero dishes first); Opus optimizes, wires alt text + schema, uploads batch to GBP with owner.

---

## 3. Sequencing

**Weeks 1–2 — needle-movers (no dependencies):**
- WP-0 close PR #33 + stage keepers (unblocks WP-4 to start fresh)
- WP-1 GBP overhaul (biggest single lever, zero dependencies)
- WP-2 review engine launch
- WP-8 baseline: run the prompt panel BEFORE anything ships (clean baseline)
- Input collection (§6): canonical NAP, real SKU list

**Weeks 3–6 — build the surface:**
- WP-4 prerendered menu + intent pages (EN) — depends on WP-0
- WP-3 NAP audit & fix across platforms
- WP-9 photo shoot + GBP upload
- WP-6 community presence starts (slow-burn — start early)

**Weeks 7+ — compound:**
- WP-5 community-intent guide page (needs WP-4 infra + owner interview)
- WP-7 `sameAs` + `AggregateRating` (needs WP-3 URLs + review volume from WP-2)
- WP-4b TH/RU locale pages + hreflang
- WP-8 monthly cycle; re-prioritize from data at the week-12 revision

## 4. Platform Matrix

| Platform | What feeds it | WPs that move it |
|---|---|---|
| Google AI Mode / AI Overviews / Ask Maps | GBP fields + review sentiment + GBP menu + photos + top-20 organic | WP-1, WP-2, WP-9 primary; WP-0, WP-4, WP-7 foundation |
| Perplexity | Live crawl + Reddit/community + TripAdvisor + fresh content (post-lawsuit: hedged to YouTube/TA) | WP-6, WP-5 primary; WP-4 (crawlable raw HTML is mandatory — it reads text), WP-2 |
| ChatGPT | Wikipedia-weighted, stable entity signals, brand-name consistency, Bing index | WP-3 primary; WP-1, WP-4, WP-7 |

**Citation-trigger prompt panel (15) — run verbatim on all three platforms:**

1. best healthy restaurant in Rawai Phuket
2. gluten free restaurant Phuket
3. where to eat clean in Nai Harn
4. vegan friendly cafe Rawai
5. полезная еда Пхукет где поесть
6. healthy breakfast Rawai
7. restaurant that doesn't use seed oils Phuket
8. grass-fed meat restaurant Phuket
9. keto friendly restaurant Phuket
10. gluten free brunch near Nai Harn beach
11. clean eating Phuket recommendations
12. where do expats eat healthy in Rawai reddit
13. здоровый завтрак Раваи Пхукет
14. healthy food delivery Rawai
15. matcha cafe Rawai Nai Harn

## 5. Measurement

- **Prompt panel:** the 15 prompts above × Google AI Mode, Perplexity, ChatGPT; score each
  `cited` (linked) / `mentioned` (named, no link) / `absent`. Run on the 1st of each month; log in
  the appendix table below.
- **Baseline:** week 1, before WP-1/WP-4 ship. Expected: absent on ~15/15 (site is invisible to
  crawlers today).
- **Target by 2026-10-15 (12 weeks):** mentioned-or-cited on ≥5/15 prompts on ≥2 platforms;
  ≥1 citation of a shishka.health URL on Perplexity.
- **AI-bot crawl logs:** Vercel request logs filtered to UA
  `GPTBot|ClaudeBot|PerplexityBot|OAI-SearchBot|Google-Extended` — weekly count per bot per path.
  Success signal: bots fetching `/menu` and intent pages, not just `/`. (Plus the WP-0 check that
  none get 403.)
- **GBP:** interactions / direction requests / calls monthly from the GBP dashboard.
- **Optional:** third-party AI-visibility tracker (Profound/Peec class) — only if the manual panel
  shows traction and budget allows.
- **Revision date:** **2026-10-15** — re-rank WPs against panel data.

### Appendix: prompt panel log

| Date | Prompt # | Google AI Mode | Perplexity | ChatGPT | Notes |
|---|---|---|---|---|---|
| (baseline pending) | | | | | |

## 6. Inputs Needed From Human

1. **Real orderable SKU list** (resolves 79-dishes-vs-24-SKU conflict) — blocks WP-4.
2. **Canonical NAP string** (exact name, address romanization, phone) — blocks WP-3, WP-7.
3. **GBP access confirmed** + Vercel dashboard access (logs, Firewall check) — blocks WP-1, WP-8, WP-0 verification.
4. **Owner interview** (30 min): real trade-offs, honest alternatives in Rawai, actual guest FAQ — blocks WP-5, improves WP-4 FAQ.
5. **Truthfulness sign-off** on positioning claims baked into PR #33 schema ("never seed oils", "grass-fed") — they are now machine-readable assertions AI will repeat.
6. **TripAdvisor / Wongnai / Apple Business Connect credentials** or delegation — blocks WP-3, WP-6.
7. **Mission Control access** for a future session to file these WPs as MC tasks (the authoring session had none).
8. **Keyword set sign-off** for WP-4 page slugs.
