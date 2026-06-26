// ═══════════════════════════════════════════════════════════
// Edge Function: telegram-push
// Outbound pushes for the staff task tracker (Phase 2).
//
// Actions (query param ?action=):
//   assign     &task_id=  → DM the assignee one task with Done/Snooze buttons
//   morning               → DM every linked staff their tasks for today (ICT)
//   schedule              → post today's shift schedule to the group chat
//   reminders             → DM due/overdue, not-done tasks once (reminder_sent_at)
//
// Auth: deployed WITH verify_jwt (default). Callable by the authenticated admin
// (supabase.functions.invoke attaches the user token) and by pg_cron via pg_net
// using the service-role key as Bearer — both pass JWT verification.
//
// Deploy: `supabase functions deploy telegram-push`
// Env: TELEGRAM_BOT_TOKEN, TELEGRAM_GROUP_CHAT_ID (optional)
// ═══════════════════════════════════════════════════════════

import { db } from "../_shared/supabase.ts"
import { json } from "../_shared/cors.ts"
import {
  formatTask,
  getChatMenuButton,
  getWebhookInfo,
  hasToken,
  sendMessage,
  setChatMenuButton,
  setMyCommands,
  setWebhook,
  taskKeyboard,
  type FormattableTask,
} from "../_shared/telegram.ts"

const GROUP_CHAT_ID = Deno.env.get("TELEGRAM_GROUP_CHAT_ID") ?? ""
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? ""
const WEBHOOK_SECRET = Deno.env.get("TELEGRAM_WEBHOOK_SECRET") ?? ""

const TASK_COLS = "id, title, title_th, description, due_time, due_date, category, priority, status, assigned_to"
type Task = FormattableTask & { id: string; due_date: string | null; status: string; assigned_to: string | null }

/** Today's date in Asia/Bangkok (UTC+7), YYYY-MM-DD. */
function todayICT(): string {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10)
}
/** Minutes since midnight, Asia/Bangkok. */
function nowMinICT(): number {
  const d = new Date(Date.now() + 7 * 3600 * 1000)
  return d.getUTCHours() * 60 + d.getUTCMinutes()
}
function timeToMin(t: string | null): number | null {
  if (!t) return null
  const [h, m] = t.split(":").map(Number)
  return h * 60 + m
}

async function chatForStaff(staffId: string): Promise<string | null> {
  const { data } = await db
    .from("staff_telegram")
    .select("telegram_chat_id")
    .eq("staff_id", staffId)
    .maybeSingle()
  return data ? (data.telegram_chat_id as string) : null
}

async function actionAssign(taskId: string) {
  const { data: taskRow, error } = await db.from("staff_tasks").select(TASK_COLS).eq("id", taskId).maybeSingle()
  if (error || !taskRow) return json({ ok: false, error: "task_not_found" }, 404)
  const task = taskRow as Task
  if (!task.assigned_to) return json({ ok: false, error: "task_unassigned" }, 400)

  const chatId = await chatForStaff(task.assigned_to)
  if (!chatId) return json({ ok: false, error: "assignee_not_linked" }, 200)

  const res = await sendMessage(chatId, `🆕 ${formatTask(task)}`, taskKeyboard(task.id))
  if (res.ok && res.messageId != null) {
    await db.from("staff_tasks")
      .update({ dm_message_id: String(res.messageId), reminder_sent_at: null })
      .eq("id", task.id)
  }
  return json({ ok: res.ok, message_id: res.messageId ?? null })
}

async function actionMorning() {
  const { data: links } = await db.from("staff_telegram").select("staff_id, telegram_chat_id")
  const today = todayICT()
  let sent = 0
  const perStaff: Array<{ staff_id: string; tasks: number }> = []

  for (const link of (links ?? []) as Array<{ staff_id: string; telegram_chat_id: string }>) {
    const { data } = await db
      .from("staff_tasks")
      .select(TASK_COLS)
      .eq("assigned_to", link.staff_id)
      .eq("due_date", today)
      .eq("is_template", false)
      .in("status", ["todo", "in_progress"])
      .order("due_time", { ascending: true, nullsFirst: true })

    const tasks = (data ?? []) as Task[]
    perStaff.push({ staff_id: link.staff_id, tasks: tasks.length })
    if (tasks.length === 0) continue

    await sendMessage(link.telegram_chat_id, `☀️ <b>Good morning! Tasks for today · งานวันนี้</b> (${tasks.length})`)
    for (const t of tasks) {
      const res = await sendMessage(link.telegram_chat_id, formatTask(t), taskKeyboard(t.id))
      if (res.ok && res.messageId != null) {
        await db.from("staff_tasks").update({ dm_message_id: String(res.messageId) }).eq("id", t.id)
      }
      sent++
    }
  }
  return json({ ok: true, sent, perStaff })
}

async function actionSchedule() {
  if (!GROUP_CHAT_ID) return json({ ok: false, error: "no_group_chat_configured" }, 200)
  const today = todayICT()
  const { data } = await db
    .from("shifts")
    .select("start_time, end_time, staff:staff(name)")
    .eq("shift_date", today)
    .order("start_time", { ascending: true })

  type ShiftRow = { start_time: string; end_time: string; staff: { name?: string } | { name?: string }[] | null }
  const shifts = (data ?? []) as ShiftRow[]
  const staffName = (s: ShiftRow) => (Array.isArray(s.staff) ? s.staff[0]?.name : s.staff?.name) ?? "—"
  const lines = shifts.length === 0
    ? ["No shifts scheduled today. · วันนี้ไม่มีกะ"]
    : shifts.map((s) => `• ${staffName(s)} · ${s.start_time.slice(0, 5)}–${s.end_time.slice(0, 5)}`)

  const res = await sendMessage(GROUP_CHAT_ID, `📅 <b>Schedule today · ตารางงานวันนี้</b> (${today})\n${lines.join("\n")}`)
  return json({ ok: res.ok, shifts: shifts.length })
}

async function actionReminders() {
  const today = todayICT()
  const now = nowMinICT()
  const { data } = await db
    .from("staff_tasks")
    .select(TASK_COLS + ", reminder_offset_min")
    .eq("due_date", today)
    .eq("is_template", false)
    .in("status", ["todo", "in_progress"])
    .is("reminder_sent_at", null)
    .not("due_time", "is", null)
    .not("assigned_to", "is", null)

  const tasks = (data ?? []) as unknown as Array<Task & { reminder_offset_min: number }>
  let sent = 0
  for (const t of tasks) {
    const dueMin = timeToMin(t.due_time)
    if (dueMin == null) continue
    if (now < dueMin - (t.reminder_offset_min ?? 30)) continue // not yet within window

    const chatId = await chatForStaff(t.assigned_to as string)
    if (!chatId) continue

    const overdue = now > dueMin
    const head = overdue ? "🔴 Overdue · เกินกำหนด" : "⏰ Reminder · เตือน"
    const res = await sendMessage(chatId, `${head}\n${formatTask(t)}`, taskKeyboard(t.id))
    if (res.ok) {
      await db.from("staff_tasks").update({ reminder_sent_at: new Date().toISOString() }).eq("id", t.id)
      sent++
    }
  }
  return json({ ok: true, sent, scanned: tasks.length })
}

// One-shot maintenance: clear the stale web_app/ngrok menu button (both the
// global default AND every linked chat's per-chat override) and re-register the
// webhook with our secret. Idempotent — safe to call repeatedly.
async function actionSetup() {
  const before = await getChatMenuButton()
  const menu = await setChatMenuButton() // reset global default → native commands

  // The "Kitchen" ngrok button was set per-chat, which overrides the default,
  // so clear it for every linked chat too.
  const { data: chats } = await db.from("staff_telegram").select("telegram_chat_id")
  const chatIds = ((chats ?? []) as Array<{ telegram_chat_id: string }>).map((c) => c.telegram_chat_id)
  let cleared = 0
  for (const cid of chatIds) {
    const r = await setChatMenuButton(cid)
    if (r.ok) cleared++
  }
  const sampleChatAfter = chatIds.length > 0 ? (await getChatMenuButton(chatIds[0])).result ?? null : null

  await setMyCommands()
  let webhook: { ok: boolean } | null = null
  if (SUPABASE_URL && WEBHOOK_SECRET) {
    webhook = await setWebhook(`${SUPABASE_URL}/functions/v1/telegram-webhook`, WEBHOOK_SECRET)
  }
  const after = await getChatMenuButton()
  const info = await getWebhookInfo()
  return json({
    ok: true,
    menu_button_before: before.result ?? null,
    menu_button_default_after: after.result ?? null,
    menu_button_chat_after: sampleChatAfter,
    per_chat_cleared: cleared,
    set_menu_ok: menu.ok,
    set_webhook: webhook,
    webhook_info: info.result ?? null,
  })
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 })
  if (!hasToken()) return json({ ok: false, error: "TELEGRAM_BOT_TOKEN not set" }, 500)

  const url = new URL(req.url)
  const action = url.searchParams.get("action") ?? ""

  try {
    switch (action) {
      case "assign": {
        const taskId = url.searchParams.get("task_id")
        if (!taskId) return json({ ok: false, error: "task_id required" }, 400)
        return await actionAssign(taskId)
      }
      case "morning":
        return await actionMorning()
      case "schedule":
        return await actionSchedule()
      case "reminders":
        return await actionReminders()
      case "setup":
        return await actionSetup()
      default:
        return json({ ok: false, error: "unknown_action", actions: ["assign", "morning", "schedule", "reminders", "setup"] }, 400)
    }
  } catch (e) {
    console.error("[telegram-push] error:", e)
    return json({ ok: false, error: (e as Error).message }, 500)
  }
})
