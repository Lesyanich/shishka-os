import { useEffect, useState, useCallback, useRef } from 'react'
import { SprayCanIcon } from 'lucide-react'

interface CleanScreenOverlayProps {
  onDone: () => void
}

export function CleanScreenOverlay({ onDone }: CleanScreenOverlayProps) {
  const [secondsLeft, setSecondsLeft] = useState(15)
  const lastTapRef = useRef(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) {
          clearInterval(interval)
          onDone()
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [onDone])

  const handleTap = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault()
    const now = Date.now()
    if (now - lastTapRef.current < 400) {
      // Double tap detected — cancel cleaning mode
      onDone()
    }
    lastTapRef.current = now
  }, [onDone])

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-900"
      onTouchStart={handleTap}
      onTouchMove={e => e.preventDefault()}
      onClick={handleTap}
    >
      <SprayCanIcon className="mb-6 h-16 w-16 text-sky-400" />
      <h1 className="mb-2 text-3xl font-bold text-slate-100">Cleaning Mode</h1>
      <p className="mb-8 text-lg text-slate-400">Touch disabled — wipe the screen</p>
      <div className="font-mono text-6xl font-bold text-sky-300">{secondsLeft}</div>
      <div className="mt-6 h-2 w-48 overflow-hidden rounded-full bg-slate-800">
        <div
          className="h-full bg-sky-500 transition-all duration-1000"
          style={{ width: `${((15 - secondsLeft) / 15) * 100}%` }}
        />
      </div>
      <p className="mt-8 text-sm text-slate-600">Double-tap to cancel</p>
    </div>
  )
}
