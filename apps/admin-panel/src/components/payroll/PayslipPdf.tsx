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
  derivePayslip,
  formatDate,
  legalName,
  orMissing,
  periodLabel,
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
    paddingVertical: 2,
  },
  rowLabel: { flex: 1, paddingRight: 8 },
  subLabel: { fontSize: 7, color: '#94a3b8' },
  cols: { flexDirection: 'row', gap: 16 },
  col: { flex: 1 },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderTop: '1 solid #cbd5e1',
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
  advRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 8,
    color: '#0f766e',
    marginTop: 3,
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTop: '1 solid #99f6e4',
    marginTop: 4,
    paddingTop: 4,
  },
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

function MoneyRow({
  label,
  sub,
  value,
  strong,
}: {
  label: string
  sub?: string
  value: string
  strong?: boolean
}) {
  return (
    <View style={strong ? styles.totalRow : styles.row}>
      <View style={styles.rowLabel}>
        <Text style={strong ? styles.bold : undefined}>{label}</Text>
        {sub ? <Text style={styles.subLabel}>{sub}</Text> : null}
      </View>
      <Text style={strong ? styles.bold : undefined}>{value}</Text>
    </View>
  )
}

export function PayslipPdf({ data }: { data: PayslipData }) {
  const { line, staff, period, payments } = data
  const d = derivePayslip(data)
  const dailyRate = staff.monthly_salary ? staff.monthly_salary / 30 : 0

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

        {/* Employee */}
        <Text style={styles.sectionTitle}>Employee</Text>
        <View style={styles.empGrid}>
          {/* Latin script only — built-in Helvetica cannot render name_th. */}
          <View style={styles.empCell}>
            <Text style={styles.label}>Full name</Text>
            <Text style={styles.value}>{legalName(staff)}</Text>
          </View>
          <View style={styles.empCell}>
            <Text style={styles.label}>Position</Text>
            <Text style={styles.value}>{staff.role}</Text>
          </View>
          <View style={styles.empCell}>
            <Text style={styles.label}>Nationality</Text>
            <Text style={staff.nationality ? styles.value : styles.valueMuted}>
              {staff.nationality ?? 'Not on file'}
            </Text>
          </View>
          <View style={styles.empCell}>
            <Text style={styles.label}>Date of birth</Text>
            <Text style={staff.date_of_birth ? styles.value : styles.valueMuted}>
              {staff.date_of_birth ? formatDate(staff.date_of_birth) : 'Not on file'}
            </Text>
          </View>
          <View style={styles.empCell}>
            <Text style={styles.label}>Employment start</Text>
            <Text style={styles.value}>{formatDate(staff.hire_date)}</Text>
          </View>
          <View style={styles.empCell}>
            <Text style={styles.label}>Employment type</Text>
            <Text style={styles.value}>{staff.employment_type ?? '—'}</Text>
          </View>
          <View style={styles.empCell}>
            <Text style={styles.label}>Social Security No.</Text>
            <Text style={staff.sso_number ? styles.value : styles.valueMuted}>
              {staff.sso_number ?? 'Pending enrolment'}
            </Text>
          </View>
          <View style={styles.empCell}>
            <Text style={styles.label}>Tax ID</Text>
            <Text style={staff.tax_id ? styles.value : styles.valueMuted}>
              {staff.tax_id ?? 'Not on file'}
            </Text>
          </View>
          <View style={styles.empCell}>
            <Text style={styles.label}>Address</Text>
            <Text style={staff.address ? styles.value : styles.valueMuted}>
              {staff.address ?? 'Not on file'}
            </Text>
          </View>
          {staff.work_permit_number ? (
            <View style={styles.empCell}>
              <Text style={styles.label}>Work permit</Text>
              <Text style={styles.value}>
                {staff.work_permit_number}
                {staff.work_permit_expiry
                  ? ` (exp. ${formatDate(staff.work_permit_expiry)})`
                  : ''}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Earnings + Deductions side by side */}
        <View style={styles.cols}>
          <View style={styles.col}>
            <Text style={styles.sectionTitle}>Earnings</Text>
            <MoneyRow
              label="Base salary"
              sub={
                staff.monthly_salary
                  ? `contract ${thbPdf(staff.monthly_salary)}/month`
                  : undefined
              }
              value={thbPdf(line.base_salary)}
            />
            <MoneyRow label="Overtime" value={thbPdf(line.overtime_pay)} />
            <MoneyRow
              label="Bonus"
              sub={line.bonus_note ?? undefined}
              value={thbPdf(line.bonus_pay)}
            />
            <MoneyRow label="Gross" value={thbPdf(d.gross)} strong />
          </View>

          <View style={styles.col}>
            <Text style={styles.sectionTitle}>Deductions</Text>
            <MoneyRow
              label="Unpaid absence"
              sub={
                line.days_absent > 0
                  ? `${line.days_absent} day(s) x ${thbPdf(dailyRate)} (monthly / 30)`
                  : undefined
              }
              value={thbPdf(line.absence_deduction)}
            />
            <MoneyRow
              label="Late arrivals"
              sub={
                line.late_days > 0
                  ? `${line.late_days} day(s), ${line.late_minutes} min unworked`
                  : undefined
              }
              value={thbPdf(line.late_deduction)}
            />
            <MoneyRow
              label="Social Security (5%)"
              sub={
                line.sso_employee > 0
                  ? 'on the capped base'
                  : 'not enrolled - nothing withheld'
              }
              value={thbPdf(line.sso_employee)}
            />
            <MoneyRow
              label="Withholding tax"
              sub={
                line.withholding_tax === 0
                  ? 'below the taxable threshold'
                  : 'monthly slice of the annual liability'
              }
              value={thbPdf(line.withholding_tax)}
            />
            {d.otherBeyondLate > 0 ? (
              <MoneyRow label="Other" value={thbPdf(d.otherBeyondLate)} />
            ) : null}
            <MoneyRow
              label="Total deductions"
              value={thbPdf(d.totalDeductions)}
              strong
            />
          </View>
        </View>

        {/* Attendance */}
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

        {/* Employer contribution — SSO match only. The work-permit figure is
            deliberately absent: it is an HR cost, not part of this wage. */}
        {d.hasEmployerPaid ? (
          <View>
            <Text style={styles.sectionTitle}>Employer contribution</Text>
            <MoneyRow
              label="Social Security - employer 5%"
              value={thbPdf(d.employerSso)}
            />
          </View>
        ) : null}

        {/* Net + advances */}
        <View style={styles.netBox}>
          <View style={styles.netTop}>
            <Text style={styles.netLabel}>NET PAY</Text>
            <Text style={styles.netValue}>{thbPdf(d.net)}</Text>
          </View>
          {payments.length > 0 ? (
            <View>
              {payments.map((p) => (
                <View key={p.id} style={styles.advRow}>
                  <Text>
                    less: {p.kind} paid {formatDate(p.paid_on)}
                    {p.note ? ` - ${p.note}` : ''}
                  </Text>
                  <Text>-{thbPdf(p.amount)}</Text>
                </View>
              ))}
              <View style={styles.balanceRow}>
                <Text style={styles.bold}>Balance due</Text>
                <Text style={styles.bold}>{thbPdf(d.balanceDue)}</Text>
              </View>
            </View>
          ) : null}
          <Text style={[styles.subLabel, { marginTop: 4 }]}>
            Paid in cash. Daily rate = monthly salary / 30 (LPA s.68).
          </Text>
        </View>

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
