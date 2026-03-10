import { useState, useMemo } from 'react'
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import { CURRENCY_OPTIONS, PAYMENT_METHODS, formatTHB } from './helpers'
import type {
  ParsedReceipt,
  FoodItem,
  CapexItem,
  OpexItem,
  ReceiptUrls,
  ApprovePayload,
} from '../../types/receipt'

/* ────────────────────────── Types ────────────────────────── */

export interface StagingAreaProps {
  receipt: ParsedReceipt
  receiptUrls: ReceiptUrls
  nomenclatureList: { id: string; name: string; product_code: string }[]
  suppliersList: { id: string; name: string }[]
  categories: { code: number; name: string }[]
  subCategories: { sub_code: number; category_code: number; name: string }[]
  onApprove: (payload: ApprovePayload) => Promise<void>
  onCancel: () => void
}

/* ────────────────────────── Helpers ────────────────────────── */

function fuzzyMatchSupplier(
  aiName: string,
  suppliers: { id: string; name: string }[],
): string {
  if (!aiName) return ''
  const lower = aiName.toLowerCase()
  // Exact match first
  const exact = suppliers.find((s) => s.name.toLowerCase() === lower)
  if (exact) return exact.id
  // Partial match
  const partial = suppliers.find(
    (s) =>
      s.name.toLowerCase().includes(lower) ||
      lower.includes(s.name.toLowerCase()),
  )
  return partial?.id ?? ''
}

const inputCls =
  'h-8 w-full rounded-md border border-slate-700 bg-slate-800 px-2 text-xs text-slate-100 outline-none focus:border-emerald-500'
const selectCls =
  'h-8 w-full rounded-md border border-slate-700 bg-slate-800 px-1 text-xs text-slate-100 outline-none focus:border-emerald-500'

/* ────────────────────────── Component ────────────────────────── */

export function StagingArea({
  receipt,
  receiptUrls,
  nomenclatureList,
  suppliersList,
  categories,
  subCategories,
  onApprove,
  onCancel,
}: StagingAreaProps) {
  // ── Header state (editable) ──
  const [supplierId, setSupplierId] = useState(
    () => fuzzyMatchSupplier(receipt.supplier_name, suppliersList),
  )
  const [txDate, setTxDate] = useState(
    receipt.transaction_date || new Date().toISOString().split('T')[0],
  )
  const [invoiceNumber, setInvoiceNumber] = useState(
    receipt.invoice_number ?? '',
  )
  const [totalAmount, setTotalAmount] = useState(receipt.total_amount)
  const [currency, setCurrency] = useState(receipt.currency || 'THB')
  const [exchangeRate, setExchangeRate] = useState(currency === 'THB' ? 1 : 1)
  const [flowType, setFlowType] = useState<'OpEx' | 'CapEx'>('OpEx')
  const [categoryCode, setCategoryCode] = useState<number | ''>('')
  const [subCategoryCode, setSubCategoryCode] = useState<number | ''>('')
  const [details, setDetails] = useState(
    `Receipt from ${receipt.supplier_name || 'supplier'}`,
  )
  const [paidBy, setPaidBy] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')

  // ── Line items state (editable) ──
  const [foodItems, setFoodItems] = useState<FoodItem[]>(
    () => receipt.food_items.map((f) => ({ ...f })),
  )
  const [capexItems, setCapexItems] = useState<CapexItem[]>(
    () => receipt.capex_items.map((c) => ({ ...c })),
  )
  const [opexItems, setOpexItems] = useState<OpexItem[]>(
    () => receipt.opex_items.map((o) => ({ ...o })),
  )

  // ── Collapse state ──
  const [foodOpen, setFoodOpen] = useState(foodItems.length > 0)
  const [capexOpen, setCapexOpen] = useState(capexItems.length > 0)
  const [opexOpen, setOpexOpen] = useState(opexItems.length > 0)

  // ── UI state ──
  const [isApproving, setIsApproving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ── Sub-category filtering ──
  const filteredSubCats = useMemo(
    () =>
      categoryCode !== ''
        ? subCategories.filter((sc) => sc.category_code === categoryCode)
        : [],
    [categoryCode, subCategories],
  )

  // ── Computed totals ──
  const foodTotal = foodItems.reduce((s, f) => s + (f.total_price || 0), 0)
  const capexTotal = capexItems.reduce((s, c) => s + (c.total_price || 0), 0)
  const opexTotal = opexItems.reduce((s, o) => s + (o.total_price || 0), 0)
  const computedTotal = foodTotal + capexTotal + opexTotal

  const mismatch =
    totalAmount > 0 && Math.abs(computedTotal - totalAmount) / totalAmount > 0.01

  // ── Validation: all food items must have nomenclature_id ──
  const allFoodMapped =
    foodItems.length === 0 ||
    foodItems.every((f) => f.nomenclature_id && f.nomenclature_id !== '')

  const canApprove = totalAmount > 0 && allFoodMapped && !isApproving

  // ── Handlers ──
  const updateFood = (i: number, patch: Partial<FoodItem>) =>
    setFoodItems((prev) => prev.map((f, idx) => (idx === i ? { ...f, ...patch } : f)))
  const updateCapex = (i: number, patch: Partial<CapexItem>) =>
    setCapexItems((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)))
  const updateOpex = (i: number, patch: Partial<OpexItem>) =>
    setOpexItems((prev) => prev.map((o, idx) => (idx === i ? { ...o, ...patch } : o)))

  const removeFood = (i: number) => setFoodItems((prev) => prev.filter((_, idx) => idx !== i))
  const removeCapex = (i: number) => setCapexItems((prev) => prev.filter((_, idx) => idx !== i))
  const removeOpex = (i: number) => setOpexItems((prev) => prev.filter((_, idx) => idx !== i))

  const addFood = () =>
    setFoodItems((prev) => [
      ...prev,
      { name: '', quantity: 1, unit: 'kg', unit_price: 0, total_price: 0 },
    ])
  const addCapex = () =>
    setCapexItems((prev) => [
      ...prev,
      { name: '', quantity: 1, unit_price: 0, total_price: 0 },
    ])
  const addOpex = () =>
    setOpexItems((prev) => [
      ...prev,
      { description: '', quantity: 1, unit: 'pcs', unit_price: 0, total_price: 0 },
    ])

  const handleApprove = async () => {
    setIsApproving(true)
    setError(null)

    try {
      const payload: ApprovePayload = {
        transaction_date: txDate,
        flow_type: flowType,
        category_code: categoryCode !== '' ? categoryCode : null,
        sub_category_code: subCategoryCode !== '' ? subCategoryCode : null,
        supplier_id: supplierId || null,
        details: details.trim(),
        comments: null,
        invoice_number: invoiceNumber.trim() || null,
        amount_original: totalAmount,
        currency,
        exchange_rate: currency === 'THB' ? 1 : exchangeRate,
        paid_by: paidBy.trim(),
        payment_method: paymentMethod,
        status: 'paid',
        has_tax_invoice: false,
        receipt_supplier_url: receiptUrls.supplier ?? null,
        receipt_bank_url: receiptUrls.bank ?? null,
        tax_invoice_url: receiptUrls.tax ?? null,
        food_items: foodItems,
        capex_items: capexItems,
        opex_items: opexItems,
      }

      await onApprove(payload)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsApproving(false)
    }
  }

  return (
    <section className="rounded-xl border border-indigo-500/40 bg-slate-900/50 shadow-sm">
      {/* ── Header ── */}
      <header className="border-b border-slate-800 px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-indigo-400" />
          <div>
            <h2 className="text-sm font-semibold text-slate-100">
              AI Receipt Preview
            </h2>
            <p className="text-xs text-slate-500">
              Review and edit parsed data before saving
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="ml-auto rounded-md p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-300"
            title="Cancel & return to manual form"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="space-y-4 px-4 py-4">
        {/* ── Error ── */}
        {error && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}

        {/* ── Supplier + Date + Invoice ── */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="mb-1 block text-xs text-slate-400">Supplier</label>
            <select
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className={selectCls}
            >
              <option value="">Select supplier...</option>
              {suppliersList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            {receipt.supplier_name && !supplierId && (
              <p className="mt-0.5 text-[10px] text-amber-400">
                AI detected: &quot;{receipt.supplier_name}&quot;
              </p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Date</label>
            <input
              type="date"
              value={txDate}
              onChange={(e) => setTxDate(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Invoice #</label>
            <input
              type="text"
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              placeholder="INV-..."
              className={inputCls}
            />
          </div>
        </div>

        {/* ── Amount + Currency + Exchange Rate ── */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="mb-1 block text-xs text-slate-400">Total Amount</label>
            <input
              type="number"
              step="0.01"
              value={totalAmount}
              onChange={(e) => setTotalAmount(Number(e.target.value))}
              className={inputCls}
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
              className={selectCls}
            >
              {CURRENCY_OPTIONS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">
              {currency === 'THB' ? 'Rate (1.00)' : 'Rate → THB'}
            </label>
            <input
              type="number"
              step="0.0001"
              value={exchangeRate}
              onChange={(e) => setExchangeRate(Number(e.target.value))}
              disabled={currency === 'THB'}
              className={`${inputCls} disabled:opacity-40`}
            />
          </div>
        </div>

        {/* ── Flow Type + Category + Sub-category ── */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="mb-1 block text-xs text-slate-400">Type</label>
            <div className="flex gap-2">
              {(['OpEx', 'CapEx'] as const).map((ft) => (
                <button
                  key={ft}
                  type="button"
                  onClick={() => setFlowType(ft)}
                  className={`h-8 flex-1 rounded-md border text-xs font-medium transition ${
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
          <div>
            <label className="mb-1 block text-xs text-slate-400">Category</label>
            <select
              value={categoryCode}
              onChange={(e) => {
                const v = e.target.value === '' ? '' : Number(e.target.value)
                setCategoryCode(v as number | '')
                setSubCategoryCode('')
              }}
              className={selectCls}
            >
              <option value="">Select...</option>
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
              onChange={(e) =>
                setSubCategoryCode(e.target.value === '' ? '' : Number(e.target.value))
              }
              disabled={filteredSubCats.length === 0}
              className={`${selectCls} disabled:opacity-40`}
            >
              <option value="">
                {filteredSubCats.length === 0 ? 'Pick category' : 'Select...'}
              </option>
              {filteredSubCats.map((sc) => (
                <option key={sc.sub_code} value={sc.sub_code}>
                  {sc.sub_code} — {sc.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* ── Details + Payment ── */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="mb-1 block text-xs text-slate-400">Details</label>
            <input
              type="text"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Paid by</label>
            <input
              type="text"
              value={paidBy}
              onChange={(e) => setPaidBy(e.target.value)}
              placeholder="Name..."
              className={inputCls}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Payment</label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className={selectCls}
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* ═══ Food Items (Spoke 1) ═══ */}
        <ItemSection
          title="Food Items"
          count={foodItems.length}
          total={foodTotal}
          open={foodOpen}
          onToggle={() => setFoodOpen(!foodOpen)}
          color="emerald"
        >
          {foodItems.map((item, i) => (
            <tr key={i} className="border-b border-slate-800/50">
              <td className="px-1 py-1">
                <input
                  type="text"
                  value={item.name}
                  onChange={(e) => updateFood(i, { name: e.target.value })}
                  className={inputCls}
                />
              </td>
              <td className="px-1 py-1 w-16">
                <input
                  type="number"
                  step="0.01"
                  value={item.quantity}
                  onChange={(e) => updateFood(i, { quantity: Number(e.target.value) })}
                  className={inputCls}
                />
              </td>
              <td className="px-1 py-1 w-16">
                <input
                  type="text"
                  value={item.unit}
                  onChange={(e) => updateFood(i, { unit: e.target.value })}
                  className={inputCls}
                />
              </td>
              <td className="px-1 py-1 w-20">
                <input
                  type="number"
                  step="0.01"
                  value={item.unit_price}
                  onChange={(e) => updateFood(i, { unit_price: Number(e.target.value) })}
                  className={inputCls}
                />
              </td>
              <td className="px-1 py-1 w-20">
                <input
                  type="number"
                  step="0.01"
                  value={item.total_price}
                  onChange={(e) => updateFood(i, { total_price: Number(e.target.value) })}
                  className={inputCls}
                />
              </td>
              <td className="px-1 py-1 w-36">
                <select
                  value={item.nomenclature_id || ''}
                  onChange={(e) => updateFood(i, { nomenclature_id: e.target.value })}
                  className={`${selectCls} ${!item.nomenclature_id ? 'border-amber-500/60' : ''}`}
                >
                  <option value="">Map to item...</option>
                  {nomenclatureList.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.product_code} — {n.name}
                    </option>
                  ))}
                </select>
              </td>
              <td className="px-1 py-1 w-8">
                <button
                  type="button"
                  onClick={() => removeFood(i)}
                  className="rounded p-1 text-slate-500 hover:text-red-400"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </td>
            </tr>
          ))}
          <tr>
            <td colSpan={7} className="px-1 py-1">
              <button
                type="button"
                onClick={addFood}
                className="flex items-center gap-1 text-[10px] text-emerald-400 hover:text-emerald-300"
              >
                <Plus className="h-3 w-3" /> Add food item
              </button>
            </td>
          </tr>
        </ItemSection>

        {/* ═══ CapEx Items (Spoke 2) ═══ */}
        <ItemSection
          title="CapEx Items"
          count={capexItems.length}
          total={capexTotal}
          open={capexOpen}
          onToggle={() => setCapexOpen(!capexOpen)}
          color="amber"
        >
          {capexItems.map((item, i) => (
            <tr key={i} className="border-b border-slate-800/50">
              <td className="px-1 py-1">
                <input
                  type="text"
                  value={item.name}
                  onChange={(e) => updateCapex(i, { name: e.target.value })}
                  className={inputCls}
                />
              </td>
              <td className="px-1 py-1 w-16">
                <input
                  type="number"
                  step="1"
                  value={item.quantity}
                  onChange={(e) => updateCapex(i, { quantity: Number(e.target.value) })}
                  className={inputCls}
                />
              </td>
              <td className="px-1 py-1 w-20">
                <input
                  type="number"
                  step="0.01"
                  value={item.unit_price}
                  onChange={(e) => updateCapex(i, { unit_price: Number(e.target.value) })}
                  className={inputCls}
                />
              </td>
              <td className="px-1 py-1 w-20">
                <input
                  type="number"
                  step="0.01"
                  value={item.total_price}
                  onChange={(e) => updateCapex(i, { total_price: Number(e.target.value) })}
                  className={inputCls}
                />
              </td>
              <td className="px-1 py-1 w-8">
                <button
                  type="button"
                  onClick={() => removeCapex(i)}
                  className="rounded p-1 text-slate-500 hover:text-red-400"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </td>
            </tr>
          ))}
          <tr>
            <td colSpan={5} className="px-1 py-1">
              <button
                type="button"
                onClick={addCapex}
                className="flex items-center gap-1 text-[10px] text-amber-400 hover:text-amber-300"
              >
                <Plus className="h-3 w-3" /> Add capex item
              </button>
            </td>
          </tr>
        </ItemSection>

        {/* ═══ OpEx Items (Spoke 3) ═══ */}
        <ItemSection
          title="OpEx Items"
          count={opexItems.length}
          total={opexTotal}
          open={opexOpen}
          onToggle={() => setOpexOpen(!opexOpen)}
          color="cyan"
        >
          {opexItems.map((item, i) => (
            <tr key={i} className="border-b border-slate-800/50">
              <td className="px-1 py-1">
                <input
                  type="text"
                  value={item.description}
                  onChange={(e) => updateOpex(i, { description: e.target.value })}
                  className={inputCls}
                />
              </td>
              <td className="px-1 py-1 w-16">
                <input
                  type="number"
                  step="0.01"
                  value={item.quantity}
                  onChange={(e) => updateOpex(i, { quantity: Number(e.target.value) })}
                  className={inputCls}
                />
              </td>
              <td className="px-1 py-1 w-16">
                <input
                  type="text"
                  value={item.unit}
                  onChange={(e) => updateOpex(i, { unit: e.target.value })}
                  className={inputCls}
                />
              </td>
              <td className="px-1 py-1 w-20">
                <input
                  type="number"
                  step="0.01"
                  value={item.unit_price}
                  onChange={(e) => updateOpex(i, { unit_price: Number(e.target.value) })}
                  className={inputCls}
                />
              </td>
              <td className="px-1 py-1 w-20">
                <input
                  type="number"
                  step="0.01"
                  value={item.total_price}
                  onChange={(e) => updateOpex(i, { total_price: Number(e.target.value) })}
                  className={inputCls}
                />
              </td>
              <td className="px-1 py-1 w-8">
                <button
                  type="button"
                  onClick={() => removeOpex(i)}
                  className="rounded p-1 text-slate-500 hover:text-red-400"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </td>
            </tr>
          ))}
          <tr>
            <td colSpan={6} className="px-1 py-1">
              <button
                type="button"
                onClick={addOpex}
                className="flex items-center gap-1 text-[10px] text-cyan-400 hover:text-cyan-300"
              >
                <Plus className="h-3 w-3" /> Add opex item
              </button>
            </td>
          </tr>
        </ItemSection>

        {/* ── Totals & Warnings ── */}
        <div className="rounded-lg border border-slate-700/50 bg-slate-800/50 px-4 py-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">Computed total</span>
            <span className="font-semibold text-slate-100">
              {formatTHB(computedTotal)} {currency}
            </span>
          </div>
          {mismatch && (
            <div className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] text-amber-300">
              Computed total ({formatTHB(computedTotal)}) differs from AI total (
              {formatTHB(totalAmount)}) by{' '}
              {Math.abs(((computedTotal - totalAmount) / totalAmount) * 100).toFixed(1)}%
            </div>
          )}
          {!allFoodMapped && foodItems.length > 0 && (
            <div className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] text-amber-300">
              All food items must be mapped to a nomenclature before approval
            </div>
          )}
        </div>

        {/* ── Action Buttons ── */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="h-9 flex-1 rounded-md border border-slate-700 bg-slate-800 text-xs font-medium text-slate-400 hover:bg-slate-700 hover:text-slate-200"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApprove}
            disabled={!canApprove}
            className="inline-flex h-9 flex-1 items-center justify-center rounded-md border border-indigo-500/60 bg-indigo-500/15 text-xs font-medium text-indigo-200 hover:bg-indigo-500/25 disabled:opacity-50"
          >
            {isApproving ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
            )}
            Approve &amp; Save
          </button>
        </div>
      </div>
    </section>
  )
}

/* ────────────────────────── Sub-component: Section ────────────────────────── */

function ItemSection({
  title,
  count,
  total,
  open,
  onToggle,
  color,
  children,
}: {
  title: string
  count: number
  total: number
  open: boolean
  onToggle: () => void
  color: 'emerald' | 'amber' | 'cyan'
  children: React.ReactNode
}) {
  const badgeColor = {
    emerald: 'bg-emerald-500/20 text-emerald-300',
    amber: 'bg-amber-500/20 text-amber-300',
    cyan: 'bg-cyan-500/20 text-cyan-300',
  }[color]

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/30">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-slate-500" />
        )}
        <span className="text-xs font-medium text-slate-200">{title}</span>
        <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${badgeColor}`}>
          {count}
        </span>
        <span className="ml-auto text-[10px] text-slate-500">
          {formatTHB(total)}
        </span>
      </button>

      {open && (
        <div className="overflow-x-auto border-t border-slate-800">
          <table className="w-full text-xs">
            <tbody>{children}</tbody>
          </table>
        </div>
      )}
    </div>
  )
}
