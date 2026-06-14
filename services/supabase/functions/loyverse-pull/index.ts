// ═══════════════════════════════════════════════════════════
// Edge Function: loyverse-pull
// Polling backbone for Loyverse data — the reliability safety-net on top of the
// loyverse-receipt webhook. The webhook is realtime but has NO delivery guarantee
// (Loyverse doesn't sign, may drop or give up retrying). This poller periodically
// pulls from the Loyverse REST API and reconciles anything the webhook missed,
// and also mirrors shifts / employees / customers / reference dimensions.
//
// Receipts are fed through the SAME idempotent fn_ingest_loyverse_receipt RPC used
// by the webhook (UNIQUE orders.loyverse_receipt_id → no duplicates), so running
// this is always safe and also performs the historical backfill on first run.
//
// Actions (?action=):
//   receipts (default) — incremental pull via updated_at cursor → fn_ingest_loyverse_receipt
//   shifts             — incremental pull via updated_at cursor → fn_upsert_loyverse_shift
//   employees          — full refresh → fn_upsert_loyverse_employee
//   customers          — full refresh → fn_upsert_loyverse_customer
//   reference          — full refresh of payment_types / pos_devices / stores
//   all                — receipts + shifts + employees + customers + reference
//
// Cursor: loyverse_poll_state(resource, cursor). cursor NULL ⇒ full history backfill.
//
// Auth: deployed with verify_jwt = true (default). pg_cron invokes it with the
// service-role key as Bearer (from supabase_vault). Manual runs: send the anon/
// service key like any other Supabase function call.
//
// Env: LOYVERSE_API_TOKEN (same token used by loyverse-sync).
// Deploy: `supabase functions deploy loyverse-pull`
// ═══════════════════════════════════════════════════════════

import { createClient } from "npm:@supabase/supabase-js@2"

const db = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
)

const LOYVERSE_TOKEN = Deno.env.get("LOYVERSE_API_TOKEN") ?? ""
const LOYVERSE_BASE = "https://api.loyverse.com/v1.0"
const PAGE_LIMIT = 250
const MAX_PAGES = 400 // backstop against runaway pagination within the 150s budget

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

async function loyverseGet(path: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${LOYVERSE_BASE}${path}`, {
    headers: { Authorization: `Bearer ${LOYVERSE_TOKEN}` },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Loyverse GET ${path} failed (${res.status}): ${body}`)
  }
  return await res.json()
}

// Cursor pagination. First call carries `params` (filters); subsequent calls send
// only the cursor (Loyverse encodes the original filters into the cursor).
async function paginate(
  resourcePath: string,
  key: string,
  params: Record<string, string> = {},
): Promise<Array<Record<string, unknown>>> {
  const all: Array<Record<string, unknown>> = []
  let cursor: string | undefined
  let pages = 0
  do {
    const qs = new URLSearchParams()
    if (cursor) {
      qs.set("cursor", cursor)
    } else {
      for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v)
    }
    qs.set("limit", String(PAGE_LIMIT))
    const data = await loyverseGet(`${resourcePath}?${qs.toString()}`)
    const rows = (data[key] as Array<Record<string, unknown>>) ?? []
    all.push(...rows)
    cursor = (data.cursor as string) || undefined
    pages++
  } while (cursor && pages < MAX_PAGES)
  return all
}

async function getStoreId(): Promise<string> {
  const { data } = await db.rpc("fn_get_loyverse_config")
  return (data as Record<string, string> | null)?.store_id ?? ""
}

async function getCursor(resource: string): Promise<string | null> {
  const { data } = await db
    .from("loyverse_poll_state")
    .select("cursor")
    .eq("resource", resource)
    .maybeSingle()
  return (data?.cursor as string) ?? null
}

async function saveState(
  resource: string,
  cursor: string | null,
  status: string,
  count: number,
  error?: string,
) {
  await db.from("loyverse_poll_state").upsert(
    {
      resource,
      cursor,
      last_run_at: new Date().toISOString(),
      last_status: status,
      last_count: count,
      last_error: error ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "resource" },
  )
}

async function logSync(syncType: string, status: string, total: number, error?: string) {
  await db.from("loyverse_sync_log").insert({
    sync_type: syncType,
    direction: "pull",
    status: status === "ok" ? "success" : "error",
    records_total: total,
    records_synced: total,
    error_message: error ?? null,
    completed_at: new Date().toISOString(),
  })
}

function maxUpdatedAt(rows: Array<Record<string, unknown>>, prev: string | null): string | null {
  let max = prev
  for (const r of rows) {
    const u = (r.updated_at as string) ?? null
    if (u && (!max || u > max)) max = u
  }
  return max
}

// ─── Receipts: incremental → idempotent ingest RPC ───
async function pullReceipts() {
  const resource = "receipts"
  const cursor = await getCursor(resource)
  const storeId = await getStoreId()
  const params: Record<string, string> = { store_id: storeId }
  if (cursor) params.updated_at_min = cursor // empty ⇒ full backfill

  const receipts = await paginate("/receipts", "receipts", params)
  let ok = 0
  const errors: string[] = []
  for (const r of receipts) {
    const { error } = await db.rpc("fn_ingest_loyverse_receipt", { p_receipt: r })
    if (error) errors.push(`${r.receipt_number}: ${error.message}`)
    else ok++
  }
  const newCursor = maxUpdatedAt(receipts, cursor)
  const status = errors.length ? "error" : "ok"
  // Advance the cursor only when nothing failed, so failed receipts get retried.
  await saveState(resource, errors.length ? cursor : newCursor, status, ok, errors.join("; ") || undefined)
  await logSync("pull_receipts", status, receipts.length, errors.join("; ") || undefined)
  return { resource, fetched: receipts.length, ingested: ok, errors }
}

// ─── Shifts: incremental → upsert RPC ───
async function pullShifts() {
  const resource = "shifts"
  const cursor = await getCursor(resource)
  const storeId = await getStoreId()
  const params: Record<string, string> = { store_id: storeId }
  if (cursor) params.updated_at_min = cursor

  const shifts = await paginate("/shifts", "shifts", params)
  let ok = 0
  const errors: string[] = []
  for (const s of shifts) {
    const { error } = await db.rpc("fn_upsert_loyverse_shift", { p: s })
    if (error) errors.push(`${s.id}: ${error.message}`)
    else ok++
  }
  const newCursor = maxUpdatedAt(shifts, cursor)
  const status = errors.length ? "error" : "ok"
  await saveState(resource, errors.length ? cursor : newCursor, status, ok, errors.join("; ") || undefined)
  await logSync("pull_shifts", status, shifts.length, errors.join("; ") || undefined)
  return { resource, fetched: shifts.length, upserted: ok, errors }
}

// ─── Generic full-refresh mirror via an upsert RPC ───
async function pullViaRpc(resource: string, path: string, key: string, rpc: string) {
  const rows = await paginate(path, key, {})
  let ok = 0
  const errors: string[] = []
  for (const r of rows) {
    const { error } = await db.rpc(rpc, { p: r })
    if (error) errors.push(`${r.id}: ${error.message}`)
    else ok++
  }
  const status = errors.length ? "error" : "ok"
  await saveState(resource, null, status, ok, errors.join("; ") || undefined)
  await logSync(`pull_${resource}`, status, rows.length, errors.join("; ") || undefined)
  return { resource, fetched: rows.length, upserted: ok, errors }
}

// ─── Reference dimensions: small, direct table upserts ───
async function pullReference() {
  const out: Record<string, number> = {}
  const dims: Array<[string, string, string, (r: Record<string, unknown>) => Record<string, unknown>]> = [
    ["loyverse_payment_types", "/payment_types", "payment_types",
      (r) => ({ id: r.id, name: r.name, type: r.type, raw: r, updated_at: new Date().toISOString() })],
    ["loyverse_pos_devices", "/pos_devices", "pos_devices",
      (r) => ({ id: r.id, name: r.name, store_id: r.store_id, raw: r, updated_at: new Date().toISOString() })],
    ["loyverse_stores", "/stores", "stores",
      (r) => ({ id: r.id, name: r.name, raw: r, updated_at: new Date().toISOString() })],
    ["loyverse_suppliers", "/suppliers", "suppliers",
      (r) => ({ id: r.id, name: r.name, email: r.email, phone: r.phone_number, address: r.address, raw: r, updated_at: new Date().toISOString() })],
    ["loyverse_taxes", "/taxes", "taxes",
      (r) => ({ id: r.id, name: r.name, type: r.type, rate: r.rate, raw: r, updated_at: new Date().toISOString() })],
    ["loyverse_discounts", "/discounts", "discounts",
      (r) => ({ id: r.id, name: r.name, type: r.type, discount_amount: r.discount_amount, discount_percent: r.discount_percent, raw: r, updated_at: new Date().toISOString() })],
  ]
  for (const [table, path, key, map] of dims) {
    const rows = await paginate(path, key, {})
    if (rows.length) {
      const { error } = await db.from(table).upsert(rows.map(map), { onConflict: "id" })
      if (error) throw new Error(`${table}: ${error.message}`)
    }
    out[table] = rows.length
  }

  // Merchant — single object endpoint (not an array).
  const m = await loyverseGet("/merchant")
  if (m && m.id) {
    const { error } = await db.from("loyverse_merchant").upsert({
      id: m.id, business_name: m.business_name, email: m.email,
      country: m.country, currency: m.currency, raw: m, updated_at: new Date().toISOString(),
    }, { onConflict: "id" })
    if (error) throw new Error(`loyverse_merchant: ${error.message}`)
    out["loyverse_merchant"] = 1
  }

  await logSync("pull_reference", "ok", Object.values(out).reduce((a, b) => a + b, 0))
  return { resource: "reference", counts: out }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS })
  if (!LOYVERSE_TOKEN) return json({ ok: false, error: "LOYVERSE_API_TOKEN not set" }, 500)

  const action = new URL(req.url).searchParams.get("action") ?? "receipts"

  try {
    switch (action) {
      case "receipts":
        return json({ ok: true, results: [await pullReceipts()] })
      case "shifts":
        return json({ ok: true, results: [await pullShifts()] })
      case "employees":
        return json({ ok: true, results: [await pullViaRpc("employees", "/employees", "employees", "fn_upsert_loyverse_employee")] })
      case "customers":
        return json({ ok: true, results: [await pullViaRpc("customers", "/customers", "customers", "fn_upsert_loyverse_customer")] })
      case "reference":
        return json({ ok: true, results: [await pullReference()] })
      case "all": {
        const results = []
        results.push(await pullReceipts())
        results.push(await pullShifts())
        results.push(await pullViaRpc("employees", "/employees", "employees", "fn_upsert_loyverse_employee"))
        results.push(await pullViaRpc("customers", "/customers", "customers", "fn_upsert_loyverse_customer"))
        results.push(await pullReference())
        return json({ ok: true, results })
      }
      default:
        return json({ ok: false, error: `unknown action: ${action}` }, 400)
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await logSync(`pull_${action}`, "error", 0, msg)
    return json({ ok: false, action, error: msg }, 502)
  }
})
