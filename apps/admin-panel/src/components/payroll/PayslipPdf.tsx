import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from '@react-pdf/renderer'
import type { PayslipData } from '../../hooks/use-payroll'
import {
  COMPANY_ADDRESS,
  COMPANY_NAME,
  COMPANY_SSO_ACCOUNT,
  COMPANY_TAX_ID,
  buildPayslipStatement,
  derivePayslip,
  formatDate,
  legalName,
  orMissing,
  periodLabel,
  signedThbPdf,
  thbPdf,
} from './payslip-helpers'

// A4 payslip. Plain Helvetica (built-in) to avoid font registration.
const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 10,
    fontFamily: 'Helvetica',
    color: '#1e293b',
    lineHeight: 1.4,
  },
  header: {
    borderBottom: '2 solid #0f766e',
    paddingBottom: 10,
    marginBottom: 16,
  },
  company: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: '#0f766e' },
  companyMeta: { fontSize: 8, color: '#64748b', marginTop: 1 },
  docTitle: { fontSize: 11, marginTop: 4, color: '#475569' },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  meta: { fontSize: 9, color: '#64748b' },
  sectionTitle: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: '#0f766e',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
    marginTop: 10,
  },
  empGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  empCell: { width: '50%', marginBottom: 3 },
  label: { fontSize: 8, color: '#94a3b8' },
  value: { fontSize: 10 },
  valueMuted: { fontSize: 10, color: '#94a3b8' },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
    borderBottom: '0.5 solid #e2e8f0',
  },
  rowLabel: { flex: 1, paddingRight: 8 },
  subLabel: { fontSize: 7, color: '#94a3b8' },
  amount: { textAlign: 'right' },
  amountMinus: { textAlign: 'right', color: '#be123c' },
  amountDim: { textAlign: 'right', color: '#94a3b8' },
  labelDim: { color: '#94a3b8' },
  // No `cols`/`col` any more: the Earnings|Deductions gutter is gone. The slip
  // is one running column so the subtraction can be checked by eye.
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
    borderTop: '1.5 solid #64748b',
    marginTop: 2,
  },
  bold: { fontFamily: 'Helvetica-Bold' },
  netBox: {
    marginTop: 16,
    backgroundColor: '#f0fdfa',
    border: '1 solid #0f766e',
    borderRadius: 4,
    padding: 12,
  },
  netTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  netLabel: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#0f766e' },
  netValue: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: '#0f766e' },
  attRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 2 },
  attCell: { width: '20%', marginBottom: 3 },
  noteBox: {
    marginTop: 10,
    backgroundColor: '#f8fafc',
    padding: 6,
    fontSize: 8,
    color: '#475569',
  },
  signRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 36,
  },
  signBox: { width: '45%' },
  signLine: { borderTop: '1 solid #94a3b8', marginTop: 24, paddingTop: 3 },
  signLabel: { fontSize: 8, color: '#64748b', textAlign: 'center' },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 40,
    right: 40,
    fontSize: 7,
    color: '#cbd5e1',
    textAlign: 'center',
  },
})

/**
 * One line in the running money column — the PDF twin of MoneyLine in
 * Payslip.tsx. Both are driven by buildPayslipStatement so the printed slip and
 * the screen can never disagree about what was paid.
 */
function MoneyRow({
  label,
  sub,
  amount,
  dim,
  unsigned,
}: {
  label: string
  sub?: string
  amount: number
  dim?: boolean
  unsigned?: boolean
}) {
  const amountStyle = dim
    ? styles.amountDim
    : amount < 0
      ? styles.amountMinus
      : styles.amount

  return (
    <View style={styles.row}>
      <View style={styles.rowLabel}>
        <Text style={dim ? styles.labelDim : undefined}>{label}</Text>
        {sub ? <Text style={styles.subLabel}>{sub}</Text> : null}
      </View>
      <Text style={amountStyle}>{unsigned ? thbPdf(amount) : signedThbPdf(amount)}</Text>
    </View>
  )
}

export function PayslipPdf({ data }: { data: PayslipData }) {
  const { line, staff, period } = data
  const d = derivePayslip(data)
  const st = buildPayslipStatement(data, { pdf: true })

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Employer */}
        <View style={styles.header}>
          <Text style={styles.company}>{COMPANY_NAME}</Text>
          <Text style={styles.companyMeta}>
            Tax ID: {orMissing(COMPANY_TAX_ID)} · SSO acct: {orMissing(COMPANY_SSO_ACCOUNT)}
          </Text>
          <Text style={styles.companyMeta}>{orMissing(COMPANY_ADDRESS)}</Text>
          <Text style={styles.docTitle}>Payslip / Salary Statement</Text>
          <View style={styles.metaRow}>
            <Text style={styles.meta}>
              Pay period: {periodLabel(period.period_start)} (
              {formatDate(period.period_start)} – {formatDate(period.period_end)})
            </Text>
            <Text style={styles.meta}>Status: {period.status}</Text>
          </View>
        </View>

        {/* Employee — name only. CEO decision 2026-07-31 (MC b4876c65 §B).
            Latin script only: built-in Helvetica cannot render name_th. */}
        <Text style={styles.sectionTitle}>Employee</Text>
        <View style={styles.empGrid}>
          <View style={styles.empCell}>
            <Text style={styles.label}>Name</Text>
            <Text style={styles.value}>{legalName(staff)}</Text>
          </View>
        </View>

        {/* The money — one running column, no GROSS subtotal, bonus last.
            CEO decision 2026-07-31 (MC b4876c65). */}
        <View style={{ marginTop: 8 }}>
          {st.rows.map((r) => (
            <MoneyRow
              key={r.key}
              label={r.label}
              sub={r.sub}
              amount={r.amount}
              dim={r.dim}
              unsigned={r.unsigned}
            />
          ))}

          {/* Checkpoint 1 — the month's entitlement. Only when something has
              already been handed over; otherwise it repeats the figure below. */}
          {st.hasSettlements ? (
            <View style={styles.totalRow}>
              <Text style={styles.bold}>{st.totalLabel}</Text>
              <Text style={[styles.bold, styles.amount]}>{thbPdf(st.total)}</Text>
            </View>
          ) : null}

          {st.settlements.map((s) => (
            <MoneyRow key={s.key} label={s.label} sub={s.sub} amount={s.amount} />
          ))}
        </View>

        {/* Checkpoint 2 — the figure the signature acknowledges. */}
        <View style={styles.netBox}>
          <View style={styles.netTop}>
            <Text style={styles.netLabel}>PAID TO YOU TODAY</Text>
            <Text style={styles.netValue}>{thbPdf(st.paidToday)}</Text>
          </View>
          <Text style={[styles.subLabel, { marginTop: 4 }]}>
            Paid in cash. Daily rate = monthly salary / 30 (LPA s.68).
          </Text>
        </View>

        {/* Attendance — context, never arithmetic (CEO rule 7). */}
        <Text style={styles.sectionTitle}>Attendance</Text>
        <View style={styles.attRow}>
          <View style={styles.attCell}>
            <Text style={styles.label}>Calendar days</Text>
            <Text style={styles.value}>{d.calendarDays}</Text>
          </View>
          <View style={styles.attCell}>
            <Text style={styles.label}>Days worked</Text>
            <Text style={styles.value}>{line.days_worked}</Text>
          </View>
          <View style={styles.attCell}>
            <Text style={styles.label}>Unpaid absences</Text>
            <Text style={styles.value}>{line.days_absent}</Text>
          </View>
          <View style={styles.attCell}>
            <Text style={styles.label}>Paid leave</Text>
            <Text style={styles.value}>{line.days_leave_paid}</Text>
          </View>
          <View style={styles.attCell}>
            <Text style={styles.label}>Late days</Text>
            <Text style={styles.value}>
              {line.late_days > 0 ? `${line.late_days} (${line.late_minutes}m)` : '0'}
            </Text>
          </View>
        </View>
        {data.substituteDaysOwed > 0 ? (
          <Text style={styles.subLabel}>
            {data.substituteDaysOwed} substitute day(s) off still owed for public holidays worked
            (LPA s.29).
          </Text>
        ) : null}

        {/* Employer-paid — information only, never in the deduction column.
            LPA s.76 and the Royal Decree on the Management of Foreign Workers
            forbid recovering these from wages. The work-permit figure is
            deliberately absent for the same reason: it is an HR cost, not part
            of this wage, and printing it beside a net invites the set-off. */}
        {d.hasEmployerPaid ? (
          <Text style={styles.noteBox}>
            Employer-paid, not deducted from your pay: social security{' '}
            {thbPdf(d.employerSso)}.
          </Text>
        ) : null}

        {line.notes ? (
          <Text style={styles.noteBox}>{line.notes}</Text>
        ) : null}

        {/* Signatures */}
        <View style={styles.signRow}>
          <View style={styles.signBox}>
            <View style={styles.signLine}>
              <Text style={styles.signLabel}>Employer signature</Text>
            </View>
          </View>
          <View style={styles.signBox}>
            <View style={styles.signLine}>
              <Text style={styles.signLabel}>Employee signature</Text>
            </View>
          </View>
        </View>

        <Text style={styles.footer}>
          Generated by Shishka OS · {COMPANY_NAME} · This is a
          computer-generated payslip.
        </Text>
      </Page>
    </Document>
  )
}

export default PayslipPdf
