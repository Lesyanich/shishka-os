# Customer Site & App — Product Spec / Roadmap

**Owner:** CEO · **Status:** active · **Last updated:** 2026-06-02
**Related:** MC QR-ordering initiative `52efcf1e` · [PR #279](https://github.com/Lesyanich/shishka-os/pull/279) · competitor benchmark [Easy Health](../Competitors/easyhealth/analysis.md)

## Vision
A customer-facing menu site (then app) where a guest can **browse the menu, understand each dish
(price, photo, КБЖУ, allergens), and order** — eventually building custom bowls and tracking nutrition.
Benchmarked against [Easy Health](../Competitors/easyhealth/analysis.md); differentiated by our
**self-order → order-code → cashier → KDS** loop (no Loyverse dependency) and a dark, photography-forward brand.

## Guiding decisions
- **PWA-first, not native.** `apps/web` already ships a web manifest. Native apps are a v3+ question.
- **No new tables.** Build on `nomenclature` + `product_categories` + `bom_structures` + `tags`/`nomenclature_tags` + `nomenclature_images`, surfaced through the anon-safe `v_public_menu` view.
- **Anon never touches `nomenclature` directly** — only `v_public_menu` (RLS-locked). Orders only via the `create-order` edge function (server recomputes price).
- **Dark theme**, mobile-first (QR audience). i18n-ready strings, no i18n framework in v1.

---

## v1 — MVP: "a guest can browse the menu" — PRIORITY, SHIP NOW
The single goal: a real, reachable, presentable public menu. ~80% already built on `feature/web/qr-menu-ordering-mvp`.

**Scope**
- Public menu by category, dish cards: photo · name · description · price (`฿ X,XXX`) · nutrition badges.
- Cart → checkout → order code (already built & E2E-tested) stays on, behind the existing flow.
- Live & reachable by visitors; presentable (brand-quality dark UI, mobile-first).

**Remaining work (the actual gap)**
1. `apps/web/vercel.json` (mirror `apps/admin-panel/vercel.json` / `apps/kds/vercel.json`: SPA rewrite → `index.html`, build `npm run build`, output `dist`).
2. Vercel env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (see `apps/web/.env.example`).
3. Data check: `v_public_menu` returns real SALE dishes with price + nutrition + photo; backfill missing customer photos.
4. Styling pass on `apps/web/src/pages/MenuPage.tsx` (today skeleton-styled → brand quality).
5. Deploy preview → CEO review → merge PR #279.

**Done when:** a guest opens the deployed URL on a phone and sees a polished menu grouped by category with photos, prices, and nutrition; no cost/supplier data leaks.

**v1 styling — DONE (2026-06-02):** `MenuPage.tsx` restyled to brand-quality dark UI — sticky category
tabs, card grid, branded gradient placeholders (until photos land), КБЖУ **macro donut** (calories
centered, pure CSS), P/C/F badges, tag chips, allergen line. Unpriced categories auto-hidden so the MVP
looks complete. Verified against live data at 390px mobile. Preview: [`assets/mvp-menu-v1-cards.png`](assets/mvp-menu-v1-cards.png), [`assets/mvp-menu-v1-full.png`](assets/mvp-menu-v1-full.png). _Remaining for ship:_ `vercel.json` + env + merge PR #279.

## v1.1 — Quick wins (data already exists, low effort)
- **КБЖУ donut chart** on each dish card/modal — calories centered, macro ring. Client calc:
  `protein×4 + carbs×4 + fat×9`. `recharts` is already a dependency in `apps/admin-panel`.
- **Diet + allergen filter panel** (copy Easy Health's clean taxonomy): diets High Protein/Vegan/Vegetarian/Paleo/Keto; allergens Gluten/Crustaceans/Eggs/Fish/Peanuts/Soybeans/Milk&Dairy/Nuts/Sesame — all already in `tags`/`v_public_menu`.
- **Search** over the loaded menu (trivial client filter).
- **Deep-linkable dish modal** (`?product=<slug>`) for shareable links + SEO.

## v2 — Customization & accounts
- **Per-dish modifier UI** ("Required: pick 1" / "Optional: add-on +฿"); order schema already anticipates modifiers.
- **Guided BYO builder** anchored on the **Culinary Booster System** (`docs/bible/menu-concept.md`):
  base → protein → vegetables → booster, with **live cost + nutrition rollup via BOM**. Our edge over
  Easy Health: a "custom" bowl is still consistent and costed, not a free-for-all.
- Customer accounts, order history, reorder.

## v3 — Depth (match Easy Health)
- Meal-plan subscriptions (goal-based plans, rotation).
- Loyalty/points store (cf. "Easy Plus").
- Personal energy/nutrition profile (daily КБЖУ tracking).
- Revisit native apps only if retention demands it.

---

## Feature parity snapshot (vs Easy Health)
Full table in [the competitor analysis](../Competitors/easyhealth/analysis.md#13-easy-health-vs-shishka--feature-comparison).
**HAVE:** menu browse, anon menu view, photos, КБЖУ data, allergen data, cart→order→code, dine-in/pickup, cashier+KDS.
**MISSING (UI on existing data):** КБЖУ donut, diet/allergen filters, search.
**MISSING (net-new):** BYO builder, modifier UI, meal plans, loyalty, energy profile, native app.

## Key paths
- App: `apps/web/` (`src/pages/MenuPage.tsx`, `CheckoutPage.tsx`, `state/cart.tsx`, `hooks/usePublicMenu.ts`)
- Data view: `services/supabase/migrations/226_public_menu_view.sql`
- Order intake: `services/supabase/functions/create-order/index.ts` + migrations `225`/`227`
- Deploy pattern: `apps/admin-panel/vercel.json`, `apps/kds/vercel.json`
- Concept for BYO: `docs/bible/menu-concept.md`
