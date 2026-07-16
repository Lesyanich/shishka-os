# Google Business Profile API — access request kit

> Prepared 2026-07-15. For WP-1 / GBP menu automation. Submit from **lesia@shishka.health** (owner).
> Form: https://support.google.com/business/contact/api_default → choose **"Application for Basic API Access"**.

## Timing — do NOT submit before 2026-08-06

Google's prerequisite is verbatim: *"Manage a Google Business Profile that is **verified and active for 60+ days**"*
([prereqs](https://developers.google.com/my-business/content/prereqs)). Google's FAQ states requests are
*"reviewed within 14 days"* ([FAQ](https://developers.google.com/my-business/content/faq)).

Our profile's age, from three independent signals gathered 2026-07-15:

| Signal | Implies |
|---|---|
| Opening date on the profile | 7 June 2026 → 38 days |
| Oldest Google review (Kate So) | ≈10 June 2026 → 35 days |
| Performance panel data window | starts Jun 2026; nothing earlier |

So we are **~22 days short**. A 14-day review of an application filed today would land ~29 July, when we
are ~52 days old — a likely rejection on the age gate. **Earliest safe submission: 6 August 2026**
(60 days from the declared opening date; 9 August if measured from the first review).

**Unresolved:** verification sometimes precedes opening, in which case we already qualify. The definitive
record is the Google verification confirmation email in the owner's inbox — owner to check. If that email
predates 16 May 2026, submit immediately instead of waiting.

## Prerequisite step 0 — create the Google Cloud project

Access is granted **at Google Cloud project level**, and the form asks for the project number. We have no
GCP project today (our backend is Supabase). Before submitting:

1. Create a Google Cloud project (e.g. `shishka-gbp`) under lesia@shishka.health.
2. Note the **project number** (not the ID) — the form wants the number.
3. Enable the Business Profile APIs in the project. New projects start at **0 QPM quota**; approval raises it.
   Quota staying at 0 QPM = not yet approved; 300 QPM = approved.

## Justification text (paste into the form's use-case field)

> **Organisation:** SHISHKA HEALTHY FOOD CO., LTD. — Thai company registration 0835568025943 —
> trading as SHiSHKA Healthy Kitchen.
>
> **Business Profile:** SHiSHKA Healthy kitchen, Rawai, Mueang Phuket District, Phuket 83130, Thailand.
> Store code 02935683982577399333. Verified; managed by lesia@shishka.health, who is the profile owner.
>
> **Website:** https://shishka.health
>
> **Locations:** one. We are a first-party business managing our own single profile. We are not an agency,
> we do not manage profiles on behalf of third parties, and we are not building a product for resale.
>
> **Use case.** We operate a healthy grab-and-go kitchen in Rawai, Phuket. Our menu is maintained in our own
> internal ERP (PostgreSQL) as the single source of truth: each item carries its name, price, description,
> portion size, nutrition values (calories, protein, carbohydrate, fat), allergen list and photograph. That
> same source already feeds our public website and our point-of-sale system.
>
> We are requesting API access so that the food menu on our Google Business Profile stays automatically
> consistent with that source. The menu currently holds 79 items and changes frequently: we are in soft
> opening, we add dishes most weeks, prices move, and individual items go in and out of stock. Maintaining
> the Business Profile menu by hand guarantees it drifts out of date — which means customers who find us
> through Google Search and Maps see dishes we no longer serve, or prices that are wrong. Automating it is
> the only way we can keep that surface accurate.
>
> **APIs requested:**
> - *My Business API v4* — `accounts.locations.getFoodMenus` and `accounts.locations.updateFoodMenus`.
>   This is the primary need.
> - *Business Information API* — to read our location's metadata (in particular `canHaveFoodMenus`) and to
>   keep opening hours and attributes consistent with our records.
> - *Account Management API* — to resolve our account and location resource names.
>
> **How we will use it.** A scheduled job in our backend compares our menu source against the profile's
> current food menu and issues a PATCH to `updateFoodMenus` only when something has actually changed.
> Expected call volume is very low: a single location, at most a few calls per day and typically fewer.
>
> **Data handling.** The only data that moves is our own menu, from our own system, into our own profile.
> We will not read, store, cache or redistribute data about any other business. We will comply with the
> Business Profile API policies and Terms of Service.

## Notes for whoever submits

- Submit **as the owner** (lesia@shishka.health). Manager-level accounts get bounced.
- The website must be live and listed on the GBP at submission time — it is.
- Keep the profile "fully complete and up-to-date" — Google names this as a review factor. The pending
  `No toilet` correction (2026-07-15) should have landed by then; verify before submitting.
- Approval is per-project: once granted, enable each API you need in the Cloud console.

## After approval — the build

Mirrors the existing `loyverse_push_queue` pattern (migrations 334/335): DB change → queue row → pg_cron
drain → edge function → external API. Nothing novel to design.

Field mapping is close to 1:1 — Google's FoodMenus model is Menus → Sections → Items → Options, and each
Item takes name + price (required) plus description, nutrition facts, allergens, portion size, dietary
restrictions and photo:

| Google FoodMenus | Our `menu_public` |
|---|---|
| Section | `section_name` |
| Item name | `customer_short_name` (fallback `name`) |
| Price | `price` (THB) |
| Description | `customer_description` |
| Nutrition facts | `calories`, `protein`, `carbs`, `fat` |
| Allergens | `nomenclature.allergens` |
| Portion size | `portion_size` + `portion_unit` |
| Photo | `image_url` |

**Gotchas to carry into the build:**
- **Strip emoji.** Section names hold them (`🫓 Manakish`, `🧋 Drinks`). Reuse the site's existing
  `deepStripEmoji` rather than writing a second stripper.
- **Honour `stock_state`.** Push `in_stock` only (74 of 79 today); never advertise a `coming_soon` dish —
  that is the bad-first-visit mechanism the GEO plan exists to prevent.
- **Check `canHaveFoodMenus`** on `locations.get` before the first PATCH; not every location is eligible.
