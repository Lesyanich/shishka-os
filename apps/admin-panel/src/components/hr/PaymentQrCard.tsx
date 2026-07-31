import { useRef, useState } from 'react'
import { Loader2, QrCode, Trash2, Upload } from 'lucide-react'
import { useSignedStorageUrls } from '../../lib/signedStorage'
import {
  STAFF_PAYMENT_QR_BUCKET,
  useStaffPaymentQr,
} from '../../hooks/useStaffPaymentQr'

/**
 * One employee's payment QR — upload, preview, replace, remove.
 *
 * The bucket is private, so the image is rendered through a short-lived signed
 * URL minted per render. Nothing here ever persists a URL.
 *
 * `payment_note` sits beside the image on purpose: a QR is opaque to a human,
 * and on payday somebody is about to send real money to whatever it encodes.
 * The note is what lets them check they are paying the right person before
 * scanning rather than after.
 */
export function PaymentQrCard({
  staffId,
  staffName,
  qrPath,
  note,
  onChanged,
}: {
  staffId: string
  staffName: string
  qrPath: string | null
  note: string | null
  onChanged: () => void
}) {
  const { upload, remove, setNote, isUploading, error } = useStaffPaymentQr()
  const fileRef = useRef<HTMLInputElement>(null)
  const [noteDraft, setNoteDraft] = useState(note ?? '')
  const [noteDirty, setNoteDirty] = useState(false)
  const [zoomed, setZoomed] = useState(false)

  const signed = useSignedStorageUrls(STAFF_PAYMENT_QR_BUCKET, [qrPath])
  const src = qrPath ? signed.resolve(qrPath) : null

  async function handleFile(file: File | undefined) {
    if (!file) return
    const res = await upload(staffId, file)
    if (res.ok) onChanged()
  }

  return (
    <div>
      <p className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        <QrCode className="h-3 w-3" />
        Payment QR
      </p>

      <div className="flex items-start gap-3">
        {/* Preview */}
        <div className="shrink-0">
          {qrPath ? (
            src ? (
              <button
                onClick={() => setZoomed(true)}
                className="block overflow-hidden rounded-md ring-1 ring-slate-700 transition hover:ring-emerald-600"
                title="Click to enlarge for scanning"
              >
                <img src={src} alt={`Payment QR — ${staffName}`} className="h-24 w-24 object-cover" />
              </button>
            ) : (
              // Private bucket: null means the signature is in flight or failed.
              // Never fall back to the stored path — it is a guaranteed 400.
              <div className="flex h-24 w-24 items-center justify-center rounded-md bg-slate-800/60 ring-1 ring-slate-700">
                {signed.ready ? (
                  <span className="px-1 text-center text-[9px] text-red-400">
                    can&apos;t load
                  </span>
                ) : (
                  <Loader2 className="h-4 w-4 animate-spin text-slate-600" />
                )}
              </div>
            )
          ) : (
            <div className="flex h-24 w-24 items-center justify-center rounded-md border border-dashed border-slate-700 bg-slate-900/40">
              <span className="px-1 text-center text-[9px] text-slate-600">no QR yet</span>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="min-w-0 flex-1 space-y-1.5">
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              void handleFile(e.target.files?.[0])
              e.target.value = ''
            }}
          />
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => fileRef.current?.click()}
              disabled={isUploading}
              className="flex items-center gap-1 rounded bg-slate-800 px-2 py-1 text-[11px] text-slate-300 ring-1 ring-slate-700 transition hover:bg-slate-700 disabled:opacity-50"
            >
              {isUploading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Upload className="h-3 w-3" />
              )}
              {qrPath ? 'Replace' : 'Upload QR'}
            </button>
            {qrPath && (
              <button
                onClick={async () => {
                  await remove(staffId, qrPath)
                  onChanged()
                }}
                className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-red-400 transition hover:bg-red-500/10"
              >
                <Trash2 className="h-3 w-3" />
                Remove
              </button>
            )}
          </div>

          <input
            type="text"
            value={noteDraft}
            placeholder="e.g. PromptPay X-XXXX-XXXX7-55-1 · KBank"
            onChange={(e) => {
              setNoteDraft(e.target.value)
              setNoteDirty(true)
            }}
            onBlur={async () => {
              if (!noteDirty) return
              await setNote(staffId, noteDraft)
              setNoteDirty(false)
              onChanged()
            }}
            className="w-full rounded bg-slate-800 px-2 py-1 text-[11px] text-slate-200 ring-1 ring-slate-700 focus:ring-emerald-500/50 focus:outline-none"
          />
          <p className="text-[9px] text-slate-600">
            Payee details, so a human can check the QR before scanning it.
          </p>

          {error && <p className="text-[10px] text-red-400">{error}</p>}
        </div>
      </div>

      {/* Full-size for scanning from the screen */}
      {zoomed && src && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
          onClick={() => setZoomed(false)}
        >
          <div className="max-w-sm rounded-xl bg-white p-4" onClick={(e) => e.stopPropagation()}>
            <img src={src} alt={`Payment QR — ${staffName}`} className="w-full" />
            <p className="mt-2 text-center text-xs font-medium text-slate-700">{staffName}</p>
            {note && <p className="text-center text-[11px] text-slate-500">{note}</p>}
          </div>
        </div>
      )}
    </div>
  )
}

export default PaymentQrCard
