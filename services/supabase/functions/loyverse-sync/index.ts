// ═══════════════════════════════════════════════════════════
// Edge Function: loyverse-sync
// Push categories + SALE-* menu items to Loyverse POS, and
// pull / manage modifier lists.
//
// Actions:
//   GET  ?action=status                 → last 10 sync log entries
//   POST ?action=categories             → push product_categories → Loyverse
//   POST ?action=push_dish&dish_id=X    → push a single SALE-* dish (RPC-gated)
//   POST ?action=pull_modifiers         → pull Loyverse modifier_lists → raw mirror
//   POST ?action=create_modifier        → create a new modifier list (body)
//   GET  ?action=get_item&item_id=X     → fetch a single Loyverse item (raw)
//   POST ?action=recreate_item          → delete+recreate an item with modifiers_ids (body)
//   POST ?action=add_modifier_option&list_id=X&name=Y&price=N
//                                        → add one option to an existing modifier list
//   GET  ?action=item_modifiers         → each Loyverse item + its modifier-list ids
//
// Auth: Bearer token from LOYVERSE_API_TOKEN env var
// ═══════════════════════════════════════════════════════════

import { createClient } from "npm:@supabase/supabase-js@2"

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
const db = createClient(supabaseUrl, supabaseKey)

const LOYVERSE_TOKEN = Deno.env.get("LOYVERSE_API_TOKEN") ?? ""
const LOYVERSE_BASE = "https://api.loyverse.com/v1.0"

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

async function loyverseDelete(path: string) {
  const res = await fetch(`${LOYVERSE_BASE}${path}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${LOYVERSE_TOKEN}` },
  })
  if (!res.ok && res.status !== 204) {
    const text = await res.text()
    throw new Error(`Loyverse DELETE ${path} failed (${res.status}): ${text}`)
  }
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

// ── Config / log helpers ──

async function getStoreId(): Promise<string> {
  const { data } = await db.rpc("fn_get_loyverse_config")
  return (data as Record<string, string> | null)?.store_id ?? ""
}

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

// ── Action: get_item ──

async function handleGetItem(itemId: string) {
  if (!itemId) return json({ ok: false, error: "item_id required" }, 400)
  try {
    const item = await loyverseGet(`/items/${itemId}`)
    return json({ ok: true, item })
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 502)
  }
}

// ── Action: recreate_item ──
// Loyverse upsert ignores category_id + modifiers_ids on existing items, so to
// (re)bind modifiers we must DELETE the old item then CREATE a fresh one.

async function handleRecreateItem(req: Request) {
  const body = await req.json()
  if (!body.dish_id) return json({ ok: false, error: "dish_id required" }, 400)
  const storeId = await getStoreId()
  if (!storeId) return json({ ok: false, error: "store_id not configured" }, 400)

  const { data: dish, error: dishErr } = await db
    .from("nomenclature")
    .select("id, name, price, loyverse_item_id, product_categories!category_id(loyverse_category_id)")
    .eq("id", body.dish_id)
    .single()
  if (dishErr || !dish) return json({ ok: false, error: dishErr?.message ?? "dish not found" }, 404)

  // deno-lint-ignore no-explicit-any
  const oldLoyverseId = (dish as any).loyverse_item_id
  if (oldLoyverseId) {
    try { await loyverseDelete(`/items/${oldLoyverseId}`) } catch (_e) { /* ignore */ }
  }
  await db.from("nomenclature").update({ loyverse_item_id: null, pos_status: "approved" }).eq("id", body.dish_id)

  // deno-lint-ignore no-explicit-any
  const categoryId = (dish as any).product_categories?.loyverse_category_id ?? null
  // deno-lint-ignore no-explicit-any
  const price = (dish as any).price ?? 0
  const itemBody: Record<string, unknown> = {
    item_name: (dish as { name: string }).name,
    variants: [{
      variant_name: "Regular",
      default_pricing_type: "FIXED",
      default_price: price,
      stores: [{ store_id: storeId, pricing_type: "FIXED", price, available_for_sale: true }],
    }],
  }
  if (categoryId) itemBody.category_id = categoryId
  if (body.modifier_ids && body.modifier_ids.length > 0) itemBody.modifiers_ids = body.modifier_ids

  try {
    const created = await loyversePost("/items", itemBody)
    const newId = created.id
    await db.from("nomenclature").update({ loyverse_item_id: newId, pos_status: "synced" }).eq("id", body.dish_id)
    return json({
      ok: true,
      item_name: created.item_name,
      loyverse_item_id: newId,
      category_id: created.category_id,
      modifiers_ids: created.modifiers_ids,
      old_id: oldLoyverseId,
    })
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 502)
  }
}

// ── Action: categories ──

async function handleCategories() {
  const storeId = await getStoreId()
  if (!storeId) return json({ ok: false, error: "store_id not configured" }, 400)

  const { data: categories, error: catErr } = await db
    .from("product_categories")
    .select("id, code, name, loyverse_category_id")
    .order("sort_order")
  if (catErr) throw new Error(`Categories query failed: ${catErr.message}`)
  if (!categories?.length) return json({ ok: true, synced: 0 })

  const { data: dishCats } = await db
    .from("nomenclature")
    .select("category_id")
    .ilike("product_code", "SALE-%")
    .not("category_id", "is", null)
  // deno-lint-ignore no-explicit-any
  const usedCatIds = new Set((dishCats ?? []).map((d: any) => d.category_id))
  // deno-lint-ignore no-explicit-any
  const toSync = categories.filter((c: any) => usedCatIds.has(c.id))

  const logId = await logStart("categories_push", toSync.length)
  // deno-lint-ignore no-explicit-any
  const existing = await loyverseGetAll<any>("/categories", "categories")
  // deno-lint-ignore no-explicit-any
  const existingByName = new Map(existing.filter((c: any) => !c.deleted_at).map((c: any) => [c.name, c.id]))

  let synced = 0
  let failed = 0
  const errors: string[] = []
  // deno-lint-ignore no-explicit-any
  for (const cat of toSync as any[]) {
    try {
      if (cat.loyverse_category_id) { synced++; continue }
      const eid = existingByName.get(cat.name)
      if (eid) {
        await db.from("product_categories").update({ loyverse_category_id: eid }).eq("id", cat.id)
        synced++; continue
      }
      const created = await loyversePost("/categories", { name: cat.name, color: "GREY" })
      await db.from("product_categories").update({ loyverse_category_id: created.id }).eq("id", cat.id)
      synced++
    } catch (e) {
      failed++
      errors.push(`${cat.name}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  await logFinish(logId, failed > 0 ? "error" : "success", synced, failed, errors.join("; ") || undefined)
  return json({ ok: true, total: toSync.length, synced, failed })
}

// ── Action: push_dish (single SALE-* item) ──

async function handlePushDish(dishId: string) {
  if (!dishId) return json({ ok: false, error: "dish_id required" }, 400)
  const storeId = await getStoreId()
  if (!storeId) return json({ ok: false, error: "store_id not configured" }, 400)

  const { data: rpcRaw, error: rpcErr } = await db.rpc("fn_loyverse_sync_dish", { p_dish_id: dishId })
  if (rpcErr) return json({ ok: false, error: `RPC failed: ${rpcErr.message}` }, 500)
  // deno-lint-ignore no-explicit-any
  const rpc = rpcRaw as any
  if (!rpc.ok) return json({ ok: false, error: rpc.error ?? "not_ready", reason: rpc.reason, pos_status: rpc.pos_status }, 400)
  if (!rpc.payload) return json({ ok: false, error: "empty_payload" }, 500)

  const { data: dishRow, error: dishErr } = await db
    .from("nomenclature")
    .select("id, name, loyverse_item_id, category_id, product_categories!category_id(loyverse_category_id)")
    .eq("id", dishId)
    .single()
  if (dishErr) return json({ ok: false, error: dishErr.message }, 500)
  // deno-lint-ignore no-explicit-any
  const linkedCategoryId = (dishRow as any).product_categories?.loyverse_category_id ?? null

  const logId = await logStart("dish_push", 1)
  try {
    const price = rpc.payload.default_price ?? 0
    const itemBody: Record<string, unknown> = {
      item_name: rpc.payload.name,
      description: rpc.payload.description,
      variants: [{
        variant_name: "Regular",
        default_pricing_type: "FIXED",
        default_price: price,
        stores: [{ store_id: storeId, pricing_type: "FIXED", price, available_for_sale: true }],
      }],
    }
    if (linkedCategoryId) itemBody.category_id = linkedCategoryId
    if (rpc.payload.image_url) itemBody.image_url = rpc.payload.image_url
    // deno-lint-ignore no-explicit-any
    let loyverseItemId = (dishRow as any).loyverse_item_id
    if (loyverseItemId) itemBody.id = loyverseItemId
    const result = await loyversePost("/items", itemBody)
    loyverseItemId = result.id ?? loyverseItemId
    if (loyverseItemId) {
      await db.from("nomenclature").update({ loyverse_item_id: loyverseItemId, pos_status: "synced" }).eq("id", dishId)
    }
    await logFinish(logId, "success", 1, 0)
    return json({ ok: true, loyverse_item_id: loyverseItemId, payload: rpc.payload })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await logFinish(logId, "error", 0, 1, msg)
    return json({ ok: false, error: msg }, 502)
  }
}

// ── Action: pull_modifiers ──

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

async function handlePullModifiers() {
  const logId = await logStart("modifiers_pull", 0)
  let lists: LoyverseModifierList[]
  try {
    lists = await loyverseGetAll<LoyverseModifierList>("/modifiers", "modifiers")
  } catch (e) {
    await logFinish(logId, "error", 0, 0, e instanceof Error ? e.message : String(e))
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 502)
  }

  // deno-lint-ignore no-explicit-any
  const optionRows: any[] = []
  const listRows = lists.map((l) => {
    for (const m of l.modifier_options ?? []) {
      optionRows.push({ id: m.id, list_id: l.id, name: m.name, price: m.price ?? null, raw: m })
    }
    return { id: l.id, name: l.name, min_select: l.min_select ?? null, max_select: l.max_select ?? null, raw: l }
  })

  const { error: txErr } = await db.rpc("fn_refresh_loyverse_modifier_mirror", {
    p_lists: listRows,
    p_options: optionRows,
  })
  if (txErr) {
    await logFinish(logId, "error", 0, 0, txErr.message)
    return json({ ok: false, error: txErr.message }, 500)
  }
  await logFinish(logId, "success", listRows.length, 0)
  return json({ ok: true, lists: listRows.length, options: optionRows.length })
}

// ── Action: create_modifier ──

async function handleCreateModifier(req: Request) {
  const body = await req.json()
  if (!body.name || !body.modifier_options?.length) {
    return json({ ok: false, error: "name and modifier_options[] required" }, 400)
  }
  try {
    const created = await loyversePost("/modifiers", {
      name: body.name,
      min_select: body.min_select ?? 0,
      max_select: body.max_select ?? 1,
      // deno-lint-ignore no-explicit-any
      modifier_options: body.modifier_options.map((o: any) => ({ name: o.name, price: o.price ?? 0 })),
    })
    await handlePullModifiers()
    return json({ ok: true, modifier: created })
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 502)
  }
}

// ── Action: add_modifier_option ──
// Adds a single option to an existing Loyverse modifier list (idempotent by name).
// Loyverse updates a modifier by POST /modifiers with the id and the FULL
// modifier_options array — existing options keep their ids, new ones omit id.

async function handleAddModifierOption(listId: string, optName: string, price: number) {
  if (!listId || !optName) return json({ ok: false, error: "list_id and name required" }, 400)

  const all = await loyverseGetAll<LoyverseModifierList>("/modifiers", "modifiers")
  const list = all.find((l) => l.id === listId)
  if (!list) return json({ ok: false, error: `modifier list ${listId} not found` }, 404)

  const opts = list.modifier_options ?? []
  if (opts.some((o) => o.name.trim().toLowerCase() === optName.trim().toLowerCase())) {
    return json({ ok: true, skipped: true, message: `"${optName}" already in "${list.name}"` })
  }

  const result = await loyversePost("/modifiers", {
    id: list.id,
    name: list.name,
    min_select: list.min_select ?? 0,
    max_select: list.max_select ?? 0,
    modifier_options: [
      ...opts.map((o) => ({ id: o.id, name: o.name, price: o.price ?? 0 })),
      { name: optName, price },
    ],
  })
  await handlePullModifiers()
  return json({ ok: true, list: list.name, added: optName, price, modifier_id: (result as { id?: string }).id })
}

// ── Action: item_modifiers ──
// Returns each Loyverse item with the modifier-list ids attached, to mirror the
// dish→modifier-list bindings exactly as configured in Loyverse. Loyverse has used
// both `modifiers_ids` and `modifier_ids` across versions — read both.

interface LoyverseItemModifiers {
  id: string
  item_name: string
  modifiers_ids?: string[]
  modifier_ids?: string[]
  deleted_at: string | null
}

async function handleItemModifiers() {
  const items = await loyverseGetAll<LoyverseItemModifiers>("/items", "items")
  const mapping = items
    .filter((i) => !i.deleted_at)
    .map((i) => ({
      item_id: i.id,
      item_name: i.item_name,
      modifier_list_ids: i.modifiers_ids ?? i.modifier_ids ?? [],
    }))
  const withMods = mapping.filter((m) => m.modifier_list_ids.length > 0)
  return json({ ok: true, total: mapping.length, with_modifiers: withMods.length, items: mapping })
}

// ── Main handler ──

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS })
  try {
    if (!LOYVERSE_TOKEN) return json({ ok: false, error: "LOYVERSE_API_TOKEN not set" }, 500)
    const url = new URL(req.url)
    const action = url.searchParams.get("action") ?? ""
    switch (action) {
      case "status":
        return await handleStatus()
      case "categories":
        if (req.method !== "POST") return json({ ok: false, error: "POST required" }, 405)
        return await handleCategories()
      case "push_dish": {
        if (req.method !== "POST") return json({ ok: false, error: "POST required" }, 405)
        return await handlePushDish(url.searchParams.get("dish_id") ?? "")
      }
      case "pull_modifiers":
        if (req.method !== "POST") return json({ ok: false, error: "POST required" }, 405)
        return await handlePullModifiers()
      case "create_modifier":
        if (req.method !== "POST") return json({ ok: false, error: "POST required" }, 405)
        return await handleCreateModifier(req)
      case "get_item":
        return await handleGetItem(url.searchParams.get("item_id") ?? "")
      case "recreate_item":
        if (req.method !== "POST") return json({ ok: false, error: "POST required" }, 405)
        return await handleRecreateItem(req)
      case "add_modifier_option": {
        if (req.method !== "POST") return json({ ok: false, error: "POST required" }, 405)
        const listId = url.searchParams.get("list_id") ?? ""
        const name = url.searchParams.get("name") ?? ""
        const price = Number(url.searchParams.get("price") ?? "0")
        return await handleAddModifierOption(listId, name, price)
      }
      case "item_modifiers":
        return await handleItemModifiers()
      default:
        return json(
          {
            ok: false,
            error:
              "Unknown action. Use: status, categories, push_dish, pull_modifiers, create_modifier, get_item, recreate_item, add_modifier_option, item_modifiers",
          },
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
