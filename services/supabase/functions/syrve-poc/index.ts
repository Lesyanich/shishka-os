// ═══════════════════════════════════════════════════════════
// Edge Function: syrve-poc
// Phase 17: Syrve Integration PoC
//
// Flow:
//   1. Read API credentials from syrve_config
//   2. Authenticate with Syrve Cloud API
//   3. Fetch Syrve nomenclature catalog
//   4. Fetch Shishka nomenclature from DB
//   5. Fuzzy-match by name (Levenshtein / ILIKE)
//   6. Return mapping report
//
// Usage: GET /syrve-poc
// ═══════════════════════════════════════════════════════════

import { createClient } from "npm:@supabase/supabase-js@2"

const supabaseUrl  = Deno.env.get("SUPABASE_URL") ?? ""
const supabaseKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
const supabase     = createClient(supabaseUrl, supabaseKey)

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
}

// ── Syrve API helpers ──

async function getSyrveToken(apiLogin: string, baseUrl: string): Promise<string> {
  const res = await fetch(`${baseUrl}/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiLogin }),
  })
  if (!res.ok) throw new Error(`Syrve auth failed: ${res.status}`)
  const data = await res.json()
  return data.token
}

async function getSyrveOrganizations(token: string, baseUrl: string) {
  const res = await fetch(`${baseUrl}/organizations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({
      organizationIds: [],
      returnAdditionalInfo: false,
      includeDisabled: false,
    }),
  })
  if (!res.ok) throw new Error(`Syrve organizations failed: ${res.status}`)
  const data = await res.json()
  return data.organizations ?? []
}

interface SyrveProduct {
  id: string
  name: string
  code: string | null
  type: string
  measureUnit: string
  groupId: string | null
}

interface SyrveGroup {
  id: string
  name: string
  parentGroup: string | null
}

async function getSyrveNomenclature(
  token: string,
  baseUrl: string,
  organizationId: string,
) {
  const res = await fetch(`${baseUrl}/nomenclature`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({ organizationId }),
  })
  if (!res.ok) throw new Error(`Syrve nomenclature failed: ${res.status}`)
  return await res.json() as {
    products: SyrveProduct[]
    groups: SyrveGroup[]
    productCategories: unknown[]
    revision: number
  }
}

// ── Fuzzy matching ──

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  if (m === 0) return n
  if (n === 0) return m
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
  }
  return dp[m][n]
}

function similarity(a: string, b: string): number {
  const la = a.toLowerCase().trim()
  const lb = b.toLowerCase().trim()
  if (la === lb) return 1.0
  // Exact substring match = high confidence
  if (la.includes(lb) || lb.includes(la)) return 0.85
  const maxLen = Math.max(la.length, lb.length)
  if (maxLen === 0) return 1.0
  const dist = levenshtein(la, lb)
  return 1 - dist / maxLen
}

interface ShishkaItem {
  id: string
  product_code: string
  name: string
  base_unit: string | null
  syrve_uuid: string | null
}

interface MatchResult {
  shishka_id: string
  shishka_name: string
  shishka_code: string
  syrve_id: string
  syrve_name: string
  syrve_code: string | null
  syrve_unit: string
  confidence: number
  already_mapped: boolean
}

function findBestMatches(
  shishkaItems: ShishkaItem[],
  syrveProducts: SyrveProduct[],
): {
  matched: MatchResult[]
  unmatched_shishka: ShishkaItem[]
  unmatched_syrve: SyrveProduct[]
} {
  const matched: MatchResult[] = []
  const usedSyrveIds = new Set<string>()

  // First pass: already mapped (syrve_uuid exists)
  for (const item of shishkaItems) {
    if (item.syrve_uuid) {
      const syrveMatch = syrveProducts.find((p) => p.id === item.syrve_uuid)
      if (syrveMatch) {
        matched.push({
          shishka_id: item.id,
          shishka_name: item.name,
          shishka_code: item.product_code,
          syrve_id: syrveMatch.id,
          syrve_name: syrveMatch.name,
          syrve_code: syrveMatch.code,
          syrve_unit: syrveMatch.measureUnit,
          confidence: 1.0,
          already_mapped: true,
        })
        usedSyrveIds.add(syrveMatch.id)
      }
    }
  }

  // Second pass: fuzzy match by name (threshold 0.6)
  const unmappedShishka = shishkaItems.filter(
    (i) => !i.syrve_uuid && !matched.find((m) => m.shishka_id === i.id),
  )
  const availableSyrve = syrveProducts.filter((p) => !usedSyrveIds.has(p.id))

  for (const item of unmappedShishka) {
    let bestMatch: SyrveProduct | null = null
    let bestScore = 0

    for (const sp of availableSyrve) {
      if (usedSyrveIds.has(sp.id)) continue
      const score = similarity(item.name, sp.name)
      if (score > bestScore) {
        bestScore = score
        bestMatch = sp
      }
    }

    if (bestMatch && bestScore >= 0.6) {
      matched.push({
        shishka_id: item.id,
        shishka_name: item.name,
        shishka_code: item.product_code,
        syrve_id: bestMatch.id,
        syrve_name: bestMatch.name,
        syrve_code: bestMatch.code,
        syrve_unit: bestMatch.measureUnit,
        confidence: Math.round(bestScore * 100) / 100,
        already_mapped: false,
      })
      usedSyrveIds.add(bestMatch.id)
    }
  }

  const unmatchedShishka = shishkaItems.filter(
    (i) => !matched.find((m) => m.shishka_id === i.id),
  )
  const unmatchedSyrve = syrveProducts.filter((p) => !usedSyrveIds.has(p.id))

  // Sort by confidence desc
  matched.sort((a, b) => b.confidence - a.confidence)

  return { matched, unmatched_shishka: unmatchedShishka, unmatched_syrve: unmatchedSyrve }
}

// ── Main handler ──

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS })
  }

  try {
    // 1. Read config from DB
    const { data: configData, error: configErr } = await supabase.rpc("fn_get_syrve_config")
    if (configErr) throw new Error(`Config read failed: ${configErr.message}`)

    const config = configData as Record<string, string>
    const apiLogin = config?.api_login
    const baseUrl = config?.base_url || "https://api-eu.syrve.live/api/1"
    let orgId = config?.organization_id

    if (!apiLogin) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Syrve API login not configured. Set it in syrve_config.",
          step: "config",
        }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      )
    }

    // 2. Get Syrve token
    const token = await getSyrveToken(apiLogin, baseUrl)

    // 3. Get organization (auto-discover if not set)
    let organizations: Array<{ id: string; name: string }> = []
    if (!orgId) {
      organizations = await getSyrveOrganizations(token, baseUrl)
      if (organizations.length === 1) {
        orgId = organizations[0].id
        // Auto-save discovered org ID
        await supabase.rpc("fn_upsert_syrve_config", {
          p_key: "organization_id",
          p_value: orgId,
        })
      } else {
        return new Response(
          JSON.stringify({
            ok: false,
            error: `Found ${organizations.length} organizations. Set organization_id in config.`,
            organizations,
            step: "organization",
          }),
          { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
        )
      }
    }

    // 4. Get Syrve nomenclature
    const syrveNom = await getSyrveNomenclature(token, baseUrl, orgId)

    // 5. Get Shishka nomenclature
    const { data: shishkaItems, error: shishkaErr } = await supabase
      .from("nomenclature")
      .select("id, product_code, name, base_unit, syrve_uuid")
      .eq("is_deleted", false)
      .order("product_code")

    if (shishkaErr) throw new Error(`Shishka nomenclature query failed: ${shishkaErr.message}`)

    // 6. Fuzzy match
    const result = findBestMatches(
      (shishkaItems ?? []) as ShishkaItem[],
      syrveNom.products,
    )

    // 7. Log sync attempt
    await supabase.from("syrve_sync_log").insert({
      sync_type: "nomenclature",
      direction: "pull",
      status: "success",
      records_count: syrveNom.products.length,
      payload: {
        syrve_products: syrveNom.products.length,
        syrve_groups: syrveNom.groups.length,
        shishka_items: (shishkaItems ?? []).length,
        matched: result.matched.length,
        match_rate: (shishkaItems ?? []).length > 0
          ? Math.round((result.matched.length / (shishkaItems ?? []).length) * 100)
          : 0,
      },
    })

    // 8. Build report
    const report = {
      ok: true,
      syrve: {
        organization_id: orgId,
        organization_name: organizations[0]?.name ?? "(from config)",
        products_count: syrveNom.products.length,
        groups_count: syrveNom.groups.length,
        revision: syrveNom.revision,
      },
      shishka: {
        items_count: (shishkaItems ?? []).length,
      },
      matching: {
        matched_count: result.matched.length,
        already_mapped: result.matched.filter((m) => m.already_mapped).length,
        fuzzy_matched: result.matched.filter((m) => !m.already_mapped).length,
        unmatched_shishka: result.unmatched_shishka.length,
        unmatched_syrve: result.unmatched_syrve.length,
        match_rate_percent: (shishkaItems ?? []).length > 0
          ? Math.round((result.matched.length / (shishkaItems ?? []).length) * 100)
          : 0,
      },
      matched: result.matched.map((m) => ({
        shishka: { id: m.shishka_id, name: m.shishka_name, code: m.shishka_code },
        syrve: { id: m.syrve_id, name: m.syrve_name, code: m.syrve_code, unit: m.syrve_unit },
        confidence: m.confidence,
        already_mapped: m.already_mapped,
      })),
      unmatched_shishka: result.unmatched_shishka.map((i) => ({
        id: i.id,
        name: i.name,
        code: i.product_code,
      })),
      unmatched_syrve: result.unmatched_syrve.map((p) => ({
        id: p.id,
        name: p.name,
        code: p.code,
        type: p.type,
      })),
    }

    return new Response(JSON.stringify(report, null, 2), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)

    // Log error
    await supabase.from("syrve_sync_log").insert({
      sync_type: "nomenclature",
      direction: "pull",
      status: "error",
      error_message: message,
    }).catch(() => {})

    return new Response(
      JSON.stringify({ ok: false, error: message }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    )
  }
})
