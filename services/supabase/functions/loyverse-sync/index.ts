// ═══════════════════════════════════════════════════════════
// Edge Function: loyverse-sync
// Push categories + SALE-* menu items to Loyverse POS, and
// pull / manage modifier lists.
//
// Outbound auth: Bearer token from LOYVERSE_API_TOKEN env var.
// Inbound auth: requires an authenticated Supabase user (admin-panel session).
// Runs with the service-role key + verify_jwt:false, so an inbound guard is
// mandatory — see docs/security/service-role-isolation-audit-2026-06-29.md (F1).
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

// deno-lint-ignore no-explicit-any
function baseName(d: any): string {
  const short = (d.customer_short_name ?? "").trim()
  return short !== "" ? short : d.name
}
function posItemName(staffCode: string | null | undefined, base: string): string {
  return staffCode ? `${staffCode} ${base}` : base
}

// Loyverse modifier-list ids are always UUIDs. Some dish_modifier_groups rows
// are WEB-ONLY sentinels (e.g. "WEB-DIP-BREAD") that drive the website
// "Served with" add-on but must NEVER be pushed to Loyverse — Loyverse rejects
// non-UUID modifier_ids with HTTP 400 INVALID_VALUE_TYPE, blocking ALL
// reattachment. Filter every dish→Loyverse modifier_ids list through this.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function isLoyverseModifierId(id: string | null | undefined): boolean {
  return typeof id === "string" && UUID_RE.test(id.trim())
}

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

async function handleStatus() {
  const { data, error } = await db
    .from("loyverse_sync_log")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(10)
  if (error) throw new Error(`Sync log query failed: ${error.message}`)
  return json({ ok: true, logs: data })
}

async function handleGetItem(itemId: string) {
  if (!itemId) return json({ ok: false, error: "item_id required" }, 400)
  try {
    const item = await loyverseGet(`/items/${itemId}`)
    return json({ ok: true, item })
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 502)
  }
}

async function handleDeleteItem(itemId: string) {
  if (!itemId) return json({ ok: false, error: "item_id required" }, 400)
  try {
    await loyverseDelete(`/items/${itemId}`)
    await db.from("nomenclature").update({ loyverse_item_id: null, pos_status: "draft", loyverse_synced_at: null, loyverse_price: null }).eq("loyverse_item_id", itemId)
    return json({ ok: true, deleted: itemId })
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 502)
  }
}

async function handleRecreateItem(req: Request) {
  const body = await req.json()
  if (!body.dish_id) return json({ ok: false, error: "dish_id required" }, 400)
  const storeId = await getStoreId()
  if (!storeId) return json({ ok: false, error: "store_id not configured" }, 400)

  const { data: dish, error: dishErr } = await db
    .from("nomenclature")
    .select("id, name, staff_code, customer_short_name, price, loyverse_item_id, customer_description, image_url, customer_photo_url, product_categories!category_id(loyverse_category_id)")
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
  const d = dish as any
  const categoryId = d.product_categories?.loyverse_category_id ?? null
  const price = d.price ?? 0
  const itemBody: Record<string, unknown> = {
    item_name: posItemName(d.staff_code, baseName(d)),
    variants: [{
      variant_name: "Regular",
      default_pricing_type: "FIXED",
      default_price: price,
      stores: [{ store_id: storeId, pricing_type: "FIXED", price, available_for_sale: true }],
    }],
  }
  if (categoryId) itemBody.category_id = categoryId
  if (d.customer_description) itemBody.description = d.customer_description
  const img = d.image_url ?? d.customer_photo_url
  if (img) itemBody.image_url = img
  if (body.modifier_ids && body.modifier_ids.length > 0) {
    const validMods = (body.modifier_ids as string[]).filter(isLoyverseModifierId)
    if (validMods.length > 0) itemBody.modifier_ids = validMods
  }

  try {
    const created = await loyversePost("/items", itemBody)
    const newId = created.id
    await db.from("nomenclature").update({ loyverse_item_id: newId, pos_status: "synced", loyverse_synced_at: new Date().toISOString(), loyverse_price: price }).eq("id", body.dish_id)
    return json({
      ok: true,
      item_name: created.item_name,
      loyverse_item_id: newId,
      category_id: created.category_id,
      modifier_ids: created.modifier_ids,
      old_id: oldLoyverseId,
    })
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 502)
  }
}

async function handleUpdateItem(req: Request) {
  const body = await req.json()
  if (!body.dish_id) return json({ ok: false, error: "dish_id required" }, 400)

  const { data: dish, error: dishErr } = await db
    .from("nomenclature")
    .select("id, name, staff_code, customer_short_name, price, loyverse_item_id, customer_description, image_url, customer_photo_url, product_categories!category_id(loyverse_category_id)")
    .eq("id", body.dish_id)
    .single()
  if (dishErr || !dish) return json({ ok: false, error: dishErr?.message ?? "dish not found" }, 404)
  // deno-lint-ignore no-explicit-any
  const d = dish as any
  if (!d.loyverse_item_id) return json({ ok: false, error: "dish not synced yet (no loyverse_item_id)" }, 400)

  const current = await loyverseGet(`/items/${d.loyverse_item_id}`)

  const newPrice = d.price ?? 0
  // deno-lint-ignore no-explicit-any
  const syncedVariants = (current.variants ?? []).map((v: any) => ({
    ...v,
    default_pricing_type: v.default_pricing_type ?? "FIXED",
    default_price: newPrice,
    // deno-lint-ignore no-explicit-any
    stores: (v.stores ?? []).map((s: any) => ({ ...s, pricing_type: s.pricing_type ?? "FIXED", price: newPrice })),
  }))

  const itemBody: Record<string, unknown> = {
    id: d.loyverse_item_id,
    item_name: posItemName(d.staff_code, baseName(d)),
    variants: syncedVariants,
  }
  const categoryId = d.product_categories?.loyverse_category_id ?? current.category_id ?? null
  if (categoryId) itemBody.category_id = categoryId
  if (d.customer_description) itemBody.description = d.customer_description
  else if (current.description) itemBody.description = current.description
  const img = d.image_url ?? d.customer_photo_url ?? current.image_url
  if (img) itemBody.image_url = img
  if (Array.isArray(body.modifier_ids)) itemBody.modifier_ids = (body.modifier_ids as string[]).filter(isLoyverseModifierId)
  else if (current.modifier_ids) itemBody.modifier_ids = current.modifier_ids

  try {
    const result = await loyversePost("/items", itemBody)
    await db.from("nomenclature").update({ loyverse_synced_at: new Date().toISOString(), loyverse_price: newPrice }).eq("id", d.id)
    return json({
      ok: true,
      loyverse_item_id: result.id,
      id_unchanged: result.id === d.loyverse_item_id,
      price: newPrice,
      modifier_ids: result.modifier_ids,
    })
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 502)
  }
}

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
  // deno-lint-ignore no-explicit-any
  let loyverseItemId = (dishRow as any).loyverse_item_id

  const logId = await logStart("dish_push", 1)
  try {
    const price = rpc.payload.default_price ?? 0
    const itemBody: Record<string, unknown> = {
      item_name: rpc.payload.name,
      description: rpc.payload.description,
    }

    if (loyverseItemId) {
      itemBody.id = loyverseItemId
      const current = await loyverseGet(`/items/${loyverseItemId}`)
      // deno-lint-ignore no-explicit-any
      const existingVariants = (current.variants ?? []) as any[]
      if (existingVariants.length > 0) {
        // deno-lint-ignore no-explicit-any
        itemBody.variants = existingVariants.map((v: any) => ({
          ...v,
          default_pricing_type: v.default_pricing_type ?? "FIXED",
          default_price: price,
          // deno-lint-ignore no-explicit-any
          stores: (v.stores ?? []).map((s: any) => ({ ...s, pricing_type: s.pricing_type ?? "FIXED", price })),
        }))
      } else {
        itemBody.variants = [{
          variant_name: "Regular",
          default_pricing_type: "FIXED",
          default_price: price,
          stores: [{ store_id: storeId, pricing_type: "FIXED", price, available_for_sale: true }],
        }]
      }
      const mods = current.modifier_ids ?? current.modifiers_ids
      if (Array.isArray(mods) && mods.length > 0) itemBody.modifier_ids = mods
      const catId = linkedCategoryId ?? current.category_id ?? null
      if (catId) itemBody.category_id = catId
      if (!rpc.payload.description && current.description) itemBody.description = current.description
      const img = rpc.payload.image_url ?? current.image_url
      if (img) itemBody.image_url = img
    } else {
      itemBody.variants = [{
        variant_name: "Regular",
        default_pricing_type: "FIXED",
        default_price: price,
        stores: [{ store_id: storeId, pricing_type: "FIXED", price, available_for_sale: true }],
      }]
      if (linkedCategoryId) itemBody.category_id = linkedCategoryId
      if (rpc.payload.image_url) itemBody.image_url = rpc.payload.image_url
    }

    const result = await loyversePost("/items", itemBody)
    loyverseItemId = result.id ?? loyverseItemId
    if (loyverseItemId) {
      await db.from("nomenclature").update({ loyverse_item_id: loyverseItemId, pos_status: "synced", loyverse_synced_at: new Date().toISOString(), loyverse_price: price }).eq("id", dishId)
    }
    await logFinish(logId, "success", 1, 0)
    return json({ ok: true, loyverse_item_id: loyverseItemId, payload: rpc.payload })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await logFinish(logId, "error", 0, 1, msg)
    return json({ ok: false, error: msg }, 502)
  }
}

async function handleReconcilePrices() {
  const { data: dishes, error } = await db
    .from("nomenclature")
    .select("id, name, price, loyverse_item_id")
    .like("product_code", "SALE-%")
    .not("loyverse_item_id", "is", null)
  if (error) return json({ ok: false, error: error.message }, 500)

  let updated = 0
  let failed = 0
  let drift = 0
  const mismatches: { name: string; db: number | null; pos: number | null }[] = []
  const errors: string[] = []

  for (const d of (dishes ?? []) as Array<{ id: string; name: string; price: number | null; loyverse_item_id: string }>) {
    try {
      const item = await loyverseGet(`/items/${d.loyverse_item_id}`)
      // deno-lint-ignore no-explicit-any
      const v = ((item.variants ?? []) as any[])[0]
      const posPrice = v?.default_price ?? null
      await db.from("nomenclature").update({ loyverse_price: posPrice }).eq("id", d.id)
      updated++
      if (posPrice != null && d.price != null && Number(posPrice) !== Number(d.price)) {
        drift++
        mismatches.push({ name: d.name, db: d.price, pos: posPrice })
      }
    } catch (e) {
      failed++
      errors.push(`${d.name}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return json({ ok: true, updated, failed, drift, mismatches, errors })
}

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
  stores?: string[]
  modifier_options?: LoyverseModifierOption[]
}

function withStore(existing: string[] | undefined, storeId: string): string[] {
  const set = new Set(existing ?? [])
  if (storeId) set.add(storeId)
  return [...set]
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

  let dishGroups = 0
  try {
    const items = await loyverseGetAll<LoyverseItemModifiers>("/items", "items")
    const payload = items
      .filter((i) => !i.deleted_at)
      .map((i) => ({
        item_id: i.id,
        modifier_list_ids: i.modifiers_ids ?? i.modifier_ids ?? [],
      }))
    const { data: synced, error: dmgErr } = await db.rpc("fn_refresh_dish_modifier_groups", {
      p_items: payload,
    })
    if (dmgErr) {
      await logFinish(logId, "error", listRows.length, 0, `dish_modifier_groups: ${dmgErr.message}`)
      return json({ ok: false, error: dmgErr.message }, 500)
    }
    dishGroups = typeof synced === "number" ? synced : 0
  } catch (e) {
    await logFinish(logId, "error", listRows.length, 0, e instanceof Error ? e.message : String(e))
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 502)
  }

  await db.from("modifier_sync_state")
    .update({ last_pulled_at: new Date().toISOString(), attachments_dirty: false })
    .eq("id", 1)

  await logFinish(logId, "success", listRows.length, 0)
  return json({ ok: true, lists: listRows.length, options: optionRows.length, dish_groups: dishGroups })
}

async function handleCreateModifier(req: Request) {
  const body = await req.json()
  if (!body.name || !body.modifier_options?.length) {
    return json({ ok: false, error: "name and modifier_options[] required" }, 400)
  }
  const storeId = await getStoreId()
  try {
    const created = await loyversePost("/modifiers", {
      name: body.name,
      min_select: body.min_select ?? 0,
      max_select: body.max_select ?? 1,
      stores: withStore(undefined, storeId),
      // deno-lint-ignore no-explicit-any
      modifier_options: body.modifier_options.map((o: any) => ({ name: o.name, price: o.price ?? 0 })),
    })
    await handlePullModifiers()
    return json({ ok: true, modifier: created })
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 502)
  }
}

async function handleAddModifierOption(listId: string, optName: string, price: number) {
  if (!listId || !optName) return json({ ok: false, error: "list_id and name required" }, 400)

  const all = await loyverseGetAll<LoyverseModifierList>("/modifiers", "modifiers")
  const list = all.find((l) => l.id === listId)
  if (!list) return json({ ok: false, error: `modifier list ${listId} not found` }, 404)

  const opts = list.modifier_options ?? []
  if (opts.some((o) => o.name.trim().toLowerCase() === optName.trim().toLowerCase())) {
    return json({ ok: true, skipped: true, message: `"${optName}" already in "${list.name}"` })
  }

  const storeId = await getStoreId()
  const result = await loyversePost("/modifiers", {
    id: list.id,
    name: list.name,
    min_select: list.min_select ?? 0,
    max_select: list.max_select ?? 0,
    stores: withStore(list.stores, storeId),
    modifier_options: [
      ...opts.map((o) => ({ id: o.id, name: o.name, price: o.price ?? 0 })),
      { name: optName, price },
    ],
  })
  const reattached = await reattachAllDishes()
  await handlePullModifiers()
  return json({ ok: true, list: list.name, added: optName, price, reattached, modifier_id: (result as { id?: string }).id })
}

async function handleRemoveModifierOption(listId: string, optName: string) {
  if (!listId || !optName) return json({ ok: false, error: "list_id and name required" }, 400)

  const all = await loyverseGetAll<LoyverseModifierList>("/modifiers", "modifiers")
  const list = all.find((l) => l.id === listId)
  if (!list) return json({ ok: false, error: `modifier list ${listId} not found` }, 404)

  const opts = list.modifier_options ?? []
  const kept = opts.filter((o) => o.name.trim().toLowerCase() !== optName.trim().toLowerCase())
  if (kept.length === opts.length) {
    return json({ ok: true, skipped: true, message: `"${optName}" not in "${list.name}"` })
  }

  const storeId = await getStoreId()
  const result = await loyversePost("/modifiers", {
    id: list.id,
    name: list.name,
    min_select: list.min_select ?? 0,
    max_select: list.max_select ?? 0,
    stores: withStore(list.stores, storeId),
    modifier_options: kept.map((o) => ({ id: o.id, name: o.name, price: o.price ?? 0 })),
  })
  const reattached = await reattachAllDishes()
  await handlePullModifiers()
  return json({ ok: true, list: list.name, removed: optName, reattached, modifier_id: (result as { id?: string }).id })
}

async function handleEnsureModifierStores(listId: string) {
  const storeId = await getStoreId()
  if (!storeId) return json({ ok: false, error: "store_id not configured" }, 400)

  const all = await loyverseGetAll<LoyverseModifierList>("/modifiers", "modifiers")
  const targets = listId ? all.filter((l) => l.id === listId) : all
  if (!targets.length) return json({ ok: false, error: "no modifier lists matched" }, 404)

  const fixed: string[] = []
  for (const list of targets) {
    const stores = withStore(list.stores, storeId)
    if ((list.stores ?? []).includes(storeId)) continue
    await loyversePost("/modifiers", {
      id: list.id,
      name: list.name,
      min_select: list.min_select ?? 0,
      max_select: list.max_select ?? 0,
      stores,
      modifier_options: (list.modifier_options ?? []).map((o) => ({ id: o.id, name: o.name, price: o.price ?? 0 })),
    })
    fixed.push(list.name)
  }
  await handlePullModifiers()
  return json({ ok: true, store_id: storeId, fixed_count: fixed.length, fixed })
}

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

async function reattachAllDishes(): Promise<number> {
  const { data: dmgRows } = await db
    .from("dish_modifier_groups")
    .select("dish_id, loyverse_modifier_list_id")
  const groupsByDish = new Map<string, string[]>()
  for (const r of (dmgRows ?? []) as { dish_id: string; loyverse_modifier_list_id: string }[]) {
    // Skip WEB-ONLY sentinels (non-UUID ids) — Loyverse rejects them with 400.
    if (!isLoyverseModifierId(r.loyverse_modifier_list_id)) continue
    const arr = groupsByDish.get(r.dish_id) ?? []
    arr.push(r.loyverse_modifier_list_id)
    groupsByDish.set(r.dish_id, arr)
  }
  const { data: dishRows } = await db
    .from("nomenclature")
    .select("id, loyverse_item_id")
    .like("product_code", "SALE-%")
    .not("loyverse_item_id", "is", null)
  let n = 0
  for (const d of (dishRows ?? []) as { id: string; loyverse_item_id: string }[]) {
    const listIds = groupsByDish.get(d.id) ?? []
    if (listIds.length === 0) continue
    const current = await loyverseGet(`/items/${d.loyverse_item_id}`)
    const itemBody: Record<string, unknown> = {
      id: d.loyverse_item_id,
      item_name: current.item_name,
      variants: current.variants,
      modifier_ids: listIds,
    }
    if (current.category_id) itemBody.category_id = current.category_id
    if (current.description) itemBody.description = current.description
    if (current.image_url) itemBody.image_url = current.image_url
    await loyversePost("/items", itemBody)
    n++
  }
  return n
}

async function handleResyncNames() {
  const { data: dmgRows } = await db
    .from("dish_modifier_groups")
    .select("dish_id, loyverse_modifier_list_id")
  const groupsByDish = new Map<string, string[]>()
  for (const r of (dmgRows ?? []) as { dish_id: string; loyverse_modifier_list_id: string }[]) {
    // Skip WEB-ONLY sentinels (non-UUID ids) — Loyverse rejects them with 400.
    if (!isLoyverseModifierId(r.loyverse_modifier_list_id)) continue
    const arr = groupsByDish.get(r.dish_id) ?? []
    arr.push(r.loyverse_modifier_list_id)
    groupsByDish.set(r.dish_id, arr)
  }

  const { data: dishes, error } = await db
    .from("nomenclature")
    .select("id, name, staff_code, customer_short_name, loyverse_item_id")
    .like("product_code", "SALE-%")
    .not("loyverse_item_id", "is", null)
    .not("staff_code", "is", null)
  if (error) return json({ ok: false, error: error.message }, 500)

  let renamed = 0
  let skipped = 0
  let failed = 0
  const errors: string[] = []
  const changes: { to: string; mods: number }[] = []

  for (const d of (dishes ?? []) as Array<{ id: string; name: string; staff_code: string; customer_short_name: string | null; loyverse_item_id: string }>) {
    try {
      const desired = posItemName(d.staff_code, baseName(d))
      const current = await loyverseGet(`/items/${d.loyverse_item_id}`)
      const listIds = groupsByDish.get(d.id) ?? []
      const currentMods: string[] = current.modifier_ids ?? current.modifiers_ids ?? []
      const targetMods = listIds.length > 0 ? listIds : currentMods
      const sameName = current.item_name === desired
      const sameMods = targetMods.length === currentMods.length &&
        targetMods.every((m) => currentMods.includes(m))
      if (sameName && sameMods) { skipped++; continue }

      const itemBody: Record<string, unknown> = {
        id: d.loyverse_item_id,
        item_name: desired,
        variants: current.variants,
      }
      if (current.category_id) itemBody.category_id = current.category_id
      if (current.description) itemBody.description = current.description
      if (current.image_url) itemBody.image_url = current.image_url
      if (targetMods.length > 0) itemBody.modifier_ids = targetMods

      await loyversePost("/items", itemBody)
      await db.from("nomenclature")
        .update({ loyverse_synced_at: new Date().toISOString() })
        .eq("id", d.id)
      renamed++
      changes.push({ to: desired, mods: targetMods.length })
    } catch (e) {
      failed++
      errors.push(`${d.name}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return json({ ok: true, total: (dishes ?? []).length, renamed, skipped, failed, changes, errors })
}

async function handlePushModifiers(req: Request) {
  const dryRun = new URL(req.url).searchParams.get("dry_run") === "true"
  const storeId = await getStoreId()
  if (!storeId) return json({ ok: false, error: "store_id not configured" }, 400)

  const { data: overrideRows } = await db
    .from("modifier_option_overrides")
    .select("loyverse_modifier_option_id, price")
  const overrideById = new Map<string, number>(
    (overrideRows ?? []).map((r: { loyverse_modifier_option_id: string; price: number }) => [
      r.loyverse_modifier_option_id,
      Number(r.price),
    ]),
  )

  const allLists = await loyverseGetAll<LoyverseModifierList>("/modifiers", "modifiers")

  const priceChanges: { list_id: string; list_name: string; option: string; from: number | null; to: number }[] = []
  const affectedListIds = new Set<string>()
  for (const l of allLists) {
    for (const o of l.modifier_options ?? []) {
      if (overrideById.has(o.id)) {
        const to = overrideById.get(o.id) as number
        if (to !== (o.price ?? null)) {
          priceChanges.push({ list_id: l.id, list_name: l.name, option: o.name, from: o.price ?? null, to })
          affectedListIds.add(l.id)
        }
      }
    }
  }

  const { data: dmgRows } = await db
    .from("dish_modifier_groups")
    .select("dish_id, loyverse_modifier_list_id")
  const groupsByDish = new Map<string, string[]>()
  for (const r of (dmgRows ?? []) as { dish_id: string; loyverse_modifier_list_id: string }[]) {
    // Skip WEB-ONLY sentinels (non-UUID ids) — Loyverse rejects them with 400.
    if (!isLoyverseModifierId(r.loyverse_modifier_list_id)) continue
    const arr = groupsByDish.get(r.dish_id) ?? []
    arr.push(r.loyverse_modifier_list_id)
    groupsByDish.set(r.dish_id, arr)
  }
  const { data: dishRows } = await db
    .from("nomenclature")
    .select("id, name, loyverse_item_id")
    .like("product_code", "SALE-%")
    .not("loyverse_item_id", "is", null)
  const reattach = (dishRows ?? [])
    .map((d: { id: string; name: string; loyverse_item_id: string }) => ({
      dish: d,
      list_ids: groupsByDish.get(d.id) ?? [],
    }))
    .filter((x) => x.list_ids.length > 0)

  if (dryRun) {
    return json({
      ok: true,
      dry_run: true,
      price_changes: priceChanges,
      affected_lists: affectedListIds.size,
      reattach_dishes: reattach.map((r) => ({ name: r.dish.name, groups: r.list_ids.length })),
    })
  }

  const logId = await logStart("modifiers_push", priceChanges.length + reattach.length)
  try {
    for (const listId of affectedListIds) {
      const l = allLists.find((x) => x.id === listId)
      if (!l) continue
      await loyversePost("/modifiers", {
        id: l.id,
        name: l.name,
        min_select: l.min_select ?? 0,
        max_select: l.max_select ?? 0,
        stores: withStore(l.stores, storeId),
        modifier_options: (l.modifier_options ?? []).map((o) => ({
          id: o.id,
          name: o.name,
          price: overrideById.has(o.id) ? overrideById.get(o.id) : (o.price ?? 0),
        })),
      })
    }

    const reattached = await reattachAllDishes()

    if (overrideById.size > 0) {
      await db.from("modifier_option_overrides").delete().neq("loyverse_modifier_option_id", "")
    }
    await db.from("modifier_sync_state")
      .update({ last_pushed_at: new Date().toISOString(), attachments_dirty: false })
      .eq("id", 1)

    await logFinish(logId, "success", priceChanges.length + reattached, 0)
    await handlePullModifiers()
    return json({
      ok: true,
      prices_applied: priceChanges.length,
      lists_updated: affectedListIds.size,
      dishes_reattached: reattached,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await logFinish(logId, "error", 0, 1, msg)
    return json({ ok: false, error: msg }, 502)
  }
}

// ── Action: pull_items_status ──
// Pulls all items from Loyverse API and upserts into loyverse_item_sync.
// The frontend reads v_loyverse_sync_status to show photo/price gaps.

interface LoyverseItemFull {
  id: string
  item_name: string
  image_url?: string | null
  category_id?: string | null
  deleted_at?: string | null
  variants?: Array<{ default_price?: number }>
}

async function handlePullItemsStatus() {
  const logId = await logStart("items_pull_status", 0)
  let items: LoyverseItemFull[]
  try {
    items = await loyverseGetAll<LoyverseItemFull>("/items", "items")
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await logFinish(logId, "error", 0, 0, msg)
    return json({ ok: false, error: msg }, 502)
  }

  const rows = items.map((item) => ({
    loyverse_item_id: item.id,
    lv_name: item.item_name ?? null,
    lv_price: item.variants?.[0]?.default_price ?? null,
    lv_image_url: item.image_url ?? null,
    lv_category_id: item.category_id ?? null,
    lv_is_deleted: !!item.deleted_at,
    pulled_at: new Date().toISOString(),
  }))

  const CHUNK = 200
  let failedChunks = 0
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await db
      .from("loyverse_item_sync")
      .upsert(rows.slice(i, i + CHUNK), { onConflict: "loyverse_item_id" })
    if (error) failedChunks++
  }

  // Back-fill nomenclature_id where missing
  const { data: linked } = await db
    .from("nomenclature")
    .select("id, loyverse_item_id")
    .not("loyverse_item_id", "is", null)
  for (const n of (linked ?? []) as Array<{ id: string; loyverse_item_id: string }>) {
    await db
      .from("loyverse_item_sync")
      .update({ nomenclature_id: n.id })
      .eq("loyverse_item_id", n.loyverse_item_id)
      .is("nomenclature_id", null)
  }

  const withPhoto = rows.filter((r) => r.lv_image_url).length
  const deleted   = rows.filter((r) => r.lv_is_deleted).length

  await logFinish(logId, failedChunks > 0 ? "error" : "success", rows.length, 0)
  return json({ ok: true, total: rows.length, with_photo: withPhoto, deleted, failed_chunks: failedChunks })
}

// ── Auth guard ──────────────────────────────────────────────
// loyverse-sync runs with the service-role key (full RLS bypass) and is
// deployed with verify_jwt:false. Every real caller is an admin-panel hook
// that already sends the signed-in user's access token in the Authorization
// header, so we require a real authenticated Supabase user. The bare anon
// apikey is itself a valid JWT but maps to NO user, so getUser() rejects it —
// closing the public-invocation hole.
async function isAuthedUser(req: Request): Promise<boolean> {
  const authz = req.headers.get("Authorization") ?? ""
  const token = authz.startsWith("Bearer ") ? authz.slice(7).trim() : ""
  if (!token) return false
  try {
    const { data, error } = await db.auth.getUser(token)
    return !error && !!data?.user
  } catch {
    return false // fail closed: auth-server hiccup → unauthorized, never a bare 500
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS })
  if (!(await isAuthedUser(req))) return json({ ok: false, error: "unauthorized" }, 401)
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
      case "reconcile_prices":
        if (req.method !== "POST") return json({ ok: false, error: "POST required" }, 405)
        return await handleReconcilePrices()
      case "pull_modifiers":
        if (req.method !== "POST") return json({ ok: false, error: "POST required" }, 405)
        return await handlePullModifiers()
      case "create_modifier":
        if (req.method !== "POST") return json({ ok: false, error: "POST required" }, 405)
        return await handleCreateModifier(req)
      case "get_item":
        return await handleGetItem(url.searchParams.get("item_id") ?? "")
      case "delete_item": {
        if (req.method !== "POST") return json({ ok: false, error: "POST required" }, 405)
        return await handleDeleteItem(url.searchParams.get("item_id") ?? "")
      }
      case "recreate_item":
        if (req.method !== "POST") return json({ ok: false, error: "POST required" }, 405)
        return await handleRecreateItem(req)
      case "update_item":
        if (req.method !== "POST") return json({ ok: false, error: "POST required" }, 405)
        return await handleUpdateItem(req)
      case "resync_names":
        if (req.method !== "POST") return json({ ok: false, error: "POST required" }, 405)
        return await handleResyncNames()
      case "add_modifier_option": {
        if (req.method !== "POST") return json({ ok: false, error: "POST required" }, 405)
        const listId = url.searchParams.get("list_id") ?? ""
        const name = url.searchParams.get("name") ?? ""
        const price = Number(url.searchParams.get("price") ?? "0")
        return await handleAddModifierOption(listId, name, price)
      }
      case "remove_modifier_option": {
        if (req.method !== "POST") return json({ ok: false, error: "POST required" }, 405)
        const listId = url.searchParams.get("list_id") ?? ""
        const name = url.searchParams.get("name") ?? ""
        return await handleRemoveModifierOption(listId, name)
      }
      case "ensure_modifier_stores":
        if (req.method !== "POST") return json({ ok: false, error: "POST required" }, 405)
        return await handleEnsureModifierStores(url.searchParams.get("list_id") ?? "")
      case "item_modifiers":
        return await handleItemModifiers()
      case "push_modifiers":
        if (req.method !== "POST") return json({ ok: false, error: "POST required" }, 405)
        return await handlePushModifiers(req)
      case "pull_items_status":
        if (req.method !== "POST") return json({ ok: false, error: "POST required" }, 405)
        return await handlePullItemsStatus()
      default:
        return json(
          {
            ok: false,
            error: "Unknown action. Use: status, categories, push_dish, reconcile_prices, pull_modifiers, create_modifier, get_item, delete_item, recreate_item, update_item, resync_names, add_modifier_option, remove_modifier_option, ensure_modifier_stores, item_modifiers, push_modifiers, pull_items_status",
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
