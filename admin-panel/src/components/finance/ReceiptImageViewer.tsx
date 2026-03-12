// ═══════════════════════════════════════════════════════════
// ReceiptImageViewer — Split-screen receipt image viewer
// Phase 4.6: Perfect OCR & Smart Mapping Engine
// ═══════════════════════════════════════════════════════════
// Sticky panel showing uploaded receipt images with zoom.
// User can compare paper receipt vs digital data side-by-side.
// ═══════════════════════════════════════════════════════════

import { useState, useRef, useCallback } from 'react'
import { ZoomIn, ZoomOut, Maximize2, ImageIcon } from 'lucide-react'

interface ReceiptImageViewerProps {
  imageUrls: string[]
}

const ZOOM_LEVELS = [1, 1.5, 2, 3]

export function ReceiptImageViewer({ imageUrls }: ReceiptImageViewerProps) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [zoomIdx, setZoomIdx] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const zoom = ZOOM_LEVELS[zoomIdx]

  const zoomIn = useCallback(() => {
    setZoomIdx((prev) => Math.min(prev + 1, ZOOM_LEVELS.length - 1))
  }, [])

  const zoomOut = useCallback(() => {
    setZoomIdx((prev) => Math.max(prev - 1, 0))
  }, [])

  const resetZoom = useCallback(() => {
    setZoomIdx(0)
    if (containerRef.current) {
      containerRef.current.scrollTop = 0
      containerRef.current.scrollLeft = 0
    }
  }, [])

  if (imageUrls.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-xl border border-slate-700/40 bg-slate-900/60">
        <div className="text-center">
          <ImageIcon className="mx-auto h-8 w-8 text-slate-700" />
          <p className="mt-2 text-xs text-slate-600">No receipt images</p>
        </div>
      </div>
    )
  }

  const activeUrl = imageUrls[activeIndex] ?? imageUrls[0]

  return (
    <div className="flex flex-col gap-2">
      {/* ── Main Image Viewer ── */}
      <div className="relative overflow-hidden rounded-xl border border-slate-700/40 bg-slate-950/80">
        {/* Zoom controls */}
        <div className="absolute right-2 top-2 z-10 flex items-center gap-1 rounded-lg border border-slate-700/50 bg-slate-900/90 p-0.5 backdrop-blur-sm">
          <button
            type="button"
            onClick={zoomOut}
            disabled={zoomIdx === 0}
            className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200 disabled:opacity-30"
            title="Zoom out"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <span className="min-w-[36px] text-center text-[10px] font-medium tabular-nums text-slate-400">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={zoomIn}
            disabled={zoomIdx === ZOOM_LEVELS.length - 1}
            className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200 disabled:opacity-30"
            title="Zoom in"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={resetZoom}
            className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
            title="Fit to view"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Image label */}
        <div className="absolute left-2 top-2 z-10 rounded-md bg-slate-900/80 px-2 py-1 text-[10px] font-medium text-slate-400 backdrop-blur-sm">
          Image {activeIndex + 1} / {imageUrls.length}
        </div>

        {/* Scrollable image container */}
        <div
          ref={containerRef}
          className="overflow-auto"
          style={{ maxHeight: '60vh' }}
        >
          <img
            src={activeUrl}
            alt={`Receipt image ${activeIndex + 1}`}
            className="block transition-transform duration-200"
            style={{
              transform: `scale(${zoom})`,
              transformOrigin: 'top left',
              width: zoom > 1 ? `${100 / zoom}%` : '100%',
            }}
            draggable={false}
          />
        </div>
      </div>

      {/* ── Thumbnail Strip (only if multiple images) ── */}
      {imageUrls.length > 1 && (
        <div className="grid grid-cols-4 gap-1.5">
          {imageUrls.map((url, i) => (
            <button
              key={url}
              type="button"
              onClick={() => {
                setActiveIndex(i)
                resetZoom()
              }}
              className={`relative aspect-square overflow-hidden rounded-lg border transition-all duration-200 ${
                i === activeIndex
                  ? 'border-indigo-500/60 ring-1 ring-indigo-500/30 shadow-md shadow-indigo-500/10'
                  : 'border-slate-700/40 opacity-60 hover:opacity-90 hover:border-slate-600'
              }`}
            >
              <img
                src={url}
                alt={`Thumbnail ${i + 1}`}
                className="h-full w-full object-cover"
              />
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-1 pb-0.5 pt-3">
                <span className="text-[9px] font-medium text-white/80">
                  #{i + 1}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
