// Cyrillic → Latin transliteration for nomenclature search fallback.
//
// The CEO chats with AI Chef in Russian. When the model passes a cyrillic
// substring (e.g. "манакиш") to search_nomenclature, ILIKE returns 0 hits
// because the DB stores Latin names ("Manakish ..."). This module provides
// a single-pass character-level fallback so the second-attempt query has a
// chance of matching.
//
// Style: BGN/PCGN-ish, lowercase output. Good enough for substring search;
// not intended for full transliteration of arbitrary text.

const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh',
  з: 'z', и: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o',
  п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts',
  ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu',
  я: 'ya',
}

const CYRILLIC_RE = /[а-яё]/i

export function containsCyrillic(s: string): boolean {
  return CYRILLIC_RE.test(s)
}

export function transliterate(s: string): string {
  let out = ''
  for (const ch of s) {
    const lower = ch.toLowerCase()
    const mapped = CYRILLIC_TO_LATIN[lower]
    if (mapped !== undefined) {
      // Preserve approximate case: if input char was uppercase and mapped to
      // multi-char (e.g. Ш → sh), only the first char gets uppercased.
      if (ch !== lower && mapped.length > 0) {
        out += mapped[0].toUpperCase() + mapped.slice(1)
      } else {
        out += mapped
      }
    } else {
      out += ch
    }
  }
  return out
}
