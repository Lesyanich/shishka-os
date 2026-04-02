import { useEffect, useState } from 'react'
import { Loader2, Receipt, Save, Upload, X } from 'lucide-react'
import type { ExpenseRow, ExpenseUpdatePayload } from '../../hooks/useExpenseLedger'
import { CURRENCY_OPTIONS, PAYMENT_METHODS } from './helpers'
import { ReceiptGallery } from './ReceiptGallery'
import { supabase } from '../../lib/supabase'

export interface ExpenseEditModalProps {
  row: ExpenseRow | null
  categories: { code: number; name: string }[]
  subCategories: { sub_code: number; category_code: number; name: string }[]
  suppliers: { id: string; name: string }[]
  onSave: (id: string, payload: ExpenseUpdatePayload) => Promise<string | null>
  onClose: () => void
  onRefetch?: () => void
}

export function ExpenseEditModal({
  row,
  categories,
  subCategories,
  suppliers,
  onSave,
  onClose,
  onRefetch: _onRefetch,
}: ExpenseEditModalProps) {
  // Form state — pre-filled from row
  const [txDate, setTxDate] = useState('')
  const [flowType, setFlowType] = useState<'OpEx' | 'CapEx' | 'COGS'>('OpEx')
  const [categoryCode, setCategoryCode] = useState<number | ''>('')
  const [subCategoryCode, setSubCategoryCode] = useState<number | ''>('')
  const [supplierId, setSupplierId] = useState('')
  const [details, setDetails] = useState('')
  const [comments, setComments] = useState('')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [hasTaxInvoice, setHasTaxInvoice] = useState(false)
  const [amountOriginal, setAmountOriginal] = useState<number | ''>('')
  const [currency, setCurrency] = useState('THB')
  const [exchangeRate, setExchangeRate] = useState<number | ''>(1)
  const [paidBy, setPaidBy] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [status, setStatus] = useState<'pending' | 'paid' | 'cancelled'>('paid')

  // Receipt URLs (local state for display; saved via separate handler)
  const [receiptSupplierUrl, setReceiptSupplierUrl] = useState<string | null>(null)
  const [receiptBankUrl, setReceiptBankUrl] = useState<string | null>(null)
  const [taxInvoiceUrl, setTaxInvoiceUrl] = useState<string | null>(null)

  const [isSaving, setIsSaving] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Gallery state
  const [galleryPages, setGalleryPages] = useState<string[]>([])
  const [galleryStart, setGalleryStart] = useState(0)

  const openGallery = (clickedUrl: string) => {
    const allUrls = [receiptSupplierUrl, receiptBankUrl, taxInvoiceUrl].filter(
      (u): u is string => !!u,
    )
    const idx = allUrls.indexOf(clickedUrl)
    setGalleryPages(allUrls)
    setGalleryStart(idx >= 0 ? idx : 0)
  }

  // Pre-fill from row when it changes
  useEffect(() => {
    if (!row) return
    setTxDate(row.transaction_date)
    setFlowType(row.flow_type)
    setCategoryCode(row.category_code ?? '')
    setSubCategoryCode(row.sub_category_code ?? '')
    setSupplierId(row.supplier_id ?? '')
    setDetails(row.details)
    setComments(row.comments ?? '')
    setInvoiceNumber(row.invoice_number ?? '')
    setHasTaxInvoice(row.has_tax_invoice)
    setAmountOriginal(row.amount_original)
    setCurrency(row.currency)
    setExchangeRate(row.exchange_rate)
    setPaidBy(row.paid_by)
    setPaymentMethod(row.payment_method)
    setStatus(row.status as 'pending' | 'paid' | 'cancelled')
    setReceiptSupplierUrl(row.receipt_supplier_url)
    setReceiptBankUrl(row.receipt_bank_url)
    setTaxInvoiceUrl(row.tax_invoice_url)
    setError(null)
  }, [row])

  // Escape key
  useEffect(() => {
    if (!row) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [row, onClose])

  if (!row) return null

  const filteredSubCats = categoryCode !== ''
    ? subCategories.filter((sc) => sc.category_code === categoryCode)
    : []

  const computedTHB =
    typeof amountOriginal === 'number' && typeof exchangeRate === 'number'
      ? amountOriginal * exchangeRate
      : null

  const handleSave = async () => {
    if (typeof amountOriginal !== 'number' || amountOriginal <= 0) {
      setError('Amount must be > 0')
      return
    }

    setIsSaving(true)
    setError(null)

    const payload: ExpenseUpdatePayload = {
      transaction_date: txDate,
      flow_type: flowType,
      category_code: categoryCode !== '' ? categoryCode : null,
      sub_category_code: subCategoryCode !== '' ? subCategoryCode : null,
      supplier_id: supplierId || null,
      details: details.trim(),
      comments: comments.trim() || null,
      has_tax_invoice: hasTaxInvoice,
      amount_original: amountOriginal,
      currency,
      exchange_rate: currency === 'THB' ? 1 : (typeof exchangeRate === 'number' ? exchangeRate : 1),
      paid_by: paidBy.trim(),
      payment_method: paymentMethod,
      status,
      receipt_supplier_url: receiptSupplierUrl,
      receipt_bank_url: receiptBankUrl,
      tax_invoice_url: taxInvoiceUrl,
    }

    // Add invoice_number (it's in the allowed fields of update_expense MCP)
    ;(payload as Record<string, unknown>).invoice_number = invoiceNumber.trim() || null

    const errMsg = await onSave(row.id, payload)
    setIsSaving(false)

    if (errMsg) {
      setError(errMsg)
    } else {
      onClose()
    }
  }

  const handleFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    slot: 'supplier' | 'bank' | 'tax',
  ) => {
    const file = e.target.files?.[0]
    if (!file) return
    setIsUploading(true)
    try {
      let uploadFile: File | Blob = file
      if (file.type.startsWith('image/')) {
        const bitmap = await createImageBitmap(file)
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(bitmap, 0, 0)
        uploadFile = await canvas.convertToBlob({ type: 'image/webp', quality: 0.7 })
      }

      const ts = Date.now()
      const ext = file.type.startsWith('image/') ? 'webp' : file.name.split('.').pop() || 'pdf'
      const path = `${ts}_${Math.random().toString(36).slice(2, 6)}.${ext}`

      const { error: uploadErr } = await supabase.storage
        .from('receipts')
        .upload(path, uploadFile, {
          contentType: file.type.startsWith('image/') ? 'image/webp' : file.type,
        })
      if (uploadErr) throw uploadErr

      const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(path)
      const publicUrl = urlData.publicUrl

      if (slot === 'supplier') setReceiptSupplierUrl(publicUrl)
      else if (slot === 'bank') setReceiptBankUrl(publicUrl)
      else setTaxInvoiceUrl(publicUrl)
    } catch (err) {
      console.error('Upload failed:', err)
      setError('File upload failed')
    } finally {
      setIsUploading(false)
      e.target.value = ''
    }
  }

  const receiptSlots = [
    { label: 'Supplier receipt', url: receiptSupplierUrl, slot: 'supplier' as const, color: 'emerald' },
    { label: 'Bank slip', url: receiptBankUrl, slot: 'bank' as const, color: 'sky' },
    { label: 'Tax invoice', url: taxInvoiceUrl, slot: 'tax' as const, color: 'amber' },
  ]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="mx-4 w-full max-w-2xl rounded-xl border border-slate-700 bg-slate-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-100">Edit Expense</h2>
            <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[9px] text-slate-500" title={row.id}>
              {row.id.slice(0, 8)}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[75vh] space-y-4 overflow-y-auto px-5 py-4">
          {error && (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {error}
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
                {(['OpEx', 'CapEx', 'COGS'] as const).map((ft) => (
                  <button
                    key={ft}
                    type="button"
                    onClick={() => setFlowType(ft)}
                    className={`h-9 flex-1 rounded-md border text-xs font-medium transition ${
                      flowType === ft
                        ? ft === 'OpEx'
                          ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-200'
                          : ft === 'CapEx'
                            ? 'border-amber-500/60 bg-amber-500/15 text-amber-200'
                            : 'border-blue-500/60 bg-blue-500/15 text-blue-200'
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
            <label className="mb-1 block text-xs text-slate-400">Supplier</label>
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

          {/* Details + Invoice # */}
          <div className="grid grid-cols-[1fr_140px] gap-3">
            <div>
              <label className="mb-1 block text-xs text-slate-400">Details</label>
              <input
                type="text"
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="What was the payment for..."
                className="h-9 w-full rounded-md border border-slate-700 bg-slate-800 px-3 text-xs text-slate-100 outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400">Invoice #</label>
              <input
                type="text"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="INV-001"
                className="h-9 w-full rounded-md border border-slate-700 bg-slate-800 px-3 text-xs font-mono text-slate-100 outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {/* Comments */}
          <div>
            <label className="mb-1 block text-xs text-slate-400">Comments</label>
            <input
              type="text"
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder="Additional notes..."
              className="h-9 w-full rounded-md border border-slate-700 bg-slate-800 px-3 text-xs text-slate-100 outline-none focus:border-emerald-500"
            />
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
                {currency === 'THB' ? 'Rate (1.00)' : 'Rate -> THB'}
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
            <div className="rounded-lg border border-slate-700/50 bg-slate-800/50 px-4 py-2">
              <div className="text-[10px] uppercase tracking-wide text-slate-500">
                Total in THB (auto)
              </div>
              <div className="mt-0.5 text-sm font-semibold text-amber-300">
                {Math.round(computedTHB).toLocaleString()}
              </div>
            </div>
          )}

          {/* Paid by + Payment method + Status */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-xs text-slate-400">Paid by</label>
              <input
                type="text"
                value={paidBy}
                onChange={(e) => setPaidBy(e.target.value)}
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

          {/* Tax Invoice checkbox */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={hasTaxInvoice}
              onChange={(e) => setHasTaxInvoice(e.target.checked)}
              className="h-4 w-4 rounded border-slate-700 bg-slate-800 text-emerald-500 focus:ring-emerald-500"
            />
            <span className="text-xs text-slate-400">Has Tax Invoice</span>
          </label>

          {/* ── Documents section ── */}
          <div className="rounded-lg border border-slate-700/50 bg-slate-800/30 p-3">
            <div className="mb-2 text-xs font-medium text-slate-400">Documents</div>
            <div className="grid gap-2 sm:grid-cols-3">
              {receiptSlots.map(({ label, url, slot, color }) => (
                <div key={slot} className="flex items-center gap-2 rounded-md border border-slate-700/40 bg-slate-900/50 px-2.5 py-2">
                  {url ? (
                    <>
                      <button type="button" onClick={() => openGallery(url)} title={`View ${label}`} className="hover:opacity-70">
                        <Receipt className={`h-4 w-4 text-${color}-400`} />
                      </button>
                      <span className="flex-1 truncate text-[10px] text-slate-300">{label}</span>
                      <button
                        type="button"
                        onClick={() => {
                          if (slot === 'supplier') setReceiptSupplierUrl(null)
                          else if (slot === 'bank') setReceiptBankUrl(null)
                          else setTaxInvoiceUrl(null)
                        }}
                        title="Remove"
                        className="text-slate-500 hover:text-rose-400"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </>
                  ) : (
                    <>
                      <Receipt className="h-4 w-4 text-slate-600" />
                      <span className="flex-1 text-[10px] text-slate-500">{label}</span>
                      <label className={`inline-flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 text-[9px] text-slate-400 transition hover:bg-slate-700 hover:text-slate-200 ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}>
                        <Upload className="h-3 w-3" />
                        {isUploading ? '...' : 'Upload'}
                        <input type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => handleFileUpload(e, slot)} />
                      </label>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-slate-800 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-md border border-slate-700 bg-slate-800 px-4 text-xs text-slate-300 hover:bg-slate-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="inline-flex h-9 items-center gap-1 rounded-md border border-emerald-500/60 bg-emerald-500/15 px-4 text-xs font-medium text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-50"
          >
            {isSaving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            Save Changes
          </button>
        </div>
      </div>

      {/* Receipt Gallery (renders on top of modal) */}
      {galleryPages.length > 0 && (
        <ReceiptGallery
          pages={galleryPages}
          startIndex={galleryStart}
          onClose={() => setGalleryPages([])}
        />
      )}
    </div>
  )
}
