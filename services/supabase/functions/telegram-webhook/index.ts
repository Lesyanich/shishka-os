// ═══════════════════════════════════════════════════════════
// Edge Function: telegram-webhook
// Inbound updates from the Shishka_Kitchen_bot (staff task tracker, Phase 2).
//
// Handles:
//   • /start <code>      → link this Telegram chat to a staff member
//                          (fn_link_telegram validates + consumes the code)
//   • /today             → digest of the staff member's tasks for today (ICT)
//   • callback "done:<id>"   → mark task done, edit message, clear buttons
//   • callback "snooze:<id>" → push due_time +30 min, keep buttons
//
// Auth: Telegram sends our secret in the X-Telegram-Bot-Api-Secret-Token header
// (configured at setWebhook). Mismatch → 401 + dead-letter. Telegram itself
// cannot send a JWT, so deploy with `--no-verify-jwt`.
//
// Always returns 200 for handled updates so Telegram does not retry-storm.
//
// Deploy: `supabase functions deploy telegram-webhook --no-verify-jwt`
// Env: TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET
// ═══════════════════════════════════════════════════════════

import { db } from "../_shared/supabase.ts"
import {
  answerCallbackQuery,
  boardUrl,
  downloadFile,
  editMessageText,
  escapeHtml,
  formatTask,
  getFilePath,
  MENU_ADD,
  MENU_BOARD,
  MENU_DONE,
  MENU_STOCKTAKE,
  MENU_TEAM,
  MENU_TODAY,
  sendForceReply,
  sendMenu,
  sendMessage,
  sendPhoto,
  setMyCommands,
  taskKeyboard,
  type FormattableTask,
  type InlineButton,
  type InlineKeyboard,
} from "../_shared/telegram.ts"

const REPLY_PROMPT = "↩ Type your reply · พิมพ์คำตอบ"
const REV_PROMPT = "📦 Send the stock counts · ส่งจำนวนสต๊อก"
const FORM_TITLE_PROMPT = "📝 Type the task title · พิมพ์ชื่องาน"
const COMMENT_PROMPT = "💬 Type your comment · พิมพ์ความคิดเห็น"
const PHOTO_PROMPT = "📷 Send the photo for this task · ส่งรูปสำหรับงานนี้"

const WEBHOOK_SECRET = Deno.env.get("TELEGRAM_WEBHOOK_SECRET") ?? ""
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? ""

/** Keep an async task alive after we return 200 (Supabase Edge runtime). */
function fireAndForget(p: Promise<unknown>) {
  const er = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime
  if (er?.waitUntil) er.waitUntil(p)
  else p.catch(() => {})
}

function ok(data: unknown = { ok: true }) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}

async function deadLetter(reason: string, payload: unknown) {
  try {
    await db.from("staff_task_dead_letter").insert({
      source: "telegram-webhook",
      reason,
      payload: payload as Record<string, unknown>,
    })
  } catch (e) {
    console.error("[telegram-webhook] dead-letter insert failed:", e)
  }
}

/** Today's date in Asia/Bangkok (UTC+7), as YYYY-MM-DD. */
function todayICT(): string {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10)
}

interface StaffCtx {
  id: string
  name: string
  lang: string
  appRole: string | null
}

async function staffForChat(chatId: string): Promise<StaffCtx | null> {
  const { data } = await db
    .from("staff_telegram")
    .select("staff_id, lang, staff:staff(name, app_role)")
    .eq("telegram_chat_id", chatId)
    .maybeSingle()
  if (!data) return null
  const raw = data.staff as { name?: string; app_role?: string } | { name?: string; app_role?: string }[] | null
  const staff = Array.isArray(raw) ? raw[0] : raw
  return {
    id: data.staff_id as string,
    name: staff?.name ?? "",
    lang: (data.lang as string) ?? "th",
    appRole: staff?.app_role ?? null,
  }
}

/** Hand a free-text message to telegram-ai (slow LLM work) without blocking the 200. */
function triggerAI(chatId: string, text: string, staff: StaffCtx, extra?: { mode?: string; station?: string }) {
  if (!SUPABASE_URL || !WEBHOOK_SECRET) return
  const p = fetch(`${SUPABASE_URL}/functions/v1/telegram-ai`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-telegram-bot-api-secret-token": WEBHOOK_SECRET,
    },
    body: JSON.stringify({
      chat_id: chatId,
      text: text.slice(0, 2000),
      lang: staff.lang,
      staff_name: staff.name,
      ...extra,
    }),
  }).catch((e) => console.error("[telegram-webhook] triggerAI failed:", e))
  fireAndForget(p)
}

/** Stocktake entry point — ask which station, then prompt for free-text counts. */
async function handleStocktakeStart(chatId: string) {
  await sendMessage(
    chatId,
    "📦 <b>Stocktake · ревизия</b>\nWhich station? · สถานีไหน?",
    [[
      { text: "🔪 L1 · Prep", callback_data: "rev:L1" },
      { text: "🍽 L2 · Assembly", callback_data: "rev:L2" },
    ]],
  )
}

/** Confirm a parsed stocktake (flip pending → confirmed) and summarise. */
async function confirmStocktake(session: string, msgChatId: string, messageId: number, cbId: string) {
  await db.from("stocktake_entries")
    .update({ status: "confirmed" })
    .eq("session_id", session)
    .eq("status", "pending")
  const { data } = await db
    .from("stocktake_entries")
    .select("counted_qty, unit, nomenclature:nomenclature(name)")
    .eq("session_id", session)
    .eq("status", "confirmed")
    .order("created_at", { ascending: true })
  const rows = (data ?? []) as Array<{ counted_qty: number; unit: string | null; nomenclature: { name?: string } | { name?: string }[] | null }>
  const name = (r: typeof rows[number]) => {
    const n = Array.isArray(r.nomenclature) ? r.nomenclature[0] : r.nomenclature
    return n?.name ?? "—"
  }
  const lines = [`✅ <b>Stocktake saved · บันทึกแล้ว</b> (${rows.length})`]
  const out: string[] = []
  rows.forEach((r) => {
    lines.push(`• ${escapeHtml(name(r))} — ${r.counted_qty} ${r.unit ?? ""}`)
    if (Number(r.counted_qty) === 0) out.push(escapeHtml(name(r)))
  })
  if (out.length) lines.push(`\n🔴 <b>Out of stock · หมด:</b> ${out.join(", ")}`)
  await editMessageText(msgChatId, messageId, lines.join("\n"))
  await answerCallbackQuery(cbId, "✅ Saved")
}

async function handleStart(chatId: string, username: string | null, code: string | null) {
  if (!code) {
    await sendMenu(
      chatId,
      "👋 <b>Shishka Kitchen</b>\nAsk the owner for your personal link to connect your tasks.\nขอลิงก์ส่วนตัวจากเจ้าของร้านเพื่อเชื่อมต่องานของคุณ",
    )
    return
  }

  const { data, error } = await db.rpc("fn_link_telegram", {
    p_code: code,
    p_chat_id: chatId,
    p_username: username,
  })

  const row = Array.isArray(data) ? data[0] : null
  if (error || !row) {
    await sendMessage(
      chatId,
      "⚠️ This link is invalid or expired. Ask the owner for a new one.\nลิงก์ไม่ถูกต้องหรือหมดอายุ ขอใหม่จากเจ้าของร้าน",
    )
    return
  }

  const name = (row as { staff_name?: string }).staff_name ?? ""
  await setMyCommands()
  await sendMenu(
    chatId,
    `✅ Connected, <b>${name}</b>!\nYou'll get your tasks and reminders here.\nเชื่อมต่อแล้ว! คุณจะได้รับงานและการแจ้งเตือนที่นี่\n\nTap a button below 👇 · กดปุ่มด้านล่าง`,
  )
}

interface ChecklistTask {
  id: string
  title: string
  due_time: string | null
  priority: string
  status: string
}

const PRIORITY_FLAG: Record<string, string> = { critical: "🔴", high: "🟠", medium: "🔵", low: "⚪" }

function chunk(btns: InlineButton[], size: number): InlineKeyboard {
  const rows: InlineKeyboard = []
  for (let i = 0; i < btns.length; i += size) rows.push(btns.slice(i, i + size))
  return rows
}
function statusBox(status: string): string {
  return status === "done" ? "✅" : status === "in_progress" ? "🔄" : "☐"
}

/** Toggle a task done ↔ todo — reversible, so an accidental tap is undone by tapping again. */
async function toggleDone(taskId: string) {
  const { data } = await db.from("staff_tasks").select("status").eq("id", taskId).maybeSingle()
  const cur = (data?.status as string) ?? "todo"
  if (cur === "done") {
    await db.from("staff_tasks").update({ status: "todo", completed_at: null, completed_via: null }).eq("id", taskId)
  } else {
    await db.from("staff_tasks")
      .update({ status: "done", completed_at: new Date().toISOString(), completed_via: "telegram" })
      .eq("id", taskId)
  }
}

type ListMode = "browse" | "mark" | "open"
/**
 * My tasks today. browse = read-only list + Mark done / Open / New buttons.
 * mark = per-task toggle buttons (reversible). open = pick a number to drill
 * into a task's detail (description, comments, photos).
 */
async function handleToday(chatId: string, editMessageId?: number, mode: ListMode = "browse") {
  const staff = await staffForChat(chatId)
  if (!staff) {
    await sendMessage(chatId, "You're not connected yet. Ask the owner for your link. · ยังไม่ได้เชื่อมต่อ")
    return
  }

  // "My tasks" = tasks I'm an assignee of (multi-assignee join table).
  const myIds = await taskIdsForStaff(staff.id)
  let tasks: ChecklistTask[] = []
  if (myIds.length > 0) {
    const { data } = await db
      .from("staff_tasks")
      .select("id, title, due_time, priority, status")
      .in("id", myIds)
      .eq("due_date", todayICT())
      .eq("is_template", false)
      .not("status", "in", "(cancelled,draft)")
      .order("due_time", { ascending: true, nullsFirst: true })
    tasks = (data ?? []) as ChecklistTask[]
  }
  const done = tasks.filter((t) => t.status === "done").length
  const lines = [`📋 <b>My tasks today · งานของฉัน</b> — ${done}/${tasks.length} ✅`]
  tasks.forEach((t, i) => {
    const time = t.due_time ? `⏰${t.due_time.slice(0, 5)} ` : ""
    const flag = t.status === "done" ? "" : `${PRIORITY_FLAG[t.priority] ?? ""} `
    const title = t.status === "done" ? `<s>${escapeHtml(t.title)}</s>` : escapeHtml(t.title)
    lines.push(`${statusBox(t.status)} <b>${i + 1}.</b> ${flag}${time}${title}`)
  })
  if (tasks.length === 0) lines.push("\n🎉 No tasks today · วันนี้ไม่มีงาน")

  let keyboard: InlineKeyboard = [[{ text: "➕ New task · новая", callback_data: "f:new" }]]
  if (tasks.length > 0 && mode === "mark") {
    lines.push("\n<i>Tap a number to mark done — tap again to undo · กดเลขเพื่อสลับ</i>")
    const btns = tasks.map((t, i) => ({ text: `${statusBox(t.status)} ${i + 1}`, callback_data: `tgm:${t.id}` }))
    keyboard = [...chunk(btns, 5), [{ text: "✔ Done · เสร็จ", callback_data: "t:mine" }]]
  } else if (tasks.length > 0 && mode === "open") {
    lines.push("\n<i>Tap a number to open the task · กดเลขเพื่อเปิดงาน</i>")
    const btns = tasks.map((t, i) => ({ text: `${i + 1}`, callback_data: `op:${t.id}` }))
    keyboard = [...chunk(btns, 5), [{ text: "🔙 Back · กลับ", callback_data: "t:mine" }]]
  } else if (tasks.length > 0) {
    keyboard = [
      [
        { text: "✅ Mark done · ทำ", callback_data: "mkm" },
        { text: "📂 Open · เปิด", callback_data: "t:open" },
      ],
      [{ text: "➕ New task · новая", callback_data: "f:new" }],
    ]
  }

  if (editMessageId != null) await editMessageText(chatId, editMessageId, lines.join("\n"), keyboard)
  else await sendMessage(chatId, lines.join("\n"), keyboard)
}

/** Decode a back-token ("m" = my tasks, "t.<fKey>.<page>" = team list). */
function decodeBack(token: string): string {
  if (token?.startsWith("t.")) {
    const [, fKey, page] = token.split(".")
    return `t:team:${fKey || "all"}:${page || "0"}`
  }
  return "t:mine"
}

/** Drill-in: full task card with description, comment, photo count + actions. */
async function renderTaskDetail(chatId: string, taskId: string, messageId: number, back = "m") {
  const { data } = await db
    .from("staff_tasks")
    .select("id, title, title_th, description, comment, photo_urls, station, status, due_time, priority, assigned_to")
    .eq("id", taskId)
    .maybeSingle()
  if (!data) {
    await editMessageText(chatId, messageId, "⚠️ Task not found · ไม่พบงาน")
    return
  }
  const t = data as {
    title: string
    title_th: string | null
    description: string | null
    comment: string | null
    photo_urls: string[] | null
    station: string
    status: string
    due_time: string | null
    priority: string
    assigned_to: string | null
  }
  const names = await assigneesFor(taskId)
  const assignee = names.length ? names.map((a) => a.name).join(", ") : "—"
  const photos = t.photo_urls ?? []
  const flag = t.status === "done" ? "" : `${PRIORITY_FLAG[t.priority] ?? ""} `
  const time = t.due_time ? ` · ⏰${t.due_time.slice(0, 5)}` : ""
  const lines = [
    `${statusBox(t.status)} <b>${escapeHtml(t.title)}</b>${time}`,
    t.title_th && t.title_th !== t.title ? escapeHtml(t.title_th) : "",
    `🏷 ${STATION_SHORT[t.station] ?? t.station} · 👤 ${escapeHtml(assignee)} · ${flag}${t.status}`,
  ].filter(Boolean)
  if (t.description) lines.push(`\n📄 ${escapeHtml(t.description)}`)
  if (t.comment) lines.push(`\n💬 <i>${escapeHtml(t.comment)}</i>`)
  lines.push(`\n📷 Photos: ${photos.length}`)

  const kb: InlineKeyboard = [
    [
      { text: t.status === "done" ? "↩ Undo · เลิก" : "✅ Done · เสร็จ", callback_data: `td:done:${taskId}:${back}` },
      { text: "💬 Comment · ความเห็น", callback_data: `td:cm:${taskId}:${back}` },
    ],
    [
      { text: "📷 Photo · รูป", callback_data: `td:ph:${taskId}:${back}` },
      ...(photos.length ? [{ text: `🖼 View (${photos.length})`, callback_data: `td:pics:${taskId}:${back}` }] : []),
    ],
    [{ text: "🔙 Back · กลับ", callback_data: decodeBack(back) }],
  ]
  await editMessageText(chatId, messageId, lines.join("\n"), kb)
}

// ── Team tasks (colleagues' tasks for today) ────────────────────────────────
const PAGE_SIZE = 8
const STATION_LABEL: Record<string, string> = {
  L1: "🔪 L1 · Prep kitchen",
  L2: "🍽 L2 · Assembly",
  general: "📍 General · ทั่วไป",
}

interface TeamFilter {
  station?: string
  staffIdx?: number
}
type EmbeddedStaff = { name?: string } | { name?: string }[] | null
interface TeamTaskRow {
  id: string
  title: string
  due_time: string | null
  priority: string
  status: string
  station: string
  assigned_to: string | null
  staff: EmbeddedStaff
  staff_task_assignees?: Array<{ staff: EmbeddedStaff }> | null
}

/** Active staff in a stable order — the roster index used in callback_data. */
async function activeStaffRoster(): Promise<Array<{ id: string; name: string }>> {
  const { data } = await db
    .from("staff")
    .select("id, name")
    .eq("is_active", true)
    .order("name", { ascending: true })
  return (data ?? []) as Array<{ id: string; name: string }>
}

/** Parse a `t:team[:filter[:page]]` callback into a filter + page. */
function parseTeam(data: string): { filter: TeamFilter; page: number; fKey: string } {
  const parts = data.split(":") // [t, team, f?, page?]
  const fRaw = parts[2] ?? "all"
  const page = parts[3] != null ? Math.max(0, parseInt(parts[3], 10) || 0) : 0
  const filter: TeamFilter = {}
  let fKey = "all"
  if (fRaw === "L1" || fRaw === "L2") {
    filter.station = fRaw
    fKey = fRaw
  } else if (fRaw === "gen") {
    filter.station = "general"
    fKey = "gen"
  } else if (fRaw.startsWith("p")) {
    const idx = parseInt(fRaw.slice(1), 10)
    if (!isNaN(idx)) {
      filter.staffIdx = idx
      fKey = fRaw
    }
  }
  return { filter, page, fKey }
}

/** Station/person filter row — kept at the TOP of the team keyboard. */
function teamFilterRow(fKey: string): InlineButton[] {
  const tab = (val: string, label: string, cb: string): InlineButton => ({
    text: fKey === val ? `• ${label}` : label,
    callback_data: cb,
  })
  return [
    tab("all", "All", "t:team"),
    tab("L1", "L1", "t:team:L1"),
    tab("L2", "L2", "t:team:L2"),
    tab("gen", "Gen", "t:team:gen"),
    { text: "👤", callback_data: "t:roster" },
  ]
}
/** Prev/Next paging row, or null when there's a single page. */
function teamPagingRow(fKey: string, page: number, totalPages: number): InlineButton[] | null {
  if (totalPages <= 1) return null
  const prev = page > 0 ? `t:team:${fKey}:${page - 1}` : "t:noop"
  const next = page < totalPages - 1 ? `t:team:${fKey}:${page + 1}` : "t:noop"
  return [
    { text: page > 0 ? "◀ Prev" : "·", callback_data: prev },
    { text: `${page + 1}/${totalPages}`, callback_data: "t:noop" },
    { text: page < totalPages - 1 ? "Next ▶" : "·", callback_data: next },
  ]
}

function assigneeName(t: TeamTaskRow): string {
  const names = (t.staff_task_assignees ?? [])
    .map((a) => (Array.isArray(a.staff) ? a.staff[0]?.name : a.staff?.name) ?? "")
    .filter(Boolean)
  if (names.length) return names.length > 2 ? `${names[0]} +${names.length - 1}` : names.join(", ")
  const s = Array.isArray(t.staff) ? t.staff[0] : t.staff
  return s?.name ?? "—"
}

async function handleTeam(
  chatId: string,
  filter: TeamFilter,
  page: number,
  fKey = "all",
  editMessageId?: number,
  mode: ListMode = "browse",
) {
  const staff = await staffForChat(chatId)
  if (!staff) {
    await sendMessage(chatId, "You're not connected yet. Ask the owner for your link. · ยังไม่ได้เชื่อมต่อ")
    return
  }

  // Resolve the optional person filter via the stable roster ordering.
  let assigneeId: string | null = null
  if (filter.staffIdx != null) {
    const roster = await activeStaffRoster()
    assigneeId = roster[filter.staffIdx]?.id ?? null
  }

  // Filters first (keep `q` a filter builder), then order on the final chain.
  let q = db
    .from("staff_tasks")
    .select("id, title, due_time, priority, status, station, assigned_to, staff:staff(name), staff_task_assignees(staff:staff(name))")
    .eq("due_date", todayICT())
    .eq("is_template", false)
    .not("status", "in", "(cancelled,draft)")
  if (filter.station) q = q.eq("station", filter.station)
  if (assigneeId) {
    const ids = await taskIdsForStaff(assigneeId)
    q = q.in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"])
  }

  const { data } = await q
    .order("station", { ascending: true })
    .order("due_time", { ascending: true, nullsFirst: true })
  const all = (data ?? []) as TeamTaskRow[]

  const total = all.length
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const p = Math.min(page, totalPages - 1)
  const slice = all.slice(p * PAGE_SIZE, p * PAGE_SIZE + PAGE_SIZE)

  const lines: string[] = [`👥 <b>Team tasks · งานทีม</b> (${total})`]
  if (total === 0) {
    lines.push("\n🎉 No tasks today · วันนี้ไม่มีงาน")
  } else {
    let lastStation: string | null = null
    slice.forEach((t, i) => {
      if (t.station !== lastStation) {
        lines.push(`\n<b>${STATION_LABEL[t.station] ?? escapeHtml(t.station)}</b>`)
        lastStation = t.station
      }
      const flag = t.status === "done" ? "" : `${PRIORITY_FLAG[t.priority] ?? ""} `
      const time = t.due_time ? `⏰${t.due_time.slice(0, 5)} ` : ""
      const nm = assigneeName(t)
      const who = nm && nm !== "—" ? ` — ${escapeHtml(nm)}` : ""
      const title = t.status === "done" ? `<s>${escapeHtml(t.title)}</s>` : escapeHtml(t.title)
      lines.push(`${statusBox(t.status)} <b>${i + 1}.</b> ${flag}${time}${title}${who}`)
    })
  }

  // Filters on TOP; then mark/open per-task buttons or the browse action row.
  const kb: InlineKeyboard = [teamFilterRow(fKey)]
  if (total > 0 && mode === "mark") {
    lines.push("\n<i>Tap a number to mark done — tap again to undo · กดเลขเพื่อสลับ</i>")
    const btns = slice.map((t, i) => ({ text: `${statusBox(t.status)} ${i + 1}`, callback_data: `tgt:${t.id}:${fKey}:${p}` }))
    kb.push(...chunk(btns, 5), [{ text: "✔ Done · เสร็จ", callback_data: `t:team:${fKey}:${p}` }])
  } else if (total > 0 && mode === "open") {
    lines.push("\n<i>Tap a number to open the task · กดเลขเพื่อเปิดงาน</i>")
    const btns = slice.map((t, i) => ({ text: `${i + 1}`, callback_data: `opt:${t.id}:${fKey}:${p}` }))
    kb.push(...chunk(btns, 5), [{ text: "🔙 Back · กลับ", callback_data: `t:team:${fKey}:${p}` }])
  } else if (total > 0) {
    kb.push([
      { text: "✅ Mark · ทำ", callback_data: `mkt:${fKey}:${p}` },
      { text: "📂 Open · เปิด", callback_data: `opt0:${fKey}:${p}` },
      { text: "➕ New · новая", callback_data: "f:new" },
    ])
  } else {
    kb.push([{ text: "➕ New task · новая", callback_data: "f:new" }])
  }
  const pagingRow = teamPagingRow(fKey, p, totalPages)
  if (pagingRow) kb.push(pagingRow)

  if (editMessageId != null) {
    await editMessageText(chatId, editMessageId, lines.join("\n"), kb)
  } else {
    await sendMessage(chatId, lines.join("\n"), kb)
  }
}

/** Map a team filter key (all/L1/L2/gen/p<idx>) back to a TeamFilter. */
function teamFilterFromKey(fKey: string): TeamFilter {
  if (fKey === "L1" || fKey === "L2") return { station: fKey }
  if (fKey === "gen") return { station: "general" }
  if (fKey.startsWith("p")) {
    const idx = parseInt(fKey.slice(1), 10)
    if (!isNaN(idx)) return { staffIdx: idx }
  }
  return {}
}

/** Edit the team message into a "filter by person" picker. */
async function handleRoster(chatId: string, messageId: number) {
  const roster = await activeStaffRoster()
  const rows: InlineKeyboard = roster.map((s, i) => [
    { text: s.name, callback_data: `t:team:p${i}` },
  ])
  rows.push([{ text: "⬅ Back · กลับ", callback_data: "t:team" }])
  await editMessageText(chatId, messageId, "👤 <b>Filter by person · เลือกคน</b>", rows)
}

/** Send a deep-link button into the deployed admin board (role-aware target). */
async function handleBoard(chatId: string) {
  const staff = await staffForChat(chatId)
  const url = boardUrl(staff?.appRole ?? null)
  await sendMessage(
    chatId,
    "🗂 Open the full task board · เปิดบอร์ดงานเต็ม\n<i>Sign in with your name + PIN.</i>",
    [[{ text: "🗂 Open board · เปิดบอร์ด", url }]],
  )
}

// ── AI task-draft approval (Phase C) ────────────────────────────────────────
async function chatForStaff(staffId: string): Promise<string | null> {
  const { data } = await db
    .from("staff_telegram")
    .select("telegram_chat_id")
    .eq("staff_id", staffId)
    .maybeSingle()
  return data ? (data.telegram_chat_id as string) : null
}

async function staffNameById(staffId: string): Promise<string> {
  const { data } = await db.from("staff").select("name").eq("id", staffId).maybeSingle()
  return (data?.name as string) ?? "—"
}

/** All assignees of a task (multi-assignee join table), earliest first. */
async function assigneesFor(taskId: string): Promise<Array<{ id: string; name: string }>> {
  const { data } = await db
    .from("staff_task_assignees")
    .select("staff_id, staff:staff(name)")
    .eq("task_id", taskId)
    .order("created_at", { ascending: true })
  return ((data ?? []) as Array<{ staff_id: string; staff: { name?: string } | { name?: string }[] | null }>).map((r) => {
    const s = Array.isArray(r.staff) ? r.staff[0] : r.staff
    return { id: r.staff_id, name: s?.name ?? "—" }
  })
}

/** Task ids the given staff member is assigned to. */
async function taskIdsForStaff(staffId: string): Promise<string[]> {
  const { data } = await db.from("staff_task_assignees").select("task_id").eq("staff_id", staffId)
  return ((data ?? []) as Array<{ task_id: string }>).map((r) => r.task_id)
}

/** Add/remove one assignee (trigger keeps staff_tasks.assigned_to = primary). */
async function setAssignee(taskId: string, staffId: string, on: boolean) {
  if (on) {
    await db.from("staff_task_assignees").upsert({ task_id: taskId, staff_id: staffId }, { onConflict: "task_id,staff_id" })
  } else {
    await db.from("staff_task_assignees").delete().eq("task_id", taskId).eq("staff_id", staffId)
  }
}

/** Finalise a draft (form Create): flip to todo and DM every assignee. */
async function finalizeTask(draftId: string, msgChatId: string, messageId: number, cbId: string) {
  const assignees = await assigneesFor(draftId)
  if (assignees.length === 0) {
    await answerCallbackQuery(cbId, "Pick an assignee first · เลือกผู้รับผิดชอบ")
    return
  }
  await db.from("staff_tasks").update({ status: "todo" }).eq("id", draftId)
  const { data: t } = await db
    .from("staff_tasks")
    .select("id, title, title_th, description, due_time, category, priority, status")
    .eq("id", draftId)
    .maybeSingle()
  const task = t as (FormattableTask & { id: string }) | null
  if (!task) {
    await answerCallbackQuery(cbId, "Task not found")
    return
  }
  let firstDm: number | null = null
  for (const a of assignees) {
    const chat = await chatForStaff(a.id)
    if (!chat) continue
    const res = await sendMessage(chat, `🆕 ${formatTask(task)}`, taskKeyboard(task.id))
    if (res.ok && res.messageId != null && firstDm === null) firstDm = res.messageId
  }
  if (firstDm != null) {
    await db.from("staff_tasks").update({ dm_message_id: String(firstDm), reminder_sent_at: null }).eq("id", draftId)
  }
  await editMessageText(
    msgChatId,
    messageId,
    `${formatTask(task)}\n✅ Assigned to ${assignees.map((a) => escapeHtml(a.name)).join(", ")}`,
  )
  await answerCallbackQuery(cbId, "✅ Created")
}

/** Flip a draft to a real assigned task and DM the assignee. */
async function approveAndAssign(
  draftId: string,
  assigneeId: string,
  ownerChatId: string,
  ownerMsgId: number,
  cbId: string,
) {
  await db.from("staff_tasks").update({ status: "todo", assigned_to: assigneeId }).eq("id", draftId)
  const { data: t } = await db
    .from("staff_tasks")
    .select("id, title, title_th, description, due_time, category, priority, status")
    .eq("id", draftId)
    .maybeSingle()
  const task = t as (FormattableTask & { id: string }) | null
  if (!task) {
    await answerCallbackQuery(cbId, "Task not found")
    return
  }

  const assigneeName = await staffNameById(assigneeId)
  const chat = await chatForStaff(assigneeId)
  if (chat) {
    const res = await sendMessage(chat, `🆕 ${formatTask(task)}`, taskKeyboard(task.id))
    if (res.ok && res.messageId != null) {
      await db.from("staff_tasks")
        .update({ dm_message_id: String(res.messageId), reminder_sent_at: null })
        .eq("id", draftId)
    }
  }
  await editMessageText(
    ownerChatId,
    ownerMsgId,
    `${formatTask(task)}\n✅ Assigned to ${escapeHtml(assigneeName)}${chat ? "" : " ⚠️ (not on Telegram)"}`,
  )
  await answerCallbackQuery(cbId, "✅ Assigned")
}

/** Owner/task_manager taps on an AI draft card: appr / asg:<idx> / disc. */
async function handleDraftCallback(
  cbId: string,
  data: string,
  staff: StaffCtx,
  msgChatId: string,
  messageId: number,
) {
  if (staff.appRole !== "owner" && staff.appRole !== "task_manager") {
    await answerCallbackQuery(cbId, "Only a manager can approve tasks")
    return
  }
  const [action, draftId, idxStr] = data.split(":")
  if (!draftId) {
    await answerCallbackQuery(cbId, "Unknown action")
    return
  }

  const { data: draftRow } = await db
    .from("staff_tasks")
    .select("id, status, assigned_to")
    .eq("id", draftId)
    .maybeSingle()
  if (!draftRow) {
    await answerCallbackQuery(cbId, "Draft not found")
    return
  }
  const draft = draftRow as { id: string; status: string; assigned_to: string | null }
  if (draft.status !== "draft") {
    await answerCallbackQuery(cbId, "Already handled")
    return
  }

  if (action === "disc") {
    await db.from("staff_tasks").update({ status: "cancelled" }).eq("id", draftId)
    await editMessageText(msgChatId, messageId, "❌ <i>Draft discarded</i> · ทิ้งแล้ว")
    await answerCallbackQuery(cbId, "Discarded")
    return
  }

  if (action === "asg") {
    const idx = Number.parseInt(idxStr ?? "", 10)
    const roster = await activeStaffRoster()
    const chosen = Number.isNaN(idx) ? undefined : roster[idx]
    if (!chosen) {
      await answerCallbackQuery(cbId, "Invalid choice")
      return
    }
    await approveAndAssign(draftId, chosen.id, msgChatId, messageId, cbId)
    return
  }

  if (action === "appr") {
    if (draft.assigned_to) {
      await approveAndAssign(draftId, draft.assigned_to, msgChatId, messageId, cbId)
    } else {
      const roster = await activeStaffRoster()
      const rows: InlineKeyboard = roster.map((s, i) => [
        { text: s.name, callback_data: `asg:${draftId}:${i}` },
      ])
      rows.push([{ text: "❌ Discard · ทิ้ง", callback_data: `disc:${draftId}` }])
      await editMessageText(msgChatId, messageId, "👤 <b>Assign to · มอบหมายให้:</b>", rows)
      await answerCallbackQuery(cbId)
    }
    return
  }

  await answerCallbackQuery(cbId, "Unknown action")
}

// ── Photos + owner relay (Phase D) ──────────────────────────────────────────
/** Linked owner/task_manager chat ids. */
async function ownerChats(): Promise<string[]> {
  const { data } = await db
    .from("staff_telegram")
    .select("telegram_chat_id, staff:staff!inner(app_role, is_active)")
    .eq("staff.is_active", true)
    .in("staff.app_role", ["owner", "task_manager"])
  return ((data ?? []) as Array<{ telegram_chat_id: string }>).map((r) => r.telegram_chat_id)
}

/** Download a Telegram photo and store it in the public task-photos bucket. */
async function storePhoto(fileId: string, taskId: string): Promise<string | null> {
  const path = await getFilePath(fileId)
  if (!path) return null
  const bytes = await downloadFile(path)
  if (!bytes) return null
  const ext = (path.split(".").pop() || "jpg").toLowerCase()
  const contentType = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg"
  const key = `${taskId}/${Date.now()}.${ext}`
  const { error } = await db.storage.from("task-photos").upload(key, bytes, { contentType, upsert: false })
  if (error) {
    console.error("[telegram-webhook] photo upload failed:", error)
    return null
  }
  return db.storage.from("task-photos").getPublicUrl(key).data.publicUrl
}

/** Inbound photo: attach to a task (if it replies to a task DM) else relay to owners. */
/** Append a photo to a task's photo_urls; returns true on success. */
async function attachPhotoToTask(fileId: string, taskId: string): Promise<{ ok: boolean; title?: string }> {
  const { data } = await db.from("staff_tasks").select("id, title, photo_urls").eq("id", taskId).maybeSingle()
  const task = data as { id: string; title: string; photo_urls: string[] | null } | null
  if (!task) return { ok: false }
  const url = await storePhoto(fileId, task.id)
  if (!url) return { ok: false, title: task.title }
  await db.from("staff_tasks").update({ photo_urls: [...(task.photo_urls ?? []), url] }).eq("id", task.id)
  return { ok: true, title: task.title }
}

async function handlePhoto(
  chatId: string,
  fileId: string,
  caption: string,
  replyToMsgId: number | null,
  replyToText = "",
) {
  const staff = await staffForChat(chatId)
  if (!staff) {
    await sendMenu(chatId, "Connect first 👇 · เชื่อมต่อก่อน")
    return
  }

  // Explicit "📷 Photo report" for a chosen task (force_reply carries (task:<id>)).
  if (replyToText.startsWith(PHOTO_PROMPT)) {
    const m = replyToText.match(/\(task:([0-9a-f-]{36})\)/)
    if (m) {
      const r = await attachPhotoToTask(fileId, m[1])
      await sendMessage(
        chatId,
        r.ok ? `📷 Added to “${escapeHtml(r.title ?? "")}” · เพิ่มรูปแล้ว` : "⚠️ Couldn't save the photo. · บันทึกรูปไม่สำเร็จ",
      )
      return
    }
  }

  if (replyToMsgId != null) {
    const { data: taskRow } = await db
      .from("staff_tasks")
      .select("id, title, photo_urls")
      .eq("dm_message_id", String(replyToMsgId))
      .maybeSingle()
    const task = taskRow as { id: string; title: string; photo_urls: string[] | null } | null
    if (task) {
      const url = await storePhoto(fileId, task.id)
      if (url) {
        await db.from("staff_tasks")
          .update({ photo_urls: [...(task.photo_urls ?? []), url] })
          .eq("id", task.id)
        await sendMessage(chatId, `📷 Added to “${escapeHtml(task.title)}” · เพิ่มรูปแล้ว`)
        return
      }
      await sendMessage(chatId, "⚠️ Couldn't save the photo. · บันทึกรูปไม่สำเร็จ")
      return
    }
  }

  // Not tied to a task → relay to owners (re-share by file_id, no download).
  const owners = await ownerChats()
  const cap = `📷 <b>${escapeHtml(staff.name)}</b>${caption ? `: ${escapeHtml(caption)}` : ""}`
  let sent = 0
  for (const c of owners) {
    if (c === chatId) continue
    const r = await sendPhoto(c, fileId, cap)
    if (r.ok) sent++
  }
  await sendMessage(
    chatId,
    sent > 0 ? "📷 Sent to the team · ส่งให้ทีมแล้ว" : "📷 Saved, but no manager is connected. · ยังไม่มีผู้จัดการเชื่อมต่อ",
  )
}

// Staff self-service: /add <task> (todo) and /done <text> (logged as done).
async function createSelfTask(chatId: string, rawText: string, markDone: boolean) {
  const staff = await staffForChat(chatId)
  if (!staff) {
    await sendMessage(chatId, "You're not connected yet. Ask the owner for your link. · ยังไม่ได้เชื่อมต่อ")
    return
  }
  const title = rawText.trim()
  if (!title) {
    await sendMessage(
      chatId,
      markDone
        ? "Usage: <code>/done what you did</code> · เช่น /done ล้างตู้เย็น"
        : "Usage: <code>/add task</code> · เช่น /add เติมกระดาษทิชชู่",
    )
    return
  }

  const row: Record<string, unknown> = {
    title,
    assigned_to: staff.id,
    created_by: staff.name,
    category: "general",
    priority: "medium",
    due_date: todayICT(),
    status: markDone ? "done" : "todo",
  }
  if (markDone) {
    row.completed_at = new Date().toISOString()
    row.completed_via = "telegram"
  }

  const { data, error } = await db
    .from("staff_tasks")
    .insert(row)
    .select("id, title, title_th, description, due_time, category, priority")
    .single()

  if (error || !data) {
    console.error("[telegram-webhook] createSelfTask insert error:", error)
    await sendMessage(chatId, "⚠️ Could not save. Try again. · บันทึกไม่สำเร็จ")
    return
  }

  if (markDone) {
    await sendMessage(chatId, `✅ Logged: <b>${escapeHtml(title)}</b> · บันทึกแล้ว`)
  } else {
    const task = data as FormattableTask & { id: string }
    await sendMessage(chatId, `➕ Added · เพิ่มแล้ว\n${formatTask(task)}`, taskKeyboard(task.id))
  }
}

function tomorrowICT(): string {
  return new Date(Date.now() + 31 * 3600 * 1000).toISOString().slice(0, 10)
}
const STATION_SHORT: Record<string, string> = { L1: "🔪 L1", L2: "🍽 L2", general: "📍 General" }

/**
 * Native task-creation form (NO AI). Tapping "Add" opens this card immediately;
 * each field is a button. The card edits itself in place as fields are set; the
 * card's message_id is parked in dm_message_id so the title reply can edit it.
 */
async function newTaskForm(chatId: string) {
  const staff = await staffForChat(chatId)
  if (!staff) {
    await sendMessage(chatId, "You're not connected yet. Ask the owner for your link. · ยังไม่ได้เชื่อมต่อ")
    return
  }
  const { data, error } = await db
    .from("staff_tasks")
    .insert({
      title: "",
      title_th: "",
      created_by: staff.name,
      assigned_to: staff.id, // default to creator; changeable in the form
      category: "general",
      priority: "medium",
      due_date: todayICT(),
      station: "general",
      status: "draft",
      is_template: false,
    })
    .select("id")
    .single()
  if (error || !data) {
    console.error("[telegram-webhook] newTaskForm insert error:", error)
    await sendMessage(chatId, "⚠️ Could not start. Try again. · ลองใหม่")
    return
  }
  const draftId = data.id as string
  await setAssignee(draftId, staff.id, true) // creator is the default assignee
  await renderTaskForm(chatId, draftId)
}

/** Render / re-render the task-creation form card. */
async function renderTaskForm(chatId: string, draftId: string, messageId?: number) {
  const { data } = await db
    .from("staff_tasks")
    .select("id, title, station, due_date, assigned_to")
    .eq("id", draftId)
    .maybeSingle()
  if (!data) {
    if (messageId != null) await editMessageText(chatId, messageId, "⚠️ Form expired. Tap ➕ Add again. · ลองใหม่")
    return
  }
  const t = data as { title: string | null; station: string; due_date: string | null; assigned_to: string | null }
  const names = await assigneesFor(draftId)
  const assignee = names.length ? names.map((n) => n.name).join(", ") : "—"
  const dateLabel = t.due_date === todayICT() ? "Today" : t.due_date === tomorrowICT() ? "Tomorrow" : (t.due_date ?? "—")
  const lines = [
    "➕ <b>New task · новая задача</b>",
    `📝 ${t.title && t.title.trim() ? escapeHtml(t.title) : "<i>— tap 📝 to set —</i>"}`,
    `${STATION_SHORT[t.station] ?? t.station}   👤 ${escapeHtml(assignee)}   📅 ${dateLabel}`,
  ]
  const kb: InlineKeyboard = [
    [{ text: "📝 Title · название", callback_data: `f:ti:${draftId}` }],
    [
      { text: "🏷 Station", callback_data: `f:st:${draftId}` },
      { text: "👤 Assignee", callback_data: `f:as:${draftId}` },
      { text: "📅 Date", callback_data: `f:dt:${draftId}` },
    ],
    [
      { text: "✅ Create · создать", callback_data: `f:create:${draftId}` },
      { text: "❌ Cancel", callback_data: `f:cancel:${draftId}` },
    ],
  ]
  if (messageId != null) {
    await editMessageText(chatId, messageId, lines.join("\n"), kb)
  } else {
    const res = await sendMessage(chatId, lines.join("\n"), kb)
    if (res.messageId != null) await db.from("staff_tasks").update({ dm_message_id: String(res.messageId) }).eq("id", draftId)
  }
}

/** Multi-select assignee picker for the task form (tap to toggle ✅/☐). */
async function assigneePicker(chatId: string, draftId: string, messageId: number) {
  const roster = await activeStaffRoster()
  const current = new Set((await assigneesFor(draftId)).map((a) => a.id))
  const rows: InlineKeyboard = roster.map((s, i) => [{
    text: `${current.has(s.id) ? "✅" : "☐"} ${s.name}`,
    callback_data: `f:ast:${draftId}:${i}`,
  }])
  rows.push([{ text: "✔ Done · เสร็จ", callback_data: `f:back:${draftId}` }])
  await editMessageText(chatId, messageId, "👤 <b>Assignees · ผู้รับผิดชอบ</b>\n<i>Tap to add / remove · กดเพื่อเลือก</i>", rows)
}

/** Handle a tap on a task-form field button (f:<action>:<draftId>[:arg]). */
async function handleFormCallback(cbId: string, data: string, staff: StaffCtx, msgChatId: string, messageId: number) {
  const parts = data.split(":") // [f, action, draftId, arg?]
  const action = parts[1]
  if (action === "new") {
    await answerCallbackQuery(cbId)
    await newTaskForm(msgChatId)
    return
  }
  const draftId = parts[2]
  if (!draftId) {
    await answerCallbackQuery(cbId, "Unknown action")
    return
  }

  if (action === "ti") {
    await answerCallbackQuery(cbId)
    await sendForceReply(msgChatId, `${FORM_TITLE_PROMPT}\n(task:${draftId})`)
    return
  }
  if (action === "st") {
    await answerCallbackQuery(cbId)
    await editMessageText(msgChatId, messageId, "🏷 <b>Station · สถานี</b>", [
      [
        { text: "🔪 L1", callback_data: `f:sts:${draftId}:L1` },
        { text: "🍽 L2", callback_data: `f:sts:${draftId}:L2` },
        { text: "📍 General", callback_data: `f:sts:${draftId}:general` },
      ],
      [{ text: "🔙 Back", callback_data: `f:back:${draftId}` }],
    ])
    return
  }
  if (action === "sts") {
    const st = parts[3] === "L1" || parts[3] === "L2" ? parts[3] : "general"
    await db.from("staff_tasks").update({ station: st }).eq("id", draftId)
    await answerCallbackQuery(cbId)
    await renderTaskForm(msgChatId, draftId, messageId)
    return
  }
  if (action === "as") {
    await answerCallbackQuery(cbId)
    await assigneePicker(msgChatId, draftId, messageId)
    return
  }
  if (action === "ast") {
    const roster = await activeStaffRoster()
    const sid = roster[Number.parseInt(parts[3] ?? "", 10)]?.id
    if (sid) {
      const current = new Set((await assigneesFor(draftId)).map((a) => a.id))
      await setAssignee(draftId, sid, !current.has(sid))
    }
    await answerCallbackQuery(cbId)
    await assigneePicker(msgChatId, draftId, messageId)
    return
  }
  if (action === "dt") {
    await answerCallbackQuery(cbId)
    const rows: InlineKeyboard = []
    let week: InlineButton[] = []
    const base = Date.now() + 7 * 3600 * 1000 // ICT wall clock
    const dow = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]
    for (let i = 0; i < 14; i++) {
      const d = new Date(base + i * 24 * 3600 * 1000)
      const iso = d.toISOString().slice(0, 10)
      const label = i === 0 ? "Today" : i === 1 ? "Tmrw" : `${dow[d.getUTCDay()]} ${d.getUTCDate()}/${d.getUTCMonth() + 1}`
      week.push({ text: label, callback_data: `f:dts:${draftId}:${iso}` })
      if (week.length === 3) {
        rows.push(week)
        week = []
      }
    }
    if (week.length) rows.push(week)
    rows.push([{ text: "🔙 Back", callback_data: `f:back:${draftId}` }])
    await editMessageText(msgChatId, messageId, "📅 <b>Date · วันที่</b>", rows)
    return
  }
  if (action === "dts") {
    const arg = parts[3] ?? ""
    const due = /^\d{4}-\d{2}-\d{2}$/.test(arg) ? arg : todayICT()
    await db.from("staff_tasks").update({ due_date: due }).eq("id", draftId)
    await answerCallbackQuery(cbId)
    await renderTaskForm(msgChatId, draftId, messageId)
    return
  }
  if (action === "back") {
    await answerCallbackQuery(cbId)
    await renderTaskForm(msgChatId, draftId, messageId)
    return
  }
  if (action === "create") {
    const { data } = await db.from("staff_tasks").select("title").eq("id", draftId).maybeSingle()
    const title = (data?.title as string | undefined)?.trim()
    if (!title) {
      await answerCallbackQuery(cbId, "Set a title first · ตั้งชื่อก่อน")
      return
    }
    await finalizeTask(draftId, msgChatId, messageId, cbId)
    return
  }
  if (action === "cancel") {
    await db.from("staff_tasks").update({ status: "cancelled" }).eq("id", draftId)
    await editMessageText(msgChatId, messageId, "❌ <i>Cancelled · ยกเลิก</i>")
    await answerCallbackQuery(cbId, "Cancelled")
    return
  }
  await answerCallbackQuery(cbId, "Unknown action")
}

async function handleCallback(cq: Record<string, unknown>) {
  const id = String(cq.id)
  const data = typeof cq.data === "string" ? cq.data : ""
  const from = cq.from as { id?: number } | undefined
  const message = cq.message as { message_id?: number; chat?: { id?: number } } | undefined
  const presserChatId = from?.id != null ? String(from.id) : null
  const msgChatId = message?.chat?.id != null ? String(message.chat.id) : null
  const messageId = message?.message_id

  if (!presserChatId || !msgChatId || messageId == null) {
    await answerCallbackQuery(id, "Unknown action")
    return
  }

  const staff = await staffForChat(presserChatId)
  if (!staff) {
    await answerCallbackQuery(id, "You're not connected. Ask the owner for your link.")
    return
  }

  // ── Navigation callbacks (lists / filters / paging — no task involved) ──
  if (data === "t:noop") {
    await answerCallbackQuery(id)
    return
  }
  if (data === "t:mine") {
    await answerCallbackQuery(id)
    await handleToday(msgChatId, messageId, "browse")
    return
  }
  if (data === "t:open") {
    await answerCallbackQuery(id)
    await handleToday(msgChatId, messageId, "open")
    return
  }
  if (data.startsWith("opt:")) {
    // team drill-in: opt:<taskId>:<fKey>:<page>
    const parts = data.split(":")
    await answerCallbackQuery(id)
    await renderTaskDetail(msgChatId, parts[1], messageId, `t.${parts[2] ?? "all"}.${parts[3] ?? "0"}`)
    return
  }
  if (data.startsWith("op:")) {
    await answerCallbackQuery(id)
    await renderTaskDetail(msgChatId, data.slice(3), messageId, "m")
    return
  }
  if (data.startsWith("td:")) {
    const parts = data.split(":") // [td, action, taskId, back]
    const tdAction = parts[1]
    const tid = parts[2]
    const back = parts[3] ?? "m"
    if (!tid) {
      await answerCallbackQuery(id, "Unknown action")
      return
    }
    if (tdAction === "done") {
      await toggleDone(tid)
      await answerCallbackQuery(id)
      await renderTaskDetail(msgChatId, tid, messageId, back)
    } else if (tdAction === "cm") {
      await answerCallbackQuery(id)
      await sendForceReply(msgChatId, `${COMMENT_PROMPT}\n(task:${tid})`)
    } else if (tdAction === "ph") {
      await answerCallbackQuery(id)
      await sendForceReply(msgChatId, `${PHOTO_PROMPT}\n(task:${tid})`)
    } else if (tdAction === "pics") {
      await answerCallbackQuery(id)
      const { data: d } = await db.from("staff_tasks").select("photo_urls").eq("id", tid).maybeSingle()
      const urls = ((d?.photo_urls as string[] | null) ?? []).slice(0, 10)
      if (urls.length === 0) await sendMessage(msgChatId, "No photos yet · ยังไม่มีรูป")
      for (const u of urls) await sendPhoto(msgChatId, u)
    } else {
      await answerCallbackQuery(id, "Unknown action")
    }
    return
  }
  if (data === "t:roster") {
    await answerCallbackQuery(id)
    await handleRoster(msgChatId, messageId)
    return
  }
  if (data.startsWith("t:team")) {
    await answerCallbackQuery(id)
    const { filter, page, fKey } = parseTeam(data)
    await handleTeam(msgChatId, filter, page, fKey, messageId)
    return
  }

  // ── AI task-draft approval (owner/task_manager only) ──
  if (data.startsWith("appr:") || data.startsWith("disc:") || data.startsWith("asg:")) {
    await handleDraftCallback(id, data, staff, msgChatId, messageId)
    return
  }

  // ── Owner replies to a relayed staff message ──
  if (data.startsWith("rly:")) {
    if (staff.appRole !== "owner" && staff.appRole !== "task_manager") {
      await answerCallbackQuery(id, "Only a manager can reply here")
      return
    }
    const target = data.slice("rly:".length)
    await sendForceReply(msgChatId, `${REPLY_PROMPT}\n(to:${target})`)
    await answerCallbackQuery(id)
    return
  }

  // ── Checklist mark mode: enter mark mode / toggle a task / (exit via t:*) ──
  if (data === "mkm") {
    await answerCallbackQuery(id)
    await handleToday(msgChatId, messageId, "mark")
    return
  }
  if (data.startsWith("tgm:")) {
    await toggleDone(data.slice(4))
    await answerCallbackQuery(id)
    await handleToday(msgChatId, messageId, "mark")
    return
  }
  if (data.startsWith("mkt:") || data.startsWith("opt0:")) {
    const parts = data.split(":") // [mkt|opt0, fKey, page]
    const fKey = parts[1] ?? "all"
    const page = parts[2] != null ? Math.max(0, parseInt(parts[2], 10) || 0) : 0
    await answerCallbackQuery(id)
    await handleTeam(msgChatId, teamFilterFromKey(fKey), page, fKey, messageId, data.startsWith("opt0:") ? "open" : "mark")
    return
  }
  if (data.startsWith("tgt:")) {
    const parts = data.split(":") // [tgt, id, fKey, page]
    if (parts[1]) await toggleDone(parts[1])
    await answerCallbackQuery(id)
    const fKey = parts[2] ?? "all"
    const page = parts[3] != null ? Math.max(0, parseInt(parts[3], 10) || 0) : 0
    await handleTeam(msgChatId, teamFilterFromKey(fKey), page, fKey, messageId, "mark")
    return
  }

  // ── Stocktake: pick station / save / cancel ──
  if (data.startsWith("rev:")) {
    const parts = data.split(":") // [rev, action, arg?]
    const action = parts[1]
    if (action === "L1" || action === "L2") {
      await answerCallbackQuery(id)
      await sendForceReply(
        msgChatId,
        `${REV_PROMPT}\nStation: ${action}\nе.g. 5kg carrots, 3L milk, 2 hummus · เช่น แครอท 5kg, นม 3L`,
      )
      return
    }
    if (action === "save" && parts[2]) {
      await confirmStocktake(parts[2], msgChatId, messageId, id)
      return
    }
    if (action === "cancel" && parts[2]) {
      await db.from("stocktake_entries").update({ status: "cancelled" }).eq("session_id", parts[2]).eq("status", "pending")
      await editMessageText(msgChatId, messageId, "❌ <i>Stocktake discarded</i> · ยกเลิก")
      await answerCallbackQuery(id, "Cancelled")
      return
    }
    await answerCallbackQuery(id, "Unknown action")
    return
  }

  // ── Task-creation form (no AI): field buttons ──
  if (data.startsWith("f:")) {
    await handleFormCallback(id, data, staff, msgChatId, messageId)
    return
  }

  // ── Task action callbacks (start / done / snooze) ──
  const [action, taskId] = data.split(":")
  if (!taskId) {
    await answerCallbackQuery(id, "Unknown action")
    return
  }

  const { data: taskRow } = await db
    .from("staff_tasks")
    .select("id, title, title_th, description, due_time, category, priority, status")
    .eq("id", taskId)
    .maybeSingle()

  if (!taskRow) {
    await answerCallbackQuery(id, "Task not found")
    return
  }
  const task = taskRow as FormattableTask & { id: string; status: string }

  if (action === "start") {
    await db.from("staff_tasks").update({ status: "in_progress" }).eq("id", taskId)
    await editMessageText(
      msgChatId,
      messageId,
      `${formatTask(task)}\n🔄 In progress · ${escapeHtml(staff.name)}`,
      taskKeyboard(taskId),
    )
    await answerCallbackQuery(id, "🔄 Started")
    return
  }

  if (action === "done") {
    await db
      .from("staff_tasks")
      .update({ status: "done", completed_at: new Date().toISOString(), completed_via: "telegram" })
      .eq("id", taskId)
    await editMessageText(msgChatId, messageId, `${formatTask(task)}\n✅ Done by ${staff.name}`)
    await answerCallbackQuery(id, "✅ Marked done")
    return
  }

  if (action === "snooze") {
    // Push the due time forward 30 minutes; keep the task actionable.
    let newTime: string | null = task.due_time
    if (task.due_time) {
      const [h, m] = task.due_time.split(":").map(Number)
      const total = (h * 60 + m + 30) % (24 * 60)
      newTime = `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}:00`
      await db.from("staff_tasks").update({ due_time: newTime, reminder_sent_at: null }).eq("id", taskId)
    }
    await editMessageText(
      msgChatId,
      messageId,
      `${formatTask({ ...task, due_time: newTime })}\n⏰ Snoozed +30 min`,
      taskKeyboard(taskId),
    )
    await answerCallbackQuery(id, "⏰ Snoozed 30 min")
    return
  }

  await answerCallbackQuery(id, "Unknown action")
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 })
  if (req.method !== "POST") return ok({ ok: false, error: "method_not_allowed" })

  // Auth: Telegram echoes our secret token in this header.
  const provided = req.headers.get("x-telegram-bot-api-secret-token") ?? ""
  if (!WEBHOOK_SECRET || provided !== WEBHOOK_SECRET) {
    const raw = await req.text().catch(() => "")
    await deadLetter("invalid_secret_token", { raw: raw.slice(0, 2000) })
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), { status: 401 })
  }

  let update: Record<string, unknown>
  try {
    update = await req.json()
  } catch (e) {
    await deadLetter("parse_error", { error: (e as Error).message })
    return ok()
  }

  try {
    if (update.callback_query) {
      await handleCallback(update.callback_query as Record<string, unknown>)
      return ok()
    }

    const message = update.message as
      | {
          text?: string
          caption?: string
          photo?: Array<{ file_id: string }>
          chat?: { id?: number }
          from?: { username?: string }
          reply_to_message?: { text?: string; message_id?: number }
        }
      | undefined
    const text = message?.text?.trim() ?? ""
    const chatId = message?.chat?.id != null ? String(message.chat.id) : null
    const username = message?.from?.username ?? null
    const replyTo = message?.reply_to_message?.text ?? ""
    const replyToMsgId = message?.reply_to_message?.message_id ?? null
    const photos = message?.photo
    const caption = message?.caption?.trim() ?? ""

    if (!chatId) return ok()

    // Inbound photo → attach to a task (reply to its DM) or relay to owners.
    if (photos?.length) {
      await handlePhoto(chatId, photos[photos.length - 1].file_id, caption, replyToMsgId, replyTo)
      return ok()
    }

    // Stocktake counts (reply to the station prompt) → AI parse into entries.
    if (replyTo.startsWith(REV_PROMPT)) {
      const st = replyTo.match(/Station: (L1|L2)/)
      const staff = await staffForChat(chatId)
      if (!staff) {
        await sendMenu(chatId, "Connect first 👇 · เชื่อมต่อก่อน")
      } else if (text) {
        await sendMessage(chatId, "💭 Reading the count… · กำลังอ่าน…")
        triggerAI(chatId, text, staff, { mode: "stocktake", station: st ? st[1] : "general" })
      }
    } // Task-form title reply → set the title and re-render the form card.
    else if (replyTo.startsWith(FORM_TITLE_PROMPT)) {
      const m = replyTo.match(/\(task:([0-9a-f-]{36})\)/)
      if (m && text) {
        await db.from("staff_tasks").update({ title: text.trim(), title_th: text.trim() }).eq("id", m[1])
        const { data: d } = await db.from("staff_tasks").select("dm_message_id").eq("id", m[1]).maybeSingle()
        const cardId = d?.dm_message_id ? Number(d.dm_message_id) : undefined
        await renderTaskForm(chatId, m[1], cardId)
      }
    } // Task comment reply → append "Name: text" to the task's comment field.
    else if (replyTo.startsWith(COMMENT_PROMPT)) {
      const m = replyTo.match(/\(task:([0-9a-f-]{36})\)/)
      if (m && text) {
        const staff = await staffForChat(chatId)
        const { data: d } = await db.from("staff_tasks").select("comment").eq("id", m[1]).maybeSingle()
        const prev = (d?.comment as string | null) ?? ""
        const entry = `${staff?.name ?? "?"}: ${text.trim()}`
        await db.from("staff_tasks").update({ comment: prev ? `${prev}\n${entry}` : entry }).eq("id", m[1])
        await sendMessage(chatId, "💬 Comment added · เพิ่มความเห็นแล้ว")
      }
    } // Owner's reply to a relayed staff message → deliver it back to the asker.
    else if (replyTo.startsWith(REPLY_PROMPT)) {
      const m = replyTo.match(/\(to:(-?\d+)\)/)
      if (m && text) {
        await sendMessage(m[1], `💬 From the team · จากทีม:\n${escapeHtml(text)}`)
        await sendMessage(chatId, "✅ Sent · ส่งแล้ว")
      } else {
        await sendMenu(chatId, "Tap a button below 👇 · กดปุ่มด้านล่าง")
      }
    } // Free-text reply to the Add / Done button prompts (no slash typing needed)
    else if (replyTo.startsWith("✍️ Type the task")) {
      await newTaskForm(chatId)
    } else if (replyTo.startsWith("✍️ What did you")) {
      await createSelfTask(chatId, text, true)
    } else if (text.startsWith("/start")) {
      const code = text.split(/\s+/)[1] ?? null
      await handleStart(chatId, username, code)
    } else if (text === MENU_TODAY || text.startsWith("/today")) {
      await handleToday(chatId)
    } else if (text === MENU_TEAM || text.startsWith("/team")) {
      await handleTeam(chatId, {}, 0)
    } else if (text === MENU_BOARD || text.startsWith("/board")) {
      await handleBoard(chatId)
    } else if (text === MENU_STOCKTAKE || text.startsWith("/stocktake") || text.startsWith("/revision")) {
      await handleStocktakeStart(chatId)
    } else if (text === MENU_ADD) {
      await newTaskForm(chatId)
    } else if (text === MENU_DONE) {
      // Old "Log done" button (cached keyboards) → show the tappable checklist
      // instead of the free-text prompt that used to create phantom tasks.
      await handleToday(chatId)
    } else if (text.startsWith("/add")) {
      await newTaskForm(chatId)
    } else if (text.startsWith("/done")) {
      await createSelfTask(chatId, text.slice("/done".length), true)
    } else if (text.startsWith("/")) {
      await sendMenu(chatId, "Tap a button below 👇 · กดปุ่มด้านล่าง")
    } else if (text) {
      // Free text → AI assistant (menu Q&A etc). Ack fast, process async so
      // Telegram doesn't time out; telegram-ai sends the real reply.
      const staff = await staffForChat(chatId)
      if (!staff) {
        await sendMenu(chatId, "Connect first to ask me things 👇 · เชื่อมต่อก่อนเพื่อถามได้")
      } else {
        await sendMessage(chatId, "💭 Looking it up… · กำลังค้นหา…")
        triggerAI(chatId, text, staff)
      }
    } else {
      await sendMenu(chatId, "Tap a button below 👇 · กดปุ่มด้านล่าง")
    }
    return ok()
  } catch (e) {
    console.error("[telegram-webhook] handler error:", e)
    await deadLetter("handler_error", { error: (e as Error).message, update })
    return ok()
  }
})
