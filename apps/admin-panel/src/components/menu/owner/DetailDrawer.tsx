import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { useDishScorecard } from '../../../hooks/useDishScorecard'
import { useBomTree } from '../../../hooks/useBomTree'
import { useDishTags } from '../../../hooks/useDishTags'
import type { MenuItem } from '../../../hooks/useMenuData'
import { DrawerHero } from './DrawerHero'
import { DrawerScorecard } from './DrawerScorecard'
import { DrawerBomTree } from './DrawerBomTree'
import { DrawerTagEditor } from './DrawerTagEditor'
import { DrawerActionRow } from './DrawerActionRow'

interface DetailDrawerProps {
  item: MenuItem | null
  onClose: () => void
  onToggleAvailable?: (id: string, next: boolean) => void | Promise<void>
  onDuplicate?: (id: string) => void | Promise<void>
  /** When provided, focus returns to the element with `id={`row-${returnFocusToId}`}`
   * after the drawer closes (keyboard-nav integration). */
  returnFocusToId?: string | null
}

/** Right-side slide-in panel (400px, 240ms). Hero / Scorecard / BOM
 * tree / CBS tag editor / action row. Closes on ✕ or Escape. Focus
 * trap: on open, autofocus close button; on close, restore focus to
 * the triggering row. */
export function DetailDrawer({
  item,
  onClose,
  onToggleAvailable,
  onDuplicate,
  returnFocusToId,
}: DetailDrawerProps) {
  const open = item != null
  const panelRef = useRef<HTMLDivElement | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)

  const scorecard = useDishScorecard(open ? item.id : null)
  const bomTree = useBomTree(open ? item.id : null, 4)
  const tagEditor = useDishTags(open ? item.id : null)

  // Focus management: autofocus close button on open.
  useEffect(() => {
    if (open) {
      // Defer to next tick so the panel is in the DOM.
      const raf = requestAnimationFrame(() => closeButtonRef.current?.focus())
      return () => cancelAnimationFrame(raf)
    }
  }, [open])

  // Escape to close (drawer takes priority over row-keyboard Esc)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, onClose])

  // Restore focus on close
  useEffect(() => {
    if (!open && returnFocusToId) {
      const el = document.getElementById(`row-${returnFocusToId}`)
      el?.scrollIntoView({ block: 'nearest' })
      // Row is not natively focusable, so click-target is the first button inside
      const target = el?.querySelector<HTMLElement>('button, [tabindex]')
      target?.focus()
    }
  }, [open, returnFocusToId])

  if (!open) return null

  return (
    <>
      {/* Scrim — click anywhere outside panel to close. Not a true modal:
          the underlying table remains visible/usable on wider viewports. */}
      <div
        aria-hidden
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px] transition-opacity duration-[240ms]"
        style={{ animation: 'fade-in-up 160ms ease-out both' }}
      />
      <aside
        ref={panelRef}
        role="dialog"
        aria-label={`${item.name} detail`}
        aria-modal="false"
        className="fixed right-0 top-0 z-50 flex h-full w-full max-w-[400px] flex-col border-l border-surface-3 bg-surface-1 text-cream shadow-2xl"
        style={{
          animation: 'drawer-slide-in 240ms cubic-bezier(0.32, 0.72, 0, 1) both',
        }}
      >
        <header className="flex shrink-0 items-center justify-between border-b border-surface-3 px-5 py-3">
          <span
            className="text-[11px] uppercase tracking-[0.18em] text-muted"
            style={{ fontFamily: 'var(--font-display-sc)', fontWeight: 700 }}
          >
            Detail
          </span>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close detail drawer"
            className="rounded-full p-1 text-muted transition hover:bg-surface-3 hover:text-cream focus:outline-none focus-visible:ring-2 focus-visible:ring-brick-soft/60"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <DrawerHero item={item} />

          <DrawerScorecard
            scorecard={scorecard.scorecard}
            isLoading={scorecard.isLoading}
            error={scorecard.error}
          />

          <DrawerBomTree
            root={bomTree.root}
            isLoading={bomTree.isLoading}
            error={bomTree.error}
          />

          <DrawerTagEditor
            tags={tagEditor.tags}
            available={tagEditor.available}
            isLoading={tagEditor.isLoading}
            error={tagEditor.error}
            onAdd={tagEditor.addTag}
            onRemove={tagEditor.removeTag}
          />
        </div>

        <DrawerActionRow
          item={item}
          onToggleAvailable={onToggleAvailable}
          onDuplicate={onDuplicate}
        />
      </aside>
    </>
  )
}
