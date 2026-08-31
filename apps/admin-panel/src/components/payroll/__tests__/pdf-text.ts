import zlib from 'node:zlib'

/**
 * Minimal PDF text extractor for tests.
 *
 * Thai loses glyphs silently in react-pdf — a receipt can look perfectly typeset
 * and still be missing the last letter of a line — so the tests assert on what
 * actually reached the page instead of on a screenshot.
 *
 * Font-aware on purpose: each embedded subset numbers its glyphs from zero, so
 * decoding bold text with the regular font's CMap yields plausible-looking
 * mojibake rather than an obvious failure.
 */

interface PdfObject {
  num: number
  dict: string
  stream: Buffer | null
}

function parseObjects(buf: Buffer): Map<number, PdfObject> {
  const latin = buf.toString('latin1')
  const found: { num: number; start: number }[] = []
  const re = /(\d+)\s+0\s+obj/g
  let m: RegExpExecArray | null
  while ((m = re.exec(latin)) !== null) found.push({ num: Number(m[1]), start: m.index })

  const out = new Map<number, PdfObject>()
  for (let i = 0; i < found.length; i++) {
    const start = found[i].start
    const end = i + 1 < found.length ? found[i + 1].start : buf.length
    const slice = buf.subarray(start, end)
    const s = slice.toString('latin1')
    const si = s.indexOf('stream')
    let stream: Buffer | null = null
    const dict = si === -1 ? s : s.slice(0, si)
    if (si !== -1) {
      let ds = si + 6
      if (s[ds] === '\r') ds++
      if (s[ds] === '\n') ds++
      const ei = s.lastIndexOf('endstream')
      if (ei > ds) {
        const raw = slice.subarray(ds, ei)
        if (/FlateDecode/.test(dict)) {
          try {
            stream = zlib.inflateSync(raw)
          } catch {
            stream = null
          }
        } else {
          stream = raw
        }
      }
    }
    out.set(found[i].num, { num: found[i].num, dict, stream })
  }
  return out
}

function parseCMap(stream: Buffer): Map<number, string> {
  const txt = stream.toString('latin1')
  const map = new Map<number, string>()
  const decodeHex = (hex: string): string => {
    let s = ''
    for (let i = 0; i < hex.length; i += 4) s += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16))
    return s
  }
  // Destinations spanning several UTF-16 units are written spaced: <0055><0066 0069>.
  for (const blk of txt.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const p of blk[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F\s]*)>/g)) {
      map.set(parseInt(p[1], 16), decodeHex(p[2].replace(/\s+/g, '')))
    }
  }
  for (const blk of txt.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const p of blk[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) {
      const lo = parseInt(p[1], 16)
      const hi = parseInt(p[2], 16)
      const base = parseInt(p[3], 16)
      for (let c = lo; c <= hi; c++) map.set(c, String.fromCharCode(base + (c - lo)))
    }
  }
  return map
}

export function extractPdfText(buf: Buffer): string {
  const objs = parseObjects(buf)

  // Font object number -> glyph id -> characters.
  const fontMaps = new Map<number, Map<number, string>>()
  for (const o of objs.values()) {
    if (!/\/Type\s*\/Font/.test(o.dict)) continue
    const ref = o.dict.match(/\/ToUnicode\s+(\d+)\s+0\s+R/)
    if (!ref) continue
    const cmapObj = objs.get(Number(ref[1]))
    if (cmapObj?.stream) fontMaps.set(o.num, parseCMap(cmapObj.stream))
  }

  // Resource name (/F1) -> glyph map, read from every /Font resource dict.
  const byName = new Map<string, Map<number, string>>()
  for (const o of objs.values()) {
    for (const res of o.dict.matchAll(/\/Font\s*<<([\s\S]*?)>>/g)) {
      for (const e of res[1].matchAll(/\/([A-Za-z0-9]+)\s+(\d+)\s+0\s+R/g)) {
        const fm = fontMaps.get(Number(e[2]))
        if (fm) byName.set(e[1], fm)
      }
    }
  }

  let out = ''
  for (const o of objs.values()) {
    if (!o.stream) continue
    const txt = o.stream.toString('latin1')
    if (!/\bTJ\b|\bTj\b/.test(txt)) continue

    let active: Map<number, string> | null = null
    // Walk font selections and text-showing operators in document order.
    const tokens = txt.matchAll(
      /\/([A-Za-z0-9]+)\s+[\d.]+\s+Tf|\[([^\]]*)\]\s*TJ|<([0-9a-fA-F\s]+)>\s*Tj/g,
    )
    for (const t of tokens) {
      if (t[1] !== undefined) {
        active = byName.get(t[1]) ?? active
        continue
      }
      const body = t[2] !== undefined ? t[2] : `<${t[3]}>`
      for (const h of body.matchAll(/<([0-9a-fA-F\s]+)>/g)) {
        const hex = h[1].replace(/\s+/g, '')
        for (let i = 0; i + 4 <= hex.length; i += 4) {
          const gid = parseInt(hex.slice(i, i + 4), 16)
          out += active?.get(gid) ?? '�'
        }
      }
    }
  }
  return out
}

/**
 * SARA AM (ำ) reaches the page as its two marks, nikhahit + sara aa — either
 * because the receipt writes them that way or because the shaper split it. Fold
 * the pair back so extracted text can be compared to ordinary Thai source.
 */
export function normalizeThai(s: string): string {
  return s.replace(/ํา/g, 'ำ').replace(/ำา/g, 'ำ')
}
