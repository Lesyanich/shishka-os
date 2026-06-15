import {
  addDays,
  printViaRawBT,
  DEFAULT_LABEL_SIZE,
  type LabelSize,
} from './labelPrinting'

/**
 * Native TSPL label generation for the XP-420B.
 *
 * The printer is a TSPL label printer: `SIZE`/`GAP` make it self-register to the
 * inter-label gap, so there is NO drift (unlike ESC/POS raster via RawBT). We
 * emit TSPL text and hand the raw bytes to RawBT (as text/plain, not an image),
 * so RawBT forwards them verbatim and the printer interprets TSPL.
 *
 * Verified on hardware 2026-06-15 via USB: SIZE/GAP/TEXT/BAR/QRCODE/PRINT →
 * perfectly aligned labels, native QR.
 */

export interface TsplLabelData {
  name: string
  prepDate: Date
  shelfLifeDays: number | null
  /** Preformatted weight e.g. "1.5 kg". Omitted if null. */
  weight?: string | null
  /** QR payload + bottom text (the batch barcode). */
  qr?: string | null
  batchCode?: string | null
}

function fmtDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yy = String(d.getFullYear()).slice(-2)
  return `${dd}/${mm}/${yy}`
}

/** TSPL TEXT content is double-quoted; neutralize quotes/backslashes/newlines. */
function esc(s: string): string {
  return s.replace(/[\\"]/g, "'").replace(/[\r\n]+/g, ' ').trim()
}

/** Greedy-wrap a name into at most 2 lines of roughly `max1`/`max2` chars. */
function wrapName(name: string, max1: number, max2: number): [string, string] {
  const words = name.split(/\s+/).filter(Boolean)
  let l1 = ''
  let i = 0
  for (; i < words.length; i++) {
    const cand = l1 ? `${l1} ${words[i]}` : words[i]
    if (cand.length > max1 && l1) break
    l1 = cand
  }
  let l2 = words.slice(i).join(' ')
  if (l2.length > max2) l2 = `${l2.slice(0, max2 - 1)}…`
  return [l1, l2]
}

const DOTS_PER_MM = 203 / 25.4 // ≈ 8 dots/mm at 203 dpi
// Approx heights (dots) of the TSPL built-in bitmap fonts at x1/y1.
const FONT_H: Record<string, number> = { '1': 12, '2': 20, '3': 24, '4': 32 }

/** Build a TSPL program (string) for one prep label at the given stock size. */
export function renderPrepLabelTSPL(
  data: TsplLabelData,
  size: LabelSize = DEFAULT_LABEL_SIZE,
): string {
  const cmds: string[] = [
    `SIZE ${size.wMm} mm,${size.hMm} mm`,
    'GAP 2 mm,0 mm',
    'DIRECTION 1',
    'CLS',
  ]

  const useBy = data.shelfLifeDays != null ? addDays(data.prepDate, data.shelfLifeDays) : null
  const useByStr = useBy ? fmtDate(useBy) : '--'
  const bottom = data.batchCode ?? data.qr ?? ''

  const wDots = Math.round(size.wMm * DOTS_PER_MM)
  const hDots = Math.round(size.hMm * DOTS_PER_MM)
  // Scale vs the proven 60×40 baseline (480×320). min() keeps within both axes.
  const s = Math.min(wDots / 480, hDots / 320)

  if (s >= 0.92) {
    // Big stock (60×40 / 58×40): use the proven, hardware-verified fixed layout.
    const [n1, n2] = wrapName(data.name.toUpperCase(), 18, 30)
    let y = 18
    cmds.push(`TEXT 24,${y},"4",0,1,1,"${esc(n1)}"`)
    y += 44
    if (n2) {
      cmds.push(`TEXT 24,${y},"2",0,1,1,"${esc(n2)}"`)
      y += 34
    }
    cmds.push(`BAR 24,${y + 4},300,3`)
    let ry = y + 20
    if (data.weight) {
      cmds.push(`TEXT 24,${ry},"3",0,1,1,"QTY    ${esc(data.weight)}"`)
      ry += 42
    }
    cmds.push(`TEXT 24,${ry},"3",0,1,1,"PREP   ${fmtDate(data.prepDate)}"`)
    ry += 42
    cmds.push(`TEXT 24,${ry},"4",0,1,1,"USE BY ${useByStr}"`)
    if (bottom) cmds.push(`TEXT 24,288,"1",0,1,1,"${esc(bottom)}"`)
    if (data.qr) cmds.push(`QRCODE 348,104,M,4,A,0,"${esc(data.qr)}"`)
    cmds.push('PRINT 1,1')
    return cmds.join('\r\n') + '\r\n'
  }

  // Smaller stock (50×30, 50×25, 40×30): adaptive layout scaled to the label.
  const big = s >= 0.72
  const fName = big ? '3' : '2'
  const fRow = big ? '2' : '1'
  const fUse = big ? '3' : '2'
  const PAD = Math.max(12, Math.round(20 * s))
  const gap = Math.max(4, Math.round(8 * s))
  const cell = Math.max(2, Math.round(4 * s))

  const [n1, n2] = wrapName(data.name.toUpperCase(), big ? 16 : 14, big ? 24 : 18)
  let y = Math.max(8, Math.round(12 * s))
  cmds.push(`TEXT ${PAD},${y},"${fName}",0,1,1,"${esc(n1)}"`)
  y += FONT_H[fName] + gap
  if (n2) {
    cmds.push(`TEXT ${PAD},${y},"${fRow}",0,1,1,"${esc(n2)}"`)
    y += FONT_H[fRow] + gap
  }
  cmds.push(`BAR ${PAD},${y},${Math.round(wDots * 0.6)},2`)
  y += gap + 4
  if (data.weight) {
    cmds.push(`TEXT ${PAD},${y},"${fRow}",0,1,1,"QTY ${esc(data.weight)}"`)
    y += FONT_H[fRow] + gap
  }
  cmds.push(`TEXT ${PAD},${y},"${fRow}",0,1,1,"PREP ${fmtDate(data.prepDate)}"`)
  y += FONT_H[fRow] + gap
  cmds.push(`TEXT ${PAD},${y},"${fUse}",0,1,1,"USE BY ${useByStr}"`)

  // Bottom batch code only if there's vertical room.
  if (bottom && hDots >= 200) {
    cmds.push(`TEXT ${PAD},${hDots - FONT_H['1'] - Math.round(6 * s)},"1",0,1,1,"${esc(bottom)}"`)
  }
  // QR on the right; smaller cell on smaller stock.
  if (data.qr) {
    cmds.push(`QRCODE ${Math.round(wDots * 0.66)},${Math.round(hDots * 0.28)},M,${cell},A,0,"${esc(data.qr)}"`)
  }

  cmds.push('PRINT 1,1')
  return cmds.join('\r\n') + '\r\n'
}

/** Base64 of a UTF-8/ASCII string (browser-safe). */
function toBase64(s: string): string {
  return btoa(unescape(encodeURIComponent(s)))
}

/**
 * Render TSPL and hand the raw bytes to RawBT as text/plain (NOT an image), so
 * RawBT forwards them verbatim and the printer runs them as TSPL.
 */
export function printPrepLabelTSPL(
  data: TsplLabelData,
  size: LabelSize = DEFAULT_LABEL_SIZE,
  useIntent = false,
): void {
  const tspl = renderPrepLabelTSPL(data, size)
  printViaRawBT(`data:text/plain;base64,${toBase64(tspl)}`, useIntent)
}
