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
  ctx.font = `${weight} ${minSize}px sans-serif`
  return { size: minSize, lines: [text] }
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

  // Thermal printing is black-on-white. Fill the whole canvas (incl. gap) white.
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, wPx, hPx + gapPx)
  ctx.fillStyle = '#000000'
  ctx.textBaseline = 'top'

  // ── Item name (bold, up to 2 lines, auto-shrink) ──
  const { size: nameSize, lines } = fitText(
    ctx,
    data.name.toUpperCase(),
    wPx - PAD * 2,
    2,
    Math.round(46 * s),
    Math.round(26 * s),
    '800',
  )
  ctx.font = `800 ${nameSize}px sans-serif`
  let y = 16 * s
  for (const line of lines) {
    ctx.fillText(line, PAD, y)
    y += nameSize + 4 * s
  }

  // ── Divider ──
  ctx.fillRect(PAD, 130 * s, wPx - PAD * 2, Math.max(2, 3 * s))

  const VALX = PAD + 160 * s // x where each row's value starts
  let row = 144 * s
  const F = (n: number) => Math.round(n * s) // scaled font size

  // ── Weight / volume (optional) ──
  if (data.weight) {
    ctx.font = `500 ${F(26)}px sans-serif`
    ctx.fillText('QTY', PAD, row)
    ctx.font = `700 ${F(30)}px sans-serif`
    ctx.fillText(data.weight, VALX, row - 2 * s)
    row += 42 * s
  }

  // ── PREP date ──
  ctx.font = `500 ${F(26)}px sans-serif`
  ctx.fillText('PREP', PAD, row)
  ctx.font = `700 ${F(30)}px sans-serif`
  ctx.fillText(formatDate(data.prepDate), VALX, row - 2 * s)
  row += 42 * s

  // ── USE BY date (emphasized) ──
  const useBy = data.shelfLifeDays != null ? addDays(data.prepDate, data.shelfLifeDays) : null
  ctx.font = `500 ${F(26)}px sans-serif`
  ctx.fillText('USE BY', PAD, row)
  ctx.font = `800 ${F(36)}px sans-serif`
  ctx.fillText(useBy ? formatDate(useBy) : '—', VALX, row - 4 * s)

  // ── QR (optional, bottom-right) encoding the batch barcode ──
  if (data.qr) {
    const qrPx = Math.round(Math.min(118 * s, hPx - 130 * s, wPx * 0.32))
    drawQr(ctx, data.qr, wPx - qrPx - PAD, hPx - qrPx - PAD, qrPx)
  }

  // ── Batch code / product code (bottom-left, monospace) ──
  ctx.font = `400 ${F(22)}px monospace`
  ctx.fillText(data.batchCode ?? data.productCode, PAD, hPx - 28 * s)

  return canvas.toDataURL('image/png')
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
