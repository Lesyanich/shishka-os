import { useCallback, useRef, useState } from 'react'
import { Snowflake, Refrigerator, CheckCircle2, AlertCircle, Keyboard } from 'lucide-react'
import { CameraScanner } from '../components/scan/CameraScanner'
import { useThawBatch } from '../hooks/useThawBatch'
import { useStockTransfer } from '../hooks/useStockTransfer'
import { useAppRole } from '../contexts/AppRoleContext'
import { fmtQty } from '../components/procurement/StockPanel'

/** S4 — the cold-chain scan station (mobile, cook-tier). Two actions on the
 * batch QR already printed on prep labels:
 *   • Put away → move a fresh frozen pack into the Freezer (fn_transfer_batch)
 *   • Thaw → pull a pack Freezer→Fridge, re-clocking its use-by to +thawed days
 *     (fn_thaw_batch, mig 350). Shows the new use-by so staff re-label the pack.
 * Camera scan (rear cam) with a manual/HID-entry fallback. */

type Mode = 'thaw' | 'putaway'

interface Feedback {
  ok: boolean
  title: string
  detail?: string
  useBy?: string | null
  error?: string
}

function fmtUseBy(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function ThawStation() {
  const { staffId } = useAppRole()
  const { thawBatch } = useThawBatch(staffId)
  const { transferBatch } = useStockTransfer()

  const [mode, setMode] = useState<Mode>('thaw')
  const [manual, setManual] = useState('')
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const inFlight = useRef(false)

  const handleCode = useCallback(
    async (raw: string) => {
      const code = raw.trim()
      if (inFlight.current || !code) return
      inFlight.current = true
      try {
        if (mode === 'thaw') {
          const r = await thawBatch(code)
          setFeedback(
            r.ok
              ? {
                  ok: true,
                  title: r.name ?? r.batch_code ?? code,
                  detail: `${fmtQty(r.weight ?? null, r.base_unit ?? null)} · Freezer → Fridge`,
                  useBy: r.new_expires_at,
                }
              : { ok: false, title: 'Cannot thaw', error: r.error },
          )
        } else {
          const r = await transferBatch(code, 'Freezer')
          setFeedback(
            r.ok
              ? {
                  ok: true,
                  title: r.barcode ?? code,
                  detail: `${fmtQty(r.weight ?? null, null)} · moved to Freezer`,
                }
              : { ok: false, title: 'Cannot put away', error: r.error },
          )
        }
      } finally {
        inFlight.current = false
      }
    },
    [mode, thawBatch, transferBatch],
  )

  const switchMode = (m: Mode) => {
    setMode(m)
    setFeedback(null)
    setManual('')
  }

  const submitManual = (e: React.FormEvent) => {
    e.preventDefault()
    void handleCode(manual)
    setManual('')
  }

  const accent = mode === 'thaw' ? 'var(--color-royal-green)' : 'var(--color-royal-green)'

  return (
    <div className="mx-auto max-w-md space-y-4 p-4">
      <div className="text-center">
        <h1 className="text-lg font-bold text-cream">Cold chain</h1>
        <p className="mt-0.5 text-xs text-cream/50">Scan a pack's label to put it away or thaw it.</p>
      </div>

      {/* Mode toggle */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => switchMode('thaw')}
          className={[
            'flex items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-semibold transition',
            mode === 'thaw'
              ? 'bg-[var(--color-royal-green)] text-white'
              : 'bg-[var(--s-2)] text-cream/50 hover:text-cream/80',
          ].join(' ')}
        >
          <Refrigerator className="h-4 w-4" /> Thaw
        </button>
        <button
          type="button"
          onClick={() => switchMode('putaway')}
          className={[
            'flex items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-semibold transition',
            mode === 'putaway'
              ? 'bg-[var(--color-royal-green)] text-white'
              : 'bg-[var(--s-2)] text-cream/50 hover:text-cream/80',
          ].join(' ')}
        >
          <Snowflake className="h-4 w-4" /> Put away
        </button>
      </div>

      <CameraScanner
        onScan={handleCode}
        hint={mode === 'thaw' ? 'Point at the pack QR to thaw → Fridge' : 'Point at the pack QR to store → Freezer'}
      />

      {/* Manual / HID fallback */}
      <form onSubmit={submitManual} className="flex items-center gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-lg border border-[var(--line-strong)] bg-[var(--s-2)] px-2.5">
          <Keyboard className="h-4 w-4 shrink-0 text-cream/40" />
          <input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="…or type / scan the batch code"
            autoCapitalize="characters"
            className="h-10 w-full bg-transparent text-sm text-cream outline-none placeholder:text-cream/30"
          />
        </div>
        <button
          type="submit"
          disabled={!manual.trim()}
          style={{ backgroundColor: accent }}
          className="h-10 rounded-lg px-4 text-sm font-semibold text-white transition disabled:opacity-40"
        >
          Go
        </button>
      </form>

      {/* Result */}
      {feedback && (
        <div
          className={[
            'rounded-xl border p-4',
            feedback.ok
              ? 'border-forest-soft/30 bg-forest-soft/10'
              : 'border-brick-soft/30 bg-brick-soft/10',
          ].join(' ')}
        >
          <div className={`flex items-center gap-2 text-sm font-semibold ${feedback.ok ? 'text-forest-soft' : 'text-brick-bright'}`}>
            {feedback.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
            {feedback.title}
          </div>
          {feedback.detail && <p className="mt-1 text-xs text-cream/70">{feedback.detail}</p>}
          {feedback.error && <p className="mt-1 text-xs text-cream/60">{feedback.error}</p>}
          {feedback.ok && feedback.useBy && (
            <div className="mt-3 rounded-lg bg-[var(--s-1)] px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-cream/40">Use by — re-label the pack</div>
              <div className="text-base font-bold text-cream">{fmtUseBy(feedback.useBy)}</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
