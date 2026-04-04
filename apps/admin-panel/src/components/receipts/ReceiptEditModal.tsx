import { useEffect, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import type { InboxRow, InboxUpdate } from '../../hooks/useReceiptInbox'

/* ────────────────────────── Props ────────────────────────── */

interface ReceiptEditModalProps {
  receipt: InboxRow
  onSave: (id: string, payload: InboxUpdate) => Promise<string | null>
  onClose: () => void
}

/* ────────────────────────── Component ────────────────────────── */

export function ReceiptEditModal({ receipt, onSave, onClose }: ReceiptEditModalProps) {
  const [supplierHint, setSupplierHint] = useState(receipt.supplier_hint ?? '')
  const [amountHint, setAmountHint] = useState(receipt.amount_hint?.toString() ?? '')
  const [receiptDate, setReceiptDate] = useState(receipt.receipt_date ?? '')
  const [notes, setNotes] = useState(receipt.notes ?? '')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const handleSave = async () => {
    setIsSaving(true)
    setError(null)

    const payload: InboxUpdate = {
      supplier_hint: supplierHint || null,
      amount_hint: amountHint ? Number(amountHint) : null,
      receipt_date: receiptDate || null,
      notes: notes || null,
    }

    const err = await onSave(receipt.id, payload)
    if (err) {
      setError(err)
      setIsSaving(false)
    } else {
      onClose()
    }
  }

  // Extract parsed data for display
  const parsed = receipt.parsed_payload
  const parsedSupplier = parsed?.supplier_name as string | undefined
  const parsedAmount = parsed?.amount_original as number | undefined
  const parsedDate = parsed?.receipt_date as string | undefined
  const parsedItems = (parsed?.food_items ?? parsed?.items) as Array<Record<string, unknown>> | undefined

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative mx-4 w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="flex items-center justify-between border-b border-slate-800 px-5 py-3.5">
          <h3 className="text-sm font-semibold text-slate-100">Редактирование чека</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {/* Body */}
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4 space-y-4">
          {/* Photos preview */}
          {receipt.photo_urls.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {receipt.photo_urls.map((url, i) => (
                <a
                  key={i}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-slate-700 bg-slate-800 hover:border-slate-500"
                >
                  {url.endsWith('.pdf') ? (
                    <span className="flex h-full w-full items-center justify-center text-[9px] text-slate-400">PDF</span>
                  ) : (
                    <img src={url} alt="" className="h-full w-full object-cover" />
                  )}
                </a>
              ))}
            </div>
          )}

          {/* Parsed data hint */}
          {parsed && (
            <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 px-3 py-2.5 text-xs space-y-1">
              <p className="font-medium text-blue-300">Данные от агента:</p>
              {parsedSupplier && (
                <p className="text-slate-300">Поставщик: <span className="text-blue-200">{parsedSupplier}</span></p>
              )}
              {parsedAmount != null && (
                <p className="text-slate-300">Сумма: <span className="text-blue-200">฿{parsedAmount.toLocaleString()}</span></p>
              )}
              {parsedDate && (
                <p className="text-slate-300">Дата: <span className="text-blue-200">{parsedDate}</span></p>
              )}
              {parsedItems && parsedItems.length > 0 && (
                <p className="text-slate-300">Позиций: <span className="text-blue-200">{parsedItems.length}</span></p>
              )}
            </div>
          )}

          {/* Form fields */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">
                Поставщик
              </label>
              <input
                type="text"
                value={supplierHint}
                onChange={(e) => setSupplierHint(e.target.value)}
                placeholder="Makro, Tops..."
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">
                Сумма, ฿
              </label>
              <input
                type="number"
                value={amountHint}
                onChange={(e) => setAmountHint(e.target.value)}
                placeholder="฿"
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">
                Дата чека
              </label>
              <input
                type="date"
                value={receiptDate}
                onChange={(e) => setReceiptDate(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-200 outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">
                Статус
              </label>
              <span className="block rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-xs text-slate-400">
                {receipt.status}
              </span>
            </div>

            <div className="col-span-2">
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">
                Комментарий
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Любые заметки..."
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* Parsed payload raw view */}
          {parsed && (
            <details className="group">
              <summary className="cursor-pointer text-[10px] font-medium uppercase tracking-wide text-slate-500 hover:text-slate-300">
                Payload агента (JSON)
              </summary>
              <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-slate-950 p-3 text-[10px] text-slate-400 leading-relaxed">
                {JSON.stringify(parsed, null, 2)}
              </pre>
            </details>
          )}

          {error && (
            <p className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <footer className="flex items-center justify-end gap-2 border-t border-slate-800 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-700 px-4 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {isSaving && <Loader2 className="h-3 w-3 animate-spin" />}
            Сохранить
          </button>
        </footer>
      </div>
    </div>
  )
}
