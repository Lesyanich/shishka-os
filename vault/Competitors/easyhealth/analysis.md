# Easy Health — Competitive Analysis (Teardown)

- **Analyzed:** 2026-06-02 (live browser walkthrough — observed facts, not desk guesses)
- **Depth:** teardown
- **Site:** https://easyhealth.asia
- **App:** iOS [`id6667109383`](https://apps.apple.com/app/id6667109383) · Android [`com.easyHealth.app`](https://play.google.com/store/apps/details?id=com.easyHealth.app)
- **Parent:** Gourment Innovation Co. Ltd. · Bangkok + Pattaya
- **Assets:** screenshots in [`assets/`](assets/)

> Method note: the live site was walked with a real browser (Playwright). Pages render server-side
> (Next.js), so menu data is embedded in the page payload, not a public XHR API. Items marked
> _(unverified)_ could not be observed directly (e.g. login-gated flows).

---

## 1. Business model
- **Two revenue modes side by side:**
  - **À la carte** ordering from a 160+ item menu (observed slugs: pad-thai, acai-berry-bowl, hummus-bowl, tom-jued-soup, hawaii-taco, free-range-chicken-caesar-wrap, riceberry-maki, …).
  - **Meal-plan subscriptions** — pre-built rotating plans (see §menu plans).
- **Fulfillment types:** delivery, takeaway, and **"Order to Table"** (dine-in) — the last is referenced repeatedly (loyalty redemptions are "Order to Table only").
- **Locations:** Asoke, Sathorn, Ekkamai (Bangkok), Pattaya. App auto-detects nearest branch.
- **Pricing observed:** individual dishes ~135–279฿ (Acai Berry Bowl = 279฿); meal plans from **1899฿ / 5 days** (Lean Plan).

## 2. Information architecture
Top nav: **Menu · Meal plans · BYO · About us · Order Now · Sign in · EN** (language switcher).
Footer: Our Story, Blog, Testimonials, Contact, FAQ, Locations, "Diet, Allergens and Nutritions", socials, app-store badges.
Key routes: `/menu`, `/meal-plans`, `/my-meals` (BYO), `/easy-plus` (loyalty), `/sign-in`, `/find-a-store`.

## 3. Menu presentation (`/menu`)
- **Left sidebar = category list** (icons + labels): New Arrivals, Combos, Bowls, Soups, Appetizers, Wraps, Salads & Bowls, Fit Bowls, … On mobile this collapses to a **horizontal scrollable tab strip** (sticky).
- **Main = 3-column card grid**, grouped into category sections (each section has a heading like "New Arrivals").
- Cards show a **food photo** + "NEW" badge for new arrivals. Skeleton loaders while data streams in.
- A top banner cross-sells meal plans: _"Looking for meal plans? … Browse meal plans"_.
- **Search box** + **"Diets and Allergens"** filter button at the top.
- Dishes open as a **modal** via `?product=<slug>` (deep-linkable, SEO title per dish).

## 4. Constructor / "Lego" flow — TWO levels
**(a) Per-dish modifiers (accessible, no login).** Each dish modal is itself a mini-builder. Example — **Acai Berry Bowl** ([screenshot](assets/dish-detail-acai-modal.png)):
- `Mix or Separate Granola` — **Required, Pick 1**: Mixed Granola / Separate Granola **+5฿**
- `Mix or Separate` (topping) — **Required, Pick 1**: Mixed Topping / Separate Topping **+10฿**
- `Add on protein` — **Optional, Max 1**: Extra Whey protein powder 30g **+59฿**
- Free-text **"Note to our chef"**
- **"Preference if this item is unavailable"** → "Contact me for replacement"
- **"Meal is for a friend? Your energy profile won't be affected by this article"** — modifiers tie into a personal **energy/nutrition profile** when logged in.
- Quantity stepper + **"Add to bag"** + live price.

**(b) Full BYO meal-builder (`/my-meals`, login-gated).** _"Create your own custom meals by combining your favorite ingredients."_ Requires sign-in. Also shows **"Signature Meals"** — handpicked custom creations from other users (community/social layer). _(Full builder flow unverified — behind login.)_

## 5. Filters — "Diets and Allergens" panel ([screenshot](assets/filter-diets-allergens.png))
- **Diets** ("Show only products that match these diets"): **High Protein · Vegan · Vegetarian · Paleo · Keto**
- **Allergens** ("Exclude products containing these allergens"): **Gluten · Crustaceans · Eggs · Fish · Peanuts · Soybeans · MilkAndDiary · Nuts · Sesame**
- Plus free-text **Search**. Filters combine, then **Apply**.

## 6. Nutrition display — the КБЖУ donut ([screenshot](assets/dish-detail-acai-modal.png))
- Every dish modal shows a **donut chart with calories in the center** (Acai = **413** kcal) and a color-segmented ring for the macro split.
- **Legend beside it:** Protein 16g · Carbohydrate 62g · Fat 11g.
- **Allergens listed explicitly** under the dish (Acai: Nuts, Sesame).
- This is exactly the "пирожковая диаграмма для баланса КБЖУ" the CEO wants.

## 7. Cart / checkout / ordering
- Cart = "bag"; add from dish modal with chosen modifiers + quantity.
- Fulfillment: delivery / takeaway / Order-to-Table. App auto-picks nearest branch for fee/speed.
- _(Full checkout + payment methods unverified without completing an order.)_

## 8. Accounts / loyalty — "Easy Plus" (`/easy-plus`) ([screenshot via text capture])
- **Points-based rewards store.** Earn points per order, redeem for menu items or discounts, e.g.:
  Space Gym EMS Training = 60 pts; smoothies/bowls/wraps = 80–120 pts; "50 THB Discount" = 50 pts.
  All redemptions flagged **"Order to Table only"**.
- Personal **"energy profile"** (daily calorie/macro tracking) tied to the account.

## 9. Mobile app
Native iOS + Android. Marketed features: easy ordering (delivery/takeaway/order-to-table), personalized
meal planning (weight loss/gain), nutrition tracking, rewards, nearest-location auto-detect, order
history + reorder, address management, **delivery-proof photos**.

## 10. Tech / API hints
- **Next.js** (SSR/RSC — menu data server-rendered, no public menu XHR), **NextAuth** (`/api/auth/session`).
- UI built on **NextUI / HeroUI** (`data-slot`, `outline-focus`, `aria-haspopup="dialog"` primitives) + Tailwind.
- Images via **CloudFront CDN** (`d2ijhro8jdnps2.cloudfront.net`, with `?format=auto&width=&quality=` transforms).
- Dishes are deep-linked by **slug** (`?product=<slug>`), SEO title per dish.
- Analytics: GA4, Facebook Pixel, Google Maps.

## 11. Design / UX
- **Light theme**, clean/airy, soft green brand ("eh! easy health"), rounded cards, large food photography.
- Mobile-first (sticky category tabs, app cross-promo). Multi-language (EN/TH; RU strings observed in coupon modal).
- Currency ฿ (THB).

## 12. Differentiators
1. Donut КБЖУ chart on every dish (calories centered).
2. Two-tier customization: quick per-dish modifiers + full login-gated BYO builder with community "Signature Meals".
3. Diet + allergen filter combined in one panel, with clean exact taxonomy.
4. Meal-plan subscriptions across 6 goal-based plans with A–E rotation.
5. Points loyalty ("Easy Plus") + personal energy profile / nutrition tracking.
6. Order-to-Table as a first-class fulfillment mode (matches dine-in QR use case).

---

## 13. Easy Health vs Shishka — feature comparison

| Feature | Easy Health | Shishka status | Where in our stack |
|---|---|---|---|
| Public menu, category sections | ✅ sidebar + card grid | **HAVE** | `apps/web/` (`MenuPage.tsx`, `usePublicMenu.ts`), view `v_public_menu` (`migrations/226`) |
| Anon-safe menu data (no cost leak) | ✅ | **HAVE** | `v_public_menu` exposes price/nutrition/tags/allergens only |
| Per-dish photo | ✅ CloudFront | **HAVE** (data) | `nomenclature_images` + cascade in `v_public_menu` |
| КБЖУ data per dish | ✅ | **HAVE** (data) | `nomenclature.calories/protein/carbs/fat/fiber` |
| **КБЖУ donut chart on card** | ✅ calories-centered donut | **MISSING** (UI) | data exists; `recharts` already in `apps/admin-panel` — client calc protein×4+carbs×4+fat×9 |
| **Diet + allergen filters on menu** | ✅ High Protein/Vegan/Veg/Paleo/Keto + 9 allergens | **MISSING** (UI) | tags by group (`dietary`/`allergen`) already in `tags`+`nomenclature_tags`, projected by `v_public_menu` |
| Allergen list on dish | ✅ | **HAVE** (data) | `allergens[]` in `v_public_menu` |
| Per-dish modifiers (pick-1 / add-on, +price) | ✅ Required/Optional, Max N | **PARTIAL** | order schema supports server-side; customer modifier UI deferred (`apps/web` v1 = ready dishes only) |
| **Full BYO meal-builder** | ✅ login-gated `/my-meals` | **MISSING** | reuse Booster/BOM model (`docs/bible/menu-concept.md`). NB: our `/salad-bar` is an **admin physical-layout tool** (GN pans, mm coords) — NOT a customer constructor |
| Cart → checkout → order | ✅ | **HAVE** | `apps/web` cart + `create-order` edge fn (`migrations/225`/`227`) |
| Fulfillment: dine-in / pickup | ✅ Order-to-Table | **HAVE** | `fulfillment_type` (pickup/dine_in) in order intake |
| Order code / cashier handoff | (POS-based) | **HAVE** (ours is a differentiator) | `fn_next_order_code`, `/cashier`, KDS |
| Meal-plan subscriptions | ✅ 6 plans, A–E rotation | **MISSING** | net-new (v3) |
| Loyalty / points store | ✅ Easy Plus | **MISSING** | net-new (v3) |
| Personal energy/nutrition profile | ✅ | **MISSING** | net-new (v3) |
| Native mobile app | ✅ iOS+Android | **MISSING** | our `apps/web` is a PWA (manifest present) — PWA-first is a cheaper path |
| Search | ✅ | **MISSING** (UI) | trivial client filter over loaded menu |
| Theme | Light | Dark (our design system) | brand differentiator |

## 14. What we should COPY / BEAT / SKIP
- **COPY (cheap, data already exists):**
  - КБЖУ **donut chart** on each dish card, calories in center (our must-have per CEO).
  - **Diet + allergen filter panel** with a clean fixed taxonomy + search.
  - Deep-linkable dish modal (`?product=slug`) for shareable menu links + SEO.
  - Per-dish **modifiers** as "Required: pick 1 / Optional: add-on +฿" (our order schema already anticipates this).
- **BEAT:**
  - **Self-ordering with order-code → cashier → KDS** is already built and is a genuine edge over their POS-only à la carte (we own the whole intake loop, no Loyverse dependency).
  - Dark, photography-forward design tuned to our brand.
  - When we do BYO, anchor it on our **Culinary Booster System** (pre-locked flavor) so a "custom" bowl is still consistent and costed via BOM — they expose ingredients, we can expose *guided* composition with live cost/nutrition rollup.
- **SKIP (for now):**
  - Native apps — ship a **PWA** first (we already have the manifest); revisit native only if retention demands it.
  - Meal-plan subscriptions, points loyalty, personal energy profile — powerful but v3; don't let them block the MVP.
  - Multi-branch nearest-location logic — we're single-site.

---

## Immediate takeaways for our roadmap
1. **MVP (now):** ship the public menu browse (`apps/web`) live + presentable — the one thing that lets a guest "ознакомиться с меню". See [`../../Product/customer-site-and-app.md`](../../Product/customer-site-and-app.md).
2. **v1.1 quick wins:** КБЖУ donut + diet/allergen filters + search — all on data we already have.
3. **v2:** per-dish modifier UI + guided BYO builder on the Booster/BOM model.
4. **v3:** meal plans, loyalty, energy profile.
