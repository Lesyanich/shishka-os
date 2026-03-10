import { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  DollarSign,
  FileUp,
  Loader2,
  Receipt,
  TrendingDown,
  TrendingUp,
  Upload,
  Wallet,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useExpenseLedger } from '../hooks/useExpenseLedger'
import type { ExpenseRow } from '../hooks/useExpenseLedger'

/* ═══════════════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════════════ */

function formatTHB(v: number) {
  if (v >= 1_000_000) return `฿${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `฿${(v / 1_000).toFixed(1)}K`
  return `฿${v.toFixed(0)}`
}

const CATEGORY_COLORS = [
  '#10b981', '#f59e0b', '#6366f1', '#ef4444', '#06b6d4',
  '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#84cc16',
]

const CURRENCY_OPTIONS = ['THB', 'USD', 'EUR', 'RUB', 'GBP', 'CNY', 'JPY']
const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'card', label: 'Card' },
  { value: 'other', label: 'Other' },
]

/* ═══════════════════════════════════════════════════════════════════
   FinanceManager Page
   ═══════════════════════════════════════════════════════════════════ */

export function FinanceManager() {
  const {
    rows,
    categories,
    subCategories,
    suppliers,
    monthlySummaries,
    grandTotal,
    isLoading,
    error,
    refetch,
  } = useExpenseLedger()

  const [refreshKey, setRefreshKey] = useState(0)

  const handleCreated = () => {
    setRefreshKey((k) => k + 1)
    refetch()
  }

  // Current month total
  const now = new Date()
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const monthTotal = rows
    .filter((r) => r.transaction_date.startsWith(currentMonthKey))
    .reduce((s, r) => s + r.amount_thb, 0)
  const prevMonthKey = now.getMonth() === 0
    ? `${now.getFullYear() - 1}-12`
    : `${now.getFullYear()}-${String(now.getMonth()).padStart(2, '0')}`
  const prevMonthTotal = rows
    .filter((r) => r.transaction_date.startsWith(prevMonthKey))
    .reduce((s, r) => s + r.amount_thb, 0)
  const monthDelta = prevMonthTotal > 0 ? ((monthTotal - prevMonthTotal) / prevMonthTotal) * 100 : 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-100">Finance</h1>
        <p className="mt-1 text-sm text-slate-500">
          Expense ledger with multi-currency support and receipt storage.
        </p>
      </div>

      {/* ── KPI strip ── */}
      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard
          label="This Month"
          value={formatTHB(monthTotal)}
          delta={monthDelta}
          isLoading={isLoading}
        />
        <KpiCard
          label="All-time Total"
          value={formatTHB(grandTotal)}
          isLoading={isLoading}
        />
        <KpiCard
          label="Transactions"
          value={String(rows.length)}
          isLoading={isLoading}
        />
      </div>

      {/* ── Main grid ── */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.45fr)_minmax(0,0.55fr)]">
        {/* Left: Form + Uploaders */}
        <div className="space-y-6">
          <ExpenseForm
            categories={categories}
            subCategories={subCategories}
            suppliers={suppliers}
            onCreated={handleCreated}
          />
        </div>

        {/* Right: Chart + History */}
        <div className="space-y-6">
          <MonthlyChart
            summaries={monthlySummaries}
            isLoading={isLoading}
            error={error}
          />
          <ExpenseHistory
            rows={rows}
            isLoading={isLoading}
            error={error}
            refreshKey={refreshKey}
            onRefetch={refetch}
          />
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   KPI Card
   ═══════════════════════════════════════════════════════════════════ */

function KpiCard({
  label,
  value,
  delta,
  isLoading,
}: {
  label: string
  value: string
  delta?: number
  isLoading: boolean
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-3">
      {isLoading ? (
        <div className="h-12 animate-pulse rounded bg-slate-800" />
      ) : (
        <>
          <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-lg font-bold text-slate-100">{value}</span>
            {delta !== undefined && Math.abs(delta) > 0.5 && (
              <span
                className={`flex items-center gap-0.5 text-[10px] font-medium ${
                  delta > 0 ? 'text-rose-400' : 'text-emerald-400'
                }`}
              >
                {delta > 0 ? (
                  <TrendingUp className="h-3 w-3" />
                ) : (
                  <TrendingDown className="h-3 w-3" />
                )}
                {delta > 0 ? '+' : ''}
                {delta.toFixed(1)}% vs prev
              </span>
            )}
          </div>
        </>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   Monthly Chart
   ═══════════════════════════════════════════════════════════════════ */

function MonthlyChart({
  summaries,
  isLoading,
  error,
}: {
  summaries: { month: string; total_thb: number; by_category: Record<string, number> }[]
  isLoading: boolean
  error: string | null
}) {
  // Get all unique category names for stacked bars
  const allCategories = useMemo(() => {
    const set = new Set<string>()
    for (const s of summaries) {
      for (const cat of Object.keys(s.by_category)) set.add(cat)
    }
    return Array.from(set).sort()
  }, [summaries])

  const chartData = useMemo(
    () =>
      summaries.map((s) => ({
        month: s.month,
        ...s.by_category,
      })),
    [summaries],
  )

  return (
    <div className="flex flex-col rounded-xl border border-slate-800 bg-slate-900/30">
      <div className="border-b border-slate-800 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-100">Monthly Expenses</h2>
        <p className="text-xs text-slate-500">amount_thb by category</p>
      </div>
      <div className="flex-1 px-2 py-4">
        {error ? (
          <div className="flex h-52 items-center justify-center text-xs text-rose-400">{error}</div>
        ) : isLoading ? (
          <div className="flex h-52 animate-pulse flex-col justify-end gap-2 px-2">
            {[60, 90, 40, 75, 55].map((h, i) => (
              <div key={i} className="w-full rounded bg-slate-800" style={{ height: `${h * 0.5}%` }} />
            ))}
          </div>
        ) : chartData.length === 0 ? (
          <div className="flex h-52 flex-col items-center justify-center gap-2 text-xs text-slate-500">
            <span className="text-2xl">📊</span>
            No expense data yet
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 9, fill: '#64748b' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 9, fill: '#64748b' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={formatTHB}
                width={52}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0f172a',
                  border: '1px solid #1e293b',
                  borderRadius: 8,
                  fontSize: 11,
                }}
                formatter={(value) => {
                  const num = typeof value === 'number' ? value : Number(value)
                  return [formatTHB(num)] as [string]
                }}
                cursor={{ fill: 'rgba(255,255,255,0.03)' }}
              />
              <Legend
                wrapperStyle={{ fontSize: 9, paddingTop: 4 }}
                iconSize={8}
              />
              {allCategories.map((cat, i) => (
                <Bar
                  key={cat}
                  dataKey={cat}
                  stackId="a"
                  fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]}
                  radius={i === allCategories.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   Expense Form  (with multi-currency + file uploaders)
   ═══════════════════════════════════════════════════════════════════ */

function ExpenseForm({
  categories,
  subCategories,
  suppliers,
  onCreated,
}: {
  categories: { code: number; name: string }[]
  subCategories: { sub_code: number; category_code: number; name: string }[]
  suppliers: { id: string; name: string }[]
  onCreated: () => void
}) {
  // Form state
  const [txDate, setTxDate] = useState(new Date().toISOString().split('T')[0])
  const [flowType, setFlowType] = useState<'OpEx' | 'CapEx'>('OpEx')
  const [categoryCode, setCategoryCode] = useState<number | ''>('')
  const [subCategoryCode, setSubCategoryCode] = useState<number | ''>('')
  const [supplierId, setSupplierId] = useState('')
  const [details, setDetails] = useState('')
  const [amountOriginal, setAmountOriginal] = useState<number | ''>('')
  const [currency, setCurrency] = useState('THB')
  const [exchangeRate, setExchangeRate] = useState<number | ''>(1)
  const [paidBy, setPaidBy] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [status, setStatus] = useState<'pending' | 'paid' | 'cancelled'>('paid')

  // Receipt files
  const [supplierReceipt, setSupplierReceipt] = useState<File | null>(null)
  const [bankSlip, setBankSlip] = useState<File | null>(null)
  const [taxInvoice, setTaxInvoice] = useState<File | null>(null)

  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Filtered sub-categories
  const filteredSubCats = categoryCode !== ''
    ? subCategories.filter((sc) => sc.category_code === categoryCode)
    : []

  // Auto-calc THB
  const computedTHB =
    typeof amountOriginal === 'number' && typeof exchangeRate === 'number'
      ? amountOriginal * exchangeRate
      : null

  // Upload a single receipt to Supabase Storage
  async function uploadReceipt(file: File, prefix: string): Promise<string | null> {
    const ext = file.name.split('.').pop() ?? 'jpg'
    const filePath = `${prefix}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`

    const { error: uploadErr } = await supabase.storage
      .from('receipts')
      .upload(filePath, file, { upsert: false })

    if (uploadErr) {
      console.error(`[uploadReceipt] ${prefix} error`, uploadErr)
      return null
    }

    const { data } = supabase.storage.from('receipts').getPublicUrl(filePath)
    return data.publicUrl
  }

  const handleSubmit = async () => {
    if (typeof amountOriginal !== 'number' || amountOriginal <= 0) {
      setError('Amount must be > 0')
      return
    }
    if (currency !== 'THB' && (typeof exchangeRate !== 'number' || exchangeRate <= 0)) {
      setError('Exchange rate must be > 0 for non-THB currency')
      return
    }

    setIsSaving(true)
    setError(null)
    setSuccess(null)

    try {
      // Upload receipts in parallel
      const [supplierUrl, bankUrl, taxUrl] = await Promise.all([
        supplierReceipt ? uploadReceipt(supplierReceipt, 'supplier') : Promise.resolve(null),
        bankSlip ? uploadReceipt(bankSlip, 'bank') : Promise.resolve(null),
        taxInvoice ? uploadReceipt(taxInvoice, 'tax') : Promise.resolve(null),
      ])

      const insertPayload: Record<string, unknown> = {
        transaction_date: txDate,
        flow_type: flowType,
        category_code: categoryCode !== '' ? categoryCode : null,
        sub_category_code: subCategoryCode !== '' ? subCategoryCode : null,
        supplier_id: supplierId || null,
        details: details.trim(),
        amount_original: amountOriginal,
        currency,
        exchange_rate: currency === 'THB' ? 1 : exchangeRate,
        paid_by: paidBy.trim(),
        payment_method: paymentMethod,
        status,
        receipt_supplier_url: supplierUrl,
        receipt_bank_url: bankUrl,
        tax_invoice_url: taxUrl,
      }

      const { error: insertErr } = await supabase
        .from('expense_ledger')
        .insert(insertPayload)

      if (insertErr) throw insertErr

      setSuccess(
        `Saved: ${formatTHB(computedTHB ?? amountOriginal)} — ${flowType} ${details || '(no details)'}`,
      )

      // Reset
      setAmountOriginal('')
      setDetails('')
      setCategoryCode('')
      setSubCategoryCode('')
      setSupplierId('')
      setSupplierReceipt(null)
      setBankSlip(null)
      setTaxInvoice(null)

      onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/50 shadow-sm">
      <header className="border-b border-slate-800 px-4 py-3">
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-emerald-400" />
          <div>
            <h2 className="text-sm font-semibold text-slate-100">New Expense</h2>
            <p className="text-xs text-slate-500">
              Multi-currency with auto-calculated THB total
            </p>
          </div>
        </div>
      </header>

      <div className="space-y-4 px-4 py-4">
        {error && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
            {success}
          </div>
        )}

        {/* Date + Flow Type */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs text-slate-400">Date</label>
            <input
              type="date"
              value={txDate}
              onChange={(e) => setTxDate(e.target.value)}
              className="h-9 w-full rounded-md border border-slate-700 bg-slate-800 px-3 text-xs text-slate-100 outline-none focus:border-emerald-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Type</label>
            <div className="flex gap-2">
              {(['OpEx', 'CapEx'] as const).map((ft) => (
                <button
                  key={ft}
                  type="button"
                  onClick={() => setFlowType(ft)}
                  className={`h-9 flex-1 rounded-md border text-xs font-medium transition ${
                    flowType === ft
                      ? ft === 'OpEx'
                        ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-200'
                        : 'border-amber-500/60 bg-amber-500/15 text-amber-200'
                      : 'border-slate-700 bg-slate-800 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  {ft}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Category + Sub-category */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs text-slate-400">Category</label>
            <select
              value={categoryCode}
              onChange={(e) => {
                const v = e.target.value === '' ? '' : Number(e.target.value)
                setCategoryCode(v as number | '')
                setSubCategoryCode('')
              }}
              className="h-9 w-full rounded-md border border-slate-700 bg-slate-800 px-2 text-xs text-slate-100 outline-none focus:border-emerald-500"
            >
              <option value="">Select category...</option>
              {categories.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Sub-category</label>
            <select
              value={subCategoryCode}
              onChange={(e) => setSubCategoryCode(e.target.value === '' ? '' : Number(e.target.value))}
              disabled={filteredSubCats.length === 0}
              className="h-9 w-full rounded-md border border-slate-700 bg-slate-800 px-2 text-xs text-slate-100 outline-none focus:border-emerald-500 disabled:opacity-40"
            >
              <option value="">
                {filteredSubCats.length === 0 ? 'Select category first' : 'Select sub-category...'}
              </option>
              {filteredSubCats.map((sc) => (
                <option key={sc.sub_code} value={sc.sub_code}>
                  {sc.sub_code} — {sc.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Supplier */}
        <div>
          <label className="mb-1 block text-xs text-slate-400">Supplier (optional)</label>
          <select
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            className="h-9 w-full rounded-md border border-slate-700 bg-slate-800 px-2 text-xs text-slate-100 outline-none focus:border-emerald-500"
          >
            <option value="">No supplier</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        {/* Amount + Currency + Exchange Rate */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="mb-1 block text-xs text-slate-400">Amount</label>
            <input
              type="number"
              step="0.01"
              value={amountOriginal}
              onChange={(e) =>
                setAmountOriginal(e.target.value === '' ? '' : Number(e.target.value))
              }
              placeholder="0.00"
              className="h-9 w-full rounded-md border border-slate-700 bg-slate-800 px-3 text-xs text-slate-100 outline-none focus:border-emerald-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Currency</label>
            <select
              value={currency}
              onChange={(e) => {
                setCurrency(e.target.value)
                if (e.target.value === 'THB') setExchangeRate(1)
              }}
              className="h-9 w-full rounded-md border border-slate-700 bg-slate-800 px-2 text-xs text-slate-100 outline-none focus:border-emerald-500"
            >
              {CURRENCY_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">
              {currency === 'THB' ? 'Rate (1.00)' : `Rate → THB`}
            </label>
            <input
              type="number"
              step="0.0001"
              value={exchangeRate}
              onChange={(e) =>
                setExchangeRate(e.target.value === '' ? '' : Number(e.target.value))
              }
              disabled={currency === 'THB'}
              className="h-9 w-full rounded-md border border-slate-700 bg-slate-800 px-3 text-xs text-slate-100 outline-none focus:border-emerald-500 disabled:opacity-40"
            />
          </div>
        </div>

        {/* Auto-calculated THB */}
        {currency !== 'THB' && computedTHB !== null && (
          <div className="rounded-lg border border-slate-700/50 bg-slate-800/50 px-4 py-3">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">
              Total in THB (auto)
            </div>
            <div className="mt-1 text-lg font-semibold text-amber-300">
              ฿{computedTHB.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="mt-0.5 text-[10px] text-slate-500">
              {amountOriginal} {currency} × {exchangeRate}
            </div>
          </div>
        )}

        {/* Details */}
        <div>
          <label className="mb-1 block text-xs text-slate-400">Details</label>
          <input
            type="text"
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder="Description of expense..."
            className="h-9 w-full rounded-md border border-slate-700 bg-slate-800 px-3 text-xs text-slate-100 outline-none focus:border-emerald-500"
          />
        </div>

        {/* Paid by + Payment method + Status */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="mb-1 block text-xs text-slate-400">Paid by</label>
            <input
              type="text"
              value={paidBy}
              onChange={(e) => setPaidBy(e.target.value)}
              placeholder="Name..."
              className="h-9 w-full rounded-md border border-slate-700 bg-slate-800 px-3 text-xs text-slate-100 outline-none focus:border-emerald-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Payment</label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="h-9 w-full rounded-md border border-slate-700 bg-slate-800 px-2 text-xs text-slate-100 outline-none focus:border-emerald-500"
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as 'pending' | 'paid' | 'cancelled')}
              className="h-9 w-full rounded-md border border-slate-700 bg-slate-800 px-2 text-xs text-slate-100 outline-none focus:border-emerald-500"
            >
              <option value="paid">Paid</option>
              <option value="pending">Pending</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>

        {/* ── Receipt Uploaders ── */}
        <div>
          <p className="mb-2 text-xs font-medium text-slate-300">Receipts</p>
          <div className="grid grid-cols-3 gap-2">
            <FileUploadButton
              label="Supplier Receipt"
              file={supplierReceipt}
              onFileChange={setSupplierReceipt}
            />
            <FileUploadButton
              label="Bank Slip"
              file={bankSlip}
              onFileChange={setBankSlip}
            />
            <FileUploadButton
              label="Tax Invoice"
              file={taxInvoice}
              onFileChange={setTaxInvoice}
            />
          </div>
        </div>

        {/* Submit */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isSaving}
          className="inline-flex h-9 w-full items-center justify-center rounded-md border border-emerald-500/60 bg-emerald-500/15 text-xs font-medium text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-50"
        >
          {isSaving ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <DollarSign className="mr-1 h-3.5 w-3.5" />
          )}
          Save Expense
        </button>
      </div>
    </section>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   File Upload Button
   ═══════════════════════════════════════════════════════════════════ */

function FileUploadButton({
  label,
  file,
  onFileChange,
}: {
  label: string
  file: File | null
  onFileChange: (f: File | null) => void
}) {
  return (
    <label className="flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-dashed border-slate-700 bg-slate-800/50 px-2 py-3 text-center transition hover:border-emerald-500/50 hover:bg-slate-800">
      {file ? (
        <>
          <FileUp className="h-4 w-4 text-emerald-400" />
          <span className="max-w-full truncate text-[10px] text-emerald-300">{file.name}</span>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              onFileChange(null)
            }}
            className="text-[9px] text-rose-400 hover:underline"
          >
            Remove
          </button>
        </>
      ) : (
        <>
          <Upload className="h-4 w-4 text-slate-500" />
          <span className="text-[10px] text-slate-500">{label}</span>
        </>
      )}
      <input
        type="file"
        className="hidden"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null
          onFileChange(f)
          e.target.value = '' // allow re-selecting same file
        }}
      />
    </label>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   Expense History Table
   ═══════════════════════════════════════════════════════════════════ */

function ExpenseHistory({
  rows,
  isLoading,
  error,
  refreshKey: _refreshKey,
  onRefetch,
}: {
  rows: ExpenseRow[]
  isLoading: boolean
  error: string | null
  refreshKey: number
  onRefetch: () => void
}) {
  if (error) {
    return (
      <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
        <div className="text-xs text-rose-400">{error}</div>
      </section>
    )
  }

  if (isLoading) {
    return (
      <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
        <div className="flex items-center justify-center py-8 text-xs text-slate-500">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading expenses...
        </div>
      </section>
    )
  }

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/50 shadow-sm">
      <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <div className="flex items-center gap-2">
          <Receipt className="h-4 w-4 text-emerald-400" />
          <h2 className="text-sm font-semibold text-slate-100">Recent Expenses</h2>
          <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] text-slate-400">
            {rows.length}
          </span>
        </div>
        <button
          type="button"
          onClick={onRefetch}
          className="text-[10px] text-slate-500 hover:text-slate-300"
        >
          Refresh
        </button>
      </header>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-12 text-xs text-slate-500">
          <span className="text-2xl">💰</span>
          No expenses yet. Add one using the form.
        </div>
      ) : (
        <div className="max-h-[480px] overflow-y-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-slate-900 text-[10px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2">Date</th>
                <th className="px-2 py-2">Type</th>
                <th className="px-2 py-2">Category</th>
                <th className="px-2 py-2">Details</th>
                <th className="px-2 py-2 text-right">Amount</th>
                <th className="px-2 py-2 text-right">THB</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-4 py-2">Receipts</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {rows.slice(0, 50).map((r) => (
                <tr key={r.id} className="hover:bg-slate-800/30">
                  <td className="px-4 py-2 text-slate-300">{r.transaction_date}</td>
                  <td className="px-2 py-2">
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                        r.flow_type === 'OpEx'
                          ? 'bg-emerald-500/15 text-emerald-300'
                          : 'bg-amber-500/15 text-amber-300'
                      }`}
                    >
                      {r.flow_type}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-slate-400">
                    {r.category_name ?? '—'}
                    {r.sub_category_name ? ` / ${r.sub_category_name}` : ''}
                  </td>
                  <td className="max-w-[140px] truncate px-2 py-2 text-slate-300">
                    {r.details || '—'}
                  </td>
                  <td className="px-2 py-2 text-right text-slate-300">
                    {r.currency !== 'THB' ? (
                      <span>
                        {r.amount_original.toLocaleString()} {r.currency}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-2 py-2 text-right font-medium text-slate-100">
                    ฿{r.amount_thb.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </td>
                  <td className="px-2 py-2">
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                        r.status === 'paid'
                          ? 'bg-emerald-500/15 text-emerald-300'
                          : r.status === 'pending'
                            ? 'bg-amber-500/15 text-amber-300'
                            : 'bg-rose-500/15 text-rose-300'
                      }`}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex gap-1">
                      {r.receipt_supplier_url && (
                        <a href={r.receipt_supplier_url} target="_blank" rel="noopener" title="Supplier receipt">
                          <Receipt className="h-3 w-3 text-emerald-400" />
                        </a>
                      )}
                      {r.receipt_bank_url && (
                        <a href={r.receipt_bank_url} target="_blank" rel="noopener" title="Bank slip">
                          <Receipt className="h-3 w-3 text-sky-400" />
                        </a>
                      )}
                      {r.tax_invoice_url && (
                        <a href={r.tax_invoice_url} target="_blank" rel="noopener" title="Tax invoice">
                          <Receipt className="h-3 w-3 text-amber-400" />
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
