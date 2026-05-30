import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from '@react-pdf/renderer'
import type { PayslipData } from '../../hooks/use-payroll'
import {
  COMPANY_NAME,
  derivePayslip,
  formatDate,
  periodLabel,
  thb,
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
  docTitle: { fontSize: 11, marginTop: 2, color: '#475569' },
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
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  rowBorder: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
    borderTop: '1 solid #e2e8f0',
  },
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  netLabel: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#0f766e' },
  netValue: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: '#0f766e' },
  attRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 2 },
  attCell: { width: '33%', marginBottom: 3 },
  signRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 40,
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

export function PayslipPdf({ data }: { data: PayslipData }) {
  const { line, staff, period } = data
  const d = derivePayslip(data)

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.company}>{COMPANY_NAME}</Text>
          <Text style={styles.docTitle}>Payslip / Расчётный листок</Text>
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
          <View style={styles.empCell}>
            <Text style={styles.label}>Name</Text>
            <Text style={styles.value}>
              {staff.name}
              {staff.name_th ? ` (${staff.name_th})` : ''}
            </Text>
          </View>
          <View style={styles.empCell}>
            <Text style={styles.label}>Role</Text>
            <Text style={styles.value}>{staff.role}</Text>
          </View>
          <View style={styles.empCell}>
            <Text style={styles.label}>Nationality</Text>
            <Text style={styles.value}>{staff.nationality ?? '—'}</Text>
          </View>
          <View style={styles.empCell}>
            <Text style={styles.label}>Hire date</Text>
            <Text style={styles.value}>{formatDate(staff.hire_date)}</Text>
          </View>
          <View style={styles.empCell}>
            <Text style={styles.label}>Employment type</Text>
            <Text style={styles.value}>{staff.employment_type ?? '—'}</Text>
          </View>
          <View style={styles.empCell}>
            <Text style={styles.label}>Social Security No.</Text>
            <Text style={styles.value}>
              {staff.sso_number ?? 'Not enrolled'}
            </Text>
          </View>
        </View>

        {/* Earnings + Deductions side by side */}
        <View style={styles.cols}>
          <View style={styles.col}>
            <Text style={styles.sectionTitle}>Earnings</Text>
            <View style={styles.row}>
              <Text>Base salary</Text>
              <Text>{thb(line.base_salary)}</Text>
            </View>
            <View style={styles.row}>
              <Text>Overtime</Text>
              <Text>{thb(line.overtime_pay)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.bold}>Gross</Text>
              <Text style={styles.bold}>{thb(d.gross)}</Text>
            </View>
          </View>

          <View style={styles.col}>
            <Text style={styles.sectionTitle}>Deductions</Text>
            <View style={styles.row}>
              <Text>Absence</Text>
              <Text>{thb(line.absence_deduction)}</Text>
            </View>
            <View style={styles.row}>
              <Text>Social Security (5%)</Text>
              <Text>{thb(line.sso_employee)}</Text>
            </View>
            <View style={styles.row}>
              <Text>Withholding tax</Text>
              <Text>{thb(line.withholding_tax)}</Text>
            </View>
            <View style={styles.row}>
              <Text>Other</Text>
              <Text>{thb(line.other_deductions)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.bold}>Total deductions</Text>
              <Text style={styles.bold}>{thb(d.totalDeductions)}</Text>
            </View>
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
        </View>

        {/* Net */}
        <View style={styles.netBox}>
          <Text style={styles.netLabel}>NET PAY</Text>
          <Text style={styles.netValue}>{thb(d.net)}</Text>
        </View>

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
