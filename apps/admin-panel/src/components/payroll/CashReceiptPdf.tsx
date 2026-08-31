import { Document, Font, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import type { PayslipData } from '../../hooks/use-payroll'
import { bahtTextEnglish, bahtTextThai } from './amount-words'
import {
  COMPANY_ADDRESS,
  COMPANY_NAME,
  COMPANY_TAX_ID,
  formatDate,
  legalName,
  orMissing,
  periodLabel,
  thbPdf,
} from './payslip-helpers'

/**
 * Sarabun (SIL OFL, vendored in public/fonts) replaces the built-in Helvetica
 * used by the payslip: Helvetica is WinAnsi-only and renders every Thai
 * codepoint as "?". Sarabun is one of the Thai national fonts, so the document
 * also looks like what a labour inspector expects.
 */
Font.register({
  family: 'Sarabun',
  fonts: [
    { src: '/fonts/Sarabun-Regular.ttf', fontWeight: 400 },
    { src: '/fonts/Sarabun-Bold.ttf', fontWeight: 700 },
  ],
})

/**
 * Write SARA AM as its two visible marks, nikhahit + sara aa.
 *
 * The Thai shaper splits ำ anyway, but fontkit reports a code point for both
 * halves, so react-pdf's glyph→character index map runs one position ahead of
 * the string and the line slice drops the last glyph of the run — silently, and
 * only sometimes. Pre-splitting keeps glyphs and characters in step. The shape
 * on the page is unchanged because this is exactly what the shaper produces.
 */
const thai = (s: string) => s.replace(/ำ/g, 'ํา')

const styles = StyleSheet.create({
  page: {
    padding: 44,
    fontSize: 10,
    fontFamily: 'Sarabun',
    color: '#1e293b',
    lineHeight: 1.5,
  },
  header: { borderBottom: '2 solid #0f766e', paddingBottom: 10, marginBottom: 14 },
  company: { fontSize: 13, fontWeight: 700, color: '#0f766e' },
  companyMeta: { fontSize: 8, color: '#64748b' },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: 10,
  },
  title: { fontSize: 15, fontWeight: 700 },
  titleTh: { fontSize: 11, color: '#475569' },
  refBox: { alignItems: 'flex-end' },
  ref: { fontSize: 8, color: '#64748b' },

  metaGrid: { flexDirection: 'row', marginBottom: 12 },
  metaCell: { flex: 1 },
  label: { fontSize: 8, color: '#94a3b8' },
  // Same weight as the English label above it — the employee reads the Thai, so
  // it cannot be the fainter of the two.
  labelTh: { fontSize: 8, color: '#94a3b8' },
  value: { fontSize: 11 },

  reconRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
    borderBottom: '0.5 solid #e2e8f0',
  },
  reconLabel: { flex: 1, paddingRight: 10 },
  reconSub: { fontSize: 8, color: '#94a3b8' },

  amountBox: {
    marginTop: 14,
    border: '1.5 solid #0f766e',
    borderRadius: 4,
    padding: 14,
    backgroundColor: '#f0fdfa',
  },
  amountTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  amountLabel: { fontSize: 11, fontWeight: 700, color: '#0f766e' },
  amountLabelTh: { fontSize: 9, color: '#0f766e' },
  amountValue: { fontSize: 22, fontWeight: 700, color: '#0f766e' },
  wordsRow: { borderTop: '1 solid #99f6e4', marginTop: 8, paddingTop: 6 },
  words: { fontSize: 10, fontWeight: 700, color: '#0f766e' },
  // Deliberately not bold. In the bold subset react-pdf emits an empty
  // /ToUnicode entry for sara e (เ), so เจ็ด and เก้า still print but cannot be
  // searched or copied out of the PDF. This is the anti-tamper amount line, so
  // legibility of the extracted text wins over the extra weight; size and colour
  // carry the emphasis instead.
  wordsTh: { fontSize: 11, color: '#0f766e', marginTop: 2 },

  declaration: {
    marginTop: 16,
    backgroundColor: '#f8fafc',
    borderLeft: '2 solid #cbd5e1',
    padding: 8,
  },
  declText: { fontSize: 9 },
  declTextTh: { fontSize: 10, marginTop: 3 },

  signRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 40 },
  signBox: { width: '44%' },
  signLine: { borderTop: '1 solid #64748b', marginTop: 30, paddingTop: 3 },
  signLabel: { fontSize: 8, color: '#475569', textAlign: 'center' },
  signLabelTh: { fontSize: 8, color: '#475569', textAlign: 'center' },

  footer: {
    position: 'absolute',
    bottom: 26,
    left: 44,
    right: 44,
    fontSize: 7,
    color: '#cbd5e1',
    textAlign: 'center',
  },
})

function ReconRow({
  en,
  th,
  sub,
  value,
}: {
  en: string
  th: string
  sub?: string
  value: string
}) {
  return (
    <View style={styles.reconRow}>
      <View style={styles.reconLabel}>
        <Text>
          {en} <Text style={styles.reconSub}>/ {th}</Text>
        </Text>
        {sub ? <Text style={styles.reconSub}>{sub}</Text> : null}
      </View>
      <Text>{value}</Text>
    </View>
  )
}

/**
 * A4 cash payment receipt — the sheet the employee signs when wages are handed
 * over in banknotes. Separate from the payslip on purpose: the payslip explains
 * how the wage was computed, this proves the money changed hands, which is the
 * record LPA §114 asks the employer to keep and produce on inspection.
 *
 * Employee identification is the name alone, matching the CEO's payslip
 * decision of 2026-07-31 (MC b4876c65 §B) — ID numbers, address and DOB were
 * judged noise on a monthly wage document.
 */
export function CashReceiptPdf({ data }: { data: PayslipData }) {
  const { line, staff, period, payments } = data

  /**
   * Only kind='advance' reduces the amount on this receipt.
   *
   * `advancesPaid` in PayslipData sums EVERY staff_payments row, so once the
   * final hand-over is recorded it would drive the receipt to THB 0 — the
   * receipt would zero itself out the moment it became true. Advances are money
   * the employee already holds; the final payment is the very event this sheet
   * documents, so it must not be netted off.
   */
  const advances = payments.filter((p) => p.kind === 'advance')
  const advancesTotal = advances.reduce((sum, p) => sum + p.amount, 0)
  const cashDue = line.net_pay - advancesTotal

  const issuedOn = formatDate(period.period_end)
  const receiptRef = `CR-${period.period_start.slice(0, 7)}-${staff.id.slice(0, 8)}`

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.company}>{COMPANY_NAME}</Text>
          <Text style={styles.companyMeta}>
            Tax ID / {thai('เลขประจำตัวผู้เสียภาษี')}: {orMissing(COMPANY_TAX_ID)}
          </Text>
          <Text style={styles.companyMeta}>{orMissing(COMPANY_ADDRESS)}</Text>
          <View style={styles.titleRow}>
            <View>
              <Text style={styles.title}>CASH PAYMENT RECEIPT</Text>
              <Text style={styles.titleTh}>{thai('ใบสำคัญรับเงิน (จ่ายเป็นเงินสด)')}</Text>
            </View>
            <View style={styles.refBox}>
              <Text style={styles.ref}>No. {receiptRef}</Text>
              <Text style={styles.ref}>Issued / {thai('วันที่')}: {issuedOn}</Text>
            </View>
          </View>
        </View>

        <View style={styles.metaGrid}>
          <View style={styles.metaCell}>
            <Text style={styles.label}>Received by</Text>
            <Text style={styles.labelTh}>{thai('ชื่อผู้รับเงิน')}</Text>
            <Text style={styles.value}>{legalName(staff)}</Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.label}>For the wage period</Text>
            <Text style={styles.labelTh}>{thai('ประจำงวดค่าจ้าง')}</Text>
            <Text style={styles.value}>
              {periodLabel(period.period_start)} ({formatDate(period.period_start)} –{' '}
              {formatDate(period.period_end)})
            </Text>
          </View>
        </View>

        {/* Only shown when advances exist — otherwise net pay and the cash
            handed over are the same figure and repeating it invites confusion. */}
        {advances.length > 0 ? (
          <View>
            <ReconRow
              en="Net wages for the period"
              th={thai('ค่าจ้างสุทธิประจำงวด')}
              value={thbPdf(line.net_pay)}
            />
            {advances.map((p) => (
              <ReconRow
                key={p.id}
                en="Less: advance already received"
                th={thai('หัก เงินเบิกล่วงหน้า')}
                sub={`paid ${formatDate(p.paid_on)}${p.note ? ` — ${p.note}` : ''}`}
                value={`-${thbPdf(p.amount)}`}
              />
            ))}
          </View>
        ) : null}

        <View style={styles.amountBox}>
          <View style={styles.amountTop}>
            <View>
              <Text style={styles.amountLabel}>AMOUNT RECEIVED IN CASH</Text>
              <Text style={styles.amountLabelTh}>{thai('จำนวนเงินที่รับเป็นเงินสด')}</Text>
            </View>
            <Text style={styles.amountValue}>{thbPdf(cashDue)}</Text>
          </View>
          <View style={styles.wordsRow}>
            <Text style={styles.label}>In words / {thai('ตัวอักษร')}</Text>
            <Text style={styles.words}>{bahtTextEnglish(cashDue)}</Text>
            {/* One string, not three JSX children: a child boundary starts a new
                shaping run, and a Thai pre-posed vowel that opens a run comes back
                from the shaper with no code point, so it drops out of /ToUnicode
                and the receipt stops being text-searchable. */}
            <Text style={styles.wordsTh}>{thai(`(${bahtTextThai(cashDue)})`)}</Text>
          </View>
        </View>

        {/* Deliberately a statement of fact and nothing more. A clause waiving
            further claims would be unenforceable against the statutory minimum
            under the LPA, and asking an employee to sign one to get paid is the
            kind of pressure a labour inspector reads badly. */}
        <View style={styles.declaration}>
          <Text style={styles.declText}>
            I confirm that I have received the amount stated above, in cash and in full,
            as wages for the period shown.
          </Text>
          <Text style={styles.declTextTh}>
            {thai(
              'ข้าพเจ้าได้รับเงินจำนวนดังกล่าวข้างต้นเป็นเงินสดไว้ถูกต้องครบถ้วนแล้ว',
            )}
          </Text>
        </View>

        <View style={styles.signRow}>
          <View style={styles.signBox}>
            <View style={styles.signLine}>
              <Text style={styles.signLabel}>Employee signature / date</Text>
              <Text style={styles.signLabelTh}>{thai('ลงชื่อผู้รับเงิน / วันที่')}</Text>
            </View>
          </View>
          <View style={styles.signBox}>
            <View style={styles.signLine}>
              <Text style={styles.signLabel}>Paid by / date</Text>
              <Text style={styles.signLabelTh}>{thai('ลงชื่อผู้จ่ายเงิน / วันที่')}</Text>
            </View>
          </View>
        </View>

        <Text style={styles.footer}>
          {COMPANY_NAME} · Retain with the payroll record · Generated by Shishka OS
        </Text>
      </Page>
    </Document>
  )
}

export default CashReceiptPdf
