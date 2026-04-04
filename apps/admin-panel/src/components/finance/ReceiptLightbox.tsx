import { useEffect, useCallback } from 'react'
import { ExternalLink, X } from 'lucide-react'

export interface ReceiptLightboxProps {
  url: string | null
  onClose: () => void
}

/** Check if URL is a Google Drive share link */
function isGoogleDriveUrl(url: string) {
  return url.includes('drive.google.com')
}

/** Convert Google Drive share link to embeddable preview URL */
function toGoogleDrivePreview(url: string): string {
  const match = url.match(/\/d\/([^/]+)/)
  if (match) return `https://drive.google.com/file/d/${match[1]}/preview`
  return url
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
  const isGDrive = isGoogleDriveUrl(url)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Close button */}
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 z-10 rounded-full bg-slate-800/80 p-2 text-slate-300 hover:bg-slate-700 hover:text-white"
      >
        <X className="h-5 w-5" />
      </button>

      {/* Open in new tab button */}
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="absolute right-16 top-4 z-10 rounded-full bg-slate-800/80 p-2 text-slate-300 hover:bg-slate-700 hover:text-white"
        title="Open in new tab"
        onClick={(e) => e.stopPropagation()}
      >
        <ExternalLink className="h-5 w-5" />
      </a>

      {/* Content */}
      <div
        className="max-h-[90vh] max-w-[90vw] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {isGDrive ? (
          <iframe
            src={toGoogleDrivePreview(url)}
            title="Receipt (Google Drive)"
            className="h-[85vh] w-[70vw] rounded-lg border border-slate-700"
            allow="autoplay"
          />
        ) : isPdf ? (
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
            onError={(e) => {
              // If image fails to load, show a placeholder
              const target = e.target as HTMLImageElement
              target.style.display = 'none'
              target.insertAdjacentHTML(
                'afterend',
                '<div class="flex flex-col items-center gap-3 p-12 text-slate-400"><p class="text-sm">Could not load image</p><a href="' + url + '" target="_blank" rel="noopener noreferrer" class="text-xs text-emerald-400 hover:underline">Open in new tab</a></div>',
              )
            }}
          />
        )}
      </div>
    </div>
  )
}
