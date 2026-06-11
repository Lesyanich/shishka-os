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
//
// Flow:
//   1. CORS preflight / POST-only guard.
//   2. Validate body (mirrors @shishka/contracts createOrderRequestSchema).
//   3. Load referenced dishes; assert each is an available SALE-* item.
//   4. Compute total server-side; reject modifiers (v1 = ready dishes only).
//   5. Generate a daily order code (fn_next_order_code).
//   6. Insert orders + order_items. Status 'new', payment 'unpaid'.
//   7. Return { orderId, orderCode, totalAmount, status }.
//
// Deploy: `supabase functions deploy create-order`
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (from _shared/supabase.ts)
// ═══════════════════════════════════════════════════════════

import { z } from "npm:zod@4"
import { db } from "../_shared/supabase.ts"
import { CORS, json } from "../_shared/cors.ts"

// Mirrors @shishka/contracts (kept inline — Deno can't resolve the workspace pkg).
const cartItemSchema = z.object({
  nomenclatureId: z.string().uuid(),
  quantity: z.number().int().positive().max(99),
  modifierSlugs: z.array(z.string()).default([]),
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
  // than risk undercharging. (Modifier support is a planned fast-follow.)
  if (items.some((it) => it.modifierSlugs.length > 0)) {
    return json({ error: "modifiers_not_supported_v1" }, 400)
  }

  // 2. Load dishes and assert each is an available SALE-* item
  const ids = [...new Set(items.map((it) => it.nomenclatureId))]
  const { data: dishes, error: dishErr } = await db
    .from("nomenclature")
    .select("id, product_code, price, is_available")
    .in("id", ids)

  if (dishErr) return json({ error: "db_error", detail: dishErr.message }, 500)

  const byId = new Map((dishes ?? []).map((d) => [d.id as string, d]))
  for (const it of items) {
    const d = byId.get(it.nomenclatureId)
    if (!d) return json({ error: "dish_not_found", id: it.nomenclatureId }, 400)
    if (!String(d.product_code).toUpperCase().startsWith("SALE-")) {
      return json({ error: "not_a_menu_item", id: it.nomenclatureId }, 400)
    }
    if (!d.is_available) {
      return json({ error: "dish_unavailable", id: it.nomenclatureId }, 409)
    }
    if (d.price == null) {
      return json({ error: "dish_no_price", id: it.nomenclatureId }, 409)
    }
  }

  // 3. Server-computed total (client prices are ignored entirely)
  const total = items.reduce((sum, it) => {
    const price = Number(byId.get(it.nomenclatureId)!.price)
    return sum + price * it.quantity
  }, 0)

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

  // 6. Insert line items
  const rows = items.map((it) => ({
    order_id: order.id,
    nomenclature_id: it.nomenclatureId,
    quantity: it.quantity,
    price_at_purchase: Number(byId.get(it.nomenclatureId)!.price),
  }))
  const { error: itemsErr } = await db.from("order_items").insert(rows)

  if (itemsErr) {
    // Roll back the (now orphan) order so a retry gets a clean code.
    await db.from("orders").delete().eq("id", order.id)
    return json({ error: "items_insert_failed", detail: itemsErr.message }, 500)
  }

  return json({
    orderId: order.id,
    orderCode: order.order_code,
    totalAmount: Number(order.total_amount),
    status: order.status,
  })
})
