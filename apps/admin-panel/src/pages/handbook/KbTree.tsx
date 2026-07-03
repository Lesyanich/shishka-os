import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { pickTranslation, type KbLang, type KbTreeNode } from '../../types/knowledgeBase'

/** Recursive handbook page tree. Mirrors the nesting pattern of DrawerBomTree. */

interface RowProps {
  node: KbTreeNode
  lang: KbLang
  activeSlug: string | null
  onSelect: (slug: string) => void
}

function TreeRow({ node, lang, activeSlug, onSelect }: RowProps) {
  const [open, setOpen] = useState(node.depth < 1) // top-level spaces open by default
  const { title } = pickTranslation(node, lang)
  const hasChildren = node.children.length > 0
  const isActive = node.slug === activeSlug

  return (
    <div>
      <div
        className="flex items-center gap-0.5"
        style={{ paddingLeft: `${node.depth * 12}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-cream/40 hover:text-cream"
            aria-label={open ? 'Collapse' : 'Expand'}
          >
            <ChevronRight className={['h-3.5 w-3.5 transition-transform', open ? 'rotate-90' : ''].join(' ')} />
          </button>
        ) : (
          <span className="h-5 w-5 shrink-0" />
        )}
        <button
          type="button"
          onClick={() => onSelect(node.slug)}
          className={[
            'flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition',
            isActive
              ? 'bg-[var(--color-royal-green)]/35 text-cream ring-1 ring-inset ring-[var(--color-forest-soft)]/30'
              : 'text-cream/60 hover:bg-surface-3 hover:text-cream',
            node.depth === 0 ? 'font-semibold' : 'font-medium',
          ].join(' ')}
        >
          <span className="truncate">{title}</span>
          {!node.is_published && (
            <span className="ml-auto shrink-0 rounded bg-honey-300/15 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-honey-300">
              draft
            </span>
          )}
        </button>
      </div>
      {hasChildren && open && (
        <div className="mt-0.5 space-y-0.5">
          {node.children.map((child) => (
            <TreeRow key={child.id} node={child} lang={lang} activeSlug={activeSlug} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  )
}

interface Props {
  nodes: KbTreeNode[]
  lang: KbLang
  activeSlug: string | null
  onSelect: (slug: string) => void
}

export function KbTree({ nodes, lang, activeSlug, onSelect }: Props) {
  if (nodes.length === 0) {
    return <p className="px-2 py-3 text-xs text-cream/40">No pages yet.</p>
  }
  return (
    <div className="space-y-0.5">
      {nodes.map((n) => (
        <TreeRow key={n.id} node={n} lang={lang} activeSlug={activeSlug} onSelect={onSelect} />
      ))}
    </div>
  )
}
