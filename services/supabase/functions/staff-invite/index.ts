// ═══════════════════════════════════════════════════════════
// Edge Function: staff-invite
//
// Owner-only. Sends a Supabase invitation email to an owner-tier
// staff row, links staff.auth_user_id, writes access_audit_log.
//
// POST { staff_id: UUID, email: string }
//
// Forbidden:
//   - cook-tier targets (route them to staff-set-pin instead)
//   - calling with anything other than service_role for the admin op
//   - relying on Site URL alone — we always pass explicit redirectTo
// ═══════════════════════════════════════════════════════════

import { CORS, json } from "../_shared/cors.ts"
import { db } from "../_shared/supabase.ts"
import { requireOwner, publicAppUrl } from "../_shared/auth.ts"

interface InvitePayload {
  staff_id?: string
  email?: string
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })
  if (req.method !== "POST")     return json({ error: "POST required" }, 405)

  const gate = await requireOwner(req)
  if (!gate.ok) return gate.response

  let payload: InvitePayload
  try {
    payload = await req.json()
  } catch {
    return json({ error: "invalid JSON body" }, 400)
  }

  const staffId = payload.staff_id?.trim()
  const email   = payload.email?.trim().toLowerCase()

  if (!staffId) return json({ error: "staff_id required" }, 400)
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: "valid email required" }, 400)
  }

  // ── Load target row, enforce owner-tier ─────────────────────────
  const { data: target, error: readErr } = await db
    .from("staff")
    .select("id, name, app_role, auth_user_id, is_active")
    .eq("id", staffId)
    .maybeSingle()

  if (readErr) return json({ error: `lookup failed: ${readErr.message}` }, 500)
  if (!target) return json({ error: "staff not found" }, 404)
  if (!target.is_active) return json({ error: "staff is inactive" }, 400)
  if (target.app_role !== "owner") {
    return json({ error: "invite is for owner-tier staff; use staff-set-pin for cooks" }, 400)
  }
  if (target.auth_user_id) {
    return json({ error: "staff already linked; use staff-reset-password to re-issue" }, 409)
  }

  // ── Issue invite via Supabase Auth admin API ───────────────────
  const redirectTo = `${publicAppUrl()}/auth/callback`
  const { data: invited, error: inviteErr } = await db.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    data: { staff_id: staffId, staff_name: target.name },
  })

  if (inviteErr || !invited?.user) {
    return json({ error: `invite failed: ${inviteErr?.message ?? "unknown"}` }, 500)
  }

  // ── Link staff row ──────────────────────────────────────────────
  const { error: linkErr } = await db
    .from("staff")
    .update({ email, auth_user_id: invited.user.id })
    .eq("id", staffId)

  if (linkErr) {
    // The auth user exists but we couldn't link — surface the error so the
    // owner can retry. Audit log still records the attempt.
    await db.from("access_audit_log").insert({
      actor_staff_id:  gate.actorStaffId,
      target_staff_id: staffId,
      action:          "invite",
      metadata: { email, redirect_to: redirectTo, link_error: linkErr.message },
    })
    return json({ error: `link failed: ${linkErr.message}` }, 500)
  }

  // ── Audit ───────────────────────────────────────────────────────
  await db.from("access_audit_log").insert({
    actor_staff_id:  gate.actorStaffId,
    target_staff_id: staffId,
    action:          "invite",
    metadata:        { email, redirect_to: redirectTo, auth_user_id: invited.user.id },
  })

  return json({ ok: true, staff_id: staffId, email, auth_user_id: invited.user.id })
})
