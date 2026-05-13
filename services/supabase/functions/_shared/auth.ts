// ============================================================
// Shared owner-gate helper for user-management Edge Functions.
//
// Standard pattern for any function that must only run for an
// authenticated `owner` staff member:
//
//   const gate = await requireOwner(req)
//   if (!gate.ok) return gate.response
//   // gate.actorStaffId is set; gate.userClient has the caller's JWT
//
// `requireOwner` resolves the caller via the Authorization header,
// calls fn_is_owner() in their context, and returns the gate result
// plus the staff.id of the actor (for audit-log writes).
// ============================================================

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2"
import { json } from "./cors.ts"

const SUPABASE_URL  = Deno.env.get("SUPABASE_URL") ?? ""
const ANON_KEY      = Deno.env.get("SUPABASE_ANON_KEY") ?? ""

export interface OwnerGateOk {
  ok: true
  userClient: SupabaseClient
  actorStaffId: string | null
}

export interface OwnerGateDenied {
  ok: false
  response: Response
}

export type OwnerGate = OwnerGateOk | OwnerGateDenied

export async function requireOwner(req: Request): Promise<OwnerGate> {
  const auth = req.headers.get("Authorization") ?? ""
  if (!auth.toLowerCase().startsWith("bearer ")) {
    return { ok: false, response: json({ error: "missing bearer token" }, 401) }
  }

  if (!SUPABASE_URL || !ANON_KEY) {
    return {
      ok: false,
      response: json({ error: "auth env not configured" }, 500),
    }
  }

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: isOwner, error: rpcErr } = await userClient.rpc("fn_is_owner")
  if (rpcErr) {
    return { ok: false, response: json({ error: `auth check failed: ${rpcErr.message}` }, 401) }
  }
  if (!isOwner) {
    return { ok: false, response: json({ error: "owner role required" }, 403) }
  }

  // Look up actor staff_id for audit logging. Best-effort; null is fine.
  const { data: actorRow } = await userClient
    .from("staff")
    .select("id")
    .limit(1)
    .maybeSingle()

  return {
    ok: true,
    userClient,
    actorStaffId: actorRow?.id ?? null,
  }
}

export function publicAppUrl(): string {
  return Deno.env.get("PUBLIC_APP_URL") ?? "https://shishka-os.vercel.app"
}

export function normalizeCookHandle(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

export function cookEmailFor(name: string): string {
  return `cook-${normalizeCookHandle(name)}@kitchen.shishka.local`
}
