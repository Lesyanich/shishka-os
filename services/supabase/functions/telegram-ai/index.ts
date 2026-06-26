// ═══════════════════════════════════════════════════════════
// Edge Function: telegram-ai
// Slow LLM work for the staff bot, decoupled from telegram-webhook so the
// webhook can return 200 fast (Telegram retries if the webhook waits > ~10s).
//
// Called server-to-server by telegram-webhook (fire-and-forget) with the
// shared TELEGRAM_WEBHOOK_SECRET in the x-telegram-bot-api-secret-token header.
//
// Phase B: classify intent (claude-haiku) → answer menu / general questions
// from the DB. Menu answers read ONLY `menu_public` (price / КБЖУ / ingredients —
// never cost_per_unit or margin). Task intake + owner relay are stubbed here
// (Phases C / D).
//
// Deploy: `supabase functions deploy telegram-ai --no-verify-jwt`
// Env: TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, ANTHROPIC_API_KEY,
//      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// ═══════════════════════════════════════════════════════════

import { db } from "../_shared/supabase.ts"
import { json } from "../_shared/cors.ts"
import { callLLM, type ApiResult } from "../_shared/llm-providers.ts"
import { MODEL_MAP, MODEL_PRICING } from "../_shared/prompts.ts"
import { escapeHtml, type InlineKeyboard, sendMessage } from "../_shared/telegram.ts"

const WEBHOOK_SECRET = Deno.env.get("TELEGRAM_WEBHOOK_SECRET") ?? ""
const MODEL_KEY = "gemini-flash" // Gemini 2.5 Flash — cheap + fast; routing + Q&A
// NOTE: Gemini/OpenAI providers force JSON output, so every prompt below must
// ask for JSON (free-text answers are wrapped as {"answer":"..."}).

type Lang = "ru" | "en" | "th"
type Intent = "menu_question" | "task_intake" | "report_to_owner" | "general_question"

function tri(lang: Lang, ru: string, en: string, th: string): string {
  return lang === "ru" ? ru : lang === "en" ? en : th
}
function langName(lang: Lang): string {
  return lang === "ru" ? "Russian" : lang === "th" ? "Thai" : "English"
}

/** Pull the first {...} JSON object out of an LLM text reply (Anthropic returns prose). */
function parseJsonObject(s: string): Record<string, unknown> | null {
  const m = s.match(/\{[\s\S]*\}/)
  if (!m) return null
  try {
    return JSON.parse(m[0]) as Record<string, unknown>
  } catch {
    return null
  }
}

/** Record token usage + cost so the AI bot is observable/billable. */
async function logCost(res: ApiResult, chatId: string, intent: string, lang: string) {
  try {
    const modelId = MODEL_MAP[MODEL_KEY].modelId
    const pricing = MODEL_PRICING[modelId] ?? { input: 0, output: 0 }
    const cost = res.tokensIn * pricing.input + res.tokensOut * pricing.output
    await db.from("api_cost_log").insert({
      service: "anthropic",
      model: modelId,
      feature: "telegram-ai",
      tokens_in: res.tokensIn,
      tokens_out: res.tokensOut,
      cost_usd: cost,
      reference_type: "telegram_chat",
      metadata: { chat_id: chatId, intent, lang },
    })
  } catch (e) {
    console.error("[telegram-ai] cost log failed:", e)
  }
}

const CLASSIFY_SYS =
  `You route messages from kitchen staff of "Shishka Healthy Kitchen" (a Thai healthy restaurant) sent to the staff Telegram bot. Classify the message into exactly ONE intent and detect its language.

Intents:
- "menu_question": anything about dishes — price, calories/КБЖУ (protein/carbs/fat), ingredients/состав, what is vegetarian/vegan, what's available, recommendations.
- "task_intake": the staff is describing work to be done or assigned (e.g. "нужно помыть холодильник", "Hein should restock napkins").
- "report_to_owner": a message meant for the owner/manager — a complaint, an issue, or a question not about the menu.
- "general_question": small talk or general info about the restaurant.

Return ONLY compact JSON, no markdown, no extra text:
{"intent":"menu_question|task_intake|report_to_owner|general_question","lang":"ru|en|th"}`

async function classify(chatId: string, text: string): Promise<{ intent: Intent; lang: Lang | null }> {
  const res = await callLLM(MODEL_KEY, CLASSIFY_SYS, text.slice(0, 1000))
  await logCost(res, chatId, "classify", "")
  const parsed = parseJsonObject(res.text) ?? {}
  const intents: Intent[] = ["menu_question", "task_intake", "report_to_owner", "general_question"]
  const intent = intents.includes(parsed.intent as Intent) ? (parsed.intent as Intent) : "general_question"
  const lang = (["ru", "en", "th"].includes(parsed.lang as string) ? (parsed.lang as Lang) : null)
  return { intent, lang }
}

interface MenuRow {
  name: string | null
  customer_short_name: string | null
  price: number | null
  calories: number | null
  protein: number | null
  carbs: number | null
  fat: number | null
  customer_ingredients: string | null
  category_name: string | null
}

/** Safe menu context for the LLM — price/КБЖУ/ingredients only, never cost/margin. */
async function fetchMenu(): Promise<Array<Record<string, unknown>>> {
  const { data } = await db
    .from("menu_public")
    .select("name, customer_short_name, price, calories, protein, carbs, fat, customer_ingredients, category_name")
    .eq("is_available", true)
    .order("category_sort_order", { ascending: true })
    .order("display_order", { ascending: true })
  return ((data ?? []) as MenuRow[]).map((d) => ({
    name: d.customer_short_name || d.name,
    cat: d.category_name,
    price: d.price,
    kcal: d.calories,
    protein: d.protein,
    carbs: d.carbs,
    fat: d.fat,
    ingredients: (d.customer_ingredients ?? "").replace(/&amp;/g, "&").slice(0, 220) || null,
  }))
}

async function answerMenu(chatId: string, text: string, lang: Lang) {
  const menu = await fetchMenu()
  const sys =
    `You are a friendly assistant for the staff of "Shishka Healthy Kitchen", a Thai healthy restaurant. Answer the staff member's question using ONLY the MENU DATA below. Be concise (a few short lines). Write the reply in ${langName(lang)}.
- Prices are in Thai Baht (฿). КБЖУ (calories / protein / carbs / fat) are per portion.
- For allergen or diet questions, reason from the listed ingredients; for severe allergies tell them to confirm with the kitchen.
- If a dish or a fact is not in the data, say you don't have that info — do NOT invent prices or numbers.
- Never mention internal cost, margin, or supplier info (it is not provided and must never be guessed).

Return ONLY compact JSON: {"answer":"<your reply text, in ${langName(lang)}>"}

MENU DATA (JSON):
${JSON.stringify(menu)}`
  const res = await callLLM(MODEL_KEY, sys, text.slice(0, 1000))
  await logCost(res, chatId, "menu_question", lang)
  const parsed = parseJsonObject(res.text)
  const answer = (typeof parsed?.answer === "string" ? parsed.answer.trim() : "") ||
    tri(lang, "Извините, не нашёл ответа.", "Sorry, I couldn't find an answer.", "ขออภัย ไม่พบคำตอบ")
  await sendMessage(chatId, answer)
}

async function answerGeneral(chatId: string, text: string, lang: Lang) {
  const sys =
    `You are the staff assistant bot for "Shishka Healthy Kitchen", a Thai healthy restaurant. The staff can ask you about the menu (prices, calories/КБЖУ, ingredients, what's vegetarian), or describe a task to assign. Answer briefly and helpfully in ${langName(lang)}. If you don't know something specific about this restaurant, say so and suggest asking the owner. Never invent menu prices, schedules, or policies.

Return ONLY compact JSON: {"answer":"<your reply text, in ${langName(lang)}>"}`
  const res = await callLLM(MODEL_KEY, sys, text.slice(0, 1000))
  await logCost(res, chatId, "general_question", lang)
  const parsed = parseJsonObject(res.text)
  const answer = (typeof parsed?.answer === "string" ? parsed.answer.trim() : "") ||
    tri(lang, "Извините, не понял вопрос.", "Sorry, I didn't catch that.", "ขออภัย ไม่เข้าใจคำถาม")
  await sendMessage(chatId, answer)
}

// ── Task intake (free text → structured draft → owner approval) ─────────────
/** Today in Asia/Bangkok (UTC+7), YYYY-MM-DD. */
function todayICT(): string {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10)
}

interface StaffLite {
  id: string
  name: string
  name_th: string | null
  role: string | null
}
const STATIONS = ["L1", "L2", "general"]
const CATEGORIES = ["opening", "closing", "prep", "cleaning", "stock_check", "waste", "admin", "general"]
const PRIORITIES = ["critical", "high", "medium", "low"]

async function activeStaff(): Promise<StaffLite[]> {
  const { data } = await db
    .from("staff")
    .select("id, name, name_th, role")
    .eq("is_active", true)
    .order("name", { ascending: true })
  return (data ?? []) as StaffLite[]
}

/** Resolve an AI-proposed assignee name to a staff id (exact, then fuzzy). */
function resolveAssignee(name: unknown, roster: StaffLite[]): string | null {
  if (typeof name !== "string" || !name.trim()) return null
  const n = name.trim().toLowerCase()
  const exact = roster.find((s) => s.name.toLowerCase() === n || (s.name_th ?? "").toLowerCase() === n)
  if (exact) return exact.id
  const partial = roster.find((s) => s.name.toLowerCase().includes(n) || n.includes(s.name.toLowerCase()))
  return partial?.id ?? null
}

function pick<T extends string>(val: unknown, allowed: T[], fallback: T): T {
  return allowed.includes(val as T) ? (val as T) : fallback
}

const PRIORITY_FLAG: Record<string, string> = { critical: "🔴", high: "🟠", medium: "🔵", low: "⚪" }

function draftKeyboard(draftId: string): InlineKeyboard {
  return [[
    { text: "✅ Approve · อนุมัติ", callback_data: `appr:${draftId}` },
    { text: "❌ Discard · ทิ้ง", callback_data: `disc:${draftId}` },
  ]]
}

/** Send the draft card to every linked owner / task_manager. Returns how many got it. */
async function notifyOwnersOfDraft(card: string, draftId: string): Promise<number> {
  const { data } = await db
    .from("staff_telegram")
    .select("telegram_chat_id, staff:staff!inner(app_role, is_active)")
    .eq("staff.is_active", true)
    .in("staff.app_role", ["owner", "task_manager"])
  const rows = (data ?? []) as Array<{ telegram_chat_id: string }>
  let sent = 0
  for (const r of rows) {
    const res = await sendMessage(r.telegram_chat_id, card, draftKeyboard(draftId))
    if (res.ok) sent++
  }
  return sent
}

async function handleTaskIntake(chatId: string, text: string, lang: Lang, proposerName: string) {
  const roster = await activeStaff()
  const rosterJson = JSON.stringify(roster.map((s) => ({ name: s.name, name_th: s.name_th, role: s.role })))
  const sys =
    `You convert a free-text work request from kitchen staff into a structured task for "Shishka Healthy Kitchen". Return ONLY compact JSON, no markdown, no extra text.

Fields:
- "title": short imperative task title in English.
- "title_th": Thai translation of the title (or null).
- "station": one of ${STATIONS.join(", ")} (L1 = prep kitchen, L2 = assembly/service, general = either).
- "assignee": the staff member's name this should go to, matched to the roster below, or null if unclear.
- "category": one of ${CATEGORIES.join(", ")}.
- "priority": one of ${PRIORITIES.join(", ")} (default medium).
- "due_date": YYYY-MM-DD if a date is mentioned (today is ${todayICT()}), else null.
- "due_time": HH:MM 24-hour if a time is mentioned, else null.

STAFF ROSTER (JSON): ${rosterJson}

Return: {"title":"...","title_th":"...|null","station":"...","assignee":"...|null","category":"...","priority":"...","due_date":"...|null","due_time":"...|null"}`

  const res = await callLLM(MODEL_KEY, sys, text.slice(0, 1000))
  await logCost(res, chatId, "task_intake", lang)
  const ex = parseJsonObject(res.text)
  const title = typeof ex?.title === "string" ? ex.title.trim() : ""
  if (!ex || !title) {
    await sendMessage(
      chatId,
      tri(lang,
        "🤔 Не понял задачу. Опишите чуть подробнее — что сделать и кому.",
        "🤔 I couldn't parse that task. Try describing what to do (and for whom).",
        "🤔 ไม่เข้าใจงาน ลองอธิบายเพิ่มว่าต้องทำอะไร (และให้ใคร)"),
    )
    return
  }

  const station = pick(ex.station, STATIONS, "general")
  const category = pick(ex.category, CATEGORIES, "general")
  const priority = pick(ex.priority, PRIORITIES, "medium")
  const assigneeId = resolveAssignee(ex.assignee, roster)
  const dueDate = typeof ex.due_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(ex.due_date) ? ex.due_date : null
  const dueTime = typeof ex.due_time === "string" && /^\d{2}:\d{2}/.test(ex.due_time) ? ex.due_time.slice(0, 5) : null
  const titleTh = typeof ex.title_th === "string" && ex.title_th.trim() ? ex.title_th.trim() : null

  const { data: row, error } = await db
    .from("staff_tasks")
    .insert({
      title,
      title_th: titleTh,
      station,
      category,
      priority,
      assigned_to: assigneeId,
      created_by: proposerName,
      due_date: dueDate,
      due_time: dueTime,
      status: "draft",
      is_template: false,
    })
    .select("id")
    .single()

  if (error || !row) {
    console.error("[telegram-ai] draft insert failed:", error)
    await sendMessage(
      chatId,
      tri(lang,
        "⚠️ Не удалось сохранить черновик. Попробуйте ещё раз.",
        "⚠️ Couldn't save the draft. Please try again.",
        "⚠️ บันทึกแบบร่างไม่สำเร็จ ลองใหม่อีกครั้ง"),
    )
    return
  }

  const draftId = row.id as string
  const assigneeName = assigneeId ? (roster.find((s) => s.id === assigneeId)?.name ?? "—") : null
  const flag = PRIORITY_FLAG[priority] ?? "🔵"
  const due = dueTime ? `⏰ ${dueTime}` : (dueDate ? `📅 ${dueDate}` : "—")
  const card = [
    `📝 <b>New task draft</b> · from ${escapeHtml(proposerName)}`,
    `${flag} <b>${escapeHtml(title)}</b>${titleTh ? ` / ${escapeHtml(titleTh)}` : ""}`,
    `👤 ${assigneeName ? escapeHtml(assigneeName) : "<i>unassigned</i>"} · 🏷 ${station} · ${due} · ${priority}`,
  ].join("\n")

  const reached = await notifyOwnersOfDraft(card, draftId)
  if (reached === 0) {
    await db.from("staff_tasks").update({ status: "cancelled" }).eq("id", draftId)
    await sendMessage(
      chatId,
      tri(lang,
        "📝 Записал, но сейчас нет подключённого менеджера для подтверждения. Добавьте задачу на доске (🗂).",
        "📝 Noted, but no manager is connected to approve it right now. Add it on the board (🗂).",
        "📝 รับเรื่องแล้ว แต่ตอนนี้ไม่มีผู้จัดการเชื่อมต่อเพื่ออนุมัติ เพิ่มงานบนบอร์ด (🗂)"),
    )
    return
  }

  await sendMessage(
    chatId,
    tri(lang,
      `📝 Отправил черновик «${title}» на подтверждение менеджеру.`,
      `📝 Sent the draft "${title}" to a manager for approval.`,
      `📝 ส่งแบบร่าง "${title}" ให้ผู้จัดการอนุมัติแล้ว`),
  )
}

async function handleAI(chatId: string, text: string, fallbackLang: Lang, proposerName: string) {
  const { intent, lang: detected } = await classify(chatId, text)
  const lang = detected ?? fallbackLang

  if (intent === "menu_question") {
    await answerMenu(chatId, text, lang)
  } else if (intent === "general_question") {
    await answerGeneral(chatId, text, lang)
  } else if (intent === "task_intake") {
    // No AI task creation — guide them to the native form (no tokens, no surprise drafts).
    await sendMessage(
      chatId,
      tri(lang,
        "📝 Чтобы создать задачу — нажмите кнопку ➕ Add (форма: станция, исполнитель, дата).",
        "📝 To create a task, tap the ➕ Add button (form: station, assignee, date).",
        "📝 สร้างงานได้โดยกดปุ่ม ➕ Add (ฟอร์ม: สถานี ผู้รับผิดชอบ วันที่)"),
    )
  } else {
    await relayToOwners(chatId, text, lang, proposerName)
  }
}

/** Forward a staff message to linked owners/managers with a "Reply" button. */
async function relayToOwners(askerChatId: string, text: string, lang: Lang, askerName: string) {
  const { data } = await db
    .from("staff_telegram")
    .select("telegram_chat_id, staff:staff!inner(app_role, is_active)")
    .eq("staff.is_active", true)
    .in("staff.app_role", ["owner", "task_manager"])
  const chats = ((data ?? []) as Array<{ telegram_chat_id: string }>).map((r) => r.telegram_chat_id)

  if (chats.length === 0) {
    await sendMessage(
      askerChatId,
      tri(lang,
        "🙏 Сейчас нет подключённого менеджера. Пожалуйста, напишите ему напрямую.",
        "🙏 No manager is connected right now. Please contact them directly.",
        "🙏 ตอนนี้ไม่มีผู้จัดการเชื่อมต่อ กรุณาติดต่อโดยตรง"),
    )
    return
  }

  const card = `❓ <b>${escapeHtml(askerName)}</b> asks · ถาม:\n${escapeHtml(text.slice(0, 800))}`
  const kb: InlineKeyboard = [[{ text: "↩ Reply · ตอบกลับ", callback_data: `rly:${askerChatId}` }]]
  let sent = 0
  for (const c of chats) {
    const r = await sendMessage(c, card, kb)
    if (r.ok) sent++
  }
  await sendMessage(
    askerChatId,
    sent > 0
      ? tri(lang, "🙏 Передал ваше сообщение менеджеру.", "🙏 I've passed your message to a manager.", "🙏 ส่งข้อความให้ผู้จัดการแล้ว")
      : tri(lang, "🙏 Не удалось передать. Напишите менеджеру напрямую.", "🙏 Couldn't deliver. Please contact a manager directly.", "🙏 ส่งไม่สำเร็จ กรุณาติดต่อผู้จัดการโดยตรง"),
  )
}

// ── Stocktake / revision (free-text count → matched entries → confirm) ──────
interface CatalogItem {
  code: string
  name: string
  unit: string | null
}

/** Items the staff might be counting at this station, for AI name-matching. */
async function stocktakeCatalog(station: string): Promise<CatalogItem[]> {
  const prefixes = station === "L2" ? ["PF-", "SALE-"] : ["RAW-", "PF-"]
  const ors = prefixes.map((p) => `product_code.ilike.${p}%`).join(",")
  const { data } = await db
    .from("nomenclature")
    .select("product_code, name, customer_short_name, base_unit")
    .or(ors)
    .not("is_deleted", "is", true)
    .limit(800)
  return ((data ?? []) as Array<{ product_code: string; name: string; customer_short_name: string | null; base_unit: string | null }>)
    .map((r) => ({ code: r.product_code, name: r.customer_short_name || r.name, unit: r.base_unit }))
}

async function handleStocktake(chatId: string, text: string, station: string, countedBy: string) {
  const catalog = await stocktakeCatalog(station)
  const sys =
    `You parse a kitchen STOCK COUNT for "Shishka Healthy Kitchen". The staff member lists how much of each ingredient / prep is left (any language: ru/en/th). For each line, match it to a product CODE from the CATALOG by name (or null if you can't match confidently) and extract the quantity + unit.

Return ONLY compact JSON: {"items":[{"said":"<what they wrote>","code":"<catalog code or null>","qty":<number>,"unit":"<kg|L|pcs|g|ml|...>"}]}

CATALOG (JSON): ${JSON.stringify(catalog)}`
  const res = await callLLM(MODEL_KEY, sys, text.slice(0, 2000))
  await logCost(res, chatId, "stocktake", station)
  const parsed = parseJsonObject(res.text)
  const rawItems = Array.isArray((parsed as { items?: unknown })?.items) ? (parsed as { items: unknown[] }).items : []

  const codes = rawItems
    .map((it) => (typeof (it as { code?: unknown }).code === "string" ? (it as { code: string }).code : null))
    .filter((c): c is string => !!c)
  const byCode = new Map<string, { id: string; name: string; base_unit: string | null }>()
  if (codes.length) {
    const { data } = await db
      .from("nomenclature")
      .select("id, product_code, name, customer_short_name, base_unit")
      .in("product_code", codes)
    for (const n of (data ?? []) as Array<{ id: string; product_code: string; name: string; customer_short_name: string | null; base_unit: string | null }>) {
      byCode.set(n.product_code, { id: n.id, name: n.customer_short_name || n.name, base_unit: n.base_unit })
    }
  }

  const session = crypto.randomUUID()
  const matched: Array<{ id: string; name: string; qty: number; unit: string }> = []
  const unmatched: string[] = []
  for (const it of rawItems as Array<{ said?: unknown; code?: unknown; qty?: unknown; unit?: unknown }>) {
    const code = typeof it.code === "string" ? it.code : null
    const nom = code ? byCode.get(code) : undefined
    const qty = Number(it.qty)
    if (nom && Number.isFinite(qty) && qty >= 0) {
      matched.push({ id: nom.id, name: nom.name, qty, unit: (typeof it.unit === "string" && it.unit) || nom.base_unit || "" })
    } else {
      unmatched.push(String(it.said ?? code ?? "?").slice(0, 40))
    }
  }

  if (matched.length === 0) {
    await sendMessage(chatId, "🤔 Couldn't match any item. Try simpler, e.g. «carrots 5 kg». · ลองใหม่ เช่น แครอท 5kg")
    return
  }

  await db.from("stocktake_entries").insert(matched.map((m) => ({
    nomenclature_id: m.id,
    station,
    counted_qty: m.qty,
    unit: m.unit,
    counted_by: countedBy,
    source_text: text.slice(0, 500),
    status: "pending",
    session_id: session,
  })))

  const lines = [`📦 <b>Stocktake · ${station}</b> — confirm? · ยืนยัน?`]
  matched.forEach((m, i) => lines.push(`${i + 1}. ${escapeHtml(m.name)} — <b>${m.qty} ${escapeHtml(m.unit)}</b>`))
  if (unmatched.length) lines.push(`\n⚠️ Not recognised · ไม่รู้จัก: ${unmatched.map(escapeHtml).join(", ")}`)
  const kb: InlineKeyboard = [[
    { text: "✅ Save · บันทึก", callback_data: `rev:save:${session}` },
    { text: "❌ Cancel · ยกเลิก", callback_data: `rev:cancel:${session}` },
  ]]
  await sendMessage(chatId, lines.join("\n"), kb)
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 })
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405)

  // Server-to-server only: same shared secret the webhook validates.
  const secret = req.headers.get("x-telegram-bot-api-secret-token") ?? ""
  if (!WEBHOOK_SECRET || secret !== WEBHOOK_SECRET) {
    return json({ ok: false, error: "unauthorized" }, 401)
  }

  let body: { chat_id?: unknown; text?: unknown; lang?: unknown; staff_name?: unknown; mode?: unknown; station?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ ok: false, error: "bad_json" }, 400)
  }
  const chatId = body.chat_id != null ? String(body.chat_id) : ""
  const text = typeof body.text === "string" ? body.text.trim() : ""
  const fallbackLang = (["ru", "en", "th"].includes(body.lang as string) ? (body.lang as Lang) : "th")
  const proposerName = typeof body.staff_name === "string" && body.staff_name.trim() ? body.staff_name.trim() : "Staff"
  const mode = typeof body.mode === "string" ? body.mode : ""
  const station = ["L1", "L2", "general"].includes(body.station as string) ? (body.station as string) : "general"
  if (!chatId || !text) return json({ ok: false, error: "missing_fields" }, 400)

  try {
    if (mode === "stocktake") {
      await handleStocktake(chatId, text, station, proposerName)
    } else {
      await handleAI(chatId, text, fallbackLang, proposerName)
    }
    return json({ ok: true })
  } catch (e) {
    console.error("[telegram-ai] error:", e)
    await sendMessage(chatId, "⚠️ Sorry, something went wrong. Please try again. · ลองใหม่อีกครั้ง").catch(() => {})
    return json({ ok: false, error: (e as Error).message }, 200)
  }
})
