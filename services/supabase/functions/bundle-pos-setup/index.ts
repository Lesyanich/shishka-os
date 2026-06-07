// ═══════════════════════════════════════════════════════════
// Edge Function: bundle-pos-setup
// Builds the Loyverse POS projection of the manakish bundles.
//
// Model (decided with the owner): one Loyverse CATEGORY per bundle size, each
// holding the manakish at THAT bundle's discounted price (from the price_tiers
// DB — the single source of truth) plus the free sauces at ฿0. The cashier opens
// e.g. "🧆 Bundle ×8", taps manakish (repeats = quantity) + a free sauce — the
// price is already the bundle price, zero extra actions, no modifiers/discounts.
//
// These items live ONLY in Loyverse (a generated projection). The website/catalog
// keep ONE manakish + the constructor — no product duplication there.
//
// Idempotent: re-running updates prices / skips existing items. Also deletes the
// orphan "Bundle Manakish #k" / "Bundle Sauce #k" slot modifier lists from the
// abandoned slot approach.
//
// Run:  POST /functions/v1/bundle-pos-setup
// Env:  LOYVERSE_API_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// ═══════════════════════════════════════════════════════════

import { createClient } from "npm:@supabase/supabase-js@2"

const db = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "")
const TOKEN = Deno.env.get("LOYVERSE_API_TOKEN") ?? ""
const BASE = "https://api.loyverse.com/v1.0"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}
const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d, null, 2), { status: s, headers: { ...CORS, "Content-Type": "application/json" } })

async function lvGet(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${TOKEN}` } })
  if (!r.ok) throw new Error(`GET ${path} ${r.status}: ${await r.text()}`)
  return await r.json()
}
async function lvPost(path: string, body: unknown) {
  const r = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(`POST ${path} ${r.status}: ${await r.text()}`)
  return await r.json()
}
async function lvDelete(path: string) {
  const r = await fetch(`${BASE}${path}`, { method: "DELETE", headers: { Authorization: `Bearer ${TOKEN}` } })
  if (!r.ok && r.status !== 204) throw new Error(`DELETE ${path} ${r.status}: ${await r.text()}`)
}
// deno-lint-ignore no-explicit-any
async function lvGetAll(path: string, key: string): Promise<any[]> {
  // deno-lint-ignore no-explicit-any
  const all: any[] = []
  let cursor: string | undefined
  do {
    const data = await lvGet(cursor ? `${path}?cursor=${cursor}&limit=250` : `${path}?limit=250`)
    all.push(...(data[key] ?? []))
    cursor = data.cursor || undefined
  } while (cursor)
  return all
}

interface BundleTier {
  tier_code: string
  category_name: string // "🧆 Bundle ×4"
  manakish: { name: string; price: number }[]
  sauces: { name: string; price: number }[]
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })
  if (!TOKEN) return json({ ok: false, error: "LOYVERSE_API_TOKEN not set" }, 500)

  try {
    const { data: cfg } = await db.rpc("fn_get_loyverse_config")
    const storeId = (cfg as Record<string, string> | null)?.store_id ?? ""
    if (!storeId) return json({ ok: false, error: "store_id not configured" }, 400)

    // ── 1. Build the desired POS shape from the DB (price_tiers source of truth) ──
    // Manakish per tier at the tier's discounted price.
    const { data: manaRows, error: mErr } = await db
      .from("v_dish_tier_prices")
      .select("tier_code, dish_id, effective_price")
    if (mErr) return json({ ok: false, error: `tier prices: ${mErr.message}` }, 500)

    // Names for the manakish + the bundle tier labels + the free sauces.
    const { data: tierMeta } = await db
      .from("price_tiers")
      .select("tier_code, label, bundle_dish_code")
      .not("bundle_dish_code", "is", null)

    // Names ONLY for the manakish referenced by the tier prices (targeted —
    // a broad is_available fetch hits Supabase's 1000-row cap and is non-deterministic).
    // deno-lint-ignore no-explicit-any
    const manaIds = [...new Set((manaRows ?? []).map((r: any) => r.dish_id as string))]
    const { data: manaNames } = await db
      .from("nomenclature")
      .select("id, name, customer_short_name")
      .in("id", manaIds)
    // deno-lint-ignore no-explicit-any
    const nameById = new Map<string, string>(
      (manaNames ?? []).map((n: any) => [n.id, (n.customer_short_name?.trim() || n.name) as string]),
    )

    // Free sauces: the ฿39 cups in KP-FIN-SDR (priced ฿0 in the bundle).
    const { data: sauceCat } = await db
      .from("product_categories").select("id").eq("code", "KP-FIN-SDR").single()
    const { data: sauceRows } = await db
      .from("nomenclature")
      .select("name, customer_short_name, price")
      .eq("is_available", true)
      // deno-lint-ignore no-explicit-any
      .eq("category_id", (sauceCat as any)?.id ?? "")
      .lte("price", 50)
    const sauces = (sauceRows ?? [])
      // deno-lint-ignore no-explicit-any
      .map((s: any) => ({ name: (s.customer_short_name?.trim() || s.name) as string, price: 0 }))

    const tiers: BundleTier[] = (tierMeta ?? []).map((t: { tier_code: string; label: string }) => ({
      tier_code: t.tier_code,
      category_name: `🧆 ${t.label}`,
      manakish: (manaRows ?? [])
        // deno-lint-ignore no-explicit-any
        .filter((r: any) => r.tier_code === t.tier_code)
        // deno-lint-ignore no-explicit-any
        .map((r: any) => ({ name: nameById.get(r.dish_id) ?? "", price: Number(r.effective_price) }))
        .filter((m: { name: string }) => m.name),
      sauces,
    }))

    // ── 2. Delete orphan slot modifier lists from the abandoned approach ──
    const existingMods = await lvGetAll("/modifiers", "modifiers")
    const orphanSlots = existingMods.filter((m) => /^Bundle (Manakish|Sauce) #\d+$/.test(m.name))
    for (const m of orphanSlots) await lvDelete(`/modifiers/${m.id}`)

    // ── 3. Ensure the 3 categories, then upsert their items at DB prices ──
    const existingCats = await lvGetAll("/categories", "categories")
    const catIdByName = new Map<string, string>(
      existingCats.filter((c) => !c.deleted_at).map((c) => [c.name, c.id]),
    )
    const allItems = await lvGetAll("/items", "items")

    const result: Record<string, { created: number; updated: number }> = {}

    for (const tier of tiers) {
      let catId = catIdByName.get(tier.category_name)
      if (!catId) {
        const created = await lvPost("/categories", { name: tier.category_name, color: "GREY" })
        catId = created.id
        catIdByName.set(tier.category_name, catId)
      }
      // Items already in this category, by name.
      const inCat = new Map<string, { id: string; raw: Record<string, unknown> }>()
      for (const it of allItems) {
        if (it.category_id === catId && !it.deleted_at) inCat.set(it.item_name, { id: it.id, raw: it })
      }

      let created = 0
      let updated = 0
      const lines = [...tier.manakish, ...tier.sauces]
      for (const line of lines) {
        const existing = inCat.get(line.name)
        const variant = {
          variant_name: "Regular",
          default_pricing_type: "FIXED",
          default_price: line.price,
          stores: [{ store_id: storeId, pricing_type: "FIXED", price: line.price, available_for_sale: true }],
        }
        if (existing) {
          // deno-lint-ignore no-explicit-any
          const v0 = ((existing.raw.variants as any[]) ?? [])[0]
          await lvPost("/items", {
            id: existing.id,
            item_name: line.name,
            category_id: catId,
            variants: [{ ...(v0 ?? {}), ...variant }],
          })
          updated++
        } else {
          await lvPost("/items", { item_name: line.name, category_id: catId, variants: [variant] })
          created++
        }
      }
      result[tier.category_name] = { created, updated }
    }

    return json({ ok: true, deleted_slots: orphanSlots.length, categories: result })
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500)
  }
})
