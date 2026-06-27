// Prep / storage label rendering + printing for the Xprinter XP-420B (60×40mm thermal).
//
// The kitchen tablet (Android) runs RawBT, which is paired to the printer over
// Bluetooth. A browser can't talk to a Bluetooth printer directly, so we render
// the label to a monochrome PNG and hand it to RawBT via its `rawbt:` URL scheme.
// RawBT rasterizes the image and prints it. No backend, no driver, no server.
//
// Printer facts (see memory/project_xprinter_xp420b.md):
//   - 203 dpi  →  8 dots per mm
//   - label stock 60 × 40 mm  →  480 × 320 px
//   - run the printer's gap calibration once (power off → hold FEED → power on →
//     release after it feeds 1–2 labels) so prints align to each label.

import QRCode from 'qrcode'

const DPI = 203
const DOTS_PER_MM = DPI / 25.4 // ≈ 8

/** A selectable thermal label stock size. */
export interface LabelSize {
  id: string
  label: string
  wMm: number
  hMm: number
}

/** Common thermal label sizes for the XP-420B. First entry is the default. */
export const LABEL_SIZES: LabelSize[] = [
  { id: '60x40', label: '60 × 40 мм', wMm: 60, hMm: 40 },
  { id: '58x40', label: '58 × 40 мм', wMm: 58, hMm: 40 },
  { id: '50x30', label: '50 × 30 мм', wMm: 50, hMm: 30 },
  { id: '50x25', label: '50 × 25 мм', wMm: 50, hMm: 25 },
  { id: '40x30', label: '40 × 30 мм', wMm: 40, hMm: 30 },
]

export const DEFAULT_LABEL_SIZE: LabelSize = LABEL_SIZES[0]

// Layout was tuned for the 60×40 stock (480×320 px); other sizes scale from it.
const BASE_W_PX = Math.round(60 * DOTS_PER_MM) // 480
const BASE_H_PX = Math.round(40 * DOTS_PER_MM) // 320

/** Per-portion macros for a consumer (SALE) label. */
export interface LabelNutrition {
  kcal: number
  protein: number
  fat: number
  carbs: number
}

export interface PrepLabelData {
  name: string
  productCode: string
  prepDate: Date
  shelfLifeDays: number | null
  /** Optional batch weight/volume, preformatted e.g. "1.5 kg". Omitted if null. */
  weight?: string | null
  /** Optional QR payload (the batch barcode). When set, a QR is drawn. */
  qr?: string | null
  /** Optional human batch code shown at the bottom; falls back to productCode. */
  batchCode?: string | null
  /**
   * SALE consumer-label extras. When any is set, a consumer layout is used
   * (name + price + nutrition + ingredients + dates) instead of the storage one.
   */
  nutrition?: LabelNutrition | null
  /** Portion mass in grams — drives the per-100 g column of the КБЖУ table. */
  nutritionPortionG?: number | null
  ingredients?: string | null
  /** Preformatted price, e.g. "฿111". Shown top-right on the consumer label. */
  price?: string | null
}

/** Greedy word-wrap `text` into lines that fit `maxWidth` at the current font. */
function wrapToWidth(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (current && ctx.measureText(candidate).width > maxWidth) {
      lines.push(current)
      current = word
    } else {
      current = candidate
    }
  }
  if (current) lines.push(current)
  return lines
}

export function addDays(date: Date, days: number): Date {
  const r = new Date(date)
  r.setDate(r.getDate() + days)
  return r
}

function formatDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yy = String(d.getFullYear()).slice(-2)
  return `${dd}/${mm}/${yy}`
}

/**
 * Fit `text` into at most `maxLines` lines within `maxWidth`, shrinking the font
 * from `maxSize` down to `minSize` until it fits. Returns the chosen size + lines.
 */
function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
  maxSize: number,
  minSize: number,
  weight: string,
): { size: number; lines: string[] } {
  const words = text.split(/\s+/).filter(Boolean)
  for (let size = maxSize; size >= minSize; size -= 2) {
    ctx.font = `${weight} ${size}px sans-serif`
    // Greedy word-wrap at this font size.
    const lines: string[] = []
    let current = ''
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word
      if (current && ctx.measureText(candidate).width > maxWidth) {
        lines.push(current)
        current = word
      } else {
        current = candidate
      }
    }
    if (current) lines.push(current)
    const fitsLines = lines.length <= maxLines
    const fitsWidth = lines.every((l) => ctx.measureText(l).width <= maxWidth)
    if (fitsLines && (fitsWidth || size === minSize)) {
      return { size, lines: lines.slice(0, maxLines) }
    }
  }
  // Nothing fit cleanly: keep the greedy wrap at the smallest size (clamped to
  // maxLines) instead of dumping the whole string on one line — that was the
  // source of names getting visually cut off at the label edge.
  ctx.font = `${weight} ${minSize}px sans-serif`
  return { size: minSize, lines: wrapToWidth(ctx, text, maxWidth).slice(0, maxLines) }
}

/**
 * Draw the prep label at the given stock size and return a PNG data URL.
 *
 * `gapMm` adds white space below the content so the total image height equals
 * the label pitch (label + inter-label gap). When the printer feeds by image
 * height (no gap calibration), this stops each successive label from drifting.
 */
export function renderPrepLabel(
  data: PrepLabelData,
  size: LabelSize = DEFAULT_LABEL_SIZE,
  gapMm = 0,
): string {
  return renderPrepLabelCanvas(data, size, gapMm).toDataURL('image/png')
}

/**
 * The single label-layout engine: draws the label at exact printer dot
 * dimensions and returns the canvas. Everything else is a thin wrapper —
 * the on-screen preview, the Bluetooth PNG, and the USB TSPL bitmap all
 * render from this same canvas, so what the cook sees is what prints.
 */
export function renderPrepLabelCanvas(
  data: PrepLabelData,
  size: LabelSize = DEFAULT_LABEL_SIZE,
  gapMm = 0,
): HTMLCanvasElement {
  const wPx = Math.round(size.wMm * DOTS_PER_MM)
  const hPx = Math.round(size.hMm * DOTS_PER_MM) // label content area
  const gapPx = Math.round(gapMm * DOTS_PER_MM)
  // Scale the 60×40 layout to the chosen stock; min() keeps it within both axes.
  const s = Math.min(wPx / BASE_W_PX, hPx / BASE_H_PX)

  const canvas = document.createElement('canvas')
  canvas.width = wPx
  canvas.height = hPx + gapPx // feed one full pitch: label + gap
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context unavailable')

  const PAD = 18 * s
  // Fixed left margin (does NOT scale with the label) to clear the printer's
  // physical left dead-zone, which was clipping the left edge on real prints.
  const LPAD = Math.max(PAD, 44)

  // Thermal printing is black-on-white. Fill the whole canvas (incl. gap) white.
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, wPx, hPx + gapPx)
  ctx.fillStyle = '#000000'
  ctx.textBaseline = 'top'

  // SALE consumer label: name + price + nutrition + ingredients + dates.
  if (data.nutrition || data.ingredients || data.price) {
    drawSaleLabel(ctx, data, wPx, hPx, s)
    return canvas
  }

  // ── Item name (bold, up to 2 lines, auto-shrink) ──
  const { size: nameSize, lines } = fitText(
    ctx,
    data.name.toUpperCase(),
    wPx - PAD - LPAD,
    2,
    Math.round(44 * s),
    Math.round(19 * s),
    '800',
  )
  ctx.font = `800 ${nameSize}px sans-serif`
  let y = 16 * s
  for (const line of lines) {
    ctx.fillText(line, LPAD, y)
    y += nameSize + 4 * s
  }

  // ── Divider ──
  ctx.fillRect(LPAD, 130 * s, wPx - PAD - LPAD, Math.max(2, 3 * s))

  const VALX = LPAD + 124 * s // x where each row's value starts
  let row = 144 * s
  const F = (n: number) => Math.round(n * s) // scaled font size

  // ── Weight / volume (optional) ──
  if (data.weight) {
    ctx.font = `500 ${F(26)}px sans-serif`
    ctx.fillText('QTY', LPAD, row)
    ctx.font = `700 ${F(30)}px sans-serif`
    ctx.fillText(data.weight, VALX, row - 2 * s)
    row += 42 * s
  }

  // ── PREP date ──
  ctx.font = `500 ${F(26)}px sans-serif`
  ctx.fillText('PREP', LPAD, row)
  ctx.font = `700 ${F(30)}px sans-serif`
  ctx.fillText(formatDate(data.prepDate), VALX, row - 2 * s)
  row += 42 * s

  // ── USE BY date (emphasized) ──
  const useBy = data.shelfLifeDays != null ? addDays(data.prepDate, data.shelfLifeDays) : null
  ctx.font = `500 ${F(26)}px sans-serif`
  ctx.fillText('USE BY', LPAD, row)
  ctx.font = `800 ${F(32)}px sans-serif`
  ctx.fillText(useBy ? formatDate(useBy) : '—', VALX, row - 4 * s)

  // ── QR (optional, bottom-right) encoding the batch barcode ──
  if (data.qr) {
    const qrPx = Math.round(Math.min(118 * s, hPx - 130 * s, wPx * 0.32))
    drawQr(ctx, data.qr, wPx - qrPx - PAD, hPx - qrPx - PAD, qrPx)
  }

  // ── Batch code / product code (bottom-left, monospace) ──
  ctx.font = `400 ${F(22)}px monospace`
  ctx.fillText(data.batchCode ?? data.productCode, LPAD, hPx - 28 * s)

  return canvas
}

/**
 * Draw the SALE consumer label: bold name + price, a thin divider, the
 * ingredient list (wrapped), then a КБЖУ table (per 100 g / per portion), with
 * PREP / USE BY dates pinned to the bottom and the QR bottom-right. No
 * human-readable code line — the QR carries the batch barcode. Ingredient lines
 * clamp to the room above the table so everything stays on the chosen stock.
 */
function drawSaleLabel(
  ctx: CanvasRenderingContext2D,
  data: PrepLabelData,
  wPx: number,
  hPx: number,
  s: number,
): void {
  const PAD = 18 * s
  // The printer's left dead-zone is physical (~constant dots), so the left
  // margin must NOT scale with the label — a scaled 18·s was clipping the left
  // edge on real prints. Left-anchored content starts at LPAD; right-anchored
  // content (price, QR) stays at PAD.
  const LPAD = Math.max(PAD, 44)
  const F = (n: number) => Math.round(n * s)
  const maxW = wPx - PAD - LPAD

  // QR (batch barcode) sits on the right; text content keeps to the left of it.
  const qrPx = data.qr ? Math.round(Math.min(112 * s, wPx * 0.28, hPx * 0.48)) : 0
  const qrX = wPx - qrPx - PAD
  const contentRight = data.qr ? qrX - 16 * s : wPx - PAD
  const contentW = contentRight - LPAD

  // Footer rows pinned to the bottom. The QR carries the batch barcode, so
  // there's no human-readable code line.
  const useByY = hPx - F(19) - 6 * s
  const prepY = useByY - F(18) - 4 * s

  // Nutrition table sits just above the footer, after the ingredients. Reserve
  // its height up front so the ingredient list clamps to the room above it.
  const tHeadH = F(13) + 6 * s
  const tRowH = F(16) + 6 * s
  const tableH = data.nutrition ? tHeadH + 4 * tRowH : 0
  const tableTop = data.nutrition ? prepY - 10 * s - tableH : prepY

  // ── Price (bold, top-right) — reserve its width so the name doesn't collide ──
  let priceW = 0
  if (data.price) {
    ctx.font = `800 ${F(30)}px sans-serif`
    priceW = ctx.measureText(data.price).width + 8 * s
  }

  // ── Name (bold, up to 2 lines, auto-shrink), left of the price ──
  const { size: nameSize, lines } = fitText(
    ctx,
    data.name.toUpperCase(),
    maxW - priceW,
    2,
    Math.round(32 * s),
    Math.round(17 * s),
    '800',
  )
  ctx.font = `800 ${nameSize}px sans-serif`
  let y = 14 * s
  for (const line of lines) {
    ctx.fillText(line, LPAD, y)
    y += nameSize + 4 * s
  }
  if (data.price) {
    ctx.font = `800 ${F(30)}px sans-serif`
    ctx.textAlign = 'right'
    ctx.fillText(data.price, wPx - PAD, 14 * s)
    ctx.textAlign = 'left'
  }
  y += 4 * s

  // ── Divider ──
  ctx.fillRect(LPAD, y, maxW, Math.max(2, 2 * s))
  y += 8 * s

  // ── Ingredients (wrapped, clamped to the room above the footer) ──
  if (data.ingredients) {
    ctx.font = `600 ${F(16)}px sans-serif`
    ctx.fillText('INGREDIENTS', LPAD, y)
    y += F(16) + 3 * s

    const isize = F(22)
    ctx.font = `400 ${isize}px sans-serif`
    const lineH = isize + 4 * s
    const allLines = wrapToWidth(ctx, data.ingredients, contentW)
    const maxLines = Math.max(1, Math.floor((tableTop - 6 * s - y) / lineH))
    const shown = allLines.slice(0, maxLines)
    if (allLines.length > maxLines && shown.length > 0) {
      let last = shown[shown.length - 1]
      while (last.length > 1 && ctx.measureText(`${last}…`).width > contentW) {
        last = last.slice(0, -1)
      }
      shown[shown.length - 1] = `${last}…`
    }
    for (const l of shown) {
      ctx.fillText(l, LPAD, y)
      y += lineH
    }
  }

  // ── Nutrition table (per 100 g / per portion), above the footer ──
  if (data.nutrition) {
    const portionG =
      data.nutritionPortionG && data.nutritionPortionG > 0 ? data.nutritionPortionG : null
    drawNutritionTable(ctx, LPAD, tableTop, contentRight, s, data.nutrition, portionG)
  }

  // ── Footer: PREP, USE BY (emphasized), batch code — kept compact ──
  const prep = data.weight ? `PREP ${formatDate(data.prepDate)} · ${data.weight}` : `PREP ${formatDate(data.prepDate)}`
  ctx.font = `500 ${F(18)}px sans-serif`
  ctx.fillText(prep, LPAD, prepY)

  const useBy = data.shelfLifeDays != null ? addDays(data.prepDate, data.shelfLifeDays) : null
  ctx.font = `500 ${F(19)}px sans-serif`
  ctx.fillText(`USE BY ${useBy ? formatDate(useBy) : '—'}`, LPAD, useByY)

  // ── QR (batch barcode), right side, raised to sit beside the table ──
  if (data.qr && qrPx > 0) {
    const qrY = Math.max(14 * s, prepY - qrPx)
    drawQr(ctx, data.qr, qrX, qrY, qrPx)
  }
}

/**
 * Draw the КБЖУ as a compact two-column table — per 100 g and per portion —
 * right under the ingredients. Numbers are right-aligned in each column; units
 * live in the row label so the columns stay clean. When the portion mass is
 * unknown, only the per-portion column is shown.
 */
function drawNutritionTable(
  ctx: CanvasRenderingContext2D,
  x: number,
  yTop: number,
  maxRight: number,
  s: number,
  n: LabelNutrition,
  portionG: number | null,
): void {
  const F = (k: number) => Math.round(k * s)
  const fmt = (v: number) => {
    const r = Math.round(v * 10) / 10
    return Number.isInteger(r) ? String(r) : r.toFixed(1)
  }
  const headH = F(13) + 6 * s
  const rowH = F(16) + 6 * s

  // Columns sit just right of the label text — close to the КБЖУ names, not
  // pushed out toward the QR. Numbers are right-aligned in each column. If the
  // table would run into the QR (`maxRight`), shrink the number columns to fit.
  ctx.font = `500 ${F(16)}px sans-serif`
  const labelW = ctx.measureText('Energy, kcal').width + F(14)
  const cols = portionG ? 2 : 1
  let numW = F(52)
  let colGap = F(16)
  const avail = maxRight - x - labelW
  const need = cols * numW + (cols - 1) * colGap
  if (need > avail && avail > 0) {
    const k = Math.max(0.62, avail / need)
    numW = Math.round(numW * k)
    colGap = Math.round(colGap * k)
  }
  const hundRight = x + labelW + numW
  const portRight = portionG ? hundRight + colGap + numW : x + labelW + numW
  const tableW = portRight - x

  // Header: caption left, column headers right-aligned over their columns.
  ctx.font = `700 ${F(13)}px sans-serif`
  ctx.fillText('NUTRITION', x, yTop)
  ctx.textAlign = 'right'
  if (portionG) ctx.fillText('100g', hundRight, yTop)
  ctx.fillText(portionG ? `${fmt(portionG)}g` : 'PORTION', portRight, yTop)
  ctx.textAlign = 'left'

  // Full rule across the table so it reads as one cohesive block.
  ctx.fillRect(x, yTop + F(13) + 3 * s, Math.round(tableW), Math.max(1, Math.round(s)))

  const rows: Array<[string, number]> = [
    ['Energy, kcal', n.kcal],
    ['Protein, g', n.protein],
    ['Fat, g', n.fat],
    ['Carbs, g', n.carbs],
  ]
  let ry = yTop + headH
  for (const [label, val] of rows) {
    ctx.font = `500 ${F(16)}px sans-serif`
    ctx.fillText(label, x, ry)
    ctx.font = `700 ${F(16)}px sans-serif`
    ctx.textAlign = 'right'
    if (portionG) ctx.fillText(fmt((val * 100) / portionG), hundRight, ry)
    ctx.fillText(fmt(val), portRight, ry)
    ctx.textAlign = 'left'
    ry += rowH
  }
}

/** Draw a QR code for `text` as black modules at (x, y) within a `box` px square. */
function drawQr(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  box: number,
): void {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' })
  const count = qr.modules.size
  const data = qr.modules.data
  const cell = box / count
  ctx.fillStyle = '#000000'
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (data[r * count + c]) {
        // +1px overdraw avoids hairline gaps between modules when rasterized.
        ctx.fillRect(x + c * cell, y + r * cell, cell + 1, cell + 1)
      }
    }
  }
}

/**
 * Hand a PNG data URL to RawBT for printing on the Bluetooth-paired printer.
 *
 * RawBT understands `rawbt:data:image/png;base64,...` and prints it immediately.
 * The `intent:` variant additionally opens the Play Store if RawBT isn't
 * installed — swap `useIntent` to true if the plain scheme misbehaves on a
 * given device.
 */
export function printViaRawBT(dataUrl: string, useIntent = false): void {
  if (useIntent) {
    window.location.href =
      `intent:${dataUrl}#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;`
  } else {
    window.location.href = `rawbt:${dataUrl}`
  }
}

/**
 * Render + print a prep label in one call.
 *
 * `useIntent` launches RawBT via an Android intent (a fresh print context each
 * time) instead of the `rawbt:` URI that reuses an open connection — this works
 * around printers/RawBT that only accept the first job after connecting.
 */
export function printPrepLabel(
  data: PrepLabelData,
  size: LabelSize = DEFAULT_LABEL_SIZE,
  useIntent = false,
  gapMm = 0,
): void {
  printViaRawBT(renderPrepLabel(data, size, gapMm), useIntent)
}

// ── Native TSPL bitmap (USB) ────────────────────────────────────────────────
//
// The XP-420B's TSPL `BITMAP` command prints a 1-bit raster at exact dot
// dimensions, registering to the gap via `SIZE`/`GAP` just like native text —
// so there's no drift (the RawBT drift came from Bluetooth omitting the gap
// commands, not from raster itself). Printing the very canvas the cook previews
// guarantees what-you-see-is-what-prints and auto-adapts to every stock size.

/** DIRECTION the bitmap is fed in. 1 matched the proven native-text labels; if
 *  a test print comes out rotated 180°, flip this to 0. */
const TSPL_DIRECTION = 1

/**
 * Pack RGBA pixels into a TSPL 1-bit bitmap (MSB = leftmost pixel). A pixel is
 * "black" (printed) when dark; per the TSPL BITMAP spec bit 0 = black, 1 =
 * white, so we start every byte white and clear the bits that are black.
 */
export function packMonoBits(
  rgba: Uint8ClampedArray | Uint8Array | number[],
  wPx: number,
  hPx: number,
): { widthBytes: number; data: Uint8Array } {
  const widthBytes = Math.ceil(wPx / 8)
  const data = new Uint8Array(widthBytes * hPx).fill(0xff)
  for (let y = 0; y < hPx; y++) {
    for (let x = 0; x < wPx; x++) {
      const i = (y * wPx + x) * 4
      // Anti-aliased edges average to grey; threshold at the midpoint. Treat
      // transparent pixels as white so nothing prints outside the drawn art.
      const alpha = rgba[i + 3]
      const black = alpha > 128 && rgba[i] < 128
      if (black) data[y * widthBytes + (x >> 3)] &= ~(0x80 >> (x & 7))
    }
  }
  return { widthBytes, data }
}

/**
 * Build a complete TSPL program (as raw bytes) that prints the label as a
 * native bitmap over USB. The header/footer are ASCII; the BITMAP payload is
 * binary, so the whole thing is assembled as a Uint8Array.
 */
export function buildPrepLabelTSPLBitmap(
  data: PrepLabelData,
  size: LabelSize = DEFAULT_LABEL_SIZE,
): Uint8Array {
  const canvas = renderPrepLabelCanvas(data, size, 0)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context unavailable')
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const { widthBytes, data: bits } = packMonoBits(img.data, canvas.width, canvas.height)

  const enc = new TextEncoder()
  const header = enc.encode(
    `SIZE ${size.wMm} mm,${size.hMm} mm\r\n` +
      'GAP 2 mm,0 mm\r\n' +
      `DIRECTION ${TSPL_DIRECTION}\r\n` +
      'CLS\r\n' +
      `BITMAP 0,0,${widthBytes},${canvas.height},0,`,
  )
  const footer = enc.encode('\r\nPRINT 1,1\r\n')

  const out = new Uint8Array(header.length + bits.length + footer.length)
  out.set(header, 0)
  out.set(bits, header.length)
  out.set(footer, header.length + bits.length)
  return out
}
