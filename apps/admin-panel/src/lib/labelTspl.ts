import {
  addDays,
  printViaRawBT,
  DEFAULT_LABEL_SIZE,
  type LabelSize,
  type LabelNutrition,
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
  /** SALE consumer-label extras — when set, the consumer layout is used. */
  nutrition?: LabelNutrition | null
  ingredients?: string | null
  /** Preformatted price, e.g. "฿111". Shown top-right on the consumer label. */
  price?: string | null
}

/** Drop non-ASCII so the printer's default codepage doesn't render garbage. */
function ascii(s: string): string {
  return s.replace(/[^\x20-\x7E]/g, ' ').replace(/\s+/g, ' ').trim()
}

/** "343kcal P14 F18 C36" — compact, ASCII-only for TSPL TEXT. */
function nutritionAscii(n: LabelNutrition): string {
  const r = (v: number) => String(Math.round(v))
  return `${r(n.kcal)}kcal P${r(n.protein)} F${r(n.fat)} C${r(n.carbs)}`
}

/** Greedy word-wrap into lines of at most `maxChars` characters. */
function wrapChars(text: string, maxChars: number): string[] {
  const words = ascii(text).split(' ').filter(Boolean)
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    const cand = cur ? `${cur} ${w}` : w
    if (cur && cand.length > maxChars) {
      lines.push(cur)
      cur = w
    } else {
      cur = cand
    }
  }
  if (cur) lines.push(cur)
  return lines
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
  // ASCII-only truncation — the printer codepage renders multibyte chars
  // (e.g. the "…" ellipsis) as garbage.
  if (l2.length > max2) l2 = l2.slice(0, max2)
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

  // SALE consumer label: name + price + per-portion nutrition + ingredients + QR + dates.
  if (data.nutrition || data.ingredients || data.price) {
    const PAD = 24
    const usable = wDots - PAD * 2
    // Price top-right (ASCII "THB 111" — the printer codepage has no ฿ glyph).
    const priceTxt = data.price ? ascii(data.price.replace(/฿/g, 'THB ')) : ''
    const priceW = priceTxt.length * 24 // font "4" ≈ 24 dots/char
    const priceX = priceTxt ? Math.max(PAD, wDots - PAD - priceW) : wDots - PAD
    const nameRight = priceTxt ? priceX - 12 : wDots - PAD
    const charsName = Math.max(8, Math.floor((nameRight - PAD) / 16)) // font "3" ≈ 16 dots/char

    // QR (batch barcode) sits bottom-right; ingredients wrap to clear its column.
    const qrCell = Math.max(3, Math.round(4 * s))
    const qrX = Math.round(wDots * 0.72)
    const qrY = Math.round(hDots * 0.42)
    const ingrWidth = data.qr ? qrX - PAD - 8 : usable
    const chars1 = Math.max(12, Math.floor(ingrWidth / 8)) // font "1" ≈ 8 dots/char

    // Footer stacked from the bottom: batch (f1), USE BY (f3), PREP (f2).
    const batchY = hDots - FONT_H['1'] - 6
    const useByY = batchY - FONT_H['3'] - 4
    const prepY = useByY - FONT_H['2'] - 2
    const footerTop = prepY - 6

    let y = 12
    const [n1, n2] = wrapName(data.name.toUpperCase(), charsName, charsName + 6)
    cmds.push(`TEXT ${PAD},${y},"3",0,1,1,"${esc(ascii(n1))}"`)
    if (priceTxt) cmds.push(`TEXT ${priceX},12,"4",0,1,1,"${esc(priceTxt)}"`)
    y += FONT_H['3'] + 8
    if (n2) {
      cmds.push(`TEXT ${PAD},${y},"2",0,1,1,"${esc(ascii(n2))}"`)
      y += FONT_H['2'] + 6
    }

    if (data.nutrition) {
      cmds.push(`TEXT ${PAD},${y},"2",0,1,1,"${esc(nutritionAscii(data.nutrition))}"`)
      y += FONT_H['2'] + 6
    }

    cmds.push(`BAR ${PAD},${y},${Math.round(wDots * 0.6)},2`)
    y += 8

    if (data.ingredients) {
      cmds.push(`TEXT ${PAD},${y},"1",0,1,1,"INGREDIENTS:"`)
      y += FONT_H['1'] + 4
      const lineH = FONT_H['1'] + 4
      const maxLines = Math.max(1, Math.floor((footerTop - y) / lineH))
      const all = wrapChars(data.ingredients, chars1)
      const shown = all.slice(0, maxLines)
      if (all.length > maxLines && shown.length > 0) {
        // ASCII truncation marker — the codepage has no multibyte ellipsis.
        const last = shown[shown.length - 1]
        shown[shown.length - 1] = last.slice(0, Math.max(0, chars1 - 3)) + '...'
      }
      for (const l of shown) {
        cmds.push(`TEXT ${PAD},${y},"1",0,1,1,"${esc(l)}"`)
        y += lineH
      }
    }

    const prep = data.weight
      ? `PREP ${fmtDate(data.prepDate)} ${esc(ascii(data.weight))}`
      : `PREP ${fmtDate(data.prepDate)}`
    cmds.push(`TEXT ${PAD},${prepY},"2",0,1,1,"${prep}"`)
    cmds.push(`TEXT ${PAD},${useByY},"3",0,1,1,"USE BY ${useByStr}"`)
    if (bottom) cmds.push(`TEXT ${PAD},${batchY},"1",0,1,1,"${esc(bottom)}"`)
    if (data.qr) cmds.push(`QRCODE ${qrX},${qrY},M,${qrCell},A,0,"${esc(data.qr)}"`)
    cmds.push('PRINT 1,1')
    return cmds.join('\r\n') + '\r\n'
  }

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
  // Fixed left margin (dots): the printer's left dead-zone is ~physical, so it
  // must NOT shrink with the label — 24 is the value proven on 60×40.
  const PAD = 24
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
