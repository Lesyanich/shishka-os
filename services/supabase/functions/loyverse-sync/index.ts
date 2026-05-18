// ═══════════════════════════════════════════════════════════
// Edge Function: loyverse-sync
// Push categories + SALE-* menu items to Loyverse POS
//
// Actions:
//   GET  ?action=status              → last 10 sync log entries
//   POST ?action=categories          → push product_categories → Loyverse
//   POST ?action=items               → push SALE-* nomenclature → Loyverse
//   POST ?action=full                → categories then items
//   POST ?action=push_dish&dish_id=X → push a single SALE-* dish (gated by
//                                       fn_loyverse_sync_dish readiness check)
//   POST ?action=pull_modifiers      → pull Loyverse modifier_lists into raw mirror
//
// Auth: Bearer token from LOYVERSE_API_TOKEN env var
// ═══════════════════════════════════════════════════════════

import { db } from "../_shared/supabase.ts"

const LOYVERSE_TOKEN = Deno.env.get("LOYVERSE_API_TOKEN") ?? ""
const LOYVERSE_BASE = "https://api.loyverse.com/v1.0"

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  })
}

// ── Loyverse API helpers ──

async function loyverseGet(path: string) {
  const res = await fetch(`${LOYVERSE_BASE}${path}`, {
    headers: { Authorization: `Bearer ${LOYVERSE_TOKEN}` },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Loyverse GET ${path} failed (${res.status}): ${body}`)
  }
  return await res.json()
}

async function loyversePost(path: string, body: unknown) {
  const res = await fetch(`${LOYVERSE_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOYVERSE_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Loyverse POST ${path} failed (${res.status}): ${text}`)
  }
  return await res.json()
}

// Paginated fetch — Loyverse uses cursor-based pagination
async function loyverseGetAll<T>(path: string, key: string): Promise<T[]> {
  const all: T[] = []
  let cursor: string | undefined
  do {
    const url = cursor ? `${path}?cursor=${cursor}&limit=250` : `${path}?limit=250`
    const data = await loyverseGet(url)
    all.push(...(data[key] ?? []))
    cursor = data.cursor || undefined
  } while (cursor)
  return all
}

// ── Config helpers ──

async function getStoreId(): Promise<string> {
  const { data } = await db.rpc("fn_get_loyverse_config")
  const config = data as Record<string, string> | null
  return config?.store_id ?? ""
}

// ── Sync log helpers ──

async function logStart(syncType: string, total: number): Promise<string> {
  const { data } = await db
    .from("loyverse_sync_log")
    .insert({ sync_type: syncType, direction: "push", status: "pending", records_total: total })
    .select("id")
    .single()
  return data?.id ?? ""
}

async function logFinish(
  id: string,
  status: "success" | "error",
  synced: number,
  failed: number,
  errorMessage?: string,
) {
  await db
    .from("loyverse_sync_log")
    .update({
      status,
      records_synced: synced,
      records_failed: failed,
      error_message: errorMessage ?? null,
      completed_at: new Date().toISOString(),
    })
    .eq("id", id)
}

// ── Action: status ──

async function handleStatus() {
  const { data, error } = await db
    .from("loyverse_sync_log")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(10)

  if (error) throw new Error(`Sync log query failed: ${error.message}`)

  return json({ ok: true, logs: data })
}

// ── Action: categories ──

interface LoyverseCategory {
  id: string
  name: string
  color: string
  deleted_at: string | null
}

async function handleCategories() {
  const storeId = await getStoreId()
  if (!storeId) return json({ ok: false, error: "store_id not configured" }, 400)

  // Fetch Shishka categories that have SALE-* dishes
  const { data: categories, error: catErr } = await db
    .from("product_categories")
    .select("id, code, name, loyverse_category_id")
    .order("sort_order")

  if (catErr) throw new Error(`Categories query failed: ${catErr.message}`)
  if (!categories?.length) return json({ ok: true, synced: 0, message: "No categories to sync" })

  // Filter to categories that actually contain SALE dishes
  const { data: dishCats } = await db
    .from("nomenclature")
    .select("category_id")
    .ilike("product_code", "SALE-%")
    .not("category_id", "is", null)

  const usedCatIds = new Set((dishCats ?? []).map((d: { category_id: string }) => d.category_id))
  const toSync = categories.filter((c: { id: string }) => usedCatIds.has(c.id))

  const logId = await logStart("categories_push", toSync.length)

  // Fetch existing Loyverse categories
  const existing = await loyverseGetAll<LoyverseCategory>("/categories", "categories")
  const existingByName = new Map(existing.filter(c => !c.deleted_at).map(c => [c.name, c.id]))

  let synced = 0
  let failed = 0
  const errors: string[] = []

  for (const cat of toSync) {
    try {
      // Already mapped?
      if (cat.loyverse_category_id) {
        synced++
        continue
      }

      // Exists in Loyverse by name?
      const existingId = existingByName.get(cat.name)
      if (existingId) {
        await db
          .from("product_categories")
          .update({ loyverse_category_id: existingId })
          .eq("id", cat.id)
        synced++
        continue
      }

      // Create new
      const created = await loyversePost("/categories", {
        name: cat.name,
        color: "GREY",
      })

      await db
        .from("product_categories")
        .update({ loyverse_category_id: created.id })
        .eq("id", cat.id)

      existingByName.set(cat.name, created.id)
      synced++
    } catch (e) {
      failed++
      errors.push(`${cat.name}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  await logFinish(logId, failed > 0 ? "error" : "success", synced, failed, errors.join("; ") || undefined)

  return json({ ok: true, total: toSync.length, synced, failed, errors: errors.length ? errors : undefined })
}

// ── Action: items ──

interface ShishkaDish {
  id: string
  name: string
  product_code: string
  price: number | null
  is_available: boolean
  loyverse_item_id: string | null
  category_id: string | null
  product_categories: { loyverse_category_id: string | null } | null
}

interface LoyverseItem {
  id: string
  item_name: string
  deleted_at: string | null
}

async function handleItems() {
  const storeId = await getStoreId()
  if (!storeId) return json({ ok: false, error: "store_id not configured" }, 400)

  // Fetch SALE-* dishes
  const { data: dishes, error: dishErr } = await db
    .from("nomenclature")
    .select("id, name, product_code, price, is_available, loyverse_item_id, category_id, product_categories!category_id(loyverse_category_id)")
    .ilike("product_code", "SALE-%")
    .eq("is_available", true)
    .order("name")

  if (dishErr) throw new Error(`Dishes query failed: ${dishErr.message}`)
  if (!dishes?.length) return json({ ok: true, synced: 0, message: "No available SALE dishes" })

  const logId = await logStart("items_push", dishes.length)

  // Fetch existing Loyverse items for idempotency
  const existing = await loyverseGetAll<LoyverseItem>("/items", "items")
  const existingByName = new Map(existing.filter(i => !i.deleted_at).map(i => [i.item_name, i.id]))

  let synced = 0
  let failed = 0
  const errors: string[] = []

  for (const dish of dishes as ShishkaDish[]) {
    try {
      // Already mapped?
      if (dish.loyverse_item_id) {
        synced++
        continue
      }

      const price = dish.price ?? 0
      const categoryId = dish.product_categories?.loyverse_category_id ?? null

      // Exists in Loyverse by name?
      const existingId = existingByName.get(dish.name)
      if (existingId) {
        await db
          .from("nomenclature")
          .update({ loyverse_item_id: existingId })
          .eq("id", dish.id)
        synced++
        continue
      }

      // Create in Loyverse
      const itemBody: Record<string, unknown> = {
        item_name: dish.name,
        variants: [
          {
            variant_name: "Regular",
            default_pricing_type: "FIXED",
            default_price: price,
            stores: [
              {
                store_id: storeId,
                pricing_type: "FIXED",
                price: price,
                available_for_sale: true,
              },
            ],
          },
        ],
      }
      if (categoryId) {
        itemBody.category_id = categoryId
      }

      const created = await loyversePost("/items", itemBody)

      await db
        .from("nomenclature")
        .update({ loyverse_item_id: created.id })
        .eq("id", dish.id)

      existingByName.set(dish.name, created.id)
      synced++

      // Rate limit: 60 req/min — small delay between creates
      if (synced % 50 === 0) {
        await new Promise(r => setTimeout(r, 1000))
      }
    } catch (e) {
      failed++
      errors.push(`${dish.name}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  await logFinish(logId, failed > 0 ? "error" : "success", synced, failed, errors.join("; ") || undefined)

  return json({ ok: true, total: dishes.length, synced, failed, errors: errors.length ? errors : undefined })
}

// ── Action: push_dish (single SALE-* item) ──

interface SyncDishRpcResponse {
  ok: boolean
  error?: string
  reason?: string
  pos_status?: string
  is_available?: boolean
  payload?: {
    name: string
    description: string
    image_url: string | null
    default_price: number | null
  }
}

async function handlePushDish(dishId: string) {
  if (!dishId) return json({ ok: false, error: "dish_id required" }, 400)

  const storeId = await getStoreId()
  if (!storeId) return json({ ok: false, error: "store_id not configured" }, 400)

  // 1. Build validated payload via the DB RPC (pos_status + is_available gate).
  const { data: rpcRaw, error: rpcErr } = await db.rpc("fn_loyverse_sync_dish", {
    p_dish_id: dishId,
  })
  if (rpcErr) return json({ ok: false, error: `RPC failed: ${rpcErr.message}` }, 500)
  const rpc = rpcRaw as SyncDishRpcResponse
  if (!rpc.ok) {
    return json(
      {
        ok: false,
        error: rpc.error ?? "not_ready",
        reason: rpc.reason,
        pos_status: rpc.pos_status,
        is_available: rpc.is_available,
      },
      400,
    )
  }
  if (!rpc.payload) return json({ ok: false, error: "empty_payload" }, 500)

  // 2. Fetch existing loyverse_item_id + linked category.
  const { data: dishRow, error: dishErr } = await db
    .from("nomenclature")
    .select(
      "id, name, loyverse_item_id, category_id, product_categories!category_id(loyverse_category_id)",
    )
    .eq("id", dishId)
    .single()
  if (dishErr) return json({ ok: false, error: dishErr.message }, 500)
  const linkedCategoryId =
    (dishRow as { product_categories: { loyverse_category_id: string | null } | null })
      .product_categories?.loyverse_category_id ?? null

  const logId = await logStart("dish_push", 1)

  try {
    const price = rpc.payload.default_price ?? 0
    const itemBody: Record<string, unknown> = {
      item_name: rpc.payload.name,
      description: rpc.payload.description,
      variants: [
        {
          variant_name: "Regular",
          default_pricing_type: "FIXED",
          default_price: price,
          stores: [
            {
              store_id: storeId,
              pricing_type: "FIXED",
              price,
              available_for_sale: true,
            },
          ],
        },
      ],
    }
    if (linkedCategoryId) itemBody.category_id = linkedCategoryId
    if (rpc.payload.image_url) itemBody.image_url = rpc.payload.image_url

    let loyverseItemId = (dishRow as { loyverse_item_id: string | null })
      .loyverse_item_id

    if (loyverseItemId) {
      // UPDATE — Loyverse POST /items with id is an upsert
      itemBody.id = loyverseItemId
    }

    const result = await loyversePost("/items", itemBody)
    loyverseItemId = (result as { id?: string }).id ?? loyverseItemId

    if (loyverseItemId) {
      await db
        .from("nomenclature")
        .update({ loyverse_item_id: loyverseItemId, pos_status: "synced" })
        .eq("id", dishId)
    }

    await logFinish(logId, "success", 1, 0)
    return json({ ok: true, loyverse_item_id: loyverseItemId, payload: rpc.payload })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    await logFinish(logId, "error", 0, 1, message)
    return json({ ok: false, error: message }, 502)
  }
}

// ── Action: pull_modifiers ──
//
// Loyverse API shape (verified 2026-05-18):
//   GET /v1.0/modifiers                 → { modifiers: [...] }
//   modifier fields: id, name, min_select, max_select, modifier_options
//   option fields:   id, name, price
//   NOTE: field names are min_select/max_select and modifier_options
//         (NOT min_select_modifier/max_select_modifier/modifiers as in older docs)

interface LoyverseModifierOption {
  id: string
  name: string
  price?: number
}

interface LoyverseModifierList {
  id: string
  name: string
  min_select?: number
  max_select?: number
  modifier_options?: LoyverseModifierOption[]
}

const KNOWN_SLOTS = ['base', 'protein', 'greens', 'topping', 'sauce']

async function handlePullModifiers() {
  const logId = await logStart('modifiers_pull', 0)

  let lists: LoyverseModifierList[]
  try {
    lists = await loyverseGetAll<LoyverseModifierList>('/modifiers', 'modifiers')
  } catch (e) {
    await logFinish(logId, 'error', 0, 0, e instanceof Error ? e.message : String(e))
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 502)
  }

  const optionRows: Array<{
    id: string
    list_id: string
    name: string
    price: number | null
    raw: LoyverseModifierOption
  }> = []

  const listRows = lists.map((l) => {
    for (const m of l.modifier_options ?? []) {
      optionRows.push({
        id: m.id,
        list_id: l.id,
        name: m.name,
        price: m.price ?? null,
        raw: m,
      })
    }
    return {
      id: l.id,
      name: l.name,
      min_select: l.min_select ?? null,
      max_select: l.max_select ?? null,
      raw: l,
    }
  })

  const warnings: string[] = []
  for (const l of listRows) {
    if (!KNOWN_SLOTS.includes(l.name.toLowerCase())) {
      warnings.push(`List "${l.name}" does not match slot vocabulary (base/protein/greens/topping/sauce)`)
    }
  }

  const { error: txErr } = await db.rpc('fn_refresh_loyverse_modifier_mirror', {
    p_lists: listRows,
    p_options: optionRows,
  })
  if (txErr) {
    await logFinish(logId, 'error', 0, 0, `Mirror refresh failed: ${txErr.message}`)
    return json({ ok: false, error: txErr.message }, 500)
  }

  await logFinish(logId, 'success', listRows.length, 0)

  return json({
    ok: true,
    lists: listRows.length,
    options: optionRows.length,
    warnings: warnings.length ? warnings : undefined,
  })
}

// ── Main handler ──

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS })
  }

  try {
    if (!LOYVERSE_TOKEN) {
      return json({ ok: false, error: "LOYVERSE_API_TOKEN not set" }, 500)
    }

    const url = new URL(req.url)
    const action = url.searchParams.get("action") ?? ""

    switch (action) {
      case "status":
        return await handleStatus()

      case "categories":
        if (req.method !== "POST") return json({ ok: false, error: "POST required" }, 405)
        return await handleCategories()

      case "items":
        if (req.method !== "POST") return json({ ok: false, error: "POST required" }, 405)
        return await handleItems()

      case "full":
        if (req.method !== "POST") return json({ ok: false, error: "POST required" }, 405)
        await handleCategories()
        return await handleItems()

      case "push_dish": {
        if (req.method !== "POST") return json({ ok: false, error: "POST required" }, 405)
        const dishId = url.searchParams.get("dish_id") ?? ""
        return await handlePushDish(dishId)
      }

      case "pull_modifiers":
        if (req.method !== "POST") return json({ ok: false, error: "POST required" }, 405)
        return await handlePullModifiers()

      default:
        return json(
          { ok: false, error: "Unknown action. Use: status, categories, items, full, push_dish, pull_modifiers" },
          400,
        )
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await db.from("loyverse_sync_log").insert({
      sync_type: "error",
      direction: "push",
      status: "error",
      error_message: message,
    }).catch(() => {})
    return json({ ok: false, error: message }, 500)
  }
})
