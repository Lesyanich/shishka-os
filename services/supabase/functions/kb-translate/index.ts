// ═══════════════════════════════════════════════════════════
// Edge Function: kb-translate
// Draft-translate a Handbook (knowledge base) page from English into Thai or
// Burmese for the owner to review. English is the canonical stored language;
// th/my are drafts the owner hand-corrects before saving.
//
// SECURITY: owner-only, enforced IN-HANDLER. Deployed with verify_jwt=FALSE
// (same as telegram-ai) so the browser CORS preflight + POST reach this code —
// verify_jwt=true made the gateway reject the cross-origin call before it ran.
// The real gate: resolve the caller via getUser(token) and require
// staff.app_role = 'owner' (verify_jwt alone is not enough — the anon key is a
// valid JWT; see gotcha: service-role fn needs in-handler guard).
//
// Self-contained on purpose (no ../_shared imports) so the repo file and the
// deployed function stay identical and it deploys cleanly via MCP.
//
// Env (already configured for the project's other functions):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY
// ═══════════════════════════════════════════════════════════

import { createClient } from "npm:@supabase/supabase-js@2"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  })
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? ""
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? ""

// Sonnet handles Thai + Burmese noticeably better than Haiku; translations are
// owner-triggered and infrequent, so quality wins over cost here.
const MODEL_ID = "claude-sonnet-4-20250514"
const PRICE = { input: 3 / 1_000_000, output: 15 / 1_000_000 }

const LANG_NAME: Record<string, string> = {
  th: "Thai",
  my: "Burmese (Myanmar)",
}

/** Pull the first {...} JSON object out of an LLM text reply. */
function parseJsonObject(s: string): Record<string, unknown> | null {
  const m = s.match(/\{[\s\S]*\}/)
  if (!m) return null
  try {
    return JSON.parse(m[0]) as Record<string, unknown>
  } catch {
    return null
  }
}

const db = createClient(SUPABASE_URL, SERVICE_KEY)

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })
  if (req.method !== "POST") return json({ error: "POST only" }, 405)

  // ── Owner-only guard ────────────────────────────────────────────────────
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "")
  if (!token) return json({ error: "unauthorized" }, 401)

  const { data: userData, error: userErr } = await db.auth.getUser(token)
  if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401)

  const { data: staffRow } = await db
    .from("staff")
    .select("app_role")
    .eq("auth_user_id", userData.user.id)
    .eq("is_active", true)
    .maybeSingle()
  if (!staffRow || staffRow.app_role !== "owner") {
    return json({ error: "forbidden: owner only" }, 403)
  }

  if (!ANTHROPIC_KEY) return json({ error: "ANTHROPIC_API_KEY not configured" }, 500)

  // ── Input ───────────────────────────────────────────────────────────────
  let payload: { title_en?: string; body_md_en?: string; target_lang?: string }
  try {
    payload = await req.json()
  } catch {
    return json({ error: "invalid JSON body" }, 400)
  }
  const { title_en, body_md_en, target_lang } = payload
  if (!target_lang || !(target_lang in LANG_NAME)) {
    return json({ error: "target_lang must be 'th' or 'my'" }, 400)
  }
  if (!title_en && !body_md_en) return json({ error: "nothing to translate" }, 400)

  const langName = LANG_NAME[target_lang]
  const system =
    `You are a professional translator for a healthy-food restaurant kitchen in Phuket, Thailand ("Shishka Healthy Kitchen"). Translate the given staff-handbook page from English into ${langName}.

Rules:
- Translate for kitchen staff — clear, simple, respectful language a cook can follow.
- PRESERVE the Markdown structure exactly: headings (#), ordered/unordered lists, task checkboxes ([ ]), bold/italic, tables, links and code fences. Translate only the human-readable text — never the link URLs, code, product codes, or the brand name "Shishka".
- Keep numbers, temperatures and units unchanged.
- Return ONLY a JSON object with exactly two string fields: "title" and "body_md". No preamble, no explanation.`

  const userText =
    `TITLE (English):\n${title_en ?? ""}\n\nBODY (English Markdown):\n${body_md_en ?? ""}`

  // ── Call Claude ───────────────────────────────────────────────────────────
  let resp: Response
  try {
    resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL_ID,
        max_tokens: 8192,
        system,
        messages: [{ role: "user", content: userText }],
      }),
    })
  } catch (e) {
    return json({ error: `translation request failed: ${e instanceof Error ? e.message : String(e)}` }, 502)
  }

  if (!resp.ok) {
    const errText = await resp.text()
    return json({ error: `Anthropic API ${resp.status}: ${errText}` }, 502)
  }

  const body = await resp.json()
  const text: string = body.content?.[0]?.text ?? ""
  const tokensIn: number = body.usage?.input_tokens ?? 0
  const tokensOut: number = body.usage?.output_tokens ?? 0

  const parsed = parseJsonObject(text)
  const title = typeof parsed?.title === "string" ? parsed.title : (title_en ?? "")
  const body_md = typeof parsed?.body_md === "string" ? parsed.body_md : text

  // ── Best-effort cost logging (observable/billable) ───────────────────────
  try {
    await db.from("api_cost_log").insert({
      service: "anthropic",
      model: MODEL_ID,
      feature: "kb-translate",
      tokens_in: tokensIn,
      tokens_out: tokensOut,
      cost_usd: tokensIn * PRICE.input + tokensOut * PRICE.output,
      reference_type: "kb_translation",
      metadata: { target_lang },
    })
  } catch (e) {
    console.error("[kb-translate] cost log failed:", e)
  }

  return json({ title, body_md, target_lang })
})
