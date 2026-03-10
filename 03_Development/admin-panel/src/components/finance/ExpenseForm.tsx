import { useState } from 'react'
import { DollarSign, Loader2, Wallet } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatTHB, CURRENCY_OPTIONS, PAYMENT_METHODS } from './helpers'

/* ────────────────────────── Types ────────────────────────── */

export interface ExpenseFormProps {
  categories: { code: number; name: string }[]
  subCategories: { sub_code: number; category_code: number; name: string }[]
  suppliers: { id: string; name: string }[]
  /** Injected receipt URLs from MagicDropzone */
  receiptUrls?: {
    supplier?: string | null
    bank?: string | null
    tax?: string | null
  }
  onCreated: () => void
}

/* ────────────────────────── Component ────────────────────────── */

export function ExpenseForm({
  categories,
  subCategories,
  suppliers,
  receiptUrls,
  onCreated,
}: ExpenseFormProps) {
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
        receipt_supplier_url: receiptUrls?.supplier ?? null,
        receipt_bank_url: receiptUrls?.bank ?? null,
        tax_invoice_url: receiptUrls?.tax ?? null,
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
              {currency === 'THB' ? 'Rate (1.00)' : `Rate -> THB`}
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
              {computedTHB.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="mt-0.5 text-[10px] text-slate-500">
              {amountOriginal} {currency} x {exchangeRate}
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

        {/* Receipt URLs indicator */}
        {(receiptUrls?.supplier || receiptUrls?.bank || receiptUrls?.tax) && (
          <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
            Receipts attached from dropzone:{' '}
            {[
              receiptUrls?.supplier && 'Supplier',
              receiptUrls?.bank && 'Bank',
              receiptUrls?.tax && 'Tax',
            ]
              .filter(Boolean)
              .join(', ')}
          </div>
        )}

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
