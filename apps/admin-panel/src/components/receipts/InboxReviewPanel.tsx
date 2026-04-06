import { useEffect, useState } from 'react'
import { Check, X, Loader2, FolderOpen, Pencil, Plus, Trash2, AlertTriangle } from 'lucide-react'
import type { InboxRow } from '../../hooks/useReceiptInbox'
import { supabase } from '../../lib/supabase'

/* ────────────────────────── Types ────────────────────────── */

interface FoodItem {
  name: string
  original_name?: string
  quantity: number
  unit: string
  unit_price: number
  total_price: number
  nomenclature_id?: string | null
  barcode?: string | null
  supplier_sku?: string | null
  brand?: string | null
  package_weight?: string | null
}

interface CapexItem {
  name: string
  quantity: number
  unit_price: number
  total_price: number
}

interface OpexItem {
  description: string
  quantity: number
  unit: string
  unit_price: number
  total_price: number
}

/* ────────────────────────── Props ────────────────────────── */

interface Props {
  row: InboxRow
  onApprove: (inboxId: string, payload: Record<string, unknown>) => Promise<{ ok: boolean; error?: string; expense_id?: string }>
  onSkip: (inboxId: string) => Promise<string | null>
  onReopen: (inboxId: string) => Promise<string | null>
}

/* ────────────────────────── Helpers ────────────────────────── */

function fmt(n: number | undefined | null): string {
  if (n == null) return '\u2014'
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function flowBadge(ft: string) {
  const map: Record<string, string> = {
    COGS: 'bg-emerald-500/15 text-emerald-400',
    OpEx: 'bg-amber-500/15 text-amber-400',
    CapEx: 'bg-sky-500/15 text-sky-400',
  }
  return map[ft] || 'bg-slate-500/15 text-slate-400'
}

const inputCls = 'w-full rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-xs text-slate-200 outline-none focus:border-indigo-500'
const numInputCls = `${inputCls} text-right`

function emptyFood(): FoodItem {
  return { name: '', quantity: 1, unit: 'pcs', unit_price: 0, total_price: 0 }
}
function emptyCapex(): CapexItem {
  return { name: '', quantity: 1, unit_price: 0, total_price: 0 }
}
function emptyOpex(): OpexItem {
  return { description: '', quantity: 1, unit: 'pcs', unit_price: 0, total_price: 0 }
}

/* ────────────────────────── Component ────────────────────────── */

export function InboxReviewPanel({ row, onApprove, onSkip, onReopen }: Props) {
  const [isApproving, setIsApproving] = useState(false)
  const [isSkipping, setIsSkipping] = useState(false)
  const [isReopening, setIsReopening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [nomMap, setNomMap] = useState<Record<string, { code: string; name: string }>>({})
  const [showConfirm, setShowConfirm] = useState(false)
  const [validationErrors, setValidationErrors] = useState<string[]>([])

  const p = row.parsed_payload as Record<string, any>
  if (!p) return null

  // If expense_id exists, this receipt was already approved regardless of status
  const isReadOnly = row.status === 'processed' || !!row.expense_id
  const isSkippedStatus = row.status === 'skipped' && !row.expense_id

  // ── Editable header state ──
  const [supplierName, setSupplierName] = useState<string>(p.supplier_name || '')
  const [transactionDate, setTransactionDate] = useState<string>(p.transaction_date || '')
  const [receiptTotal, setReceiptTotal] = useState<number>(p.amount_original ?? 0)
  const [invoiceNumber, setInvoiceNumber] = useState<string>(p.invoice_number || '')
  const [editingHeader, setEditingHeader] = useState(false)

  // ── Editable item state ──
  const [foodItems, setFoodItems] = useState<FoodItem[]>(() => (p.food_items ?? []) as FoodItem[])
  const [capexItems, setCapexItems] = useState<CapexItem[]>(() => (p.capex_items ?? []) as CapexItem[])
  const [opexItems, setOpexItems] = useState<OpexItem[]>(() => (p.opex_items ?? []) as OpexItem[])

  // ── Checkboxes ──
  const [foodChecked, setFoodChecked] = useState<Set<number>>(() => new Set())
  const [capexChecked, setCapexChecked] = useState<Set<number>>(() => new Set())
  const [opexChecked, setOpexChecked] = useState<Set<number>>(() => new Set())

  // ── Edit mode per row ──
  const [editingRows, setEditingRows] = useState<Set<string>>(() => new Set())

  const toggleEdit = (key: string) => {
    setEditingRows((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }
  const isEditing = (key: string) => editingRows.has(key)

  // ── Computed totals ──
  const foodTotal = foodItems.reduce((s, it) => s + (it.total_price || 0), 0)
  const capexTotal = capexItems.reduce((s, it) => s + (it.total_price || 0), 0)
  const opexTotal = opexItems.reduce((s, it) => s + (it.total_price || 0), 0)
  const calculatedTotal = foodTotal + capexTotal + opexTotal
  const discountAmount = Math.abs(p.discount_total || 0)
  // Receipt total = items - discount, so compare accordingly
  const expectedReceiptTotal = calculatedTotal - discountAmount
  const totalMismatch = Math.abs(expectedReceiptTotal - receiptTotal) > 0.5
  const totalItems = foodItems.length + capexItems.length + opexItems.length
  const totalChecked = foodChecked.size + capexChecked.size + opexChecked.size

  // ── Checkbox helpers ──
  function toggleCheck(_set: Set<number>, setFn: React.Dispatch<React.SetStateAction<Set<number>>>, idx: number) {
    setFn((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  function toggleAll(set: Set<number>, setFn: React.Dispatch<React.SetStateAction<Set<number>>>, total: number) {
    if (set.size === total) setFn(new Set())
    else setFn(new Set(Array.from({ length: total }, (_, i) => i)))
  }

  // ── Item field updates ──
  function updateFood(idx: number, field: keyof FoodItem, value: string | number) {
    setFoodItems((prev) => {
      const next = [...prev]
      const item = { ...next[idx], [field]: value }
      if (field === 'quantity' || field === 'unit_price') {
        item.total_price = Number(item.quantity) * Number(item.unit_price)
      }
      next[idx] = item
      return next
    })
  }

  function removeFood(idx: number) {
    setFoodItems((prev) => prev.filter((_, i) => i !== idx))
    setFoodChecked((prev) => {
      const next = new Set<number>()
      prev.forEach((v) => { if (v < idx) next.add(v); else if (v > idx) next.add(v - 1) })
      return next
    })
    setEditingRows((prev) => { const next = new Set(prev); next.delete(`food:${idx}`); return next })
  }

  function updateCapex(idx: number, field: keyof CapexItem, value: string | number) {
    setCapexItems((prev) => {
      const next = [...prev]
      const item = { ...next[idx], [field]: value }
      if (field === 'quantity' || field === 'unit_price') {
        item.total_price = Number(item.quantity) * Number(item.unit_price)
      }
      next[idx] = item
      return next
    })
  }

  function removeCapex(idx: number) {
    setCapexItems((prev) => prev.filter((_, i) => i !== idx))
    setCapexChecked((prev) => {
      const next = new Set<number>()
      prev.forEach((v) => { if (v < idx) next.add(v); else if (v > idx) next.add(v - 1) })
      return next
    })
    setEditingRows((prev) => { const next = new Set(prev); next.delete(`capex:${idx}`); return next })
  }

  function updateOpex(idx: number, field: keyof OpexItem, value: string | number) {
    setOpexItems((prev) => {
      const next = [...prev]
      const item = { ...next[idx], [field]: value }
      if (field === 'quantity' || field === 'unit_price') {
        item.total_price = Number(item.quantity) * Number(item.unit_price)
      }
      next[idx] = item
      return next
    })
  }

  function removeOpex(idx: number) {
    setOpexItems((prev) => prev.filter((_, i) => i !== idx))
    setOpexChecked((prev) => {
      const next = new Set<number>()
      prev.forEach((v) => { if (v < idx) next.add(v); else if (v > idx) next.add(v - 1) })
      return next
    })
    setEditingRows((prev) => { const next = new Set(prev); next.delete(`opex:${idx}`); return next })
  }

  // ── Add row helpers ──
  function addFood() {
    setFoodItems((prev) => [...prev, emptyFood()])
    setEditingRows((prev) => new Set(prev).add(`food:${foodItems.length}`))
  }
  function addCapex() {
    setCapexItems((prev) => [...prev, emptyCapex()])
    setEditingRows((prev) => new Set(prev).add(`capex:${capexItems.length}`))
  }
  function addOpex() {
    setOpexItems((prev) => [...prev, emptyOpex()])
    setEditingRows((prev) => new Set(prev).add(`opex:${opexItems.length}`))
  }

  // Fetch nomenclature names for matched items
  useEffect(() => {
    const ids = foodItems
      .map((it) => it.nomenclature_id)
      .filter((id): id is string => !!id)
    if (ids.length === 0) return

    const unique = [...new Set(ids)]
    supabase
      .from('nomenclature')
      .select('id,product_code,name')
      .in('id', unique)
      .then(({ data }) => {
        if (!data) return
        const map: Record<string, { code: string; name: string }> = {}
        for (const r of data) {
          map[r.id] = { code: r.product_code, name: r.name }
        }
        setNomMap(map)
      })
  }, [row.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const validate = (): string[] => {
    const errs: string[] = []
    if (!supplierName.trim()) errs.push('Не указан поставщик')
    if (!transactionDate.trim()) errs.push('Не указана дата')
    if (totalItems === 0) errs.push('Нет ни одной позиции (food/capex/opex)')
    if (receiptTotal <= 0) errs.push('Сумма чека должна быть > 0')
    // Check for empty item names
    foodItems.forEach((it, i) => { if (!it.name.trim()) errs.push(`Food #${i + 1}: пустое название`) })
    capexItems.forEach((it, i) => { if (!it.name.trim()) errs.push(`CapEx #${i + 1}: пустое название`) })
    opexItems.forEach((it, i) => { if (!it.description.trim()) errs.push(`OpEx #${i + 1}: пустое описание`) })
    return errs
  }

  const handleApproveClick = () => {
    setError(null)
    const errs = validate()
    if (errs.length > 0) {
      setValidationErrors(errs)
      return
    }
    setValidationErrors([])
    setShowConfirm(true)
  }

  const handleApproveConfirm = async () => {
    setShowConfirm(false)
    setIsApproving(true)
    setError(null)
    const photos = row.photo_urls || []
    const editedPayload = {
      ...p,
      supplier_name: supplierName,
      transaction_date: transactionDate,
      amount_original: receiptTotal,
      invoice_number: invoiceNumber || null,
      food_items: foodItems,
      capex_items: capexItems,
      opex_items: opexItems,
      receipt_supplier_url: p.receipt_supplier_url || photos[0] || null,
      receipt_bank_url: p.receipt_bank_url || (photos[1] && photos[1] !== photos[0] ? photos[1] : null),
      tax_invoice_url: p.tax_invoice_url || (p.has_tax_invoice && photos.length > 1 ? photos[1] : null),
    }
    const res = await onApprove(row.id, editedPayload)
    setIsApproving(false)
    if (!res.ok) {
      const msg = res.error || 'Approval failed'
      if (msg.includes('duplicate key') && msg.includes('invoice')) {
        setError(`Чек с номером "${invoiceNumber}" уже записан в систему. Дубликаты не допускаются.`)
      } else {
        setError(msg)
      }
    } else {
      setResult(`Записано! expense_id: ${res.expense_id}`)
    }
  }

  const handleSkip = async () => {
    setIsSkipping(true)
    const err = await onSkip(row.id)
    setIsSkipping(false)
    if (err) setError(err)
  }

  const handleReopen = async () => {
    setIsReopening(true)
    const err = await onReopen(row.id)
    setIsReopening(false)
    if (err) setError(err)
  }

  /* ────────── Checkbox column header ────────── */
  const checkboxTh = (checked: Set<number>, setFn: React.Dispatch<React.SetStateAction<Set<number>>>, total: number) => (
    <th className="w-10 px-2 py-1.5 text-center">
      <input
        type="checkbox"
        checked={total > 0 && checked.size === total}
        ref={(el) => { if (el) el.indeterminate = checked.size > 0 && checked.size < total }}
        onChange={() => toggleAll(checked, setFn, total)}
        className="h-3.5 w-3.5 cursor-pointer rounded border-slate-600 bg-slate-800 accent-indigo-500"
      />
    </th>
  )

  return (
    <div className="space-y-4 px-4 py-4">
      {/* ── Header: receipt summary + images ── */}
      <div className="flex gap-4">
        {/* Images */}
        <div className="flex flex-shrink-0 gap-2">
          {row.photo_urls.map((url, i) => (
            <a
              key={i}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="block h-28 w-20 overflow-hidden rounded-lg border border-slate-700 bg-slate-800 hover:border-indigo-500/50"
            >
              <img src={url} alt={`page ${i + 1}`} className="h-full w-full object-cover" />
            </a>
          ))}
        </div>

        {/* Summary */}
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            {editingHeader ? (
              <input
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                className={`${inputCls} max-w-xs text-sm font-semibold`}
                placeholder="Поставщик"
              />
            ) : (
              <h3 className="text-sm font-semibold text-slate-100">
                {supplierName || 'Unknown'}
              </h3>
            )}
            <span className={`rounded-full px-2 py-0.5 text-[9px] font-medium ${flowBadge(p.flow_type)}`}>
              {p.flow_type}
            </span>
            {!isReadOnly && (
              <button
                type="button"
                onClick={() => setEditingHeader(!editingHeader)}
                className={`ml-1 rounded p-0.5 hover:bg-slate-700 ${editingHeader ? 'text-indigo-400' : 'text-slate-600'}`}
                title={editingHeader ? 'Готово' : 'Редактировать шапку'}
              >
                {editingHeader ? <Check className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
            <div>
              <span className="text-slate-500">Дата: </span>
              {editingHeader ? (
                <input value={transactionDate} onChange={(e) => setTransactionDate(e.target.value)} className={`${inputCls} inline w-32`} />
              ) : (
                <span className="text-slate-200">{transactionDate}</span>
              )}
            </div>
            <div>
              <span className="text-slate-500">Номер: </span>
              {editingHeader ? (
                <input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} className={`${inputCls} inline w-32`} placeholder="—" />
              ) : (
                <span className="text-slate-200">{invoiceNumber || '\u2014'}</span>
              )}
            </div>
            <div>
              <span className="text-slate-500">Оплата: </span>
              <span className="text-slate-200">{p.payment_method} ({p.paid_by})</span>
            </div>
            <div>
              <span className="text-slate-500">Tax invoice: </span>
              <span className="text-slate-200">{p.has_tax_invoice ? 'Yes' : 'No'}</span>
            </div>
          </div>

          {/* Totals bar */}
          <div className="flex items-center gap-4 rounded-lg bg-slate-800/60 px-3 py-2 text-xs">
            <div>
              <span className="text-slate-500">Чек: </span>
              {editingHeader ? (
                <input
                  type="number"
                  step="any"
                  value={receiptTotal}
                  onChange={(e) => setReceiptTotal(Number(e.target.value))}
                  className={`${numInputCls} inline w-24`}
                />
              ) : (
                <span className="text-slate-200">{'\u0E3F'}{fmt(receiptTotal)}</span>
              )}
            </div>
            {discountAmount > 0 && (
              <div>
                <span className="text-slate-500">Скидка: </span>
                <span className="text-rose-400">{fmt(p.discount_total)}</span>
              </div>
            )}
            {p.vat_amount ? (
              <div>
                <span className="text-slate-500">VAT: </span>
                <span className="text-slate-300">{fmt(p.vat_amount)}</span>
              </div>
            ) : null}
            <div className="ml-auto">
              <span className="text-slate-500">TOTAL (позиции): </span>
              <span className={`text-base font-semibold ${totalMismatch ? 'text-amber-400' : 'text-slate-100'}`}>
                {'\u0E3F'}{fmt(calculatedTotal)}
              </span>
            </div>
          </div>

          {/* Mismatch warning */}
          {totalMismatch && (
            <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-300">
              <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
              Сумма позиций ({'\u0E3F'}{fmt(calculatedTotal)}) − скидка ({'\u0E3F'}{fmt(discountAmount)}) = {'\u0E3F'}{fmt(expectedReceiptTotal)} ≠ чек ({'\u0E3F'}{fmt(receiptTotal)}).
              Разница: {'\u0E3F'}{fmt(Math.abs(expectedReceiptTotal - receiptTotal))}
            </div>
          )}
        </div>
      </div>

      {/* ── Food items ── */}
      {foodItems.length > 0 && (
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <h4 className="text-[10px] font-medium uppercase tracking-wide text-emerald-400">
              Food Items ({foodItems.length})
              {foodChecked.size > 0 && (
                <span className="ml-2 text-emerald-300/60">— {foodChecked.size}/{foodItems.length} сверено</span>
              )}
            </h4>
          </div>
          <div className="max-h-[28rem] overflow-y-auto rounded-lg border border-slate-800">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-900 text-[9px] uppercase tracking-wide text-slate-500">
                <tr>
                  {checkboxTh(foodChecked, setFoodChecked, foodItems.length)}
                  <th className="w-8 px-2 py-1.5 text-left">#</th>
                  <th className="px-2 py-1.5 text-left">Товар</th>
                  <th className="px-2 py-1.5 text-left">Barcode</th>
                  <th className="w-16 px-2 py-1.5 text-right">Qty</th>
                  <th className="w-14 px-2 py-1.5 text-left">Unit</th>
                  <th className="w-20 px-2 py-1.5 text-right">Цена</th>
                  <th className="w-20 px-2 py-1.5 text-right">Итого</th>
                  <th className="px-2 py-1.5 text-left">Номенклатура</th>
                  {!isReadOnly && <th className="w-16 px-1 py-1.5" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {foodItems.map((item, i) => {
                  const nom = item.nomenclature_id ? nomMap[item.nomenclature_id] : null
                  const key = `food:${i}`
                  const editing = isEditing(key)
                  const checked = foodChecked.has(i)
                  return (
                    <tr key={i} className={`hover:bg-slate-800/30 ${checked ? 'bg-emerald-500/5' : ''}`}>
                      <td className="w-10 px-2 py-1.5 text-center">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleCheck(foodChecked, setFoodChecked, i)}
                          className="h-3.5 w-3.5 cursor-pointer rounded border-slate-600 bg-slate-800 accent-emerald-500"
                        />
                      </td>
                      <td className="px-2 py-1.5 text-slate-500">{i + 1}</td>
                      <td className="px-2 py-1.5">
                        {editing ? (
                          <input value={item.name} onChange={(e) => updateFood(i, 'name', e.target.value)} className={inputCls} />
                        ) : (
                          <>
                            <div className="text-slate-200">{item.name}</div>
                            {item.original_name && item.original_name !== item.name && (
                              <div className="text-[10px] text-slate-500">{item.original_name}</div>
                            )}
                            {item.brand && (
                              <span className="text-[10px] text-slate-600">{item.brand} {item.package_weight || ''}</span>
                            )}
                          </>
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        {editing ? (
                          <input value={item.barcode || ''} onChange={(e) => updateFood(i, 'barcode', e.target.value)} className={`${inputCls} font-mono text-[10px]`} placeholder="barcode" />
                        ) : (
                          <span className="font-mono text-[10px] text-slate-500">{item.barcode || item.supplier_sku || '\u2014'}</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        {editing ? (
                          <input type="number" step="any" value={item.quantity} onChange={(e) => updateFood(i, 'quantity', Number(e.target.value))} className={`${numInputCls} w-16`} />
                        ) : (
                          <span className="text-slate-300">{item.quantity}</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        {editing ? (
                          <input value={item.unit} onChange={(e) => updateFood(i, 'unit', e.target.value)} className={`${inputCls} w-12`} />
                        ) : (
                          <span className="text-slate-400">{item.unit}</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        {editing ? (
                          <input type="number" step="any" value={item.unit_price} onChange={(e) => updateFood(i, 'unit_price', Number(e.target.value))} className={`${numInputCls} w-20`} />
                        ) : (
                          <span className="text-slate-300">{fmt(item.unit_price)}</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right text-slate-200">{fmt(item.total_price)}</td>
                      <td className="px-2 py-1.5">
                        {nom ? (
                          <div>
                            <div className="font-mono text-[10px] text-emerald-500">{nom.code}</div>
                            <div className="text-[10px] text-emerald-400/70">{nom.name}</div>
                          </div>
                        ) : (
                          <span className="text-amber-400">New (auto)</span>
                        )}
                      </td>
                      {!isReadOnly && (
                        <td className="px-1 py-1.5 text-center">
                          <div className="flex items-center gap-0.5">
                            <button type="button" onClick={() => toggleEdit(key)} className={`rounded p-0.5 hover:bg-slate-700 ${editing ? 'text-indigo-400' : 'text-slate-500'}`} title={editing ? 'Готово' : 'Редактировать'}>
                              {editing ? <Check className="h-3 w-3" /> : <Pencil className="h-3 w-3" />}
                            </button>
                            <button type="button" onClick={() => removeFood(i)} className="rounded p-0.5 text-slate-600 hover:bg-slate-700 hover:text-rose-400" title="Удалить">
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {!isReadOnly && (
            <button type="button" onClick={addFood} className="mt-1.5 flex items-center gap-1 rounded px-2 py-1 text-[10px] text-emerald-500 hover:bg-emerald-500/10">
              <Plus className="h-3 w-3" /> Добавить строку
            </button>
          )}
        </div>
      )}

      {/* ── CapEx items ── */}
      {capexItems.length > 0 && (
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <h4 className="text-[10px] font-medium uppercase tracking-wide text-sky-400">
              CapEx Items ({capexItems.length})
              {capexChecked.size > 0 && (
                <span className="ml-2 text-sky-300/60">— {capexChecked.size}/{capexItems.length} сверено</span>
              )}
            </h4>
          </div>
          <div className="rounded-lg border border-slate-800">
            <table className="w-full text-xs">
              <thead className="bg-slate-900 text-[9px] uppercase tracking-wide text-slate-500">
                <tr>
                  {checkboxTh(capexChecked, setCapexChecked, capexItems.length)}
                  <th className="w-8 px-2 py-1.5 text-left">#</th>
                  <th className="px-2 py-1.5 text-left">Оборудование</th>
                  <th className="w-16 px-2 py-1.5 text-right">Qty</th>
                  <th className="w-20 px-2 py-1.5 text-right">Цена</th>
                  <th className="w-20 px-2 py-1.5 text-right">Итого</th>
                  {!isReadOnly && <th className="w-16 px-1 py-1.5" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {capexItems.map((item, i) => {
                  const key = `capex:${i}`
                  const editing = isEditing(key)
                  const checked = capexChecked.has(i)
                  return (
                    <tr key={i} className={`hover:bg-slate-800/30 ${checked ? 'bg-sky-500/5' : ''}`}>
                      <td className="w-10 px-2 py-1.5 text-center">
                        <input type="checkbox" checked={checked} onChange={() => toggleCheck(capexChecked, setCapexChecked, i)} className="h-3.5 w-3.5 cursor-pointer rounded border-slate-600 bg-slate-800 accent-sky-500" />
                      </td>
                      <td className="px-2 py-1.5 text-slate-500">{i + 1}</td>
                      <td className="px-2 py-1.5">
                        {editing ? <input value={item.name} onChange={(e) => updateCapex(i, 'name', e.target.value)} className={inputCls} /> : <span className="text-slate-200">{item.name}</span>}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        {editing ? <input type="number" step="any" value={item.quantity} onChange={(e) => updateCapex(i, 'quantity', Number(e.target.value))} className={`${numInputCls} w-16`} /> : <span className="text-slate-300">{item.quantity}</span>}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        {editing ? <input type="number" step="any" value={item.unit_price} onChange={(e) => updateCapex(i, 'unit_price', Number(e.target.value))} className={`${numInputCls} w-20`} /> : <span className="text-slate-300">{fmt(item.unit_price)}</span>}
                      </td>
                      <td className="px-2 py-1.5 text-right text-slate-200">{fmt(item.total_price)}</td>
                      {!isReadOnly && (
                        <td className="px-1 py-1.5 text-center">
                          <div className="flex items-center gap-0.5">
                            <button type="button" onClick={() => toggleEdit(key)} className={`rounded p-0.5 hover:bg-slate-700 ${editing ? 'text-indigo-400' : 'text-slate-500'}`}>{editing ? <Check className="h-3 w-3" /> : <Pencil className="h-3 w-3" />}</button>
                            <button type="button" onClick={() => removeCapex(i)} className="rounded p-0.5 text-slate-600 hover:bg-slate-700 hover:text-rose-400"><Trash2 className="h-3 w-3" /></button>
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {!isReadOnly && (
            <button type="button" onClick={addCapex} className="mt-1.5 flex items-center gap-1 rounded px-2 py-1 text-[10px] text-sky-500 hover:bg-sky-500/10">
              <Plus className="h-3 w-3" /> Добавить строку
            </button>
          )}
        </div>
      )}

      {/* ── OpEx items ── */}
      {opexItems.length > 0 && (
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <h4 className="text-[10px] font-medium uppercase tracking-wide text-amber-400">
              OpEx Items ({opexItems.length})
              {opexChecked.size > 0 && (
                <span className="ml-2 text-amber-300/60">— {opexChecked.size}/{opexItems.length} сверено</span>
              )}
            </h4>
          </div>
          <div className="rounded-lg border border-slate-800">
            <table className="w-full text-xs">
              <thead className="bg-slate-900 text-[9px] uppercase tracking-wide text-slate-500">
                <tr>
                  {checkboxTh(opexChecked, setOpexChecked, opexItems.length)}
                  <th className="w-8 px-2 py-1.5 text-left">#</th>
                  <th className="px-2 py-1.5 text-left">Расход</th>
                  <th className="w-16 px-2 py-1.5 text-right">Qty</th>
                  <th className="w-14 px-2 py-1.5 text-left">Unit</th>
                  <th className="w-20 px-2 py-1.5 text-right">Цена</th>
                  <th className="w-20 px-2 py-1.5 text-right">Итого</th>
                  {!isReadOnly && <th className="w-16 px-1 py-1.5" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {opexItems.map((item, i) => {
                  const key = `opex:${i}`
                  const editing = isEditing(key)
                  const checked = opexChecked.has(i)
                  return (
                    <tr key={i} className={`hover:bg-slate-800/30 ${checked ? 'bg-amber-500/5' : ''}`}>
                      <td className="w-10 px-2 py-1.5 text-center">
                        <input type="checkbox" checked={checked} onChange={() => toggleCheck(opexChecked, setOpexChecked, i)} className="h-3.5 w-3.5 cursor-pointer rounded border-slate-600 bg-slate-800 accent-amber-500" />
                      </td>
                      <td className="px-2 py-1.5 text-slate-500">{i + 1}</td>
                      <td className="px-2 py-1.5">
                        {editing ? <input value={item.description} onChange={(e) => updateOpex(i, 'description', e.target.value)} className={inputCls} /> : <span className="text-slate-200">{item.description}</span>}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        {editing ? <input type="number" step="any" value={item.quantity} onChange={(e) => updateOpex(i, 'quantity', Number(e.target.value))} className={`${numInputCls} w-16`} /> : <span className="text-slate-300">{item.quantity}</span>}
                      </td>
                      <td className="px-2 py-1.5">
                        {editing ? <input value={item.unit} onChange={(e) => updateOpex(i, 'unit', e.target.value)} className={`${inputCls} w-12`} /> : <span className="text-slate-400">{item.unit}</span>}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        {editing ? <input type="number" step="any" value={item.unit_price} onChange={(e) => updateOpex(i, 'unit_price', Number(e.target.value))} className={`${numInputCls} w-20`} /> : <span className="text-slate-300">{fmt(item.unit_price)}</span>}
                      </td>
                      <td className="px-2 py-1.5 text-right text-slate-200">{fmt(item.total_price)}</td>
                      {!isReadOnly && (
                        <td className="px-1 py-1.5 text-center">
                          <div className="flex items-center gap-0.5">
                            <button type="button" onClick={() => toggleEdit(key)} className={`rounded p-0.5 hover:bg-slate-700 ${editing ? 'text-indigo-400' : 'text-slate-500'}`}>{editing ? <Check className="h-3 w-3" /> : <Pencil className="h-3 w-3" />}</button>
                            <button type="button" onClick={() => removeOpex(i)} className="rounded p-0.5 text-slate-600 hover:bg-slate-700 hover:text-rose-400"><Trash2 className="h-3 w-3" /></button>
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {!isReadOnly && (
            <button type="button" onClick={addOpex} className="mt-1.5 flex items-center gap-1 rounded px-2 py-1 text-[10px] text-amber-500 hover:bg-amber-500/10">
              <Plus className="h-3 w-3" /> Добавить строку
            </button>
          )}
        </div>
      )}

      {/* Show add buttons even when sections are empty */}
      {!isReadOnly && foodItems.length === 0 && (
        <button type="button" onClick={addFood} className="flex items-center gap-1 rounded px-2 py-1 text-[10px] text-emerald-500 hover:bg-emerald-500/10">
          <Plus className="h-3 w-3" /> Добавить Food Item
        </button>
      )}
      {!isReadOnly && capexItems.length === 0 && (
        <button type="button" onClick={addCapex} className="flex items-center gap-1 rounded px-2 py-1 text-[10px] text-sky-500 hover:bg-sky-500/10">
          <Plus className="h-3 w-3" /> Добавить CapEx Item
        </button>
      )}
      {!isReadOnly && opexItems.length === 0 && (
        <button type="button" onClick={addOpex} className="flex items-center gap-1 rounded px-2 py-1 text-[10px] text-amber-500 hover:bg-amber-500/10">
          <Plus className="h-3 w-3" /> Добавить OpEx Item
        </button>
      )}

      {/* ── GDrive paths ── */}
      {row.gdrive_paths && row.gdrive_paths.length > 0 && (
        <div className="flex items-center gap-2 text-[10px] text-slate-500">
          <FolderOpen className="h-3 w-3" />
          {row.gdrive_paths.map((gp, i) => (
            <span key={i} className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-400">{gp}</span>
          ))}
        </div>
      )}

      {/* ── Validation errors ── */}
      {validationErrors.length > 0 && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          <div className="mb-1 font-medium">Исправьте перед подтверждением:</div>
          <ul className="list-inside list-disc space-y-0.5">
            {validationErrors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      )}

      {/* ── Confirmation dialog ── */}
      {showConfirm && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-xs">
          <div className="mb-2 font-medium text-slate-200">Подтвердите запись в систему:</div>
          <div className="mb-3 grid grid-cols-2 gap-x-6 gap-y-1 text-slate-400">
            <div>Поставщик: <span className="text-slate-200">{supplierName}</span></div>
            <div>Дата: <span className="text-slate-200">{transactionDate}</span></div>
            <div>Сумма: <span className="text-slate-200">{'\u0E3F'}{fmt(receiptTotal)}</span></div>
            <div>Позиций: <span className="text-slate-200">{foodItems.length} food, {capexItems.length} capex, {opexItems.length} opex</span></div>
            {totalMismatch && (
              <div className="col-span-2 text-amber-400">
                <AlertTriangle className="mr-1 inline h-3 w-3" />
                Сумма позиций не совпадает с чеком (разница: {'\u0E3F'}{fmt(Math.abs(expectedReceiptTotal - receiptTotal))})
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isApproving}
              onClick={handleApproveConfirm}
              className="flex items-center gap-1.5 rounded-md bg-emerald-600 px-4 py-2 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-40"
            >
              {isApproving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Да, записать
            </button>
            <button
              type="button"
              onClick={() => setShowConfirm(false)}
              className="rounded-md border border-slate-700 bg-slate-800 px-4 py-2 text-xs text-slate-400 hover:bg-slate-700"
            >
              Отмена
            </button>
          </div>
        </div>
      )}

      {/* ── Error / Result ── */}
      {error && (
        <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{error}</div>
      )}
      {result && (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">{result}</div>
      )}

      {/* ── Actions ── */}
      <div className="flex items-center gap-2 border-t border-slate-800 pt-3">
        {isReadOnly ? (
          <div className="flex items-center gap-2 text-xs">
            <span className="rounded-md bg-emerald-500/15 px-3 py-2 font-medium text-emerald-400">
              Записан в систему
            </span>
            {row.expense_id && (
              <span className="text-[10px] text-slate-500">expense_id: {row.expense_id}</span>
            )}
          </div>
        ) : isSkippedStatus ? (
          <>
            <button
              type="button"
              disabled={isReopening}
              onClick={handleReopen}
              className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-4 py-2 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
            >
              {isReopening ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Вернуть в ревью
            </button>
            <span className="text-[10px] text-slate-500">Статус: пропущен</span>
          </>
        ) : (
          <>
            <button
              type="button"
              disabled={isApproving || !!result || showConfirm}
              onClick={handleApproveClick}
              className="flex items-center gap-1.5 rounded-md bg-emerald-600 px-4 py-2 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-40"
            >
              {isApproving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Approve ({totalItems} items)
            </button>
            <button
              type="button"
              disabled={isSkipping || !!result}
              onClick={handleSkip}
              className="flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800 px-4 py-2 text-xs text-slate-400 hover:bg-slate-700 disabled:opacity-40"
            >
              {isSkipping ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
              Skip
            </button>
          </>
        )}
        <div className="ml-auto flex items-center gap-3 text-[10px] text-slate-600">
          {totalChecked > 0 && (
            <span className="text-emerald-500/70">
              Сверено: {totalChecked}/{totalItems}
            </span>
          )}
          <span>{p.currency ?? 'THB'} | {p.flow_type} | cat {p.category_code ?? '\u2014'}</span>
        </div>
      </div>
    </div>
  )
}
