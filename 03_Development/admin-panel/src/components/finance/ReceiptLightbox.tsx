import { useEffect, useCallback } from 'react'
import { X } from 'lucide-react'

export interface ReceiptLightboxProps {
  url: string | null
  onClose: () => void
}

export function ReceiptLightbox({ url, onClose }: ReceiptLightboxProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    },
    [onClose],
  )

  useEffect(() => {
    if (!url) return
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [url, handleKeyDown])

  if (!url) return null

  const isPdf = url.toLowerCase().endsWith('.pdf')

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Close button */}
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 rounded-full bg-slate-800/80 p-2 text-slate-300 hover:bg-slate-700 hover:text-white"
      >
        <X className="h-5 w-5" />
      </button>

      {/* Content */}
      <div
        className="max-h-[90vh] max-w-[90vw] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {isPdf ? (
          <iframe
            src={url}
            title="Receipt PDF"
            className="h-[85vh] w-[70vw] rounded-lg border border-slate-700"
          />
        ) : (
          <img
            src={url}
            alt="Receipt"
            className="max-h-[85vh] max-w-[85vw] rounded-lg object-contain"
          />
        )}
      </div>
    </div>
  )
}
