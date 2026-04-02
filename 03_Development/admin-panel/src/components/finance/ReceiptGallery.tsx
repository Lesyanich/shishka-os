import { useState, useEffect, useCallback, useRef } from 'react'
import {
  X,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  RotateCw,
} from 'lucide-react'

/* ═══════════════════════════════════════════════════════════
   ReceiptGallery — fullscreen multi-page receipt viewer
   Replaces ReceiptLightbox with N-page navigation support.
   ═══════════════════════════════════════════════════════════ */

export interface ReceiptGalleryProps {
  /** Array of receipt page URLs (from receipt_pages or legacy fields) */
  pages: string[]
  /** Starting page index (default 0) */
  startIndex?: number
  /** Called when gallery is closed */
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

function isPdfUrl(url: string) {
  return url.toLowerCase().endsWith('.pdf')
}

export function ReceiptGallery({
  pages,
  startIndex = 0,
  onClose,
}: ReceiptGalleryProps) {
  const [current, setCurrent] = useState(startIndex)
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)
  const imgRef = useRef<HTMLImageElement>(null)

  const total = pages.length
  const url = pages[current] ?? ''

  // Reset zoom/rotation when page changes
  useEffect(() => {
    setZoom(1)
    setRotation(0)
  }, [current])

  const goNext = useCallback(() => {
    if (current < total - 1) setCurrent((p) => p + 1)
  }, [current, total])

  const goPrev = useCallback(() => {
    if (current > 0) setCurrent((p) => p - 1)
  }, [current])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') goNext()
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') goPrev()
      if (e.key === '+' || e.key === '=') setZoom((z) => Math.min(z + 0.25, 4))
      if (e.key === '-') setZoom((z) => Math.max(z - 0.25, 0.5))
      if (e.key === 'r') setRotation((r) => (r + 90) % 360)
    },
    [onClose, goNext, goPrev],
  )

  useEffect(() => {
    if (!total) return
    document.addEventListener('keydown', handleKeyDown)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [total, handleKeyDown])

  if (!total) return null

  const isGDrive = isGoogleDriveUrl(url)
  const isPdf = isPdfUrl(url)
  const isEmbed = isGDrive || isPdf

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90 backdrop-blur-sm">
      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-4 py-3">
        {/* Page counter */}
        <span className="text-sm font-medium text-slate-300">
          {total > 1 ? `${current + 1} / ${total}` : 'Receipt'}
        </span>

        {/* Toolbar */}
        <div className="flex items-center gap-1">
          {!isEmbed && (
            <>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(z + 0.25, 4))}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
                title="Zoom in (+)"
              >
                <ZoomIn className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(z - 0.25, 0.5))}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
                title="Zoom out (-)"
              >
                <ZoomOut className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setRotation((r) => (r + 90) % 360)}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
                title="Rotate (R)"
              >
                <RotateCw className="h-4 w-4" />
              </button>
              <div className="mx-1 h-5 w-px bg-slate-700" />
            </>
          )}
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
            title="Open in new tab"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink className="h-4 w-4" />
          </a>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
            title="Close (Esc)"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* ── Main viewer ── */}
      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        {/* Left arrow */}
        {total > 1 && current > 0 && (
          <button
            type="button"
            onClick={goPrev}
            className="absolute left-3 z-10 rounded-full bg-slate-800/70 p-2 text-slate-300 hover:bg-slate-700 hover:text-white"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}

        {/* Content */}
        <div
          className="flex items-center justify-center"
          style={{ width: '100%', height: '100%' }}
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose()
          }}
        >
          {isGDrive ? (
            <iframe
              src={toGoogleDrivePreview(url)}
              title={`Receipt page ${current + 1}`}
              className="h-[80vh] w-[70vw] rounded-lg border border-slate-700"
              allow="autoplay"
            />
          ) : isPdf ? (
            <iframe
              src={url}
              title={`Receipt page ${current + 1}`}
              className="h-[80vh] w-[70vw] rounded-lg border border-slate-700"
            />
          ) : (
            <img
              ref={imgRef}
              src={url}
              alt={`Receipt page ${current + 1}`}
              className="max-h-[80vh] max-w-[85vw] rounded-lg object-contain transition-transform duration-200"
              style={{
                transform: `scale(${zoom}) rotate(${rotation}deg)`,
              }}
              draggable={false}
              onError={(e) => {
                const target = e.target as HTMLImageElement
                target.style.display = 'none'
                target.insertAdjacentHTML(
                  'afterend',
                  `<div class="flex flex-col items-center gap-3 p-12 text-slate-400">
                    <p class="text-sm">Could not load image</p>
                    <a href="${url}" target="_blank" rel="noopener noreferrer"
                       class="text-xs text-emerald-400 hover:underline">Open in new tab</a>
                  </div>`,
                )
              }}
            />
          )}
        </div>

        {/* Right arrow */}
        {total > 1 && current < total - 1 && (
          <button
            type="button"
            onClick={goNext}
            className="absolute right-3 z-10 rounded-full bg-slate-800/70 p-2 text-slate-300 hover:bg-slate-700 hover:text-white"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        )}
      </div>

      {/* ── Thumbnail strip (only if >1 page) ── */}
      {total > 1 && (
        <div className="flex items-center justify-center gap-2 px-4 py-3">
          {pages.map((pageUrl, i) => (
            <button
              key={pageUrl}
              type="button"
              onClick={() => setCurrent(i)}
              className={`relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg border-2 transition-all ${
                i === current
                  ? 'border-emerald-500 ring-1 ring-emerald-500/50'
                  : 'border-slate-700 opacity-60 hover:opacity-100'
              }`}
            >
              {isPdfUrl(pageUrl) || isGoogleDriveUrl(pageUrl) ? (
                <div className="flex h-full w-full items-center justify-center bg-slate-800 text-[10px] font-medium text-slate-400">
                  {isPdfUrl(pageUrl) ? 'PDF' : 'GDrive'}
                </div>
              ) : (
                <img
                  src={pageUrl}
                  alt={`Thumb ${i + 1}`}
                  className="h-full w-full object-cover"
                />
              )}
              <span className="absolute bottom-0 right-0 rounded-tl bg-black/60 px-1 text-[9px] text-slate-300">
                {i + 1}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
