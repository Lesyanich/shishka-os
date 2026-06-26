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
  ADD_PROMPT,
  answerCallbackQuery,
  boardUrl,
  DONE_PROMPT,
  editMessageText,
  escapeHtml,
  formatTask,
  formatTaskLine,
  MENU_ADD,
  MENU_BOARD,
  MENU_DONE,
  MENU_TEAM,
  MENU_TODAY,
  sendForceReply,
  sendMenu,
  sendMessage,
  setMyCommands,
  taskKeyboard,
  type FormattableTask,
  type InlineKeyboard,
} from "../_shared/telegram.ts"

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
function triggerAI(chatId: string, text: string, staff: StaffCtx) {
  if (!SUPABASE_URL || !WEBHOOK_SECRET) return
  const p = fetch(`${SUPABASE_URL}/functions/v1/telegram-ai`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-telegram-bot-api-secret-token": WEBHOOK_SECRET,
    },
    body: JSON.stringify({ chat_id: chatId, text: text.slice(0, 1000), lang: staff.lang, staff_name: staff.name }),
  }).catch((e) => console.error("[telegram-webhook] triggerAI failed:", e))
  fireAndForget(p)
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

async function handleToday(chatId: string) {
  const staff = await staffForChat(chatId)
  if (!staff) {
    await sendMessage(chatId, "You're not connected yet. Ask the owner for your link. · ยังไม่ได้เชื่อมต่อ")
    return
  }

  const { data } = await db
    .from("staff_tasks")
    .select("id, title, title_th, description, due_time, category, priority, status")
    .eq("assigned_to", staff.id)
    .eq("due_date", todayICT())
    .eq("is_template", false)
    .not("status", "in", "(cancelled,draft)")
    .order("due_time", { ascending: true, nullsFirst: true })

  const tasks = (data ?? []) as Array<FormattableTask & { id: string; status: string }>
  if (tasks.length === 0) {
    await sendMessage(chatId, "🎉 No tasks for today. · วันนี้ไม่มีงาน")
    return
  }

  await sendMessage(chatId, `📋 <b>Today · วันนี้</b> (${tasks.length})`)
  for (const t of tasks) {
    const done = t.status === "done"
    const body = formatTask(t) + (done ? "\n✅ Done" : "")
    await sendMessage(chatId, body, done ? undefined : taskKeyboard(t.id))
  }
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
interface TeamTaskRow {
  id: string
  title: string
  due_time: string | null
  priority: string
  status: string
  station: string
  assigned_to: string | null
  staff: { name?: string } | { name?: string }[] | null
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

function teamKeyboard(fKey: string, page: number, totalPages: number): InlineKeyboard {
  const tab = (val: string, label: string, cb: string): { text: string; callback_data: string } => ({
    text: fKey === val ? `• ${label}` : label,
    callback_data: cb,
  })
  const rows: InlineKeyboard = [[
    tab("all", "All", "t:team"),
    tab("L1", "L1", "t:team:L1"),
    tab("L2", "L2", "t:team:L2"),
    tab("gen", "Gen", "t:team:gen"),
    { text: "👤", callback_data: "t:roster" },
  ]]
  if (totalPages > 1) {
    const prev = page > 0 ? `t:team:${fKey}:${page - 1}` : "t:noop"
    const next = page < totalPages - 1 ? `t:team:${fKey}:${page + 1}` : "t:noop"
    rows.push([
      { text: page > 0 ? "◀ Prev" : "·", callback_data: prev },
      { text: `${page + 1}/${totalPages}`, callback_data: "t:noop" },
      { text: page < totalPages - 1 ? "Next ▶" : "·", callback_data: next },
    ])
  }
  return rows
}

function assigneeName(t: TeamTaskRow): string {
  const raw = t.staff
  const s = Array.isArray(raw) ? raw[0] : raw
  return s?.name ?? "—"
}

async function handleTeam(
  chatId: string,
  filter: TeamFilter,
  page: number,
  fKey = "all",
  editMessageId?: number,
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
    .select("id, title, due_time, priority, status, station, assigned_to, staff:staff(name)")
    .eq("due_date", todayICT())
    .eq("is_template", false)
    .not("status", "in", "(cancelled,draft)")
  if (filter.station) q = q.eq("station", filter.station)
  if (assigneeId) q = q.eq("assigned_to", assigneeId)

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
    for (const t of slice) {
      if (t.station !== lastStation) {
        lines.push(`\n<b>${STATION_LABEL[t.station] ?? escapeHtml(t.station)}</b>`)
        lastStation = t.station
      }
      lines.push(formatTaskLine(t, assigneeName(t)))
    }
  }

  const text = lines.join("\n")
  const kb = teamKeyboard(fKey, p, totalPages)
  if (editMessageId != null) {
    await editMessageText(chatId, editMessageId, text, kb)
  } else {
    await sendMessage(chatId, text, kb)
  }
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
    await handleToday(msgChatId)
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
          chat?: { id?: number }
          from?: { username?: string }
          reply_to_message?: { text?: string }
        }
      | undefined
    const text = message?.text?.trim() ?? ""
    const chatId = message?.chat?.id != null ? String(message.chat.id) : null
    const username = message?.from?.username ?? null
    const replyTo = message?.reply_to_message?.text ?? ""

    if (!chatId) return ok()

    // Free-text reply to the Add / Done button prompts (no slash typing needed)
    if (replyTo.startsWith("✍️ Type the task")) {
      await createSelfTask(chatId, text, false)
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
    } else if (text === MENU_ADD) {
      await sendForceReply(chatId, ADD_PROMPT)
    } else if (text === MENU_DONE) {
      await sendForceReply(chatId, DONE_PROMPT)
    } else if (text.startsWith("/add")) {
      await createSelfTask(chatId, text.slice("/add".length), false)
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
