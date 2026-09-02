// @vitest-environment node
import { describe, expect, it } from 'vitest'
import path from 'node:path'
import fs from 'node:fs'
import { Font, renderToBuffer } from '@react-pdf/renderer'
import { CashReceiptPdf } from '../CashReceiptPdf'
import { advancePayments, fixture } from './receipt-fixture'
import { extractPdfText, normalizeThai } from './pdf-text'

const FONT_DIR = path.resolve(__dirname, '../../../../public/fonts')

// The component registers '/fonts/...' for the browser. register() appends
// rather than replaces, so the Sarabun entry has to be dropped before the same
// family is re-pointed at the files on disk. Font.clear() is too broad — it
// also drops the built-in standard fonts and layout then fails on Helvetica.
delete (Font.getRegisteredFonts() as Record<string, unknown>).Sarabun
Font.register({
  family: 'Sarabun',
  fonts: [
    { src: path.join(FONT_DIR, 'Sarabun-Regular.ttf'), fontWeight: 400 },
    { src: path.join(FONT_DIR, 'Sarabun-Bold.ttf'), fontWeight: 700 },
  ],
})

const OUT = '/tmp/shishka-receipts'

async function render(data: Parameters<typeof CashReceiptPdf>[0]['data'], name: string) {
  const buf = await renderToBuffer(<CashReceiptPdf data={data} />)
  fs.mkdirSync(OUT, { recursive: true })
  fs.writeFileSync(path.join(OUT, `${name}.pdf`), buf)
  return normalizeThai(extractPdfText(buf))
}

/**
 * Thai text can vanish a glyph at a time without the PDF looking broken, so
 * every Thai run on the receipt is asserted against the page contents rather
 * than eyeballed. Fragments avoid spaces — inter-word gaps are emitted as
 * positioning, not glyphs, so they do not survive extraction.
 */
const THAI_ON_EVERY_RECEIPT = [
  'เลขประจำตัวผู้เสียภาษี',
  'ใบสำคัญรับเงิน',
  '(จ่ายเป็นเงินสด)',
  'ชื่อผู้รับเงิน',
  'ประจำงวดค่าจ้าง',
  'จำนวนเงินที่รับเป็นเงินสด',
  'ตัวอักษร',
  'ข้าพเจ้าได้รับเงินจำนวนดังกล่าวข้างต้นเป็นเงินสดไว้ถูกต้องครบถ้วนแล้ว',
  'ลงชื่อผู้รับเงิน',
  'ลงชื่อผู้จ่ายเงิน',
  'วันที่',
]

describe('CashReceiptPdf', () => {
  it('keeps every Thai run intact', async () => {
    const text = await render(fixture(), 'simple')
    for (const fragment of THAI_ON_EVERY_RECEIPT) {
      expect(text, `missing Thai fragment: ${fragment}`).toContain(fragment)
    }
  }, 60_000)

  it('prints the amount in figures and in both languages', async () => {
    const text = await render(fixture(), 'simple')
    expect(text).toContain('THB 14,032')
    expect(text).toContain('Fourteen thousand and thirty-two baht only')
    expect(text).toContain('หนึ่งหมื่นสี่พันสามสิบสองบาทถ้วน')
  }, 60_000)

  it('signs for the whole wage and shows advances as a breakdown', async () => {
    const data = fixture({ payments: advancePayments(), advancesPaid: 14032 })
    const text = await render(data, 'advances')

    // The signed amount stays the full period wage: the advance carries its own
    // signature on its own slip, so deducting it here would leave two papers
    // that no longer reconcile to one wage.
    expect(text).toContain('THB 14,032')
    expect(text).toContain('Fourteen thousand and thirty-two baht only')

    // ...and the advance appears below as a breakdown of when it was received.
    expect(text).toContain('THB 4,000')
    expect(text).toContain('THB 1,500')
    expect(text).toContain('เงินเบิกล่วงหน้าที่รับและลงชื่อไว้แล้ว')

    // 14,032 − 4,000 − 1,500 = 8,532 handed over today. The recorded 8,532
    // 'final' payment is that very hand-over and must not be counted twice.
    expect(text).toContain('THB 8,532')
    expect(text).toContain('ยอดคงเหลือที่จ่ายเป็นเงินสดวันนี้')
  }, 60_000)

  it('drops the breakdown and the advance clause when there are no advances', async () => {
    const text = await render(fixture(), 'simple')
    expect(text).not.toContain('ประกอบด้วย')
    expect(text).not.toContain('โดยบางส่วนได้รับล่วงหน้าระหว่างงวดตามรายการข้างต้น')
  }, 60_000)

  // เจ็ด and เก้า are the two Thai numerals starting with sara e, so any amount
  // containing a 7 or a 9 exercises the glyph react-pdf drops from /ToUnicode.
  it('keeps an amount whose words start with sara e intact', async () => {
    const data = fixture()
    data.line.net_pay = 7_900
    const text = await render(data, 'sara-e')
    expect(text).toContain('เจ็ดพันเก้าร้อยบาทถ้วน')
  }, 60_000)

  it('keeps the longest realistic amount intact', async () => {
    const data = fixture()
    data.line.net_pay = 999_999
    const text = await render(data, 'long-words')
    expect(text).toContain('เก้าแสนเก้าหมื่นเก้าพันเก้าร้อยเก้าสิบเก้าบาทถ้วน')
    expect(text).toContain('จำนวนเงินที่รับเป็นเงินสด')
  }, 60_000)
})
