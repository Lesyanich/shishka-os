// ═══════════════════════════════════════════════════════════
// Edge Function: staff-set-pin
//
// Owner-only. Initial PIN setup OR rotation for a cook-tier staff row.
//
// First call (no auth_user_id):
//   - admin.createUser({ email: cook-<handle>@kitchen.shishka.local,
//                        password: PIN, email_confirm: true })
//   - UPDATE staff SET auth_user_id, pin_hash via fn_set_staff_pin_hash
//   - audit row: action=pin_set
//
// Rotation (auth_user_id present):
//   - admin.updateUserById(user_id, { password: PIN })
//   - UPDATE staff pin_hash via fn_set_staff_pin_hash
//   - audit row: action=pin_rotate
//
// Rate limit: 3 PIN changes per staff_id in the last 24h.
//
// POST { staff_id: UUID, pin: string (≥6 chars) }
// ═══════════════════════════════════════════════════════════

import { CORS, json } from "../_shared/cors.ts"
import { db } from "../_shared/supabase.ts"
import { requireOwner, cookEmailFor } from "../_shared/auth.ts"

interface SetPinPayload {
  staff_id?: string
  pin?: string
}

const RATE_LIMIT_PER_DAY = 3

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })
  if (req.method !== "POST")     return json({ error: "POST required" }, 405)

  const gate = await requireOwner(req)
  if (!gate.ok) return gate.response

  let payload: SetPinPayload
  try {
    payload = await req.json()
  } catch {
    return json({ error: "invalid JSON body" }, 400)
  }

  const staffId = payload.staff_id?.trim()
  const pin     = payload.pin?.trim() ?? ""

  if (!staffId) return json({ error: "staff_id required" }, 400)
  if (pin.length < 6) return json({ error: "pin must be at least 6 characters" }, 400)
  if (!/^\d+$/.test(pin)) return json({ error: "pin must be digits only" }, 400)

  // ── Load target row ─────────────────────────────────────────────
  const { data: target, error: readErr } = await db
    .from("staff")
    .select("id, name, app_role, auth_user_id, is_active")
    .eq("id", staffId)
    .maybeSingle()

  if (readErr) return json({ error: `lookup failed: ${readErr.message}` }, 500)
  if (!target) return json({ error: "staff not found" }, 404)
  if (!target.is_active) return json({ error: "staff is inactive" }, 400)
  if (target.app_role !== "cook") {
    return json({ error: "PIN is for cook-tier staff only" }, 400)
  }

  // ── Rate limit ─────────────────────────────────────────────────
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { count: recentCount, error: countErr } = await db
    .from("access_audit_log")
    .select("id", { count: "exact", head: true })
    .eq("target_staff_id", staffId)
    .in("action", ["pin_set", "pin_rotate"])
    .gte("created_at", since)

  if (countErr) return json({ error: `rate-check failed: ${countErr.message}` }, 500)
  if ((recentCount ?? 0) >= RATE_LIMIT_PER_DAY) {
    return json({ error: `too many PIN changes in 24h (limit ${RATE_LIMIT_PER_DAY})` }, 429)
  }

  const cookEmail = cookEmailFor(target.name)
  const isRotation = !!target.auth_user_id
  let authUserId = target.auth_user_id as string | null

  if (!isRotation) {
    // ── First-time set: create synthetic auth user ──────────────
    const { data: created, error: createErr } = await db.auth.admin.createUser({
      email: cookEmail,
      password: pin,
      email_confirm: true,
      user_metadata: { staff_id: staffId, staff_name: target.name, kitchen_tier: true },
    })
    if (createErr || !created?.user) {
      return json({ error: `create user failed: ${createErr?.message ?? "unknown"}` }, 500)
    }
    authUserId = created.user.id

    const { error: linkErr } = await db
      .from("staff")
      .update({ auth_user_id: authUserId, email: cookEmail })
      .eq("id", staffId)
    if (linkErr) {
      return json({ error: `link failed: ${linkErr.message}` }, 500)
    }
  } else {
    // ── Rotation: update password on existing auth user ─────────
    const { error: updErr } = await db.auth.admin.updateUserById(authUserId!, {
      password: pin,
    })
    if (updErr) {
      return json({ error: `password update failed: ${updErr.message}` }, 500)
    }
  }

  // ── Hash + stamp via owner-gated RPC (called with caller JWT) ──
  const { data: stampedAt, error: hashErr } = await gate.userClient.rpc(
    "fn_set_staff_pin_hash",
    { p_staff_id: staffId, p_pin: pin },
  )
  if (hashErr) {
    return json({ error: `hash store failed: ${hashErr.message}` }, 500)
  }

  // ── Audit ───────────────────────────────────────────────────────
  await db.from("access_audit_log").insert({
    actor_staff_id:  gate.actorStaffId,
    target_staff_id: staffId,
    action:          isRotation ? "pin_rotate" : "pin_set",
    metadata:        { auth_user_id: authUserId, pin_set_at: stampedAt },
  })

  return json({
    ok: true,
    staff_id: staffId,
    action: isRotation ? "pin_rotate" : "pin_set",
    pin_set_at: stampedAt,
  })
})
