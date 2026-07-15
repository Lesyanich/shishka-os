import { AlertTriangle, ImageOff, StickyNote } from 'lucide-react'
import type { InboxRow } from '../../hooks/useReceiptInbox'
import { isPdfReceipt, useSignedReceiptUrls } from '../../lib/receiptUrls'

interface Props {
  row: InboxRow
}

/**
 * Lightweight expanded view for rows that have no parsed_payload yet
 * (pending / processing / error-before-parse). Shows what the row actually
 * contains — photos, notes, hints — so unparsed receipts don't look empty.
 */
export function PendingPreview({ row }: Props) {
  const photos = row.photo_urls || []
  // `url` below stays the stored value (identity + type detection); only what
  // lands in href/src is swapped for a short-lived signed URL.
  const { resolve } = useSignedReceiptUrls(photos)

  return (
    <div className="space-y-3 px-4 py-4">
      {row.error_message && (
        <div className="flex items-start gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 break-words">{row.error_message}</span>
        </div>
      )}

      {photos.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {photos.map((url, i) => {
            // null while the signature is in flight or if signing failed — the
            // bucket is private, so the stored value is not a usable fallback.
            const src = resolve(url)
            return (
              <a
                key={i}
                href={src ?? undefined}
                target="_blank"
                rel="noreferrer"
                className="block h-40 w-28 overflow-hidden rounded-lg border border-slate-700 bg-slate-950 hover:border-indigo-500"
                title={`Open photo ${i + 1} full size`}
              >
                {isPdfReceipt(url) ? (
                  <span className="flex h-full w-full items-center justify-center text-[10px] text-slate-400">PDF</span>
                ) : src ? (
                  <img src={src} alt={`Receipt photo ${i + 1}`} loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full w-full animate-pulse items-center justify-center bg-slate-900 text-[10px] text-slate-500">…</span>
                )}
              </a>
            )
          })}
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          <ImageOff className="h-3.5 w-3.5 shrink-0" />
          No photos attached — this entry was created from a text note only.
        </div>
      )}

      {(row.notes || row.supplier_hint || row.amount_hint != null || row.receipt_date) && (
        <div className="space-y-1 text-xs text-slate-300">
          {row.notes && (
            <div className="flex items-start gap-1.5">
              <StickyNote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />
              <span className="min-w-0 break-words">{row.notes}</span>
            </div>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-slate-400">
            {row.supplier_hint && <span>Supplier hint: <span className="text-slate-200">{row.supplier_hint}</span></span>}
            {row.amount_hint != null && <span>Amount hint: <span className="text-slate-200">฿{row.amount_hint.toLocaleString()}</span></span>}
            {row.receipt_date && <span>Date hint: <span className="text-slate-200">{row.receipt_date}</span></span>}
          </div>
        </div>
      )}

      {row.status === 'pending' && (
        <p className="text-[11px] text-slate-500">
          Not parsed yet — press ▶ Parse on this row (or "Parse all") to extract supplier, amount and items with AI.
        </p>
      )}
    </div>
  )
}
