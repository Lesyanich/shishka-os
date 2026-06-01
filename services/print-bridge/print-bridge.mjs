// ═══════════════════════════════════════════════════════════
// Shishka print-bridge — LAN ESC/POS receipt printer gateway
//
// Why this exists:
//   The cashier UI is a web app. Browsers cannot open a raw TCP socket, and the
//   Xprinter XP-Q90EC (LAN) speaks plain ESC/POS over TCP:9100 — no HTTP/cloud
//   print API. So this tiny service bridges HTTP → ESC/POS. Loyverse and this
//   bridge can share the same network printer (it accepts sequential jobs).
//
// Zero dependencies — runs on plain Node (>=18):  node print-bridge.mjs
//
// Config (env):
//   PRINTER_IP    required, e.g. 192.168.1.50   (the XP-Q90EC LAN address)
//   PRINTER_PORT  default 9100
//   PORT          bridge HTTP port, default 7777
//   CHARS         chars per line, default 32 (58mm paper). Use 48 for 80mm.
//   CUT           "false" to disable auto-cut (default ON — XP-Q90EC has a cutter)
//
// Endpoints:
//   GET  /health        → { ok, printer, port, chars }
//   POST /test          → prints a test slip
//   POST /print         → body = order JSON (see buildReceipt), prints it
//
// Production note: a cloud HTTPS page (shishka.health) cannot call this over
// plain HTTP on a LAN IP (mixed content). Run the bridge on the cashier device
// and call it via http://localhost:7777 (localhost is a secure context), or
// wrap the cashier UI as a small native app. For dev/validation, run it on the
// Mac on the same LAN and hit it from a local (http://localhost) dev server.
// ═══════════════════════════════════════════════════════════

import http from 'node:http'
import net from 'node:net'

const PRINTER_IP = process.env.PRINTER_IP ?? ''
const PRINTER_PORT = Number(process.env.PRINTER_PORT ?? 9100)
const PORT = Number(process.env.PORT ?? 7777)
const CHARS = Number(process.env.CHARS ?? 32)
const DO_CUT = process.env.CUT !== 'false' // default ON (XP-Q90EC has an auto-cutter)

// ── ESC/POS byte helpers ─────────────────────────────────────
const ESC = 0x1b
const GS = 0x1d
const B = (...n) => Buffer.from(n)
const INIT = B(ESC, 0x40)
const CENTER = B(ESC, 0x61, 1)
const LEFT = B(ESC, 0x61, 0)
const BOLD_ON = B(ESC, 0x45, 1)
const BOLD_OFF = B(ESC, 0x45, 0)
const DOUBLE = B(GS, 0x21, 0x11) // double width + height
const NORMAL = B(GS, 0x21, 0x00)
const feed = (n) => B(ESC, 0x64, n) // ESC d n — print & feed n lines
const CUT = B(GS, 0x56, 0x00) // GS V 0 — full cut
const text = (s) => Buffer.from(String(s) + '\n', 'latin1')
const raw = (s) => Buffer.from(String(s), 'latin1')

const divider = () => text('-'.repeat(CHARS))

// Left text + right text padded to CHARS (truncates left side if needed).
function row(left, right) {
  const r = String(right)
  const maxLeft = Math.max(0, CHARS - r.length - 1)
  let l = String(left)
  if (l.length > maxLeft) l = l.slice(0, maxLeft)
  const pad = CHARS - l.length - r.length
  return text(l + ' '.repeat(Math.max(1, pad)) + r)
}

function money(n) {
  const v = Number(n)
  return Number.isInteger(v) ? String(v) : v.toFixed(2)
}

// ── Receipt layout (58mm) ────────────────────────────────────
// order = { orderCode, items:[{name, quantity, price}], total,
//           customerName?, notes?, fulfillmentType, tableNumber?, createdAt?,
//           kind?: 'customer' | 'assembly', paid?: boolean }
function buildReceipt(order) {
  const kind = order.kind === 'assembly' ? 'assembly' : 'customer'
  const parts = [INIT]
  parts.push(CENTER, BOLD_ON, DOUBLE, text('SHISHKA'), NORMAL)
  parts.push(text(kind === 'assembly' ? 'KITCHEN · ASSEMBLY' : 'Healthy Kitchen'), BOLD_OFF, LEFT)
  parts.push(divider())

  // Order code — big and central, it's the whole point.
  parts.push(CENTER, text(kind === 'assembly' ? 'ASSEMBLE' : 'ORDER'), BOLD_ON, DOUBLE, text(order.orderCode ?? '—'), NORMAL, BOLD_OFF, LEFT)

  const ful = order.fulfillmentType === 'dine_in'
    ? `Dine-in${order.tableNumber ? ' · table ' + order.tableNumber : ''}`
    : 'Pickup'
  parts.push(row(ful, order.createdAt ? new Date(order.createdAt).toLocaleString('en-GB') : ''))
  if (order.customerName) parts.push(text(order.customerName))
  parts.push(divider())

  for (const it of order.items ?? []) {
    parts.push(row(`${it.quantity}x ${it.name}`, money(Number(it.price) * Number(it.quantity))))
  }
  parts.push(divider())
  parts.push(BOLD_ON, row('TOTAL', `THB ${money(order.total)}`), BOLD_OFF)
  parts.push(divider())

  if (order.notes) parts.push(text(`Note: ${order.notes}`), text(''))
  if (kind === 'assembly') {
    parts.push(CENTER, BOLD_ON, text(order.paid ? '*** PAID ***' : '*** UNPAID ***'), BOLD_OFF, LEFT)
  } else {
    parts.push(
      CENTER,
      text(order.paid ? 'PAID — Thank you!' : 'Pay at the cashier'),
      text(`Code: ${order.orderCode ?? ''}`),
      LEFT,
    )
  }

  parts.push(feed(4))
  if (DO_CUT) parts.push(CUT)
  return Buffer.concat(parts)
}

function buildTestSlip() {
  return Buffer.concat([
    INIT, CENTER, BOLD_ON, DOUBLE, text('SHISHKA'), NORMAL, BOLD_OFF,
    text('print-bridge test'), LEFT, divider(),
    text(`Printer : ${PRINTER_IP}:${PRINTER_PORT}`),
    text(`Width   : ${CHARS} cols`),
    text(`Time    : ${new Date().toLocaleString('en-GB')}`),
    divider(), row('Sample item x2', '240'), row('TOTAL', 'THB 240'),
    feed(4), ...(DO_CUT ? [CUT] : []),
  ])
}

// ── Send bytes to the printer over TCP ───────────────────────
function sendToPrinter(buf) {
  return new Promise((resolve, reject) => {
    if (!PRINTER_IP) return reject(new Error('PRINTER_IP not set'))
    const sock = new net.Socket()
    sock.setTimeout(5000)
    sock.connect(PRINTER_PORT, PRINTER_IP, () => sock.write(buf, () => sock.end()))
    sock.on('close', () => resolve())
    sock.on('timeout', () => { sock.destroy(); reject(new Error('printer timeout')) })
    sock.on('error', reject)
  })
}

// ── HTTP server ──────────────────────────────────────────────
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}
const send = (res, code, obj) =>
  res.writeHead(code, { ...CORS, 'Content-Type': 'application/json' }).end(JSON.stringify(obj))

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (c) => { data += c; if (data.length > 1e6) req.destroy() })
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}) } catch (e) { reject(e) } })
  })
}

http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return res.writeHead(204, CORS).end()

  if (req.method === 'GET' && req.url === '/health')
    return send(res, 200, { ok: true, printer: `${PRINTER_IP}:${PRINTER_PORT}`, port: PORT, chars: CHARS, cut: DO_CUT })

  if (req.method === 'POST' && req.url === '/test') {
    try { await sendToPrinter(buildTestSlip()); return send(res, 200, { ok: true }) }
    catch (e) { return send(res, 502, { ok: false, error: String(e.message ?? e) }) }
  }

  if (req.method === 'POST' && req.url === '/print') {
    let order
    try { order = await readJson(req) } catch { return send(res, 400, { ok: false, error: 'invalid_json' }) }
    if (!order || !Array.isArray(order.items)) return send(res, 400, { ok: false, error: 'missing_items' })
    try { await sendToPrinter(buildReceipt(order)); return send(res, 200, { ok: true, printed: order.orderCode ?? null }) }
    catch (e) { return send(res, 502, { ok: false, error: String(e.message ?? e) }) }
  }

  return send(res, 404, { ok: false, error: 'not_found' })
}).listen(PORT, () => {
  console.log(`[print-bridge] http://localhost:${PORT}  →  printer ${PRINTER_IP || '(PRINTER_IP unset)'}:${PRINTER_PORT}  (${CHARS} cols${DO_CUT ? ', cut' : ''})`)
})
