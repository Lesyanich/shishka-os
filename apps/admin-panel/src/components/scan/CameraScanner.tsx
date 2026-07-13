import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser'
import { CameraOff, Loader2 } from 'lucide-react'

interface CameraScannerProps {
  /** Fired with the decoded value. Repeats of the same code are debounced. */
  onScan: (code: string) => void
  /** Hint under the viewport (e.g. "Point at the pack QR"). */
  hint?: string
}

/** Live QR/barcode scanner using the phone's rear camera (@zxing/browser).
 * Reads the bare batch-code QR already printed on prep labels. Falls back to a
 * message when the camera is unavailable/denied — the parent still offers manual
 * entry. Streams are stopped on unmount. */
export function CameraScanner({ onScan, hint }: CameraScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const controlsRef = useRef<IScannerControls | null>(null)
  const onScanRef = useRef(onScan)
  useEffect(() => {
    onScanRef.current = onScan
  })
  // Debounce: the decoder fires ~continuously on a held code — only surface a
  // given value once per 2.5s window.
  const lastRef = useRef<{ code: string; t: number }>({ code: '', t: 0 })

  const [status, setStatus] = useState<'starting' | 'live' | 'error'>('starting')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const reader = new BrowserMultiFormatReader()

    ;(async () => {
      try {
        const video = videoRef.current
        if (!video) return
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: 'environment' } } },
          video,
          (result) => {
            if (!result) return
            const code = result.getText().trim()
            if (!code) return
            const now = performance.now()
            if (code === lastRef.current.code && now - lastRef.current.t < 2500) return
            lastRef.current = { code, t: now }
            onScanRef.current(code)
          },
        )
        if (cancelled) {
          controls.stop()
          return
        }
        controlsRef.current = controls
        setStatus('live')
      } catch (e) {
        if (cancelled) return
        setStatus('error')
        setError(
          e instanceof Error && /permission|denied|notallowed/i.test(e.message)
            ? 'Camera permission denied — use manual entry below.'
            : 'Camera unavailable — use manual entry below.',
        )
      }
    })()

    return () => {
      cancelled = true
      controlsRef.current?.stop()
    }
  }, [])

  if (status === 'error') {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--s-1)] py-8 text-center">
        <CameraOff className="h-6 w-6 text-cream/40" />
        <p className="px-4 text-xs text-cream/50">{error}</p>
      </div>
    )
  }

  return (
    <div className="relative overflow-hidden rounded-xl border border-[var(--line)] bg-black">
      <video ref={videoRef} className="aspect-square w-full object-cover" playsInline muted />
      {/* reticle */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="h-2/3 w-2/3 rounded-lg border-2 border-white/70 shadow-[0_0_0_100vmax_rgba(0,0,0,0.35)]" />
      </div>
      {status === 'starting' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-xs text-white/80">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Starting camera…
        </div>
      )}
      {hint && (
        <div className="absolute inset-x-0 bottom-0 bg-black/50 px-3 py-1.5 text-center text-[11px] text-white/85">
          {hint}
        </div>
      )}
    </div>
  )
}
