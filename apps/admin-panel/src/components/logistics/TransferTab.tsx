import { useState } from 'react'
import { ArrowRight, CheckCircle2, AlertCircle, ScanLine } from 'lucide-react'
import type { TransferResult } from '../../hooks/useStockTransfer'

interface TransferTabProps {
  onTransfer: (barcode: string, toLocation: string) => Promise<TransferResult>
  isTransferring: boolean
  lastTransfer: TransferResult | null
}

export function TransferTab({ onTransfer, isTransferring, lastTransfer }: TransferTabProps) {
  const [barcode, setBarcode] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = barcode.trim().toUpperCase()
    if (!trimmed) return
    await onTransfer(trimmed, 'Assembly')
    setBarcode('')
  }

  return (
    <div className="space-y-6">
      {/* Scanner input */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-xs text-slate-500">
            Scan or enter barcode
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <ScanLine className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                placeholder="e.g. A1B2C3D4"
                autoFocus
                className="w-full rounded-xl border border-slate-700 bg-slate-800 py-4 pl-11 pr-4 font-mono text-lg uppercase tracking-widest text-slate-100 placeholder-slate-600 outline-none focus:border-sky-500"
              />
            </div>
            <button
              type="submit"
              disabled={isTransferring || !barcode.trim()}
              className="flex items-center gap-2 rounded-xl bg-sky-600 px-6 py-4 text-sm font-semibold text-white transition hover:bg-sky-500 active:scale-[0.98] disabled:opacity-50"
            >
              <ArrowRight className="h-5 w-5" />
              Transfer
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-xl bg-slate-800/60 px-4 py-3">
          <ArrowRight className="h-4 w-4 text-sky-400" />
          <span className="text-xs text-slate-400">
            Kitchen → <strong className="text-slate-200">Assembly</strong>
          </span>
        </div>
      </form>

      {/* Last transfer result */}
      {lastTransfer && (
        <div
          className={[
            'rounded-xl border p-4',
            lastTransfer.ok
              ? 'border-emerald-500/30 bg-emerald-500/5'
              : 'border-rose-500/30 bg-rose-500/5',
          ].join(' ')}
        >
          {lastTransfer.ok ? (
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
              <div>
                <p className="text-sm font-semibold text-emerald-300">
                  Transfer Complete
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  <span className="font-mono text-emerald-300">{lastTransfer.barcode}</span>
                  {' '}· {lastTransfer.weight?.toFixed(2)} kg
                </p>
                <p className="text-xs text-slate-500">
                  {lastTransfer.from} → {lastTransfer.to}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-400" />
              <div>
                <p className="text-sm font-semibold text-rose-300">
                  Transfer Failed
                </p>
                <p className="mt-1 text-xs text-rose-400">
                  {lastTransfer.error}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
