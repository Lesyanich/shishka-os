// ═══════════════════════════════════════════════════════════
// Edge Function: create-order
// Creates a website order from the QR menu (shishka.health).
//
// Security model:
//   • The client (apps/web) NEVER inserts into orders directly — anon has no
//     INSERT policy. It POSTs a cart here; this function runs with the service
//     role and is the only write path.
//   • Prices are NOT trusted from the client. We re-read the authoritative
//     price from `nomenclature` server-side and compute the total ourselves.
//     This applies to bundles too: the customer picks the manakish, the server
//     re-reads their prices and computes the discounted bundle total.
//
// Flow:
//   1. CORS preflight / POST-only guard.
//   2. Validate body (mirrors @shishka/contracts createOrderRequestSchema).
//   3. Load referenced dishes (+ category) and validate normal items + bundles.
//   4. Compute total server-side; reject modifiers (v1 = ready dishes only).
//   5. Generate a daily order code (fn_next_order_code).
//   6. Insert orders + order_items (bundles = parent line + child lines).
//   7. Return { orderId, orderCode, totalAmount, status }.
//
// Deploy: `supabase functions deploy create-order`
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (from _shared/supabase.ts)
// ═══════════════════════════════════════════════════════════

import { z } from "npm:zod@4"
import { db } from "../_shared/supabase.ts"
import { CORS, json } from "../_shared/cors.ts"

// ── Bundle config — MUST stay in sync with packages/contracts/src/bundles.ts ──
// (Deno can't import the workspace pkg, so the constants are mirrored here.)
const MANAKISH_CATEGORY = "KP-FIN-MAN"
const SAUCE_CATEGORY = "KP-FIN-SDR"
const SAUCE_MAX_PRICE = 50
const BUNDLE_DISCOUNT_PCT = 0.15
const MANAKISH_BUNDLES: Record<string, { manakishCount: number; sauceCount: number }> = {
  "SALE-BUNDLE_MANAKISH_4": { manakishCount: 4, sauceCount: 1 },
  "SALE-BUNDLE_MANAKISH_8": { manakishCount: 8, sauceCount: 2 },
  "SALE-BUNDLE_MANAKISH_12": { manakishCount: 12, sauceCount: 3 },
}
const bundlePrice = (manakishUnitPrices: number[]): number =>
  Math.round(manakishUnitPrices.reduce((s, p) => s + p, 0) * (1 - BUNDLE_DISCOUNT_PCT))

// Mirrors @shishka/contracts (kept inline — Deno can't resolve the workspace pkg).
const bundleChildSchema = z.object({
  nomenclatureId: z.string().uuid(),
  quantity: z.number().int().positive().max(99),
  role: z.enum(["manakish", "sauce"]),
})

const cartItemSchema = z.object({
  nomenclatureId: z.string().uuid(),
  quantity: z.number().int().positive().max(99),
  modifierSlugs: z.array(z.string()).default([]),
  bundle: z.object({ children: z.array(bundleChildSchema).min(1) }).optional(),
})

const requestSchema = z.object({
  channel: z.enum(["own_web", "own_app"]).default("own_web"),
  items: z.array(cartItemSchema).min(1).max(50),
  checkout: z.object({
    customerName: z.string().max(120).nullish(),
    customerPhone: z.string().max(32).nullish(),
    fulfillmentType: z.enum(["pickup", "dine_in"]).default("pickup"),
    tableNumber: z.string().max(16).nullish(),
    notes: z.string().max(500).nullish(),
  }),
})

interface DishRow {
  id: string
  product_code: string
  price: number | null
  is_available: boolean
  category: { code: string | null } | null
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405)

  // 1. Parse + validate
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return json({ error: "invalid_json" }, 400)
  }

  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) {
    return json({ error: "invalid_request", details: parsed.error.issues }, 400)
  }
  const { channel, items, checkout } = parsed.data

  if (checkout.fulfillmentType === "dine_in" && !checkout.tableNumber) {
    return json({ error: "table_number_required" }, 400)
  }

  // v1: ready dishes only — modifiers are not priced yet, so refuse them rather
  // than risk undercharging. (Bundles are a separate, fully-priced path.)
  if (items.some((it) => it.modifierSlugs.length > 0)) {
    return json({ error: "modifiers_not_supported_v1" }, 400)
  }

  // 2. Load every referenced dish (top-level items + bundle children) with category.
  const childIds = items.flatMap((it) => it.bundle?.children.map((c) => c.nomenclatureId) ?? [])
  const ids = [...new Set([...items.map((it) => it.nomenclatureId), ...childIds])]
  const { data: dishes, error: dishErr } = await db
    .from("nomenclature")
    .select("id, product_code, price, is_available, category:product_categories(code)")
    .in("id", ids)

  if (dishErr) return json({ error: "db_error", detail: dishErr.message }, 500)

  const byId = new Map<string, DishRow>(
    (dishes ?? []).map((d) => [d.id as string, d as unknown as DishRow]),
  )

  // 3. Validate items + compute the server-authoritative total.
  //    Bundle lines carry { parentId, total, children[] } for the insert step.
  interface NormalLine { nomenclatureId: string; quantity: number; price: number }
  interface BundleLine {
    nomenclatureId: string
    total: number
    children: { nomenclatureId: string; quantity: number; role: "manakish" | "sauce"; price: number }[]
  }
  const normalLines: NormalLine[] = []
  const bundleLines: BundleLine[] = []
  let total = 0

  for (const it of items) {
    const d = byId.get(it.nomenclatureId)
    if (!d) return json({ error: "dish_not_found", id: it.nomenclatureId }, 400)
    if (!String(d.product_code).toUpperCase().startsWith("SALE-")) {
      return json({ error: "not_a_menu_item", id: it.nomenclatureId }, 400)
    }
    if (!d.is_available) return json({ error: "dish_unavailable", id: it.nomenclatureId }, 409)

    const bundleDef = MANAKISH_BUNDLES[d.product_code]

    // ── Bundle line ──
    if (it.bundle) {
      if (!bundleDef) return json({ error: "not_a_bundle", id: it.nomenclatureId }, 400)

      const manakishPrices: number[] = []
      let manakishQty = 0
      let sauceQty = 0
      const children: BundleLine["children"] = []

      for (const child of it.bundle.children) {
        const cd = byId.get(child.nomenclatureId)
        if (!cd) return json({ error: "bundle_child_not_found", id: child.nomenclatureId }, 400)
        if (!cd.is_available) {
          return json({ error: "bundle_child_unavailable", id: child.nomenclatureId }, 409)
        }
        if (!String(cd.product_code).toUpperCase().startsWith("SALE-")) {
          return json({ error: "bundle_child_not_menu_item", id: child.nomenclatureId }, 400)
        }
        const catCode = cd.category?.code ?? null

        if (child.role === "manakish") {
          if (catCode !== MANAKISH_CATEGORY) {
            return json({ error: "bundle_child_not_manakish", id: child.nomenclatureId }, 400)
          }
          if (cd.price == null) {
            return json({ error: "bundle_child_no_price", id: child.nomenclatureId }, 409)
          }
          manakishQty += child.quantity
          for (let i = 0; i < child.quantity; i++) manakishPrices.push(Number(cd.price))
          children.push({ ...child, price: Number(cd.price) })
        } else {
          // sauce — free, but must be an eligible cup
          if (catCode !== SAUCE_CATEGORY || cd.price == null || Number(cd.price) > SAUCE_MAX_PRICE) {
            return json({ error: "bundle_child_not_eligible_sauce", id: child.nomenclatureId }, 400)
          }
          sauceQty += child.quantity
          children.push({ ...child, price: 0 })
        }
      }

      if (manakishQty !== bundleDef.manakishCount || sauceQty !== bundleDef.sauceCount) {
        return json(
          {
            error: "invalid_bundle",
            id: it.nomenclatureId,
            expected: bundleDef,
            got: { manakishCount: manakishQty, sauceCount: sauceQty },
          },
          400,
        )
      }

      const lineTotal = bundlePrice(manakishPrices)
      total += lineTotal
      bundleLines.push({ nomenclatureId: it.nomenclatureId, total: lineTotal, children })
      continue
    }

    // ── Normal line ──
    if (bundleDef) return json({ error: "bundle_requires_selection", id: it.nomenclatureId }, 400)
    if (d.price == null) return json({ error: "dish_no_price", id: it.nomenclatureId }, 409)
    normalLines.push({ nomenclatureId: it.nomenclatureId, quantity: it.quantity, price: Number(d.price) })
    total += Number(d.price) * it.quantity
  }

  // 4. Daily order code
  const { data: codeData, error: codeErr } = await db.rpc("fn_next_order_code")
  if (codeErr) return json({ error: "code_error", detail: codeErr.message }, 500)
  const orderCode = codeData as string

  // 5. Insert order
  const { data: order, error: orderErr } = await db
    .from("orders")
    .insert({
      source: "website",
      status: "new",
      channel,
      order_code: orderCode,
      payment_status: "unpaid",
      fulfillment_type: checkout.fulfillmentType,
      table_number: checkout.tableNumber ?? null,
      customer_name: checkout.customerName ?? null,
      customer_phone: checkout.customerPhone ?? null,
      notes: checkout.notes ?? null,
      total_amount: total,
    })
    .select("id, order_code, status, total_amount")
    .single()

  if (orderErr) return json({ error: "order_insert_failed", detail: orderErr.message }, 500)

  const rollback = async (detail: string, code = "items_insert_failed") => {
    // Roll back the (now orphan) order so a retry gets a clean code.
    await db.from("orders").delete().eq("id", order.id)
    return json({ error: code, detail }, 500)
  }

  // 6a. Normal line items
  if (normalLines.length > 0) {
    const rows = normalLines.map((l) => ({
      order_id: order.id,
      nomenclature_id: l.nomenclatureId,
      quantity: l.quantity,
      price_at_purchase: l.price,
    }))
    const { error: itemsErr } = await db.from("order_items").insert(rows)
    if (itemsErr) return rollback(itemsErr.message)
  }

  // 6b. Bundle line items — parent (carries the money) + free-priced children
  //     (carry which dishes the kitchen makes). Nesting via parent_item_id +
  //     modifier_type, the same shape OrderDetailsModal already renders.
  for (const bl of bundleLines) {
    const { data: parent, error: parentErr } = await db
      .from("order_items")
      .insert({
        order_id: order.id,
        nomenclature_id: bl.nomenclatureId,
        quantity: 1,
        price_at_purchase: bl.total,
      })
      .select("id")
      .single()
    if (parentErr || !parent) return rollback(parentErr?.message ?? "bundle_parent_insert_failed")

    const childRows = bl.children.map((c) => ({
      order_id: order.id,
      nomenclature_id: c.nomenclatureId,
      quantity: c.quantity,
      price_at_purchase: 0, // money lives on the parent line
      parent_item_id: parent.id,
      modifier_type: c.role,
    }))
    const { error: childErr } = await db.from("order_items").insert(childRows)
    if (childErr) return rollback(childErr.message)
  }

  return json({
    orderId: order.id,
    orderCode: order.order_code,
    totalAmount: Number(order.total_amount),
    status: order.status,
  })
})
