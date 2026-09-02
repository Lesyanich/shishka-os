/**
 * Amount-in-words for the cash payment receipt.
 *
 * A signed cash receipt is the employer's only evidence that wages were handed
 * over (LPA §114 requires the payment record to carry the employee's signature).
 * Figures alone can be altered after signing — "14,032" becomes "114,032" with
 * one stroke — so the amount is repeated in words, which cannot be extended.
 *
 * Both renderings take the amount ALREADY ROUNDED to whole baht. Cash cannot be
 * handed over in fractions of a baht anyway, and the rest of the payslip rounds
 * for display, so words and figures agree only if both round identically.
 */

const THAI_DIGITS = [
  'ศูนย์',
  'หนึ่ง',
  'สอง',
  'สาม',
  'สี่',
  'ห้า',
  'หก',
  'เจ็ด',
  'แปด',
  'เก้า',
]

const THAI_PLACES = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน']

/**
 * Thai reading of a non-negative integer.
 *
 * Three irregularities the digit table cannot express:
 *  - a tens digit of 1 is bare "สิบ", never "หนึ่งสิบ"
 *  - a tens digit of 2 is "ยี่สิบ", never "สองสิบ"
 *  - a trailing 1 in any number above 9 is "เอ็ด", never "หนึ่ง"
 */
function thaiInteger(n: number): string {
  if (n === 0) return THAI_DIGITS[0]

  if (n >= 1_000_000) {
    const high = Math.floor(n / 1_000_000)
    const low = n % 1_000_000
    // A remainder of exactly 1 still takes เอ็ด — "หนึ่งล้านเอ็ด".
    const tail = low === 0 ? '' : low === 1 ? 'เอ็ด' : thaiInteger(low)
    return `${thaiInteger(high)}ล้าน${tail}`
  }

  const digits = String(n)
  let out = ''
  for (let i = 0; i < digits.length; i++) {
    const digit = Number(digits[i])
    if (digit === 0) continue
    const place = digits.length - i - 1
    if (place === 0) {
      out += digit === 1 && digits.length > 1 ? 'เอ็ด' : THAI_DIGITS[digit]
    } else if (place === 1) {
      if (digit === 1) out += 'สิบ'
      else if (digit === 2) out += 'ยี่สิบ'
      else out += THAI_DIGITS[digit] + 'สิบ'
    } else {
      out += THAI_DIGITS[digit] + THAI_PLACES[place]
    }
  }
  return out
}

/**
 * Thai baht text: "หนึ่งหมื่นสี่พันสามสิบสองบาทถ้วน".
 * "ถ้วน" ("exactly") closes the amount against added satang.
 */
export function bahtTextThai(amount: number): string {
  const baht = Math.round(Math.abs(amount))
  return `${thaiInteger(baht)}บาทถ้วน`
}

const EN_ONES = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
]

const EN_TENS = [
  '',
  '',
  'twenty',
  'thirty',
  'forty',
  'fifty',
  'sixty',
  'seventy',
  'eighty',
  'ninety',
]

function englishUnderHundred(n: number): string {
  if (n < 20) return EN_ONES[n]
  const tens = EN_TENS[Math.floor(n / 10)]
  const ones = n % 10
  return ones ? `${tens}-${EN_ONES[ones]}` : tens
}

function englishUnderThousand(n: number): string {
  const hundreds = Math.floor(n / 100)
  const rest = n % 100
  if (!hundreds) return englishUnderHundred(n)
  const head = `${EN_ONES[hundreds]} hundred`
  return rest ? `${head} and ${englishUnderHundred(rest)}` : head
}

const EN_SCALES: [number, string][] = [
  [1_000_000_000, 'billion'],
  [1_000_000, 'million'],
  [1_000, 'thousand'],
]

function englishInteger(n: number): string {
  if (n === 0) return 'zero'
  const parts: string[] = []
  let rest = n
  for (const [value, name] of EN_SCALES) {
    if (rest >= value) {
      parts.push(`${englishUnderThousand(Math.floor(rest / value))} ${name}`)
      rest %= value
    }
  }
  if (rest > 0) {
    // "fourteen thousand AND thirty-two" — the connector only appears when what
    // is left is a bare tens/ones tail, not when it opens a new hundreds group.
    if (parts.length > 0 && rest < 100) parts.push('and')
    parts.push(englishUnderThousand(rest))
  }
  return parts.join(' ')
}

/** English baht text: "Fourteen thousand and thirty-two baht only". */
export function bahtTextEnglish(amount: number): string {
  const baht = Math.round(Math.abs(amount))
  const words = englishInteger(baht)
  return `${words.charAt(0).toUpperCase()}${words.slice(1)} baht only`
}
