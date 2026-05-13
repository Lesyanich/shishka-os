// ═══════════════════════════════════════════════════════════
// Edge Function: staff-reset-password
//
// Owner-only. Sends a Supabase password-recovery email to an
// already-linked owner-tier staff row. Cook-tier rows use
// staff-set-pin (rotate) instead — there is no email to send to.
//
// POST { staff_id: UUID }
// ═══════════════════════════════════════════════════════════

import { CORS, json } from "../_shared/cors.ts"
import { db } from "../_shared/supabase.ts"
import { requireOwner, publicAppUrl } from "../_shared/auth.ts"

interface ResetPayload {
  staff_id?: string
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })
  if (req.method !== "POST")     return json({ error: "POST required" }, 405)

  const gate = await requireOwner(req)
  if (!gate.ok) return gate.response

  let payload: ResetPayload
  try {
    payload = await req.json()
  } catch {
    return json({ error: "invalid JSON body" }, 400)
  }

  const staffId = payload.staff_id?.trim()
  if (!staffId) return json({ error: "staff_id required" }, 400)

  const { data: target, error: readErr } = await db
    .from("staff")
    .select("id, name, app_role, email, auth_user_id, is_active")
    .eq("id", staffId)
    .maybeSingle()

  if (readErr) return json({ error: `lookup failed: ${readErr.message}` }, 500)
  if (!target) return json({ error: "staff not found" }, 404)
  if (!target.is_active) return json({ error: "staff is inactive" }, 400)
  if (target.app_role !== "owner") {
    return json({ error: "reset is for owner-tier staff; cooks use rotate-PIN" }, 400)
  }
  if (!target.email || !target.auth_user_id) {
    return json({ error: "staff is not linked yet; use staff-invite first" }, 409)
  }

  const redirectTo = `${publicAppUrl()}/auth/callback`
  const { error: linkErr } = await db.auth.admin.generateLink({
    type: "recovery",
    email: target.email,
    options: { redirectTo },
  })
  if (linkErr) {
    return json({ error: `reset failed: ${linkErr.message}` }, 500)
  }

  await db.from("access_audit_log").insert({
    actor_staff_id:  gate.actorStaffId,
    target_staff_id: staffId,
    action:          "reset_password",
    metadata:        { email: target.email, redirect_to: redirectTo },
  })

  return json({ ok: true, staff_id: staffId, email: target.email })
})
